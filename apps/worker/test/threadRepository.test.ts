import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFailure, isSidekickThread } from "@lockstep/shared";
import { ThreadRepository, ThreadStoreError } from "../src/threadRepository.ts";
import { InvestigationRepository } from "../src/investigationRepository.ts";
import { KnowledgeRepository } from "../src/knowledgeRepository.ts";
import { deterministicDraft } from "../src/investigationGuidance.ts";
import { investigationReport } from "../src/investigationReport.ts";
import { sqliteD1 } from "./sqliteD1.ts";

const owner = "a".repeat(64);
const other = "b".repeat(64);
const input = {
  schemaVersion: 1 as const,
  message: "HTTP 429 Too Many Requests",
  clientTurnId: "turn-1",
};
function report(sessionId: string) {
  const context = normalizeFailure({ schemaVersion: 1, rawInput: input.message });
  return investigationReport(context, deterministicDraft(context), {
    sessionId,
    createdAt: new Date().toISOString(),
    mode: "deterministic",
  });
}

test("thread history, context state and deletion are owner filtered", async () => {
  const fixture = sqliteD1();
  try {
    const repository = new ThreadRepository(fixture.db);
    const thread = await repository.create(owner, "Rate limit investigation");
    assert.equal(isSidekickThread(thread), true);
    assert.equal(await repository.find(other, thread.id), null);
    assert.deepEqual(await repository.list(other), []);
    const document = await new KnowledgeRepository(fixture.db).create(owner, {
      schemaVersion: 1,
      title: "Rate limit runbook",
      kind: "note",
      content: "Respect Retry-After.",
    });
    assert.equal(await repository.setContext(owner, thread.id, [document.id]), true);
    assert.deepEqual((await repository.find(owner, thread.id))?.contextIds, [document.id]);
    assert.equal(await repository.setContext(other, thread.id, []), false);
    assert.equal(await repository.remove(other, thread.id), false);
    assert.ok(await repository.find(owner, thread.id));
    assert.equal(await repository.remove(owner, thread.id), true);
    assert.equal(await repository.find(owner, thread.id), null);
  } finally {
    fixture.close();
  }
});

test("completed turn replay cannot claim an idle thread or generate a new assistant ID", async () => {
  const fixture = sqliteD1();
  try {
    const repository = new ThreadRepository(fixture.db);
    const staleThread = await repository.create(owner);
    const started = await repository.beginTurn(owner, staleThread, input, []);
    await assert.rejects(
      () => repository.beginTurn(owner, staleThread, { ...input, clientTurnId: "turn-2" }, []),
      ThreadStoreError,
    );
    const saved = await repository.complete(
      owner,
      staleThread.id,
      input.clientTurnId,
      started.assistantId,
      report(started.assistantId),
      "Respect Retry-After and reduce concurrency.",
    );
    assert.equal(saved.status, "complete");
    await assert.rejects(
      () => repository.beginTurn(owner, staleThread, input, []),
      ThreadStoreError,
    );
    const state = await repository.find(owner, staleThread.id);
    assert.equal(state?.status, "idle");
    assert.equal(state?.messages.length, 2);
    assert.equal(
      (await repository.turn(owner, staleThread.id, input.clientTurnId))?.assistant?.id,
      started.assistantId,
    );
  } finally {
    fixture.close();
  }
});

test("cancelled pending turns persist honestly and reject delayed completion", async () => {
  const fixture = sqliteD1();
  try {
    const repository = new ThreadRepository(fixture.db);
    const thread = await repository.create(owner);
    const started = await repository.beginTurn(owner, thread, input, ["doc-1"]);
    assert.equal((await repository.turn(owner, thread.id, input.clientTurnId))?.pending, true);
    assert.equal(await repository.setContext(owner, thread.id, []), false);
    assert.equal(await repository.cancel(other, thread.id), false);
    assert.equal(await repository.cancel(owner, thread.id), true);
    const stopped = await repository.find(owner, thread.id);
    assert.equal(stopped?.status, "idle");
    assert.equal(stopped?.messages.at(-1)?.status, "cancelled");
    assert.equal(stopped?.messages.at(-1)?.report, undefined);
    await assert.rejects(
      () =>
        repository.complete(
          owner,
          thread.id,
          input.clientTurnId,
          started.assistantId,
          report(started.assistantId),
          "Too late",
        ),
      ThreadStoreError,
    );
    const next = await repository.beginTurn(
      owner,
      stopped!,
      { ...input, clientTurnId: "turn-2", message: "What should I verify?" },
      ["doc-1"],
    );
    assert.ok(next.assistantId);
    await repository.finish(owner, thread.id, "turn-2", "failed");
    assert.equal((await repository.find(owner, thread.id))?.messages.at(-1)?.status, "failed");
  } finally {
    fixture.close();
  }
});

test("expired leases recover pending state and preserve the saved conversation", async () => {
  const fixture = sqliteD1();
  try {
    const repository = new ThreadRepository(fixture.db);
    const thread = await repository.create(owner);
    await repository.beginTurn(owner, thread, input, []);
    await fixture.db
      .prepare("UPDATE sidekick_threads SET lease_expires_at = ? WHERE id = ? AND owner_hash = ?")
      .bind("2000-01-01T00:00:00.000Z", thread.id, owner)
      .run();
    const recovered = await repository.find(owner, thread.id);
    assert.equal(recovered?.status, "idle");
    assert.equal(recovered?.messages.length, 2);
    assert.equal(recovered?.messages.at(-1)?.status, "failed");
    assert.equal(recovered?.messages[0]?.content, input.message);
  } finally {
    fixture.close();
  }
});

test("oversized completed responses remain pending until explicitly failed", async () => {
  const fixture = sqliteD1();
  try {
    const repository = new ThreadRepository(fixture.db);
    const thread = await repository.create(owner);
    const started = await repository.beginTurn(owner, thread, input, []);
    await assert.rejects(
      () =>
        repository.complete(
          owner,
          thread.id,
          input.clientTurnId,
          started.assistantId,
          report(started.assistantId),
          "x".repeat(32_769),
        ),
      ThreadStoreError,
    );
    await assert.rejects(
      () =>
        repository.complete(
          owner,
          thread.id,
          input.clientTurnId,
          started.assistantId,
          { ...report(started.assistantId), summary: "x".repeat(300_000) },
          "Answer",
        ),
      ThreadStoreError,
    );
    assert.equal((await repository.turn(owner, thread.id, input.clientTurnId))?.pending, true);
    await repository.finish(owner, thread.id, input.clientTurnId, "failed");
    assert.equal((await repository.find(owner, thread.id))?.messages.at(-1)?.status, "failed");
  } finally {
    fixture.close();
  }
});

test("legacy report migration is owner scoped, idempotent and respects thread deletion", async () => {
  const fixture = sqliteD1();
  try {
    const legacy = new InvestigationRepository(fixture.db);
    await legacy.ensureSchema();
    await legacy.begin(owner, "old-report", "http_error", "2026-11-01T15:00:00.000Z");
    await legacy.save(owner, report("old-report"));
    const repository = new ThreadRepository(fixture.db);
    await repository.importLegacy(other);
    assert.deepEqual(await repository.list(other), []);
    await repository.importLegacy(owner);
    await repository.importLegacy(owner);
    const migrated = await repository.find(owner, "legacy-old-report");
    assert.equal(migrated?.messages.length, 2);
    assert.equal(migrated?.messages.at(-1)?.report?.sessionId, "old-report");
    await repository.remove(owner, "legacy-old-report");
    await repository.importLegacy(owner);
    assert.equal(await repository.find(owner, "legacy-old-report"), null);
  } finally {
    fixture.close();
  }
});

test("concurrent thread creation cannot return an unpersisted thread beyond its quota", async () => {
  const fixture = sqliteD1();
  try {
    const repository = new ThreadRepository(fixture.db);
    for (let index = 0; index < 99; index += 1) await repository.create(owner, `Thread ${index}`);
    const results = await Promise.allSettled([
      repository.create(owner, "Concurrent A"),
      repository.create(owner, "Concurrent B"),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal((await repository.list(owner)).length, 100);
    const saved = results.find((result) => result.status === "fulfilled");
    if (saved?.status === "fulfilled") assert.ok(await repository.find(owner, saved.value.id));
    await assert.rejects(() => repository.create(owner), ThreadStoreError);
  } finally {
    fixture.close();
  }
});

test("deleting shared context repairs every owned thread pin while preserving other selections", async () => {
  const fixture = sqliteD1();
  try {
    const repository = new ThreadRepository(fixture.db);
    const knowledge = new KnowledgeRepository(fixture.db);
    const deleted = await knowledge.create(owner, {
      schemaVersion: 1,
      title: "Old runbook",
      kind: "note",
      content: "Old error context",
    });
    const kept = await knowledge.create(owner, {
      schemaVersion: 1,
      title: "Current runbook",
      kind: "note",
      content: "Current error context",
    });
    const first = await repository.create(owner);
    const second = await repository.create(owner);
    await repository.setContext(owner, first.id, [deleted.id, kept.id]);
    await repository.setContext(owner, second.id, [deleted.id]);
    await knowledge.remove(other, deleted.id);
    assert.deepEqual((await repository.find(owner, first.id))?.contextIds, [deleted.id, kept.id]);
    await knowledge.remove(owner, deleted.id);
    assert.deepEqual((await repository.find(owner, first.id))?.contextIds, [kept.id]);
    assert.deepEqual((await repository.find(owner, second.id))?.contextIds, []);
    const persisted = await fixture.db
      .prepare("SELECT context_ids_json FROM sidekick_threads WHERE id = ?")
      .bind(first.id)
      .first<{ context_ids_json: string }>();
    assert.deepEqual(JSON.parse(persisted!.context_ids_json), [kept.id]);
    const repaired = await repository.find(owner, second.id);
    await repository.beginTurn(owner, repaired!, input, repaired!.contextIds);
    assert.equal((await repository.find(owner, second.id))?.status, "running");
  } finally {
    fixture.close();
  }
});
