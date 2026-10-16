import { LegalLink, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata = {
  title: "Credits — sheddex",
};

export default function CreditsPage() {
  return (
    <LegalPage title="Credits" updated="September 30, 2026">
      <p className="text-sm leading-relaxed text-foreground/90">
        sheddex&apos;s sounds are almost entirely synthesized in the browser (see the Tone menu in
        the trainers, the metronome, and Guess the Interval/Guess the Chord for the full list) —
        with two exceptions: the <strong>Piano</strong> and <strong>Rhodes</strong> tones are real
        recordings, fetched from their original hosts the first time you pick them. Both are
        licensed under{" "}
        <LegalLink href="https://creativecommons.org/licenses/by/3.0/">
          Creative Commons Attribution 3.0
        </LegalLink>
        , which requires crediting them — this page is that credit.
      </p>

      <LegalSection title="Piano">
        <p>
          Samples from the{" "}
          <LegalLink href="https://archive.org/details/SalamanderGrandPianoV3">
            Salamander Grand Piano
          </LegalLink>
          , recorded by Alexander Holm, mp3-encoded and hosted by the{" "}
          <LegalLink href="https://tonejs.github.io/">Tone.js</LegalLink> project.
        </p>
      </LegalSection>

      <LegalSection title="Rhodes">
        <p>
          Samples from the FluidR3 GM SoundFont&apos;s &quot;Electric Piano 1&quot; instrument,
          converted to per-note mp3s by the{" "}
          <LegalLink href="https://github.com/gleitz/midi-js-soundfonts">
            midi-js-soundfonts
          </LegalLink>{" "}
          project.
        </p>
      </LegalSection>

      <LegalSection title="Bass Genius">
        <p>
          Bass Genius was Rob Moreno&apos;s idea, and Rob wrote the Ray Brown transcription (&quot;Cool Walk&quot;, two choruses of rhythm
          changes) that comes with it — the line its built-in Ray Brown player learns from.
        </p>
      </LegalSection>

      <LegalSection title="Bass Genius chords">
        <p>
          The piano comping in Bass Genius uses the velocity-layered{" "}
          <LegalLink href="https://archive.org/details/SalamanderGrandPianoV3">Salamander Grand Piano</LegalLink> (Alexander Holm,{" "}
          <LegalLink href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</LegalLink>), as hosted by the{" "}
          <LegalLink href="https://github.com/tambien/Piano">Tone.js Piano</LegalLink> project. The Rhodes is{" "}
          <LegalLink href="https://github.com/sfzinstruments/jlearman.jRhodes3d">jRhodes3d</LegalLink> by Jeff Learman — a 1977 Rhodes Mark I
          Stage 73 — used under{" "}
          <LegalLink href="https://creativecommons.org/licenses/by-nc/4.0/">CC BY-NC 4.0</LegalLink> (non-commercial use, with credit) and
          served by sheddex itself as trimmed mono mp3s.
        </p>
      </LegalSection>

      <LegalSection title="Bass Genius and Drum Generator drums">
        <p>
          The drummer plays{" "}
          <LegalLink href="https://github.com/sfzinstruments/virtuosity_drums">Virtuosity Drums</LegalLink> by Versilian Studios and Karoryfer
          Samples (<LegalLink href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</LegalLink>), a contemporary jazz kit recorded at
          Virtuosity Musical Instruments in Boston, served by sheddex itself as mono mp3s (mic pairs mixed) — Drum Generator also uses
          its hi-hat, cross-stick, rimshot and toms, and the same release&apos;s cowbell and woodblock.
        </p>
      </LegalSection>

      <LegalSection title="How this works">
        <p>
          Neither sample set ships with sheddex itself — your browser fetches the specific notes a
          tool actually plays directly from the hosts above (both GitHub Pages), the first time
          each one comes up, and keeps them for the rest of that browser tab so repeats are
          instant. See the{" "}
          <LegalLink href="/privacy">Privacy Policy</LegalLink> for what that means for your
          browser&apos;s outgoing requests.
        </p>
      </LegalSection>

      <LegalSection title="Upright bass">
        <p>
          Bass Genius plays{" "}
          <LegalLink href="https://github.com/sfzinstruments/karoryfer.meatbass">Meatbass</LegalLink>{" "}
          by Karoryfer Samples — a 1958 Otto Rubner double bass, played pizzicato and mapped by D.
          Smolken, recorded by Ludwik Zamenhof. It&apos;s released under{" "}
          <LegalLink href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</LegalLink>, so
          no credit is required, but it&apos;s too good not to name. Unlike the piano and Rhodes,
          these samples are served by sheddex itself (converted to mp3).
        </p>
      </LegalSection>

      <LegalSection title="Typeface">
        <p>
          Chord Charts sets chord symbols in{" "}
          <LegalLink href="https://github.com/steinbergmedia/petaluma">Petaluma</LegalLink>, the
          music notation font family Steinberg built for its Dorico scoring software — specifically
          <strong> Petaluma Script</strong> (a hand-inked text face) for the letters and numbers,
          paired with <strong>Petaluma</strong> itself for the major-seventh and diminished chord
          symbols, which it draws as real engraved marks rather than a stand-in character from an
          ordinary font. Unlike the audio above, both are bundled with sheddex itself rather than
          fetched from elsewhere, under Steinberg&apos;s own{" "}
          <LegalLink href="https://scripts.sil.org/OFL">SIL Open Font License 1.1</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
