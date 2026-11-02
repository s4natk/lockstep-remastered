"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  applyDocumentPreferences,
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type Preferences,
  type ResolvedTheme,
} from "../../lib/preferences";

interface PreferencesValue {
  preferences: Preferences;
  resolvedTheme: ResolvedTheme;
  ready: boolean;
  update: (patch: Partial<Preferences>) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [ready, setReady] = useState(false);
  const current = useRef<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const loaded = loadPreferences();
    current.current = loaded;
    setPreferences(loaded);
    setResolvedTheme(applyDocumentPreferences(loaded));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || preferences.theme !== "system") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setResolvedTheme(applyDocumentPreferences(current.current));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preferences.theme, ready]);

  const update = useCallback((patch: Partial<Preferences>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    savePreferences(next);
    setPreferences(next);
    setResolvedTheme(applyDocumentPreferences(next));
  }, []);

  const value = useMemo(
    () => ({ preferences, resolvedTheme, ready, update }),
    [preferences, resolvedTheme, ready, update],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (value === null) {
    throw new Error("usePreferences must be used inside PreferencesProvider");
  }
  return value;
}
