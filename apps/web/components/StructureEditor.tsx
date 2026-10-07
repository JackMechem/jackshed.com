"use client";

import { useRef, useState } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import Hint from "@/components/Hint";
import { MeterOptions, SteppedField } from "@/components/MeterFields";
import { PlusIcon } from "@/components/tools";
import { MAX_BEATS } from "@/lib/meters";
import { accentsFromGroups, defaultAccents, defaultSubAccents } from "@/lib/meterControls";
import {
  type Structure,
  type StructureSection,
  addSection,
  appendToForm,
  cycleSectionAccent,
  cycleSectionSubAccent,
  removeFormEntry,
  reorderForm,
  removeSection,
  sectionById,
  totalBars,
  updateSection,
} from "@/lib/structure";

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className ?? "h-3 w-3"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

function ChevronIcon({ open }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

/** One section's own card: collapsed, it's just a name/bar-count/meter summary row; expanded, it's
    a complete self-contained little meter editor — name, bar count, the same `MeterOptions` the
    plain (non-structure) meter uses, and its own `BeatIndicator` for that section's accents/
    subdivision accents, all scoped to this one section only. */
function SectionCard({
  structure,
  sectionId,
  expanded,
  onToggle,
  onChangeStructure,
  onRemove,
  isPlaying,
  playingBeat,
  playingSub,
}: {
  structure: Structure;
  sectionId: string;
  expanded: boolean;
  onToggle: () => void;
  onChangeStructure: (structure: Structure) => void;
  onRemove: () => void;
  /** Whether *this* section is the one currently playing (only meaningful while running). */
  isPlaying: boolean;
  playingBeat: number | null;
  playingSub: number;
}) {
  const section = sectionById(structure, sectionId);
  if (!section) return null;
  const accents = defaultAccents(section.beatsPerBar, section.accents);
  const subAccents = defaultSubAccents(section.beatsPerBar, section.subdivision, section.subAccents);

  function patch(fields: Partial<StructureSection>) {
    onChangeStructure(updateSection(structure, sectionId, fields));
  }

  return (
    <div className="rounded-xl bg-background">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate font-semibold">{section.name || "Untitled"}</p>
          <p className="text-xs text-muted">
            {section.bars} bar{section.bars === 1 ? "" : "s"} · {section.beatsPerBar}/
            {section.beatUnit}
          </p>
        </div>
        <ChevronIcon open={expanded} />
      </button>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-surface-hover px-4 py-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Name</span>
            <input
              type="text"
              value={section.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. A"
              className="rounded-lg bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
            />
          </label>

          <SteppedField
            label="Bars"
            value={section.bars}
            min={1}
            max={MAX_BEATS}
            layout="row"
            onChange={(bars) => patch({ bars })}
            hint="How many bars this section lasts each time it comes up in the form."
          />

          <div className="border-t border-surface-hover" />

          <MeterOptions
            beatsPerBar={section.beatsPerBar}
            beatUnit={section.beatUnit}
            accents={accents}
            subdivision={section.subdivision}
            onChangeBeats={(n) => patch({ beatsPerBar: n, accents: defaultAccents(n, accents) })}
            onSetBeatUnit={(unit) => patch({ beatUnit: unit })}
            onSetSubdivision={(n) => patch({ subdivision: n })}
            onApplyGroups={(groups) =>
              patch({
                beatsPerBar: groups.reduce((a, b) => a + b, 0),
                accents: accentsFromGroups(groups),
              })
            }
          />

          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface p-3">
            <BeatIndicator
              accents={accents}
              currentBeat={isPlaying ? playingBeat : null}
              currentSub={playingSub}
              onCycle={(i) => onChangeStructure(cycleSectionAccent(structure, sectionId, i))}
              subdivision={section.subdivision}
              subAccents={subAccents}
              onCycleSub={(beatIndex, subIndex) =>
                onChangeStructure(cycleSectionSubAccent(structure, sectionId, beatIndex, subIndex))
              }
              size="sm"
            />
          </div>

          <button
            type="button"
            onClick={onRemove}
            className="self-start text-sm font-medium text-danger hover:underline"
          >
            Remove section
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The "Structure" editor shown in place of the plain meter controls once "Use a structure" is on
 * (see `components/Metronome.tsx`) — build a handful of named sections below, each its own bar
 * count and time signature, then arrange them into a `Form` (reusing the same section as many
 * times as needed, e.g. A, A, B, C) that plays through in order and loops back to the start.
 */
export default function StructureEditor({
  structure,
  onChange,
  running,
  activeFormIndex,
  playingBeat,
  playingSub,
}: {
  structure: Structure;
  onChange: (structure: Structure) => void;
  /** Whether the engine is actually running right now — gates whether `activeFormIndex` drives
      any live highlighting at all (it's left at its last value after stopping, same as
      `currentBeat` elsewhere, so this prop is what actually turns the highlight off). */
  running: boolean;
  activeFormIndex: number | null;
  playingBeat: number | null;
  playingSub: number;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const bars = totalBars(structure);
  const activeSectionId =
    running && activeFormIndex !== null ? (structure.form[activeFormIndex] ?? null) : null;

  // Drag-to-reorder for the Form chips — Pointer Events (not the HTML5 drag-and-drop API, which
  // doesn't work on touch devices without unreliable polyfills) so the same code drags with a
  // mouse, a finger, or a pen. `chipRefs`/`dragRects` are a fixed reference grid: each chip's own
  // bounding rect, measured once when the drag starts — the *physical* position of slot N in the
  // row never moves as the underlying form reorders (only which chip's data renders there does),
  // so comparing the live pointer position against these frozen rects is enough to tell which
  // slot it's currently over, with no re-measuring mid-drag.
  const chipRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dragRectsRef = useRef<Array<DOMRect | null> | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  function onChipPointerDown(e: React.PointerEvent<HTMLDivElement>, index: number) {
    // A press on one of the chip's own buttons (←/→/remove) is that button's click, not a drag.
    if ((e.target as HTMLElement).closest("button")) return;
    if (structure.form.length < 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRectsRef.current = chipRefs.current.map((el) => el?.getBoundingClientRect() ?? null);
    setDragIndex(index);
    setDragOffset({ x: 0, y: 0 });
  }

  function onChipPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rects = dragRectsRef.current;
    if (!rects || dragIndex === null) return;
    const pointerX = e.clientX;
    const pointerY = e.clientY;

    // Which frozen slot is the pointer closest to right now?
    let nearest = dragIndex;
    let nearestDist = Infinity;
    rects.forEach((rect, i) => {
      if (!rect) return;
      const dx = rect.left + rect.width / 2 - pointerX;
      const dy = rect.top + rect.height / 2 - pointerY;
      const dist = dx * dx + dy * dy;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });

    let currentIndex = dragIndex;
    if (nearest !== dragIndex) {
      onChange(reorderForm(structure, dragIndex, nearest));
      currentIndex = nearest;
      setDragIndex(nearest);
    }

    // Recomputed fresh against whichever slot the dragged chip currently occupies (not
    // accumulated from the drag's start), so there's no jump the instant it moves to a new slot.
    const slot = rects[currentIndex];
    if (slot) {
      setDragOffset({
        x: pointerX - (slot.left + slot.width / 2),
        y: pointerY - (slot.top + slot.height / 2),
      });
    }
  }

  function endChipDrag() {
    dragRectsRef.current = null;
    setDragIndex(null);
    setDragOffset({ x: 0, y: 0 });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">Form</span>
        <span className="text-xs text-muted">
          {structure.form.length} part{structure.form.length === 1 ? "" : "s"} · {bars} bar
          {bars === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl bg-background p-2">
        {structure.form.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted">
            Add a section below, then add it to the form.
          </p>
        ) : (
          structure.form.map((sectionId, i) => {
            const section = sectionById(structure, sectionId);
            const active = activeSectionId !== null && activeFormIndex === i;
            const dragging = dragIndex === i;
            return (
              <div
                key={i}
                ref={(el) => {
                  chipRefs.current[i] = el;
                }}
                onPointerDown={(e) => onChipPointerDown(e, i)}
                onPointerMove={onChipPointerMove}
                onPointerUp={endChipDrag}
                onPointerCancel={endChipDrag}
                style={
                  dragging
                    ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`, zIndex: 10 }
                    : undefined
                }
                className={`flex touch-none select-none items-center gap-1.5 rounded-lg py-1.5 pl-3 pr-1.5 text-sm font-semibold transition-colors ${
                  dragging ? "cursor-grabbing shadow-lg" : "cursor-grab"
                } ${active ? "bg-accent text-accent-foreground" : "bg-surface-hover text-foreground"}`}
              >
                {section?.name ?? "?"}
                <button
                  type="button"
                  onClick={() => onChange(removeFormEntry(structure, i))}
                  aria-label={`Remove ${section?.name ?? "this"} from the form`}
                  title="Remove from form"
                  className="flex h-6 w-6 items-center justify-center rounded opacity-70 hover:text-danger hover:opacity-100"
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {structure.sections.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Add to form:</span>
          {structure.sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(appendToForm(structure, s.id))}
              className="rounded-lg border border-dashed border-muted/40 px-3 py-1 text-sm font-medium text-muted transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              + {s.name}
            </button>
          ))}
        </div>
      )}

      <Hint>
        Build a few named sections below (each its own bar count and time signature), then use the
        buttons above to arrange them into the order they should actually play in — the same
        section can be added more than once, e.g. A, A, B, C.
      </Hint>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Sections</span>
        {structure.sections.map((section) => (
          <SectionCard
            key={section.id}
            structure={structure}
            sectionId={section.id}
            expanded={expandedId === section.id}
            onToggle={() => setExpandedId(expandedId === section.id ? null : section.id)}
            onChangeStructure={onChange}
            onRemove={() => {
              onChange(removeSection(structure, section.id));
              if (expandedId === section.id) setExpandedId(null);
            }}
            isPlaying={activeSectionId === section.id}
            playingBeat={playingBeat}
            playingSub={playingSub}
          />
        ))}
        <button
          type="button"
          onClick={() => onChange(addSection(structure))}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-muted/40 px-4 py-3 text-sm font-medium text-muted transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <PlusIcon className="h-4 w-4" /> New section
        </button>
      </div>
    </div>
  );
}
