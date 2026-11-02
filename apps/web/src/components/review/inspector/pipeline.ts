import type { ReviewRecord } from "../../../lib/review";

export type StepState = "pending" | "active" | "done" | "failed" | "stopped";

export interface PipelineStep {
  key: "connect" | "parse" | "retrieve" | "draft" | "verify";
  label: string;
  state: StepState;
}

const STEPS: Array<Pick<PipelineStep, "key" | "label">> = [
  { key: "connect", label: "Connect" },
  { key: "parse", label: "Parse" },
  { key: "retrieve", label: "Retrieve" },
  { key: "draft", label: "Draft" },
  { key: "verify", label: "Verify" },
];

export function isParserRejection(record: ReviewRecord): boolean {
  return record.status === "failed" && record.failure === "worker" && !record.progress.parsed;
}

/** Every state is derived from Worker events; nothing advances on a timer. */
export function pipelineSteps(record: ReviewRecord): PipelineStep[] {
  const completed = record.status === "completed";
  const done = [
    record.progress.connected,
    record.progress.parsed,
    record.progress.drafting || completed,
    completed,
    completed,
  ];
  const firstOpen = done.indexOf(false);
  return STEPS.map((step, index) => {
    if (done[index]) {
      return { ...step, state: "done" };
    }
    if (index !== firstOpen) {
      return { ...step, state: "pending" };
    }
    if (record.status === "failed") {
      return { ...step, state: "failed" };
    }
    if (record.status === "stopped") {
      return { ...step, state: "stopped" };
    }
    return { ...step, state: "active" };
  });
}

export function statusText(record: ReviewRecord): string {
  switch (record.status) {
    case "connecting":
      return "Connecting to the Worker";
    case "parsing":
      return "Parsing the migration";
    case "retrieving":
      return "Retrieving runbooks";
    case "drafting":
      return record.draft ? "Drafting the rollout note" : "Waiting for the first draft tokens";
    case "stopped":
      return "Stopped before the review finished";
    case "failed":
      if (isParserRejection(record)) {
        return "The parser rejected this migration";
      }
      return record.failure === "connection" ? "Lost the connection to the Worker" : "The review did not finish";
    case "completed":
      return "Completed";
  }
}
