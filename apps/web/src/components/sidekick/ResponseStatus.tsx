import type { InvestigationReport, SidekickMessage } from "@lockstep/shared";

type ResponseReport = Pick<InvestigationReport, "mode" | "warnings">;
type Connection = "checking" | "ai" | "evidence" | "offline";
const fallbackReasons = {
  provider_authentication: "The provider rejected authentication. Check the server-side API key.",
  provider_quota: "The provider reported a quota or billing limit. Check the provider account.",
  provider_rate_limited: "The provider rate limit was reached. Try again later.",
  provider_model_unavailable:
    "The configured model could not be accessed. Check the server's model setting and access.",
  provider_request_rejected:
    "The provider rejected this request. Check the server-side model and provider settings.",
  provider_timeout: "The AI request timed out. You can try again with a new message.",
  provider_invalid_report: "The AI response could not be validated against the available evidence.",
  provider_incomplete: "The provider returned an incomplete answer.",
  provider_unavailable: "The AI provider was unavailable for this request.",
  provider_refused: "The AI provider declined to answer this request.",
} as const;

function fallbackReason(report?: ResponseReport): string | null {
  if (report?.mode !== "deterministic") return null;
  for (const warning of report.warnings) {
    if (Object.hasOwn(fallbackReasons, warning.code))
      return fallbackReasons[warning.code as keyof typeof fallbackReasons];
  }
  return report.warnings.some((warning) => warning.code === "provider_fallback")
    ? "The AI request failed or its response could not be validated."
    : null;
}

export function ResponseMode({
  report,
  mode,
  status = "complete",
  className = "ls-answer-mode",
}: {
  report?: ResponseReport;
  mode?: SidekickMessage["mode"];
  status?: SidekickMessage["status"];
  className?: string;
}) {
  const actualMode = report?.mode ?? mode;
  const label =
    status !== "complete"
      ? status === "cancelled"
        ? "Turn stopped"
        : "Incomplete response"
      : actualMode === "ai"
        ? "AI response"
        : fallbackReason(report)
          ? "Deterministic fallback"
          : actualMode === "deterministic"
            ? "Deterministic guidance"
            : "Saved response";
  return <span className={className}>{label}</span>;
}

export function FallbackNotice({ report }: { report?: ResponseReport }) {
  if (report?.mode !== "deterministic") return null;
  const reason = fallbackReason(report);
  const notConfigured = report.warnings.some(
    (warning) => warning.code === "provider_not_configured",
  );
  return (
    <p className="ls-deterministic-note">
      {reason ? `${reason} ` : notConfigured ? "No AI key is configured on the server. " : ""}
      This response uses parsed evidence and curated guidance; no model-generated answer was used.
    </p>
  );
}

export function ServiceStatus({
  connection,
  report,
}: {
  connection: Connection;
  report?: ResponseReport | null;
}) {
  const label =
    connection === "checking"
      ? "Checking service"
      : connection === "ai"
        ? "AI key present"
        : connection === "evidence"
          ? "No AI key configured"
          : "Service offline";
  const detail =
    connection === "ai"
      ? report?.mode === "ai"
        ? "Saved response used AI"
        : report?.mode === "deterministic"
          ? "Saved response used deterministic guidance"
          : "Provider requests are not yet verified"
      : connection === "evidence"
        ? "Responses use deterministic guidance"
        : connection === "offline"
          ? "Drafts remain in this workspace"
          : "Connecting to your backend";
  return (
    <div className="ls-service-status" data-state={connection}>
      <span className="ls-service-dot" />
      <span>
        {label}
        <small>{detail}</small>
      </span>
    </div>
  );
}
