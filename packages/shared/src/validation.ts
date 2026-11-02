import { FAILURE_KINDS } from "./investigation.js";
import type { FailureKind, InvestigationInput } from "./investigation.js";

export const INPUT_LIMITS = {
  rawInput: 32_768,
  description: 2_000,
  environmentEntries: 20,
  environmentKey: 64,
  environmentValue: 256,
  payloadBytes: 65_536,
} as const;

export class InvestigationValidationError extends Error {
  readonly code = "invalid_input";
  constructor(message: string) {
    super(message);
    this.name = "InvestigationValidationError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFailureKind(value: unknown): value is FailureKind {
  return typeof value === "string" && FAILURE_KINDS.some((kind) => kind === value);
}

export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xdc00 &&
      text.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function validateInvestigationInput(value: unknown): InvestigationInput {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new InvestigationValidationError("Use investigation schemaVersion 1.");
  }
  const { rawInput, description, requestedKind, environment } = value;
  if (typeof rawInput !== "string" || rawInput.trim().length === 0) {
    throw new InvestigationValidationError("Paste an error, log, or SQL migration to investigate.");
  }
  if (rawInput.length > INPUT_LIMITS.rawInput) {
    throw new InvestigationValidationError(
      `Input must contain at most ${INPUT_LIMITS.rawInput} characters.`,
    );
  }
  if (rawInput.includes("\0")) {
    throw new InvestigationValidationError("Input must not contain null characters.");
  }
  if (
    description !== undefined &&
    (typeof description !== "string" || description.length > INPUT_LIMITS.description)
  ) {
    throw new InvestigationValidationError(
      `Description must contain at most ${INPUT_LIMITS.description} characters.`,
    );
  }
  if (requestedKind !== undefined && !isFailureKind(requestedKind)) {
    throw new InvestigationValidationError("Choose a supported failure category.");
  }
  let validEnvironment: Record<string, string> | undefined;
  if (environment !== undefined) {
    if (
      !isRecord(environment) ||
      Object.keys(environment).length > INPUT_LIMITS.environmentEntries
    ) {
      throw new InvestigationValidationError(
        `Environment must contain at most ${INPUT_LIMITS.environmentEntries} text fields.`,
      );
    }
    const entries = Object.entries(environment);
    for (const [key, entry] of entries) {
      if (
        !key.trim() ||
        key.length > INPUT_LIMITS.environmentKey ||
        typeof entry !== "string" ||
        entry.length > INPUT_LIMITS.environmentValue
      ) {
        throw new InvestigationValidationError(
          "Environment keys and values must be short text fields.",
        );
      }
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        throw new InvestigationValidationError("Environment contains an unsupported key.");
      }
    }
    validEnvironment = Object.fromEntries(entries) as Record<string, string>;
  }
  const normalized: InvestigationInput = {
    schemaVersion: 1,
    rawInput,
    ...(typeof description === "string" && description.trim()
      ? { description: description.trim() }
      : {}),
    ...(validEnvironment ? { environment: validEnvironment } : {}),
    ...(isFailureKind(requestedKind) ? { requestedKind } : {}),
  };
  if (utf8ByteLength(JSON.stringify(normalized)) > INPUT_LIMITS.payloadBytes) {
    throw new InvestigationValidationError(
      `Investigation payload must contain at most ${INPUT_LIMITS.payloadBytes} UTF-8 bytes.`,
    );
  }
  return normalized;
}
