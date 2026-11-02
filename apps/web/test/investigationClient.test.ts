import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFailure } from "@lockstep/shared";
import { fixtureReport } from "./fixtures.ts";
import {
  parseEnvironment,
  parseProgressEvent,
  readInvestigationStream,
  readInvestigationSummaries,
} from "../src/lib/investigationClient.ts";
import { FAILURE_EXAMPLES } from "../src/lib/investigationExamples.ts";

function stream(events: unknown[], width = 7, crlf = false): ReadableStream<Uint8Array> {
  const separator = crlf ? "\r\n\r\n" : "\n\n";
  const bytes = new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}${separator}`).join(""),
  );
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += width) controller.enqueue(bytes.slice(i, i + width));
      controller.close();
    },
  });
}

test("environment values preserve equals signs and reject ambiguous lines", () => {
  assert.deepEqual(
    { ...parseEnvironment("runtime=Python 3.12\nflag=a=b") },
    { runtime: "Python 3.12", flag: "a=b" },
  );
  assert.equal(parseEnvironment("   "), undefined);
  for (const value of ["runtime", "=value", "runtime=", "__proto__=bad", "constructor=bad"])
    assert.throws(() => parseEnvironment(value));
});
test("all examples are classified as their advertised supported kind", () => {
  for (const example of FAILURE_EXAMPLES)
    assert.equal(
      normalizeFailure({ schemaVersion: 1, rawInput: example.input }).kind,
      example.kind,
      example.id,
    );
});
test("progress parsing rejects unknown stages and malformed events", () => {
  assert.equal(
    parseProgressEvent({ type: "stage", stage: "magic", sessionId: "id", message: "bad" }),
    null,
  );
  assert.equal(
    parseProgressEvent({ type: "stage", stage: "parsing", message: "missing session" }),
    null,
  );
  assert.deepEqual(
    parseProgressEvent({ type: "stage", stage: "parsing", sessionId: "id", message: "Parsing" }),
    { stage: "parsing", sessionId: "id", message: "Parsing" },
  );
});
test("history accepts complete, running, cancelled, and failed rows with nullable modes", () => {
  const rows = ["complete", "running", "cancelled", "failed"].map((status, index) => ({
    id: String(index),
    kind: "unknown",
    summary: status,
    status,
    createdAt: "2026-11-01T15:00:00Z",
    mode: status === "complete" ? "deterministic" : null,
  }));
  assert.equal(readInvestigationSummaries({ investigations: rows }).length, 4);
  assert.throws(() =>
    readInvestigationSummaries({ investigations: [{ ...rows[0], mode: "invented" }] }),
  );
  assert.throws(() =>
    readInvestigationSummaries({ investigations: [{ ...rows[0], createdAt: "invalid" }] }),
  );
});
test("stream parser handles split UTF-8, CRLF events, and real stage updates", async () => {
  const report = fixtureReport();
  report.summary = "A property access failed — inspect the value.";
  const stages: string[] = [];
  const result = await readInvestigationStream(
    stream(
      [
        { type: "stage", stage: "parsing", sessionId: report.sessionId, message: "Parsing" },
        { type: "report", report },
        { type: "done", sessionId: report.sessionId },
      ],
      1,
      true,
    ),
    (progress) => stages.push(progress.stage),
  );
  assert.equal(result.summary, report.summary);
  assert.deepEqual(stages, ["parsing"]);
});
test("stream parser rejects malformed reports and incomplete or failed streams", async () => {
  await assert.rejects(
    readInvestigationStream(
      stream([{ type: "report", report: { summary: "bad" } }, { type: "done" }]),
      () => {},
    ),
    /report format/,
  );
  await assert.rejects(
    readInvestigationStream(stream([{ type: "report", report: fixtureReport() }]), () => {}),
    /connection ended/,
  );
  await assert.rejects(
    readInvestigationStream(
      stream([{ type: "error", code: "failed", error: "Provider unavailable" }]),
      () => {},
    ),
    /Provider unavailable/,
  );
  await assert.rejects(
    readInvestigationStream(stream([{ type: "unexpected" }]), () => {}),
    /unsupported progress/,
  );
});
