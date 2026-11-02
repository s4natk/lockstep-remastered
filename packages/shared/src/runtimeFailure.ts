import type { Evidence, StackFrame } from "./investigation.js";
import { addFinding, emptyDetails, plainText } from "./parsing.js";
import type { ParsedFailureDetails } from "./parsing.js";

export function parseRuntimeFailure(evidence: Evidence[]): ParsedFailureDetails {
  const result = emptyDetails();
  for (const item of evidence) {
    const text = plainText(item.content);
    const error = text.match(
      /^\s*((?:[\w.$]+\.)?(?:[\w$]*(?:Error|Exception))(?::.*)?|Exception in thread .+|thread '[^']+' panicked at.*)$/,
    );
    if (error?.[1]) {
      result.errorMessages.push(error[1]);
      addFinding(result, "runtime.error", error[1], [item.id]);
      const name = error[1].match(/(?:[\w.$]+\.)?([\w$]*(?:Error|Exception))/)?.[1];
      if (name) result.metadata.errorType = name;
    }
    let frame: StackFrame | undefined;
    const python = text.match(/^\s*File "(.+)", line (\d+)(?:, in (.+))?/);
    const javascript = text.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/);
    const java = text.match(/^\s*at\s+([\w.$<>]+)\(([^:()]+):(\d+)\)/);
    const rust = text.match(
      /(?:panicked at(?:\s+.*?:)?\s*|^\s*at\s+)([^\s]+\.rs):(\d+)(?::(\d+))?/,
    );
    if (python?.[1] && python[2]) {
      frame = {
        language: "python",
        file: python[1],
        line: Number(python[2]),
        ...(python[3] ? { function: python[3] } : {}),
        evidenceId: item.id,
      };
    } else if (java?.[1] && java[2] && java[3]) {
      frame = {
        language: "java",
        file: java[2],
        line: Number(java[3]),
        function: java[1],
        evidenceId: item.id,
      };
    } else if (rust?.[1] && rust[2]) {
      frame = {
        language: "rust",
        file: rust[1],
        line: Number(rust[2]),
        ...(rust[3] ? { column: Number(rust[3]) } : {}),
        evidenceId: item.id,
      };
    } else if (javascript?.[2] && javascript[3] && javascript[4]) {
      frame = {
        language: "javascript",
        file: javascript[2],
        line: Number(javascript[3]),
        column: Number(javascript[4]),
        ...(javascript[1] ? { function: javascript[1] } : {}),
        evidenceId: item.id,
      };
    }
    if (frame && result.stackFrames.length < 128) {
      result.stackFrames.push(frame);
      result.metadata.language = frame.language;
    }
  }
  if (result.stackFrames.length) {
    addFinding(
      result,
      "runtime.stack_frames",
      `Extracted ${result.stackFrames.length} stack frame(s); a frame identifies a location, not a proven cause.`,
      result.stackFrames.map((frame) => frame.evidenceId),
    );
  }
  return result;
}
