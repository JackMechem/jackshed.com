import { DEFAULT_TIME_SIGNATURE, Key, Tempo, Tune, makeId } from "./types";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function encodeTempos(tempos: Tempo[]): string {
  return tempos.map((t) => `${t.value}:${t.enabled ? 1 : 0}`).join(";");
}

function encodeKeys(keys: Key[]): string {
  return keys.map((k) => `${k.value}:${k.enabled ? 1 : 0}`).join(";");
}

export function tunesToCsv(tunes: Tune[]): string {
  const header = "name,tempos,keys,timeSignature,notes";
  const rows = tunes.map((tune) =>
    [tune.name, encodeTempos(tune.tempos), encodeKeys(tune.keys), tune.timeSignature, tune.notes]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function decodeTempos(raw: string): Tempo[] {
  if (!raw.trim()) return [];
  return raw
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [value, enabled] = entry.split(":");
      return {
        id: makeId(),
        value: Number(value),
        enabled: enabled === undefined ? true : enabled === "1",
      };
    })
    .filter((t) => !Number.isNaN(t.value));
}

function decodeKeys(raw: string): Key[] {
  if (!raw.trim()) return [];
  return raw
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [value, enabled] = entry.split(":");
      return {
        id: makeId(),
        value,
        enabled: enabled === undefined ? true : enabled === "1",
      };
    })
    .filter((k) => k.value.length > 0);
}

export function csvToTunes(text: string): Tune[] {
  const rows = parseCsvLines(text.trim());
  if (rows.length === 0) return [];

  const [header, ...rest] = rows;
  const isHeader =
    header[0]?.trim().toLowerCase() === "name" &&
    header[1]?.trim().toLowerCase() === "tempos" &&
    header[2]?.trim().toLowerCase() === "keys";
  const dataRows = isHeader ? rest : rows;

  return dataRows
    .filter((r) => r.some((cell) => cell.trim().length > 0))
    .map((r) => {
      const [name = "", tempos = "", keys = "", timeSignature = "", notes = ""] = r;
      return {
        id: makeId(),
        name: name.trim(),
        tempos: decodeTempos(tempos),
        keys: decodeKeys(keys),
        timeSignature: timeSignature.trim() || DEFAULT_TIME_SIGNATURE,
        notes,
      };
    })
    .filter((t) => t.name.length > 0);
}

export function downloadTunesCsv(tunes: Tune[], filename = "jam-practice-tunes.csv"): void {
  const blob = new Blob([tunesToCsv(tunes)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
