import type { NormalizedFailureContext, RetrievalQuery } from "@lockstep/shared";
import { indexTokens } from "./runbookIndex.js";

export function investigationQueries(context: NormalizedFailureContext): RetrievalQuery[] {
  const terms = [
    ...new Set(
      indexTokens(
        [
          context.kind.replaceAll("_", " "),
          ...context.errorMessages.slice(0, 5),
          ...context.findings.slice(0, 8).map((finding) => finding.message),
          context.metadata.status ?? "",
        ].join(" "),
      ),
    ),
  ].slice(0, 32);
  return [{ kind: context.kind, terms, text: terms.join(" ").slice(0, 1200) }];
}
