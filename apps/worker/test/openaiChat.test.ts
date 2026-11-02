import assert from "node:assert/strict";

import { createReviewModel } from "../src/reviewGraph.ts";
import { readChatDeltaStream } from "../src/openaiChat.ts";

const events = [
  'data: {"choices":[{"delta":{"content":"DROP "}}]}',
  "",
  'data: {"choices":[{"delta":{"content":"TABLE"}}]}',
  "data: [DONE]",
  "",
].join("\n");

const tokens: string[] = [];
for await (const token of readChatDeltaStream(new Response(events).body as ReadableStream<Uint8Array>)) {
  tokens.push(token);
}
assert.deepEqual(tokens, ["DROP ", "TABLE"]);

let called = false;
const model = createReviewModel(undefined, async () => {
  called = true;
  throw new Error("OpenAI should not be called");
});
const mockTokens: string[] = [];
for await (const token of model.stream({
  prompt: "unused",
  hazards: [],
  chunks: [],
})) {
  mockTokens.push(token);
}
assert.equal(called, false);
assert.match(mockTokens.join(""), /Friday/);
