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
