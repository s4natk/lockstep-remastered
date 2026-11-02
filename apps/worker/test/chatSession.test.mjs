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

try {
  const sessionId = `sess-chat-${Date.now()}`;
  const socket = new WebSocket(`ws://127.0.0.1:${worker.port}/agent/connect/${sessionId}`);
  const messages = [];
  const done = new Promise((resolve, reject) => {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      messages.push(message);
      if (message.type === "done") {
        resolve(message);
      }
      if (message.type === "error") {
        reject(new Error(message.error));
      }
    });
    socket.addEventListener("error", () => reject(new Error("websocket failed")));
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", () => reject(new Error("websocket failed to open")));
  });
  socket.send(JSON.stringify({ type: "message", text: "hi" }));
  const result = await done;
  assert.equal(messages.some((message) => message.type === "intent" && message.intent === "chat"), true);
  assert.equal(result.intent, "chat");
  assert.match(result.reply, /Lockstep/i);
  socket.close();
} finally {
  await worker.stop();
}
