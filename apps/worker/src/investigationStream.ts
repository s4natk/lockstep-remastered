/** Incrementally decode the first structured-output field without showing JSON escapes. */
export class AssistantAnswerDecoder {
  private state: "prefix" | "string" | "escape" | "unicode" | "done" | "disabled" = "prefix";
  private prefix = "";
  private unicode = "";
  private highSurrogate = "";
  private length = 0;

  push(delta: string): string {
    if (this.state === "disabled" || this.state === "done") return "";
    let source = delta;
    if (this.state === "prefix") {
      this.prefix += delta;
      const match = /^\s*\{\s*"assistantAnswer"\s*:\s*"/.exec(this.prefix);
      if (!match) {
        if (this.prefix.length > 256) this.state = "disabled";
        return "";
      }
      source = this.prefix.slice(match[0].length);
      this.prefix = "";
      this.state = "string";
    }
    let output = "";
    const append = (character: string) => {
      const code = character.charCodeAt(0);
      if (code >= 0xd800 && code <= 0xdbff) {
        if (this.highSurrogate) throw new Error("provider_invalid_unicode");
        this.highSurrogate = character;
        return;
      }
      if (code >= 0xdc00 && code <= 0xdfff) {
        if (!this.highSurrogate) throw new Error("provider_invalid_unicode");
        output += this.highSurrogate + character;
        this.highSurrogate = "";
        this.length += 2;
      } else {
        if (this.highSurrogate) throw new Error("provider_invalid_unicode");
        output += character;
        this.length += character.length;
      }
      if (this.length > 20_000) throw new Error("provider_answer_too_large");
    };
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index]!;
      if (this.state === "done") break;
      if (this.state === "unicode") {
        if (!/[a-fA-F0-9]/.test(character)) throw new Error("provider_invalid_escape");
        this.unicode += character;
        if (this.unicode.length === 4) {
          append(String.fromCharCode(Number.parseInt(this.unicode, 16)));
          this.unicode = "";
          this.state = "string";
        }
      } else if (this.state === "escape") {
        if (character === "u") {
          this.state = "unicode";
          continue;
        }
        const escapes: Record<string, string> = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        const decoded = escapes[character];
        if (decoded === undefined) throw new Error("provider_invalid_escape");
        append(decoded);
        this.state = "string";
      } else if (character === '"') {
        if (this.highSurrogate) throw new Error("provider_invalid_unicode");
        this.state = "done";
      } else if (character === "\\") this.state = "escape";
      else {
        if (character.charCodeAt(0) < 0x20) throw new Error("provider_invalid_escape");
        append(character);
      }
    }
    return output;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readStructuredChatStream(
  response: Response,
  onText: ((delta: string) => void | Promise<void>) | undefined,
  signal?: AbortSignal,
): Promise<string> {
  if (!response.body) throw new Error("provider_empty");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const answer = new AssistantAnswerDecoder();
  let buffer = "";
  let eventData: string[] = [];
  let content = "";
  let bytes = 0;
  let finishReason: unknown;
  let ended = false;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", abort, { once: true });
  const processEvent = async () => {
    if (!eventData.length) return;
    const data = eventData.join("\n");
    eventData = [];
    if (data.trim() === "[DONE]") {
      ended = true;
      return;
    }
    const payload: unknown = JSON.parse(data);
    if (!record(payload) || payload.error) throw new Error("provider_malformed_stream");
    if (!Array.isArray(payload.choices) || !payload.choices.length) return;
    const choice: unknown = payload.choices[0];
    if (!record(choice)) throw new Error("provider_malformed_stream");
    if (choice.finish_reason !== null && choice.finish_reason !== undefined)
      finishReason = choice.finish_reason;
    if (!record(choice.delta)) return;
    if (choice.delta.refusal) throw new Error("provider_refused");
    if (typeof choice.delta.content !== "string") return;
    content += choice.delta.content;
    if (content.length > 100_000) throw new Error("provider_output_too_large");
    const text = answer.push(choice.delta.content);
    if (text) await onText?.(text);
  };
  const processLine = async (line: string) => {
    const clean = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (!clean) await processEvent();
    else if (clean.startsWith("data:")) eventData.push(clean.slice(5).replace(/^ /, ""));
  };
  try {
    while (!ended) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      signal?.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1_048_576) throw new Error("provider_stream_too_large");
      buffer += decoder.decode(chunk.value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0 && !ended) {
        await processLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
      if (buffer.length > 100_000) throw new Error("provider_stream_too_large");
    }
    if (!ended) {
      buffer += decoder.decode();
      if (buffer) await processLine(buffer);
      await processEvent();
    }
    if (finishReason !== "stop") throw new Error("provider_incomplete");
    return content;
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
