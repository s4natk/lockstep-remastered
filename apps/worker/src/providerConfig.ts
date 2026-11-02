import type { Env } from "./env.js";

export type ProviderEnvironment = Pick<
  Env,
  "OPENAI_API_KEY" | "OPENAI_MODEL" | "OPENAI_BASE_URL" | "OPENAI_EMBEDDING_MODEL"
>;
export interface ProviderConfig {
  apiKey: string | undefined;
  model: string;
  embeddingModel: string;
  baseUrl: string;
}

export function providerBaseUrl(value: string | undefined): string {
  const source = value?.trim() || "https://api.openai.com/v1";
  if (source.length > 2048 || source.includes("\\"))
    throw new Error("Invalid server provider base URL");
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("Invalid server provider base URL");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Provider base URL requires HTTPS or loopback HTTP without credentials, query, or fragment",
    );
  }
  return url.toString().replace(/\/+$/, "");
}

function modelName(value: string | undefined, fallback: string): string {
  const model = value?.trim() || fallback;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model))
    throw new Error("Invalid server provider model name");
  return model;
}

export function providerConfig(env: ProviderEnvironment): ProviderConfig {
  return {
    apiKey: env.OPENAI_API_KEY?.trim() || undefined,
    model: modelName(env.OPENAI_MODEL, "gpt-4.1-mini"),
    embeddingModel: modelName(env.OPENAI_EMBEDDING_MODEL, "text-embedding-3-small"),
    baseUrl: providerBaseUrl(env.OPENAI_BASE_URL),
  };
}
