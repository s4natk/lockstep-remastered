export interface Env {
  DB: D1Database;
  SESSION: DurableObjectNamespace;
  VECTORIZE?: VectorizeIndex;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ALLOWED_ORIGINS?: string;
}
