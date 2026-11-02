const ACCESS_KEY_STORAGE = "lockstep.investigation.access.v1";
const ACCESS_KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
export class InvestigationClientError extends Error {
  readonly code: string;
  constructor(message: string, code = "request_failed") {
    super(message);
    this.name = "InvestigationClientError";
    this.code = code;
  }
}
export function investigationApiUrl(): string {
  return (process.env.NEXT_PUBLIC_WORKER_URL ?? "http://localhost:8787").replace(/\/+$/, "");
}
export function getInvestigationAccessKey(): string {
  try {
    const existing = window.localStorage.getItem(ACCESS_KEY_STORAGE);
    if (existing && ACCESS_KEY_PATTERN.test(existing)) return existing;
    const bytes = window.crypto.getRandomValues(new Uint8Array(32));
    const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(ACCESS_KEY_STORAGE, key);
    return key;
  } catch {
    throw new InvestigationClientError(
      "Private history needs browser storage. Allow local storage for this site, then try again.",
      "storage_unavailable",
    );
  }
}
export function parseEnvironment(text: string): Record<string, string> | undefined {
  if (!text.trim()) return undefined;
  const environment: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const line of text.split(/\r?\n/).filter((value) => value.trim())) {
    const split = line.indexOf("=");
    if (split < 1 || !line.slice(0, split).trim() || !line.slice(split + 1).trim())
      throw new InvestigationClientError(
        "Use one KEY=value pair per line for environment details.",
        "invalid_environment",
      );
    const key = line.slice(0, split).trim();
    if (["__proto__", "constructor", "prototype"].includes(key))
      throw new InvestigationClientError(
        "Use descriptive environment keys such as runtime or framework.",
        "invalid_environment",
      );
    environment[key] = line.slice(split + 1).trim();
  }
  return environment;
}
