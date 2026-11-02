export interface Env {
  DB: D1Database;
  SESSION: DurableObjectNamespace;
  VECTORIZE?: VectorizeIndex;
  OPENAI_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
}
