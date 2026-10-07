import { prettyQuality } from '@jam-practice/core/iRealPro';
import { Text, type TextStyle } from 'react-native';

/**
 * Native sibling of `apps/web/components/ChordChart.tsx`'s own `QualityText` — renders a chord
 * quality suffix through `prettyQuality`'s Δ/ø/°/♯/♭ substitution, with `Δ` and `°` specifically
 * re-rendered through `Petaluma`'s own SMuFL "chord symbols" glyphs (its dedicated engraved major-
 * seventh/diminished marks) instead of the plain Unicode character, which `PetalumaScript` (the
 * face every other character here renders through) has no real glyph for. `♯`/`♭`/`ø` need no
 * substitution — `PetalumaScript` already covers those three directly. Exact same two codepoints
 * web uses (confirmed by reading them directly out of the real bundled `.otf`'s cmap when this was
 * first built, not guessed from the SMuFL spec alone): `csymMajorSeventh` U+E873,
 * `csymDiminished` U+E870.
 */
const SMUFL_CHORD_GLYPH: Record<string, string> = {
  Δ: '',
  '°': '',
};

export function ChordQualityText({
  quality,
  style,
}: {
  quality: string;
  style?: TextStyle;
}) {
  const pretty = prettyQuality(quality);
  const parts: { text: string; symbol: boolean }[] = [];
  for (const ch of pretty) {
    const glyph = SMUFL_CHORD_GLYPH[ch];
    if (glyph) {
      parts.push({ text: glyph, symbol: true });
    } else if (parts.length > 0 && !parts[parts.length - 1].symbol) {
      parts[parts.length - 1].text += ch;
    } else {
      parts.push({ text: ch, symbol: false });
    }
  }
  return (
    <Text style={style}>
      {parts.map((part, i) => (
        <Text key={i} style={part.symbol ? { fontFamily: 'Petaluma' } : { fontFamily: 'PetalumaScript' }}>
          {part.text}
        </Text>
      ))}
    </Text>
  );
}
