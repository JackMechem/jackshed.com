import type { BeatLevel } from "@/lib/clickEngine";
import { NEXT_LEVEL, defaultAccents, defaultSubAccents } from "@/lib/meterControls";

/**
 * A "structure" lets the Metronome chain bars of *different* time signatures in a fixed, looping
 * sequence instead of one meter for the whole run — e.g. 2 bars of 11/8, then a bar of 12/8, then
 * a bar of 15/8, repeating from the top. Modeled the same way a real tune's form is: a handful of
 * named, reusable `sections` (each its own self-contained little meter — bar count, time
 * signature, accents, subdivision, all of it), and a `form` that arranges them in play order,
 * reusing the same section as many times as needed (e.g. `[A, A, B, C]`) rather than needing a
 * separate copy of a section for every repeat.
 */
export type StructureSection = {
  id: string;
  /** Shown as the section's label everywhere (the form chips, the section card) — defaults to the
      next unused letter (`nextSectionName`) but freely renamable. */
  name: string;
  /** How many bars this section lasts each time it appears in the form. */
  bars: number;
  beatsPerBar: number;
  beatUnit: number;
  accents: BeatLevel[];
  subdivision: number;
  subAccents: BeatLevel[];
};

export type Structure = {
  sections: StructureSection[];
  /** Section ids, in play order — may repeat the same id more than once. */
  form: string[];
};

export const EMPTY_STRUCTURE: Structure = { sections: [], form: [] };

/** "A".."Z", then "AA".."AZ", "BA"... — the same scheme spreadsheet columns use, so running out
    of single letters (unlikely, but `MAX_BEATS`-scale structures are allowed everywhere else in
    this app) just keeps going instead of colliding. */
export function nextSectionName(existingNames: string[]): string {
  const used = new Set(existingNames);
  const nameFor = (index: number): string => {
    let s = "";
    let i = index;
    do {
      s = String.fromCharCode(65 + (i % 26)) + s;
      i = Math.floor(i / 26) - 1;
    } while (i >= 0);
    return s;
  };
  let n = 0;
  while (used.has(nameFor(n))) n++;
  return nameFor(n);
}

export function createSection(name: string): StructureSection {
  const beatsPerBar = 4;
  return {
    id: crypto.randomUUID(),
    name,
    bars: 4,
    beatsPerBar,
    beatUnit: 4,
    accents: defaultAccents(beatsPerBar),
    subdivision: 1,
    subAccents: [],
  };
}

export function sectionById(structure: Structure, id: string): StructureSection | null {
  return structure.sections.find((s) => s.id === id) ?? null;
}

/** The section currently playing at `formIndex` (wrapping, so an index from a still-running
    engine never falls off the end of a form that's since been shortened), or `null` for a
    structure with no form yet. */
export function sectionAt(structure: Structure, formIndex: number): StructureSection | null {
  if (structure.form.length === 0) return null;
  const id = structure.form[((formIndex % structure.form.length) + structure.form.length) % structure.form.length];
  return sectionById(structure, id);
}

export function totalBars(structure: Structure): number {
  return structure.form.reduce((sum, id) => sum + (sectionById(structure, id)?.bars ?? 0), 0);
}

export function addSection(structure: Structure): Structure {
  const section = createSection(nextSectionName(structure.sections.map((s) => s.name)));
  return { ...structure, sections: [...structure.sections, section] };
}

/** Removes a section and every occurrence of it in the form — deleting a section used twice in
    the form removes both occurrences, not just one. */
export function removeSection(structure: Structure, id: string): Structure {
  return {
    sections: structure.sections.filter((s) => s.id !== id),
    form: structure.form.filter((formId) => formId !== id),
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

/** Cycles one beat's accent level within a section, the same NEXT_LEVEL cycling `BeatIndicator`'s
    `onCycle` already drives for the plain (non-structure) meter. */
export function cycleSectionAccent(structure: Structure, id: string, beatIndex: number): Structure {
  const section = sectionById(structure, id);
  if (!section) return structure;
  const accents = defaultAccents(section.beatsPerBar, section.accents);
  return updateSection(structure, id, {
    accents: accents.map((level, i) => (i === beatIndex ? NEXT_LEVEL[level] : level)),
  });
}

/** Same as `cycleSectionAccent`, for a subdivision tick instead of the beat itself — mirrors
    `BeatIndicator`'s `onCycleSub`. */
export function cycleSectionSubAccent(
  structure: Structure,
  id: string,
  beatIndex: number,
  subIndex: number,
): Structure {
  const section = sectionById(structure, id);
  if (!section) return structure;
  const subAccents = defaultSubAccents(section.beatsPerBar, section.subdivision, section.subAccents);
  const dotCount = Math.max(0, Math.round(section.subdivision) - 1);
  const flatIndex = beatIndex * dotCount + subIndex;
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

/** Moves a form entry from one index to another, shifting everything in between — what dragging
    a chip to an arbitrary new position needs. A no-op for an out-of-range or unchanged index. */
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
