import { isRecord, readJson, STORAGE_KEYS, writeJson } from "./storage";

export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";
export type EditorFontSize = 12 | 13 | 14 | 15;

export interface Preferences {
  theme: ThemePreference;
  /** `null` follows the screen width: collapsed below 1200px. */
  navCollapsed: boolean | null;
  inspectorOpen: boolean;
  inspectorWidth: number;
  wrap: boolean;
  fontSize: EditorFontSize;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  navCollapsed: null,
  inspectorOpen: true,
  inspectorWidth: 440,
  wrap: false,
  fontSize: 13,
};

export const INSPECTOR_MIN = 340;
export const INSPECTOR_MAX = 760;

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#0C0E11",
  light: "#F4F5F7",
};

export function loadPreferences(): Preferences {
  const raw = readJson<unknown>(STORAGE_KEYS.preferences, {});
  if (!isRecord(raw)) {
    return DEFAULT_PREFERENCES;
  }
  return {
    theme: raw.theme === "dark" || raw.theme === "light" ? raw.theme : "system",
    navCollapsed: typeof raw.navCollapsed === "boolean" ? raw.navCollapsed : null,
    inspectorOpen: raw.inspectorOpen !== false,
    inspectorWidth:
      typeof raw.inspectorWidth === "number"
        ? clampInspector(raw.inspectorWidth)
        : DEFAULT_PREFERENCES.inspectorWidth,
    wrap: raw.wrap === true,
    fontSize: [12, 13, 14, 15].includes(raw.fontSize as number)
      ? (raw.fontSize as EditorFontSize)
      : DEFAULT_PREFERENCES.fontSize,
  };
}

export function savePreferences(preferences: Preferences): void {
  writeJson(STORAGE_KEYS.preferences, preferences);
}

export function clampInspector(width: number): number {
  return Math.round(Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, width)));
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") {
    return preference;
  }
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/**
 * Runs before hydration (inlined in the root layout) so the first paint uses the
 * saved theme and layout. Keep it in sync with `applyDocumentPreferences`.
 */
export const PREFERENCES_BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  STORAGE_KEYS.preferences,
)})||"{}");var t=p.theme==="light"||p.theme==="dark"?p.theme:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");d.dataset.theme=t;d.style.colorScheme=t;if(typeof p.navCollapsed==="boolean"){d.dataset.nav=p.navCollapsed?"collapsed":"expanded";}if(p.inspectorOpen===false){d.dataset.inspector="closed";}if(typeof p.inspectorWidth==="number"){d.style.setProperty("--inspector-width",Math.min(${INSPECTOR_MAX},Math.max(${INSPECTOR_MIN},p.inspectorWidth))+"px");}if(typeof p.fontSize==="number"){d.style.setProperty("--editor-font-size",p.fontSize+"px");}}catch(e){d.dataset.theme="dark";}})();`;

export function applyDocumentPreferences(preferences: Preferences): ResolvedTheme {
  const root = document.documentElement;
  const theme = resolveTheme(preferences.theme);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  if (preferences.navCollapsed === null) {
    delete root.dataset.nav;
  } else {
    root.dataset.nav = preferences.navCollapsed ? "collapsed" : "expanded";
  }
  if (preferences.inspectorOpen) {
    delete root.dataset.inspector;
  } else {
    root.dataset.inspector = "closed";
  }
  root.style.setProperty("--inspector-width", `${clampInspector(preferences.inspectorWidth)}px`);
  root.style.setProperty("--editor-font-size", `${preferences.fontSize}px`);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = THEME_COLORS[theme];
  }
  return theme;
}
