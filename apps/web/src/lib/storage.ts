export const STORAGE_KEYS = {
  preferences: "lockstep.prefs.v1",
  knowledge: "lockstep.knowledge",
  history: "lockstep.reviews.v1",
  draft: "lockstep.draft.sql",
  thread: "lockstep.thread.v1",
  askDraft: "lockstep.draft.ask",
} as const;

export function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  if (typeof localStorage === "undefined") {
    return false;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readText(key: string): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key: string, value: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    if (value === "") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Storage can be full or disabled; drafts are best-effort.
  }
}

export function removeKey(key: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore: nothing to clean up when storage is unavailable.
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
