const CHAT_URL = "https://api.openai.com/v1/chat/completions";

export async function* readChatDeltaStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const token = deltaFromLine(line);
        if (token === undefined) {
          continue;
        }
        if (token.length > 0) {
          yield token;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function deltaFromLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return undefined;
  }
  const data = trimmed.slice("data:".length).trim();
  if (data === "[DONE]") {
    return undefined;
  }
  const payload = JSON.parse(data) as {
    choices?: Array<{ delta?: { content?: string } }>;
  };
  return payload.choices?.[0]?.delta?.content ?? "";
}

export async function* streamOpenAiChat(options: {
  apiKey: string;
  prompt: string;
  fetchImpl?: typeof fetch;
  model?: string;
}): AsyncGenerator<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(CHAT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? "gpt-4.1-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "You write a Postgres rollout note. Describe only hazards the parser returned. Every sentence must quote a parser reason or a runbook chunk exactly.",
        },
        { role: "user", content: options.prompt },
      ],
    }),
  });
  if (!response.ok || response.body === null) {
    throw new Error(`OpenAI chat failed with ${response.status}`);
  }
  yield* readChatDeltaStream(response.body);
}
