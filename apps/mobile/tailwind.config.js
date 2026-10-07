/**
 * Deliberately *no* `theme.extend.colors` pointing at `var(--x)` CSS custom properties here
 * anymore — that was the original plan (mirroring `apps/web/app/globals.css`'s own `@theme`
 * block via a NativeWind `vars()` wrapper in `src/theme/ThemeProvider.tsx`), but react-native-css-
 * interop 0.2.7 (what this NativeWind version ships) doesn't correctly re-resolve a descendant's
 * already-rendered `className` when an ancestor's `vars()` value changes later — confirmed
 * directly on a real device (Pixel 10 Pro): switching themes updated anything reading color as a
 * plain JS value instantly, but left every `bg-surface`/`bg-background`-style className stuck on
 * whichever color it first resolved to, forever. Color now flows entirely through
 * `useAppTheme().colors` applied as inline `style` props (the standard React Native approach,
 * same as react-navigation/react-native-paper's own theming) — NativeWind/`className` is still
 * used everywhere for *layout* (flex, spacing, rounded corners, type scale), just not color.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Inter's own weighted font files (loaded in `app/_layout.tsx`) — a single custom TTF has
      // no synthetic-bold fallback the way a system font does, so `font-bold`/`font-semibold`/
      // `font-extrabold` alone would silently render in Inter's *regular* weight. Every existing
      // use of those three Tailwind classes also carries one of these `font-inter-*` companions.
      fontFamily: {
        inter: ['Inter_400Regular'],
        'inter-semibold': ['Inter_600SemiBold'],
        'inter-bold': ['Inter_700Bold'],
        'inter-extrabold': ['Inter_800ExtraBold'],
      },
    },
  },
  plugins: [],
};
