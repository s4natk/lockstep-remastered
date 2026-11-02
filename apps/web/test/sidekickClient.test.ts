import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSidekickMessage,
  isSidekickThread,
  validateSidekickTurnInput,
  type SidekickMessage,
} from "@lockstep/shared";
import { readTurnStream, readContextFile } from "../src/lib/sidekickClient.ts";
import { parseEnvironment } from "../src/lib/investigationClient.ts";
import { fixtureReport } from "./fixtures.ts";
export function messageFixture(): SidekickMessage {
  return {
    id: "answer-1",
    threadId: "thread-1",
    role: "assistant",
    content: "Check the value before reading its property.",
    createdAt: "2026-11-02T15:00:00Z",
    status: "complete",
    mode: "deterministic",
    report: fixtureReport(),
    clientTurnId: "turn-1",
    contextIds: [],
  };
}
function stream(events: unknown[], size = 3) {
  const bytes = new TextEncoder().encode(
    events.map((value) => `data: ${JSON.stringify(value)}\r\n\r\n`).join(""),
  );
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
}
const noop = () => {};
test("provisional drafts remain separate and the validated final message is authoritative", async () => {
  let draft = "";
  let saved: SidekickMessage | null = null;
  const answer = messageFixture();
  const result = await readTurnStream(
    stream(
      [
        {
          type: "stage",
          threadId: "thread-1",
          turnId: "turn-1",
          stage: "investigating",
          message: "Generating",
          schemaVersion: 1,
          sessionId: "session-test-1",
          timestamp: "2026-11-02T15:00:00Z",
        },
        {
          type: "delta",
          threadId: "thread-1",
          turnId: "turn-1",
          content: "A provisional explanation —",
          provisional: true,
        },
        { type: "message", message: answer },
        { type: "done", threadId: "thread-1", turnId: "turn-1" },
      ],
      1,
    ),
    {
      onDelta: (value) => {
        draft += value;
      },
      onMessage: (value) => {
        saved = value;
      },
      onProgress: noop,
    },
    "thread-1",
  );
  assert.ok(draft.includes("provisional"));
  assert.equal(result.content, answer.content);
  assert.deepEqual(saved, answer);
});
test("malformed, cross-thread, and interrupted streams are rejected", async () => {
  const handlers = { onProgress: noop, onDelta: noop, onMessage: noop };
  await assert.rejects(
    readTurnStream(stream([{ type: "message", message: { content: "invalid" } }]), handlers),
    /unreadable|invalid/,
  );
  await assert.rejects(
    readTurnStream(
      stream([
        {
          type: "delta",
          threadId: "thread-other",
          turnId: "turn-1",
          content: "bad",
          provisional: true,
        },
      ]),
      handlers,
      "thread-1",
    ),
    /different thread/,
  );
  await assert.rejects(
    readTurnStream(stream([{ type: "message", message: messageFixture() }]), handlers),
    /connection ended/,
  );
  await assert.rejects(
    readTurnStream(
      stream([{ type: "error", code: "provider_failed", error: "Safe provider failure" }]),
      handlers,
    ),
    /Safe provider failure/,
  );
});
test("follow-up input bounds context, messages, and metadata", () => {
  assert.equal(
    validateSidekickTurnInput({
      schemaVersion: 1,
      message: "What should I check next?",
      clientTurnId: "turn-2",
      contextIds: ["doc-1"],
    }).contextIds?.length,
    1,
  );
  for (const message of ["", "x".repeat(32769)])
    assert.throws(() =>
      validateSidekickTurnInput({ schemaVersion: 1, message, clientTurnId: "turn-1" }),
    );
  assert.throws(() =>
    validateSidekickTurnInput({
      schemaVersion: 1,
      message: "error",
      clientTurnId: "turn-1",
      contextIds: Array.from({ length: 13 }, (_, i) => `doc-${i}`),
    }),
  );
  assert.equal(isSidekickMessage(messageFixture()), true);
  assert.equal(
    isSidekickThread({
      id: "thread-1",
      title: "Investigation",
      kind: "runtime_exception",
      createdAt: "2026-11-02T15:00:00Z",
      updatedAt: "2026-11-02T15:00:00Z",
      status: "idle",
      lastPreview: "error",
      contextIds: [],
      messages: [messageFixture()],
    }),
    true,
  );
});
test("UTF-8 context uploads reject binary types, invalid encoding, and oversize files", async () => {
  assert.equal(
    await readContextFile(new File(["const ready = true;"], "service.ts")),
    "const ready = true;",
  );
  await assert.rejects(readContextFile(new File(["bad"], "secrets.p12")), /not supported/);
  await assert.rejects(readContextFile(new File([new Uint8Array([255, 255])], "bad.txt")), /UTF-8/);
  await assert.rejects(readContextFile(new File(["x".repeat(32769)], "large.log")), /32 KB/);
  await assert.rejects(readContextFile(new File(["\0binary"], "bad.log")), /UTF-8/);
});
test("environment values are explicit and prototype keys are rejected", () => {
  assert.deepEqual(
    { ...parseEnvironment("runtime=Node.js 24\nflag=a=b") },
    { runtime: "Node.js 24", flag: "a=b" },
  );
  assert.throws(() => parseEnvironment("__proto__=bad"));
  assert.throws(() => parseEnvironment("not-a-pair"));
});
