import assert from "node:assert/strict";

import { looksLikeMigration } from "../src/migrationDetect.ts";
import { allowedOrigins } from "../src/origins.ts";
import { readSessionMessage } from "../src/sessionMessage.ts";

assert.equal(looksLikeMigration("DROP TABLE sessions;"), true);
assert.equal(looksLikeMigration("hi there"), false);

const fromText = readSessionMessage(JSON.stringify({ type: "message", text: "hello", context: [] }));
assert.ok(!("error" in fromText));
if (!("error" in fromText)) {
  assert.equal(fromText.text, "hello");
  assert.equal(fromText.kind, "message");
}

const review = readSessionMessage(JSON.stringify({ type: "review", sql: "DROP TABLE t;" }));
assert.ok(!("error" in review));
if (!("error" in review)) {
  assert.equal(review.kind, "review");
  assert.equal(review.text, "DROP TABLE t;");
}

const untyped = readSessionMessage(JSON.stringify({ sql: "DROP TABLE t;" }));
assert.ok(!("error" in untyped));
if (!("error" in untyped)) {
  assert.equal(untyped.kind, "review");
}

const blankReview = readSessionMessage(JSON.stringify({ type: "review", sql: "   " }));
assert.deepEqual(blankReview, { error: "sql is required" });

const missing = readSessionMessage(JSON.stringify({ type: "message" }));
assert.deepEqual(missing, { error: "message is required" });

const badContext = readSessionMessage(JSON.stringify({ type: "review", sql: "DROP TABLE t", context: [1] }));
assert.deepEqual(badContext, { error: "context must be an array of strings" });

assert.deepEqual(allowedOrigins(undefined), ["http://localhost:3000", "http://127.0.0.1:3000"]);
assert.deepEqual(allowedOrigins(" https://a.example/, ,https://b.example "), [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://a.example",
  "https://b.example",
]);
