import { readChatDeltaStream } from "./openaiChat.js";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM = `You are Lockstep, a friendly assistant for Postgres migration reviews.
You help users understand rollout risk, hazards, and safe DDL patterns.
If the user greets you, greet them back briefly and explain they can paste SQL for a grounded review or ask migration questions.
If the user asks about anything unrelated to Postgres, SQL migrations, databases, or schema changes, politely decline and ask them to stay on migration topics.
Keep replies concise (under 120 words unless they pasted a question that needs detail).
Do not invent migration hazards without SQL input.`;

export async function* streamAssistantReply(
  userText: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): AsyncGenerator<string> {
  const trimmed = userText.trim();
  if (apiKey === undefined || apiKey === "") {
    yield* mockAssistantReply(trimmed);
    return;
  }
  const response = await fetchImpl(CHAT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      stream: true,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: trimmed },
      ],
    }),
  });
  if (!response.ok || response.body === null) {
    throw new Error(`OpenAI chat failed with ${response.status}`);
  }
  yield* readChatDeltaStream(response.body);
}

async function* mockAssistantReply(text: string): AsyncGenerator<string> {
  const lower = text.toLowerCase();
  if (/^(hi|hello|hey|yo|sup|howdy)\b/.test(lower)) {
    yield "Hi! I'm Lockstep. Paste a Postgres migration and I'll stream a rollout note with hazards and runbook citations—or ask me about safe DDL patterns.";
    return;
  }
  if (isOffTopic(lower)) {
    yield "I'm focused on Postgres migration reviews. Ask about SQL migrations, rollout risk, locks, or paste a migration to review.";
    return;
  }
  yield "Paste your migration SQL below and I'll review it. You can also ask how to ship NOT NULL columns, indexes, or table drops safely.";
}

function isOffTopic(lower: string): boolean {
  const topics = [
    "weather",
    "recipe",
    "football",
    "movie",
    "song",
    "bitcoin",
    "stock",
    "homework",
    "python code",
    "javascript",
    "react component",
    "write me a poem",
  ];
  return topics.some((topic) => lower.includes(topic));
}
