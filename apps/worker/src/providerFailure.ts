import type { ParsingWarning } from "@lockstep/shared";

const messages = {
  provider_authentication:
    "The AI provider rejected the server credential or its permissions. Check the Worker secret OPENAI_API_KEY and the key's project access.",
  provider_quota:
    "The AI provider reports exhausted API credits or a spending/usage limit. Check API billing and organization/project limits before retrying.",
  provider_rate_limited:
    "The AI provider is rate limiting requests. Wait briefly and retry; check project rate limits if this continues.",
  provider_model_unavailable:
    "The AI provider could not find the configured model or API endpoint. Check OPENAI_MODEL, OPENAI_BASE_URL, and project model access.",
  provider_request_rejected:
    "The AI provider rejected this request. Check the configured model and its support for streamed structured outputs.",
  provider_timeout:
    "The AI provider did not finish within 25 seconds. Retry this message; if it persists, check the configured provider's availability.",
  provider_invalid_report:
    "The AI response failed structure or evidence validation. Its provisional text was replaced with deterministic guidance; retry this message.",
  provider_incomplete:
    "The AI provider returned an incomplete response. Its provisional text was replaced with deterministic guidance; retry this message.",
  provider_refused:
    "The AI provider declined this request. Deterministic guidance is shown instead.",
  provider_unavailable:
    "The AI provider could not be reached or is temporarily unavailable. Retry this message and check the server's provider configuration if it continues.",
} as const;

type ProviderFailureCode = keyof typeof messages;

/** Only fixed public explanations cross the API boundary, never provider error bodies. */
export class ProviderFailure extends Error {
  readonly code: ProviderFailureCode;
  constructor(code: ProviderFailureCode) {
    super(code);
    this.name = "ProviderFailure";
    this.code = code;
  }
}

export function providerFailureWarning(error: unknown): ParsingWarning {
  let code: ProviderFailureCode = "provider_unavailable";
  if (error instanceof ProviderFailure) code = error.code;
  else if (error instanceof Error) {
    if (error.name === "TimeoutError") code = "provider_timeout";
    else if (error.message === "provider_refused") code = "provider_refused";
    else if (error.message === "provider_incomplete") code = "provider_incomplete";
    else if (
      error instanceof SyntaxError ||
      /^provider_(invalid_|malformed|empty|answer_too_large|output_too_large|stream_too_large)/.test(
        error.message,
      )
    )
      code = "provider_invalid_report";
  }
  return { code, message: messages[code] };
}

export async function providerResponseFailure(
  response: Response,
  signal: AbortSignal,
): Promise<ProviderFailure> {
  let code: ProviderFailureCode = "provider_unavailable";
  if (response.status === 401 || response.status === 403) code = "provider_authentication";
  else if (response.status === 402) code = "provider_quota";
  else if (response.status === 404) code = "provider_model_unavailable";
  else if (response.status === 429) code = "provider_rate_limited";
  else if (response.status >= 400 && response.status < 500) code = "provider_request_rejected";
  // Error messages can echo credentials. Inspect only an allowlisted code in a bounded body.
  if ((response.status === 400 || response.status === 429) && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let body = "";
    const abort = () => {
      void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      while (true) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        signal.throwIfAborted();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 16_384) break;
        body += decoder.decode(chunk.value, { stream: true });
      }
      if (bytes <= 16_384) {
        const payload: unknown = JSON.parse(body + decoder.decode());
        if (payload && typeof payload === "object" && "error" in payload) {
          const detail = payload.error;
          if (detail && typeof detail === "object" && "code" in detail) {
            if (
              [
                "insufficient_quota",
                "billing_hard_limit_reached",
                "billing_not_active",
                "credit_balance_exhausted",
                "organization_spend_limit_exceeded",
                "project_spend_limit_exceeded",
                "organization_usage_limit_exceeded",
              ].includes(String(detail.code))
            )
              code = "provider_quota";
            else if (detail.code === "model_not_found") code = "provider_model_unavailable";
            else if (detail.code === "invalid_api_key") code = "provider_authentication";
          }
        }
      }
    } catch {
      /* Retain the safe status-based explanation if the error body is unreadable. */
    } finally {
      signal.removeEventListener("abort", abort);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  } else await response.body?.cancel().catch(() => undefined);
  return new ProviderFailure(code);
}
