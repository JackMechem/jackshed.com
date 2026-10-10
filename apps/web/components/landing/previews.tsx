"use client";

import { useEffect, useState } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import ChordChart, { chordFont } from "@/components/ChordChart";
import StickControlStave from "@/components/StickControlStave";
import TunerDial from "@/components/TunerDial";
import { INTERVALS } from "@/lib/intervals";
import { parseBarSlots, prettyQuality, type Bar, type IRealSong } from "@/lib/iRealPro";
import type { BeatLevel } from "@/lib/clickEngine";
import { generatePattern, type GeneratedPattern, type StickControlOptions } from "@/lib/stickControl";
import { playNote } from "@/lib/tones";

/* Live previews for the landing page, built from the app's real components (the same beat strip,
   tuner dial, chord chart renderer and VexFlow notation the tools use), not screenshots. Each one
   only animates while motion is allowed. */

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}

/** A beat counter ticking at `bpm` — drives the beat strips below. */
function useTicker(bpm: number, ticks: number) {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % ticks), 60000 / bpm);
    return () => window.clearInterval(id);
  }, [bpm, ticks, reduce]);
  return tick;
}

const FOUR: BeatLevel[] = [2, 1, 1, 1];

/** The metronome's beat strip, lit in time. */
export function LiveBeats({ bpm = 112, size = "md", subdivision = 1 }: { bpm?: number; size?: "md" | "sm"; subdivision?: number }) {
  const tick = useTicker(bpm * subdivision, 4 * subdivision);
  return (
    <BeatIndicator
      accents={FOUR}
      currentBeat={Math.floor(tick / subdivision)}
      currentSub={tick % subdivision}
      subdivision={subdivision}
      subAccents={Array.from({ length: 4 * (subdivision - 1) }, () => 0 as BeatLevel)}
      size={size}
    />
  );
}

/** The tuner's note ring, reading a slightly flat A. */
export function TunerPreview() {
  return (
    <TunerDial detectedPc={9} detectedColor="var(--accent)" playingPc={null} onSelect={() => {}}>
      <span className="text-xs font-medium text-muted">440 Hz</span>
      <span className="text-5xl font-semibold tracking-tight">A</span>
      <span className="text-xs font-semibold tabular-nums text-accent">−3 cents</span>
    </TunerDial>
  );
}

function bar(text: string, extra: Partial<Bar> = {}): Bar {
  return { content: { kind: "chords", slots: parseBarSlots(text) }, ...extra };
}

/** A 12-bar jazz blues in F, rendered by the real chart renderer. */
export const SAMPLE_CHART: IRealSong = {
  title: "Shed Blues",
  composer: "sheddex",
  style: "Medium Swing",
  key: "F",
  timeSignature: { top: 4, bottom: 4 },
  bars: [
    bar("F7", { section: "A", startRepeat: true }),
    bar("Bb7"),
    bar("F7"),
    bar("C-7 F7"),
    bar("Bb7"),
    bar("Bo7"),
    bar("F7"),
    bar("A-7 D7"),
    bar("G-7"),
    bar("C7"),
    bar("F7 D7"),
    bar("G-7 C7", { endRepeat: true }),
  ],
};

export function ChartPreview() {
  return <ChordChart song={SAMPLE_CHART} />;
}

/** A ii-V-I written in the chart font, for the small hero card. */
export function ChordRun() {
  const chords: [string, string][] = [
    ["D", "-7"],
    ["G", "7"],
    ["C", "^7"],
  ];
  return (
    <div className={`${chordFont.className} flex items-baseline gap-4 text-4xl`}>
      {chords.map(([root, q]) => (
        <span key={root}>
          {root}
          <span className="text-2xl">{prettyQuality(q)}</span>
        </span>
      ))}
    </div>
  );
}

const STICK_OPTIONS: Omit<StickControlOptions, "rollType"> = { enabledTripletStickings: ["alternating", "brokenDouble"], enabledRollTypes: ["single", "double", "triplet"] };

/** A random sticking pattern in real notation. Only mounted once its feature tab is picked (never
    server-rendered), so generating it in the initializer can't cause a hydration mismatch. */
export function StickingPreview() {
  const [pattern, setPattern] = useState<GeneratedPattern>(() => generatePattern({ rollType: "double", ...STICK_OPTIONS }));
  const tick = useTicker(80, 4);
  return (
    <div className="flex w-full flex-col gap-3">
      <StickControlStave pattern={pattern} activeBarIndex={tick % pattern.bars.length} />
      <button
        type="button"
        onClick={() => setPattern((p) => generatePattern({ rollType: "random", ...STICK_OPTIONS }, p.bars.at(-1)?.at(-1)?.hand))}
        className="self-center rounded-full bg-surface px-4 py-2 text-sm font-semibold transition hover:bg-surface-hover active:scale-[0.98]"
      >
        New pattern
      </button>
    </div>
  );
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (midi: number) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const QUIZ = INTERVALS.filter((i) => ["m3", "M3", "P4", "P5", "M6", "P8"].includes(i.id));

/** A one-question Guess the Interval, playing the real piano samples. */
export function IntervalQuiz() {
  const [round, setRound] = useState({ start: 60, id: "P5" });
  const [picked, setPicked] = useState<string | null>(null);
  const answer = QUIZ.find((i) => i.id === round.id)!;

  function play(r = round) {
    const top = r.start + QUIZ.find((i) => i.id === r.id)!.semitones;
    playNote(noteName(r.start), 0.9, "piano");
    window.setTimeout(() => playNote(noteName(top), 0.9, "piano"), 650);
  }

  function next() {
    const r = { start: 55 + Math.floor(Math.random() * 10), id: QUIZ[Math.floor(Math.random() * QUIZ.length)].id };
    setRound(r);
    setPicked(null);
    play(r);
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5">
      <button
        type="button"
        onClick={() => play()}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/25 transition hover:bg-accent-hover active:scale-95"
        aria-label="Play the interval"
      >
        <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8" fill="currentColor" aria-hidden>
          <path d="M8 5.5v13a1 1 0 001.5.86l11-6.5a1 1 0 000-1.72l-11-6.5A1 1 0 008 5.5z" />
        </svg>
      </button>
      <p className="text-sm text-muted">{picked ? (picked === answer.id ? `Yes, that's a ${answer.label.toLowerCase()}.` : `That was a ${answer.label.toLowerCase()}.`) : "Press play, then name the interval."}</p>
      <div className="grid w-full grid-cols-3 gap-2">
        {QUIZ.map((i) => {
          const state = !picked ? "idle" : i.id === answer.id ? "right" : i.id === picked ? "wrong" : "idle";
          return (
            <button
              key={i.id}
              type="button"
              disabled={!!picked}
              onClick={() => setPicked(i.id)}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
                state === "right" ? "bg-accent text-accent-foreground" : state === "wrong" ? "bg-danger/15 text-danger" : "bg-surface hover:bg-surface-hover disabled:opacity-60"
              }`}
            >
              {i.label}
            </button>
          );
        })}
      </div>
      {picked && (
        <button type="button" onClick={next} className="text-sm font-semibold text-accent hover:underline">
          Next interval
        </button>
      )}
    </div>
  );
}
