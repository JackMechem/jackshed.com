/**
 * Ported from `apps/web/lib/structure.ts` — a "structure" chains bars of *different* time
 * signatures in a fixed, looping sequence (e.g. 2 bars of 11/8, then a bar of 12/8, then a bar of
 * 15/8) instead of one meter for the whole run. Modeled the same way a real tune's form is: a
 * handful of reusable, named `sections` (a complete little meter each) and a `form` that's just an
 * ordered list of section ids, which can repeat the same one more than once.
 */
import { NEXT_LEVEL, defaultAccents, defaultSubAccents } from "./meterControls";
import type { BeatLevel } from "./clickSounds";

export type StructureSection = {
  id: string;
  name: string;
  /** How many bars this section plays per occurrence in the form. */
  bars: number;
  beatsPerBar: number;
  beatUnit: number;
  accents: BeatLevel[];
  subdivision: number;
  subAccents: BeatLevel[];
};

export type Structure = {
  sections: StructureSection[];
  /** Section ids in play order — may repeat the same id more than once (e.g. `[A, A, B, C]`). */
  form: string[];
};

export const EMPTY_STRUCTURE: Structure = { sections: [], form: [] };

function randomId(): string {
  // `crypto.randomUUID` is available in both a real browser and recent React Native/Hermes; these
  // ids are ephemeral, client-local identifiers (never persisted server-side, never shown to a
  // user), so a plain fallback is fine if it's ever missing on some runtime.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Spreadsheet-column-style naming: A..Z, then AA..AZ, BA..., so there's always a fresh short name
    regardless of how many sections already exist or have been deleted. */
export function nextSectionName(existingNames: string[]): string {
  const used = new Set(existingNames);
  let n = 0;
  for (;;) {
    let name = "";
    let x = n;
    do {
      name = String.fromCharCode(65 + (x % 26)) + name;
      x = Math.floor(x / 26) - 1;
    } while (x >= 0);
    if (!used.has(name)) return name;
    n++;
  }
}

export function createSection(name: string): StructureSection {
  return {
    id: randomId(),
    name,
    bars: 4,
    beatsPerBar: 4,
    beatUnit: 4,
    accents: defaultAccents(4),
    subdivision: 1,
    subAccents: [],
  };
}

export function sectionById(structure: Structure, id: string): StructureSection | null {
  return structure.sections.find((s) => s.id === id) ?? null;
}

/** Resolves a form index to the section playing at that point, wrapping via double-modulo so an
    out-of-range index (e.g. left over from a running engine after the form was shortened) never
    falls off the end — `null` only when the form is genuinely empty. */
export function sectionAt(structure: Structure, formIndex: number): StructureSection | null {
  const { form } = structure;
  if (form.length === 0) return null;
  const wrapped = ((formIndex % form.length) + form.length) % form.length;
  return sectionById(structure, form[wrapped]);
}

export function totalBars(structure: Structure): number {
  return structure.form.reduce((sum, id) => {
    const section = sectionById(structure, id);
    return sum + (section?.bars ?? 0);
  }, 0);
}

export function addSection(structure: Structure): Structure {
  const name = nextSectionName(structure.sections.map((s) => s.name));
  return { ...structure, sections: [...structure.sections, createSection(name)] };
}

export function removeSection(structure: Structure, id: string): Structure {
  return {
    sections: structure.sections.filter((s) => s.id !== id),
    form: structure.form.filter((entryId) => entryId !== id),
  };
}

export function updateSection(
  structure: Structure,
  id: string,
  patch: Partial<StructureSection>,
): Structure {
  return {
    ...structure,
    sections: structure.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  };
}

export function cycleSectionAccent(structure: Structure, id: string, beatIndex: number): Structure {
  const section = sectionById(structure, id);
  if (!section) return structure;
  const accents = defaultAccents(section.beatsPerBar, section.accents);
  return updateSection(structure, id, {
    accents: accents.map((level, i) => (i === beatIndex ? NEXT_LEVEL[level] : level)),
  });
}

export function cycleSectionSubAccent(
  structure: Structure,
  id: string,
  beatIndex: number,
  subIndex: number,
): Structure {
  const section = sectionById(structure, id);
  if (!section) return structure;
  const dotCount = Math.max(0, Math.round(section.subdivision) - 1);
  const flatIndex = beatIndex * dotCount + subIndex;
  const subAccents = defaultSubAccents(section.beatsPerBar, section.subdivision, section.subAccents);
  return updateSection(structure, id, {
    subAccents: subAccents.map((level, i) => (i === flatIndex ? NEXT_LEVEL[level] : level)),
  });
}

export function appendToForm(structure: Structure, sectionId: string): Structure {
  return { ...structure, form: [...structure.form, sectionId] };
}

export function removeFormEntry(structure: Structure, index: number): Structure {
  return { ...structure, form: structure.form.filter((_, i) => i !== index) };
}

export function reorderForm(structure: Structure, fromIndex: number, toIndex: number): Structure {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= structure.form.length ||
    toIndex < 0 ||
    toIndex >= structure.form.length
  ) {
    return structure;
  }
  const form = [...structure.form];
  const [moved] = form.splice(fromIndex, 1);
  form.splice(toIndex, 0, moved);
  return { ...structure, form };
}
