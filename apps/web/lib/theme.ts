import { DEFAULT_FONT_ID, getFont } from "@/lib/fonts";
import {
  CUSTOM_THEME_ID,
  OVERLAY_OPACITY,
  THEME_FIELDS,
  ThemeColorKey,
  ThemeColors,
  getPreset,
  isDarkColors,
  isValidHex,
} from "@/lib/themes";

export type ThemeState = { id: string; custom: ThemeColors | null; font: string };

// Older versions stored just "light" or "dark" under this key.
const STORAGE_KEY = "jam-practice-theme";
// Fully resolved colors, so the init script can paint before hydration.
const RESOLVED_KEY = "jam-practice-theme-resolved";

const DEFAULT_STATE: ThemeState = { id: "light", custom: null, font: DEFAULT_FONT_ID };
const listeners = new Set<() => void>();
let cached: ThemeState | null = null;

function overlayValue(hex: string) {
  return `color-mix(in srgb, ${hex} ${OVERLAY_OPACITY * 100}%, transparent)`;
}

export function resolveColors(state: ThemeState): ThemeColors {
  if (state.id === CUSTOM_THEME_ID && state.custom) return state.custom;
  return (getPreset(state.id) ?? getPreset("light")!).colors;
}

function apply(state: ThemeState) {
  const colors = resolveColors(state);
  const font = getFont(state.font).stack;
  const root = document.documentElement;
  root.style.setProperty("--app-font", font);
  for (const { key } of THEME_FIELDS) {
    const value = colors[key];
    if (!isValidHex(value)) continue;
    root.style.setProperty(`--${key}`, key === "overlay" ? overlayValue(value) : value);
  }
  const dark = isDarkColors(colors);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colors.background);
  try {
    window.localStorage.setItem(RESOLVED_KEY, JSON.stringify({ colors, dark, font }));
  } catch {
    // storage unavailable
  }
}

function read(): ThemeState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      if (raw.startsWith("{")) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.id === "string") {
          return {
            id: parsed.id,
            custom: parsed.custom ?? null,
            font: typeof parsed.font === "string" ? parsed.font : DEFAULT_FONT_ID,
          };
        }
      } else {
        return { id: raw, custom: null, font: DEFAULT_FONT_ID };
      }
    }
  } catch {
    // fall through to default
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return { id: prefersDark ? "dark" : "light", custom: null, font: DEFAULT_FONT_ID };
}

export function getThemeState(): ThemeState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  if (!cached) cached = read();
  return cached;
}

export function getServerThemeState(): ThemeState {
  return DEFAULT_STATE;
}

function commit(next: ThemeState) {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable
  }
  apply(next);
  for (const listener of listeners) listener();
}

export function setPreset(id: string) {
  commit({ ...getThemeState(), id });
}

/** Switch to the custom theme, seeding it from the active colors the first time. */
export function selectCustom() {
  const state = getThemeState();
  commit({
    ...state,
    id: CUSTOM_THEME_ID,
    custom: state.custom ?? { ...resolveColors(state) },
  });
}

export function setCustomColor(key: ThemeColorKey, value: string) {
  const state = getThemeState();
  const base = state.custom ?? { ...resolveColors(state) };
  commit({ ...state, id: CUSTOM_THEME_ID, custom: { ...base, [key]: value } });
}

export function setCustomColors(colors: ThemeColors) {
  commit({ ...getThemeState(), id: CUSTOM_THEME_ID, custom: { ...colors } });
}

export function setFont(font: string) {
  commit({ ...getThemeState(), font });
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement;var m=document.querySelector('meta[name="theme-color"]');var r=localStorage.getItem('${RESOLVED_KEY}');if(r){var o=JSON.parse(r);for(var k in o.colors){d.style.setProperty('--'+k,k==='overlay'?'color-mix(in srgb, '+o.colors[k]+' ${OVERLAY_OPACITY * 100}%, transparent)':o.colors[k]);}if(o.font)d.style.setProperty('--app-font',o.font);d.classList.toggle('dark',o.dark);d.style.colorScheme=o.dark?'dark':'light';if(m)m.setAttribute('content',o.colors.background);return;}var s=localStorage.getItem('${STORAGE_KEY}');var t=(s==='light'||s==='dark')?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark'){d.classList.add('dark');if(m)m.setAttribute('content','#0a0a0d');}}catch(e){}})();`;
