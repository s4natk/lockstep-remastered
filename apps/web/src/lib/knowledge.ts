import { isRecord, readJson, STORAGE_KEYS, writeJson } from "./storage";

export interface KnowledgeEntry {
  id: string;
  title: string;
  text: string;
  /** Only enabled entries are sent with reviews. */
  enabled: boolean;
  updatedAt: number;
}

export function loadKnowledge(): KnowledgeEntry[] {
  const raw = readJson<unknown>(STORAGE_KEYS.knowledge, []);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item): KnowledgeEntry[] => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.text !== "string") {
      return [];
    }
    if (item.text.trim() === "") {
      return [];
    }
    return [
      {
        id: item.id,
        title: typeof item.title === "string" ? item.title : "",
        text: item.text,
        enabled: item.enabled !== false,
        updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : 0,
      },
    ];
  });
}

export function saveKnowledge(entries: KnowledgeEntry[]): void {
  writeJson(
    STORAGE_KEYS.knowledge,
    entries.filter((entry) => entry.text.trim() !== ""),
  );
}

export function enabledContext(entries: KnowledgeEntry[]) {
  return entries
    .filter((entry) => entry.enabled && entry.text.trim() !== "")
    .map((entry) => ({ id: entry.id, title: entry.title.trim() || undefined, text: entry.text.trim() }));
}
