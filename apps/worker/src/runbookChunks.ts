import type { RunbookChunk } from "@lockstep/shared";

export const runbookChunks: RunbookChunk[] = [
  {
    id: "add-not-null",
    text: "ADD COLUMN NOT NULL without a default rewrites the table on Postgres. Existing rows have no value for the new column, so the rewrite takes an exclusive lock.",
  },
  {
    id: "alter-type",
    text: "ALTER COLUMN TYPE rewrites the table when the new type is not binary compatible. The rewrite copies every row under an exclusive lock.",
  },
  {
    id: "concurrent-index",
    text: "Use CREATE INDEX CONCURRENTLY so Postgres builds the index without locking writes. The index build takes longer, and it cannot run inside a transaction block.",
  },
  {
    id: "constant-default",
    text: "ADD COLUMN with a constant DEFAULT is metadata-only on Postgres 11 and newer. The default is stored on the table and existing rows are not rewritten.",
  },
  {
    id: "drop-column",
    text: "DROP COLUMN deletes stored values for that column. The column disappears from new reads, and the space is reclaimed later by vacuum.",
  },
  {
    id: "drop-if-exists",
    text: "DROP COLUMN IF EXISTS skips the drop when the column is already gone. The statement is still data loss if the column is present.",
  },
  {
    id: "drop-table",
    text: "DROP TABLE deletes the table and its rows. Dependent views and foreign keys need CASCADE, or the statement fails.",
  },
  {
    id: "expand-contract",
    text: "Use expand and contract for incompatible schema changes. Add the new shape, backfill, switch readers, then drop the old column in a later migration.",
  },
  {
    id: "lock-timeout",
    text: "Set lock_timeout before DDL so a blocked migration fails instead of waiting forever. Pair it with statement_timeout for long rewrites.",
  },
  {
    id: "nullable-add",
    text: "A nullable column add is metadata-only. Postgres updates the catalog and does not rewrite existing rows when the new column allows null.",
  },
  {
    id: "primary-key",
    text: "ADD COLUMN PRIMARY KEY builds an index and locks writes. The new column must be unique and not null before the constraint validates.",
  },
  {
    id: "set-not-null",
    text: "SET NOT NULL scans existing rows to prove none are null. The scan locks writes until it finishes. Add a check constraint first when the table is large.",
  },
  {
    id: "truncate",
    text: "TRUNCATE deletes every row while keeping the table definition. It is faster than DELETE and still takes an access exclusive lock.",
  },
  {
    id: "type-using",
    text: "A USING expression tells ALTER COLUMN TYPE how to convert each value. The conversion still rewrites the table when the types differ.",
  },
  {
    id: "unique-index",
    text: "CREATE UNIQUE INDEX locks writes unless it is created concurrently. A unique index also rejects duplicate keys already stored in the table.",
  },
];
