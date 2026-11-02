const LOCAL_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

export function allowedOrigins(configured: string | undefined): string[] {
  const extra = (configured ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin !== "");
  return [...LOCAL_ORIGINS, ...extra];
}
