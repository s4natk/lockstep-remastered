import assert from "node:assert/strict";
import { unstable_dev } from "wrangler";

const worker = await unstable_dev("src/index.ts", {
  config: "wrangler.toml",
  local: true,
  experimental: {
    disableExperimentalWarning: true,
    forceLocal: true,
  },
});

async function exchange(sessionId, payload) {
  const socket = new WebSocket(`ws://127.0.0.1:${worker.port}/agent/connect/${sessionId}`);
  const messages = [];
  const finished = new Promise((resolve, reject) => {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      messages.push(message);
      if (message.type === "done" || message.type === "error") {
        resolve(message);
      }
    });
    socket.addEventListener("error", () => {
      reject(new Error("websocket failed"));
    });
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", () => reject(new Error("websocket failed to open")));
  });
  socket.send(JSON.stringify(payload));
  const last = await finished;
  socket.close();
  return { messages, last };
}

try {
  const sessionId = `sess-drop-${Date.now()}`;
  const { messages, last: result } = await exchange(sessionId, { type: "review", sql: "DROP TABLE sessions" });

  assert.equal(result.type, "done");
  assert.equal(messages[0].type, "intent");
  assert.equal(messages[0].intent, "review");
  const parsed = messages.find((message) => message.type === "parse");
  assert.ok(parsed);
  assert.equal(parsed.result.hazards[0].code, "data_loss");
  assert.ok(messages.some((message) => message.type === "token"));
  assert.match(result.note, /DROP TABLE deletes the table and its rows/);
  assert.equal(result.note.includes("Friday"), false);

  const order = messages.map((message) => (message.type === "stage" ? `stage:${message.stage}` : message.type));
  const retrieveAt = order.indexOf("stage:retrieve");
  const draftAt = order.indexOf("stage:draft");
  assert.ok(order.indexOf("parse") < retrieveAt, order.join(","));
  assert.ok(retrieveAt < draftAt, order.join(","));
  assert.ok(draftAt < order.indexOf("token"), order.join(","));

  const saved = await worker.fetch(`http://localhost/api/sessions/${sessionId}`);
  assert.equal(saved.status, 200);
  const session = await saved.json();
  assert.equal(session.id, sessionId);
  assert.match(session.note, /DROP TABLE deletes the table and its rows/);
  assert.match(session.parseJson, /data_loss/);

  const invalid = await exchange(`sess-invalid-${Date.now()}`, { type: "review", sql: "ALTER TABLE" });
  assert.equal(invalid.last.type, "error");
  assert.ok(invalid.last.error.length > 0);
  assert.notEqual(invalid.last.error, "The review failed.");
  assert.equal(
    invalid.messages.some((message) => message.type === "intent" && message.intent === "chat"),
    false,
  );
} finally {
  await worker.stop();
}
