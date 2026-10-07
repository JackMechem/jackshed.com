export type AppFont = {
  id: string;
  label: string;
  kind: "Sans" | "Serif" | "Mono";
  /** CSS font-family value. The --font-* variables come from app/fonts.ts. */
  stack: string;
};

export const DEFAULT_FONT_ID = "geist";

export const FONTS: AppFont[] = [
  {
    id: "geist",
    label: "Geist",
    kind: "Sans",
    stack: "var(--font-geist-sans), system-ui, sans-serif",
  },
  { id: "inter", label: "Inter", kind: "Sans", stack: "var(--font-inter), system-ui, sans-serif" },
  {
    id: "dmsans",
    label: "DM Sans",
    kind: "Sans",
    stack: "var(--font-dm-sans), system-ui, sans-serif",
  },
  {
    id: "spacegrotesk",
    label: "Space Grotesk",
    kind: "Sans",
    stack: "var(--font-space-grotesk), system-ui, sans-serif",
  },
  {
    id: "poppins",
    label: "Poppins",
    kind: "Sans",
    stack: "var(--font-poppins), system-ui, sans-serif",
  },
  {
    id: "nunito",
    label: "Nunito",
    kind: "Sans",
    stack: "var(--font-nunito), system-ui, sans-serif",
  },
  { id: "lora", label: "Lora", kind: "Serif", stack: "var(--font-lora), Georgia, serif" },
  {
    id: "playfair",
    label: "Playfair Display",
    kind: "Serif",
    stack: "var(--font-playfair), Georgia, serif",
  },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    kind: "Mono",
    stack: "var(--font-jetbrains-mono), ui-monospace, monospace",
  },
  {
    id: "plexmono",
    label: "IBM Plex Mono",
    kind: "Mono",
    stack: "var(--font-plex-mono), ui-monospace, monospace",
  },
  {
    id: "geistmono",
    label: "Geist Mono",
    kind: "Mono",
    stack: "var(--font-geist-mono), ui-monospace, monospace",
  },
  {
    id: "system",
    label: "System UI",
    kind: "Sans",
    stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
];

export function getFont(id: string): AppFont {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}
