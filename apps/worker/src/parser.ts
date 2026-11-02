import init, { parse_migration } from "../../../packages/sql_guard/pkg/sql_guard.js";
import wasmModule from "../../../packages/sql_guard/pkg/sql_guard_bg.wasm";
import type { ParseResult } from "@lockstep/shared";

export class MigrationParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationParseError";
  }
}

let ready: Promise<unknown> | undefined;

function loadParser(): Promise<unknown> {
  ready ??= init({ module_or_path: wasmModule });
  return ready;
}

export async function parseMigration(sql: string): Promise<ParseResult> {
  await loadParser();
  try {
    return JSON.parse(parse_migration(sql)) as ParseResult;
  } catch (error) {
    throw new MigrationParseError(messageFrom(error));
  }
}

function messageFrom(error: unknown): string {
  if (typeof error === "string" && error.trim() !== "") {
    return error;
  }
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return "The migration could not be parsed.";
}
