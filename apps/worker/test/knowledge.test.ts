import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isKnowledgeDocument,
  isKnowledgeSummary,
  isSidekickEvent,
  isSidekickMessage,
  isSidekickThread,
  validateKnowledgeInput,
  validateSidekickTurnInput,
  InvestigationValidationError,
} from "@lockstep/shared";
import {
  chunkKnowledge,
  KnowledgeRepository,
  KnowledgeCapacityError,
} from "../src/knowledgeRepository.ts";
import { readKnowledgeContext, searchKnowledge } from "../src/knowledgeSearch.ts";
import { indexKnowledge, removeKnowledgeVectors } from "../src/knowledgeVectors.ts";
import { sqliteD1 } from "./sqliteD1.ts";
import type { Env } from "../src/env.ts";

const firstOwner = "a".repeat(64);
const secondOwner = "b".repeat(64);
const context = {
  schemaVersion: 1 as const,
  title: "Cache runbook",
  kind: "document" as const,
  content:
    "If the cache pool is exhausted, reduce worker concurrency.\nVerify connection release after every job.",
};

test("knowledge and turn validation enforce schema, payload and selected context limits", () => {
  assert.equal(
    validateKnowledgeInput({ ...context, title: "  Cache runbook  " }).title,
    "Cache runbook",
  );
  for (const invalid of [
    { ...context, content: "界".repeat(32_768) },
    { ...context, kind: "executable" },
    { ...context, content: "" },
    { ...context, content: "bad\0input" },
    { ...context, title: "a".repeat(161) },
  ])
    assert.throws(() => validateKnowledgeInput(invalid), InvestigationValidationError);
  assert.equal(
    validateSidekickTurnInput({
      schemaVersion: 1,
      message: "Why does this fail?",
      clientTurnId: "turn-1",
      contextIds: ["doc-1"],
    }).message,
    "Why does this fail?",
  );
  for (const invalid of [
    { schemaVersion: 1, message: "failure", clientTurnId: "" },
    {
      schemaVersion: 1,
      message: "failure",
      clientTurnId: "turn-1",
      contextIds: ["doc-1", "doc-1"],
    },
    {
      schemaVersion: 1,
      message: "failure",
      clientTurnId: "turn-1",
      contextIds: Array.from({ length: 13 }, (_, index) => `doc-${index}`),
    },
    { schemaVersion: 1, message: "界".repeat(32_768), clientTurnId: "turn-1" },
  ])
    assert.throws(() => validateSidekickTurnInput(invalid), InvestigationValidationError);
});

test("chunks preserve original CRLF source text, line ranges and surrogate pairs", () => {
  const text = "first line\r\nsecond line\r\n".repeat(200) + "\u{1f600}".repeat(2_000);
  const chunks = chunkKnowledge(text);
  assert.equal(chunks.map((chunk) => chunk.content).join(""), text);
  assert.ok(
    chunks.every((chunk) => chunk.content.length <= 2_400 && chunk.lineEnd >= chunk.lineStart),
  );
  for (const chunk of chunks) {
    const last = chunk.content.charCodeAt(chunk.content.length - 1);
    assert.ok(!(last >= 0xd800 && last <= 0xdbff));
  }
  assert.ok(chunkKnowledge("x".repeat(32_768)).length <= 24);
});

test("SQLite-backed D1 CRUD and keyword retrieval preserve provenance and ownership", async () => {
  const fixture = sqliteD1();
  try {
    const repository = new KnowledgeRepository(fixture.db);
    const saved = await repository.create(firstOwner, context);
    const other = await repository.create(secondOwner, {
      ...context,
      title: "Private B",
      content: "private_unique_b credential rotation notes",
    });
    assert.equal(isKnowledgeDocument(saved), true);
    assert.equal(isKnowledgeSummary((await repository.list(firstOwner))[0]), true);
    assert.equal((await repository.find(firstOwner, saved.id))?.content, context.content);
    assert.equal(await repository.find(secondOwner, saved.id), null);
    assert.equal(
      (await repository.list(firstOwner)).some((item) => item.id === other.id),
      false,
    );
    const result = await searchKnowledge(fixture.db, firstOwner, "cache pool exhausted");
    assert.equal(result.length, 1);
    assert.equal(result[0]?.kind, "context");
    assert.equal(result[0]?.provenance.sourceId, `knowledge:${saved.id}`);
    assert.equal(result[0]?.provenance.lineStart, 1);
    assert.equal(result[0]?.provenance.lineEnd, 2);
    assert.deepEqual(await searchKnowledge(fixture.db, firstOwner, "private_unique_b"), []);
    assert.deepEqual(await searchKnowledge(fixture.db, firstOwner, "cache", []), []);
    assert.deepEqual(await readKnowledgeContext(fixture.db, firstOwner, [other.id]), []);
    assert.ok(
      (await readKnowledgeContext(fixture.db, firstOwner, [saved.id]))[0]?.id.startsWith(
        `context:${saved.id}:`,
      ),
    );
    await repository.remove(secondOwner, saved.id);
    assert.ok(await repository.find(firstOwner, saved.id));
    await repository.remove(firstOwner, saved.id);
    assert.equal(await repository.find(firstOwner, saved.id), null);
    assert.deepEqual(await searchKnowledge(fixture.db, firstOwner, "cache"), []);
  } finally {
    fixture.close();
  }
});

test("the atomic document quota prevents orphan chunks and remains owner scoped", async () => {
  const fixture = sqliteD1();
  try {
    const repository = new KnowledgeRepository(fixture.db);
    for (let index = 0; index < 50; index += 1)
      await repository.create(firstOwner, { ...context, title: `Document ${index}` });
    await assert.rejects(() => repository.create(firstOwner, context), KnowledgeCapacityError);
    assert.equal((await repository.list(firstOwner)).length, 50);
    assert.equal((await repository.chunks(firstOwner)).length, 50);
    assert.ok(await repository.create(secondOwner, context));
  } finally {
    fixture.close();
  }
});

test("semantic matches resolve through owned D1 and deleted vectors cannot leak content", async () => {
  const fixture = sqliteD1();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ data: [{ embedding: Array.from({ length: 64 }, () => 0.125) }] });
  try {
    const repository = new KnowledgeRepository(fixture.db);
    const owned = await repository.create(firstOwner, context);
    const other = await repository.create(secondOwner, {
      ...context,
      content: "private_unique_b instructions",
    });
    const foreignId = (await repository.chunks(secondOwner, [other.id]))[0]?.id ?? "missing";
    const ownedId = (await repository.chunks(firstOwner, [owned.id]))[0]?.id ?? "missing";
    let options: unknown;
    let indexed: unknown[] = [];
    const vectorize = {
      query: async (_values: number[], query: unknown) => {
        options = query;
        return { matches: [{ id: foreignId }, { id: ownedId }] };
      },
      upsert: async (vectors: unknown[]) => {
        indexed = vectors;
        return { mutationId: "test" };
      },
      deleteByIds: async () => {
        throw new Error("temporarily unavailable");
      },
    } as unknown as VectorizeIndex;
    const env: Pick<Env, "OPENAI_API_KEY" | "VECTORIZE"> = {
      OPENAI_API_KEY: "fixture-only-provider-key",
      VECTORIZE: vectorize,
    };
    assert.equal(await indexKnowledge(fixture.db, firstOwner, owned.id, env), true);
    assert.equal((await repository.find(firstOwner, owned.id))?.indexStatus, "semantic");
    assert.ok(
      indexed.every(
        (vector) =>
          typeof vector === "object" &&
          vector !== null &&
          "namespace" in vector &&
          vector.namespace === firstOwner,
      ),
    );
    const results = await searchKnowledge(fixture.db, firstOwner, "no lexical match", undefined, {
      env,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.provenance.sourceId, `knowledge:${owned.id}`);
    assert.deepEqual(options, { topK: 12, namespace: firstOwner, filter: { owner: firstOwner } });
    await removeKnowledgeVectors(await repository.remove(firstOwner, owned.id), env);
    assert.deepEqual(
      await searchKnowledge(fixture.db, firstOwner, "cache", undefined, { env }),
      [],
    );
  } finally {
    globalThis.fetch = originalFetch;
    fixture.close();
  }
});

test("sidekick guards reject malformed state and enforce provisional delta events", () => {
  const now = "2026-11-02T15:00:00.000Z";
  const thread = {
    id: "thread-1",
    title: "Cache pool",
    kind: "application_log",
    createdAt: now,
    updatedAt: now,
    status: "idle",
    lastPreview: "Investigate cache",
  };
  const message = {
    id: "message-1",
    threadId: thread.id,
    role: "assistant",
    content: "Inspect cache release",
    createdAt: now,
    status: "complete",
    clientTurnId: "turn-1",
    mode: "deterministic",
  };
  assert.equal(isSidekickMessage(message), true);
  assert.equal(isSidekickThread({ ...thread, contextIds: [], messages: [message] }), true);
  assert.equal(
    isSidekickThread({ ...thread, contextIds: [], messages: [message, message] }),
    false,
  );
  assert.equal(
    isSidekickThread({
      ...thread,
      contextIds: [],
      messages: [{ ...message, threadId: "foreign-thread" }],
    }),
    false,
  );
  assert.equal(isSidekickMessage({ ...message, report: {} }), false);
  assert.equal(
    isSidekickEvent({
      type: "delta",
      threadId: thread.id,
      turnId: "turn-1",
      content: "Working",
      provisional: true,
    }),
    true,
  );
  assert.equal(
    isSidekickEvent({
      type: "delta",
      threadId: thread.id,
      turnId: "turn-1",
      content: "Working",
      provisional: false,
    }),
    false,
  );
  assert.equal(
    isSidekickEvent({
      type: "stage",
      schemaVersion: 1,
      sessionId: "turn-1",
      timestamp: now,
      threadId: thread.id,
      turnId: "turn-1",
      stage: "retrieving",
      message: "Finding context",
    }),
    true,
  );
  assert.equal(
    isSidekickEvent({ type: "thread", thread: { ...thread, title: { toString: 1 } } }),
    false,
  );
});
