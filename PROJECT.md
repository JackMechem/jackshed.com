# sheddex — project notes for AI agents

This file is for picking up work on this repo in a fresh session (including on a different
computer after a clone). It's hand-maintained, separate from the auto-generated Next.js warning
in `AGENTS.md`.

## What this is

A personal collection of browser-based music practice tools, built for Jack (a musician/dev) as a
Next.js (App Router) + Tailwind app, all client components (`"use client"`). Almost everything
still runs client-side — per-tool settings and data (tunes, projects, recordings) persist in the
browser via localStorage / IndexedDB, not on a server, and every tool works fully with no account.
As of this session there's a real backend (Convex) for one thing only: accounts (email+password
and "Sign in with Google"), so far with **nothing synced yet** — see "Backend (Convex)" below for
what exists, what's next, and the honest state of what's been verified.

- **Displayed name:** "sheddex" (all lowercase, shown as the sidebar logo text and page title).
  It's been renamed several times in development (Barn Tools → Woodshed → The Barn → Barn Tools →
  shed.io → jshed.io → jackshed → sheddex) — if asked to rename again, it's a plain find/replace
  for the lowercase name string, but by this point it's spread far wider than just the UI chrome:
  this rename alone touched `app/layout.tsx`, `components/Sidebar.tsx`, `components/Home.tsx`,
  `app/recorder/page.tsx`, `app/credits/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`,
  `README.md`, `convex/account.ts`, `convex/ResendOTP.ts`, `convex/lib/resend.ts` (the email
  "from" display name), `lib/chartString.ts` (the `jackshed://` chart-link scheme itself, now
  `sheddex://` — a real, if small, backward-compatibility break: any chart link exported before
  this rename starts with the *old* scheme and will no longer be recognized by
  `looksLikeChartString`/`decodeChartString`, not something an in-place rename can avoid), and
  several Community-facing components with "jackshed users" style copy
  (`components/CommunityChordCharts.tsx`, `components/CommunityTunes.tsx`,
  `components/AccountMenu.tsx`, `components/PublicProfileEditor.tsx`, `components/ChordCharts.tsx`,
  `components/ChordChartEditor.tsx`) — confirmed by grepping the whole repo for the old name
  afterward (case-sensitive and case-insensitive both) rather than trusting this list alone, since
  the equivalent list from the *previous* rename (just the four UI-chrome files) had already gone
  stale by the time this one happened.
- **GitHub remote:** `git@github.com:JackMechem/sheddex.com.git` (also renamed a few times;
  the home page's GitHub link in `components/Home.tsx` should match whatever it currently is) —
  the actual remote/domain rename is Jack's own external step (can't be done from here), so this
  session's own change just updates the in-app links to the name they're *expected* to point to.
- Jack drives development one request at a time and reviews by screenshot, so expect iterative,
  pixel-level follow-ups rather than big up-front specs. He's comfortable with technical detail in
  replies but the built-in style here favors plain, concrete explanations over jargon.

## Tools (sidebar order)

- **Jam Practice** (`components/JamPractice.tsx`) — random tune/tempo/key picker with a
  count-off metronome. Can draw from your own tune list or a built-in library of ~630 jazz
  standards (`lib/standards.ts`).
- **Metronome** — configurable time signature (including odd/custom meters), subdivisions,
  per-beat accents, tap tempo. Per a direct follow-up, the subdivision clicks (the "&" in eighth
  notes, etc.) now show in `BeatIndicator` too — not just a static marker, but genuinely live and
  clickable the same way the beats already were: they light up as they actually play, and clicking
  one cycles it through accent/normal/muted (`lib/clickEngine.ts`'s new `ClickSettings.subAccents`,
  flattened beat-major — `beat * (subdivision - 1) + subIndex` — and `lib/meterControls.ts`'s
  matching `defaultSubAccents`). This needed `onBeat` to change from firing only on the main beat
  (`sub === 0`) to firing on *every* tick, so a caller can track which subdivision just sounded
  (`currentSub`) the same way it already tracked `currentBeat` — the only two call sites, Metronome
  and Polyrhythm Metric Modulation Metronome, were updated accordingly; Jam Practice's own
  count-off doesn't go through this engine at all, so it's unaffected. An accented subdivision tick
  reuses the main beat's `normalFreq` at a lower volume (0.4, between a normal beat's 0.55 and a
  normal subdivision's 0.25) — distinguishable by loudness, not pitch, a deliberate simplification
  over adding a fourth frequency to every `ClickSound`. The Polyrhythm tool's secondary reference
  click stays locked to `subdivision: 1` (as it always was) and so never shows or needs subdivision
  ticks of its own.

  **`BeatIndicator` itself was then redesigned from numbered circles to a vertical-bar "sequencer
  strip"** per a direct follow-up with a reference screenshot (a row of tall colored bars, each
  beat's number printed top-left inside its own bar, its subdivision ticks as shorter unnumbered
  bars immediately after it). A shared `Bar` sub-component now renders both a beat and a
  subdivision tick identically apart from the number — same three-level color scheme (`bg-accent`
  for accent, `bg-foreground`/`text-background` for a bold "normal" bar, a faint ring-only hollow
  look for muted) and the same `active` treatment (scale/brightness/ring) a beat circle used to
  get, now shared by whichever bar — beat or tick — the engine just sounded. Bars within one beat
  sit close together (a small `gap-0.5`); the gap between beats is the container's own larger
  `gap-3`/`gap-2` (normal/`size="sm"`), matching the grouping the screenshot shows. `tsc`, `eslint`,
  and `next build` all pass. Verified with a synthetic script against a verbatim copy of the
  updated scheduling loop (can't import `lib/clickEngine.ts` directly outside the browser — it
  reaches for `window.AudioContext`): a muted subdivision tick schedules no sound at all, an
  accented one schedules at the expected frequency/gain, and `onBeat` fires for every tick in the
  right beat/sub order. **Not verified**: how the bar strip actually looks/feels in a real
  browser — whether it reads as close to the reference screenshot, whether the muted "hollow ring"
  look is legible at this size, and whether the active bar's ring-offset still looks right at the
  smaller `size="sm"` dimensions used for the Polyrhythm tool's reference click row.

  **"Structures" for odd/changing meters** (`lib/structure.ts`, `components/StructureEditor.tsx`)
  — per a direct follow-up request with a reference screenshot (from another app's "song form"
  editor, used as a UI/concept reference, not copied pixel-for-pixel): a structure chains bars of
  *different* time signatures in a fixed, looping sequence instead of one meter for the whole run
  — the request's own example, 2 bars of 11/8 then a bar of 12/8 then a bar of 15/8, is exactly
  three named sections (`A`: 2 bars of 11/8, `B`: 1 bar of 12/8, `C`: 1 bar of 15/8) arranged into
  a `form` of `[A, B, C]` that loops back to `A` after `C`. Modeled the same way a real tune's form
  is, per an explicit choice over a simpler flat list (asked directly, since the request's own
  example doesn't need reuse): a handful of reusable, named `sections` (`lib/structure.ts`'s
  `StructureSection` — bars, beatsPerBar/beatUnit, accents, subdivision, subAccents, i.e. a
  complete self-contained little meter, the same shape the plain top-level meter already is), and
  a `form` that's just an ordered list of section ids that can repeat the same one more than once
  (e.g. `[A, A, B, C]`) rather than needing a second copy of a section for every repeat. Off by
  default (`useStructure: false`); every existing field keeps behaving exactly as it always has
  while it's off — a `SwitchRow` inside the existing "Meter & subdivision" panel swaps that panel's
  content between the plain `MeterOptions` form and the new `StructureEditor` rather than adding a
  second panel.

  **Playback**: `Metronome.tsx`'s `getSettings(beat, sub)` — called by the click engine right as it
  schedules each tick, same function RandomMetricModulation already uses to land a tempo change
  exactly on a bar line — now also detects `beat === 0 && sub === 0` (a new bar starting) to decide
  whether the *current* form entry has finished its bar count and, if so, advances to the next one
  (wrapping past the end), the same "detect a bar boundary before it affects scheduling" trick,
  just switching the whole meter (`beatsPerBar`/`accents`/`subdivision`/`subAccents`) instead of the
  tempo. `bpm`/`volume`/`soundId` stay global across every section — only the meter itself changes
  per section, matching the request (no mention of the tempo itself changing through the form).
  `structFormIndexRef`/`structBarsIntoRef`/`structSeenFirstRef` (reset in `start()`, same pattern as
  `RandomMetricModulation`'s own `barsSinceModRef`/`seenFirstBeatRef`) track the state machine;
  `structPlayback` (React state, updated from inside `getSettings`) mirrors it for display and
  resets to `null` on `stop()` — read as `?? 0` everywhere it drives which section the main page
  shows/edits, so there's always a sensible section to look at even before Start has ever been
  pressed (defaulting to the form's first entry).

  **Editing**: `StructureEditor.tsx` — a "Form" strip of chips (one per form entry, reusing the
  same name-plus-"the section it is" idea everywhere), each with a remove button for that one
  occurrence and, per a direct follow-up request ("make them draggable, same for mobile"),
  genuinely draggable to an arbitrary position: Pointer Events
  (`onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel` + `setPointerCapture`, the same
  mechanism `Sidebar.tsx`'s own resize handle already uses, not the HTML5 drag-and-drop API, which
  doesn't work on touch devices without unreliable polyfills), so one implementation drags with a
  mouse, a finger, or a pen alike. Each chip's bounding rect is measured once at drag-start into a
  fixed reference grid (`dragRectsRef`) — the *physical* position of slot N in the row never moves
  as the underlying form reorders, only which chip's data renders there does, so comparing the
  live pointer position against these frozen rects (nearest-center-wins) is enough to know which
  slot it's over, with no re-measuring mid-drag. Crossing into a different slot calls
  `reorderForm(structure, from, to)` (a splice-out/splice-in move to an arbitrary position) and
  re-centers the dragged chip's `transform: translate()` offset fresh against its new slot
  (recomputed from the *current* slot each move, never accumulated from the drag's start) — so
  there's no jump the instant it crosses into a new position. `touch-none` on the chip stops the
  browser's own touch-scroll from fighting the drag; a press that starts on the chip's own remove
  button (`closest("button")`) is left alone as that button's own click, not a drag. The original
  ←/→ adjacent-swap buttons (`moveFormEntry`) were removed outright once dragging covered the same
  job, per a direct follow-up ("get rid of the arrows") — `moveFormEntry` itself was deleted too
  once nothing called it anymore, rather than left as unused dead code. Verified with a synthetic
  script (the pure `reorderForm` splice logic, and the nearest-slot distance math against a small
  fixed grid of mock rects — a pointer past a slot boundary correctly picks up the next slot, and
  one far past the end clamps to the last slot rather than extrapolating past it) — **not
  verified**: how an actual touch/mouse drag feels in a real browser, since this sandbox has
  neither.

  "Add to form" buttons (one per defined section, `+ A` `+ B` ...) append to the end; and a "Sections" list
  of collapsible cards, each a complete little meter editor — name, bar count (`SteppedField`), the
  *exact* `MeterOptions` the plain meter uses (presets, beats/unit steppers, accent grouping,
  subdivision picker), and its own `BeatIndicator` (`size="sm"`) for that section's own
  accent/subdivision-accent pattern — reusing every existing building block rather than a second
  copy of any of them. The main page's own `BeatIndicator` (above Start/Stop) tracks whichever
  section is current (`activeSection`) instead of the plain top-level meter while a structure is
  active, including routing its `onCycle`/`onCycleSub` to edit that section directly
  (`cycleSectionAccent`/`cycleSectionSubAccent`) — the same live-editable convenience the plain
  meter already had, just aimed at a different target. Start/Stop is disabled with an empty form
  (`canStart`), since there'd be nothing to actually play.

  Verified with a synthetic script against a copy of the bar-counting/section-switching state
  machine (can't import the real `getSettings` — it closes over React refs) using the request's own
  example (`A`: 2×11/8, `B`: 1×12/8, `C`: 1×15/8, form `[A, B, C]`): the section/beatsPerBar
  sequence over 8 simulated bars comes out exactly `A A B C A A B C` / `11 11 12 15 11 11 12 15` —
  two bars of 11/8, a bar of 12/8, a bar of 15/8, looping, matching the request exactly. `tsc`,
  `eslint`, and `next build` all pass. **Not verified**: anything about how this actually looks or
  feels in a real browser — the Form chips' drag-to-reorder (see its own paragraph above), a
  section's inline `MeterOptions`/`BeatIndicator` editor actually usable at the smaller card width,
  the empty-state messaging, and whether switching meters exactly on the bar line actually sounds
  seamless rather than having any audible hiccup — this sandbox still has no working browser or
  audio output.

  **"Tempo note value" — letting BPM refer to a different note value than the beat unit** — per a
  direct follow-up request with a concrete example: in 4/8 time, type "quarter note = 275" and have
  the metronome actually click eighth notes at 550 (twice as fast), rather than 275 always meaning
  whatever the meter's own beat unit happens to be (the engine's only behavior before this — `lib/
  clickEngine.ts`'s `ClickSettings.bpm` has no concept of note values at all, it's always just
  "clicks per minute" for whatever the engine is currently counting as one beat). `lib/
  meterControls.ts`'s new `convertTempo(bpm, fromNoteValue, toNoteValue)` is the one-line
  conversion (`bpm * toNoteValue / fromNoteValue` — an eighth note is half as long as a quarter, so
  twice as many fit in the same minute) everything else here is built on. A new "Tempo note value"
  `Select` sits right under the BPM hero number (`TEMPO_NOTE_MATCH`, a `0` sentinel for "match beat
  unit" — the persisted field itself is `tempoNoteValue: number | null`, `null` meaning the same
  "match beat unit" default, so an existing saved tempo keeps meaning exactly what it always did
  unless this is explicitly changed); a small "= 550 BPM at eighth note clicks" line appears
  underneath whenever the chosen note value actually differs from the current beat unit, so the
  real click rate is never a surprise. `Metronome.tsx`'s `getSettings` — already the one place that
  resolves the engine's actual per-tick `ClickSettings` — now converts the displayed `bpm` through
  whichever beat unit is *currently* active before handing it to the engine: the plain meter's own
  `beatUnit` normally, or (in structure mode) the *active section's* `beatUnit`, which can differ
  bar to bar — `tempoNoteValue` itself stays one single global field either way (tempo, like
  volume/tone, doesn't change per-section), only the conversion's target note value does.
  `settingsRef` gained `beatUnit`/`tempoNoteValue` fields to make this resolvable from inside
  `getSettings` (which runs off the engine's own scheduler tick, not a render) without closing over
  stale render-time values. Verified: the conversion formula itself, directly, against the
  request's own numbers (`convertTempo(275, 4, 8) === 550`, confirming "twice as fast"; a
  round-trip back through the same two note values returns the original 275; converting between
  the same note value is a no-op). `tsc`, `eslint`, and `next build` all pass.

  Three direct follow-ups landed on top of this. First, "put it to the left of the bpm didget": the
  picker moved from its own row below the BPM number into the number's own row, immediately to its
  left, via a new optional `before?: React.ReactNode` prop on `TempoHero`
  (`components/MeterFields.tsx`). Then, "put the drop down on top of the big number actually":
  `before` was replaced with `aboveNumber?: React.ReactNode` instead, rendered as the first child
  of the narrow `w-40` column the number itself sits in (so it's centered directly above the
  digits, not off to the side in the wider −/+ row) — every other caller still passes neither, so
  both changes stay purely additive. Finally, "make the dropdown have actual notes": each option
  now shows a real engraved note glyph via a new
  `NoteValueIcon` (`components/MeterFields.tsx`, next to `SubdivisionIcon`, same notehead/stem
  proportions as that component's own beamed notes, just for one note standing alone) — hollow for
  whole/half, filled with a stem for quarter and shorter, plus one flag per halving below a quarter
  (eighth = 1, sixteenth = 2, ...), rather than text alone. The dropdown's own labels were
  shortened for this compact spot (`SHORT_NOTE_NAME` — "Quarter", "Eighth", "16th", ...) since
  there's much less room here than in the full-sentence conversion readout below it, which still
  uses `NOTE_VALUE_NAMES`' full names ("Quarter note"). **Not verified**: how the new Select/
  conversion-readout actually looks positioned under/beside the BPM number, whether the hand-drawn
  note glyphs actually read as recognizable whole/half/quarter/eighth/etc. notes at this small a
  size, and — the thing that actually matters most here — whether the resulting click rate is
  genuinely audible and in time once played for real, since this sandbox has no audio output at
  all.

  **The beats-per-bar/beat-unit control itself was simplified and shrunk**, in two more direct
  follow-ups. First, "get rid of the presets": the row of common-signature buttons (2/4, 3/4, 4/4,
  ...) that used to lead `MeterOptions` is gone outright — the beats/unit steppers right below them
  are now the only way to set a meter. Since `MeterOptions` is the one shared component behind the
  plain Metronome meter, the Polyrhythm tool's own meter, *and* every Structure section's inline
  editor, this one removal applies everywhere at once; its now-unused `onApplySignature` prop (and
  each of those three call sites' own `applySignature` helper function) was deleted too rather than
  left as dead code, and `SIGNATURE_PRESETS` itself stayed in `lib/meters.ts` since `TuneFields.tsx`
  still uses it for an unrelated tune-time-signature picker. Second, "make the time signature
  smaller and easier to understand what it is": `SteppedField`/`BeatUnitField` both gained an
  optional `size?: "md" | "sm"` prop (new `CIRCLE_BUTTON_SM`/`CIRCLE_INPUT_SM` constants,
  module-private since nothing outside this file needs them) — `"sm"` only inside `MeterOptions`'s
  own beats/unit pair, so Polyrhythm's own direct `SteppedField` call ("Bars between modulations")
  and a Structure section's "Bars" field keep their original, larger size. The two numbers'
  `showLabel` also flipped from `false` to its own default of `true`, so "Beats per bar"/"Beat
  unit" are now always-visible captions (not hidden behind the panel's "?" hint toggle the way they
  were before), plus a small "Time signature" heading above both of them tying the whole stacked
  pair together as one concept. `tsc`, `eslint`, and `next build` all pass. **Not verified**: how
  any of this actually reads once rendered — this sandbox still has no working browser.
- **Polyrhythm Metric Modulation Metronome** (`components/RandomMetricModulation.tsx`) — same click engine
  and meter controls as Metronome, but every N bars it randomly jumps the tempo by a musical
  ratio (3:2, 4:3, 2:1, etc. — `lib/metricModulation.ts`), bouncing to the ratio's inverse if
  that would push the tempo out of range. Configurable bars-per-modulation (or "play until tempos
  realign" — each `Modulation` carries an exact `num`/`den`, so e.g. a 3:2 jump auto-sets the
  interval to 3 bars, the point where the new and reference tempos next share a downbeat), which
  ratios are in the mix, whether to avoid repeating the same one twice, and an optional "return to
  original tempo" mode that alternates modulate-away/return-home instead of drifting freely. Shows the
  upcoming tempo ahead of time and logs each modulation for the run in a `ToolLayout` `sidePanel`
  (see below). An optional second click — the "Previous tempo click" (`playOriginalTempo`; own
  tone, own mute, own `BeatIndicator`) — runs the whole time as a second track on the _same_
  `startClickEngine` call (see below) so it can hear/see it against whatever the main click has
  modulated to — pinned to the true starting tempo in "return to original" mode, or otherwise
  always the tempo the main click just left (one modulation behind, which is what the toggle's
  name reflects — it's usually tracking the *previous* tempo, not literally the original one).
  Turning it on also forces "play until tempos realign" (`matchToRealignment`) on and locks it
  there (disabled, can't be switched off) until the previous-tempo click is turned off again —
  that's what keeps the reference click's own realignment math meaningful; letting the two vary
  independently could leave it silently out of sync with the main click. Each modulation carries
  an exact `num`/`den` (e.g. 3:2), so it also shows what the new
  tempo's quarter note is worth in the reference tempo's note values where that reduces to a
  single clean name (`describeQuarterEquivalence` in `lib/metricModulation.ts`; several ratios,
  like 4:3, genuinely don't and show nothing). The modulation itself is applied from inside
  `getSettings` (a param `startClickEngine` passes `(beat, sub)` into) rather than reacting to
  `onBeat`, so it lands exactly on the bar line instead of one beat late.
- **Tuner** — a Total-Energy-style circular note picker for a chromatic tuner + tone generator,
  with per-instrument string tunings.
- **Note Trainer** — drills random notes in an instrument's range. Has a mic-based "listen mode"
  (`lib/audioInput.ts`, `lib/pitchDetect.ts`, `lib/noteGrade.ts`) that listens through the
  microphone and grades correct/partial/incorrect, with a countdown ring and adjustable max-time
  per note. Once a note is graded, the same ring (plus a "Next note in Ns" readout,
  `components/CountdownLabel.tsx`) retargets to count down "Time between notes" instead (0–8s,
  a main Listen-mode control, not tucked in Advanced); an optional "Sound feedback" toggle adds a
  click each second of that countdown plus one the instant a note is graded, via
  `lib/clickEngine.ts`'s `scheduleClick`. Same mechanism as Scale Trainer's (see below), ported
  over afterward — `lockInResult` here is the equivalent of Scale Trainer's `lockInRound`.
  A lifetime "Struggles" side panel (`lib/struggleStats.ts`, shared with Scale Trainer — see
  below) tracks correct/partial/incorrect per note across every listen-mode session ever run
  (not reset between sessions, unlike the timed "History" list next to it), ranks them worst
  first, and a "Shed weak notes" button starts a focused session on just those — reuses the same
  queue machinery as "Drill every note" (`start()` takes a `StartRequest` —
  `{kind:"normal"|"weak"}` or `{kind:"string", stringIndex}`, all three driving the same
  `drilling`-gated code paths in `start()`/`advance()`) but sources its queue from
  `weakNotesInRange` instead of the whole range, forces listen mode on, and never writes to the
  timed History (a short focused run isn't a fair comparison against a full one). For a stringed
  instrument (`Instrument.strings` in `lib/instruments.ts` — bass4/5, guitar, ukulele, violin,
  viola, cello; mirrors the standard tuning already in `lib/tunings.ts` for the Tuner, which uses
  a separate instrument-id namespace and isn't reused directly) there's also a "Shed a string"
  button per string, same focused-session machinery again, queued from that string's own open
  note up to two octaves above it (clamped to the instrument's declared range — no fret-count
  data exists anywhere in the app, so this is a stated, adjustable assumption, not measured) —
  always shown and graded with the octave via `effectiveIgnoreOctave`, regardless of the "Ignore
  octave" toggle, since isolating one string is inherently octave-specific. That override is
  computed from `lastRequest` (which mode last ran) rather than `running`, so it also still
  applies to the results screen shown right after — but `start()` never reads it or the
  `ignoreOctave`-derived `rangeInput` directly for a string session (both are only current as of
  the last *completed* render, and `start()` needs values that are correct at the moment it's
  called, mid-render-cycle) — it recomputes both locally from the instrument's own declared range.
- **Scale Trainer** (`components/ScaleTrainer.tsx`, `lib/scales.ts`) — same shape as Note Trainer
  (shares its countdown ring, elapsed timer, advanced-slider, and note-spelling code — see shared
  conventions below), but drills scales instead of single notes: a random starting note plus a
  random mode from a selectable pool (`lib/scales.ts`'s `SCALE_MODES`, grouped into categories —
  the 7 major-scale modes, harmonic/melodic/harmonic-major, pentatonic/blues, the 7 melodic-minor
  modes, and the symmetric scales — with a sensible starter subset enabled by default). Listen
  mode expects the scale's notes in order, root to root; a wrong note fails the round (turns red)
  immediately by default. An optional "Partial credit" toggle (Listen mode → Advanced) instead
  gives each scale degree one retry — a second miss on the same degree still fails the round, but
  a degree that's missed once and then fixed lets the round finish as "partial" (amber) rather
  than "correct" (green), matching Note Trainer's correct/partial/incorrect grading
  (`GRADE_COLOR`/`GRADE_LABEL`/`Grade`/`scoreOf` now live in `lib/noteGrade.ts`, shared by both).
  The current round's note pills show progress live (matched/current-waiting-on-a-retry/failed)
  while it's running.
  "Drill every scale" plays every selected mode in all 12 keys (each with its own random octave)
  instead of a fixed count; a missed round is requeued with a freshly re-rolled octave rather than
  the identical one, so a repeated miss doesn't look like the same exact round stuck on screen. An
  "Ignore octave" toggle drops the octave number from every note shown (e.g. "C Dorian" instead of
  "C4 Dorian") **and** accepts the scale played in any octave — it's passed through to
  `gradePitch`'s own `ignoreOctave` option, not just a display flag. Once a round is graded, the
  same countdown ring (and a "Next scale in Ns" readout, `components/CountdownLabel.tsx`) retargets
  from "time left to play" to "time until the next scale", timed by the "Time between scales"
  slider (0–8s, promoted out of Advanced since it's a main control now); an optional "Sound
  feedback" toggle adds a click on every second of that countdown plus one the instant a scale is
  graded, via `lib/clickEngine.ts`'s `scheduleClick` (the same oscillator-click code the
  metronomes use) rather than a pitched note. Shares Note Trainer's lifetime "Struggles" panel
  (`lib/struggleStats.ts`) and "Shed weak scales" button, keyed by key *and* mode together (e.g.
  "F# Dorian" and "C Dorian" are tracked and shed separately, not lumped into one "Dorian"
  struggle) — the stat key folds a bare 0–11 pitch class and the mode id into one string
  (`scaleStatKey`/`parseScaleStatKey`), pitch class rather than a spelled letter so it survives an
  accidental-style change and doesn't care what octave it was played in. A weak session is one
  round per struggling key, built with `scaleRoundForPitchClass` for that exact key+mode rather
  than a random root of the mode — not the full `drillQueueForPool` 12-key-per-mode sweep "Drill
  every scale" does, so it stays quick and targeted on what's actually giving trouble.
- **Interval Trainer** (`components/IntervalTrainer.tsx`, `lib/intervals.ts`) — same shape again
  (same shared countdown ring/timer/note-spelling code), but drills the twelve intervals within an
  octave (minor 2nd through an octave, `lib/intervals.ts`'s `INTERVALS`, all enabled by default —
  a small enough set that a curated starter subset isn't worth the friction) instead of scales. A
  round is `{interval, direction, startMidi, notes: [start, target]}` — always exactly two notes,
  so `handleFrame`'s degree-by-degree grading loop is reused almost verbatim from Scale Trainer. An
  "Include descending intervals" toggle (Intervals panel) controls whether a round can ask for the
  interval *below* the starting note as well as above; off by default (ascending only). Listen mode
  has two distinct styles, both built on the existing "precompute the next round for preview" ref
  (`upcomingRef`) rather than any new state:
  1. **Fresh root each round** (default) — `randomIntervalRound` picks a brand-new random starting
     note every time, shown as e.g. "C4 ↑ Major 3rd".
  2. **Continue from previous note** (the "Continue from previous note" toggle, mutually exclusive
     with "Drill every interval") — `chainedIntervalRound` starts the next round exactly on the
     *target* note the previous round just ended on, so the interval is played relative to wherever
     the last one landed rather than a fresh root. The starting note is still always shown (e.g.
     "F#4 ↓ Perfect 4th") even though it's the same note as the previous round's target — a chain
     that hid it would leave no way to re-orient after a wrong note, since nothing on screen would
     say where you actually are. Falls back to a fresh random root if the chain runs out of range to
     continue in.
  "Drill every interval" works like Scale Trainer's "Drill every scale": every selected interval, in
  every selected direction, starting on all 12 keys, each its own random octave
  (`drillQueueForPool`); a missed round is requeued with a freshly re-rolled octave
  (`intervalRoundForPitchClass`) rather than the identical one. Shares the lifetime "Struggles"
  panel and "Shed weak intervals" button (`lib/struggleStats.ts`), but keyed by interval *and*
  direction together (`"M3:1"` = ascending Major 3rd, `"M3:-1"` = descending — `intervalStatKey`/
  `parseIntervalStatKey`), not by starting note, since an interval is the same struggle wherever
  it's started from. A weak session is one round per struggling interval+direction
  (`randomIntervalRound` with that single interval/direction forced), not the full drill sweep.
  An optional "Play interval out loud" toggle (quiz mode only, not listen mode) plays both notes in
  order, spaced out, instead of a single note like the other two trainers.
- **Guess the Interval** (`components/GuessTheInterval.tsx`, reuses `lib/intervals.ts` directly —
  no new lib file) — the first tool in its own **"Ear Training"** sidebar category (a new entry in
  `components/tools.tsx`'s `CATEGORIES`, between "Practice" and "Timing & Tuning"). Derived from
  Interval Trainer but inverted: it plays an interval (melodic or harmonic — a "Playback style"
  setting — via `lib/tones.ts`'s `playNote`) and the player picks which interval it is from a
  multiple-choice grid, instead of playing it back on an instrument through the mic. Because
  there's no audio input at all, it drops everything that only exists for pitch-listening (mic
  input, tolerance/hold-time/sensitivity, partial credit, ignore-octave, ignore-repeated-notes) but
  keeps the exact same *timing* machinery as Interval Trainer end to end — the countdown
  ring/label, "Max time to answer"/"Time between rounds" sliders, the sound-feedback countdown
  clicks, `roundCount`/"Drill every interval", and a timed "History" list keyed by a config only
  attempts with matching settings compare against — `lockInRound`/`scheduleAdvance`/`advance`'s
  finalize-then-pick-next state machine is copied over almost line for line, just with grading
  triggered by `submitGuess(id)` (a button click, immediately correct/incorrect — no partial
  credit, since there's no note-by-note sequence to retry) instead of `handleFrame`'s mic
  callback. A round is always shown as "?" until graded, then reveals the interval (e.g.
  "↑ Major 3rd", colored green/red) and, if "Reveal notes after answering" is on, the actual notes
  played (e.g. "C4 → E4"). "Include descending intervals" still exists (a round can play the
  interval below the start), but since guessing only asks "which interval", not "which direction",
  the answer grid and the lifetime "Struggles" stats (`lib/struggleStats.ts`) are keyed by interval
  alone — unlike Interval Trainer's interval-*and*-direction keying. A "Shed weak intervals"
  session's answer choices come from whatever's actually in that session's queue rather than the
  live pool selection, so a struggling interval that's since been deselected from "Intervals" still
  shows up as a valid answer instead of being an un-pickable correct answer.
  Two `react-hooks/purity` false positives (`performance.now()` inside `lockInRound`/`start`, both
  only ever reached from a button's `onClick`, never during render — the same ref-mutation timing
  pattern every other trainer uses) are suppressed with `eslint-disable-next-line` comments; the
  other trainers use the identical pattern but are large/complex enough that the React Compiler
  lint integration bails out of analyzing them before it would reach the same code, so only this
  smaller component's version gets (harmlessly) flagged.
- **Guess the Chord** (`components/GuessTheChord.tsx`, `lib/chords.ts`) — second tool in "Ear
  Training". Same timed-round shape as Guess the Interval (countdown ring, max time to
  answer/time between rounds, sound feedback, drill mode, timed History, lifetime "Struggles" +
  "Shed weak chords"), but plays a full chord instead of an interval, and grading is a typed text
  answer instead of a multiple-choice pick — there's no fixed candidate list to build (a real
  simplification vs. Guess the Interval's answer-choices bug the weak-session fix had to work
  around). `lib/chords.ts`'s `CHORD_QUALITIES` (33 qualities across 6 categories — Triads,
  Sixths, Sevenths, Altered dominants, Extensions, Sus & add, with a smaller starter subset
  enabled by default, same pattern as Scale Trainer's mode categories) is written in the *same*
  plain-text quality-suffix grammar iReal Pro itself uses (`^7`, `-7`, `h7` for half-diminished,
  `o7` for diminished, `+`, `#`/`b`, ...) — deliberately, so a chord here is typed and displayed
  exactly the way it'd appear on a Chord Charts chart. `prettyQuality` (the `^`/`h`/`o`/`#`/`b` →
  Δ/ø/°/♯/♭ substitution) moved from being a private helper in `ChordChart.tsx` to an export of
  `lib/iRealPro.ts` so both this bank and the chart renderer draw a chord the same way. Typing
  is graded, not chosen: `parseChordInput` (root letter + accidental, then a non-greedy quality
  capture, then an optional `/bass` — the same shape as `iRealPro.ts`'s own `CHORD_RE`/
  `splitMain`, just permissive about the quality text instead of a fixed char class) resolves
  freeform typed text like `maj7`, `m7`, `dim`, `sus4`, `Δ7`, `ø7`, `°7` against each quality's
  declared `aliases`, case/whitespace/punctuation-insensitively; grading
  (`chordInputMatchesRound`) then compares root pitch class + resolved quality id + slash bass
  pitch class (or both `null`) — enharmonic spelling doesn't matter, same as every other trainer
  here. Deliberately does *not* accept a bare `M7` for major 7: matching is case-insensitive, so
  there's no way to tell `M7` from `m7` apart once normalized, and `m`/`m7`/... for minor is by
  far the more universal shorthand, so that's the one bare-letter form supported — major relies
  on `maj7`/`^7` instead (documented both in a code comment on `ChordQuality.aliases` and in an
  always-visible on-page hint, since it's a real gotcha for anyone typing `M7` expecting major).
  What's typed renders live, formatted the same way (`formatChordParts` + `prettyQuality`), in
  the same spot the revealed answer appears once graded — so "proper formatted notation" is
  visible the whole time you're typing, not just after submitting. A chord's root is drawn from a
  plain register choice (Low/Mid/High/Wide MIDI ranges) rather than an instrument list — a chord
  isn't "played on an instrument" the way the other trainers' material is, so reusing the
  Instrument dropdown wouldn't mean anything here. Slash chords aren't restricted to real
  inversions: a "Chance of a slash chord" slider (0-100%) independently rolls *any* of the 12
  pitch classes as the bass, so it can land on an actual chord tone (a normal inversion) or a
  genuinely unrelated note (the "weird slash chords" the tool was asked for) with equal
  likelihood — `buildRound` voices that bass in the octave directly under the root. A round times
  out the same way an explicit answer works, not silently: `gradeAndReveal` (grades whatever's
  currently typed, or "incorrect" if empty/unrecognized) runs from *both* the "Submit"/Enter path
  and the max-time timer's `onTimeUp` callback, so running out of time still reveals the correct
  answer through the normal `lockInRound` reveal-and-countdown pause instead of just silently
  picking the next round — a deliberate departure from Interval/Scale Trainer's own timeout
  behavior (which doesn't reveal anything on a miss), made because losing an answer you were
  mid-typing without ever finding out what it was seemed like a worse loss here specifically.
  Struggle stats (`lib/struggleStats.ts`) are keyed by quality id alone (not quality-and-slash),
  matching Guess the Interval's keep-it-simple choice over Interval Trainer's fuller keying.
  A "Give the root" toggle (on by default) pre-fills the answer field with the round's root the
  instant it's shown — cursor placed right after it — so typing (and being graded on) is about
  working out the quality/slash bass by ear, not also having to name the root; switching it off
  clears the field instead, making the whole symbol, root included, something to work out.
  Leaving the prefilled root untouched and submitting reads as "just typed the root" (a bare
  major triad, the empty-quality default), which is correct only when the round genuinely is one.
  A small "keypad" of buttons sits above the answer field (visible whenever it is) for the
  symbols that are awkward to type, especially on a phone — minor `-`, major 7 `^`, diminished
  `o`, half-diminished `h`, augmented `+`, `#`/`b`, `/` (slash), `sus`, `add` — each key shows its
  `prettyQuality`-formatted glyph as the button face and inserts the plain iReal text at the
  field's current cursor position (not just appended to the end), restoring the caret right after
  it via a `requestAnimationFrame` (the DOM `<input>` doesn't have the just-set React state's
  value yet the same tick a key is clicked). Each key's `onMouseDown` prevents the browser's
  default focus-shifting-to-the-button behavior, so the answer field never visibly loses focus to
  a keypad tap at all.
- **Practice Timer** (`components/PracticeTimer.tsx`, `lib/practiceTimer.ts`,
  `lib/practiceTimerEngine.ts`) — chains named timers back to back (e.g. "10 min scales, 5 min
  break, 10 min tune"), or runs a configurable Pomodoro (work/short break/long break minutes,
  cycles before a long break, and either a fixed total number of work cycles or "keep going
  indefinitely", mirroring Jam Practice's own toggle of that name). Work cycles can each have
  their own name (`PomodoroConfig.workTitles: string[]`, editable as an ordered add/remove/
  reorder list in the editor, same shape as a custom session's segment list) — e.g.
  `["Scales", "Chords", "Improv"]` names cycle 1 "Scales", cycle 2 "Chords", cycle 3 "Improv",
  cycle 4 back to "Scales", wrapping via modulo so it works for an indefinite session too (no
  fixed cycle count to size the list to) and for any totalCycles/list-length mismatch; an empty
  list, or a blank entry in it, falls back to plain "Work" for that cycle. Breaks are deliberately
  **not** individually nameable — just the fixed "Short break"/"Long break" labels — per an
  explicit follow-up request narrowing this down from an earlier version that made all three step
  kinds nameable. `lib/practiceTimer.ts` is pure
  session-shape logic with no engine/UI concerns: a `PracticeSession` is a discriminated union
  (`type: "custom"` with a `Segment[]`, or `type: "pomodoro"` with a `PomodoroConfig`), and
  `stepAt(session, index)` is the one function both the engine and the UI call to ask "what's step
  N" — for Pomodoro this lazily expands the work/break pattern (`pomodoroStepAt`) rather than ever
  materializing a real array, since an indefinite Pomodoro has no fixed length.
  `lib/practiceTimerEngine.ts` is a self-contained, module-level-state JS engine — same shape as
  `lib/clickEngine.ts`, not tied to any component's lifecycle — exposed via a `subscribe`/
  `getSnapshot` pair so any component (the tool page, the sidebar widget, the mobile badge) can be
  an independent `useSyncExternalStore` view onto one shared running timer, none of them
  responsible for keeping it alive. It's also the first timer in this codebase built to survive an
  actual page reload, not just a re-render: `startedAt` is wall-clock (`Date.now()`), not
  `performance.now()` like every other timer/ring here, and the whole state round-trips through
  `localStorage` (`jam-practice-timer-running`) so `ensureInitialized()` can restore it on the next
  load — paused restores frozen as-is; a still-running step restores and reschedules against
  however much time is actually left; a step whose time had already fully elapsed while the tab
  was closed advances exactly one step fresh (no chime, no attempt to simulate/cascade through
  every step that might have silently elapsed for a long-closed tab). `components/
  PracticeTimerRing.tsx` is the tool page's own countdown ring + "M:SS" label — deliberately
  **not** built on the shared `CountdownRing`/`CountdownLabel` (hardcoded to `performance.now()`,
  the page-load-relative clock every other timer here uses); an earlier version of this component
  converted into `performance.now()` terms via `performance.timeOrigin` specifically to reuse
  those shared components without modifying them, but that produced a running-timer display that
  didn't match the sidebar widget's own (correct) reading of the same segment — diagnosed as a bug
  in that conversion rather than chasing it further, since this sandbox has no browser to actually
  debug a `performance.timeOrigin` mismatch in. Replaced with a small self-contained component
  that computes straight off `Date.now()` — the exact same clock `lib/practiceTimerEngine.ts`
  itself and `PracticeTimerWidget.tsx` already use — and formats via the shared `formatClock`
  (`lib/practiceTimer.ts`, "M:SS", e.g. "24:59" — not `formatMinutes`, which is for a *static*
  duration label like "10 min", not a ticking countdown), so the tool page and the sidebar/mobile
  widget literally cannot show two different numbers for the same running step anymore, and a long
  segment reads as minutes:seconds instead of a raw, hard-to-parse second count. While paused, it
  freezes at `remainingMsAtPause` instead of the live tick. `components/PracticeTimerWidget.tsx` is
  the "what's running right now" glimpse shown outside the tool itself while a session is active —
  a card in the desktop sidebar footer (both its full and collapsed widths,
  `components/Sidebar.tsx`), the same card again in the mobile menu's own footer (shares the same
  code path as the desktop one), or a fixed top-right badge on mobile mirroring the hamburger
  button's top-left placement (`app/layout.tsx`); renders nothing while nothing's running. The
  full-width card (desktop sidebar and the mobile menu, not the collapsed sidebar or the top-right
  badge — no room for controls in either of those) has its own pause/resume, skip, and stop
  buttons, real `<button>`s as siblings of the card's own `<Link>` rather than nested inside it (a
  button inside an anchor is invalid HTML and breaks click handling) — added per a direct follow-up
  request to control a running session from the sidebar, not just glance at it.

  **Alarm mode and full-screen alerts** (the `practice-timer-sound-settings` synced object's
  `alarmMode`/`fullScreenAlert`, alongside the existing `soundEnabled`/`toneId`): by default, a
  segment ending plays one transition chime and the engine auto-advances silently underneath,
  unchanged from before. With alarm mode on, the engine instead holds — `EngineState.alarming:
  true` — repeating that same chime every 1.5s (`lib/practiceTimerEngine.ts`'s
  `startAlarmSound`/`ALARM_REPEAT_MS`) until `skip()` is called (dismiss and move on — the exact
  same function as a normal manual skip) or `stop()` ends the run outright; `pause()`/`resume()`
  are no-ops while alarming, since there's nothing actively counting down to pause. Every
  Practice-Timer-aware surface reflects `alarming`: the tool page's own controls swap to
  Continue/Stop (no Pause, no plain Skip) and `PracticeTimerRing` paints fully drained and pulses
  in the danger color instead of ticking; the sidebar widget shows "Time's up!" with the same
  Continue/Stop pair; and — only while `fullScreenAlert` is also on — `components/
  PracticeTimerAlert.tsx`, mounted once in `app/layout.tsx` (so it interrupts you app-wide, not
  just on the tool page), shows a full-screen takeover with the same Continue/Stop choice,
  deliberately **not** dismissible via Escape or a backdrop click the way `ConfirmDialog` is — this
  is meant to be genuinely sticky, like a real alarm clock, until an actual choice is made.
  `fullScreenAlert` only does anything while `alarmMode` is also on (there's no "held, waiting"
  moment to interrupt for otherwise — without alarm mode the engine has already silently advanced
  by the time anything could show), so its own `SwitchRow` is disabled whenever `alarmMode` is off,
  and turning `alarmMode` off forces it back off too rather than leaving it toggled-on-but-dormant.
  Restoring from a reload (`ensureInitialized()`) treats "was already alarming" and "alarm-mode
  time elapsed while the tab was closed" as the same case — both restore straight into
  `alarming: true` on the *same* step, never silently advancing past it the way non-alarm-mode
  restores do; no sound autoplay on that restore either, same reasoning as the existing
  chime-after-restore skip (a browser would very likely block an unprompted autoplay with no user
  gesture anyway). Verified with a synthetic script driving the engine's alarm state machine
  directly (holds on `alarming` instead of auto-advancing, stays held indefinitely rather than only
  once, `skip()` dismisses and advances, `stop()` ends cleanly from an alarming state, and
  `alarmMode: false` is completely behaviorally unchanged) plus two new restore-from-storage cases
  (elapsed-while-away-with-alarm-mode-on, and already-alarming) alongside the existing ones.

  Saved sessions sync per Jack's explicit call on how sophisticated this should be: signed
  out, they live in `localStorage` via `lib/practiceSessionsStore.ts` (the same hand-rolled
  external-store shape as `lib/tunesStore.ts`); signed in, `lib/usePracticeSessions.ts` reads/
  writes the `practiceSessions` Convex table instead (`convex/practiceSessions.ts`) — **with no
  merge at all**: signing in simply stops consulting local storage, it doesn't import, offer a
  choice, or look at what's already there. Both `useConvexAuth()` and the Convex/local-store hooks
  in `usePracticeSessions` run unconditionally on every render regardless of sign-in state, per
  rules-of-hooks; only the returned `sessions`/mutators branch on it, same pattern as
  `AccountPage.tsx`.
- **Chord Charts** (`components/ChordCharts.tsx`, `components/ChordChart.tsx`,
  `lib/iRealPro.ts`) — paste an iReal Pro playlist link (the `irealb://...` links shared on the
  iReal Pro forums) and read its charts, styled to match the site. The link's chord data is
  scrambled/compressed in an undocumented way; `ireal-reader` (npm, MIT — the one non-audio
  runtime dependency in this repo) handles that part and splits the playlist into songs, but its
  own `measures` output _expands_ repeats/endings into one flattened, played-through list, which
  is right for playback but wrong for display. So `lib/iRealPro.ts` doesn't use that — it walks
  the same un-scrambled `raw` chart string itself (same token grammar: `*A` section letters,
  `{`/`}` repeat barlines, `N1`/`N2` endings, `<...>` directions like "D.C. al Coda", `XyQ` layout
  padding, a chord-token regex) to build a chart model that keeps the notation as written once,
  with repeat signs and ending brackets, instead of expanding it. Imported songs (title, composer,
  style, key, and the parsed bar list) persist in localStorage across playlists you paste in,
  de-duplicated by title/composer/key; "bars per row" is a display setting, not part of the parsed
  data. Verified by running the whole parser over a real ~1,460-song forum playlist (`node
--experimental-strip-types`, not committed) — no exceptions, no malformed chords, ~4.5MB of
  JSON for that whole playlist (comfortably under typical localStorage limits, but worth knowing
  if several large playlists get imported).
  **Every imported chart belongs to a playlist** (`lib/chordChartsLibrary.ts`'s `Library` type —
  `{songs, playlists}`, where a `Playlist` is just a name plus a list of song ids) — per a direct
  follow-up request, since the library used to be one flat list with no grouping at all. Pasting an
  iReal Pro link creates (or, re-pasting the same playlist later, merges into — matched
  case/whitespace-insensitively by name) a playlist named after that playlist's own name
  (`parseIrealPlaylist`'s `name`, e.g. "Real Book vol. 1"); importing from a Community chord-chart
  post (`CommunityChordCharts.tsx`) does the same under that post's title, whether it's "Import
  all" or a single song pulled out of a bigger post — either way it lands in a playlist named after
  the post, so charts from the same post end up grouped together rather than loose. One function,
  `mergeIntoLibrary`, is the single place this happens — both import paths call it, so there's
  exactly one playlist-assignment rule to reason about, not two that could drift. The "Tunes" panel
  shows playlists as collapsible sections (sorted alphabetically) instead of one flat list;
  expand/collapse state is plain ephemeral component state (not persisted — this is a "which
  section is open right now" UI convenience, not real settings data), and a playlist containing the
  currently selected song shows expanded by default with no explicit toggle needed, so picking a
  tune from the search popup always reveals where it lives. `resolvePlaylists` is what actually
  turns `Library` into what gets rendered — it resolves each playlist's song ids back into full
  song objects and, importantly, buckets any song that isn't in *any* playlist into a synthetic
  "Unsorted" playlist shown last. That bucket is what makes "every chart is in a playlist" true for
  a library saved *before* this feature existed too: `playlists` defaults to `[]` and
  `mergeWithDefaults` (`lib/usePersistedSettings.ts`) fills a missing field from the default rather
  than failing, so an old library with songs but no `playlists` field just loads with everything
  showing under "Unsorted" — no migration write needed, nothing to break if it's read on a device
  that hasn't picked up this change yet. Deleting a song removes it from `songs` and from whichever
  playlist(s) reference it (`removeSongFromLibrary`); a playlist left with no songs is dropped
  entirely rather than kept as an empty shell. Verified with a synthetic Node script
  (`mergeIntoLibrary` creating vs. merging into an existing playlist by name, a duplicate song
  correctly skipped in a *new* playlist too — not just the one it was already in, `resolvePlaylists`
  accounting for every song exactly once, the legacy-library-falls-into-Unsorted case, and
  deleting a song both from a solo playlist — which then disappears — and from a multi-song one,
  which doesn't) — not yet clicked through in a real browser (same "genuinely untested" caveat as
  everything else UI-shaped in this app — see that section).
  **Signed in, the library moved off `syncedSettings` onto its own dedicated tables** — the first
  real bug this app has hit from an actual user, not a sandbox-guessed risk: importing a large
  real iReal Pro playlist threw `Uncaught Error: Value is too large (4.62 MiB > maximum size 1
  MiB)` from `syncedSettings:set`, because the *whole* library (every song's full parsed bar list,
  all of it) was being written as one JSON blob in one Convex document, and Convex hard-caps a
  single document at 1 MiB. `lib/useChordChartsLibrary.ts` is the new single entry point both
  `ChordCharts.tsx` and `CommunityChordCharts.tsx` use instead of `useSyncedSettings`/
  `LIBRARY_KEY` directly: signed out, it's a thin, *unchanged* wrapper over
  `lib/chordChartsLibrary.ts`'s pure functions and the original `usePersistedSettings` blob (this
  bug is Convex-specific — localStorage has no equivalent per-key ceiling anywhere near this, so
  there was nothing to fix for a signed-out device); signed in, it's backed by three new Convex
  tables (`chordChartPlaylists`/`chordChartSongs`/`chordChartSongBars`, `convex/schema.ts`) instead
  of the generic blob mechanism, the same kind of exception `practiceSessions` and the Community
  post tables already are, just pushed one step further: a song's *metadata* (title/composer/
  style/key/time signature) is split into its own table from that same song's *bars*, so listing,
  searching or deduping a library (`convex/chordCharts.ts`'s `library`/`importSongs`) never has to
  touch `bars` at all, and `bars` is fetched only for whichever one song is actually
  displayed (`getSongBars`) or, for bundling several already-chosen songs into a Community post,
  in one bulk one-off call right before posting (`getSongsBars`, called via `useConvex().query`
  rather than a live `useQuery` subscription, since it's only ever needed once). The result: no
  single document's size grows with the size of the library, or even the size of one playlist —
  only with the size of *one song*, which in practice is nowhere near 1 MiB (the forum-playlist
  numbers cited above work out to roughly 3 KB/song on average). `migrateFromSyncedSettings` is a
  one-time, entirely server-side migration (never receives the old blob as a mutation argument —
  it's read from the database inside the mutation itself) for anyone who already had a library
  synced the old way before this fix landed, called once per sign-in from the new hook; it's
  provably safe from hitting the very limit it exists to work around, since the old blob could only
  ever have been successfully *written* in the first place if it was already under 1 MiB — the
  failure this fixes was always a rejected *write*, never a value that made it into storage
  oversized. Verified end to end against the real dev Convex deployment (not just `tsc`/
  `next build`): `npx convex dev --once` deploys the new schema/functions cleanly, and a plain
  Node script using `ConvexHttpClient` confirmed the deployed functions are correctly wired and
  behave as expected when called unauthenticated (`library` returns the empty shape rather than
  throwing, `importSongs` throws "Not signed in", `getSongsBars` returns `{}`) — this sandbox still
  can't authenticate as a real user to exercise an actual import end to end, so the one thing this
  *doesn't* prove is that a real "massive playlist" import now actually succeeds for Jack, only
  that the architecture that was silently guaranteed to fail no longer has that specific failure
  mode built into it.

  **Transpose** (per a direct follow-up request, "transpose any of the chord charts into a
  different key"): `lib/iRealPro.ts`'s `transposeSong(song, semitones)` is a pure function that
  returns a new `IRealSong` with every chord's root, slash bass, and the printed key label shifted
  by `semitones`, leaving the quality suffix (`-7`, `^7`, `sus4`, ...) untouched since none of that
  text is a note name. It wraps at the octave (`+13` behaves like `+1` — a chord symbol carries no
  octave of its own) and returns the exact same object, not a copy, for `semitones: 0`, so a call
  site can apply it unconditionally without a special case for "not transposed." Respelling uses a
  fixed table (`PREFER_FLAT`) rather than trying to preserve whatever accidentals the original
  chart happened to use: flats for every altered pitch class except F#, matching how real jazz
  lead books actually spell a transposed key (`Db7`, `Ebm7`, but `F#7` rather than `Gb7`) — getting
  this exactly right for every possible key would need genuine key-signature analysis this app
  doesn't do anywhere else, so it's a deliberate, documented approximation rather than a claim of
  always matching a real book's own spelling.

  This is purely a *display* transform, never written back into the library — the same
  "device-local display preference, not real tool data" category `ChordCharts.tsx`'s existing
  "bars per row" setting is in, just one step more ephemeral: the chosen key is plain `useState`
  (not even `usePersistedSettings`), and resets to "Original" whenever a different tune is
  selected, so a transpose left on from the last chart you looked at can never silently carry over
  and surprise you on the next one. Reset-on-selection-change is done as a render-time state
  adjustment (`if (selectedId !== lastSelectedId) { setLastSelectedId(selectedId);
  setTransposeKey(""); }`) rather than a `useEffect`, the pattern React's own docs recommend for
  "adjust state when a prop changes" — no extra render/flash, and no
  `react-hooks/set-state-in-effect` lint issue to route around (see `AccountMenu.tsx`'s own note
  elsewhere in this file for hitting that rule the effect-based way).

  The control itself is a **key dropdown** (`Select`, the same combobox every other picker in this
  app uses), not a +/- stepper — an explicit direct follow-up correcting an earlier version that
  used semitone-at-a-time −/+ buttons ("the key should be a drop down with all the keys and not a
  + - thing"). `lib/iRealPro.ts` exports `KEY_NAMES` (the 12 pitch classes' canonical names, same
  `PREFER_FLAT` spelling `transposeSong` itself uses — `C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B`)
  and `keyPitchClass(key)` (a chart's own printed key label's tonic pitch class, or `0`/C if the
  label doesn't parse). The "Display" panel's "Key" row offers "Original (<the chart's own key>)"
  plus all 12 names; picking one computes the semitone distance from the chart's *own* key to the
  chosen one (`(KEY_NAMES.indexOf(transposeKey) - keyPitchClass(selected.key) + 12) % 12`, always
  landing in 0-11 since `transposeSong` itself wraps at the octave) and feeds that into
  `transposeSong`. `ChordCharts.tsx` computes `displayed` from this once (`useMemo`) and passes
  `displayed`, not the library's own `selected`, into every `<ChordChart>` render — so the original
  song object in the library is never touched, only what's handed to the renderer for that one
  view. The earlier version also had a second, compact floating pill near the Maximize button for
  quick access without opening the Display panel; that was dropped rather than turned into a
  second dropdown, both because a full `Select` button (label text + chevron) is noticeably wider
  than the icon-only Maximize button it would have sat next to — a real collision risk against the
  chart's own left-aligned title at narrow widths that the old slim +/- pill didn't have — and
  because the dropdown already makes picking a specific key a single action, the main reason a
  quick-access shortcut existed for the old increment-by-one control in the first place.

  Verified with two synthetic Node scripts run directly against the real functions (not mocks).
  The first, against `transposeSong` alone: a real tokenized chart's `+0` returns the identical
  object; `+12` (a full octave) leaves every bar and the key completely unchanged; `+2` correctly
  shifts a chord's root and the printed key while leaving its quality suffix untouched; `-1` and
  `+1` land on the expected natural/flat-spelled names (`B`, `Db`); `+6` specifically lands on
  `F#`, not the enharmonic `Gb`, confirming the deliberate exception in `PREFER_FLAT`; a slash
  chord's bass note transposes correctly and stays a slash chord; and `-13` produces bar-for-bar
  identical output to `-1`, confirming the octave wrap. The second, against `KEY_NAMES`/
  `keyPitchClass` and the exact delta calculation `ChordCharts.tsx` now does: `KEY_NAMES` is the
  expected 12-entry list in order; `keyPitchClass` correctly reads `"C"`/`"Bb"`/`"F#-"` (a minor
  suffix doesn't throw off the tonic) and falls back to `0` for an empty or garbage key string
  rather than throwing; picking each of the 12 `KEY_NAMES` options from a chart in "Bb" computes a
  delta that lands `transposeSong` on exactly that target key, for all 12; and re-selecting the
  chart's own key (picking "Bb" from a chart already in "Bb") is a true no-op — the identical
  object back, not just equivalent content. `tsc`, `eslint`, and `next build` all pass. **Not
  verified**: how the transposed chart actually looks rendered (whether `Db`/`F#` etc. read
  clearly through `ChordLabel`'s existing accidental glyphs, which were only ever exercised
  against an original chart's own accidentals before now) or whether the dropdown itself opens/
  positions sensibly from inside the "Display" panel in a real browser — this sandbox still has no
  working browser, same caveat as everything else UI-shaped in Chord Charts.

  **sheddex's own chart-link format, and a from-scratch chart builder** (per a direct request:
  "make a custom way of representing chord charts in a string kinda like the irealpro links... if
  I paste an ireal pro playlist link into there it should still worki but I dont want it to say
  anywhere that you can do that... create a tool within the chord chart page to create chord
  charts"). Three pieces:
  - `lib/chartString.ts` — `encodeChartString`/`decodeChartString`, a `sheddex://<base64 JSON>`
    string encoding the exact same `IRealPlaylist`/`IRealSong`/`Bar` shape this app already parses
    an iReal chart into, rather than inventing a second token grammar to mimic iReal's own scrambled
    encoding — "kinda like the irealpro links" in that it's one opaque, copy-pasteable string, not
    in how it's actually encoded underneath. UTF-8-safe via `TextEncoder`/`TextDecoder` +
    `btoa`/`atob` (not the deprecated `escape`/`unescape` trick), so a title/composer with accented
    characters round-trips correctly. `decodeChartString` is tolerant of a malformed individual
    song the same way `lib/profileTunes.ts`'s `resolvePublicTunes` already is — a bad entry is
    dropped (missing/wrong-typed fields fall back to sane defaults, e.g. a missing time signature
    becomes 4/4) rather than failing the whole import — and its own error message is deliberately
    generic, never naming iReal Pro, since it's the message a normal user actually sees.
  - **"Import a playlist" now reads this format first** (`ChordCharts.tsx`'s `parsePlaylistInput`):
    `looksLikeChartString` checks for the `sheddex://` prefix, and only if that doesn't match does
    it fall through to the *existing*, completely unmodified `parseIrealPlaylist` — a real iReal
    Pro link genuinely still works, exactly as before, but that fallback is now quiet on purpose:
    the panel's hint text, its textarea placeholder, and the generic catch-all error shown when
    *neither* parser recognizes the input were all rewritten to never mention iReal Pro or
    `irealb://` anywhere a user can see them (grepped the whole user-visible surface for both
    strings afterward to check for a leak, not just the obvious spots — caught and fixed one real
    one this way: `components/tools.tsx`'s `NAV_LINKS` description for this tool, "Import iReal Pro
    playlists...", shown in the sidebar/command palette, had the exact same problem and wasn't
    something a first pass over just `ChordCharts.tsx` would have caught). Code comments inside
    `lib/iRealPro.ts`/`ChordChart.tsx` explaining *why* the parser/renderer work the way they do
    still reference iReal Pro by name, deliberately — that's maintainer-facing, not the user-facing
    surface the request was actually about.
  - **`ChordChartEditor.tsx`** — the new "Create a chord chart" panel's modal, a from-scratch
    builder reached from its own button next to "Import a playlist." Deliberately scoped down from
    everything a pasted iReal chart can represent — no repeats, numbered endings, sections, or
    directives, just a flat ordered list of bars — per the request's own "doesn't need to be crazy
    right now... no need to make it perfect as long as the functionality is there." Metadata
    (title/composer/style/key/time signature) are plain fields; each bar is typed as one line of
    plain text in the *exact* iReal-style shorthand this app already uses everywhere else
    ("`C^7`", "`F-7`", "`Bb7#5/D`", "`NC`" for no chord, space-separated for more than one chord in
    a bar) — reusing the notation rather than building a second, structured per-field chord picker,
    so there's exactly one chord grammar in this app to learn, not two. Two new exports in
    `lib/iRealPro.ts` make this possible: `parseChordToken` (one token -> a `ChordSlot`, reusing
    the same `CHORD_RE`/`splitMain` `tokenizeChart` itself already uses, just applied to a
    standalone token instead of a parsing stream, with a `normalizeChordToken` uppercase-the-letter
    convenience for hand-typed input a pasted chart never needed) and `parseBarSlots` (one bar's
    space-separated tokens -> that bar's slots, silently dropping an unrecognized token rather than
    failing the whole bar, so one typo doesn't erase everything else already typed in that bar). A
    live preview renders the chart being built through the *same* `ChordChart` component every
    other chart in this tool uses — not a separate approximation of it — which doubles as the only
    validation feedback: a typo just doesn't show up as a chord in the preview, rather than a
    separate per-token error message. Two ways a built chart leaves the modal, both reachable from
    its footer: **Save to library** (calls the same `importSongs` "Import a playlist" itself uses,
    in a playlist named after the chart's own title — "every chart is in a playlist" holds the same
    way here as for anything else added to the library) and **Export as chart link** (reveals the
    `sheddex://` string in a read-only textarea with a Copy button, `navigator.clipboard.writeText`
    with no fallback — this app's first use of the Clipboard API, and a genuine platform-only
    choice: if permission is denied or the API's unavailable, the text is still visible and
    selectable by hand in the textarea, so there's no dead end, just a smaller convenience lost).
    Both require a non-empty title first (an inline error message, same shape as every other
    required-field validation already in this app, e.g. Community's own "Give this post a title.").

  Verified with two synthetic Node scripts run directly against the real functions (not mocks).
  The first, against `parseChordToken`/`parseBarSlots`: `"C^7"` and lowercase `"c^7"` both parse to
  the identical chord (confirming the uppercase normalization); `"Bb7#5/D"` correctly splits into
  root/accidental/quality/bass; `"NC"`/`"nc"` both parse as no-chord; a bare `"W7"` (iReal's own
  mid-chart "repeat the last chord" marker, meaningless with no previous-chord context here) is
  correctly rejected rather than silently becoming a chord with an invalid `"W"` root; garbage
  input returns `null` rather than throwing; and a bad token in the middle of a multi-chord bar is
  dropped while the good tokens on either side survive. The second, against
  `encodeChartString`/`decodeChartString`: a full song (multiple bars, a two-chord bar, a blank
  bar, accented-safe title/composer/key) round-trips through encode-then-decode byte-for-byte
  identical to the original; `looksLikeChartString` correctly recognizes the app's own output and
  correctly rejects both a real iReal-style `irealb://` string and arbitrary plain text (confirming
  the two formats stay genuinely distinguishable, not just informally); a non-matching string
  throws an error that was checked, by regex, to never contain the word "ireal" anywhere in its
  message; garbage base64 after a valid `sheddex://` prefix throws instead of crashing; and a
  payload with one well-formed song alongside a titleless object and a bare number correctly keeps
  only the one valid song, with its missing time signature defaulting to 4/4 rather than throwing.
  `tsc`, `eslint`, and `next build` all pass. **Not verified**: that a real iReal Pro link *itself*
  still parses successfully through the now-wrapped fallback path — `parseIrealPlaylist`'s own
  internals are completely untouched by this change (only wrapped in a try/catch one level up), and
  that function was already extensively verified against a real ~1,460-song forum playlist in an
  earlier session (see this tool's own bullet above), so there's no new risk introduced here
  specifically — but this sandbox has no real iReal Pro link on hand to re-run that exact check
  against after the wrapping. Also unverified, the same way everything else in this tool is:
  whether the Copy button's clipboard permission prompt (if a browser shows one) interrupts the
  flow at all, and whether typing chord shorthand by hand feels as easy as the request asked for —
  "as easy to understand as possible" is a UX claim this sandbox has no way to confirm by actually
  using the tool. (`ChordChartEditor`'s original bar-list/live-preview layout described here was
  superseded by the inline-on-the-chart redesign below, two direct follow-ups later.)

  **Layout fix** (a direct follow-up with a screenshot: "not so much space between the options and
  the chart... so like the other pages where everything is in a column in the center"): the options
  sidebar + chart row's own wrapper div had `xl:min-h-[calc(100vh-10rem)] xl:items-center` and no
  width cap — forcing the row to nearly the full viewport height and then vertically centering both
  columns inside it, which is what actually produced the huge gap above everything (the options
  column's real content height is nowhere near that forced minimum), not anything about
  `ToolLayout`'s own `topAligned` prop (already `true` here, and working correctly one level out).
  The uncapped width compounded it horizontally too: `ChordChart.tsx`'s own root div already caps
  and centers the rendered chart at `max-w-2xl` (a deliberate, unrelated design choice, left alone)
  within whatever box it's given, so with no cap on the *row* itself, that box stretched to the
  full remaining viewport width on a wide monitor and centered the chart far right of the
  left-hugging sidebar — exactly the dead space in the screenshot. Fixed by dropping the forced
  min-height and `items-center` (now `xl:items-start`, both columns just take their own natural
  height) and adding `mx-auto max-w-5xl` to the row — the same width split-layout tool pages
  already use for their own two-region (options + content, no side panel) case, `ToolLayout.tsx`'s
  own `xl:max-w-5xl` — so this now matches "the other pages" literally, the same number, not just a
  similar-looking one. Not a restructure into a single vertical column
  the way `layout="stacked"`'s own built-in options-below-content shape works for Slow Downer/
  Recorder (which this tool's custom Tunes/Import/Create/Display sidebar never actually used in
  the first place — `ChordCharts.tsx` passes `options={null}` to `ToolLayout` and builds its own
  layout entirely inside `children`) — the sidebar-beside-chart arrangement itself wasn't what was
  reported as broken, just the space around it, so that's the only thing this touched. `tsc`,
  `eslint`, and `next build` all pass. **Not verified**: how much of the gap this actually closes
  once seen rendered — the reasoning above is sound (traced both the vertical and horizontal cause
  to specific classes, not guessed), but this sandbox still can't render the page to confirm it
  matches what "like the other pages" was actually asking for.

  **The builder redesigned to type directly on the chart, plus a shared symbol keypad** (a direct
  follow-up: "make it so the chart builder is like when you maximise a chart and it lets you type
  directly on the chart with an add bar button on the right of the last bar... make a little
  keypad like the one on sibelius... for all the symbols"). The original version's separate
  bar-list-on-the-left / `ChordChart`-preview-on-the-right split is gone; bars now live in one grid
  built from `ChordChart.tsx`'s own exports (`COL_WIDTH`, `BAR_HEIGHT`, `chordFont`, `ChordLabel`,
  `FitChordRow`, `TimeSignatureGlyph` — all newly `export`ed, previously private to that file) so
  the editor *is* the chart, not a second approximation of one styled to look similar. Each bar
  (`BarCellEditor`) is one of two things: **not** the active bar, it renders its parsed chords
  through the exact same `ChordLabel`/`FitChordRow` the real chart uses (a faint centered dot if
  still blank); **is** the active bar, it's a plain-text `<input>` showing the raw typed shorthand
  instead — deliberately not auto-converting `^`/`h`/`o`/`#`/`b` into their pretty glyphs live
  while typing, which would fight the text cursor mid-keystroke (the same reasoning Guess the
  Chord's own answer field already settled on, now shared). There's always exactly one active bar
  (`activeIndex`, never `null` — a text-cursor-like "there's always a current position" model, not
  a nullable "maybe nothing's selected" one), which is also where the keypad inserts. Clicking a
  different bar, or pressing Enter, moves it: Enter in the *last* bar adds a new one and jumps
  straight into it (satisfying "an add bar button on the right of the last bar" — that button
  still exists, as a plain `+` sitting in the same flex-wrap row immediately after the last bar
  cell, but Enter is the faster path once you're already typing) — in any other bar, Enter just
  steps to the next one, so typing a whole chart can stay a straight "type, Enter, type, Enter..."
  line. Escape inside a bar's input deliberately `stopPropagation`s rather than bubbling up to this
  modal's own Escape-closes-everything handler — it only blurs that one bar, since losing an entire
  typed-out chart because Escape was meant to back out of one bar would be a bad trade the metadata
  fields above don't have to worry about (a stray Escape there closing the whole modal is
  unchanged, and fine — losing an empty Title field is a much smaller loss). Focusing the
  DOM `<input>` after `activeIndex` changes (adding a bar, or clicking a different one) can't
  happen in the same tick that sets it — the input doesn't exist yet, since the *previous* active
  bar is still the one rendered as an input until the next render commits — so a `focusIndexRef`
  plus a `useEffect` watching `[activeIndex, bars.length]` focuses it exactly once the render
  reflecting the change has actually happened — the same "the DOM doesn't have this yet the same
  tick `setState` was called" timing problem the keypad's own cursor-insertion (below) runs into
  for the identical reason, just solved with a `useEffect` here instead of a bare
  `requestAnimationFrame`, since this one has to wait for a full re-render (a different element
  appearing) rather than just a value settling inside an element that already exists.

  **`components/ChordSymbolKeypad.tsx`** is new, pulled out of Guess the Chord rather than built a
  second time: that trainer already had exactly this — a small grid of buttons for `-`/`^`/`o`/`h`/
  `+`/`#`/`b`/`/`/`sus`/`add`, each showing its `prettyQuality`-formatted glyph as the button face
  and inserting the plain iReal text at the field's current cursor position — per the request
  naming Sibelius's own on-screen keypad as the visual reference, now laid out as a fixed
  `grid-cols-5` (a deliberate small palette, not a loosely wrapping button cloud, closer to what a
  real keypad panel looks like) instead of the `flex flex-wrap` it used before. The component
  itself is purely presentational (`onInsert(key.insert)`, one callback) — *where* the text actually
  gets inserted is each caller's own job, since that differs: Guess the Chord always targets its
  one answer field, the chart builder targets whichever bar is currently active, and the underlying
  "insert at cursor position, wait a frame since the DOM `<input>` doesn't have the new value yet
  the same tick `setState` is called, then restore the caret right after it" logic is otherwise
  identical in both, copied from Guess the Chord's own already-working `insertSymbol` rather than
  reinvented. Extracting this shrank `GuessTheChord.tsx` enough that two pre-existing
  `eslint-disable-next-line react-hooks/purity` comments (documented elsewhere in this file, on
  `lockInRound`/`start` — the React Compiler's lint integration bails out of analyzing a
  large/complex component before it would reach that `performance.now()` call, the same false
  positive Guess the Interval's identical pattern still gets flagged for) became genuinely unused
  — `eslint` said so directly (`Unused eslint-disable directive`), not guessed — and were removed;
  Guess the Interval's own pair, in its own separate, still-large file, are untouched and still
  needed.

  A real correctness bug was caught in self-review (not by any tooling — this is plain JS logic
  `tsc`/`eslint` have no way to reason about) and fixed before this ever got used: `removeBar`
  originally just clamped `activeIndex` to the new bar count after a deletion
  (`Math.min(activeIndex, next.length - 1)`), which is right when the removed bar came *after* the
  active one but silently wrong when it came *before* — every later bar's index shifts down by one
  when an earlier bar is deleted, so a plain clamp leaves `activeIndex` pointing at the bar that
  now happens to sit at that old number, not the bar that was actually being edited (e.g. bars
  `[A,B,C,D]` with `C` active, deleting `A`, would silently leave `D` marked active instead of `C`
  tracking its new position). Fixed to shift `activeIndex` down by one specifically when the
  removed bar's index was less than it, verified with a small synthetic script checking all four
  relative orderings (removed-before-active, removed-after, removing the active bar itself, and
  the down-to-one-bar edge case) plus the existing clamp — all five pass.

  Verified: `tsc`, `eslint` (including confirming zero new warnings, and that the two now-stale
  `eslint-disable` comments were safe to remove rather than masking a real regression), and
  `next build` all pass; `git diff --stat` confirms `GuessTheChord.tsx` only shrank (its own
  keypad array and JSX replaced by one `<ChordSymbolKeypad>` call) rather than having any of its
  actual answer-grading logic touched. (The "two-column bar grid / live preview reads through
  `ChordLabel`/`FitChordRow` at natural unscaled size" description here was itself superseded by
  the next round below — see that one for the current design.)

  **Full page, sections, repeat barlines, codas, and genuine 4-bars-per-row** (a direct follow-up:
  "the create chord chart should not be a popup, it should take up the entire chord charts view...
  make it so I can have different sections (A, B, intro, Verse, etc...)... repeats... 4 bars per
  line just like how the regular charts show... I need to be able to put codas in"). Four changes,
  one underlying architectural decision:
  - **Not a popup.** `ChordCharts.tsx` now has an early `if (showEditor) return <ToolLayout...>
    <ChordChartEditor .../></ToolLayout>` branch that replaces its entire normal content area
    (Tunes/Import/Create/Display + the selected chart) with the builder, full width, rather than
    layering a `fixed inset-0` modal over it. `ChordChartEditor` itself lost its backdrop/panel
    shell entirely — it's now a plain in-page section.
  - **Sections, repeat barlines, and codas** — `Bar.section`/`startRepeat`/`endRepeat`/`coda` were
    always part of `lib/iRealPro.ts`'s own type (every pasted iReal chart can already carry them),
    just nothing in this app could ever *write* them before now. Each `EditableBar` in the builder
    gained those four fields (plus `isRepeatBar` for the "%" repeat-previous-bar mark — added
    alongside repeat barlines since the request named "repeats" twice, plausibly meaning both the
    `:‖` barline kind and the `%` mark, and both were equally cheap to add once the data model
    already supported them) and a small "Bar N" toolbar beneath the grid, bound to whichever bar
    is currently active, with a Section text field and toggle buttons for the rest — not per-cell
    controls, since there's no room for five extra toggles inside a single `COL_WIDTH`-wide cell.
    `toRealBar(eb)` converts one `EditableBar` into the exact same `Bar` shape a parsed iReal chart
    already produces; setting a `section` also sets `newRow: true`, the same thing a real `*A`/`*B`
    section token forces during parsing, so a new section always starts a fresh row here too.
  - **Genuine 4-bars-per-row, "just like the regular charts show."** The builder's bar grid used
    to be a loosely wrapping `flex flex-wrap` row (reflowing however many bars fit the available
    width); it's now built from `ChordChart.tsx`'s own `groupRows`/`Row`/`BarCell`/`BarContent` —
    the *exact* components the real chart renders with — reused wholesale rather than a second
    approximation of them, via two small, backward-compatible additions those take only when a
    caller actually passes them (`ChordChart.tsx`'s own top-level component never does, so its own
    rendering is completely unaffected): `Row` gained an optional `renderBarContent?: (bar, i) =>
    ReactNode` (override what's drawn *inside* one specific bar — the builder's "this bar is being
    typed into right now, show an `<input>` instead" case) and `trailing?: ReactNode` (one more
    raw grid item appended after a row's own bars — the builder's "Add bar" button, placed in
    whatever grid column is actually left over after the last bar, only ever passed for the real
    last row); `BarCell` gained a matching `content?: ReactNode` prop (`content ?? <BarContent
    bar={bar} />`). The practical effect: sections, repeat-barline dots, the coda symbol, and the
    time signature on bar 1 now all render through the *same* code that draws a real chart, not a
    hand-rebuilt approximation of each — reusing `BarContent` specifically (now exported) also
    means a bar's "%" repeat-mark Just Works with zero special-casing in the builder itself, since
    `BarContent` already handles `content.kind === "repeat"` on its own. `ChordLabel`/
    `FitChordRow`/`TimeSignatureGlyph` had briefly been exported for the *previous* round's own
    (now-replaced) grid — reverted back to private once nothing outside `ChordChart.tsx` needed
    them directly anymore, confirmed by grepping for every usage first rather than assuming;
    `REPEAT_SIZE`/`SYMBOL_SIZE`/`BADGE_SIZE` got the same treatment after briefly being exported
    "just in case" during this round and turning out unused too — same `grep` check both times,
    not guessed.

  The "Add bar" button still sits immediately after the last bar when that row has room for it
  (an explicit grid item at `gridColumn: lastRowBars.length + 1`, via `trailing`); when the last
  row is already full (exactly a multiple of 4 bars), it falls back to a plain button below the
  whole grid instead, since there's no column left to put it in.

  A real correctness bug was caught in review and fixed before use, the same way the previous
  round's `removeBar` one was: toggling the new "Repeat bar (%)" option on had also been set to
  `disable` the active bar's `<input>` — which, being a disabled `<input>`, silently stops
  receiving *any* keyboard events at all, including the Enter-to-advance-to-the-next-bar flow this
  tool otherwise relies on as its main way to move through a chart quickly. Fixed by leaving the
  input enabled (just visually dimmed, with a placeholder noting the typed text is ignored while
  "%" is on) rather than disabling it — `toRealBar` already prioritizes `isRepeatBar` over
  whatever's typed, so nothing is lost functionally by leaving it editable, and keyboard
  navigation keeps working. A React Compiler lint error was also hit and fixed in the same pass
  (`react-hooks/immutability`'s "Cannot reassign variable after render completes," on a `let
  rowStart` being mutated across a `.map()` to compute each row's global starting bar index) —
  rewritten as a pure `reduce` instead, verified against a synthetic script (run against
  `groupRows` itself, copied verbatim rather than imported, since that file can't be loaded
  standalone outside Next/React) checking four cases: a plain 6-bar chart splitting into rows of
  4 and 2 with the right starting offsets; a section set mid-row correctly forcing an early break
  and landing the section label on the right bar; an exactly-4-bar chart correctly *not* having
  room for the add-button in its own row; and a 5-bar chart correctly having room for it in the
  second row.

  Verified: `tsc`, `eslint` (zero warnings, including the compiler-lint fix above), and
  `next build` all pass; the row-grouping/offset math is confirmed correct by the synthetic script
  above. **Not verified**, the same as everything else in this tool's UI: whether building a chart
  with sections/repeats/codas, saving it, and seeing it rendered back through the real
  (non-editable) `ChordChart` actually looks right end to end — this sandbox still has no way to
  click through any of it, and that round-trip specifically (builder → saved song → real chart
  render) has never been seen, only reasoned through from both sides independently each rendering
  the same `Bar` shape correctly on their own.

  **Fill width** (a direct follow-up with a screenshot: the grid sat at its small natural size,
  left-aligned, with a wide empty gap to its right). Deliberate at the time — the previous round's
  own comment on this grid said it "doesn't run through `PageFit`'s scale-to-fit... so it can stay
  a stable, always-editable size" — but that traded away matching how the real chart actually
  looks, which is what "4 bars per line just like how the regular charts show" (the *previous*
  request) was already asking for. Fixed by wrapping the grid in `PageFit` itself
  (newly exported, `fitHeight={false}` — the exact same mode the normal, non-maximized `ChordChart`
  view already uses to fill its own container's width), rather than leaving it at natural
  `COL_WIDTH`-per-bar size. The "stays stable while typing" concern turned out not to be a real
  tradeoff: every bar cell is the same fixed natural size regardless of whether it's currently
  showing an `<input>` or rendered chord symbols, so the grid's *natural* width never changes as
  `activeIndex` changes — meaning the computed scale factor doesn't change either, so there's no
  jarring re-scale when clicking between bars, exactly as hoped going in rather than something
  separately verified. The "Add bar" fallback button (the one shown below the grid when the last
  row is already full) stays *outside* `PageFit`'s scaled box, as a plain sibling — same reasoning
  as the real chart keeping its own Maximize button outside the scaled area, so it stays one
  consistent, clickable size regardless of how much the chart itself is scaled up or down. `tsc`,
  `eslint`, and `next build` all pass. **Not verified**: whether a `transform: scale()`'d `<input>`
  genuinely behaves correctly for typing/clicking/cursor placement in a real browser — CSS
  transforms are supposed to leave hit-testing and focus entirely alone (the browser maps click
  coordinates through the transform matrix on its own, standard behavior, not something special
  being relied on here), but "supposed to" isn't "confirmed," and this sandbox has no way to
  actually click into a scaled input and find out.

  **Centering, the section badge, and one combined toolbar** (a direct follow-up with a
  screenshot): three separate fixes.
  - **Centering.** The previous round's `PageFit` fix made the grid *fill* the available width up
    to `MAX_SCALE`, but never addressed what happens once that cap is actually hit — `PageFit`'s
    `fitHeight={false}` content was still `left: 0`-anchored, so a scale capped below "fill the
    whole box" left it flush left with the leftover space stranded on the right, exactly the
    screenshot. Fixed by switching to `left-1/2` + `transform: translateX(-50%) scale(s)` — not a
    new technique, the *exact* same `left-1/2` + `translate(-50%, -50%) scale(s)` composition
    `fitHeight={true}` already uses one branch up, just without the vertical half. Considered (and
    rejected) switching `contentRef` out of `position: absolute` entirely in favor of ordinary flex
    centering, which would have been simpler to reason about — but that div being `absolute` is
    exactly what lets `fitHeight={false}` report an *explicit*, JS-computed height back onto its
    own box in the first place (`contentHeight` state); a non-absolute child would hand layout back
    to the browser, which sizes against the *unscaled* natural height, not the scaled one — wrong
    in both directions (too tall if shrinking, clipped if growing). Kept `absolute`, fixed only the
    anchor.
  - **The section badge.** The real chart's own section-badge CSS (`BarCell`, unchanged since this
    badge was built for single-letter `*A`/`*B` markers off a real iReal chart, which is all it
    ever had to render before free-text sections existed anywhere in this app) was a fixed
    `1.7em × 1.7em` square — exactly wide enough for one character, not "Intro." Typing a real word
    into it rendered truncated/overlapping text, the screenshot's "ntro." Fixed by dropping the
    fixed `width` in favor of `min-w-[1.6em]` + horizontal padding + `whitespace-nowrap`, so it
    still reads as a small square badge for a single letter but genuinely grows to fit a longer
    word instead of clipping it. This is a `BarCell` fix, not an editor-only one — it benefits a
    real pasted iReal chart too, if one of those ever has a longer section name, not just charts
    built here.
  - **One combined toolbar, and typing the section name on the chart itself.** The Bar-N toolbar
    (section/repeat/coda) and the chord-symbol keypad used to be two separate boxes; they're now
    one `bg-surface` panel, per "put all the things... all in the section with the chord
    qualit[ies]." Separately, the toolbar's own free-text "Section" field is gone — replaced by a
    single "Add section" / "Remove section" toggle, per "there's just a button to add section
    title and you type where the section title actually is in the chart." Typing itself now
    happens via a *third* optional addition `Row`/`BarCell` take only for this editor
    (`renderSection`, alongside the existing `renderBarContent`/`trailing`): when the active bar
    has a section, an `<input>` replaces the plain badge *in the badge's own on-chart position*
    rather than in a disconnected form field — the same "type directly on the chart" principle this
    whole tool is built around, now extended to section names. A new `hasSection: boolean` field on
    `EditableBar`, kept separate from the `section` text itself, is what actually makes this work:
    clicking "Add section" sets `hasSection: true` *immediately*, forcing the row break
    (`toRealBar`'s `newRow`) before a single character has been typed — without that, the bar
    wouldn't yet be the first bar of its own row, and the inline input (which, like the real badge,
    only ever renders on a row's first bar) would have nowhere correct to appear the instant it's
    added. Leaving the inline input blank and clicking elsewhere (its own `onBlur`) auto-reverts
    `hasSection` back to `false` instead of leaving a label-less, invisible row break behind.
    Enter/Escape in the section input confirm-and-blur rather than bubbling up to the builder's own
    Escape-closes-everything handler, the same reasoning as the chord input's own Escape handling.

  Verified with a synthetic script (run against `toRealBar`/`groupRows`, both copied verbatim
  rather than imported, same reason as every other test in this file that touches `ChordChart.tsx`)
  confirming the specific behavior the whole section-editing design depends on: setting
  `hasSection` with still-empty text forces the row break immediately, not just once text exists;
  typing a label afterward doesn't change the row shape, only the text; "Remove section" fully
  clears both fields (not just blanking the text) and merges the row back into the normal 4-per-row
  flow; and a section set on bar 0 specifically doesn't fragment the first row (nothing precedes it
  to break from), matching how a real chart's own first bar already behaves. `tsc`, `eslint`, and
  `next build` all pass. **Not verified**: how any of this actually looks and feels in a real
  browser, same as this entire tool — in particular, whether the inline section `<input>`'s
  deliberately small, badge-matching size is usable for actually typing into on a touchscreen, and
  whether the auto-focus-on-add / auto-cancel-on-empty-blur sequence feels natural rather than
  surprising when actually clicked through.

  **Two more fixes from the same follow-up round, caught against an actual screenshot**: the
  inline section `<input>` added above still had a *fixed* `w-16` width left over from an earlier
  draft, unlike the read-only badge's own `min-w-[1.6em]` auto-sizing right next to it — rendering
  as a conspicuously wide, mostly-empty orange pill for anything shorter than "Intro" (a single
  letter "F," the actual screenshot). Fixed by dropping the fixed width for the HTML `size`
  attribute (character-count-based intrinsic sizing, not a CSS width) plus the same `min-w-[1.6em]`
  the badge already uses, so it now genuinely grows with what's typed instead of a flat pill.
  Separately: Start repeat/End repeat had no glyph preview at all (just a plain text label), unlike
  Coda and "%" right next to them — and per the request, all four should look like the keypad's own
  glyph-on-top/caption-below keys, not the plain text pill they'd been styled as. Found the actual
  SMuFL glyphs for this — `repeatLeft` (U+E040) and `repeatRight` (U+E041), real engraved
  start/end repeat-barline marks, not a text stand-in — confirmed present in the bundled
  `Petaluma.otf` (`opentype.js` against the real font file, the same verification method used for
  every other SMuFL glyph this app relies on, not assumed from the spec alone) before using them.
  `BarToggle` now branches on whether a `glyph` was passed: with one (all four repeat/coda/%
  toggles), it renders the same stacked glyph-on-top/caption-below shape
  `ChordSymbolKeypad`'s own keys use; without one ("Add/Remove section," which has no symbol of
  its own to show), it stays the plain text-only pill. `tsc`, `eslint`, and `next build` all pass;
  the two new codepoint constants were confirmed to actually decode to U+E040/U+E041 via a direct
  script reading the real file bytes, not just assumed correct from how they were typed. **Not
  verified**: how the resized section input and the four restyled toggle buttons actually look
  once rendered — this sandbox still has no way to see either.

  **The glyph-toggle restyle made things worse, not better** (a direct follow-up with two
  screenshots: "this section just looks bad and is bad UX... also theres too much padding on the
  right of the section title"). Two real defects, both from the previous round:
  - `BarToggle` had branched into *two different button shapes* depending on whether a `glyph` was
    passed — "Add/Remove section" stayed the original single-line pill, while Start/End
    repeat/Coda/"%" became a taller, two-line "keypad key" shape (glyph stacked above a caption).
    Side by side in the same row, that's a visibly mismatched set of buttons at two different
    heights, not a redesign so much as an inconsistency the earlier change introduced — exactly
    what got called out. Fixed by collapsing back to *one* shape for every toggle: a single-line
    pill with an optional glyph beside the label, never above it — `BarToggle` no longer branches
    on `glyph` at all. A thin vertical divider was also added between the section toggle and the
    four repeat/coda/% toggles, grouping the row into two legible clusters instead of one
    undifferentiated line of five buttons.
  - The inline section `<input>`'s width was still being driven by the HTML `size` attribute
    (added two rounds ago to replace an even-worse fixed `w-16`) — `size` is only ever a rough,
    historically-per-browser approximation (based on several "0"-character widths plus its own
    baked-in slack), nowhere near tight enough, which is exactly what the second screenshot showed
    as visibly extra accent-colored background trailing a single-letter "A". Replaced with an
    explicit `width: calc(Nch + 1rem)` computed directly from the typed text's own length — `ch`
    units size against the current font's actual "0" character width, a real CSS sizing mechanism
    rather than an attribute with implementation-defined slack, and the `+ 1rem` accounts for the
    `px-1` padding on each side plus a little room for bold glyphs that render wider than a plain
    "0" — considerably tighter than before without working through actual rendered measurements
    this sandbox has no way to take.

  `tsc`, `eslint`, and `next build` all pass. **Not verified**, same as every visual change in this
  tool: whether the single consistent pill shape and the divider actually read as a coherent,
  well-designed row once seen, and whether the `ch`-based width calculation lands as tightly as
  intended across real fonts/browsers rather than just being *less wrong* than `size` was — this
  sandbox still can't render either to check.

  **Reversed again, this time toward the keypad's own look specifically** — a direct follow-up:
  "start repeat, end repeat, coda, and repeat bar should be styled exactly like the accidentals in
  the keypad are styled." `BarToggle`'s glyph case went back to `ChordSymbolKeypad`'s stacked
  glyph-over-caption shape — but copied from the keypad's *actual* classes this time
  (`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5`, glyph `text-base font-semibold
  leading-none`, caption `text-[0.6rem] leading-none`), not reconstructed from memory of what the
  earlier (reverted) attempt looked like, so it should now match precisely rather than
  approximately. One deliberate, noted deviation: the keypad's own keys are one-shot "insert"
  actions with no state of their own, so their caption is always `text-muted`; these four are real
  on/off toggles, and that grey reads poorly against the accent-colored background an active
  toggle gets — checked the actual `--muted`/`--accent` color values in `app/globals.css` rather
  than guessing, in both light and dark mode — so the caption only stays `text-muted` while off,
  switching to the button's own `text-accent-foreground` once on. "Add/Remove section" is
  untouched (no glyph of its own, and the request named the other four specifically) — back to
  being visually a different shape from its four neighbors in the same row, which is exactly what
  the *previous* round's fix had tried to avoid; left as-is anyway, since this request is explicit
  about wanting the keypad's exact look for those four specifically, not uniformity across the
  whole row as its own goal. `tsc`, `eslint`, and `next build` all pass. **Not verified**: whether
  this now genuinely looks identical to the keypad below it, or whether "Add/Remove section"
  sitting at a different height next to it reads as awkward again once actually seen — this
  sandbox still has no way to render either.

  **The repeat glyphs themselves turned out too tall for that size** — confirmed directly, with a
  screenshot: `repeatLeft`/`repeatRight` (Start/End repeat's own SMuFL glyphs — real, full-height
  barline-and-dots marks, unlike the keypad's own compact `prettyQuality` glyphs) visibly
  overflowed the button's rounded-rectangle outline at the same `text-base` size those use. Per
  explicit direction, fixed by adding more vertical padding (`py-1.5` → `py-2.5`) rather than
  shrinking the glyph — applied to all four buttons in the row (Start/End repeat, Coda, "%"), not
  just the two repeat ones, so the row stays one consistent button size rather than three short
  buttons next to two taller ones. `tsc`, `eslint`, and `next build` all pass. **Not verified**:
  whether `py-2.5` is actually *enough* extra room for these particular glyphs' real rendered
  bounds, or whether Coda/"%" (which didn't have this problem) now just look slightly
  over-padded relative to their own, more modestly-sized glyphs — this sandbox still can't render
  any of it to check either way.

  **Padding alone didn't fix it — the glyph itself was the wrong one** (reported directly: "repeat
  symbols still over flow"). Checked what the previous round only assumed: `repeatLeft`/
  `repeatRight`'s actual bounding box in the bundled font (`opentype.js` against the real file, not
  guessed), and they're ~2.5x a normal glyph's height — SMuFL draws them to span most of a 5-line
  music staff, a full engraved barline, not something meant to sit inside a small UI button at any
  amount of padding. Fixed properly this time by switching glyphs entirely rather than padding
  around the wrong one: `leftRepeatSmall`/`rightRepeatSmall` (U+E04C/U+E04D) are SMuFL's own
  purpose-built compact variants, explicitly for "repeat sign within bar" use — confirmed at
  roughly normal text-glyph proportions (comparable to the "%" toggle's own `repeat1Bar`, which
  never had this problem) before switching, the same way every SMuFL glyph choice in this app has
  been checked against the real font rather than assumed from the spec's glyph name alone. With the
  actual cause fixed, the padding compensation from the previous round was reverted
  (`py-2.5` → `py-1.5`, matching `ChordSymbolKeypad`'s own keys exactly again) — it was only ever
  papering over the wrong glyph, not something these buttons needed on their own merits.
  `tsc`/`eslint`/`next build` all pass, and the two new codepoints were confirmed to actually
  decode to U+E04C/U+E04D via a direct script reading the real file bytes, the same check applied
  to every codepoint constant added this session. **Not verified**: whether these are now
  genuinely the right visual size next to Coda/"%"'s own glyphs, or whether a glyph swap this
  sandbox can reason about only through bounding-box numbers actually reads correctly once seen —
  numbers matching expectations is not the same as an eye confirming it.

  **The metrics were fine; the glyph itself still didn't read as a repeat sign** (reported
  directly, with a screenshot — `leftRepeatSmall`/`rightRepeatSmall` fit the button correctly this
  time, size wasn't the problem anymore, but whatever they actually look like at that size clearly
  isn't recognizable as one). Rather than try a *third* SMuFL codepoint blind — this sandbox has no
  way to render any of them to check before shipping, which is exactly how the previous two rounds
  both shipped something that then had to be reported back as wrong — this one sidesteps font
  rendering entirely: a new `RepeatGlyph` component (`ChordChartEditor.tsx`) builds the icon from
  plain CSS, a thick `bg-current` bar plus two small `bg-current` dots (ordered bar-then-dots for
  "left"/start, dots-then-bar for "right"/end), directly mirroring the real chart's own
  repeat-barline convention — `ChordChart.tsx`'s `RepeatDots` plus its thick border — instead of
  approximating it through an unfamiliar engraving glyph whose actual appearance can't be checked
  from here. `bg-current` means it still automatically follows the button's own current text color
  (muted while off, `accent-foreground` once on), the same behavior the SMuFL glyph had. `BarToggle`'s
  `glyph` prop is now `string | React.ReactNode` rather than just `string`, to accept this directly
  — a string still renders through `chordSymbolFont` exactly as before (Coda and "%" are
  untouched), while a node (`RepeatGlyph`) renders as-is. `tsc`, `eslint`, and `next build` all
  pass. **Not verified**, same as the two attempts before it: whether this actually looks right —
  but unlike those, this doesn't depend on a font's own rendering being legible at a given size at
  all, only on basic CSS box/color primitives this sandbox can at least reason about with full
  confidence, even without being able to see the result.
- **Random Sticking Warmup** (displayed name, renamed a second time later in this same session's
  own history — see that round's own entry, well below — for why; the route itself is now
  `/random-sticking-warmup` too, per a later direct request specifically to change *that* — see
  this section's own last entry — but the component/file names are still
  `components/StickControl.tsx`, `lib/stickControl.ts`, `lib/stickControlEngine.ts`,
  `components/StickControlStave.tsx`, and the synced-settings key is still
  `"jam-practice-stick-control"`, untouched by any of these renames, same as this app's own
  established pattern of a tool's display name/route diverging from its internal identifiers — see
  the "Polyrhythm Metric Modulation Metronome" bullet below for another example) — the first tool
  in a new **"Drummers"** sidebar category
  (`components/tools.tsx`'s `CATEGORIES`, between "Practice" and "Audio"; `DrumIcon` is both the
  category icon and the tool's own `NAV_LINKS` icon). A drummer's
  warmup tool modeled on George Lawrence Stone's *Stick Control for the Snare Drummer*: a
  metronome counts you in, then a few bars of a random sticking pattern repeat a set number of
  times (20 by default — "the author recommends that each rhythm be practised 20 TIMES WITHOUT
  STOPPING," per the book's own "How to Practise" page) while the actual R/L notation is drawn out
  live, same as the book's own pages. Built from a photo of the book's "Single Beat Combinations"
  page plus, after a direct follow-up, the entire scanned PDF (`file:///home/jack/Desktop/
  stickControl.pdf`, 48 pages, image-only/no text layer) — read page by page via the `Read` tool's
  own image support (a PDF page range first tries `pdftoppm`, not installed here, but reachable the
  same way this session's Home-page work found a working Chromium: `nix shell
  nixpkgs#poppler-utils`, user-writable, no root needed — rendered all 48 pages to PNG once, then
  read the relevant ones directly).

  **The data**: `lib/stickControl.ts`'s `SINGLE_BEAT_COMBINATIONS` is all 72 of the book's own
  "Single Beat Combinations" exercises (pages 5-7 of the book), each transcribed as its full
  printed 16-stroke line — not a 4-stroke "cell" assumed to just repeat, since several of the
  book's own exercises aren't actually one cell tiled four times (e.g. #16 "RLRL RLRR LRLR LRLL"
  rotates through four related-but-distinct groups; #25 "RRLL RLLR LLRR LRRL" rotates the same four
  letters by one position each group) — storing the literal line sidesteps having to guess a
  shorter generative rule correctly for every one of the 72. Transcribed by reading the scanned
  page images directly (not OCR'd), carefully but by eye — treat it as a solid best-effort, not a
  guaranteed letter-perfect match to the physical book; a slip in one or two of the 72 would be a
  minor cosmetic risk for a randomizer, not a functional bug, but worth a spot-check against the
  book if exact fidelity to one specific numbered exercise ever matters. The book's own "Triplets"
  page (3-stroke groups) was noticeably harder to read confidently letter-by-letter than the much
  larger, clearer Single Beat Combinations pages — rather than risk silently-wrong "book" data,
  triplet patterns are instead procedurally generated from `TRIPLET_CELLS`, a small set of
  musically-sensible 3-stroke cells (alternating, plus both "broken double" shapes), in the same
  spirit as the book's own triplet exercises without claiming to reproduce a specific numbered one.

  **Stroke rolls** (5/7/9/11/13-stroke) were a direct follow-up request ("I also want to add 9
  stroke roll and 7 stroke roll... have it alternate between an 8th note pattern... and a roll"),
  added while the PDF was still being fetched — not from Stick Control at all (the book's own
  "rolls" are ornament/buzz flourishes within a beat, a different notation problem), but the
  standard PAS rudiment rolls. `rollSticking(strokeCount, startHand)` is a one-line closed-form
  generator, not hand-typed data: every odd-length roll's sticking is just the first N letters of
  the infinite alternating-double-stroke stream "RRLLRRLLRRLL..." — the first 5 give the real
  5-stroke roll (RRLLR), the first 9 the real 9-stroke roll (RRLLRRLLR), etc. — confirmed against
  the standard rudiment stickings for 5/7/9 by hand before relying on it for every other size too.

  **Pattern generation** (`generatePattern`, pure, no React) has four modes (`PatternType`): Single
  beat combinations (16th notes, from the book — random, a specific chosen exercise number, or
  procedurally generated instead of the book's own list); Triplet combinations (8th-note triplets,
  `TRIPLET_CELLS`); Stroke rolls (whichever roll sizes are enabled, random start hand); and
  Alternate: strokes & rolls (the follow-up's own ask — bars alternate, 1st/3rd/... a single-stroke
  exercise, 2nd/4th/... a roll, built from the exact same two generators rather than a third one).
  A cell (whether a literal 16-stroke book line, a 3-stroke triplet, or a formula-built roll) fills
  however many note-slots a bar actually needs (`beatsPerBar * subdivision`) by simply tiling
  itself from the top, restarting mid-hand at a bar seam if it has to — exactly how the book's own
  exercises already read at their own 2-measure seam, not an artifact introduced by tiling.

  **Playback** (`lib/stickControlEngine.ts`) is its own plain module-level engine, the same
  "survives page navigation, not tied to any component's mount lifecycle" shape
  `lib/metronomeEngine.ts`/`lib/metricModulationEngine.ts` already established — but it doesn't
  route through `lib/clickEngine.ts`'s generic `startClickEngine`, since that engine's
  `ClickSettings` has no concept of "which hand is this stroke" or "which repeat of the phrase am I
  on," both of which this tool needs (for the "distinct click per hand" option, and for knowing
  when the repeat count — or the whole exercise — is finished). It's instead its own small
  `setInterval` lookahead scheduler (same shape as `startClickEngine`'s own, reusing that file's
  exported `scheduleClick` helper and `CLICK_SOUNDS` palette), counting everything in "slots" of
  `60/bpm/subdivision` seconds. A play-through is one count-off (only before the *first* repeat,
  not before every loop back to bar 1 — the same "count a metronome in once" convention a real
  practice session uses) plus `repeats` copies of the pattern's own bars back to back. Three click
  modes: a steady one-click-per-beat pulse (default — the notation is what guides the sticking, the
  click just keeps time); a click on every stroke; and "distinct pitch per hand," which clicks a
  different pitch for every R vs. L stroke (reusing the current sound's own `accentFreq`/`subFreq`
  rather than a hardcoded pair, so the Tone picker still changes its timbre) — so the sticking is
  audible even without watching the music. "New pattern when done" (off by default) auto-advances
  to a freshly generated pattern (with a fresh count-off) once the repeat count finishes, instead of
  stopping — a continuous warmup session cycling through exercises, for anyone who wants it; off by
  default stays closer to the book's own "practise this one, then consciously move to the next"
  instruction. A real scheduling bug was caught and fixed before this ever shipped: the first
  version only scheduled `stopStickControl()` via a `setTimeout` once the repeat count was reached,
  but left the `setInterval` itself running in the meantime — a slower-firing stop could race a
  later tick into scheduling *one extra repeat's* worth of clicks first. Fixed by setting a
  `stopRequested` flag and clearing the interval immediately once the final repeat is reached,
  before the delayed `stopStickControl()` call ever fires.

  **Notation** (`components/StickControlStave.tsx`) is this app's first use of an actual sheet-music
  library — `vexflow` (MIT, a plain `pnpm add`), reused rather than hand-rolling a drum-notation
  renderer the way e.g. `ChordChart.tsx` hand-rolls chord notation, since the request specifically
  asked for "some kind of sheet music library." Each bar gets its own small `Renderer`/`Stave`
  (a percussion clef on the first bar only) rather than one wide multi-bar stave — simpler to lay
  out responsively (a `grid-cols-1 sm:grid-cols-2` grid, two bars per row on wider screens, echoing
  the book's own two-exercises-per-line pages) and it's what makes highlighting "the bar currently
  playing" cheap: a CSS ring class on that one bar's own wrapper div, not a full VexFlow re-render
  of the whole line on every tick (redrawing a full SVG 8+ times a second at a brisk tempo would be
  real, avoidable jank for a highlight a plain class swap already gives for free — the draw effect
  is deliberately keyed only on the pattern's own shape/content, never on playback position). Each
  stroke is a `StaveNote` on the middle line with an `Annotation` (the R/L letter) attached below
  it, beamed in groups of `subdivision` (4 for 16th-note/roll patterns, 3 — wrapped in a `Tuplet` —
  for triplets).

  A real, caught-and-fixed bug here too: the first version picked each bar's SVG pixel width from a
  flat per-note guess (`NOTE_WIDTH = 34`), which badly undershot the actual space VexFlow's own
  `Formatter` needs once a text `Annotation` is attached to every note (the formatter won't compress
  tickables below their own natural minimum width, whatever target width it's asked to justify
  into) — caught directly in this session's own browser verification (see below): roughly the last
  half of every 16-note bar was silently clipped off the right edge of its own SVG, invisible rather
  than erroring. Fixed by measuring first: `Formatter.preCalculateMinTotalWidth` computes the
  notes' own real minimum width (now that annotations are actually attached) *before* the stave/SVG
  are ever sized, and that measured width — not a guess — drives both the `renderer.resize()` call
  and the final `Formatter.format()` pass. The SVG itself also gained a `viewBox` plus `width: 100%`
  with the measured pixel width as a `max-width` cap, so a bar scales *down* to fit a narrower grid
  cell (phone width) but never stretches *up* past its own natural size next to a shorter sibling
  bar (e.g. a 3-note triplet bar next to a 16-note one) — a second overflow problem the first fix
  alone wouldn't have caught, found by actually looking at a wide-viewport screenshot, not reasoned
  through in the abstract.

  **Verified in a real browser** this same session, using the nix-chromium + `playwright-core`-over-
  CDP setup documented elsewhere in this file: the page renders with zero console errors at both a
  1400px desktop width and a 390px phone width (confirmed no horizontal page scroll at phone width
  either); all four pattern types (single/triplet/roll/alternate) render correctly with zero errors
  when switched between live, including triplet brackets and roll-size toggle buttons
  showing/hiding appropriately; the transcribed data renders correctly end to end — spot-checked
  several on-screen stickings directly against `SINGLE_BEAT_COMBINATIONS`' own source array (e.g.
  "Exercise 29" showing exactly `LLRRLLLRLLRRLLLR`) and the roll formula's tiled output against
  `rollSticking`'s own math by hand (a 9-stroke roll's 16 displayed letters matched the predicted
  `LLRRLLRRL` + wrapped continuation exactly); clicking Start shows "Count-off…" then "Repeat 1 of
  20" with exactly one bar carrying the active-highlight ring at a time; and clicking Stop/changing
  options mid-play doesn't error. `tsc`, `eslint`, and `next build` all pass with zero warnings.
  **Not verified**: how the click actually sounds at a real tempo (especially "distinct pitch per
  hand" — whether R vs. L is genuinely easy to tell apart by ear) and whether "New pattern when
  done" actually auto-advances cleanly through several exercises in a row over a longer real
  session — this session's own browser checks covered the visual/structural side thoroughly but
  only sampled a few seconds of actual audio playback at a time, not a full 20-repeat run.

  **A real round of direct feedback followed, all four points genuine bugs or missing features,
  not UI polish**: "the notes aren't correct at all... it kinda looks like theres two notes on top
  of each other"; "the pattern type option does something but it doesnt show the rolls at all,
  its essentually the same as the single beat combinations"; "i never see 8th notes for any of the
  settings, the beginning pages of stick control usually have 4 8th notes followed by a roll and
  repeat that"; and "the bars shown should always just be the minimum amount of bars required to
  complete the full pattern with the minimum repeat having to fill up a full bar." Each was a real,
  confirmed defect or gap, not a misunderstanding — found and fixed in order:

  1. **The doubled-note look** was a genuine VexFlow draw-order bug: the first version created
     `Beam`/`Tuplet` objects *after* calling `voice.draw()`, but `StaveNote.draw()` only skips
     drawing a note's own individual flag once a `Beam` has already claimed it (via `Beam`'s own
     constructor, which calls `setBeam` on each note) — drawing the voice first meant every note
     got its own automatic flag rendered, and the beam lines were then drawn on top, producing
     exactly the "two notes on top of each other" look reported. Fixed by creating the beams/
     tuplets (but not yet drawing them) before `voice.draw()`, matching the order every real
     VexFlow example uses, and only drawing the beam/tuplet shapes themselves afterward.
  2. **"Doesn't show rolls at all"** turned out to be real too, once the underlying cause was
     found rather than assumed away: with only 1 bar ever shown (the original fixed default), a
     roll pattern and a single-beat pattern genuinely *did* look structurally identical — same
     note durations, same beaming, the only difference was the letter sequence, easy to miss at a
     glance, and compounded by the bars-auto-compute bug below, which (before it was fixed) could
     leave a roll showing fewer bars than it needed to look distinctly roll-like at all.
  3. **"I never see 8th notes"** was accurate — nothing in the first version ever rendered at
     8th-note duration outside of 8th-note *triplets* (a different thing). Fixed with a new,
     orthogonal "Note value" option (8th/16th, `lib/stickControl.ts`'s `NoteValue`/
     `NOTE_VALUE_OPTIONS`) that applies to the "single," "roll," and new "strokes, then a roll"
     pattern types (triplets stay fixed at 8th-note triplets, where the option doesn't apply and
     is hidden). And per "the beginning pages... usually have 4 8th notes followed by a roll and
     repeat that," the old whole-bar "Alternate: strokes & rolls" type (which alternated an entire
     bar of straight strokes with an entire bar of roll) was replaced with **"Strokes, then a
     roll"** — a single self-contained bar that's *half* straight strokes (from the same book-
     exercise/procedural source as "single") and *half* a roll, looped as one repeating bar — at
     the default 4 beats/bar + 8th notes, that's exactly "4 eighth notes followed by a roll,"
     matching the book's own earliest roll pages structurally (even though, as a deliberate
     simplification, the roll half is still written at the *same* note duration as the straight
     half rather than compressed into faster notes the way a real engraved roll often is — getting
     genuine mixed note-durations correct inside one VexFlow `Voice` without a live browser to
     iterate against felt like a real risk of silently shipping something broken in a way neither
     `tsc` nor a screenshot would catch as clearly as a wrong letter would).
  4. **"Bars shown should always just be the minimum"**: `bars` was removed from
     `StickControlOptions` entirely — it's never user-set now, only computed. `minimalBarsFor
     (cellLength, slotsPerBar)` (new in `lib/stickControl.ts`) returns the fewest whole bars after
     which the repeating cell both fills every bar *and* lands its last stroke exactly on the
     cell's own final note, not mid-repeat — `cellLength / gcd(cellLength, slotsPerBar)`. A
     16-stroke book exercise at 16 slots/bar needs exactly 1 bar; the same exercise at 8th notes
     (8 slots/bar) needs 2; a 5-stroke roll at 16 slots/bar needs 5 (5×16 = 80 = 16 clean repeats
     of the cell); "strokes, then a roll" is a self-contained composite per bar by construction,
     so it's always exactly 1. The "Bars shown" stepper is gone from the UI, replaced with a
     `Hint` explaining the rule. **Fixing this surfaced a second, related bug that the original
     single-bar default had been silently hiding**: multiple bars were each independently calling
     `tileTo(cell, slotsPerBar)` from the *start* of the cell, so bar 2 didn't continue where bar
     1 left off — it just repeated bar 1's own content verbatim, making every bar past the first
     redundant and defeating the entire point of computing "how many bars until this realigns."
     Caught by this session's own re-verification (a 7-stroke roll's 7 bars all showing the
     identical 8 letters), not reasoned through in the abstract — fixed with a new `tileToBars`
     that tiles *one continuous stream* across all bars combined and then slices it into per-bar
     chunks, so bar 2 genuinely picks up where bar 1's cell left off.

  **Re-verified in the same real browser setup after all four fixes**: sixteenth notes now render
  as a single clean notehead with a proper double beam (no more doubled-flag look), confirmed at
  both 16th and 8th note value; switching to "Stroke rolls" with the default 7-stroke roll
  correctly rendered all 7 bars, each with genuinely different, continuously-advancing letters
  (checked by hand against `rollSticking`'s own cyclic math — bar 2's letters are exactly where
  the cyclic stream is at slot 8, not a restart); "Strokes, then a roll" correctly rendered one
  bar, half straight strokes and half roll; triplets still render correctly (unaffected by any of
  this, confirmed) with the Note Value picker correctly hidden for that type; and switching
  "single" between 8th and 16th note value correctly changed the bar count from 2 to 1 live, with
  zero console errors throughout. `tsc`, `eslint`, and `next build` all pass. **Still not
  verified**: real audio playback timing/feel for the new composite "strokes, then a roll" type,
  and how exactly 11- or 13-stroke rolls (which need 11 or 13 bars to realign at the default
  meter) actually look/scroll in practice — not specifically checked this round, though the same
  responsive grid that handled 7 bars cleanly should handle more.

  **Reported directly, with reference screenshots of the app and several more scanned book pages**
  ("all the options for pattern type except for the triplets are essentially the same... you
  should really be pulling from these stick control pages"): correct, and traced to the actual
  root cause rather than patched at the symptom. A roll's double-stroke pairs (RR/LL) were being
  rendered at the *same* note duration as a plain single stroke — musically and visually, that's
  not a roll, it's just another evenly-spaced sticking pattern with different letters, which is
  exactly why switching "Pattern type" to "Stroke rolls" didn't look (or, implicitly, sound) any
  different from "Single beat combinations." Confirmed directly against the book itself: page 11
  ("Short Roll Combinations — Double Beat Rolls") labels a burst of 9 notes compressed into
  roughly one beat's space as a "9 stroke open roll" — the exact letters
  `rollSticking(9, "R")` already produced (RRLLRRLLR), just written compressed/faster, not evenly
  spaced.

  Fixed by rebuilding how a roll's letters turn into renderable notes, not by re-tuning the
  letters themselves (those were already correct). New in `lib/stickControl.ts`: `NoteSlot =
  { hands: Hand[] }`, one playable position — length 1 is a normal-speed stroke, length 2 (always
  the same hand twice) is a "diddle," two notes at *double* speed occupying that one slot's worth
  of time. `rollUnits(strokeCount, startHand)` regroups `rollSticking`'s flat letters into these:
  every same-hand pair becomes one diddle unit, the one unpaired trailing letter (every offered
  roll size is odd, so there's always exactly one) becomes a normal unit — a 9-stroke roll is
  therefore 5 units (4 diddles + 1 single), not 9 equal slots. `GeneratedPattern.bars` changed
  from `Hand[][]` to `NoteSlot[][]` across the board (single/triplet patterns just wrap each
  letter as a length-1 slot, so none of their own logic had to change); `tileTo`/`tileToBars`
  became generic over the slot type so the same tiling/continuation logic serves both. Bar-count
  math (`minimalBarsFor`) now operates on a roll's *unit* length, not its raw stroke count — a
  7-stroke roll is 4 units, so it realigns with the bar line after just 1 bar now, not 7; a
  5-stroke roll is 3 units → 3 bars; a 9-stroke roll is 5 units → 5 bars — all noticeably more
  reasonable than before, and a direct side effect of fixing the real bug rather than a separate
  tuning pass.

  `components/StickControlStave.tsx` renders a diddle slot as two `StaveNote`s at double speed
  (base "16" → diddle "32", base "8" → diddle "16") grouped into the *same* per-beat beam array a
  plain slot would occupy — `Beam` then computes the correct multi-level (primary + secondary)
  beaming for whatever mix of durations lands in a group on its own, the same as any real
  engraving with mixed note values under one beam; confirmed directly by reading the rendered
  SVG's actual beam-path geometry (distinct secondary-beam segments of varying width exactly where
  the diddle pairs are), not just assumed from the code. A second, smaller fix landed in the same
  pass once the first version's result still read as too subtle: only the *first* note of a
  diddle pair gets an annotation now (showing both letters together, e.g. "RR"), not one full
  annotation per note — freeing the horizontal space a second annotation would otherwise force let
  the pair visibly tighten up, and it's also a closer match to how the book itself writes a roll's
  letters as one compact run ("RRLL RRLL R") rather than one isolated letter per note. Caught by
  directly measuring notehead x-positions in the rendered SVG (near-uniform ~29px gaps before this
  fix, clearly varying 29-37px gaps after it, with the diddle pairs visibly tighter) rather than
  judging it by eye alone.

  The book's own "Triplets" page (8) was re-examined at full resolution per the same request, but
  deliberately *not* re-transcribed into literal per-exercise data — re-reading it carefully
  confirmed the same handful of 3-stroke cells this tool already generates procedurally (RLR, RRL,
  LLR, etc.) are exactly what that page's own 24 exercises are built from, and triplets were the
  one pattern type explicitly *excluded* from "all the options... look the same" — so the existing
  procedural approach was already doing its job; the real, confirmed defect was entirely in how
  rolls were rendered, not in triplet data fidelity.

  **Re-verified end to end in the same real-browser setup**: a 7-stroke roll (now genuinely 4
  units) renders as one bar with two visible diddle pairs ("RR", "LL") and a single resolving
  note, with distinct secondary beaming over just the pairs and tighter spacing between them,
  unmistakably different from a plain pattern at a glance; "Strokes, then a roll" renders one bar
  that's visibly two different textures — evenly-spaced single strokes on the left half, bunched
  diddle pairs on the right — with zero console errors; all four pattern types still switch
  cleanly with correct labels; Start/Stop and the "Repeat 1 of 20" progress label still work;
  phone-width (390px) still shows no horizontal overflow. `tsc`, `eslint`, and `next build` all
  pass. **Not verified**: how this actually sounds (the playback engine still clicks once per
  *slot*, not per physical stroke within a diddle — a deliberate, noted simplification, since the
  visual fix was the one directly reported) and whether an 11- or 13-stroke roll's now-smaller but
  still-multi-bar realignment (6 and 7 bars respectively) reads cleanly at a glance — not
  specifically re-checked this round.

  **The diddle-pair model above was itself wrong, caught by a direct, concrete correction** ("umm
  no... single stroke combinations should be all 8th notes. double stroke roll should be 4 8th
  notes then 8 16th notes, and so forth"), with cropped reference images of the exact book pages
  this should match. Re-reading page 11 ("Short Roll Combinations — Double Beat Rolls") at full
  resolution confirmed it: a roll segment's strokes are all written uniformly at *double* the
  surrounding note value — not an alternating mix of double-speed pairs and normal-speed singles
  the way the previous round's `rollUnits` model assumed. Rebuilt a third time, this time from the
  user's own explicit worked example rather than re-derived from the scan a third time:
  `lib/stickControl.ts`'s `NoteCell = { hand: Hand; fast: boolean }` replaced `NoteSlot` — every
  cell is exactly one stroke, `fast` meaning "written at double speed," with no per-letter
  diddle/single distinction at all. `GeneratedPattern.bars` is `NoteCell[][]`.
  - **"Single beat combinations" now defaults to 8th notes** (`DEFAULT_SETTINGS.noteValue = 8` in
    `components/StickControl.tsx`, still changeable) — per "should be all 8th notes."
  - **"Stroke rolls"** now renders its *entire* sticking at double speed (`toFastCells`), tiled
    against a doubled grid (`slotsPerBarFast = slotsPerBar * 2`) — a 9-stroke roll at the default
    8th-note meter plays as 16th notes throughout, not a mix.
  - **"Strokes, then a roll"** now splits by *beats*, not raw slot count — exactly half the bar's
    beats (`Math.floor(beatsPerBar / 2)`, at least 1) are straight strokes at the normal note
    value, the rest are a roll at double speed — at the default 4 beats/bar and 8th notes, that's
    `straightSlots = 2 beats × 2/beat = 4` normal 8th notes, then `rollSlotsFast = 2 beats × 2/beat
    × 2 = 8` double-speed 16th notes: literally "4 eighth notes, then 8 sixteenth notes," matching
    the request's own numbers exactly, not just in spirit.

  `components/StickControlStave.tsx`'s beam grouping changed from a fixed `i % subdivision` cell
  count to accumulating *time* (a normal cell contributes 1, a `fast` cell 0.5) until a whole
  beat's worth is reached — necessary because a bar can now mix normal-speed and double-speed
  cells (a straight segment next to a roll segment), so a fixed per-beat cell count no longer
  holds across the whole bar the way it always did before. `lib/stickControlEngine.ts` needed the
  same fix, more substantially: its scheduler used to treat a bar as uniform fixed-duration
  "slots" and derive beat/sub position by simple division/modulo, which assumed every cell takes
  the same amount of time — no longer true once some cells are `fast`. Rewritten to walk bar
  contents cell by cell, each with its own duration (`fast` cells take half as long), tracking
  accumulated in-bar time the same way the renderer now does to detect beat boundaries (for the
  "pulse" click mode, and for accenting the first beat of each bar in all three click modes).
  `currentBeat`/`currentSub` were dropped from the engine's snapshot in the same pass — grepped
  first to confirm nothing outside the engine ever actually read them (only `currentBarIndex` and
  `currentRepeat` are consumed by the component), so they were just dead weight once the
  underlying beat/sub bookkeeping that fed them no longer existed in the same shape.

  **Verified against the real dev deployment's rendered output directly**, not just by eye this
  time, after two prior rounds on this same tool were each visually plausible but wrong in ways a
  screenshot alone didn't make obvious: queried the actual SVG DOM for a "Stroke rolls" bar and
  confirmed exactly 16 noteheads per bar (matching `slotsPerBarFast` precisely, not the 8 a
  quick visual scan of a compressed screenshot first suggested — a real case of not trusting an
  eyeballed screenshot count over the actual rendered data); for "Strokes, then a roll," confirmed
  exactly 12 noteheads (4 + 8) with measurably different horizontal spacing between the two
  halves (a consistent ~33px gap among the first notes, ~28px among the rest) — both the *count*
  and the *visual density difference* now directly confirmed from the rendered DOM, not inferred.
  Every pattern type still switches cleanly with correct labels, Start/Stop and the "Repeat 1 of
  20" progress label still work through a real count-off into playback, and zero console errors
  throughout. `tsc`, `eslint`, and `next build` all pass. **Not verified**: how this actually
  sounds at tempo (the engine change is substantial — rewritten rather than patched — and was
  checked by reasoning through the new per-cell timing math and confirming no console/runtime
  errors across a real Start/Stop/count-off cycle, not by listening to it), and whether the
  doubled-grid bar-count math for "Stroke rolls" (now sometimes needing more bars than the
  previous, incorrect model did, since it's computed against `slotsPerBarFast` rather than the
  unit-grouped count) still reads reasonably for every roll size — only 5- and 9-stroke were
  specifically checked this round.

  **One more direct fix on top**: "strokes then roll should repeat that twice" — its one-bar
  composite only ever showed once, where the book's own reference pages (10 and 11) both state
  the identical straight-then-roll bar *twice* per exercise line before it ends, the same
  "two measures per exercise" shape Single Beat Combinations already uses. Fixed by returning
  `bars: [bar, bar]` (the same built bar object twice) instead of `bars: [bar]` — nothing else
  about the generation needed to change, since the bar's own content is already a complete,
  self-contained unit; showing it twice is just showing it twice, not a different composite.
  Confirmed via the real dev deployment: exactly 2 bars render now (queried the DOM directly, not
  just eyeballed), both with identical content, and a screenshot confirms they sit side by side
  correctly. `tsc`, `eslint`, and `next build` all pass.

  **Reported directly, with a screenshot**: "when there is more than one bar the bars should not
  be in separate containers, they should be right next to each other in one line with nothing
  separating them" — accurate. Every bar had its own separate `Renderer`/card (a responsive grid
  of small cards, one per bar) since this tool's very first version; correct for a single bar, but
  for 2+ it read as several disconnected boxes rather than one real multi-measure line. Rebuilt
  `components/StickControlStave.tsx` around a single shared `Renderer`/SVG for the *whole*
  pattern: each bar still gets its own `Stave`, but all of them are positioned on the *same*
  canvas, each one starting exactly where the previous bar's own width ends — the standard way a
  real multi-bar system is built in VexFlow (and in real engraving), so the staff lines are
  genuinely continuous and the only thing separating two bars is the barline VexFlow draws at
  their shared edge, not a gap or a second background box. The whole line now sits inside one
  shared card (`bg-surface` once, not once per bar).

  Highlighting "the bar currently playing" had to move with it: it used to be a CSS class on each
  bar's own card, which no longer exists once there's only one shared SVG. Replaced with a
  separate, absolutely-positioned overlay `<div>` per bar, drawn on top of the shared SVG at that
  bar's own measured `{x, width}` (captured into state during the one draw effect, expressed as
  percentages of the total width so it stays aligned as the SVG scales responsively) — still just
  a class/style toggle driven by `activeBarIndex` on every tick, not a notation redraw, the same
  "don't re-render the music just to move a highlight" reasoning the per-card version already had.

  Verified against the real dev deployment: exactly one music `<svg>` now exists per pattern
  regardless of bar count (confirmed by querying the DOM, not assumed); a 2-bar "Strokes, then a
  roll" pattern and a 5-bar "Stroke rolls" pattern both render as one continuous line with a
  single shared background and no gaps between bars; the active-bar overlay correctly highlights
  exactly the first bar's own region during a real Start → count-off → playback cycle; and phone
  width (390px) still shows no horizontal page overflow. `tsc`, `eslint`, and `next build` all
  pass, zero console errors throughout.

  **That one-continuous-line fix then broke down for anything with many bars**: an 11- or
  13-stroke roll can need up to 13 bars (see `minimalBarsFor`), and squeezing all of them onto one
  ever-shrinking line was reported back directly with a screenshot — "how to new line max every 4
  bars adjusting to screen size." Rebuilt with real line-wrapping, reusing the same "abutting
  `Stave`s on one shared canvas" approach from the previous round, just applied per *row* instead
  of to the whole pattern: `components/StickControlStave.tsx`'s `StickControlRow` renders one
  row's worth of bars as its own continuous multi-bar system (own clef at the start of each row,
  same as a real score's own system breaks), and the new top-level component groups
  `pattern.bars` into rows of at most `MAX_BARS_PER_ROW` (4), stacked vertically inside one shared
  card.

  "Adjusting to screen size" is handled literally: a `ResizeObserver` on the outer wrapper (the
  same technique `ChordChart.tsx`'s `PageFit` already uses elsewhere in this app) tracks the real
  available width, and a `useMemo`'d computation measures each bar's own natural (unscaled) width
  — the exact same `Formatter.preCalculateMinTotalWidth` call the actual drawing pass uses, so the
  estimate and the real render agree — to pick the *largest* bars-per-row (up to the cap of 4)
  whose row width actually fits that container, falling back toward fewer (down to 1) if even that
  doesn't fit. This turned out to matter more than the cap alone: a "Stroke rolls" bar is far
  denser (16+ individually-annotated fast notes) than a "Single beat combinations" bar, so in
  practice it never actually reaches 4-per-row at any realistic screen width — 2 on a wide desktop
  window, 1 on a phone — which is the *correct*, content-aware answer, not a bug; the 4 is a
  ceiling for less-dense pattern types, not a target every pattern type is expected to hit. The
  per-row width estimate is memoized on `[bars, subdivision, beatsPerBar, containerWidth]`
  specifically so it doesn't get recomputed (rebuilding every bar's `Voice`/`Formatter` just to
  re-derive the same answer) on every playback tick, which only ever changes `activeBarIndex`.

  Verified against the real dev deployment at three widths with a 9-stroke roll (9 bars): at
  1400px it wrapped into 5 rows of mostly 2 bars each; at 800px (narrow enough to already be past
  this app's own mobile sidebar breakpoint) it fell back to exactly 1 bar per row, each still
  legibly sized, not cramped; at 390px (phone) the same 1-per-row layout held with zero horizontal
  page overflow. A less-dense single-bar case (triplet combinations, which only ever generates 1
  bar) was also re-checked post-refactor to confirm the single-row path still renders correctly
  with no console errors. `tsc`, `eslint`, and `next build` all pass.

  **A real musicality bug in "Strokes, then a roll," caught by eye against a rendered example**:
  "whenever there is a double stroke roll after a pattern like the 8th notes in this one, the
  double stroke roll should always start on the opposite hand as the 8th notes ended on... the
  pattern shouldn't exactly repeat, the reason it repeats is to show the opposite sticking so its
  not impossible to play." Two real, related defects:
  1. The roll's own start hand (`rollCellAndLabel`'s `startHand`) was picked at random, with no
     relationship to which hand the preceding straight segment had just ended on — could land the
     roll on the *same* hand, an awkward (sometimes effectively unplayable) transition rather than
     a clean handoff. Fixed: `rollCellAndLabel` now takes an optional `forceStartHand`, and the
     "strokesRoll" branch computes it directly — `otherHand(straightHands[straightHands.length -
     1])` — instead of leaving it to chance.
  2. Bar 2 was a literal duplicate of bar 1 (`bars: [bar, bar]`, from the previous "repeat it
     twice" fix) — technically matching "two measures per exercise," but pedagogically wrong: the
     book's own reason for a second, identical-looking measure is to drill the *same* sticking
     leading with the *other* hand, not to print the same bar twice. Fixed with a new
     `mirrorCells` helper (flips every cell's hand, R↔L, keeping `fast` as-is) — bar 2 is now
     `mirrorCells(bar1)`, not `bar1` again. Mirroring a bar that already satisfies "roll starts
     opposite the straight segment's own end" automatically still satisfies it after flipping
     (mirroring preserves relative hand relationships), so fixing both at once didn't require
     separately re-deriving the roll's start hand for bar 2.

  Verified by hand against the actual rendered letters across several random regenerations (not
  just assumed from the code): in each case, the straight segment's last hand and the roll's
  first hand were confirmed opposite, the roll's own letters matched `rollSticking` tiled from
  that forced start hand exactly, and bar 2's full letter sequence matched bar 1's with every
  single hand flipped, letter for letter. `tsc`, `eslint`, and `next build` all pass, zero console
  errors during a real pattern-regeneration cycle in the browser.

  **That mirror fix was itself wrong, caught with a worked example** ("some patterns are repeated
  exactly, you need to look at the last sticking of the roll before the next 8th note... it should
  be RLRL RRLLRRLL RLRL RRLLRRLL"): mirroring bar 1 to build bar 2 fixed the *within-bar*
  straight-to-roll transition but gave no guarantee about the *seam* between bar 1's roll and bar
  2's own straight segment — nothing tied bar 2's first hand to bar 1's last, so that boundary
  could still land on the same hand twice in a row. Traced through by hand: for a 9-stroke roll
  tiled to a multiple of 4 slots (always true here), the roll's own *ending* hand turns out to
  always equal the straight segment's own ending hand, regardless of which hand the roll started
  on — so the real fix only had to guarantee the *next* straight segment doesn't open on that same
  hand. Rebuilt a third time: both bars' straight segments now come from *one* continuous tiling
  of the 16-stroke exercise (`tileTo(full16, straightSlots * 2)`, split in half) instead of each
  bar restarting at position 0 (the original bug) or mirroring the other (the previous fix) — for
  a period-2 alternating exercise this naturally lands on identical straight content both times
  (matching the worked example exactly), but for an exercise whose own first-and-last hand
  coincide within one straight segment, it naturally continues into different content instead,
  which is what actually keeps the seam clean rather than a mirror relationship that doesn't
  reliably do that. `mirrorCells`/`otherHand`-as-a-mirror-helper from the previous round were
  deleted outright once nothing called them anymore (grepped to confirm, not assumed).

  Same message also asked, "for simplicity, remove all the pattern types except for strokes then a
  roll, and remove all the roll sizes except 9 stroke roll" — a real, substantial scope cut, done
  directly rather than hidden behind now-pointless options: `PatternType`, `PATTERN_TYPES`,
  `TRIPLET_CELLS`, the standalone "roll" and "triplet" and plain "single" generation branches,
  `ROLL_SIZES`'s multi-select, `minimalBarsFor`/`tileToBars`/`gcd` (only ever needed by the
  removed branches' variable bar counts — this one's bars are always exactly 2, fixed), and the
  "Pattern type"/"Roll sizes" UI controls are all gone from `lib/stickControl.ts` and
  `components/StickControl.tsx`, not just hidden. What's left: `ROLL_SIZE = 9` (a constant, not a
  set), and `generatePattern` unconditionally does the "strokes then roll" composite described
  above — `StickControlOptions` lost `patternType`/`enabledRollSizes` accordingly, and
  `lib/stickControlEngine.ts`'s default options object was updated to match (the engine's own
  scheduling logic needed no changes at all — it was already generic over whatever
  `StickControlOptions` produces).

  Verified against the real dev deployment: confirmed both the "Pattern type" and "Roll sizes"
  controls are gone from the rendered page; and — this time via a properly robust extraction
  (every rendered "R"/"L" annotation's actual `getBBox().x`, sorted left to right, rather than
  trusting DOM `querySelectorAll` order, which an earlier verification pass in this same session
  had already shown can't be trusted for counting purposes) — across 10 fresh random
  regenerations, every single one satisfied all three hand-transition rules at once: the roll
  always opens opposite its own bar's straight-ending hand (both bars, independently), and the
  seam between bar 1's roll and bar 2's straight segment is always a genuine hand change too, zero
  failures across all 10. `tsc`, `eslint`, and `next build` all pass, zero console errors.

  **That "zero failures across 10 regenerations" check was itself too narrow — reported back with
  a screenshot**: "somewhat better but it is still putting a R right after a roll ending in a R."
  Real, and a genuine gap in the previous round's own fix, not a flaky repeat: the continuous-
  tiling-split-in-half approach (version 3 above) is correct for an exercise built from plain
  period-2 alternation, whose straight segment always starts and ends on *different* hands already
  — but not for one whose straight segment starts and ends on the *same* hand, which isn't just an
  obvious case like "RRRR": something like "RLLR" has this too (first and last letter both R), and
  the prior round's 10-trial spot check simply never happened to land on an exercise shaped that
  way. Fixed in two passes, the second one self-caught before it ever reached a screenshot:
  1. **First pass**: added an explicit check — if bar 2's natural continuation would open on the
     same hand bar 1's roll just ended on, flip bar 2's whole straight segment
     (`straightHands2.map(otherHand)`) before building its own roll from it. This was justified by
     a derived mathematical shortcut: "a 9-stroke roll tiled to a slot count that's always a
     multiple of 4 here always ends on the same hand its own straight segment ended on, regardless
     of start hand" — true at the tool's one actually-tested meter (4 beats/bar, 8th notes →
     8 fast roll slots), but not provably true in general, since the roll cell itself is
     `ROLL_SIZE` (9) letters long, not 4 — tiling a 9-length cell to a slot count that isn't itself
     a multiple of 9 shifts phase on every wrap.
  2. **Second pass, self-caught**: before reporting the first pass as done, ran a broader
     exhaustive Node script (all 72 real book exercises × 9 different beats-per-bar/note-value
     meters, plus 100 procedural-random trials per meter, 1548 checks total) rather than trusting
     the single default-meter spot check that had already missed a real bug once this round — and
     it found real failures at other meters (e.g. 8 beats/bar at 16th notes), confirming the
     "always a multiple of 4" shortcut was genuinely wrong, just not wrong at the one meter
     anyone had actually looked at. Replaced the derived assumption with reading the real value
     instead: `generatePattern` now builds bar 1 for real first, reads
     `bar1[bar1.length - 1].hand` — whatever hand that genuinely turns out to be, not a predicted
     one — and only then decides whether bar 2's straight segment needs flipping, before building
     bar 2. Re-ran the same 1548-check exhaustive script against this version: 0 failures, across
     every real exercise and every tested meter.

  Verified two ways. Logic-level: the 1548-check exhaustive script (72 exercises × 9 meters +
  900 procedural trials) passes with 0 failures, including specifically re-running the meter
  (8 beats/bar, 16th notes) that had caught the first pass's flawed assumption. Real browser,
  against the actual dev deployment: 50 trials across 4 different meters (the default 4/8th,
  plus 8-beats/16th-notes, 2-beats/8th, and 6-beats/16th-notes), reading every rendered "R"/"L"
  annotation's real `getBBox().x` across however many row-wrapped `<svg>` systems the pattern
  produced (sorted top-to-bottom by row, then left-to-right within a row — an early version of
  this check only read the first `<svg>` and mis-reported "missing letters" at wider meters that
  wrap onto two rows, a test-script bug caught and fixed before trusting its result), checking all
  three hand-transition rules every time: 50/50 passed, zero console errors throughout. `tsc`,
  `eslint`, and `next build` all pass. **Not verified**: how the seam fix actually feels to play
  through at a real tempo (the fix is entirely about which letter is correct where, not timing),
  and whether reading the straight segment's *actual* generated ending hand (rather than a
  shortcut) at very large beats-per-bar values still produces musically sensible-looking groupings
  — only the specific meters listed above were checked, not the full 1-8 beats-per-bar range the
  UI's own stepper allows.

  **One more seam, spotted directly against rendered notation with a screenshot**: "there is a R
  at the end of the second measure and an R for the first note of the first measure. IF something
  like this happens, I want you to duplicate the 2 bars so that there are 4 bars but reverse the
  sticking." A genuine gap, not a repeat of anything above: every seam-cleanliness check up to this
  point only ever looked at transitions *within* one lap through the pattern (straight1→roll1,
  straight2→roll2, roll1→straight2) — none of them ever checked the seam the pattern's own
  *repeat* creates, bar 2's last stroke feeding straight into bar 1's first stroke again on the
  next lap, since `lib/stickControlEngine.ts` plays `repeats` copies of `bars` back to back.
  Fixed in `generatePattern`: once both bars are built for real, check
  `bar2[bar2.length - 1].hand === bar1[0].hand`; if so, the pattern becomes 4 bars —
  `[bar1, bar2, mirrorCells(bar1), mirrorCells(bar2)]` — instead of 2, reintroducing a
  `mirrorCells` helper (hand-flip every cell, keep `fast` as-is) of the same shape an earlier round
  had built and then deleted for a different purpose. The reasoning for why mirroring the *whole*
  block is safe rather than needing yet another bespoke check: every seam rule established earlier
  is of the form "hand A != hand B," and flipping both sides of an already-true inequality with the
  same bijection (R<->L) can't turn it into an equality — so bars 3-4 are provably exactly as clean
  internally as bars 1-2 were, with no new seam-by-seam re-verification needed, and the *new*
  loop-closing seam (bar 4's last stroke into bar 1's first) is a genuine hand change too, since
  bar 4 is bar 2 with every hand flipped — concretely, if bar 2 ended on R (the collision), bar 4
  ends on L, no longer equal to bar 1's own (unflipped) first hand. `GeneratedPattern.bars`'s own
  doc comment and `StickControl.tsx`'s "Pattern" Hint were both updated to say "normally 2, 4 when
  the loop would otherwise collide" instead of unconditionally "twice."

  Verified two ways, the same split as every round since the seam logic started needing more than
  a handful of spot checks. Logic-level: the 1548-check exhaustive script (72 real exercises × 9
  meters + 900 procedural trials) extended to also check the wraparound seam (`bars[(i+1) % n]`
  for every bar, not just `i+1`, so the last bar's own transition back into the first is checked
  exactly like every other) — 0 failures, and 357 of the 1548 generated patterns came out 4 bars
  rather than 2, confirming the new path is genuinely exercised throughout, not dead code that
  happens to never trigger. Real browser, against the actual dev deployment: 40 fresh random
  regenerations at the default meter, reading every rendered "R"/"L" annotation's real
  `getBBox().x` the same multi-row-aware way the previous round's check did, checking both the
  within-bar rule and every wraparound seam — 40/40 passed, 8 of them genuinely rendering as 4 bars
  (not just computed as 4 internally — actually seen on the page), zero console errors. `tsc`,
  `eslint`, and `next build` all pass. **Not verified**: how a 4-bar pattern actually reads at a
  glance compared to the usual 2 — whether "occasionally longer" is a surprising inconsistency in
  practice, and whether playing through a 4-bar pattern's full loop (all four bars, then back to
  bar 1) feels as musically coherent as it is provably hand-collision-free — this sandbox still has
  no audio output to confirm by ear, same as every other playback-feel caveat on this tool.

  **Cross-pattern hand continuity, and a visible preview of what's coming next** — two more direct
  requests landed together: "make sure the next pattern is always starting with a sticking
  opposite to what the previous ended with... also make it so it shows the next pattern below the
  current pattern but with a slightly darker background." A real gap the loop-closing-seam fix
  above didn't cover: that fix only guarantees a clean hand-off within one pattern's own repeating
  loop, never between *two different* patterns — e.g. the moment "New pattern" is clicked, or
  auto-advance kicks in once a repeat count finishes, the brand-new pattern's own first stroke used
  to be picked with no relationship at all to whichever hand the *previous* pattern's last stroke
  actually ended on.
  - `lib/stickControl.ts`'s `generatePattern` takes a new optional second parameter,
    `previousEndHand?: Hand` — when given, the whole exercise cell is flipped (the same
    `otherHand`-elementwise operation `mirrorCells` already uses, applied once, before anything
    else is built from the cell) whenever it doesn't already open on the opposite hand. Safe for
    the identical reason mirroring a finished 2-bar block was already safe (see that fix's own
    comment): every hand-transition rule this function establishes is an inequality between two
    hands, and flipping every hand in the cell with one consistent bijection before any of that
    logic runs can't turn any of it into an equality.
  - `lib/stickControlEngine.ts` is what actually supplies a real previous-ending-hand rather than
    leaving every call site to track one by hand: it now keeps a second, precomputed pattern,
    `nextPattern` — always generated against whatever the *current* `pattern`'s own real last
    stroke turns out to be (`endHand`, a tiny new helper reading `bars[last][last].hand`) — one
    step ahead of whatever's actually showing/playing, the same "precompute the next thing for
    preview" shape this codebase's own ear trainers already use (`upcomingRef`, per this file's own
    shared-conventions note). `promoteNextPattern()` is the one place that advances the chain:
    it promotes the already-correct `nextPattern` into the new `pattern`, then immediately
    precomputes a fresh `nextPattern` from *that* pattern's own ending hand, so the chain keeps
    extending one step ahead no matter how many times it runs. Both the newly-exported
    `advanceStickControlPattern()` (what the "New pattern" button now calls, replacing its old
    direct call to `regenerateStickControlPattern`) and the scheduler's own internal auto-advance
    branch (once `repeatIndex` reaches `repeats` with `autoAdvance` on) call this same shared
    helper, so every pattern-to-pattern transition a player can actually trigger — manual or
    automatic — goes through the identical continuity-preserving path, not two separate
    implementations that could drift. `regenerateStickControlPattern()` itself is now reserved for
    the one case where continuity genuinely shouldn't carry over: a *structural* option change
    (beats-per-bar, note value, exercise) — the old pattern's own ending hand may not even mean
    anything against a fundamentally different bar shape, so this still builds a completely fresh
    pattern (and a fresh `nextPattern` to match) with no inherited constraint, same as it always
    did for that case.
  - **The preview itself**: `StickControlSnapshot` gained `nextPattern`, read by
    `StickControl.tsx` alongside the existing `pattern` and rendered through a second
    `StickControlStave` directly below the current one, labeled "Next: <label>". `StickControlStave`
    itself gained a `background?: "surface" | "background"` prop (default `"surface"`, unchanged
    for the current pattern) that swaps its own card's background token — `--background` is
    already darker than `--surface` in *both* themes (checked directly in `app/globals.css`, not
    assumed: light mode has `--background: #f4f4f6` vs. `--surface: #ffffff`; dark mode has
    `--background: #0a0a0d` vs. `--surface: #18181f`), so this reuses an existing, already-correct
    token relationship rather than inventing a one-off opacity/shade just for this. The "Pattern"
    panel's own Hint was left alone — it already explains the 2-bar/4-bar shape of one pattern, and
    this feature is about the relationship *between* patterns, not that shape.

  Verified two ways. Logic-level: a 3,600-check synthetic script (6 meters × 3 exercise modes ×
  200-pattern chains, each pattern generated against the *previous* one's real ending hand exactly
  the way `promoteNextPattern` does it) — 0 failures, confirming the continuity holds across long
  chains, not just one isolated transition. Real browser, against the actual dev deployment, two
  separate checks: clicking "New pattern" 25 times in a row and, each time, confirming both that
  the new current pattern's first stroke is the opposite of the old current pattern's last stroke
  *and* that it's letter-for-letter identical to whatever was shown as "Next" immediately
  beforehand (proving promotion, not a fresh unrelated regeneration) — 25/25 passed; and, for
  auto-advance specifically, three trials at different tempos with `repeats: 1` and polling every
  80ms to catch the page's rendered notation at the exact moment of the *first* auto-advance (an
  early version of this check waited a fixed several seconds instead, which — at a fast enough
  tempo — let several auto-advances happen before it ever looked, making the "did it promote
  correctly" comparison meaningless; fixed by polling for the first actual change instead of
  guessing a wait long enough for exactly one) — all 3 confirmed the same two properties as the
  manual button. Also confirmed directly: exactly two `StickControlStave` cards render (not more,
  not fewer), the first carrying `bg-surface` and the second `bg-background`, distinct and in the
  expected order. `tsc`, `eslint`, and `next build` all pass, zero console errors throughout.
  **Not verified**: how the preview actually looks sitting underneath the current pattern — whether
  the `--background` token reads as "slightly darker" rather than jarringly different once actually
  seen, and whether always showing a second full notation block (even when idle, before Start has
  ever been pressed) feels like a helpful preview or visual clutter in practice — this sandbox still
  has no way to render and look at either.

  **The notation was unreadable in dark themes** — reported directly, with a screenshot showing
  near-invisible black noteheads/stems/beams against the tool's own dark card background: "can you
  make the notes the color of the lightest/darkest foreground color of the theme so that i can
  actually read it in dark themes." Root cause, confirmed by inspecting the actual rendered SVG DOM
  rather than guessing: VexFlow's own `SVGContext` hardcodes `fill="black" stroke="black"` as
  presentation attributes on the root `<svg>` element it creates, and virtually every descendant it
  draws (noteheads/clef/annotations as `<text>`, beam polygons and barlines as `fill`-only shapes,
  stems and stave lines as `stroke`-only shapes) leaves its own `fill`/`stroke` unset and simply
  inherits that fixed black from the root — `components/StickControlStave.tsx`'s own wrapper div
  already carried a `text-foreground` class (set when this tool was first built), but it was never
  effective, since nothing in the rendered SVG actually used the CSS `currentColor` keyword that
  class's `color` value would have fed into. Fixed with a two-attribute override, added right where
  the row's draw effect already post-processes the freshly-created `<svg>` (setting its `viewBox`
  etc.): `svg.setAttribute("fill", "currentColor")` and the same for `stroke` — since
  `currentColor` resolves through ordinary CSS inheritance to the nearest ancestor's `color`
  property, and the already-present `text-foreground` div is exactly that ancestor, this one change
  recolors every one of those descendants at once, correctly tracking whichever theme (light,
  dark, or a custom one — this app's theme system, `lib/theme.ts`, sets `--foreground` as a plain
  CSS custom property either way, not a `light`/`dark` special case) is actually active, with no
  per-element bookkeeping needed.

  Verified against the real dev deployment, not assumed from reading the code alone — an earlier
  sandbox limitation this tool has otherwise run into with scanned-PDF transcriptions and worked
  examples. Inspected the raw rendered SVG DOM directly in both themes: the root `<svg>`'s own
  `fill`/`stroke` attributes read `"currentColor"` as expected; `getComputedStyle()` on an actual
  notehead `<text>` element resolves to `rgb(17, 17, 20)` in light mode and `rgb(242, 242, 245)` in
  dark mode — both exact matches, pixel for pixel, to `--foreground`'s own resolved value in each
  theme (`#111114`/`#f2f2f5`, read directly off `document.documentElement`'s computed style, not
  hand-copied from `app/globals.css`), confirming it's genuinely the theme's live foreground color
  driving this and not a coincidental near-match. The same check against a beam's actual filled
  polygon, a stem's stroke, a barline's fill, and a stave line's stroke all independently resolved
  to the identical theme color too — checked individually rather than assuming one working element
  meant all of them did, since an initial pass at this specific check accidentally queried a
  different, intentionally-invisible helper path inside the beam group first (`fill: none` by
  design, a hit-testing/structural element, not the visible polygon) and had to be corrected to
  find the real one before trusting the result. A full-page screenshot in each theme confirms the
  same thing by eye: dark mode now shows crisp white-on-dark notation exactly where the report's
  own screenshot showed near-invisible black-on-dark; light mode is visually unchanged, still
  black-on-white, confirming the fix is theme-driven rather than hardcoding a single new fixed
  color in black's place. `tsc`, `eslint`, and `next build` all pass. **Not verified**: a custom
  user-defined theme (this app's theme system supports fully custom colors, not just the two
  presets) specifically — only the two built-in `light`/`dark` presets were checked directly,
  though the mechanism (reading whatever `--foreground` currently resolves to, with no
  light/dark-specific branching anywhere in this fix) gives no reason to expect a custom theme
  would behave differently.

  **One more direct follow-up, with a screenshot of a custom theme**: full-strength `--foreground`
  read as too stark/glary once actually seen rendered against that theme's own dark background —
  "make the notes a little darker on both light and dark themes." Fixed at the one place the color
  is actually set: the `containerRef` wrapper div's `color` (what `currentColor` resolves through,
  for every notehead/stem/beam/barline below it) changed from plain `--foreground` to a new
  `NOTATION_COLOR` constant, `color-mix(in srgb, var(--foreground) 80%, black)` — the same
  `color-mix` technique `lib/theme.ts`'s own `overlayValue` already uses elsewhere in this app, not
  a new mechanism. Deliberately mixes toward literal `black`, not the theme's own `--background` —
  background is *darker* than foreground in a dark theme but *lighter* than foreground in a light
  theme, so mixing toward it would have dimmed the dark-theme notes but brightened (the opposite of
  "darker") the light-theme ones; black is unconditionally darker than any reasonable foreground
  color in either theme, so "mix 20% toward black" means the same thing — notes a little darker —
  regardless of which theme is active. In light mode, where `--foreground` is already a near-black
  `#111114`, the visible difference is appropriately negligible (correctly darker by the math, just
  not perceptible against an already-near-black starting point) rather than a no-op.

  Verified against the real dev deployment: computed `fill` on an actual rendered notehead matches
  the predicted `color-mix` result to the pixel in both built-in themes (reading `--foreground`'s
  own live resolved value first, then computing the expected 80/20 mix independently in the test
  script and comparing against what the browser actually rendered, rather than just trusting the
  CSS function parsed correctly) — light: foreground `#111114` → rendered `rgb(14, 14, 16)`
  (predicted `(14, 14, 16)`); dark: foreground `#f2f2f5` → rendered `rgb(194, 194, 196)` (predicted
  `(194, 194, 196)`). Screenshots in both themes confirm the same thing by eye: dark mode notation
  now reads as a softened, slightly gray-white rather than the previous stark bright white; light
  mode is visually indistinguishable from before, consistent with the math above. `tsc`, `eslint`,
  and `next build` all pass. **Not verified**: whether 80/20 is exactly the right amount of
  "little darker" against the specific custom theme in the report's own screenshot — this sandbox
  has no way to reconstruct that theme's exact custom colors to check against directly, only the
  two built-in presets, though the underlying mechanism (always mixing toward black by the same
  fixed ratio, regardless of what `--foreground` itself resolves to) gives no reason to expect a
  custom theme would respond differently in kind, even if the exact right ratio for that one
  specific color combination is itself unconfirmed.

  **"Sticking source" removed outright, per a direct request** ("get rid of sticking source and
  just always make it random"): `ExerciseMode`/`EXERCISE_MODES` (the three-way "random from the
  book" / "a specific exercise" / "procedurally generated" choice) and `exerciseNumber` are gone
  from `lib/stickControl.ts` entirely — `singleCellAndLabel` collapsed into a plain
  `randomExercise()` that always picks a random one of the 72 book exercises, the exact behavior
  "Random, from the book" already was, now with no selector and no alternative paths left to
  maintain (the "procedurally generated" 4-stroke-cell branch, and the "a specific exercise"
  index-clamping branch, are deleted, not hidden — consistent with this tool's own established
  pattern of actually removing a cut option rather than leaving it unreachable dead code, per the
  same "remove all the pattern types except..." precedent earlier in this file).
  `StickControlOptions` lost `exerciseMode`/`exerciseNumber` accordingly, and both
  `lib/stickControlEngine.ts`'s default options object and `components/StickControl.tsx`'s
  `DEFAULT_SETTINGS`/destructuring/options-construction were updated to match.

  Removing the "Sticking source" Select (and the conditional "Exercise" Select beneath it) left
  the "Pattern" `OptionSection` an empty shell — just a header/icon with nothing below it, since
  its only remaining content was a `Hint` (hidden by default behind the panel's own "?" toggle,
  per this app's established hint convention) explaining the straight-segment/roll/bar-count
  relationship. Rather than ship an orphaned, visibly-empty section (confirmed as a real visual
  problem via an actual screenshot, not assumed), the whole "Pattern" section — and its now-unused
  `ListIcon` import — was deleted, and that explanatory text folded into the adjacent "Meter"
  section's own existing Hint instead (already covering the related straight/roll note-value
  doubling), rather than invented a new home for it or dropped it outright — it's still genuinely
  useful context (specifically, *why* a pattern is sometimes 4 bars instead of 2), just no longer
  worth a section of its own with nothing else in it.

  Verified two ways. Logic-level: a 1,800-check exhaustive script (6 meters × 300-pattern
  continuity chains, the same shape as the earlier cross-pattern-continuity verification) against
  the simplified `generatePattern(options, previousEndHand)` signature (now just
  `{beatsPerBar, noteValue}`, no exercise fields) — 0 failures across every hand-transition rule
  this tool enforces; separately, 500 regenerations at the default meter confirmed every single
  label matches `Exercise N + 9-stroke roll` for a real `N` in 1-72 (via a regex check against
  `SINGLE_BEAT_COMBINATIONS.length`), with all 72 distinct exercises actually turning up across
  that sample — confirming there's no leftover "Procedurally generated" or out-of-range label
  possible anymore, not just that the selector UI is gone. Real browser, against the actual dev
  deployment: confirmed both "Sticking source" and the "Exercise" picker are absent from the
  rendered page; clicking "New pattern" 8 times in a row produced 8 genuine `Exercise N` labels
  (never the same pattern twice in this sample, never anything else), zero console errors; and a
  screenshot of the Options panel after the "Pattern" section's removal confirms it now goes
  straight from the notation to Meter/Playback/Sound, matching every other section's own "header
  with real content directly beneath it" shape, not an empty one. `tsc`, `eslint`, and
  `next build` all pass.

  **"Note value" removed outright too, right after "Sticking source"**, per a direct follow-up:
  "get rid of the note value drop down adn just do the 8th note one." The same pattern as every
  prior simplification round on this tool: `NoteValue`/`NOTE_VALUE_OPTIONS` are gone from
  `lib/stickControl.ts` entirely, `StickControlOptions` lost its `noteValue` field (down to just
  `{beatsPerBar}` now), and `generatePattern`'s `subdivision` — previously `options.noteValue ===
  8 ? 2 : 4` — is now a hardcoded `const subdivision = 2`, still a real field on `GeneratedPattern`
  (not inlined everywhere it's read) so the renderer/engine stay exactly as generic over it as
  before; only how it's *produced* changed. `lib/stickControlEngine.ts`'s default options object
  and `components/StickControl.tsx`'s `DEFAULT_SETTINGS`/destructuring/options-construction were
  all updated to match, same as the previous round.

  Removing the "Note value" `Select` left the "Meter" section's own explanatory `Hint` — which had
  explained the note-value-doubling relationship — partly stale (it described a choice that no
  longer exists), so it was rewritten to state the fixed 8th-straight/16th-rolled relationship as a
  fact rather than a conditional, and merged with the pattern-composition explanation that had
  already been folded into this same Hint in the previous "Sticking source" removal round. Unlike
  that previous round, "Meter" still has a real control of its own ("Beats per bar"), so there was
  no orphaned-empty-section problem to fix this time — removing the one `Select` just left the
  section with one field instead of two, not zero.

  Verified two ways. Logic-level: a 2,400-check exhaustive script (every beats-per-bar value from 1
  to 8, each a 300-pattern continuity chain) against the further-simplified
  `generatePattern({beatsPerBar}, previousEndHand)` signature — 0 failures, and every single
  generated pattern's own `subdivision` field confirmed to read exactly `2` (not just assumed from
  the source), across all 2,400. Real browser, against the actual dev deployment: confirmed "Note
  value" is absent from the rendered page; the notation itself still renders the expected 12
  letters per bar at the default meter (4 straight 8th notes + 8 fast 16th-note roll strokes, the
  same shape as before — 24 letters total across the row's 2 bars, confirmed via the actual
  rendered `<text>` elements, not assumed), zero console errors; and a screenshot confirms the
  "Meter" section now shows just "Beats per bar" with its own explanatory hint, no stray empty
  space where the removed dropdown used to be. `tsc`, `eslint`, and `next build` all pass.

  **Meter removed too, and the tool renamed**, two more direct requests landed together: "remove
  the meter section, the beats per bar should always be 4. also rename the tool to Random Stick
  Control Warmup." Meter was this tool's very last remaining structural option — with it gone,
  `StickControlOptions` (which only ever held `beatsPerBar` by this point) is deleted outright, and
  `generatePattern` takes no options argument at all anymore, just the optional `previousEndHand` —
  `const beatsPerBar = 4;` is hardcoded directly inside it. Both `GeneratedPattern.subdivision` and
  `GeneratedPattern.beatsPerBar` stay real fields (not inlined as literals everywhere they're read)
  for the same reason `subdivision` already did when note value was cut — the renderer/engine stay
  exactly as generic over whatever these turn out to be, only *how* they're produced changed.

  This cascaded further than the previous two rounds, since `beatsPerBar` wasn't just a UI
  control — it was the one thing `lib/stickControlEngine.ts`'s whole `StickControlOptions`/
  `updateStickControlOptions` module-state machinery existed to carry, and the one thing
  `components/StickControl.tsx`'s `structuralKey`-keyed "regenerate on structural change" `useEffect`
  existed to react to. With nothing structural left to configure, both are gone: the engine lost its
  `options` module state and the `updateStickControlOptions` export entirely (every
  `generatePattern(options, ...)` call site across the file — `regenerateStickControlPattern`,
  `currentPattern`, `promoteNextPattern` — simplified to `generatePattern(...)` with no options
  argument), and the component's structural effect collapsed into a plain mount-once
  `useEffect(() => { regenerateStickControlPattern(); }, [])` that just seeds the very first idle
  pattern — there's no longer anything to watch for changing. `TempoHero`'s own `beatsPerBar` prop
  (driving its "BPM · 4/4" readout) is now a literal `4` passed directly, rather than derived from
  settings that no longer exist.

  Removing "Beats per bar" left the "Meter" `OptionSection` with literally nothing in it (its only
  other content, the pattern-composition `Hint`, had already been migrated into it once before, in
  the "Sticking source" removal round) — rather than migrate that Hint a *third* time into an
  unrelated section (Playback/Sound), it was dropped outright: with no configuration left to
  explain, the tool's own rendered label (e.g. "Exercise 24 + 9-stroke roll") and the notation
  itself already communicate the pattern's shape directly, and the options panel now goes straight
  from "Playback" to "Sound" with no "Meter" in between at all.

  The rename touched exactly the user-facing surface, not internal identifiers — consistent with
  this app's own existing precedent (e.g. "Polyrhythm Metric Modulation Metronome" is a long
  display name over a component still called `RandomMetricModulation.tsx`): `ToolLayout`'s own
  `title` prop (required to exactly match the `NAV_LINKS` label for the header icon auto-lookup to
  resolve — see this file's own shared-conventions note on `ToolLayout`) and `components/tools.tsx`'s
  `NAV_LINKS` entry's `label` both became "Random Stick Control Warmup"; the component file, its
  internal name (`StickControl`), the `/stick-control` route, `lib/stickControl.ts`/
  `lib/stickControlEngine.ts`, and the synced-settings key (`"jam-practice-stick-control"`) are all
  untouched. The `credit` line ("Patterns from George Lawrence Stone's *Stick Control*") was
  deliberately left alone too — it names the real book, not the tool's own display name, so
  renaming the tool doesn't change what it's correctly crediting. Caught and fixed in the same
  pass: `NAV_LINKS`' own description for this tool had already drifted stale over several earlier
  simplification rounds — it still said "random Stick Control patterns, triplets, and stroke
  rolls," but triplets and standalone stroke rolls were both cut long before this session's own
  "strokes then a roll"-only simplification — rewritten to actually describe current behavior
  (grepped the whole user-visible surface for the bare string "Stick Control" afterward to confirm
  nothing else had drifted the same way, the same verification habit this file's own "sheddex"
  rename note describes using for exactly this kind of staleness).

  Verified two ways. Logic-level: a 2,000-pattern continuity-chain script against the now fully
  argument-free `generatePattern()` — 0 failures across every hand-transition rule this tool
  enforces, `beatsPerBar`/`subdivision` confirmed to read exactly `4`/`2` on every single generated
  pattern, and a direct zero-argument `generatePattern()` call (exactly how the component/engine
  actually call it now) confirmed to work with no options object needed at all. Real browser,
  against the actual dev deployment: the page's own `<h1>` reads "Random Stick Control Warmup"
  exactly; the sidebar nav link reflects the new name; an exact-text search for the bare string
  "Stick Control" (as opposed to a substring match, which would also match the still-correct credit
  line) finds zero matches anywhere on the page, confirming the old name is genuinely gone, not
  just visually overwritten; "Meter" and "Beats per bar" are both absent; the BPM readout still
  correctly shows "4/4"; and the header icon still resolves (confirmed an `<svg>` renders next to
  the title), proving the `NAV_LINKS`/`ToolLayout` title-matching mechanism this rename depends on
  didn't silently break. A screenshot confirms the whole page reads cleanly end to end — title,
  sidebar, options panel (now just Playback/Sound) — with zero console errors throughout. `tsc`,
  `eslint`, and `next build` all pass.

  **A real option came back, after two rounds of pure removal**: "make a dropdown to have single
  stroke rolls (same notes as current double stroke roll but with single alternating sticking),
  double stroke rolls (what it is now), and triplets (randomized sticking between alternating, RRL
  RRL, and LLR, LLR)." `StickControlOptions` returns with exactly one field, `rollType`, and the
  "Pattern" options section (gone since the "Sticking source" removal round) comes back too, now
  holding this one real control instead of the old exercise picker.
  - **"Single stroke roll"** — the *same* written rhythm/length as "Double stroke roll" (still
    `fast`-speed cells, still however many fast slots the roll segment has), just plain
    alternating single strokes (`alternatingSticking`, new) instead of the RRLLRRLLR rudiment —
    "same notes... but with single alternating sticking," per the request's own wording. Generated
    directly from the required start hand, the same way `rollSticking` already was, so it needs no
    mirror-correction to satisfy rule A (the roll always opens opposite the straight segment's own
    end).
  - **"Double stroke roll"** — unchanged, still `rollSticking(ROLL_SIZE, rollStartHand)`.
  - **"Triplets"** — structurally different, not just a different sticking over the same rhythm:
    the roll segment is written as 8th-note triplets (a third of a beat each) instead of
    double-speed 16ths, with its own sticking randomly picked from `TRIPLET_CELLS` — three named
    cells, "RLR" (alternating), "RRL", and "LLR," per the request's own literal three-item list
    ("randomized sticking between alternating, RRL RRL, and LLR, LLR"), kept as three separate
    pool entries rather than collapsed into one "broken double" shape evaluated at two start hands
    — a deliberate choice, with one documented, accepted consequence: since two of the three
    (`RLR`, `RRL`) already open on R, a forced-R start hand resolves to the broken-double shape
    about twice as often as the alternating shape (see `TRIPLET_CELLS`'s own comment for the full
    reasoning) — not a bug, a direct consequence of the request's own three named options rather
    than two evenly-weighted ones. Rule A for triplets is satisfied by an explicit mirror-if-needed
    correction after the random pick (the same technique already used twice elsewhere in this file
    — `previousEndHand` handling and the bar 1 → bar 2 seam fix — not a new one invented for this).

  Introducing a genuinely different rhythmic value (a third-of-a-beat, next to the straight
  segment's half-beat and the existing roll's quarter-beat) retired `NoteCell.fast: boolean` in
  favor of `NoteCell.speed: CellSpeed` (`"normal" | "fast" | "triplet"`) plus a new
  `CELL_BEAT_FRACTION` lookup table (`lib/stickControl.ts`, exported) — a boolean genuinely can't
  express three distinct durations. This cascaded further than it might first look like, retiring
  `GeneratedPattern.subdivision` entirely in the same pass: that field only ever existed to compute
  a cell's own duration and detect beat boundaries, both of which `CELL_BEAT_FRACTION` now does
  directly (`cellDuration = beatDuration * CELL_BEAT_FRACTION[cell.speed]`, beat-start detected via
  `timeInBar % 1`) — it had already been reduced to an always-2 constant by the earlier "Note
  value" removal, and tracking real beat-fractions directly removes the need for a subdivision
  concept altogether, not just hides it. `lib/stickControlEngine.ts`'s scheduler (every duration/
  beat-boundary computation) and `components/StickControlStave.tsx`'s `buildBeamGroups` (now
  grouping by accumulated beat-fraction reaching 1.0, not a fixed per-beat cell count) both
  updated accordingly — the renderer also gained real `Tuplet` support for triplet beats (VexFlow's
  own `Tuplet`, the same class a since-deleted earlier pattern type in this file's own history had
  already imported but never actually wired up for anything live — the `subdivision === 3`
  dead-code branch checking for it is gone, replaced by a per-beam-group `isTriplet` flag computed
  directly from whether that beat's own cells are triplet-speed, since a bar's straight and roll
  segments each occupy whole beats of their own and never mix speeds within one beat).

  Because `rollType` is a real structural option again (a different roll type can mean a different
  cell count/rhythm within a bar, not just different sticking), `components/StickControl.tsx`'s
  mount-only effect from the previous round reverted back into a `[rollType]`-keyed one — the same
  "changing the meter restarts cleanly" shape this tool had for `beatsPerBar` two rounds ago, now
  scoped to the one option that's actually configurable again.

  Verified two ways. Logic-level: a 4,500-check exhaustive script (3 roll types × 1,500-pattern
  continuity chains) — 0 failures across every hand-transition rule this tool enforces (rule A for
  every bar, every within-pattern seam, every loop-closing seam, and cross-pattern continuity),
  confirming all three roll types satisfy the exact same seam-safety guarantees without needing any
  roll-type-specific exception anywhere in that logic. Beyond the seam rules, this script also
  independently confirmed each roll type's own actual shape: "single" produces strict R/L
  alternation with zero same-hand repeats across all 1,500 rolls checked; "double" matches the
  RRLLRRLLR-family pattern exactly, letter for letter, relative to whatever hand it starts on,
  across all 1,500; "triplet" produces exactly 6 triplet-speed cells per roll (never 8, never a
  stray normal/fast cell), and every single one of those 1,500 rolls' letter sequences matched one
  of the three `TRIPLET_CELLS` tiled-and-possibly-mirrored — confirming the "only ever these three
  shapes" claim directly from generated output, not just from reading the generator's own code.
  Real browser, against the actual dev deployment: confirmed the "Roll type" dropdown renders with
  all three options; for each of the three, set via `localStorage` and reloaded, confirmed the
  pattern's own label correctly reads "... + single-stroke roll" / "... + 9-stroke roll" / "... +
  triplet roll," the roll segment's actual rendered letter count matches expectations (8 / 8 / 6),
  the rendered sticking for "single" and "triplet" independently matches what the logic-level
  script already proved those generators produce, and — specifically for "triplet," the one new
  VexFlow code path this round touched — a real `Tuplet` bracket (visually, a "3" above a bracket
  spanning the triplet group) is present for "triplet" and absent for "single"/"double." Screenshots
  confirm the same thing by eye: clean, correctly-bracketed triplet notation with no visual
  glitches, and — in both the single-stroke and triplet screenshots this round happened to catch —
  a genuine 4-bar pattern (the loop-closing-seam fix from an earlier round, confirmed still firing
  correctly under the new roll types too, not something this round had to separately re-verify by
  hand since the exhaustive script above already covers it generically). Zero console errors
  throughout every check. `tsc`, `eslint`, and `next build` all pass.

  **Repeat barlines and a clef, added directly by Jack himself** (not through an AI session — the
  `Barline` import, `REPEAT_BEGIN`/`REPEAT_END` via `setBegBarType`/`setEndBarType`, and the
  `stave.addClef("percussion")` call were all already present in `components/StickControlStave.tsx`
  when this round started) wrap the whole rendered pattern in a proper repeat sign (`:‖` at the
  start, `‖:` at the end) and a percussion clef at the very beginning — a nice, independently-made
  improvement over the plain unmarked staff this tool had before. **Reported directly, with a
  screenshot**: once a pattern wrapped onto a second line, the repeat-begin barline (and the clef)
  showed up again at the start of line 2, and the repeat-end barline showed up at the end of line 1
  instead of only at the very end of the whole thing — "there should only be repeats at the
  beginning and end of the entire thing, same for the cleff." A real, confirmed bug, and an easy
  one to see why: `StickControlRow` renders one row at a time, and its own barline/clef logic
  (`i === 0` / `i === barData.length - 1`) only ever knew about that row's own local first/last
  bar — with no way to tell "the first bar of row 2" apart from "the first bar of the very first
  row," every row got treated identically, each gaining its own clef + repeat-begin at its own
  start and its own repeat-end at its own end.

  Fixed by threading two new props down to `StickControlRow`: `isFirstRow`/`isLastRow` (computed by
  the parent as `rowIndex === 0` / `rowIndex === rows.length - 1`, the one place that actually knows
  how many rows exist). The clef/repeat-begin now gate on `isFirstRow && i === 0` (not just `i ===
  0`), and the repeat-end gates on `isLastRow && i === barData.length - 1` — a row that's neither
  first nor last just gets VexFlow's own default plain barlines on both ends, exactly like any
  interior bar already did. The clef-aware left-padding calculation (`LEFT_PAD_CLEF` vs.
  `LEFT_PAD_PLAIN`, used both to size each bar's own box and to decide where its notes start) moved
  onto the same `showClef` condition, so a later row's own first bar — which no longer draws a clef
  — correctly gets the smaller, clef-free padding instead of reserving space for a clef it doesn't
  have.

  Verified against the real dev deployment, not just reasoned through: forced a genuinely multi-row
  pattern (a narrow 700px viewport with "Triplets" roll type, whose wider bars reliably wrap even a
  short pattern) and inspected the real rendered SVG DOM directly — row 0 has exactly one clef and
  exactly one repeat-barline group (confirmed via the actual VexFlow markup: a repeat barline's own
  `<g class="vf-stavebarline">` contains extra `<rect>`s for the thick double-bar plus `<path>` arcs
  for the dots, which a plain barline's identically-classed group never does, so presence of a
  `<path>` child reliably tells the two apart in the DOM rather than guessing from a screenshot);
  every interior row has zero of either; the last row has zero clefs and exactly one repeat-barline
  group. Checked for both the "current pattern" and "next pattern preview" wrappers independently,
  both correct. A screenshot (a genuine 4-row pattern, one bar per row at that width) confirms the
  same thing by eye — clef and `:‖` only at the very top, `‖:` only at the very bottom, plain
  barlines in between — matching the report's own request exactly. `tsc`, `eslint`, and
  `next build` all pass, zero console errors throughout.

  **That fix immediately surfaced a second, real bug, reported directly with a screenshot**: "the
  ends of each line are slightly cut off." True — and the fix above is exactly what made it
  visible: every row used to end in a `REPEAT_END` barline (the old, duplicated-everywhere bug),
  and a repeat barline's own thicker double-bar-plus-dots decoration happened to have enough of its
  own drawn margin to absorb a small, real, pre-existing sizing gap; a row's now-correct *plain*
  barline — drawn flush at the stave's own right edge with no margin of its own — had nothing left
  to absorb it, so it was silently clipped away by the SVG's own `viewBox` instead of just drawing
  thinner. Root-caused directly against the real dev deployment (not guessed): measured every row's
  real rendered content via `getBBox()` against the `viewBox` width VexFlow's own
  `Formatter.preCalculateMinTotalWidth` estimate had sized the canvas to, and found a small,
  startlingly *consistent* ~1px shortfall on every single row/bar checked — real content
  consistently extending about 1px past where the canvas (and therefore the SVG's own clipping
  boundary) ended, not random per-row noise. Rather than chase the exact VexFlow-internal rounding
  cause (a worthwhile rabbit hole for another day, not this one), fixed by measuring the real
  content a second time — a `getBBox()` call on the row's own `<svg>`, now done *after* everything
  (notes, beams, tuplets, barlines) is actually drawn — and sizing the final `viewBox` (and the
  `totalWidth` state the active-bar highlight overlay's percentage math is keyed on) to that
  real measurement plus a small fixed `RIGHT_SAFETY_PX` (4) margin, instead of trusting the
  pre-draw estimate used only to size the initial canvas. Self-correcting by construction — this
  stays correct regardless of what specific VexFlow internal quirk produced the original ~1px gap,
  or whether some future addition to this renderer (a wider glyph, a different barline decoration)
  produces a different-sized one.

  Verified against the real dev deployment: re-measured the same way the bug was originally
  diagnosed — every row's real content `getBBox()` now lands exactly `RIGHT_SAFETY_PX` (4px) inside
  its own `viewBox`, not past it, confirmed across every row of a genuine multi-row pattern (not
  just the row that happens to be last). A screenshot of that same multi-row pattern confirms it by
  eye: every row's own right-edge barline — plain for interior rows, the real repeat-end only on
  the pattern's true last row — is now fully visible, nothing clipped, with zero console errors.
  `tsc`, `eslint`, and `next build` all pass.

  **Every reference to the original printed source this tool's pattern bank was transcribed
  from — its title, its author, and the specific numbered patterns within it — removed, per a
  direct request**: "Remove all references to the stick control book. Do not state exercises, and
  rename the tool to something generic." Deliberately not documented by name anywhere in this
  entry either, consistent with the request itself — see this section's own earlier bullets, above,
  for the development history that originally named it (left as an accurate record of what was
  actually done at the time, not retroactively scrubbed, the same way this file never rewrites its
  own past — but every *current*, forward-looking description from this round on avoids it).
  - **Renamed again**: `Random Sticking Warmup` now, both `ToolLayout`'s own `title` and
    `components/tools.tsx`'s `NAV_LINKS` `label` (the two have to match exactly for the header
    icon's own auto-lookup to resolve — see this file's own `ToolLayout` shared-conventions note).
    The `NAV_LINKS` `description` was rewritten too, dropping both the source reference and the
    now-inaccurate "9-stroke" specificity (the roll has been one of three selectable types for a
    while now, not always 9-stroke) in favor of describing only what the tool actually does.
    Internal identifiers — the component/file names, the `/stick-control` route, the
    `"jam-practice-stick-control"` synced-settings key — are all unchanged, matching this app's own
    established pattern of a tool's display name diverging from its internal identifiers rather
    than cascading a rename through routes/storage keys that have nothing to do with what's
    actually displayed.
  - **The `credit` line removed outright** (`ToolLayout`'s own optional `credit` prop, previously
    naming the source and its author) — there's no other sensible attribution to put in its place
    once that's gone, so the prop is simply omitted now rather than left with placeholder text.
  - **Pattern labels no longer identify which of the 72 transcribed patterns is currently showing**
    — `GeneratedPattern.label` (shown above the notation, and above the "Next" preview) used to read
    e.g. "Exercise 14 + 9-stroke roll"; the "Exercise N" half is gone, leaving just a description of
    the roll itself (e.g. "9-stroke roll," "single-stroke roll," "triplet roll"). The underlying
    `randomExercise()` helper — which used to generate that label alongside picking the pattern —
    was renamed to `randomPattern()` and simplified to return just the sticking itself, since
    nothing needs the label it used to also produce anymore.
  - **Every code comment in this tool's own files that named the source, its author, or referred to
    "exercises" was rewritten** to describe the same technical points in generic terms instead (a
    bar's straight segment comes from "a bank of transcribed sticking patterns" rather than naming
    where; `SINGLE_BEAT_COMBINATIONS`' own doc comment calls its 72 entries "transcribed sticking
    patterns... as printed in the original source" rather than naming it) — not just the
    user-visible surface, since the request's own wording ("all references") read as broader than
    only what's rendered on the page. Grepped the whole touched surface afterward (case-insensitive,
    for the title, the author's name, and the word "exercise") to confirm nothing was missed, rather
    than trusting a single editing pass — the same verification habit this file's own "sheddex"
    rename note already describes using for exactly this kind of sweep.

  Verified two ways. Logic-level: re-ran the full exhaustive hand-safety/continuity script (3 roll
  types × 1,000-pattern chains, 3,000 checks total) against the renamed `randomPattern()` — 0
  failures, confirming the rename/simplification didn't disturb any of the seam-safety logic; a
  separate 2,400-pattern check confirmed every single generated `label` is one of exactly three
  fixed strings ("single-stroke roll," "9-stroke roll," "triplet roll") and never matches
  `/exercise/i`. Real browser, against the actual dev deployment: the page's own `<h1>` reads
  "Random Sticking Warmup"; a full-page text scan (`document.body.innerText`, case-insensitive)
  confirms zero occurrences of "exercise," the source's own title, or the author's name anywhere
  on the rendered page; the sidebar nav link reflects the new name; both the current and "Next"
  pattern labels read as plain roll descriptions with no pattern-number reference; and the same
  full-text scan was repeated after 6 live regenerations ("New pattern," clicked repeatedly) to
  confirm no stray "exercise" text appears under any randomly-generated pattern, not just the one
  first loaded. A screenshot confirms the same thing by eye — title, labels, and the options panel
  all read generically, with no credit line at the bottom of the page anymore. `tsc`, `eslint`, and
  `next build` all pass, zero console errors throughout.

  **The roll-type labels removed too, right after the source references — "remove these titles and
  just have the next in bigger text accent color."** The text above the current pattern (e.g.
  "triplet roll") is gone outright, and "Next: triplet roll" above the preview became a plain
  "Next," styled `text-sm font-semibold` — the same size/weight this file's own `phaseLabel`
  ("Count-off…", "Repeat N of M") already uses, reused rather than inventing a new text size for
  "bigger text." The color itself went through two rounds: first `text-accent` (matching
  `phaseLabel`'s own color too, per the request's own literal wording), then corrected by an
  immediate direct follow-up — "actually dont make the next label color accent, make it like a
  secondary foreground" — to `text-muted`, this app's own established "secondary foreground" token
  (the same one every other small label in this tool's own Options panel already uses, e.g.
  "Pattern"/"Playback" section headers), not a new color invented for this one spot. With both JSX
  usages of the old per-roll-type text gone, `GeneratedPattern.label` itself became genuinely dead
  — grepped the whole app to confirm nothing else read it — so it was removed from the type
  entirely, along with the `ROLL_TYPE_LABEL` lookup table that built it (`ROLL_TYPES`' own `label`
  field, the "Roll type" dropdown's own option text, is a different, still-very-much-used thing and
  was untouched). `generatePattern`'s return shrank to just `{ beatsPerBar, bars }`. The
  now-single-child wrapper `<div>` around the current pattern's own `StickControlStave` (previously
  also holding the removed label `<p>`) was dropped too, rather than left as a redundant one-child
  flex container.

  Verified both rounds the same way: `tsc` and `eslint` clean after each change (confirming `label`
  really was unreachable from anywhere else once removed, not just assumed), and real-browser
  checks against the actual dev deployment reading "Next"'s own `getComputedStyle` directly rather
  than assuming a class name took effect — first confirming it matched the accent token's real
  color (`rgb(99, 102, 241)`, `#6366f1`), then, after the correction, confirming it matches
  `--muted`'s real color instead (`rgb(107, 107, 118)`, `#6b6b76`, read directly off
  `document.documentElement`'s own computed `--muted` value, not hand-copied from
  `app/globals.css`) — and a screenshot after each round confirming no roll-type text appears above
  either stave, "Next" renders in the expected spot and size, with the correct color each time.
  Zero console errors throughout. `tsc`, `eslint`, and `next build` all pass.

  **The route itself renamed too — "change the route to /random-sticking-warmup and not
  /stick-control."** App Router routes are directory-based, so this meant actually moving the page:
  `app/stick-control/page.tsx` (tracked in git) was removed and an identical
  `app/random-sticking-warmup/page.tsx` created in its place — same file content, just relocated,
  via `git rm`/`git add`-equivalent commands so the move shows cleanly in history rather than as an
  unrelated delete-and-add. The two other places a route string has to match it exactly were
  updated in lockstep: `components/tools.tsx`'s `NAV_LINKS` entry's own `href`, and
  `lib/toolRegistry.tsx`'s `TOOL_COMPONENTS` map — keyed by href for the tiling-panes feature's own
  `TOOL_COMPONENTS[href]` lookup, so this key had to change to exactly match or that lookup would
  silently miss. Everything else this tool touches — the component file/function name
  (`StickControl`), `lib/stickControl.ts`/`lib/stickControlEngine.ts`, the `OptionsCard`'s own
  `id="stick-control"` (a panel-open/collapsed localStorage key, unrelated to routing), and the
  synced-settings key `"jam-practice-stick-control"` — stayed untouched, since the request was
  specifically about the route, not a request to cascade the rename through every internal
  identifier that happens to share its old name; changing the synced-settings key specifically
  would have been a real, unasked-for regression (silently orphaning any already-synced account's
  existing settings for this tool). No redirect from the old path was added — nothing in this app
  currently redirects a renamed route (checked `next.config.*` directly for an existing convention
  before deciding this, rather than assuming there wasn't one), and none was requested.

  Verified against the real dev deployment, not just reasoned through. A plain `curl` confirms the
  new route resolves (`200`) and the old one is genuinely gone (`404`), not just unlinked. In a
  real browser: clicking the sidebar's own nav link (reading its real `href` first, not assuming)
  navigates to `/random-sticking-warmup` and renders the actual tool — correct `<h1>`, real notation
  `<svg>` elements present, zero console errors — confirming the whole chain (NAV_LINKS → Next's
  router → the moved page → the unchanged component) still resolves correctly end to end. The
  tiling-panes registry lookup specifically (`TOOL_COMPONENTS["/random-sticking-warmup"]`) was
  *not* independently exercised through the feature's own real toggle UI — that toggle now lives
  behind a "..." options flyout this round didn't map out, and a hand-fabricated `localStorage`
  tiling-state fixture (the faster path tried first) hit the same category of false-alarm crash
  this file's own tiling-feature history already documents for exactly this testing technique
  (a malformed hand-built fixture crashing on a shape mismatch, not a reachable app bug) — so this
  was left as a reasoned-through check instead: the registry is a single `Record<string,
  ComponentType>` keyed by href, the key was updated to exactly match the new href (confirmed via a
  direct, repo-wide `grep` for the old route string turning up only the deliberately-unchanged
  internal identifiers listed above, nothing route-related), and that's the entire mechanism this
  lookup depends on. `tsc`, `eslint`, and `next build` all pass, with the build's own route listing
  directly confirming `/random-sticking-warmup` is present and `/stick-control` is gone.
- **Slow Downer** — load a local audio/video file, slow playback without pitch shift, loop
  sections, add named markers with notes, zoom/pan the waveform.
- **Recorder** — multitrack recording: per-track clips, punch-in recording, trim/crop/repeat/move
  clips (even between tracks), automatic recording/playback sync via an inaudible burst-tone
  trick (`lib/syncBurst.ts`), a "align to beat" pitch-based nudge (`lib/alignBeat.ts`), WAV
  export/mixdown. **Desktop-only** — greyed out on phones via `desktopOnly` in
  `components/tools.tsx`'s `NAV_LINKS`.
- **Community** (`components/Community.tsx`, `app/community/page.tsx`) — this app's first public,
  social feature; a new `"Community"` `NAV_LINKS` category on its own, reachable (like every other
  page here) without an account. Has its own left sidebar — Search / Following / Chord Charts —
  using the exact same `SidebarNavButton` (`components/SidebarNavButton.tsx`, pulled out of
  `/account`'s own sidebar into a shared component) `/account` itself uses, per a direct request to
  give this page "the same sidebar thing." **Search** is a username-only search box (not
  instrument/tune — an explicit scoping call) over every `isPublic` profile, via
  `convex/profiles.ts`'s `search` — a plain scan-and-filter over public profiles rather than a real
  search index, since this is a small personal-project directory, not a large-scale service.
  **Following** reuses `FollowLists` wholesale (the same component `/account`'s own Following tab
  renders — both who you follow and who follows you), per a direct follow-up request for "a
  section for people you follow" here too, not just on the account page. **Chord Charts**
  (`components/CommunityChordCharts.tsx`) is this app's first user-generated content — see its own
  paragraph below. Since this page (unlike `/account`) is reachable signed out, `Community` gates
  the Following and Chord Charts views itself — `useConvexAuth()`'s `isLoading`/`isAuthenticated`
  picks between a loading spinner, the real content, or a sign-in prompt — rather than mounting
  either unconditionally: `FollowLists`' own `useQuery(api.users.current)` gate only checks for
  "still loading" (`user === undefined`), not "definitely signed out" (`user === null`), so
  mounting it while signed out would leave its lists stuck spinning forever, and
  `CommunityChordCharts` is deliberately signed-in-only per Jack's own scoping call (browsing needs
  an account, even though search doesn't); `/account` never hits either problem because that whole
  page is already gated behind being signed in before any tab ever renders. See "Public profiles &
  follows" under Backend (Convex) below for the follow/profile feature, and "Community chord
  charts"/"Community tunes" further down for the two posting sections — the public profile page
  itself (`app/u/[username]/page.tsx`) isn't a "tool" with a nav entry of its own, just what a
  Community search result (or a shared link) leads to.
- **Community chord charts** (`components/CommunityChordCharts.tsx`, `convex/communityChordCharts.ts`)
  — the Community page's third section: browse chord charts and playlists other users have posted,
  and import any of them straight into your own Chord Charts library. Went through two real
  storage designs, both broken at actual scale, before landing on the current one — worth reading
  in order since each failure directly shaped the next design:
  1. **v1**: one `communityChordCharts` document per post, `songs: v.any()` holding every song
     inline, full `bars` included. Broke the same way the personal library's original blob did —
     `create` (`songIds.length` used to be `songs.length`) had a `MAX_SONGS_PER_POST = 100` cap
     specifically to stay under Convex's 1 MiB single-document limit, but Jack wanted to post the
     whole jazz-standards forum playlist (~1,400 charts), which both the cap and the underlying
     document size would have rejected outright.
  2. **v2**: kept posting/importing on the client, but had it fetch every selected song's `bars`
     in one bulk call (`chordCharts.getSongsBars`, an object keyed by song id) right before
     posting, so the post itself could still be assembled and sent in one `create` call. This
     traded the document-size problem for a different Convex limit: a plain object can have at
     most 1024 fields, and a 1,410-song bulk fetch needed 1,410 keys —
     `chordCharts.js:getSongsBars return value invalid: Object has too many fields (1410 > maximum
     number 1024)`.
  3. **Current**: **songs live in their own table** (`communityChordChartSongs`, one row per song,
     indexed `by_post` — the post row itself only holds `songCount`), the same
     one-row-per-song split the personal library already uses for `chordChartSongs`/
     `chordChartSongBars`. And, critically, **posting and importing never move `bars` through the
     client at all anymore**: `create` takes only `songIds: Id<"chordChartSongs">[]` — ids the
     client already has from its own metadata-only library listing — and copies each song's data
     (`title`/`composer`/`style`/`key`/`timeSignature`/`bars`) straight from the caller's own
     `chordChartSongs`/`chordChartSongBars` rows into fresh `communityChordChartSongs` rows,
     entirely server-side, inside the mutation. Symmetrically, `importIntoLibrary` (new — replaces
     the old client-side `mergeIntoLibrary` call `PostDetailModal` used to make) takes a `postId`
     and optional `songIds` (omitted = "Import all") and copies the other direction, straight from
     `communityChordChartSongs` into the caller's own `chordChartSongs`/`chordChartSongBars`,
     same server-side-only rule. Both share `convex/lib/chordCharts.ts`'s `findOrCreatePlaylist`/
     `songKey` helpers (also used by `chordCharts.importSongs`) so "merge into an existing
     playlist by name" and "skip a song you already have" mean the same thing everywhere a song
     gets added to a library. `get` (opening a post) now returns song *metadata only*, same
     "list cheaply, fetch one thing's bars lazily" split as the personal library's own
     `library`/`getSongBars` — a post's individual songs preview inline via a new
     `communityChordCharts.getSongBars` (one song's bars, fetched only for whichever row is
     currently expanded). Net effect: no operation in this whole feature ever has to hold more
     than *one song's* `bars` in memory or in a single value at once, so post size no longer has
     any practical ceiling tied to Convex's per-document or per-object-field limits —
     `MAX_SONGS_PER_POST` is still a cap (now 3,000, a generous sanity bound rather than a
     size-driven one) purely to keep one `create`/`importIntoLibrary` call's transaction from
     growing unbounded, not because a bigger post would break storage.

  Both `create` and `importIntoLibrary` were spot-verified against the real dev deployment (not
  just `tsc`): an unauthenticated call is correctly rejected, and — since the previous failure was
  specifically about a *shape* of return value (an object with too many fields), not overall
  payload size — a separate temporary query confirmed a 1,500-element *array* return succeeds with
  no comparable limit, which is the shape `get`'s song list now actually uses.

  **Posting requires the caller's own profile to be `isPublic`** (checked server-side in `create`,
  the real source of truth — the UI mirrors it by showing a "make your profile public" prompt
  instead of a Post button when it isn't) — **browsing only requires being signed in**, not a
  public profile of your own. Every read (`list`/`get`/`getSongBars`) drops a post (or song) whose
  author's profile isn't (or is no longer) public, the same privacy rule applied everywhere else
  cross-user data is read in this app, and `convex/account.ts`'s `performDelete` cascades both the
  post rows and their now-separate song rows, so deleting your account doesn't leave posts (or
  orphaned song rows) behind with no reachable author. The browse list (`list`) stays
  metadata-only (title, description, `songCount`, the author's *current* username/avatar).
  Posting (`CreatePostModal`) doesn't accept a pasted iReal link directly — it picks one or more
  songs out of the caller's *own* Chord Charts library, so there's exactly one place (the Chord
  Charts tool itself) that ever parses iReal links. That picker is grouped by playlist (the same
  grouping the tool's own "Tunes" panel shows) rather than one long flat checkbox list, per a
  direct follow-up request ("a better interface for selecting what charts to include... let me
  include entire playlists"): each playlist has its own tri-state checkbox (unchecked/checked/
  indeterminate, using the checkbox DOM node's `.indeterminate` property via a ref callback —
  there's no HTML attribute for it) that selects or clears every song in that playlist at once,
  alongside per-song checkboxes, and a collapse chevron per playlist. Picking a whole playlist as
  the very first selection defaults the post title to that playlist's name — a starting
  suggestion, never overwriting a title already typed. Viewing a post lets each song expand inline
  into the real `ChordChart` renderer before deciding to import it (lazily fetching just that
  song's bars via `getSongBars`), plus an "Import all" shortcut for the whole post — both call
  `importIntoLibrary` directly, so importing a chart you already have (from Community or anywhere
  else) is always a safe no-op rather than a duplicate, and lands in a playlist named after the
  post.
- **Community tunes** (`components/CommunityTunes.tsx`, `convex/communityTunes.ts`) — the Community
  page's fourth section, added right after Chord Charts per a direct follow-up ("there should be
  another section for posting tunes") and built as its sibling in every way: same shape, same
  posting-needs-a-public-profile/browsing-just-needs-an-account split, same metadata-only `list` +
  lazy-loaded-on-open `get`, same account-deletion cascade, same `v.any()`-blob-in-a-dedicated-table
  call (`communityTunes` in `convex/schema.ts`) for the identical "needs to be readable by other
  users, so `syncedSettings` alone can't cover it" reason. A post's `tunes` is a snapshot of
  `PublicTune[]` (`lib/profileTunes.ts` — name/tempos/keys/time signature) taken from the poster's
  own Tunes list (`useSyncedTunes()`) at post time via the new `toPublicTune` export, never
  `notes` — the exact same privacy rule `getPublicByUsername` already applies when a profile's own
  Tunes section resolves live, just run once at posting time instead. `CreatePostModal` here is
  the tune-shaped twin of the chord-charts one: a searchable checkbox list of the caller's own
  tunes instead of their own chord charts, same "post a tune" and "make a tune list" being the same
  action with a different number of boxes checked. The one real difference from Chord Charts:
  viewing a post (`PostDetailModal`) doesn't need its own bespoke row/import UI at all — it hands
  `post.tunes` straight to `PublicTuneList`, the *exact* component a public profile's own Tunes
  section already renders with (name, tempo/key chips, and the "Add"/"Learn" buttons that copy a
  tune into the viewer's own Tunes or Tunes to Learn list with the same name-based dedupe check),
  so browsing a Community tune post and browsing someone's profile page behave identically with no
  second copy of that logic to maintain. Capped at 300 tunes per post (`MAX_TUNES_PER_POST`) —
  higher than Chord Charts' 100, since a tune here is a few small fields, not a full parsed bar
  list, so many more of them fit comfortably under the same practical per-document-size concern.
- **"My Posts" and posts on a public profile** — two direct follow-up requests landed together
  since they're the same underlying gap: `list`'s shared Browse feed is capped at the 60 most
  recent posts across *everyone*, so your own older post could silently fall out of view with no
  way to find it again once enough other people had posted more recently, and there was no way at
  all to see what someone *else* had posted from their profile page. Two new queries per Community
  table (`communityChordCharts.ts`/`communityTunes.ts`), both scoped by the `by_user` index rather
  than `by_createdAt`, so neither is capped the way `list` is:
  - `mine` — every post the signed-in caller has posted, full stop, no `isPublic` filter (it's
    your own data; deleting already worked this way too, scoped purely by ownership). Drives a new
    Browse/My Posts toggle (a plain two-button pill, `view` state) in both `CommunityChordCharts.tsx`
    and `CommunityTunes.tsx` — switches which query's results the shared list renders, reusing the
    exact same row component either way (`PostListItem`, pulled out of each file's own top-level
    component specifically so Browse/My Posts/a profile's posts section all render a post
    identically — see below).
  - `listByUser(userId)` — a specific user's posts, for a public profile's own "Chord Chart Posts"/
    "Tune Posts" sections (`PublicProfilePage.tsx`). Same signed-in-required rule as `list`/`mine`
    (browsing needs an account, even someone else's posts, per Jack's existing scoping call for
    this feature) *plus* the target's profile has to currently be `isPublic` — re-checked
    independently here rather than trusted from the caller, even though `PublicProfilePage.tsx`
    only ever calls this once `getPublicByUsername` has already confirmed it, same "don't trust the
    caller, the query is the real gate" pattern every other cross-user read in this app follows.
  `PostListItem` and `PostDetailModal` are now exported from each Community component file
  (`export function`, not a second copy) and imported into `PublicProfilePage.tsx` aliased per
  source (`ChordChartPostListItem`/`TunePostListItem` etc.) — a post reached from a profile page
  opens in the *exact* same detail modal Community's own Browse/My Posts do, so viewing and
  importing behave identically regardless of which page led you there.

  Building this surfaced a real gap in the privacy rule itself: `get`/`getSongBars`/
  `importIntoLibrary` (chord charts) and `get` (tunes) all used to hide a post from *everyone*,
  including its own author, the moment that author's profile stopped being `isPublic` — meaning
  "My Posts" could list a post its own owner then couldn't actually open. Fixed by adding an
  owner bypass to each (`row.userId !== userId && !profile.isPublic`, rather than just
  `!profile.isPublic`) — your own posts stay visible/manageable to you regardless of your current
  profile visibility, the same way `remove` already worked (no `isPublic` check on it at all,
  scoped purely by ownership); a private profile still hides your posts from *everyone else*,
  which is the part the rule actually exists to protect.

  Verified against the real dev deployment (not just `tsc`): `mine` and `listByUser` both
  correctly return `[]` for an unauthenticated caller, including `listByUser` called with a real
  existing public user's id (not just a not-found one) — confirming "browsing requires an
  account" holds even when the target profile genuinely is public and exists. Not verified: any
  of the actual UI — the Browse/My Posts toggle switching correctly, a profile's posts sections
  rendering and opening the right modal, or the owner-bypass fix actually letting someone view
  their own post after going private (this sandbox has no way to sign in as two different users,
  post as one, go private, and confirm "My Posts" still opens for the owner). A direct follow-up
  request added `max-h-96 overflow-y-auto` to all four of a profile's list sections (Tunes, Tunes
  to Learn, Chord Chart Posts, Tune Posts) so a long one scrolls in place instead of pushing the
  rest of the page down indefinitely — confirmed, separately, that "import each tune to my
  account" was already covered by `PublicTuneList`'s existing `canAdd` prop on the Tunes/Tunes to
  Learn sections (per-tune Add/Learn buttons), not something that needed building. A further
  follow-up restyled `PostListItem` itself (shared by Browse, My Posts, and a profile's posts
  sections in both files) from a stacked card — title/meta, then a flat rectangular "View &
  import"/"View & add" button on its own line below — into a single horizontal row: title/
  description/meta on the left, a delete icon (when `onDelete` is passed) and a solid `bg-accent`
  "View" pill on the right, both vertically centered against the row via the `<li>`'s own
  `items-center`. `bg-accent` reads as blue by design here (`app/globals.css`'s `--accent`,
  `#6366f1`/`#818cf8` light/dark) — the same token every other primary action button in this app
  already uses (`Post a chart`, `Import all`, ...), not a one-off color picked for this button.
  A further follow-up request added search to both Community list views (Browse and My Posts,
  same input/filter in both files) — typing filters by the post's own title *or* any individual
  song/tune name inside it, not just the title. Chord charts needed a small schema addition —
  `communityChordCharts.songTitles: v.optional(v.array(v.string()))`, accumulated once in
  `create` alongside `songCount` — since a post's individual song names otherwise only exist
  inside `communityChordChartSongs` rows, which `list`/`mine` deliberately never read (the same
  cost `getSongsBars` blew up over — see the two-Convex-bug section below); denormalizing just the
  titles onto the post row keeps search free at read time without re-introducing that cost. Tunes
  needed no schema change at all: a tune post's `tunes` field is already inline `v.any()` on the
  row (small, capped at `MAX_TUNES_PER_POST`), so `communityTunes.ts`'s new `tuneNamesOf` helper
  just derives names from it defensively on every read instead of storing them separately. Both
  `summarizePost` functions now return the name list, and each file's top-level component filters
  its visible list client-side with a case-insensitive substring match against title-or-any-name,
  via a `useMemo` keyed off the trimmed/lowercased query. A `SearchIcon` + `<input type="search">`
  row (same shape used elsewhere in this app) sits above the list, only shown once there's
  something to search; the empty state distinguishes "no posts match your search" from "nobody's
  posted here yet". Verified with `tsc`, `eslint`, and `next build`; not verified by actually
  typing into the box in a browser, same caveat as everything else in Community this session.
- **Home** (`app/page.tsx` / `components/Home.tsx`) — an actual landing page, not a tool directory.
  Went through two very different designs this session: the first rendered every `NAV_LINKS` entry
  as an icon-card grid, grouped by category via the sidebar/command palette's own `groupByCategory`
  helper — a genuinely complete site overview, but one that read like generated documentation
  (a wall of identical cards) rather than a page meant to make a case for the site. Per a direct
  follow-up request to redo it as a real, "somewhat artistic" landing page instead — and
  specifically not "obviously AI generated" — it's a short, editorial single column now: a big
  two-tone "jack**shed**" wordmark (the "shed" in accent color, no gradient text, no icon logo —
  see below); a hand-picked, fixed-array waveform-bar strip under the hero (`WAVEFORM`, tuned by
  hand rather than `Math.random()`'d at render time, which would be a real hydration mismatch — the
  same class of bug `CollapsiblePanel.tsx`'s own "always render the chevron" comment warns about
  elsewhere in this app); a short first-person paragraph in Jack's own voice about *why* this exists
  (styled as a blockquote — a left accent border, not a boxed card) instead of impersonal marketing
  copy; and a curated "A few favorites" list of five of the ~14 tools (not all of them — picked for
  range: a practice tool, an ear trainer, a novelty metronome, a chart reader, and the recorder),
  each written up as its own real sentence with a large faint index numeral (01–05, alternately
  indented for a less perfectly-gridded rhythm) rather than reduced to an icon and a
  three-word fragment. Every tool is still fully reachable — nothing was removed, just no longer
  duplicated on this page — via the sidebar and the `/` command palette, which is what `NAV_LINKS`
  is actually for. Closes with one quiet line about accounts being entirely optional (linking to
  `/community`) instead of a separate "Ready to get started?" CTA banner, and the same footer as
  before. There's no separate icon logo anywhere in the app anymore either, per an earlier follow-up
  request in this same session — the old hand-drawn barn-roof SVG, `BarnLogo` in
  `components/tools.tsx`, was deleted outright (not just unmounted), along with its icon-box wrapper
  in both the desktop and mobile sidebar headers — the "sheddex" text itself is the logo
  everywhere now. Shows "Welcome back, {name}" above the title once signed in — `user.name` (only
  ever set by Google sign-in) if there is one, `user.email` otherwise, since every account has one
  or the other but not necessarily both, same fallback order this app already uses elsewhere for a
  short signed-in label (`AccountMenu.tsx`'s collapsed button, `AccountPage.tsx`'s own subtitle).
  Gated on both `useConvexAuth()`'s `isAuthenticated` and the `api.users.current` query actually
  resolving, so a signed-in visitor never sees a flash of the signed-out version first.

  (Note: the "A few favorites" numbered-list section described just above is no longer in the
  actual file as of this session — it was gone before this round's own changes started, with
  nothing in this document recording when or why. Flagging the drift rather than silently leaving
  it, the same way this file has caught stale documentation before, e.g. the "sheddex" rename
  bullet's own note about a four-file list going stale by the next rename.)

  **Redesigned again** per a direct follow-up with a reference screenshot (another site's own
  marketing landing page — a bold two-line headline, two CTA buttons, and a cluster of small
  floating product-photo widgets around a big centered phone mockup, with a customer-logo strip
  along the bottom) — used purely as a *layout* reference, not copied: "instead of the photos/
  widgets... put little interactive previews of the tools... instead of the buttons... put a
  search bar." Two concrete changes followed from that:
  - The hero's call-to-action buttons (this page never actually had any — the closest equivalent
    was a plain "press / to search" text hint) became a real, styled search-bar-shaped `<button>`
    that dispatches `components/CommandPalette.tsx`'s own `OPEN_PALETTE_EVENT` — the exact same
    event `Sidebar.tsx`'s own desktop search button already fires, so this opens the identical `/`
    command palette, not a second, parallel search implementation.
  - The reference's floating product photos became `PreviewCluster` — five small tool previews
    (Metronome, Jam Practice, Chord Charts, Guess the Interval, Polyrhythm Metric Modulation
    Metronome), each a real `Link` to that tool so the whole tile is what's "interactive" here;
    there's no live audio or state running on the landing page itself. One genuinely reuses a real,
    static-friendly piece of that tool's own UI (`BeatIndicator`, passed a fixed `currentBeat={0}`
    so beat 1 shows lit, no engine running) rather than an approximation of it; the other four are
    small hand-built stand-ins using this app's own existing tokens (`bg-surface`, `bg-accent`,
    the same icons `NAV_LINKS` already uses for each tool) rather than stock photos or screenshots,
    since there was no cheap way to drop in a real live preview of a chord chart or an interval
    quiz without the complexity (and landing-page weight) of their actual stateful components.
    Scattered via absolute positioning (slightly rotated, overlapping the way the reference's own
    photos did) only at `sm:` and up; below that it's a plain, un-rotated 2-column grid (the hero
    Metronome tile spanning both columns) — deliberately not the same absolute-position trick at
    phone width, which would be fragile to get right blind. The reference's bottom customer-logo
    strip has no real equivalent here (this app has no customers to name) and was dropped rather
    than forced into a parallel that wouldn't mean anything.

  **Actually verified in a real browser this time** — a first for this page's own revision
  history, and for most of this document's many "no working browser here" caveats: Playwright's
  own downloaded Chromium still fails on this machine (missing `libglib-2.0.so.0`, no sudo to fix
  it), but a working Chromium turned out to be reachable anyway via `nix shell nixpkgs#chromium`
  (Nix needs no root), driven over CDP with `playwright-core` (a plain npm install, no browser
  binary download, since it only connects to the nix-provided one). Against the real dev server:
  the page renders with zero console errors at both a 1280×900 desktop size and a 390×844 phone
  size; the scattered cluster doesn't overlap or overflow at desktop width (confirmed by screenshot
  — see this session's own notes for what that first pass caught: the Metronome tile's
  `BeatIndicator` wrapped onto two rows at the card's ~208px width using its default size, fixed by
  passing `size="sm"`); the mobile 2-column grid reads cleanly; and clicking the new search button
  genuinely opens the command palette (`paletteVisible` confirmed via a Playwright locator, not
  just "a click didn't throw"). This capability (nix chromium + playwright-core over CDP) isn't
  yet captured as a reusable project skill — worth a `/run-skill-generator` pass at some point so
  future sessions don't have to rediscover it from scratch.

  **A real bug this same verification setup then caught**, reported directly ("when hovering over
  the metronome widget thing it goes too far down"): the hero `PreviewCard`'s centering
  (`left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`, needed to center a `w-52` box at the
  cluster's exact midpoint) and `PreviewCard`'s own `hover:-translate-y-1` lift lived on the *same*
  element. Tailwind v4 compiles every `translate-*` utility to the same `--tw-translate-y` custom
  property plus a full `translate: var(--tw-translate-x) var(--tw-translate-y)` reassignment —
  confirmed by reading the actual compiled rules directly
  (`document.styleSheets[i].cssRules`, recursing into the `@layer`/`@media (hover: hover)` blocks
  Tailwind nests them in) rather than assumed from how the utility classes read. Since
  `.hover\:-translate-y-1:hover` has higher specificity than plain `.-translate-y-1\/2` (the
  `:hover` pseudo-class adds to it), the hover rule always wins while hovering — snapping
  `--tw-translate-y` from `-50%` (centering) to `-0.25rem` (the intended lift), which reads as the
  card suddenly dropping down about half its own height, not lifting. Fixed by moving the
  centering transform onto a plain wrapper `<div>` around the hero `PreviewCard`, so the Link
  itself only ever carries the hover transform, with no base translate-y for it to clobber — the
  four scattered (non-hero) cards never had this problem, since they're positioned with `rotate-*`
  utilities instead, a separate CSS custom property (`--tw-rotate`) that doesn't collide with
  `--tw-translate-y` at all. Caught and fixed using the same nix-chromium setup described above —
  reading the exact compiled CSS rule text to confirm the specificity/cascade mechanism by hand,
  since this particular headless Chromium build reports `(hover: hover)` as `false` — a real,
  separately-noted limitation of this nix-chromium setup — so simulated mouse hovers never
  actually trigger `:hover` styles to screenshot before/after directly, even after trying to
  override it via CDP's `Emulation.setEmulatedMedia`. `tsc`, `eslint`, and `next build` all pass.

  **The waveform-behind-the-wordmark treatment, extended app-wide.** Three more direct follow-ups:
  first, "overlay the sheddex logo over the bars" — the hero's waveform strip and "sheddex" title
  used to just stack vertically (bars, then a gap, then the heading); now they share one box, bars
  centered (`items-center`, not the strip's old `items-end` baseline-only growth) so a tall bar can
  extend both above and below the text's own line, with the heading rendered on top
  (`position: relative`, painted after its absolutely-positioned sibling in DOM order — no
  `z-index` needed for two `auto`-stacked siblings). Second, "lower opacity of waveform" —
  `bg-accent/40` → `bg-accent/20`, so the bars read as texture behind the bold text rather than
  competing with it. Third, "do the same thing for the sheddex in the side bar and mobile menu":
  rather than copy the hero's markup twice more (a third drifting copy), the whole effect moved
  into a new shared `components/Wordmark.tsx`, used by the hero *and* both of `Sidebar.tsx`'s own
  "sheddex" lockups (desktop header, mobile menu header) — one definition, not three. It takes two
  separate hand-tuned bar arrays (`WAVEFORM_LG`/`WAVEFORM_SM`, the same "hand-picked, not
  `Math.random()`'d — a real hydration mismatch otherwise" reasoning as the original array), since
  the much narrower sidebar/mobile lockup needs a different bar *density* to read right behind
  smaller text, not just fewer of the hero's own bars; a `heading` prop swaps the inner "sheddex"
  between a plain `<span>` and an `<h1>`, since the hero's copy is also the page's real main
  heading and the sidebar's own copies never were. Verified with the same nix-chromium setup,
  zoomed in via `document.body.style.zoom` before screenshotting a locator directly (the sidebar/
  mobile lockups render at only ~70×32px in reality — the bars are genuinely there and correctly
  proportioned at actual size, confirmed by inspecting each bar's real `getBoundingClientRect()`
  directly, but too small to visually read as a texture rather than noise in an un-zoomed
  screenshot, the same way they'd be hard to make out on an actual phone/sidebar at 100% zoom
  without looking closely) — both zoomed screenshots show the same bars-peeking-through-letterforms
  look the hero already had. `tsc`, `eslint`, and `next build` all pass.
- **Privacy Policy / Terms of Service** (`app/privacy/page.tsx`, `app/terms/page.tsx`,
  `components/LegalPage.tsx`) — plain prose pages, not tools (no `ToolLayout`), and plain Server
  Components (no `"use client"` anywhere in either — no interactivity needed). Linked from
  `Home.tsx`'s footer and, only during the sign-up flow specifically, `AccountMenu.tsx`'s
  `AuthForm`. Written to accurately describe what this app *actually* does (client-side-only
  tool data, what an account collects, the Convex/Resend/Google/Vercel third parties involved,
  no analytics/tracking anywhere in the codebase — confirmed by grepping for common trackers
  before writing this), with jurisdiction (Los Angeles County, California) and the
  privacy-request contact channel (GitHub issues, reusing what `README.md` already directs bug
  reports to) both confirmed with Jack rather than assumed. **Not reviewed by an actual lawyer**
  — a reasonable, honest starting point given this app's genuinely low-risk profile (no payments,
  no ads, minimal data collection), not a substitute for real legal review if that ever matters
  more (e.g. it picks up real users, or the planned data-sync phases land).

## Backend (Convex)

Phase 1 was accounts only, nothing synced; Practice Timer's saved sessions came next as the first
synced *domain* (its own dedicated `practiceSessions` table — see its bullet in the tools list
above). This phase generalized that to **every tool's settings and data**, in one pass rather than
domain-by-domain: tunes, every trainer's instrument/tolerance/playback/pool settings *and* their
lifetime struggle stats and timed history, the Chord Charts library, Metronome/Tuner/Slow Downer/
Recorder's settings, all of it. Every tool still works fully with no account — signing in is still
a pure addition, never a requirement.

**The sync rule is the same everywhere, and it's deliberately simple: no merge.** Signed out, a
tool reads/writes this device's localStorage exactly as it always has. Signed in, it reads/writes
the account instead, full stop — whatever's already in localStorage on that device is **not**
imported, merged, or offered as a choice; it's just not consulted anymore. This was an explicit
simplification Jack asked for over a fancier first-login merge-prompt design that had been
sketched earlier (three-way "keep local / use synced / merge both" choice) — simpler to reason
about, simpler to implement correctly, and the risk case an elaborate merge exists to avoid
(silently losing data) can't happen when there's nothing automatic to get wrong: you'd have to
explicitly want the account's version by signing in.

**One generic mechanism covers nearly all of it**, rather than a hand-typed Convex table per tool
(what the original two-domain plan called for, and genuinely fine at that scale — not at
literally-every-tool scale). Every tool's settings object already round-trips through
`JSON.stringify`/`JSON.parse` for `usePersistedSettings` (`lib/usePersistedSettings.ts`) — that's
what makes it localStorage-safe today — so it's already guaranteed JSON-safe, and storing it as
one opaque blob account-side means a new tool, or a new field on an existing tool's settings, never
needs a matching schema change on the Convex side:
- `convex/schema.ts`'s `syncedSettings` table — one row per `(userId, key)`, `value` holding that
  tool's *entire* settings object as one JSON string. `key` is simply that tool's own existing
  localStorage key string, reused as-is (e.g. `"jam-practice-note-trainer"`,
  `"jam-practice-metronome"`) — one obvious key per call site, not a second naming scheme to keep
  in sync alongside it. `convex/syncedSettings.ts` (`get`/`set`, both scoped to
  `getAuthUserId(ctx)`) is the only Convex code this needed.
- `lib/syncedStore.ts` — the shared machinery underneath `useSyncedSettings`/`useSyncedTunes`: a
  module-level, per-`key` in-memory cache of "the current value while signed in"
  (`getSyncedValue`/`setSyncedValue`/`seedSynced`/`resetSynced`/`subscribeSynced`), updated
  *synchronously* on every local edit and written to Convex only after a `DEBOUNCE_MS` (600ms)
  quiet period. This exists because the first version of these hooks — writing straight to Convex
  on every `update()` call, with "current value" derived fresh from `useQuery`'s result each
  render — had two real problems, both hit directly: adding several tunes quickly (multiple
  standards in a row) silently dropped all but the last one, and the whole site felt sluggish
  since *every* setting change, however small, was a live network round-trip. The stale-closure
  drop happened because two rapid `update()` calls both closed over the same pre-edit snapshot (the
  query hadn't echoed the first write back yet), so the second call's "previous value" excluded the
  first call's edit; keeping the authoritative "current value" in a synchronous module-level cache
  instead of a value closed over from a stale render fixes that — every edit reads whatever the
  *last* edit actually left behind, never a stale echo. The network-call flood is fixed by the
  debounce: a local edit updates the cache and every subscribed component instantly (still feels
  synchronous to type/drag against), but only the *last* value in a burst of edits actually gets
  sent, once the burst goes quiet. `seedSynced` only applies a value the *first* time a real server
  read arrives for a key in the current signed-in session (never overwriting an edit already made
  locally with a lagging echo of the old value); `resetSynced`, called on sign-out, clears that
  so a different account signing in afterward re-seeds fresh instead of quietly showing the
  previous account's cached values — and flushes any not-yet-fired debounced write immediately
  first, so an edit made right before signing out still lands rather than being silently dropped.
  Verified with a synthetic Node script exercising all of this directly (rapid-edit accumulation +
  single collapsed write, seed-never-clobbers-a-local-edit, reset-flushes-then-clears) — see
  "What's genuinely untested" for what that script can't cover (an actual live Convex round-trip).
- `lib/useSyncedSettings.ts` — a **drop-in replacement** for `usePersistedSettings(key, defaults)`:
  identical signature, identical `[settings, update]` return shape, identical "defaults must be a
  stable module-level object" rule. Signed out it's a pure passthrough to the real
  `usePersistedSettings` (zero behavior change, zero regression risk — it's the same code
  underneath) *and* the Convex query is passed `"skip"` instead of real args, so a signed-out
  visitor never opens a live subscription for data they can't have at all (a real, avoidable cost
  the first version paid on every tool, every page load, regardless of sign-in state). Signed in,
  it reads/writes through `syncedStore.ts` as described above. The defensive "keep only fields
  whose type matches defaults" logic that protects a tool's UI from corrupt/foreign localStorage
  data (`mergeWithDefaults`, extracted out of `lib/usePersistedSettings.ts`'s previously-private
  `read()` so both paths share it) applies identically to whatever comes back from the account, for
  the same reason. Every tool's own `usePersistedSettings(SETTINGS_KEY, DEFAULT_SETTINGS)` call
  became `useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS)` — that one-line swap, nothing else in
  the component changed, since `noteStats`/`history`/every other field a trainer already keeps in
  that same settings object rides along automatically. Both `useConvexAuth()` and the underlying
  Convex `useQuery`/`useMutation` calls run unconditionally regardless of sign-in state, per
  rules-of-hooks — only the *returned* value, what `update` writes, and the query's `"skip"`
  argument branch on it (same pattern as every other signed-in-aware code in this codebase, e.g.
  `AccountPage.tsx`).
- `lib/useSyncedTunes.ts` — the one exception to "every tool goes through `useSyncedSettings`":
  Jam Practice's tune list isn't a `usePersistedSettings` object, it's `lib/tunesStore.ts`'s own
  hand-rolled external store (`subscribe`/`getSnapshot`/`setTunes`, used directly via
  `useSyncExternalStore` at four separate call sites — `JamPractice.tsx`, `TunesPanel.tsx`,
  `TunesManager.tsx`, `StandardsPicker.tsx`). Same "one JSON blob per key" shape fits it fine
  though, so it rides the *same* `syncedSettings` table, `syncedStore.ts` debounce/race-fix
  machinery, and `"skip"`-when-signed-out optimization under a fixed key, `"tunes"` — no table of
  its own. `useSyncedTunes()` is a drop-in replacement for that `useSyncExternalStore(...)` triple,
  returning the same `[tunes, setTunes]` shape, so all four call sites needed only an import swap.
  The debounced write in `syncedStore.ts` fires from a `setTimeout` (not from inside a React
  render) but still calls the owning hook's own `useMutation`-returned function, captured in the
  closure `setSyncedValue`/`resetSynced` are given — confirmed safe by reading Convex's own
  `useMutation` source (`node_modules/convex/dist/esm/react/client.js`): it returns a plain
  function bound only to the client instance and the mutation reference via `useMemo`, with no
  dependency on the calling component's own mount state, so it's still callable well after that
  component has unmounted.
- **What deliberately did *not* move to this mechanism**, and why:
  - Pure UI chrome — `CollapsiblePanel`/`OptionsCard`'s open/collapsed + "show hints" state
    (`lib/panels.ts`), the sidebar's width/collapsed state (`components/Sidebar.tsx`), the
    options-column/side-panel hidden toggles. None of this is "this tool's data" the way Jack meant
    it — it's per-device layout, and a phone and a desktop reasonably want different panel layouts
    anyway. Stayed on plain `usePersistedSettings`, unaffected by sign-in.
  - Chord Charts' `VIEW_KEY` (`selectedId`, `barsPerRow`) — a device-local display preference, not
    data — this file already drew exactly this line between `LIBRARY_KEY` (synced) and `VIEW_KEY`
    (not) before sync existed at all; sync just followed the line that was already there.
  - Waveform markers (`lib/markers.ts`) — small JSON, but keyed to a locally-uploaded file
    (`"<filename>|<filesize>"`) that isn't itself synced (see next bullet), so a synced marker set
    would be a dangling reference pointing at nothing on another device.
  - Recorder's project metadata and Slow Downer's loaded files — genuinely out of scope, unchanged
    from the original plan: the actual audio lives in IndexedDB as `Blob`s (`lib/projectStore.ts`,
    `lib/fileLibrary.ts`), which needs Convex file storage and a real sync design, not a JSON blob
    write. Both tools' small *settings* objects (volume, snap, track height, ...) did switch to
    `useSyncedSettings` like everything else — only the large binary data stayed local.
  - Theme (`lib/theme.ts`) — arguably could be nice to follow you across devices, but it's an
    app-wide display preference, not a specific tool's "options" in the sense Jack asked for, and
    wasn't part of this request — left alone, a candidate for later if it's ever actually wanted.

**Deploying it — two separate targets, not automatic together by default.** A `git push` alone
only redeploys the frontend (Vercel); it does *not* push anything under `convex/` to the
production Convex deployment (`grandiose-dolphin-564`) — that's a genuinely separate step
(`npx convex deploy`) unless wired together, which `vercel.json`'s `buildCommand` now does:
```
npx convex deploy --cmd 'pnpm build'
```
This deploys Convex functions *before* building the frontend, on every Vercel build, so the two
can't drift out of sync (a frontend build that depends on a Convex function that hasn't been
deployed yet would otherwise just break in production). It authenticates via a `CONVEX_DEPLOY_KEY`
environment variable in Vercel (a **Production**-scoped deploy key from the Convex dashboard's
Deploy Keys page — deliberately not set for Preview/Development, so a future preview-branch build
can't accidentally push to production Convex) rather than a personal login, which is what makes it
safe to run inside an automated build at all — `npx convex deploy` refuses to run non-interactively
under a personal login (confirmed directly: it prompts "Do you want to push your code to your prod
deployment now?" and hard-refuses even with `CI=1` set or `y` piped into stdin — a deploy key is
the only way around that prompt, not a flag).
- `convex/schema.ts` — `{...authTables}` (Convex Auth's own tables: `users`, `authAccounts`,
  `authSessions`, etc.) plus `pendingConfirmations` (below) and two app-data tables:
  `practiceSessions` (`convex/practiceSessions.ts` — list/create/update/remove, all scoped to
  `getAuthUserId(ctx)`), one row per saved Practice Timer session, shaped like
  `lib/practiceTimer.ts`'s `PracticeSession` minus its own `id` (the Convex document id doubles as
  that once synced); and `syncedSettings` (`convex/syncedSettings.ts` — `get`/`set`), the generic
  one-JSON-blob-per-`(userId, key)` table every other tool's settings (and Jam Practice's tunes)
  sync through — see this section's own paragraph above for why that one's generic rather than
  hand-typed per tool.
- `convex/auth.ts` — `convexAuth({ providers: [Password({ verify: ResendOTP }), Google] })`.
  Google is listed in code already but **won't actually work** until `AUTH_GOOGLE_ID`/
  `AUTH_GOOGLE_SECRET` are set on the deployment (`npx convex env set ...`) and a matching OAuth
  Client ID exists in Google Cloud Console with redirect URI
  `https://<deployment-name>.convex.site/api/auth/callback/google` — a one-time manual step only
  Jack can do (his own Google account). Same story for `verify: ResendOTP` — it needs
  `AUTH_RESEND_KEY` set (a Resend account, its own one-time signup) before it can actually send
  anything; see the email-confirmation bullet below. Until both exist, "Continue with Google"
  fails and password sign-up gets stuck waiting on a code that was never sent — the account page's
  password flows have the exact same dependency.
- **Email** (`convex/lib/resend.ts`, `convex/ResendOTP.ts`) — one shared `sendEmail` helper, a
  thin `fetch()` wrapper around Resend's plain HTTP API (`https://api.resend.com/emails`) rather
  than their Node SDK, since Convex actions can already call external APIs directly — no reason to
  add a dependency just to POST one JSON body with a bearer token. Reads `AUTH_RESEND_KEY` (throws
  a clear "you haven't set this yet" error if it's missing, rather than a confusing failure deeper
  in) and an optional `AUTH_EMAIL_FROM` (defaults to `onboarding@resend.dev`, Resend's own
  no-setup-required sending address — a verified custom domain is a nicer `from` address but isn't
  required to get this working). Two things live here rather than in `convex/account.ts`, since
  both are used by more than one caller: `generateOtp` (a 6-digit numeric code — short enough to
  type by hand, unlike Convex Auth's own 32-character default verification token) and `hashCode`
  (SHA-256 via the Web Crypto API already available in Convex's action runtime — confirmation
  codes are stored hashed, not in plaintext, in `pendingConfirmations` below). `ResendOTP.ts` wraps
  `sendEmail`/`generateOtp` as an `Email`-type provider (`@convex-dev/auth/providers/Email`) for
  Convex Auth's own sign-up verification — see the `auth.ts` bullet above. It only supplies *how*
  to send the code; Convex Auth's `Password` provider already owns *when* to trigger it (a fresh
  sign-up, or any account whose `emailVerified` isn't set yet — traced through the installed
  package's actual source, `Password.ts`'s `authorize` function, to confirm this rather than
  guessing) and the code storage/expiry/one-time-use machinery (`authVerificationCodes`, already
  part of the schema via `authTables`, previously unused since verification was never turned on
  before now).
- `convex/users.ts` — one `current` query (the signed-in user's own doc, or `null`) for the
  account button to show who's signed in. Not a synced-data domain, just identity.
- `components/AccountMenu.tsx` — the sign-in/account UI, **built from scratch, no premade auth
  widget** (Jack asked for this explicitly): signed out, a small custom modal with email+password
  (sign-in/sign-up toggle) and "Continue with Google", styled to match this app's own
  `ConfirmDialog`/`PromptDialog` conventions (same backdrop/panel/Escape-to-close shape). A
  password sign-up (or any pre-existing account that's never verified its email) doesn't complete
  right away — `signIn("password", {...})` resolves with `{signingIn: false}` and no error, which
  the form reads as "a code was emailed" and swaps to a "check your email" step;
  `signIn("password", {email, code, flow: "email-verification"})` completes it. That
  `signingIn`/thrown-error distinction is the only signal the client gets — confirmed by reading
  the actual client `signIn` implementation (`@convex-dev/auth`'s `client.tsx`) rather than
  assuming a shape. Signed in, it's a plain link to the `/account` page instead (below) — mounted
  in `components/Sidebar.tsx` as a sibling of `ThemeButton` in both footers (desktop `<aside>` and
  the mobile overlay), same `collapsed`/`large` prop shape, plus an `onNavigate` so the mobile
  overlay closes itself on tap, same as every other nav link there.
- **`/account`** (`app/account/page.tsx` / `components/AccountPage.tsx`) — password (change or set
  one for the first time), sign-in methods (connect/disconnect Google), and delete account, laid
  out as its own small Profile/Security/Danger zone sidebar (`AccountNavButton`, a plain
  `useState<AccountView>` tab switch, not routing — the page itself widens from the loading/
  signed-out states' `max-w-md` to `max-w-3xl` via `PageShell`'s `wide` prop to fit it, and stacks
  to a full-width column above the content on narrow screens rather than a fixed sidebar): Profile
  is a read-only summary (email, name if the account has one, which providers are linked); Security
  holds `PasswordSection` + `SignInMethodsSection`; Danger zone holds the delete-account section.
  Sign out sits below a divider at the bottom of that same nav list as a direct action (not a
  fourth view — clicking it signs out immediately, same as the plain button it replaced). Creating
  an account, changing/setting a password, and deleting an account (except a Google-only account —
  see below) all now require confirming a code emailed first, per an explicit follow-up request; a
  "forgot password" *reset* flow (recovering access when you don't know your *current* password at
  all) is still deliberately not implemented — a different thing from the email confirmations this
  section describes, and still out of scope. No route protection, consistent with the rest of the
  app — visiting it signed out just shows a plain "you're not signed in" message instead of
  redirecting. `convex/account.ts`'s `linkedProviders` query (which providers — `"password"`,
  `"google"` — are on the signed-in user's `authAccounts` rows) drives which of these sections show
  what.
  - **Password** (`PasswordSection`) is one section that's either "Change password" (has one
    already) or "Set a password" (Google-only so far) — same `linkedProviders` check throughout
    this feature — and now a two-step flow either way: step 1 (`requestPasswordConfirmation`)
    verifies the *current* password if there is one (`retrieveAccount`, throws on a mismatch) and
    emails a code; step 2 (`confirmPassword`) takes that code plus the new password and actually
    applies it, re-checking `linkedProviders` *again* at that point (rather than trusting which
    step-1 path was taken) to decide between `modifyAccountCredentials` (existing password — then
    `invalidateSessions` on every *other* session, since a leaked old password shouldn't still
    work elsewhere) and `createAccount` with `shouldLinkViaEmail: true` (first password — links to
    the *already-signed-in* user by matching their already-verified email rather than accidentally
    creating a second user; Convex Auth's account linking is fundamentally email-match-based, not
    session-based — traced through the installed package's actual source,
    `defaultCreateOrUpdateUser`, to confirm this rather than guessing — with the same defensive
    `linkedUser._id === userId` check as before). The new password is deliberately never sent to
    step 1 at all and never touches the database before step 2 succeeds — it just sits in
    `PasswordSection`'s own React state between the two submits, so a password is never persisted
    anywhere while a confirmation is still pending.
  - **Sign-in methods** (`SignInMethodsSection`) — "Connect Google" is literally the same
    `signIn("google")` OAuth flow as signing in, relying on that same email-matching linking
    behavior; it only lands on *this* account if the Google account's email matches. Since that's a
    real, somewhat confusing failure mode (a mismatched email silently signs into — or creates — a
    *different* account instead, with no error), `useGoogleLinkWarning` records the current email
    in `sessionStorage` right before redirecting to Google, then — on the fresh page load once
    Google redirects back — compares it against whoever's actually signed in and shows a plain-
    language warning if they don't match. Reads the marker once via a lazy `useState` initializer
    (safe — it only runs at mount) and derives the warning as a plain value during render; the
    accompanying `useEffect` only clears the marker (a real side effect against sessionStorage), it
    never calls `setState` itself — hit `react-hooks/set-state-in-effect` on a first draft that did
    call `setState` synchronously inside the effect body, restructured to avoid it. "Disconnect
    Google" (`disconnectGoogle` action) is only enabled once a password exists — checked both
    client-side (the button's `disabled`) and server-side (the action re-checks
    `linkedProviders`, since the action is the real source of truth, not the UI) — so there's
    always at least one way to sign back in. (Disconnecting doesn't need an emailed confirmation
    itself — only creating/deleting/changing credentials does, per the request that added this
    whole section — but it's already gated behind having a password, which is its own form of
    "prove you can still get in another way.")
  - **Delete account** is a confirm-first modal (`DeleteAccountModal`, following `ConfirmDialog`'s
    own shape) with two different paths depending on `linkedProviders`, per an explicit exception
    for accounts with only Google and no password: a password-holding account goes through the
    *same* two-step emailed-confirmation shape as the password section — step 1
    (`requestDeleteConfirmation`) verifies the password and emails a code, step 2 (`confirmDelete`)
    takes the code and actually deletes; a Google-only account instead keeps the original
    single-step "type `DELETE`" flow straight into `deleteAccount` — no password to gate an email
    behind, and the typed confirmation is treated as enough friction on its own for that case.
    `deleteAccount` itself now refuses outright if the account *does* have a password (so it can't
    be used to route around the email confirmation those accounts require — the action is the
    source of truth, not which UI path the client happened to take). Whichever path runs, the
    actual deletion is the same `internalMutation` (`performDelete`) hand-cascading across Convex
    Auth's own tables — there's no built-in "delete this user" helper, so this walks `authAccounts`
    (by the `userIdAndProvider` index) deleting each one's `authVerificationCodes` (by `accountId`)
    first, then `authSessions` (by `userId`) deleting each one's `authRefreshTokens` (by
    `sessionId`) first, then the `users` row itself — the same per-account delete helper
    (`deleteAuthAccountAndCodes`) is shared with "Disconnect Google" above, since it's the same
    operation just scoped to one provider instead of all of them. Deliberately *doesn't* also sweep
    `authVerifiers`/`authRateLimits` — neither has a `userId`-scoped index (short-lived PKCE/
    rate-limit bookkeeping, not reachable without a full table scan), and once the account+session
    rows are gone the user can't sign back in regardless. The client calls `signOut()` right after
    either path succeeds, since the server-side rows being gone doesn't by itself clear this
    device's cached token.
  - **`pendingConfirmations`** (`convex/schema.ts`) is the one table behind both the password and
    delete-account confirmation flows: one row per `(userId, kind)` (`"password"` or
    `"deleteAccount"`), storing a SHA-256 hash of the code (not the code itself) plus an expiry
    (15 minutes). A fresh request (`storeConfirmation`, `internalMutation`) deletes any existing
    pending row for that same `(userId, kind)` before inserting — no stacking multiple live codes.
    `consumeConfirmation` checks the submitted code's hash against the stored one and the expiry in
    one step, deleting the row either way it's actually used (success) — a wrong or expired code
    just leaves the pending row in place to actually expire on its own. This is deliberately
    separate machinery from Convex Auth's own sign-up verification (`authVerificationCodes`, owned
    entirely by the library) — these are app-specific confirmations for actions taken *after*
    already being signed in, not part of authenticating in the first place.
- `components/ConvexClientProvider.tsx` + `app/layout.tsx` — the app's first-ever React context
  providers. **`ConvexAuthNextjsServerProvider` is required, not optional** — confirmed by trying
  to remove it: `pnpm build` then fails outright while prerendering (`Cannot destructure property
  'isLoading' of 'c(...)' as it is undefined`), because Convex Auth's client-side auth context
  isn't safely renderable during Next's static-generation pass on its own. Keeping it means every
  route builds as `ƒ Dynamic` (server-rendered on demand) instead of the `○ Static` every route
  was before this session — a real, unavoidable cost of adding Convex Auth to the root layout, not
  a missed optimization. Worth knowing if page-load performance or hosting cost ever seems off
  after this.
- `proxy.ts` (repo root) — `convexAuthNextjsMiddleware()`, no route-gating (every tool stays fully
  usable signed out, by design). Named `proxy.ts`, **not** `middleware.ts` — Next.js 16 (this repo
  is on 16.3.4) renamed the convention; the API is unchanged, just the filename.
- `convex/_generated/` is **committed** to the repo (there's no CI here that runs `convex dev`
  first, so committing keeps `tsc`/`pnpm build` runnable standalone). Regenerate it with
  `npx convex dev --once` after any change to a `convex/*.ts` file — `tsc` will fail against a
  stale `api.d.ts` otherwise (hit this directly while building this phase: adding `convex/users.ts`
  didn't show up in `api.*` until re-running).
- Package manager is **pnpm only** now — the stray `package-lock.json` (this repo briefly had
  both) has been deleted; `pnpm-lock.yaml` + `pnpm-workspace.yaml` are the real ones.
- No password reset / email verification (deliberately deferred — needs a transactional email
  provider like Resend, which is out of scope for this phase). If email+password sign-up
  succeeds but someone forgets their password, there's currently no recovery path.
- **What's genuinely untested here**: none of the actual sign-up/sign-in/sign-out flow, or the
  Google OAuth round-trip, has ever been clicked through in a real browser — this sandbox has no
  working browser (same limitation noted elsewhere in this file for Chord Charts'
  `FitChordRow`/Playwright). `tsc`/`pnpm lint`/`pnpm build` all pass and `npx convex dev --once`
  successfully pushes the schema/functions to a real dev deployment, but none of that proves the
  UI actually works end to end for a person clicking through it. Needs a real pass by Jack: sign
  up, sign in, sign out, refresh persistence, both sidebar chrome states (desktop
  expanded/collapsed, mobile), and — once the Google Cloud OAuth app exists — "Continue with
  Google" specifically. Same goes for `/account`'s change-password (including that
  `invalidateSessions` actually signs out other devices/tabs and not the current one) and
  delete-account flows (including the cascade delete genuinely leaving no way to sign back in, and
  that a Google-only account's `DELETE`-to-confirm path works with no password field shown). And
  now, the account-linking additions specifically: whether "Set a password" on a Google-only
  account really attaches to the same user (the `linkedUser._id !== userId` check is only a
  same-session sanity check — it can't prove `shouldLinkViaEmail`'s underlying matching behaved as
  read from the library's source, only that this action didn't return an obviously-wrong user id);
  whether "Connect Google" with a *matching*-email Google account actually links instead of
  erroring; and whether the mismatched-email warning (`useGoogleLinkWarning`) actually fires
  correctly across a real Google OAuth redirect round-trip, versus just working in theory against
  the sessionStorage read/write logic in isolation. And now the whole email-confirmation layer:
  whether Resend actually delivers (needs `AUTH_RESEND_KEY` set — a Resend account, its own
  one-time signup, same category of prerequisite as Google's OAuth app; not done as of this
  writing), whether the default `onboarding@resend.dev` sender lands in an inbox instead of spam
  without a verified custom domain, the full sign-up "enter code, get signed in" round-trip
  (`ResendOTP`/Convex Auth's own `email-verification` flow), and both of `convex/account.ts`'s
  request/confirm pairs end to end (`requestPasswordConfirmation`/`confirmPassword`,
  `requestDeleteConfirmation`/`confirmDelete`) — including that a wrong or expired code is
  actually rejected by `consumeConfirmation`, and that a fresh request really does replace (not
  stack alongside) an earlier unconfirmed one. Only verified so far: `generateOtp`/`hashCode`
  (`convex/lib/resend.ts`) against a synthetic Node script (6-digit codes, deterministic/collision-
  free SHA-256 hashing) and that every new Convex function type-checks and deploys — nothing about
  an actual email ever having been sent or received.

**Public profiles & follows** — this app's first genuinely public, social feature (see the
Community bullet in the tools list above), and its first-ever file upload. Two new tables:
- `profiles` (`convex/profiles.ts`) — one row per user: `username` (always lowercased, both stored
  and displayed — no separate display-case, so there's never a "@JohnSmith" vs. "@johnsmith"
  ambiguity to reason about; validated by `lib/username.ts`'s `usernameError`/`normalizeUsername`,
  the same functions used client-side for instant feedback and server-side as the actual
  source-of-truth check — client validation is never trusted alone), `avatarStorageId` (a Convex
  file-storage reference — see below), `instruments` (free text, not `lib/instruments.ts`'s
  `INSTRUMENTS` catalog — that list is range-specific for the note trainers, a poor semantic fit
  for "what do you play"; `lib/profileInstruments.ts`'s `COMMON_INSTRUMENTS` drives autocomplete
  only, never validated against), and `isPublic`. Nothing on a profile is visible to anyone but its
  owner while `isPublic` is false. `knownTuneIds` (`v.optional`, unused) is a deprecated leftover
  from an earlier design — see the tune-lists paragraph below for why it's gone.
- `follows` (`convex/follows.ts`) — one row per `(followerId, followingId)` pair; `follow` checks
  for an existing row first so it's idempotent, never a duplicate. Both Following and Followers
  show on a profile — gated the same way the rest of it is: always visible for your own account,
  otherwise only if that profile is public (`canViewFollowGraph`) — a private profile's social
  graph stays private too, not just its tune list.

**Usernames are now required for every account** — per an explicit follow-up request, not
optional-until-you-go-public the way `profiles` was originally designed. Enforced as a follow-up
step rather than threaded into sign-up itself, since Convex Auth's own Password/Google flows have
no field for one: `components/UsernamePrompt.tsx`, mounted once app-wide in `app/layout.tsx`
alongside `PracticeTimerAlert`, shows a full-screen, deliberately non-dismissable modal (no
Escape, no backdrop click — same reasoning as that alert) to any signed-in user whose
`api.profiles.getMine` is `null` or has `username === ""` (the same empty-string sentinel
`setAvatar` already used for "profile row exists, no username chosen yet"). It submits through a
new, minimal-field `claimUsername` mutation rather than reusing `upsertProfile` — the latter also
writes `instruments`/`isPublic`, which this prompt knows nothing about and shouldn't be able to
clobber on an existing row. The sidebar's account button (`AccountMenu.tsx`) now shows the
signed-in user's real profile picture (`UserAvatar`, reading `api.profiles.getMine`'s `avatarUrl`)
and `@username` instead of a generic person icon and their email — falling back to email/name only
in the brief window before `UsernamePrompt` forces a username to exist at all. Verified against the
real dev deployment: `claimUsername` correctly rejects an unauthenticated caller, and
`usernameAvailable` correctly reports an empty string as unavailable. **Not verified**: the prompt
actually appearing and blocking the rest of the app for a real freshly-signed-up or
no-username-yet account, and the avatar/username swap rendering correctly in both sidebar footers
— this sandbox still has no working browser.

**A public profile's tune lists aren't curated — it shows everything, automatically.** The first
version had a "which of your tunes should show" picker (`knownTuneIds`, a hand-picked subset) on
the Public Profile tab; per a direct follow-up request that was removed entirely — a public profile
now just shows *every* tune in the owner's own lists, full stop, nothing to ask about. There are
two such lists, both shown as their own section on the profile page (`app/u/[username]/page.tsx`):
**Tunes** (the same list Jam Practice and the account's own "Tunes" tab use, `"tunes"` in
`syncedSettings`) and **Tunes to Learn** — a new, separate personal list
(`lib/useTunesToLearn.ts`/`lib/tunesToLearn.ts`, its own fixed `syncedSettings` key,
`"jam-practice-tunes-to-learn"`) for tunes bookmarked from *other* people's profiles, kept
deliberately apart from your own practice list rather than mixed into it. It rides the exact same
generic `syncedSettings` table and the same `lib/syncedStore.ts` debounce/stale-closure-race fix as
`useSyncedTunes`, but — like Favorites (`lib/useFavorites.ts`) — is **account-only**, with no
signed-out local-storage fallback: the only way to ever add something to it is visiting another
account's public profile, which already requires being signed in, so there's no meaningful
signed-out story for it to fall back to. It gets its own **Tunes to Learn** tab in `/account`
(`components/TunesToLearnTab.tsx`, between Tunes and Public Profile) — the exact same
`TuneListManager` layout the Tunes tab uses (see that section below), just with standards-adding
turned off, since there's nothing to browse here — everything on this list arrives by being copied
from someone else's profile, not looked up.

`convex/profiles.ts`'s `getPublicByUsername` is the one query in this app that reads across users'
data *by design* — a public profile's tune lists have to come from the *owner's* `syncedSettings`
rows, not the caller's, unlike every other synced-data query here (`convex/syncedSettings.ts`'s
`get`, deliberately self-scoped via `getAuthUserId(ctx)`). Rather than loosen that existing query
into a general "read anyone's data" backdoor, this reads the owner's `"tunes"` and
`"jam-practice-tunes-to-learn"` rows directly and resolves each through `lib/profileTunes.ts`'s
`resolvePublicTunes` — a pure function returning full `{id, name, tempos, keys, timeSignature}` for
*every* tune in the blob (no id filter anymore — see above), but never `notes` (which could hold
private practice notes). Also returns `null` — indistinguishable — for both "no such username" and
"that profile exists but isn't public", so a visitor can't tell the two apart by probing usernames.

**Viewing someone else's profile shows their tunes in the same styled list Jam Practice itself
uses** (`components/PublicTuneList.tsx` — name, time signature, tempo/key chips, styled after
`TunesTab.tsx`'s own rows), not the plain name pills the first version showed, per a direct
follow-up request. The same component renders both the Tunes and Tunes to Learn sections — which
list a tune came from doesn't change what a viewer can do with it. A signed-in viewer looking at
someone *other* than themselves (`canAdd` on that component) gets two per-row actions, each copying
that tune into one of the *viewer's own* lists as a fresh, independent tune (new ids throughout,
`notes` always empty since a public profile never exposes it to copy in the first place): "Add"
into their own Tunes, "Learn" into their own Tunes to Learn — each disabled once a tune with a
matching name (`lib/standards.ts`'s `nameId`, the same name-insensitive match the jazz-standards
picker already uses) is already in that target list. Copying is a snapshot, not a live reference —
once it's in your list, it's yours to edit or delete independently of whatever the original owner
does to theirs afterward, same reasoning as importing a CSV or adding a jazz standard.

**File storage** (profile pictures): Convex's built-in `_storage` system table, no schema entry
needed beyond referencing `v.id("_storage")`. The standard two-step upload flow — `profiles.ts`'s
`generateAvatarUploadUrl` mutation returns a one-time URL, the browser `fetch()`s a POST straight
to it (bypassing Convex's own request path entirely) with the image bytes, gets back
`{storageId}`, and `setAvatar` attaches that id to the profile — deleting the previous
`avatarStorageId`'s stored file first, if there was one, so changing your picture doesn't just
leave the old upload orphaned in storage forever. The image itself is resized *client-side* before
any of this — `components/AvatarUpload.tsx`'s `resizeToSquareJpeg`, a plain `<canvas>`
center-crop-and-resize to 400×400 JPEG (no new dependency, same "reach for the platform first"
habit as everywhere else audio-related in this app) — so a multi-megabyte phone photo never
actually reaches the network as anything but a small round picture. `components/UserAvatar.tsx` is
the one shared "picture, or a plain fallback icon" renderer reused everywhere an avatar shows up
(the editor, a public profile, Community search results, Following/Followers lists).

`/account` also has its own **Tunes** tab (`components/TunesTab.tsx`, between Profile and Public
Profile in the sidebar) for managing the same tune list Jam Practice uses — same underlying
`useSyncedTunes()`, so a tune added, edited, or deleted from either place is immediately visible in
the other, no separate copy to keep in sync. It briefly reused `components/TunesPanel.tsx` (Jam
Practice's own compact sidebar-panel UI) as-is, but per a direct follow-up request was rewritten as
its own from-scratch layout instead, since the account page has room Jam Practice's narrow options
column doesn't: Jam Practice spreads tune management across three separate surfaces (the inline
collapsible list; a "search 631 jazz standards" modal reached via a `+`; a "search your tunes"
bulk-select modal reached via a checklist icon) because each only has a cramped sidebar column to
work in, but on the full-width account page there's no reason those need to be three different
screens.

The actual layout — search box, multi-select checkboxes, per-row edit/delete, and a bulk
Select-all/Export/Import/Delete footer — lives in `components/TuneListManager.tsx`, a shared
component both `TunesTab.tsx` and `TunesToLearnTab.tsx` wrap (per a direct follow-up request to put
"this UI" on Tunes to Learn too, rather than duplicating it by hand into a second, drifting copy).
It went through two designs: the first merged "search your tunes" and "browse jazz standards to
add" into the *same* search box (typing a query showed matching standards inline, right below your
own filtered results); per a direct follow-up request that was reverted, since searching your own
tunes surfacing someone else's whole library in the same box read as confusing rather than
convenient. The search box now only ever filters the list it's given — nothing else. Adding a jazz
standard went back to being a separate, explicit action instead: `TuneListManager`'s `allowStandards`
prop makes the header's `+` button open `StandardsPicker`, the exact same search-and-add-or-create-
custom modal Jam Practice's own `TunesPanel` uses, styled as the exact same small round
accent-colored icon button Jam Practice's own `+` is (per a direct request to match it, replacing an
earlier rectangular "+ New tune" text button) — rather than jumping straight to a blank tune editor
the way it does when `allowStandards` is off. **Both tabs turn this on**, including Tunes to Learn —
per a direct follow-up request specifically asking for the Tunes tab's jazz-standards picker there
too, once the first version had it off (reasoning at the time: nothing to browse, everything there
arrives from someone else's profile) — there's a real use for it: bookmarking a standard you want to
learn without first adding it to your actual practice list. `StandardsPicker` originally
read/wrote `useSyncedTunes()` internally with no way to target a different list; it now takes
`tunes`/`setTunes` as optional props instead, used only when passed — Jam Practice's own
`TunesPanel.tsx` call site still passes neither, so it falls back to `useSyncedTunes()` exactly as
before (verified unaffected: zero behavior change, confirmed via `git diff` showing no edit to that
call site at all), while `TuneListManager` always passes its *own* `tunes`/`setTunes` through, so a
standard picked from either tab's `+` lands in whichever list that tab is actually managing, never
always Jam Practice's. **Jam Practice itself (`TunesPanel.tsx`'s own call site, `TunesManager.tsx`)
was deliberately left untouched** throughout all of this — every request was specifically about the
account-only experience, not about changing how Jam Practice's own sidebar panel works; the one
shared file that *did* need a real edit, `StandardsPicker.tsx`, only gained optional props with a
default that reproduces its exact original behavior. Deleting a tune from either tab needs no extra
bookkeeping elsewhere — a public profile shows every tune live at read time (see above), so there's
no separate "known tunes" selection anywhere that could reference a since-deleted id.

**Account deletion now cascades here too** — a real gap found and fixed while building this:
`convex/account.ts`'s `performDelete` previously only cleaned up Convex Auth's own tables
(`authAccounts`/`authSessions`/`authRefreshTokens`/the `users` row), never touching
`practiceSessions`/`syncedSettings` (a pre-existing gap, out of scope to fix here — see that
section's own "genuinely untested" note — since that data is private, not public-facing) or,
critically, this new `profiles`/`follows` data. Left as-is, "deleting your account" would have
left a public profile — username, photo, everything — live and searchable forever, directly
contradicting both the account page and the Privacy Policy's own "removes this visibility
immediately" promise. Fixed: `performDelete` now also deletes the user's `profiles` row (and its
uploaded avatar file via `ctx.storage.delete`, not just the database reference to it) and every
`follows` row in both directions, so a deleted account doesn't leave a ghost entry in anyone
else's Following/Followers list either.

`app/privacy/page.tsx` gained a full "Public profiles" section (what a public profile exposes and
to whom, that Following/Followers are visible under the same public/private rule, that avatars are
resized client-side before upload) plus updates to "The short version", "Who else sees your data"
(Convex now also named as storing file uploads, not just account data), and "Your choices"
(turning a profile private/deleting it any time).

## Advanced layouts (tiling panes)

An opt-in tiling-window-manager-style arrangement for the main content area, built from a
reference screenshot (an old project of Jack's own — "put a button on the top right of every page
that opens the tool search menu for splitting or tiling the window... options to tile down or
right... resize the windows by clicking and dragging the edges... URL [should] correspond to
[the active pane]... disabled by default... option in the bottom of the sidebar"). Off by default
(`lib/useTilingLayout.ts`'s `enabled: false`), toggled from a new button at the bottom of both
sidebar footers (desktop and mobile), right under Theme.

**Data model** (`lib/tilingLayout.ts`, pure functions, no React) — a `PaneTree` is a binary tree:
a `PaneLeaf` (`{ id, href }`) shows one tool; a `PaneSplit` holds exactly two children, a
`direction` (`"row"` = tile right, `"col"` = tile down — deliberately only those two, matching the
request, which never asked for up/left), and a `[number, number]` `sizes` pair summing to 100.
`splitLeaf`/`removePane`/`resizeSplit`/`collectLeaves` are the whole API; `removePane` collapses a
closed leaf's parent split into just the surviving sibling (standard tiling-WM "close window"
behavior), returning `null` only when the closed leaf was the tree's only one.

**Why panes can't just be Next.js pages.** Next's App Router can only ever resolve and render one
route's page per request — there's no built-in way to have several different routes' pages
mounted simultaneously side by side. `lib/toolRegistry.tsx`'s `TOOL_COMPONENTS` sidesteps this: a
hand-written `href -> next/dynamic(() => import(...))` map (hand-written, not derived from
`NAV_LINKS` automatically, since `next/dynamic`'s `import()` needs a static, literal path for
webpack/Next to code-split correctly — it can't be built from a variable). `TILEABLE_LINKS` is
`NAV_LINKS` filtered down to just the hrefs in that map — deliberately every real tool and nothing
else (not `/account`, `/community`, or the legal pages), per an explicit scoping call. Every pane,
including the one whose href happens to match the real current URL, renders its tool directly from
this registry — `TilingLayout` never reads `children` at all while active (see `AppShell.tsx`,
below). This does mean Next still resolves/renders the Server Component tree for whatever route
`router.replace` lands on, even though the result is thrown away — an accepted, minor waste for an
opt-in "advanced" feature, not a bug.

**URL sync** ("whatever window is currently active, make the url correspond to it... so when
copied and shared it opens that tool") — `TilingLayout.tsx` tracks one `activePaneId`; focusing a
pane (clicking anywhere inside it, via `onPointerDownCapture` so it fires regardless of what the
mounted tool's own event handlers do internally), splitting (the new pane becomes active), or
closing (falls back to the first remaining leaf if the previously-active one was the one just
closed) all call `router.replace(href, { scroll: false })` — `replace`, never `push`, so tiling
around doesn't flood the back button with history entries, and only when the href actually
*changes* (an explicit guard in `focusPane`), so clicking around inside an already-active pane's
own UI doesn't spam the router on every click. A copied link only ever restores that **one** tool
normally — never the saved tiled arrangement itself, which is deliberately not encoded in the URL
at all, just this browser's own `localStorage` (same category as the sidebar's width/theme — a
device preference, not account data, so it isn't synced).

**Persistence** (confirmed with Jack before building it, over resetting each page load) —
`lib/useTilingLayout.ts` is the exact same module-level-cache + listener-`Set` +
`useSyncExternalStore` pattern `components/Sidebar.tsx`'s own width/collapsed store already uses,
under its own `jam-practice-tiling` key. The tree is seeded (a single leaf showing wherever you
currently are, not some fixed default tool) the first time `TilingLayout` ever mounts with no tree
yet — i.e. the first time "Advanced layouts" is turned on, or after `localStorage` is cleared.

**Resizing** — `SplitContainer`'s divider is the same drag mechanics as `Sidebar.tsx`'s own resize
handle (`setPointerCapture`, an absolute pointer-position-to-size mapping recomputed on every
`pointermove` rather than a drag-origin delta), just computing a percentage of the split
container's own box instead of an absolute pixel width, clamped to 20–80% so neither side can be
dragged to nothing.

**The split picker** (`SplitPicker`, reached via a small button fixed to each pane's own top-right
corner — "put a button on the top right of every page," read as *every pane*, the way a real
tiling WM gives every individual window its own controls, not one single global button) is a
portaled, `getBoundingClientRect`-positioned popover — the exact anchoring technique
`components/Select.tsx` already uses, extended with a search box (reusing `tools.tsx`'s own
`filterLinks`, narrowed to `TILEABLE_LINKS`); the direction is already fixed by which edge button
opened it, so picking a tool immediately performs that split (superseded below — see "four direct
follow-ups" for how this moved from one corner button + a direction choice to four edge buttons).

**Mobile is now disabled outright, not a graceful fallback** (superseding the original
single-pane-fallback design described above — see "four direct follow-ups" below).

**Verified in a real browser** (the nix-chromium + `playwright-core`-over-CDP setup — see this
file's own Home-page bullet above for how that works): enabling the toggle, splitting right and
down, dragging the resize divider, clicking to refocus a different pane (confirmed the URL
actually changes), closing a pane (confirmed it collapses into its sibling and the close button
itself disappears once only one pane is left — a real bug caught this way: the close button
initially showed, and did nothing, even on a single un-split pane, since `canClose` was hardcoded
`true` for every leaf regardless of how many there were; fixed by threading a real
`collectLeaves(tree).length > 1` check down through `PaneNode`), reloading the page (confirmed the
whole tree, not just `enabled`, survives via `localStorage`), and turning "Advanced layouts" back
off (confirmed it cleanly reverts to the plain single-page view with zero leftover tiling UI) — all
checked directly, not assumed, with zero console errors throughout. `tsc`, `eslint`, and
`next build` all pass. **Not verified**: how well any given tool's own internal layout actually
holds up once squeezed into a narrow pane (the Tuner's own right-hand reference-pitch column, in
particular, visibly needed to horizontal-scroll inside a ~580px-wide pane during testing) — no
tool in this app was built with "might be rendered at less than its own natural width" in mind,
and making every one of them gracefully reflow that far down is its own, separate, unstarted
project, not something this feature attempted to fix. Also not verified: real touch/mobile drag
behavior on an actual phone (only checked via a simulated viewport width, which exercises the
`useIsDesktop` fallback path but not genuine touch input), and whether running the same
audio-heavy tool (e.g. two Metronomes) in two panes simultaneously behaves sensibly — `lib/
metronome.ts`'s `getAudioContext()` is a module-level singleton shared by every mounted instance
(the one `AudioContext` an audio-heavy app like this one is *supposed* to have per tab, not a
bug), so this should work, but it's never actually been tried with two real click engines running
at once.

**Four direct follow-ups, all from one round of feedback** ("you got the right idea, let's fix
some things"), landed on top of the design above:

1. **"Completely disable this feature on mobile, don't show the option in the menu."** The
   `useIsDesktop()` check moved from inside `TilingLayout` (where it used to fall back to a
   single-pane view) to `AppShell.tsx` itself, which now gates mounting `TilingLayout` at all on
   `enabled && isDesktop` — so even `enabled: true` left over in `localStorage` from an earlier
   desktop session renders as the plain, untiled page on a phone, not a degraded tiling view.
   `AdvancedLayoutsButton` itself is now only ever mounted in the desktop `<aside>` footer; the
   mobile menu's own footer lost its copy of the button entirely (it used to be there too). The
   `large` prop `AdvancedLayoutsButton` used to take for the mobile context is gone along with that
   call site, since the button is desktop-only now.
2. **"Instead of the button in the top right of every tool, put a little button in the middle of
   every side of the page/tool."** `Pane`'s single top-right split button became four small,
   hover-revealed buttons (`opacity-0 group-hover:opacity-100`, the same reveal-on-hover
   convention the sidebar's own favorite star already uses), one centered on each edge — which
   also means splits genuinely support all four directions now (up/down/left/right), not just the
   original two (right/down). `lib/tilingLayout.ts`'s `splitLeaf` signature changed from a
   `"row"|"col"` direction to a `PaneEdge` (`"up"|"down"|"left"|"right"`), deriving both the
   `"row"|"col"` direction *and* which child the new pane becomes (first or second) from which
   edge was clicked — "left"/"up" put the new pane before the existing one, "right"/"down" put it
   after. `SplitPicker` simplified to match: no more two icon buttons per result row (direction was
   already fixed by which edge button opened it), just one click per tool. One real React-Compiler
   lint catch fixing this: the original design read a ref (`buttonRefs.current[edge]`) *during
   render* to build the popover's anchor prop, which `react-hooks/refs` correctly rejects ("Cannot
   access ref value during render") — fixed by capturing the actual clicked button element
   straight from the click event (`e.currentTarget`) into a bit of state instead, so `SplitPicker`
   now takes a plain `anchor: HTMLElement`, not a ref object, and nothing reads a ref outside an
   effect/handler anymore.
3. **"For whatever window is active, the sidebar should reflect it, and I should be able to change
   the current active window's tool by clicking a nav link in the sidebar or by searching by
   pressing '/'."** The sidebar reflecting the active pane already worked (the active pane's href
   was always mirrored into the real URL via `router.replace`, which is what drives
   `NavItems`' own `pathname === href` highlighting) — what didn't work was the reverse direction.
   Clicking a sidebar `<Link>` or picking a `/`-palette result navigates through the *real* Next.js
   router, which `AppShell` completely ignores while tiling is active (see this section's own
   explanation above for why there's no way around that) — so before this fix, clicking a nav link
   silently changed the URL and did nothing visible at all. `TilingLayout` now has a second effect
   watching `pathname`: whenever it drifts from the active pane's own href, that's by definition an
   outside navigation (its own `router.replace` calls always leave the two in sync immediately
   after), so it retargets the active pane to the new href via the new `updateLeafHref` helper in
   `lib/tilingLayout.ts`. No feedback loop, since the effect is a no-op the instant the URL and the
   active pane's href agree — which is always true right after this component's own navigation
   calls.
4. **"When I initially turned the feature on, the tool I was using stopped displaying and there was
   text saying 'unknown tool'."** A real, reproduced-and-fixed bug: `TilingLayout`'s own
   tree-seeding effect only ever fires when there's *no* saved tree at all, so turning "Advanced
   layouts" back on after having used (and left) it earlier silently resumed whatever tree was
   last saved — the wrong tool, or "unknown tool" if that stale tree's href somehow no longer
   matched anything. Fixed at the source: `AdvancedLayoutsButton`'s own click handler now resets
   the tree explicitly, synchronously, at the exact moment "Advanced layouts" is turned on —
   reading `usePathname()` right there and seeding a single fresh pane from wherever you currently
   are (falling back to `TILEABLE_LINKS[0]` if you happen to enable it from a page that isn't a
   tool at all, e.g. the home page), so every time you turn it on you get exactly the page you're
   looking at, never a resurrected old arrangement. `TilingLayout`'s own seeding effect is now just
   a fallback for the rare case this didn't already run first. The "unknown tool" message itself
   also got friendlier wording (acknowledging a tool can still go missing from a stale saved tree
   if `TOOL_COMPONENTS` itself ever loses an entry later) instead of being purely a dead end.

Verified with the same nix-chromium setup, working against the actual dev server this time (not
just synthetic scripts): enabling while actively on a real tool confirmed it keeps displaying, not
"unknown tool"; splitting right via the new edge button confirmed the URL and pane both update
correctly; disabling, navigating to a different tool normally, then re-enabling confirmed a fresh
single pane seeded from wherever you'd navigated to (not the old stale multi-pane arrangement — 0
close buttons present, proving it was genuinely a single fresh pane); clicking a sidebar nav link
while two panes were open confirmed only the *active* pane retargeted, the other left untouched;
pressing `/` and picking a search result confirmed the same; and loading the app at a phone
viewport with `enabled: true` already in `localStorage` confirmed the plain untiled page renders
regardless, with zero tiling UI present and "Advanced layouts" absent from the opened mobile menu
(a `getByText` match was still found in the DOM at that viewport, but confirmed via
`offsetParent !== null` to be the *desktop* sidebar's own copy — present but genuinely
`display: none`-hidden under the `hidden lg:flex` class at that width, not actually shown). One
pure test-environment artifact hit and resolved along the way, not an app bug: this headless
Chromium build still reports no hover capability at all (see this file's own Home-page bullet,
"Caveat found 2026-10-03"), so `group-hover`-gated edge buttons can't be visually hover-triggered
here, but they're still reachable and clickable via Playwright locators regardless of their
`opacity-0` state, which is what every edge-button check above actually exercised. `tsc`, `eslint`,
and `next build` all pass. **Not verified**: how the four hover-revealed edge buttons actually look
and feel to discover and click with a real mouse, since this sandbox still can't trigger `:hover`
to see them appear.

**Three more direct follow-ups, reported together**, after Jack actually clicked through the four
rounds above for the first time:

1. **"The right arrow is messed up"** (with a screenshot) — a real, confirmed-by-reading-the-path
   bug: `EdgeIcon`'s `"right"` SVG path was `"M5 12h14M19 12l-5-5M19 12l5 5"` — the second diagonal
   stroke (`l5 5`, a *relative* lineto) moved forward from the arrow's own tip instead of mirroring
   the first one backward, landing at `(24,17)`, just outside the 24×24 viewBox, instead of
   `(14,17)` — the same place `"up"`/`"down"`/`"left"`'s own (correct) arrowheads converge their
   two diagonals. One flipped sign (`l5 5` → `l-5 5`) fixed it; `"up"`/`"down"`/`"left"` were
   already correct (re-derived and checked by hand against the same pattern, not just assumed
   innocent because they weren't the one named).
2. **"When I click one of those I want the same search menu that shows when I press / ... to
   open."** The bespoke `SplitPicker` popover (its own small search box + results list, described
   in this section's earlier rounds above) is gone outright — an edge button now opens the *exact*
   `CommandPalette.tsx` every other search in this app already uses. `lib/useTilingLayout.ts`
   gained `pendingSplit: { paneId, edge } | null` (deliberately **not** persisted to
   `localStorage` — stripped out in `write()` before serializing, since a half-finished split
   request has no business surviving a reload) plus three functions: `requestSplit` (what an edge
   button calls — records the pending request, then `TilingLayout` dispatches
   `OPEN_PALETTE_EVENT` itself), `clearPendingSplit`, and `applyPendingSplit(href)` (what
   `CommandPalette.tsx`'s own `go()` now calls first on every pick — performs the split and
   returns `true` if there was a pending request, leaving `go()` to fall back to its own ordinary
   `router.push` only when there wasn't). This does make `CommandPalette.tsx` — previously a
   fully tiling-*unaware* component — lightly coupled to the tiling feature, but through exactly
   one conditional branch in `go()`, not logic spread across the file; the palette also swaps its
   placeholder to "Pick a tool to tile…" while a request is pending, and the palette's own `close()`
   now clears any pending request unconditionally (a pick already clears it itself, so this only
   actually matters for "opened an edge button's picker, then hit Escape instead" — otherwise a
   stale pending request could silently hijack the *next*, unrelated `/` search). A real lint catch
   along the way: the original `SplitPicker` design read a ref (`buttonRefs.current[edge]`) *during
   render* to build its anchor prop, which `react-hooks/refs` correctly flags ("Cannot access ref
   value during render") — moot now that `SplitPicker` is gone entirely, but worth remembering as
   the reason the edge buttons capture `e.currentTarget` from the click event itself rather than a
   ref if anything like this gets built again.
3. **"I also want all pages including community and account page to work."** `TOOL_COMPONENTS`
   (`lib/toolRegistry.tsx`) only ever covered the ~13 actual *tools* before this (an explicit
   scoping call from when this feature was first built) — meaning navigating to `/community` or
   `/account` while tiling was active hit the pane's own "this tool isn't available anymore"
   fallback, since neither had a registered component. Fixed by adding `"/"` (`Home`), `/community`
   (`Community`), and `/account` (`AccountPage`) to the registry — straightforward, since all three
   already follow the same "a page.tsx that just returns one component" shape every other
   registered tool does. `/privacy`, `/terms`, and `/credits` are still *not* registered, and
   documented as such directly in `toolRegistry.tsx` now — those three are the one different shape
   in this app (their content is written directly inline in their own `app/*/page.tsx` file, not a
   separate importable component at all), so registering them would mean first extracting that
   content into real components, a bigger change this round didn't attempt for three static prose
   pages unlikely to be tiled next to a practice tool anyway; visiting one while tiling is active
   still falls back to the same "not available" message. `TILEABLE_LINKS` (what actually populates
   the `/`-search results list, including when that same search is opened for a split) is still
   derived from `NAV_LINKS` alone, deliberately unchanged — Home and Account aren't `NAV_LINKS`
   entries and so still won't show up as *searchable*, same as Account was never globally
   searchable anywhere else in this app before now; being paneable and being searchable are
   different questions, and this request was about the former.

Verified against the real dev server with the same nix-chromium setup: the right-edge button's
icon, inspected close up (forced to `opacity: 1` + `transform: scale(4)` via an injected style tag,
since this headless build still can't trigger real `:hover` to reveal it — see this file's own
earlier caveat on that), is now a clean, symmetric arrow, matching the already-correct
up/down/left ones checked the same way; clicking an edge button opens a real `role="dialog"
aria-label="Search tools"` palette (not a custom popover) showing the "Pick a tool to tile…"
placeholder, and picking a result (Community, in the actual check) correctly splits the pane and
updates the URL to `/community`, with Community's own real UI rendering inside; and navigating
directly to `/account` while tiling is active now renders the real Account page (confirmed
correctly showing its signed-out empty state, not "unknown tool"). `tsc`, `eslint`, and
`next build` all pass, with zero console errors across every check. **Not verified**: whether
`/privacy`/`/terms`/`/credits` not being tileable actually reads as expected/acceptable rather than
as a surprise gap, and — the same running caveat every round of this feature has had — how any of
this genuinely looks and feels with a real mouse and real `:hover`.

**Two more direct follow-ups, reported together with a screenshot** ("the community and account
page have a little border they shouldn't have. also the search menu doesn't always open the tool
that I click on, uit seems to open a different tool than the one i select, this is a bug with
every instance of it"):

1. **The border.** Compared screenshots of Community and Metronome, each tiled as a lone,
   un-split pane — both showed the exact same subtle `ring-1 ring-inset ring-accent/40` outline,
   confirming this was never actually page-specific, just only noticed on whichever page happened
   to be open alone at the time. Root cause: `Pane`'s active-ring styling was gated on `active`
   alone (`active ? "ring-1 ring-inset ring-accent/40" : ""`), and a single, un-split pane is
   *trivially* always "active" — there's nothing else in the tree for it to not be the active one
   relative to — so the ring was unconditional whenever "Advanced layouts" was on at all, reading
   as an unwanted border rather than a useful indicator. Fixed by gating on `active && canClose`
   instead — `canClose` already means "more than one pane exists" (it's the same check that shows
   or hides each pane's own close button), so it doubles as "there's actually something to
   distinguish this pane *from*," which is the only time the ring means anything.
2. **The palette bug** — a real, pre-existing defect, not something introduced by any of the
   rounds above (it was simply exercised, and so noticed, more often once edge buttons started
   reusing the real palette). `Palette`'s `go(index)` indexed into `results` (`filterLinks(query)`'s
   flat return, in `NAV_LINKS`' own declaration order), but the `index` actually passed to `go()`
   on each row's `onClick` was assigned while iterating `groups` — `groupByCategory(results)`,
   re-sorted into `CATEGORIES`' *display* order (`["Community", "Timing & Tuning", "Ear Training",
   "Practice", "Audio"]`), which does not match `NAV_LINKS`' declaration order. Concretely:
   "Community" is the *last* entry in `NAV_LINKS` but renders *first* on screen (its category sorts
   first), so clicking it called `go(0)`, which resolved to `results[0]` — a *different* tool
   entirely. Every row whose rendered position didn't coincidentally match its `results` position
   was affected, which in practice was almost every row. Fixed by computing
   `const ordered = groups.flatMap((g) => g.items)` once — the actual on-screen order — and
   switching every consumer of `results`/`results.length` (`go`, the `activeIndex` clamp, the
   `ArrowDown` handler, and the "No tools found" empty check) to use `ordered`/`ordered.length`
   instead.

Verified against the real dev server with the same nix-chromium setup. For the border: forced
`"advanced layouts"` on with a single-leaf tree for `/community`, `/account`, and `/metronome` in
turn and confirmed, via both a DOM query for any element with `ring` in its class and a full-page
screenshot, that none show the ring anymore (screenshot of `/community` checked by eye too, not
just the DOM query); then forced a genuine two-pane split (`/jam-practice` + `/metronome`) and
confirmed via the same DOM query that *exactly one* element carries `ring-1 ring-inset
ring-accent/40` — proving the fix narrows the ring correctly rather than just removing it outright.
For the palette bug: scripted opening the palette (via the real `/` key, from `/jam-practice`) and
clicking six different results spanning every category — Community, Chord Charts, Recorder, Tuner,
Metronome, Scale Trainer — and confirmed each one navigated to exactly the URL that tool should own
(`/community`, `/chord-charts`, `/recorder`, `/tuner`, `/metronome`, `/scale-trainer`
respectively), with zero mismatches across all six, including "Community" specifically — the exact
row the bug's own reasoning above predicts would most reliably misfire under the old code, since
it's about as far as a row's `results`-order position and its on-screen position can diverge.
`tsc`, `eslint`, and `next build` all pass, with zero console errors. (One genuine false alarm
during this verification pass, not an app bug: an early version of the two-pane-split check fed a
malformed `PaneSplit` directly into `localStorage` — `{a, b, ratio}` instead of the real shape,
`{children: [PaneTree, PaneTree], sizes: [number, number]}` — which crashed `collectLeaves` with a
real `TypeError` and `__next_error__`'d the whole page; once corrected to the actual shape from
`lib/tilingLayout.ts`, it rendered and resolved cleanly, confirming the crash was a bad test
fixture, not a reachable app bug — nothing a real user's own `requestSplit`/`splitLeaf` path could
ever produce, since that always builds a well-formed tree.) **Not verified**: the same running
caveat as every round of this feature — how the now-correctly-gated ring and the now-correct
palette picks actually feel to use with a real mouse, since this sandbox still can't trigger real
`:hover`, only confirm the underlying DOM/behavior is right.

**Three more direct follow-ups, reported together with a screenshot** ("the x is positioned badly,
should go to the left a bit (this is only an issue for windows that are tiled to the right).
community and account page still have an accent border when active, remove that. also if i have 2
windows open, do something in a window like start a metronome, go to another window, the metronome
will keep going but if i go back to the metronome it will refresh the window and the metronome will
stop, this is true for every kind of page; try to find a way to not refresh windows when switching
active windows"):

1. **The close button's position.** `right-2 top-2` sits exactly where `AppShell`'s own
   `lg:rounded-xl` outer corner curves inward — only a problem for a pane tiled at the *right* edge
   of the whole tiling area, since that's the only position where the button's corner coincides
   with that curve rather than an internal (straight) divider line between sibling panes. Fixed
   with a slightly larger inset, `right-3 top-3` — a no-op everywhere else, which has plenty of
   room either way.
2. **The accent border, again.** The previous round's fix (gating the ring on `active && canClose`)
   was behaviorally correct — it only showed once there were genuinely 2+ panes — but a screenshot
   of Community tiled with a sibling showed it still there, doing exactly what it was designed to
   do, and that still read as an unwanted border rather than a useful indicator. Rather than tune
   it a third time, the whole `ring-1 ring-inset ring-accent/40` active-pane indicator was removed
   from `Pane` outright (`components/TilingLayout.tsx`) — the sidebar already reflects which pane
   is active (see the next point), so this wasn't the only way to tell, and clearly wasn't earning
   its keep against how often it got reported as a stray border.
3. **The real bug: focusing a pane stopped its audio.** Reproduced directly with the nix-chromium
   setup: start a metronome in one pane, click to focus a sibling pane (metronome keeps running,
   confirmed), click back to refocus the metronome's own pane — the "Stop" button silently reverted
   to "Start." Root-caused with targeted instance-id tracing (a `useRef` set once per real mount,
   logged on every render) added temporarily to `AppShell`, `Pane`, and `Metronome`: `AppShell` and
   `Pane` both stayed on the *exact same* component instance throughout — proving neither of them,
   nor anything above them in the tree, ever remounted — while `Metronome`'s own instance changed
   to a fresh one, and only at the exact moment `focusPane` called `router.replace(leaf.href)` to
   keep the address bar in sync. Narrowing further (also tracing `TOOL_COMPONENTS[href]`'s own
   object identity, which stayed referentially stable throughout) isolated it precisely:
   **navigating via Next's router to a URL matching an already-mounted `TOOL_COMPONENTS` entry
   remounts that specific tool's component, wherever it's currently rendered** — regardless of
   whether the navigation's *destination* is even the pane being focused (it's keyed to the href,
   not the pane) — independent of whatever internal Next.js/Turbopack mechanism actually causes
   this (not fully traced to source, but the *trigger* was conclusively isolated: calling
   `router.replace`/`push` to that href, full stop). Fixed by eliminating the trigger rather than
   chasing the exact internal cause: `lib/useTilingLayout.ts`'s new `syncAddressBar(href)` updates
   the address bar via the raw History API (`window.history.replaceState`) instead of Next's
   router — since `TilingLayout` always renders every pane itself from `TOOL_COMPONENTS`, Next
   never actually needs to fetch or render anything for a focus/close/split, so the address-bar
   update was always purely cosmetic (for copy-paste shareability) and never needed to go through
   Next's navigation machinery at all. `focusPane`/`closePane` (`TilingLayout.tsx`) and the
   split-apply branch of `CommandPalette.tsx`'s `go()` all switched to it; `useRouter()` became
   entirely unused in `TilingLayout.tsx` as a result and was dropped.

   This surfaced two real knock-on fixes, not just the one swap:
   - **The outside-navigation sync effect** (the one that retargets the active pane's tool when a
     sidebar Link or `/` search changes the *real* URL) used to compare `active.href` against
     `pathname` on *every* render, trusting any mismatch as "an outside navigation happened." Once
     `focusPane` stopped calling `router.replace`, that stopped holding: Next's own `pathname`
     (from `usePathname()`) no longer updates in response to our own focus changes at all, so
     merely focusing a different pane (changing `activePaneId`, which the effect also depends on)
     would leave `pathname` looking "stale" relative to the newly active pane's own href, and the
     effect would misfire, overwriting that pane's href with the stale value — silently turning the
     pane you just focused into whatever tool the URL last *really* navigated to. Fixed by tracking
     the last `pathname` value this effect actually saw (`lastSeenPathnameRef`) and only reacting
     when `pathname` itself has genuinely changed since then, not merely whenever it fails to match
     the active pane — which only happens from an actual Next router transition (a Link, `/`
     search, or browser back/forward), exactly the case this effect exists to catch.
   - **The sidebar's own active-link highlighting** (`components/Sidebar.tsx`'s `NavItems`) was
     driven by `pathname === href` — which, for the identical reason above, stopped tracking pane
     focus changes once those moved off Next's router. Fixed by making it tiling-aware: while
     "Advanced layouts" is genuinely in effect (on, and desktop-sized — the same condition
     `AppShell.tsx` gates `TilingLayout` on), it reads the *active pane's own href* directly from
     `useTilingState()` instead of `pathname`; otherwise (tiling off, or on mobile where it's
     force-disabled) it falls back to plain `pathname`, unchanged from before.

   Verified against the real dev server with the nix-chromium setup, the same instance-id tracing
   methodology used to find the bug now used to confirm the fix: starting a metronome, focusing a
   sibling pane, and focusing back no longer changes the Metronome component's own instance id at
   all (previously confirmed via the same trace to always get a fresh one) — and functionally, the
   "Stop" button now stays "Stop" across a refocus instead of silently reverting to "Start."
   Separately confirmed: the sidebar now correctly re-highlights "Tuner" after focusing a Tuner pane
   (a scripted check reading which nav link currently carries the active styling, before and after
   a programmatic pane-focus click — matches "Metronome" before, "Tuner" after); no pane, single or
   tiled with a sibling, shows the removed ring/border anymore (a DOM query for any `ring-accent`/
   `ring-inset` class found only unrelated, legitimate `focus-visible:ring-accent` styling on
   existing buttons/inputs elsewhere on the page, confirmed by inspecting each match directly rather
   than trusting the count alone); and the close button's class list now reads `right-3 top-3` as
   intended. `tsc`, `eslint`, and `next build` all pass, with zero console errors throughout.
   **Not verified**: whether the close button's new inset is visually enough clearance from the
   rounded corner once actually seen (reasoned from the geometry, not measured against a render),
   and — the same standing caveat on this whole feature — how any of this feels with a real mouse,
   since this sandbox still can't trigger genuine `:hover`.

## Shared conventions — reuse these before writing something new

- `components/LoadingSpinner.tsx`: the one shared "something's loading" indicator — a small row of
  circles, one lit up at a time in a loop, styled after (and directly requested to be modeled on)
  the metronome's own beat-circle display (`components/BeatIndicator.tsx`), but driven by a
  looping CSS animation (`@keyframes loading-dot` + a `--animate-loading-dot` token, both in
  `app/globals.css` — Tailwind v4's `@theme` convention for a custom animation utility) rather than
  real beat timing, since there's no tempo to follow here. `size` (`sm`/`md`/`lg`), `inline` (sits
  mid-sentence instead of as its own block), and `showLabel` (also renders `label` as visible text
  next to the dots, for a spot specific enough that a sighted user benefits from knowing *what's*
  loading, not just that something is — e.g. Recorder's "Finishing recording…"; when off, `label`
  is still the accessible name via `role="status"`/`aria-label`, just not shown). Reach for this
  instead of a bare "Loading…" string or a one-off spinner — swapped into every place that already
  had one: `AccountPage.tsx` (the whole "is anyone signed in yet" gate), `AccountMenu.tsx` (the
  sidebar button's brief placeholder before that resolves), `PracticeTimer.tsx` (saved sessions
  loading from the account), and `Recorder.tsx` (loading a saved project from IndexedDB, and — a
  spot that had no loading feedback at all before this, just a disabled record button — finishing
  the post-recording burst-tone alignment processing). **Deliberately not** threaded into every
  `useSyncedSettings`/`useSyncedTunes` consumer, even though those *are* "waiting on the server" in
  a literal sense: that hook returns `defaults` while its first Convex read is pending specifically
  so call sites don't need a loading state to use it at all (see its own doc comment) — adding a
  spinner there would undo that design, not extend it.
- `components/ToolLayout.tsx`: the page shell every tool uses. `layout="split"` gives a
  hideable options column (the eye icon); `layout="stacked"` (Slow Downer, Recorder) is
  full-width with options in one card below. Takes `help={<HelpButton .../>}` for a controls
  dialog. The header icon next to the title is auto-picked from `NAV_LINKS` by matching the
  title string, so a new tool's title must exactly match its `NAV_LINKS` label. An optional
  `sidePanel` (+ `sidePanelLabel`) adds a second, independently hide/show-able column on the
  right (split layout only) — its own eye button, persisted via `useSidePanelHidden` in
  `lib/panels.ts` — for things like Note Trainer's time-history panel or the modulation log.
- `lib/meterControls.ts` + `components/MeterFields.tsx`: tempo/meter logic and UI shared by
  Metronome and Polyrhythm Metric Modulation Metronome — the log-scaled BPM slider,
  note-value-only beat unit,
  accent grouping, subdivision picker, tap tempo, and the `TempoHero`/`MeterOptions`/
  `SoundOptions` building blocks. Reuse these before adding another metronome-like tool.
- `lib/clickEngine.ts`'s `startClickEngine` takes an array of tracks (`{getSettings, onBeat}`
  each), all scheduled off one shared `setInterval` tick. Any tool playing more than one
  simultaneous click (like Polyrhythm Metric Modulation Metronome's reference click) should
  run them as tracks
  on the _same_ `startClickEngine` call, not as separate calls — two independent calls each get
  their own timer, and browser timer jitter can nudge one but not the other, so they slowly drift
  apart even though the underlying Web Audio scheduling of each is individually sample-accurate.
- `components/CollapsiblePanel.tsx` (split layout) / `components/OptionsCard.tsx` +
  `OptionSection` (stacked layout) for settings sections. `CollapsiblePanel` supports
  `toggle={{checked,onChange,disabled}}` to put a switch in the header that gates whether the
  section can expand.
  - **Hydration gotcha:** the chevron button in a gated `CollapsiblePanel` must always be
    _rendered_ (visually hidden with a CSS class like `invisible` when not expandable), never
    conditionally mounted/unmounted — the checked value comes from localStorage and can differ
    between the server default and the saved client value, and an element that's added/removed
    based on that will cause a real hydration mismatch. A class-only difference is fine.
  - **Option descriptions are opt-in, per section.** Both `CollapsiblePanel` and `OptionsCard`
    always show a "?" toggle in their header (next to the title, persisted alongside that
    section's open/closed state) and provide a `lib/hints.ts` `HintsContext` down to their
    children, off by default. `SwitchRow` and `AdvancedSlider` only show their own `hint` prop
    text while that context is on; description text that isn't already routed through one of
    those (e.g. a standalone explanatory paragraph, like several in Recorder's option panels)
    should use `components/Hint.tsx` directly instead of a bare `<p>`, so it's covered by the
    same toggle. Descriptions are never shown by default — always add them behind this
    mechanism, not as always-visible text. Every option across every tool now has one — treat
    "add a new setting" as also meaning "add its hint."
- `lib/usePersistedSettings.ts`: the localStorage-backed settings hook nearly every tool uses.
  **Always pass a module-level constant default object**, never an inline literal, or the
  `useSyncExternalStore` memoization (and SSR-safety) breaks. A new tool's settings should use
  `lib/useSyncedSettings.ts` instead — identical signature and rule, but also syncs to the
  account when signed in (see "Backend (Convex)" below); reach for the plain, unsynced hook only
  for something deliberately device-local (a display preference, not real tool data).
- `components/Select.tsx`, `SwitchRow.tsx`, `ConfirmDialog.tsx`, `PromptDialog.tsx`,
  `NumberField.tsx`, `KeyHint.tsx`, `HelpButton.tsx`, `ContextMenu.tsx`: shared
  form/dialog/menu primitives.
- `components/Waveform.tsx` + `lib/multitrack.ts` (the `Engine` class) + `lib/clips.ts`: the
  audio-editing core shared by Slow Downer and Recorder — waveform drawing/interaction (zoom,
  pan, loop, markers, clip trim/repeat/move), and sample-accurate scheduled playback. Read before
  touching; it's the most complex part of the codebase.
- `components/tools.tsx`: every icon component plus `NAV_LINKS` (the sidebar/search/title-icon
  source of truth) and `TOOLS` (currently unused, `NAV_LINKS` minus `/`).
- **Favorites** (`lib/useFavorites.ts`, `components/Sidebar.tsx`'s `NavItems`) — a star next to
  each tool in the sidebar (desktop and the mobile overlay both, via the same shared `NavItems`);
  clicking it adds/removes that tool from a "Favorites" section shown above the normal categories
  (each favorited tool still also stays in its own category below — a quick-access shortcut, not a
  relocation). **Account-only, on purpose** — unlike every other synced setting in this app, there
  is no signed-out local fallback: the star and the Favorites section simply don't render at all
  unless signed in (`useFavorites`'s `isAuthenticated` gate), since which tools you reach for most
  is tied to *you*, not a particular device/browser. Still rides the same generic `syncedSettings`
  Convex table as everything else (a fixed key, `"jam-practice-favorites"`, holding `{hrefs:
  string[]}`) rather than a bespoke account-only mechanism — the signed-out branch
  `useSyncedSettings` always has underneath still technically exists here too, it's just never
  surfaced in the UI. Visually the star sits *inside* each nav button, at its right edge, so the
  button itself stays full width — but it's a DOM sibling of the row's `<Link>`, not actually
  nested inside it (a `<button>` inside an `<a>` is invalid HTML and breaks click handling),
  absolutely positioned over padding the link reserves for it (`pr-11`/`pr-14`) whenever it can
  show, so nothing shifts when it fades in, and stacked on top (`z-10`) so a click there hits the
  star, not the link underneath. Only shown when not collapsed (no room for it in the icon-only
  collapsed sidebar) and signed in. Visibility beyond that: an already-favorited star always stays
  visible, so what's starred is visible at a glance without hovering; an unfavorited one is hidden
  on desktop until the row's hovered or the star itself is keyboard-focused (`opacity-0
  group-hover:opacity-100 focus-visible:opacity-100`), but always visible on mobile regardless,
  where there's no hover to reveal it.
- `lib/noteSpelling.ts` (accidental spelling: sharp/flat/random/both), `lib/trainerUtils.ts`
  (`formatDuration`, `shuffled`), and `components/AdvancedSlider.tsx` /
  `CountdownRing.tsx` / `CountdownLabel.tsx` / `ElapsedTimer.tsx`: pulled out of Note Trainer when
  Scale Trainer was built, since both drill-style trainers need the same note-name spelling, timer
  readouts and countdown ring (`CountdownLabel` is `ElapsedTimer`'s mirror image — a ticking "Ns"
  readout counting down instead of up, both driven by the same rAF-write-to-DOM pattern so a
  fast-ticking display doesn't force a re-render). `lib/noteGrade.ts`'s `Grade` type also carries
  `GRADE_COLOR`/`GRADE_LABEL` (correct/partial/incorrect colors and labels) and `scoreOf`
  (correct = 1, partial = 0.5), for the same reason. `lib/struggleStats.ts` (`bumpGradeCounts`,
  `rankWeak`, `weaknessScore` = incorrect + partial×0.5) is the lifetime per-note/per-scale
  struggle tracking behind both trainers' "Struggles" panel — generic over the string key, so
  Note Trainer keys it by note and Scale Trainer by mode id. Reuse these before adding another
  drill/quiz-style tool.
- `lib/tones.ts`: the "Tone" dropdown shared by Note/Scale/Interval Trainer's "Play note/scale/
  interval out loud", Guess the Interval/Guess the Chord's playback, and Practice Timer's
  transition chime (`TONES`, `DEFAULT_TONE_ID`, `playNote`). Each `Tone` is just an `id`/`label`
  plus a `play(ctx, freq, durationSeconds)` function — simple waveforms (triangle/sine/square/
  sawtooth, plus "organ"/"pluck" as hand-picked `PeriodicWave` Fourier coefficients) share one
  `waveTone` helper building its own Web Audio graph from scratch per note. "Piano" and "Rhodes"
  used to be synthesis functions too (a five-partial detuned-sine model and a 2-operator FM patch,
  respectively) but are now real recordings via `lib/sampledTones.ts` — this app's first actual
  audio *assets*, per an explicit request to stop approximating and use real samples. Neither
  sample set ships in the repo: the browser `fetch()`s the specific note it needs directly from the
  sample's origin host the first time that note comes up (Piano: the Salamander Grand Piano,
  Alexander Holm, CC-BY, hosted by the Tone.js project, sampled at A/C/D#/F# every octave, 30
  notes; Rhodes: the FluidR3 GM SoundFont's "Electric Piano 1" patch converted to per-note mp3s by
  the midi-js-soundfonts project, CC-BY, every semitone across the full 88-key range) and
  `decodeAudioData`s it into an `AudioBuffer`, cached in a module-level `Map` keyed by URL for the
  rest of the tab's lifetime — so only the very first play of a given sample note pays a
  network/decode cost; every repeat, and the browser's own normal HTTP cache on a later visit, are
  instant. A requested note without its own recording gets the *nearest* sample, pitch-shifted via
  `playbackRate` to the exact target frequency — continuous, not limited to semitone steps, same as
  the synthesized tones could render any frequency exactly. Both sets' filenames are generated from
  MIDI note numbers (`midiToAppName`/`midiToFlatName`) rather than hand-typed, and every generated
  URL (118 across both sets) was spot-checked for real — several edge/middle/flat-spelled notes
  fetched directly and confirmed to return actual mp3 data, not guessed from memory. CC-BY requires
  attribution, which lives on `/credits` (`app/credits/page.tsx`, linked from `Home.tsx`'s footer,
  same `LegalPage` shell as `/privacy`/`/terms`) rather than cluttering every tool that has a Tone
  dropdown. `DEFAULT_TONE_ID` is still "triangle" (unchanged, so existing persisted settings aren't
  affected) — Piano/Rhodes stay opt-in via the Tone dropdown, not a new default, for every Tone
  picker *except* Guess the Interval's and Guess the Chord's: those two ("Ear Training" tools,
  specifically — not the other trainers' own "play out loud" Tone pickers or Practice Timer's
  chime, which still offer the full list) were narrowed to real samples only, per a direct
  follow-up request once the samples actually sounded good — `EAR_TRAINING_TONES` (just Piano and
  Rhodes) and `DEFAULT_EAR_TRAINING_TONE_ID` ("piano") in `lib/tones.ts`, filtered from the same
  `TONES` array rather than a separate list to maintain, so a new tone added to `TONES` later needs
  a one-line decision (does it belong in this filter too) rather than being duplicated by hand.
  Each of those two components also clamps its own persisted `toneId` against
  `EAR_TRAINING_TONES` (same pattern as their existing `accidentalStyle` clamp) — a `toneId` saved
  before this narrowing (e.g. still `"triangle"`) falls back to the new default instead of
  silently pointing at a tone no longer offered in the dropdown. `playNotesTogether(notes,
  durationSeconds, toneId)` is the other export alongside `playNote` — used wherever several notes
  need to actually start together (Guess the Chord's block voicing, Guess the Interval's harmonic
  playback), not just be *called* around the same moment. Reported directly: with Piano/Rhodes, one
  note of a block chord would play slightly before the others on a first play, but a replay was
  always fine. Cause: each `playNote` call independently awaited its own sample's fetch+decode
  (`lib/sampledTones.ts`), so if a chord's notes needed different sample files and only some were
  already cached, each note computed "now" whenever *its own* fetch happened to resolve — on replay
  everything's cached so every note resolves near-instantly and the skew vanishes on its own, which
  is exactly why it only showed up on a first play. Scheduling every note for the same future
  `AudioContext` time turned out not to be a real fix on its own: a sample that's still mid-fetch
  when that moment arrives simply doesn't exist yet to play, so it'd still start late regardless of
  what start time was requested (a dead end worth recording so it isn't tried again) — Web Audio
  scheduling can't paper over a network request that hasn't finished. The actual fix is
  `Tone.prepare?: (ctx, freq) => Promise<void>` (optional; absent for every synthesized tone, which
  has nothing to preload) plus `lib/sampledTones.ts`'s `prepareSampledNote`, which fetches+decodes
  into the same `bufferCache` `playSampledNote` reads from without playing anything.
  `playNotesTogether` awaits `Promise.all` of every note's `prepare` call *before* computing a
  shared start time and playing any of them — so a chord genuinely waits for its slowest note to
  finish loading before any note sounds, rather than the fast notes racing ahead. Verified with a
  synthetic script using a fake `AudioContext` whose `currentTime` actually advances in real time
  (necessary — a static fake clock can't distinguish "fixed" from "reads `ctx.currentTime` fresh
  whenever each note happens to resolve", the bug, since both would trivially produce the same
  value against a clock that never moves) and two notes with deliberately different, real
  `setTimeout`-based fetch delays (5ms vs 150ms): both end up scheduled at the *exact* same
  Web Audio time, and that time is provably after the real ~150ms wait actually elapsed, not "0" by
  coincidence — plus a second check that a synthesized tone (no `prepare` step) still resolves
  near-instantly through the same function, unaffected.

## What's genuinely untested

Every change here has passed `next build` + `tsc --noEmit` + `eslint`, and audio-processing logic
(WAV encoding, pitch/beat detection, latency alignment) has been spot-checked with small synthetic
Node scripts — but **none of it has been exercised in a live browser with real audio hardware**.
If Jack reports odd behavior in any of these, treat it as genuinely unverified, not a regression
from something that used to work:

- **Public profiles & follows** (see "Backend (Convex)" above for the full design): genuinely
  nothing about this has been clicked through — this sandbox can't upload a real image file,
  create two different signed-in sessions to test following/searching/viewing each other's
  profiles, or click through a public profile link at all. Specifically unverified: the actual
  avatar upload flow end to end (resize → `generateAvatarUploadUrl` → the raw `fetch()` POST →
  `setAvatar`) in a real browser; whether the client-side `<canvas>` crop/resize produces a
  reasonable-looking square from a real photo (portrait vs. landscape, unusual aspect ratios);
  live username-availability checking while typing; the Community search page's actual results;
  the Follow/Unfollow round-trip and both Following/Followers lists updating live; a public
  profile page correctly showing (or correctly refusing to show) someone else's data depending on
  their `isPublic` flag; and the account-deletion cascade fix (`performDelete` now also removing
  the profile, its avatar file, and follow rows) actually leaving no trace behind in a real
  deployment, not just type-checking. Also unverified, since this session's redesign: that a public
  profile really does show *every* tune automatically with no picker involved; the "Add"/"Learn"
  buttons on `PublicTuneList` actually copying a tune into the viewer's own Tunes/Tunes to Learn
  lists correctly (fresh ids, no `notes` leakage, correctly disabling once already added); and the
  account's own Tunes to Learn tab's edit/delete/clear-all against a list that was actually
  populated by visiting someone else's profile first (as opposed to a script fabricating one).
  Verified so far, purely at the logic level: `lib/username.ts` (valid/invalid formats, boundary
  lengths) and `lib/profileTunes.ts`'s `resolvePublicTunes` (every tune returned in full,
  `notes` never present, tolerant of malformed/missing input, individual bad entries dropped
  without failing the whole list) against synthetic Node scripts, and that the whole feature —
  schema, every new Convex function, every new page — type-checks and deploys cleanly to the dev
  backend.
- **Community chord charts** (see its own paragraph under Backend (Convex) above — now on its
  third storage design, the first two both having broken for real at actual posting scale, most
  recently a ~1,400-song post): partially clicked through by Jack himself (that's how both prior
  bugs were actually found — this sandbox still can't authenticate as a real user, so every fix
  here has been verified against the *architecture*, via the real dev deployment, not by clicking
  the UI). Specifically unverified: that `create`/`importIntoLibrary` actually succeed end to end
  for a genuinely large post now (the original ask) — verified so far only that the specific
  failure modes that broke v1 (a >1 MiB document) and v2 (a >1024-field object) no longer apply
  architecturally, via a real query/mutation reachability check and a dedicated large-array-return
  check against the live dev deployment (see the Backend section), not by actually posting 1,400
  real charts and confirming they show up correctly; that `create` actually refuses posting for a
  non-public profile and the client-side prompt matches; that `list`/`get`/`getSongBars` really do
  drop a post (or song) once its author's profile goes private; that the inline `ChordChart`
  preview inside `PostDetailModal` renders correctly once its now-lazy `getSongBars` fetch
  resolves, in that narrower modal context; that "Import all" and a per-song "Import" actually
  land in `ChordCharts.tsx`'s own library and show up there immediately; and the account-deletion
  cascade now also clearing `communityChordCharts` *and* `communityChordChartSongs` rows. Also
  unverified: whether a playlist's tri-state checkbox (`.indeterminate` set imperatively via a ref
  callback) actually renders the indeterminate dash in every browser rather than just
  checked/unchecked; whether the title-autofill-from-playlist-name behavior feels helpful or
  surprising in practice; and whether search correctly hides a playlist with zero matching songs.
  Verified so far: `tsc`/`eslint`/`next build` all pass; `npx convex dev --once` deploys the
  current three-table shape (`communityChordCharts`/`communityChordChartSongs`, alongside the
  personal library's own `chordChartPlaylists`/`chordChartSongs`/`chordChartSongBars`) cleanly;
  and, against the real dev backend specifically (not a mock), both `create` and
  `importIntoLibrary` correctly reject an unauthenticated caller, and a large (1,500-element) array
  return value — the shape `get`'s song list now uses — succeeds with no limit comparable to the
  one that broke the old object-keyed-by-id bulk fetch. No synthetic Node script was run against
  the dedupe/playlist logic specifically here, since it's now shared with the already-scripted
  `mergeIntoLibrary`/`chordCharts.importSongs` path via `convex/lib/chordCharts.ts`'s
  `findOrCreatePlaylist`/`songKey`, not a second independent implementation to separately verify.
- **Community tunes** (see its own paragraph under Backend (Convex) above): same story, also
  entirely unclicked. Specifically unverified, beyond everything already listed for Community
  chord charts (the same posting-gate/privacy-filter/account-deletion-cascade concerns apply here
  identically): that `PublicTuneList` — a component only ever previously mounted from a public
  profile page — renders and behaves the same way reused here inside `PostDetailModal` (correct
  dedupe against the viewer's own Tunes/Tunes to Learn, correct fresh-id copy on Add/Learn, no
  layout surprises in a modal instead of a full page); and that `toPublicTune` actually strips
  `notes` in practice, not just by reading the function. Verified so far at the same level as
  Community chord charts: `tsc`/`eslint`/`next build` pass and `npx convex dev --once` deploys the
  new `communityTunes` table and functions cleanly — no dedicated synthetic script, for the same
  "thin glue over already-tested pieces" reasoning.
- Recorder: multitrack recording/overdub, the auto-latency burst-tone alignment, "align to beat",
  moving clips between tracks, WAV export/mixdown.
- Note Trainer listen mode: live pitch grading accuracy, the "ignore a held-over note" fix, the
  always-on max-time timer, and the "Sound feedback" click scheduling (a `setTimeout` per
  countdown second, cleared and rescheduled on every note change). "Shed a string" specifically:
  whether two octaves above the open string is actually the right span for a real instrument (no
  fret-count data exists to check against — see the shared-conventions note above) and whether
  the octave-override actually holds through to grading and the results screen as intended.
- Scale Trainer listen mode: same live-pitch-grading machinery as Note Trainer, plus its own
  untested bit — advancing through a scale's notes in sequence (settling between each one so a
  held note's tail isn't graded as an attempt at the next degree), failing the whole round on a
  wrong note (immediately by default, or after a second miss on the same degree with "Partial
  credit" on), the drill queue's per-key/per-octave coverage, and the "Sound feedback" click
  scheduling (a `setTimeout` per countdown second, cleared and rescheduled on every round change).
- Interval Trainer listen mode: same live-pitch-grading machinery again, plus its own untested
  bit — "Continue from previous note" chaining actually starting each round on the prior round's
  target note rather than drifting.
- Guess the Interval: whether the played interval's pitch actually matches what's shown once
  revealed (`playNote`/`lib/tones.ts`), the melodic-vs-harmonic playback timing (two `playNote`
  calls fired simultaneously for harmonic isn't something that's been heard), and the same
  countdown-timing machinery inherited from Interval Trainer (the sound-feedback click scheduling,
  answering early re-syncing the round timer).
- Guess the Chord: everything above, plus its own untested bits — whether a played chord's block
  vs. arpeggio voicing (all the notes at once, several simultaneous oscillators through
  `playNote`) actually sounds like one coherent chord rather than mush, especially on the bigger
  qualities (13th chords are 7 simultaneous notes); whether a fully random slash bass (not
  restricted to an actual chord tone) is musically legible enough to identify by ear at all,
  versus just sounding like noise under the chord; and the typed-answer flow end to end — the
  live-formatting preview while typing, submitting via Enter vs. the Submit button, and the
  timeout path (`onTimeUp` → `gradeAndReveal` → the same `lockInRound` reveal pause an explicit
  answer gets) actually behaving the way the code reads; plus, since this section was last
  written, the "Give the root" prefill (whether the caret really lands after the prefilled text
  rather than before/inside it — `setSelectionRange` after a `useEffect`, not something provable
  without a real focused `<input>` in a real browser) and the symbol keypad (whether a tap really
  inserts at the caret without stealing focus, across actual touch/mouse input rather than the
  synthetic string-splicing check that's all `insertSymbol`'s logic itself got). None of this is
  something this sandbox's lack of a browser can confirm beyond the synthetic parser/round-
  generation/prefill checks already run against `lib/chords.ts` directly.
- `lib/sampledTones.ts`'s "Piano" and "Rhodes" tones: every generated sample URL was checked for
  real (a script fetching representative ones — both range edges, a middle note, and a
  flat-spelled filename from each set — and confirming actual mp3 bytes come back, not a guess
  from memory), and the note-name/frequency/nearest-sample-selection math has a synthetic test
  against the real `noteToFrequency`. Jack reported the samples playing louder in one ear —
  both sets are real stereo recordings (an actual mic'd piano, unlike every other tone here, a
  single inherently-centered mono oscillator), so whatever left/right balance the recording itself
  happened to have was passing straight through; fixed by forcing the gain node's `channelCount`/
  `channelCountMode`/`channelInterpretation` to explicitly downmix to a centered mono signal before
  it reaches `ctx.destination` (the Web Audio spec's standard L+R downmix rule), verified with a
  mocked-Web-Audio-graph script asserting those three properties actually land on the node — but
  **not re-confirmed by ear**, since this sandbox still has no audio output; take "fixed" as
  "the mechanism that would cause this is now provably absent from the graph," not "confirmed
  centered by listening." Also still unconfirmed: whether the pitch-shifted notes between recorded
  samples (especially the piano set's wider, every-third gaps) still sound convincingly like a real
  piano rather than audibly "chipmunked" or "slowed down"; how loud the samples are next to this
  app's other tones (no gain matching was done — the samples' own recorded levels are used as-is,
  now just centered); whether the 80ms release ramp on cutoff sounds natural against a real
  recording's own decay tail versus clicking or cutting it off abruptly; the actual first-note
  network/decode latency in practice; and whether `AudioContext.decodeAudioData`'s promise-based
  (no-callback) form is supported by every browser this app otherwise targets. Jack also reported a
  block chord's notes not starting quite together on a first play (fine on replay) — fixed via
  `playNotesTogether`'s prepare-then-schedule redesign (see `lib/tones.ts`'s bullet above) and
  verified with a synthetic script proving two notes with deliberately different fetch delays
  converge on the exact same Web Audio start time, but same caveat as the left/right fix: not
  re-confirmed by ear in a real browser, since that's still not something this sandbox can do.
- Practice Timer: the engine's live start/pause/resume/skip/stop/auto-advance behavior and its
  restore-from-`localStorage` paths (paused, mid-step, and time-fully-elapsed-while-away) are all
  checked with synthetic Node scripts driving `lib/practiceTimerEngine.ts` directly against a
  mocked `window.localStorage` — but never in a real browser: an actual page reload genuinely
  resuming a running session, the sidebar widget/mobile badge staying in sync with the tool page
  across navigation (the whole reason the tool page's own `Date.now()`-based ring replaced an
  earlier `performance.timeOrigin`-converted one — see the tool's own bullet above — was Jack
  actually seeing the two disagree; this sandbox can't reproduce or re-check that by eye at all),
  and the transition chime (`playTransitionChime`, `lib/tones.ts`) are all unverified by ear/eye.
  Same story for what's new since: alarm mode's repeating chime (whether the 1.5s repeat interval
  actually sounds like a sane alarm cadence rather than too frantic or too slow — a number picked,
  not measured against anything), the sidebar widget's new pause/resume/skip/stop buttons actually
  working when clicked (siblings of the card's `<Link>`, not nested inside it, which fixes a real
  invalid-HTML/broken-click-handling risk on paper, but hasn't been clicked for real), and
  `PracticeTimerAlert`'s full-screen takeover — whether it actually renders above everything else
  app-wide (untestable without a real multi-page browsing session to interrupt), whether its
  `z-[200]` really does sit above every other overlay in the app (a number chosen by reading every
  other `z-` value already in use and going higher, not verified by opening two at once), and
  whether `autoFocus` on its Continue button actually lands keyboard focus there in every browser.
  The state machine itself (holds on `alarming` instead of auto-advancing, stays held rather than
  firing once, `skip()`/`stop()` both work from an alarming state, restoring into an
  already-alarming or just-elapsed-into-alarming state on reload) is covered by synthetic tests —
  see `lib/practiceTimerEngine.ts`'s own bullet above — but that's the logic, not the experience of
  an actual alarm going off while you're doing something else on your phone. The signed-in-reads-
  Convex-only sync switch (`lib/usePracticeSessions.ts`) type-checks and the schema/functions
  deploy cleanly to the dev backend, but the actual cross-device behavior — including that signing
  in really does ignore whatever's in local storage rather than merging it — hasn't been clicked
  through.
- **Every tool's account sync** (`lib/useSyncedSettings.ts`, `lib/useSyncedTunes.ts`,
  `convex/syncedSettings.ts`): `tsc`/`pnpm lint`/`pnpm build` all pass and `npx convex dev --once`
  deploys the schema/functions cleanly, but none of the actual signed-in behavior has been clicked
  through in a real browser — this sandbox can't sign into a real account and watch it happen. In
  particular, unverified: that a tool's settings genuinely round-trip through the account (change
  something, refresh, see it persist via Convex rather than localStorage); that signing in with
  existing local data really does just stop reading it rather than showing something stale or
  erroring; that all four of Jam Practice's tune-list call sites
  (`JamPractice.tsx`/`TunesPanel.tsx`/`TunesManager.tsx`/`StandardsPicker.tsx`) stay in sync with
  each other through `useSyncedTunes` the way they did through the shared `tunesStore` module
  before; and that a large settings object (Chord Charts' imported-song library in particular,
  potentially several hundred KB of JSON per `PROJECT.md`'s own note on that data's size) writes
  and reads back correctly as one `syncedSettings.value` string rather than hitting some
  unanticipated Convex document-size or `useMutation` payload limit.
- Tuner: the tone generator and the per-instrument string tunings.
- Polyrhythm Metric Modulation Metronome: the bar-boundary detection driving each
  modulation (relies on the
  click engine's `onBeat` callback timing).
- Chord Charts' `FitChordRow` (`components/ChordChart.tsx`): keeps a bar's chords on one line by
  measuring the row's natural width against the bar's available width (`ResizeObserver` +
  `scrollWidth`/`clientWidth`) and applying `transform: scaleX()` to compress it exactly enough to
  fit, instead of wrapping or overflowing. This one's untested for a different reason than the
  audio items above — it's plain DOM layout, no special hardware — but this sandbox has no working
  browser to actually render in (Playwright's Chromium is missing OS shared libraries — e.g.
  `libnss3.so`, `libgtk` — and installing them needs `sudo`, which isn't available
  non-interactively here); `next build`/`tsc`/`eslint` are all it's been checked with.
  Same-unverified-for-the-same-reason applies to a later visual pass matching iReal Pro's/Finale's
  chart look more closely, per two rounds of direct follow-up with reference screenshots. Round
  one swapped the chord font from Oswald (a condensed sans, a rough stand-in from when this was
  first built) to Bevan (a bold slab serif) and added a stacked time signature, baseline-aligned
  quality suffix, and an always-thick opening barline — sent back as "not even close... the font
  you just used is horrible... it should be very thin," naming Finale's own "Jazz Text" font as
  the actual reference. Round two (the current state): the font is now EB Garamond — genuinely
  thin-stroked, the opposite of Bevan, and the closest freely-licensed stand-in for Jazz Text
  available via `next/font/google` (Jazz Text itself is bundled with Finale, not distributable for
  web use, so this remains an approximation, not a claim of an exact match — the same honest
  caveat as the first attempt, just aimed at a different reference font this time). More
  consequentially, round two also replaced the chart's entire sizing model: it used to size chord
  text off the container's *width* only (a `cqw`-based scheme), so a long chart (many rows) just
  ran taller than its box and needed a scrollbar — exactly what "the whole chart, regardless of
  length, should be able to fit without scrolling" was asking to fix. Now the chart renders inside
  a single fixed-aspect-ratio box (`aspect-[8.5/11]`, "almost" a sheet of paper, per that same
  request) at one natural (unscaled) size, and a new `PageFit` component measures the whole
  rendered result (`ResizeObserver` + `scrollWidth`/`scrollHeight`, the same "measure then
  `transform: scale()`" idea `FitChordRow` already used for a single bar, now applied to the
  *entire* chart) and applies one uniform scale so it always fits inside that page — shrinking a
  long chart down, or growing a short one up (capped at `MAX_SCALE`, so a 4-bar tune doesn't blow
  up absurdly large). Every row now always renders exactly `barsPerRow` fixed-width columns
  (`COL_WIDTH`), even a short trailing row, leaving the remainder blank rather than stretching —
  matching how a real chart never changes bar width mid-line just because a line ends early. None
  of this has been seen rendered: not whether EB Garamond actually reads as close to Jazz Text, not
  whether `Δ`/`ø`/`°` (outside EB Garamond's coverage too — an existing limitation carried over
  from both earlier fonts, not a new regression) fall back jarringly, not whether the scale-to-fit
  math actually keeps a very long real chart legible rather than shrinking it into illegibly tiny
  text, and not whether the page's own on-screen size (`max-w-2xl` × the 8.5:11 ratio, comfortably
  taller than it is wide) ends up needing the *page itself* to scroll on a shorter viewport even
  though the *chart content* inside it never does — those are two different things, and only the
  second was ever actually promised here.

  Two further direct follow-ups landed on top of this, both also unclicked for the same reason.
  First, the page's own side margins on mobile — both `ChordCharts.tsx`'s display wrapper
  (`p-4 sm:p-6` → `px-1 py-4 sm:p-6`) and `PageFit`'s own inset (`inset-4 sm:inset-6` →
  `inset-x-1 inset-y-4 sm:inset-6`) — shrank to near-zero horizontally below the `sm:` breakpoint,
  deliberately left untouched above it, and deliberately *not* touching `ToolLayout.tsx`'s own
  shared `px-4` page gutter (used by every "stacked"-layout tool, not just this one) — so there's
  still a small unavoidable gutter from that shared layer, not literally edge-to-edge. Second, a
  "maximize" toggle (`MaximizeIcon`/`MinimizeIcon`, new in `components/tools.tsx`) opens the
  selected chart in a `fixed inset-0` full-screen overlay (Escape, or a "minimize" button, to
  close) — a plain CSS overlay rather than the browser's native Fullscreen API, deliberately: iOS
  Safari doesn't support calling `requestFullscreen()` on an arbitrary element at all, which would
  have made the button silently do nothing on an iPhone specifically, a bad outcome for what's
  otherwise a mobile-first practice tool. `ChordChart` itself gained a `fullscreen` prop that drops
  the paper aspect-ratio/width-cap in favor of filling whatever box it's given — maximizing is
  about legibility while practicing, not preserving a page shape that would waste space on a
  landscape phone — while still routing through the same `PageFit` scale-to-fit logic either way,
  so "never needs to scroll" holds in both the normal and maximized views.

  Two more direct follow-ups after that, both also unclicked. First, maximized, the composer name
  used to sit flush right in the header (`justify-between`) — colliding with the "minimize"
  button that sits top-right of the full-screen overlay, per a reported screenshot of "Coleman
  Haw[kins]" overlapping it. Fixed by moving the composer down under the title (left-aligned) only
  when `fullscreen`; the normal (non-maximized) view, which has no button there to collide with,
  keeps the composer flush right as before. Second, and more substantial: a long chart (many rows)
  in the *normal* (non-maximized) view rendered at a fraction of the phone screen's actual width,
  with wasted margin on both sides — `PageFit` had been fitting *both* width and height inside the
  fixed `aspect-[8.5/11]` page box, so a tall chart's height became the binding constraint on the
  scale, and that same (small) scale then applied to width too, shrinking it far more than the
  screen actually required. `PageFit` now takes a `fitHeight` prop: `true` (the full-screen case,
  a genuinely fixed box with no page below it to grow into) keeps fitting both dimensions exactly
  as before; `false` (the new default, normal in-page case) fits *width only* — always scales to
  exactly fill the container's width — and instead reports the resulting scaled *height* back onto
  its own box (`content.scrollHeight * scale`, via a second piece of state), so the page itself
  simply grows taller for a longer chart rather than the whole chart shrinking to preserve a paper
  ratio that was never the point — normal page scroll below a tall chart is fine; the chart
  needing its own internal scrollbar, which this whole `PageFit` mechanism exists to prevent, is
  the thing that was actually promised. Setting the box's own height from inside the same
  `ResizeObserver` callback that watches that box does cause one extra, harmless observer firing
  per settle (the box's height changing is itself a resize) — verified by tracing it through, not
  by watching it run: the second pass recomputes from the *same* `content` natural size (unaffected
  by the box's own height, since `content` is absolutely positioned) and lands on the identical
  scale/height values, so React bails out of re-rendering and it settles after that one bounce
  rather than looping.

  **Round three**, a direct follow-up asking for "a handwritten jazz font like lilyjazz": swapped
  EB Garamond for `lilyjazz-text`, the hand-written text face from the [LilyJAZZ font
  family](https://github.com/OpenLilyPondFonts/lilyjazz) (SIL Open Font License 1.1, copyright
  Abraham Lee) — this app's first actually-bundled font, self-hosted via `next/font/local` rather
  than fetched from Google Fonts. Immediately correctable on two points, both from a direct
  follow-up: **first**, `lilyjazz-text`'s own glyph set was missing three of `prettyQuality`'s five
  substitution characters (`Δ`, `♯`, `♭` — only `ø`/`°` were covered), pointed out directly
  ("the font shuold have flats and stuff"); **second**, there's no lighter weight of
  `lilyjazz-text` to switch to for "make the font thinner." Both together were reason enough to
  replace it outright rather than patch around the gaps.

  **Round four** (the current state) swapped in [Petaluma](https://github.com/steinbergmedia/petaluma)
  instead, per a direct follow-up naming it specifically: "its open source and definately includes
  everything." Petaluma is the SMuFL-compliant notation font family Steinberg built for its Dorico
  scoring software (SIL Open Font License 1.1, copyright Steinberg Media Technologies GmbH) — and
  genuinely does include everything needed, once the right *two* of its three faces are actually
  used together rather than just one:
  - **`PetalumaScript`** — a hand-inked text face, used for root letters, digits, and most of the
    quality suffix (`chordFont` in `ChordChart.tsx`). Its cmap was checked directly (`opentype.js`
    against the real downloaded `.otf`, the same verification method used for every font swap in
    this file, not assumed from the family's README) and — unlike `lilyjazz-text` — it already
    covers `♯`/`♭`/`ø` (three of `prettyQuality`'s five substitution glyphs) at their normal
    Unicode codepoints directly, no second font needed for those.
  - **`Petaluma`** itself (the engraving/symbol face, `chordSymbolFont`) — used for exactly the
    remaining two: `Δ` (major 7) and `°` (diminished). Rather than falling back to whatever other
    font happens to be installed for those two (the gap every earlier font in this chart's history
    had), a new `QualityText` component in `ChordChart.tsx` intercepts just those two characters
    after `prettyQuality` and re-renders them through `Petaluma`'s own dedicated SMuFL "chord
    symbols" glyph range — `csymMajorSeventh` (U+E873) and `csymDiminished` (U+E870), purpose-built
    engraved jazz-chord marks, not a Greek letter or degree sign standing in for them. Confirmed to
    exist in the actual font (not assumed from the SMuFL spec alone) by cross-referencing the
    [SMuFL glyphnames registry](https://github.com/w3c/smufl)'s `csym*` codepoints against
    Petaluma's real cmap. `prettyQuality` itself (`lib/iRealPro.ts`) is completely untouched — still
    the same Δ/ø/°/♯/♭ substitution shared with Guess the Chord's own chord bank — so this is a
    `ChordChart.tsx`-local addition on top of it, not a change to shared logic; Guess the Chord
    keeps rendering those same five characters in whatever ordinary font it already uses, unaffected.

  Both `.otf` files (`components/fonts/petaluma/Petaluma.otf`, `PetalumaScript.otf`, plus the
  family's shared `OFL.txt`/`FONTLOG.txt`) are committed the same way `lilyjazz-text` was, replacing
  it outright — `components/fonts/lilyjazz-text/` was deleted, not left alongside as dead weight.
  `/credits`' "Typeface" section was rewritten to credit Petaluma/Steinberg instead. On "make the
  font thinner" specifically: `PetalumaScript` reads as a visibly lighter weight than `lilyjazz-text`
  on paper, which happens to land closer to what was asked for, but that's a side effect of picking
  a different single-weight font, not an adjustable setting — the Petaluma family ships only one cut
  of `PetalumaScript`, so if it still reads too heavy once actually seen rendered, there's no lighter
  variant within this family to fall back to; a non-variable OTF's own stroke weight can't be thinned
  further through CSS `font-weight` the way a variable font's could. `tsc`, `eslint`, and `next build`
  all pass, and a synthetic Node script (run directly against the real `prettyQuality` plus
  `QualityText`'s own substitution table, not a mock) confirms the character-level logic against real
  quality suffixes pulled from `lib/chords.ts`: `^7`/`^13`/`o7`/`o` correctly isolate `Δ`/`°` for the
  SMuFL substitution, while `h7`/`-7b5`/`7#9`/`sus` correctly need no substitution at all (their
  `ø`/`♭`/`♯` already render through `PetalumaScript` directly). **Not verified**, same as every
  round before it: how any of this actually looks rendered in a browser — whether `PetalumaScript`
  reads as legible hand-written jazz notation at chord-chart sizes, whether it's visibly thin enough
  to satisfy the original ask, and whether the two `Petaluma`-rendered SMuFL glyphs sit at a
  consistent size/baseline next to `PetalumaScript`'s own text (both fonts share the same
  1000-units-per-em design, so no manual scale correction was applied — checked via each font's own
  metrics, but genuinely unconfirmed by eye).

  **Round five**, a direct follow-up with a screenshot of the actual rendered chart: chord symbols
  themselves were correctly in the new font, but the "%" repeat-bar mark and the coda symbol
  (segno wasn't in the screenshot, but shares the exact same code path) were still visibly in a
  plain system font, unchanged by any of the rounds above — both were typed as plain Unicode
  characters (`%`, `⊕`, `𝄋`) with no `chordFont`/`chordSymbolFont` class applied at all, simply
  missed when the font swap first went in. Rather than just adding `chordFont`'s class to those
  same plain characters, this checked whether `Petaluma` (the SMuFL engraving face, already
  bundled for `QualityText`'s `Δ`/`°`) has real dedicated glyphs for these too — cross-referencing
  the SMuFL glyphnames registry again, then confirming directly against the actual bundled
  `Petaluma.otf`'s cmap: it does, `repeat1Bar` (U+E500), `coda` (U+E048), and `segno` (U+E047),
  proper engraved marks rather than a percent sign/circled-plus/musical-repeat-character standing
  in for them (`PetalumaScript`, the text face, has none of the three — confirmed the same way —
  so this is `chordSymbolFont` only, not a choice between the two faces). `BarContent`'s repeat
  case and `BarCell`'s segno/coda span now render those three codepoints through
  `chordSymbolFont.className` instead of the old plain-Unicode characters; `REPEAT_SIZE`/
  `SYMBOL_SIZE` (the same font-size constants each already used) were left as-is rather than
  guessed at anew. `repeat1Bar`'s own bounding box sits mostly *below* the font's baseline
  (`y1: -250, y2: 175` in its 1000-unit em, versus a typed `%`'s more ordinary above-baseline
  shape) — flagged here as a real, not-yet-visually-confirmed risk: normal flex-centering in
  `BarCell` should still land it roughly centered in the bar regardless, since that's centering the
  span's line box rather than reasoning about glyph-specific bbox position, but it's worth a second
  look once this is actually seen rendered, before assuming that math holds. `tsc`, `eslint`, and
  `next build` all pass, and all three codepoints were confirmed present in the real bundled
  `Petaluma.otf` (not assumed from the SMuFL spec). **Not verified**, same as everything else in
  this chart's font history: how the repeat mark, coda, and segno actually look and sit once
  rendered — including that vertical-centering question above.
- Chord Charts' playlist grouping (`lib/chordChartsLibrary.ts`'s `Library`/`Playlist`,
  `PlaylistSection` in `ChordCharts.tsx` — see that tool's own bullet above): the merge/resolve/
  delete logic itself is covered by a synthetic Node script (creating vs. merging into an existing
  playlist by name, a duplicate song skipped correctly even in a brand-new playlist, every song
  accounted for exactly once, the legacy-library-falls-into-"Unsorted" case, and an emptied
  playlist being dropped), but nothing about the actual UI has been clicked through: whether the
  expand/collapse chevrons work and animate sensibly, whether a playlist containing the selected
  song really does show expanded by default without needing a manual click, whether the nested
  indentation reads clearly at the sidebar's narrow width, and — genuinely unknown, not just
  unclicked — how an account with chord charts imported *before* this change actually looks the
  first time it loads under the new "Unsorted" bucket, since this sandbox has no way to seed a real
  pre-existing synced library to check that against.
- Chord Charts' Convex-backed library (`lib/useChordChartsLibrary.ts`, `convex/chordCharts.ts` —
  see the tool's own bullet above for why this exists: the old single-blob storage broke on a real
  "massive playlist" import). Verified so far: the deployed functions are correctly wired and
  behave as expected when called *unauthenticated* (a plain Node script against the real dev
  backend, not a mock), and the signed-out/local code path is provably unchanged (same functions,
  same synthetic-script coverage, as before this session). **Not** verified: an actual signed-in
  import of a large playlist succeeding where it used to fail — this sandbox can't authenticate as
  a real user, so the one thing that actually matters most here (does Jack's original "massive
  playlist" import now work) is unconfirmed by anything stronger than the architecture no longer
  having the specific failure mode that caused it. Also unverified: the one-time
  `migrateFromSyncedSettings` migration actually preserving a real pre-existing library's playlists
  and songs correctly (only reasoned through, never run against real data — this sandbox has
  nothing to migrate); whether `getSongBars`' lazy per-song fetch introduces a noticeable delay
  switching between tunes in a real browser (the `selectedSongLoading` spinner is new and unclicked
  the way everything else visual here is); and whether `CreatePostModal`'s bulk `getSongsBars`
  fetch at submit time (via `useConvex().query`, not `useQuery`) actually returns bars keyed
  correctly by song id in practice, not just by reading the handler's code.

## Environment quirk (may not apply on a different machine)

On the machine this was developed on, something outside of any explicit `git commit` call was
auto-committing file edits to `main` as Jack's own git identity — `git status` looked clean
mid-session even though a lot had just changed. If that's not the case on a fresh clone/machine,
don't assume it — check `git log`, but also remember to actually commit (and push, which needs
Jack's hardware security key and can't be done from a sandboxed/non-interactive session) when work
should be saved.
