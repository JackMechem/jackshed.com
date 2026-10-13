import { decodeXmlBytes } from "@jam-practice/core/musicXml";
import { child, find, parseXml } from "@jam-practice/core/xml";

// Compressed MusicXML (.mxl — what MuseScore exports by default) is a zip: META-INF/container.xml
// names the score file inside. This reads just enough of the zip format to pull that one file
// out, inflating with the browser's own DecompressionStream (no zip library needed).

type Entry = { name: string; method: number; compressedSize: number; localOffset: number };

function entries(bytes: Uint8Array): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: search back from the end for its signature.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("That .mxl file isn't a valid zip.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out: Entry[] = [];
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function extract(bytes: Uint8Array, e: Entry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLen = view.getUint16(e.localOffset + 26, true);
  const extraLen = view.getUint16(e.localOffset + 28, true);
  const start = e.localOffset + 30 + nameLen + extraLen;
  const data = bytes.slice(start, start + e.compressedSize);
  if (e.method === 0) return data;
  if (e.method !== 8) throw new Error("That .mxl file uses a compression this can't read.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The MusicXML text inside an .mxl file. */
export async function readMxl(bytes: Uint8Array): Promise<string> {
  const list = entries(bytes);
  const container = list.find((e) => e.name === "META-INF/container.xml");
  let target: Entry | undefined;
  if (container) {
    const doc = parseXml(decodeXmlBytes(await extract(bytes, container)));
    const path = find(child(doc, "container"), "rootfile")?.attrs["full-path"];
    target = list.find((e) => e.name === path);
  }
  target ??= list.find((e) => !e.name.startsWith("META-INF/") && /\.(musicxml|xml)$/i.test(e.name));
  if (!target) throw new Error("Couldn't find the score inside that .mxl file.");
  return decodeXmlBytes(await extract(bytes, target));
}

/** Whether these bytes are a zip (an .mxl), whatever the file is called. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
