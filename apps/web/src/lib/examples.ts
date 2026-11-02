import type { HazardCode } from "@lockstep/shared";

export interface ExampleMigration {
  id: string;
  title: string;
  category: ExampleCategory;
  summary: string;
  sql: string;
  /** Fixture file in eval/migrations and its labels, one per statement. */
  fixture: { file: string; labels: HazardCode[] };
}

export type ExampleCategory =
  | "Removing data"
  | "Adding columns"
  | "Changing columns"
  | "Indexes and keys"
  | "Multi-statement"
  | "Tables and rows";

export const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  "Removing data",
  "Adding columns",
  "Changing columns",
  "Indexes and keys",
  "Multi-statement",
  "Tables and rows",
];

// SQL and labels mirror eval/migrations/*.sql and labels.json, which cargo test checks.
export const EXAMPLES: ExampleMigration[] = [
  {
    id: "drop-table",
    title: "Drop a table",
    category: "Removing data",
    summary: "Removes the sessions table and every row in it.",
    sql: "DROP TABLE sessions",
    fixture: { file: "drop_table_sessions.sql", labels: ["data_loss"] },
  },
  {
    id: "drop-table-if-exists",
    title: "Drop a table if it exists",
    category: "Removing data",
    summary: "IF EXISTS only skips the drop when the table is already gone.",
    sql: "DROP TABLE IF EXISTS sessions",
    fixture: { file: "drop_table_if_exists.sql", labels: ["data_loss"] },
  },
  {
    id: "drop-column",
    title: "Drop a column",
    category: "Removing data",
    summary: "Deletes the stored values for users.email.",
    sql: "ALTER TABLE users DROP COLUMN email",
    fixture: { file: "drop_email.sql", labels: ["data_loss"] },
  },
  {
    id: "drop-column-if-exists",
    title: "Drop a column if it exists",
    category: "Removing data",
    summary: "Still deletes data when the column is present.",
    sql: "ALTER TABLE users DROP COLUMN IF EXISTS email",
    fixture: { file: "drop_column_if_exists.sql", labels: ["data_loss"] },
  },
  {
    id: "truncate",
    title: "Truncate a table",
    category: "Removing data",
    summary: "Deletes every row in users and keeps the table definition.",
    sql: "TRUNCATE TABLE users",
    fixture: { file: "truncate_table_users.sql", labels: ["data_loss"] },
  },
  {
    id: "add-not-null",
    title: "Add a NOT NULL column",
    category: "Adding columns",
    summary: "A required column with no default for existing rows.",
    sql: "ALTER TABLE users ADD COLUMN bio text NOT NULL",
    fixture: { file: "add_not_null_bio.sql", labels: ["lock_risk"] },
  },
  {
    id: "add-not-null-default",
    title: "Add a NOT NULL column with a default",
    category: "Adding columns",
    summary: "The same column with a constant default.",
    sql: "ALTER TABLE users ADD COLUMN bio text NOT NULL DEFAULT ''",
    fixture: { file: "add_not_null_default.sql", labels: ["safe"] },
  },
  {
    id: "add-nullable",
    title: "Add a nullable column",
    category: "Adding columns",
    summary: "A column that allows null for existing rows.",
    sql: "ALTER TABLE users ADD COLUMN bio text",
    fixture: { file: "add_nullable_bio.sql", labels: ["safe"] },
  },
  {
    id: "add-default-now",
    title: "Add a timestamp with DEFAULT now()",
    category: "Adding columns",
    summary: "A timestamptz column defaulting to the current time.",
    sql: "ALTER TABLE users ADD COLUMN created_at timestamptz DEFAULT now()",
    fixture: { file: "add_timestamptz_default.sql", labels: ["safe"] },
  },
  {
    id: "add-primary-key",
    title: "Add a primary key column",
    category: "Adding columns",
    summary: "Adds a column and builds its primary key index.",
    sql: "ALTER TABLE users ADD COLUMN id bigint PRIMARY KEY",
    fixture: { file: "add_primary_key_column.sql", labels: ["lock_risk"] },
  },
  {
    id: "alter-type",
    title: "Change a column type",
    category: "Changing columns",
    summary: "Changes users.age to bigint.",
    sql: "ALTER TABLE users ALTER COLUMN age TYPE bigint",
    fixture: { file: "alter_age_type.sql", labels: ["rewrite"] },
  },
  {
    id: "alter-type-using",
    title: "Change a type with USING",
    category: "Changing columns",
    summary: "A type change with an explicit conversion expression.",
    sql: "ALTER TABLE users ALTER COLUMN age TYPE bigint USING age::bigint",
    fixture: { file: "alter_type_using.sql", labels: ["rewrite"] },
  },
  {
    id: "set-data-type",
    title: "SET DATA TYPE",
    category: "Changing columns",
    summary: "The long form of ALTER COLUMN TYPE.",
    sql: "ALTER TABLE users ALTER COLUMN age SET DATA TYPE integer",
    fixture: { file: "set_data_type_age.sql", labels: ["rewrite"] },
  },
  {
    id: "set-not-null",
    title: "Set NOT NULL",
    category: "Changing columns",
    summary: "Makes an existing column required.",
    sql: "ALTER TABLE users ALTER COLUMN bio SET NOT NULL",
    fixture: { file: "set_not_null_bio.sql", labels: ["lock_risk"] },
  },
  {
    id: "rename-column",
    title: "Rename a column",
    category: "Changing columns",
    summary: "Renames users.email to contact.",
    sql: "ALTER TABLE users RENAME COLUMN email TO contact",
    fixture: { file: "rename_column.sql", labels: ["safe"] },
  },
  {
    id: "create-index",
    title: "Create an index",
    category: "Indexes and keys",
    summary: "A plain CREATE INDEX on users.email.",
    sql: "CREATE INDEX users_email_idx ON users (email)",
    fixture: { file: "create_index_email.sql", labels: ["lock_risk"] },
  },
  {
    id: "create-index-concurrently",
    title: "Create an index concurrently",
    category: "Indexes and keys",
    summary: "The same index built with CONCURRENTLY.",
    sql: "CREATE INDEX CONCURRENTLY users_email_idx ON users (email)",
    fixture: { file: "concurrent_index.sql", labels: ["safe"] },
  },
  {
    id: "unique-index",
    title: "Create a unique index",
    category: "Indexes and keys",
    summary: "A unique index built without CONCURRENTLY.",
    sql: "CREATE UNIQUE INDEX users_email_idx ON users (email)",
    fixture: { file: "unique_index_email.sql", labels: ["lock_risk"] },
  },
  {
    id: "add-then-drop",
    title: "Add a column, then drop a table",
    category: "Multi-statement",
    summary: "Two statements with different outcomes.",
    sql: "ALTER TABLE users ADD COLUMN bio text;\nDROP TABLE sessions",
    fixture: { file: "mixed_add_then_drop.sql", labels: ["safe", "data_loss"] },
  },
  {
    id: "index-then-type",
    title: "Index and type change",
    category: "Multi-statement",
    summary: "A blocking index build followed by a type change.",
    sql: "CREATE INDEX users_email_idx ON users (email);\nALTER TABLE users ALTER COLUMN age TYPE bigint",
    fixture: { file: "mixed_index_and_type.sql", labels: ["lock_risk", "rewrite"] },
  },
  {
    id: "table-then-index",
    title: "Create a table, then index it",
    category: "Multi-statement",
    summary: "A new table and an index on it.",
    sql: "CREATE TABLE accounts (\n    id bigint PRIMARY KEY\n);\nCREATE INDEX accounts_id_idx ON accounts (id)",
    fixture: { file: "create_table_then_index.sql", labels: ["safe", "lock_risk"] },
  },
  {
    id: "commented",
    title: "Migration with a comment",
    category: "Multi-statement",
    summary: "A leading comment before a nullable column add.",
    sql: "-- backfill later\nALTER TABLE users ADD COLUMN bio text",
    fixture: { file: "commented_add_column.sql", labels: ["safe"] },
  },
  {
    id: "create-table",
    title: "Create a table",
    category: "Tables and rows",
    summary: "A new accounts table with a primary key.",
    sql: "CREATE TABLE accounts (\n    id bigint PRIMARY KEY,\n    email text NOT NULL\n)",
    fixture: { file: "create_accounts.sql", labels: ["safe"] },
  },
  {
    id: "insert-row",
    title: "Insert a row",
    category: "Tables and rows",
    summary: "A data change rather than DDL.",
    sql: "INSERT INTO users (email) VALUES ('a@example.com')",
    fixture: { file: "insert_user.sql", labels: ["safe"] },
  },
  {
    id: "truncate-short",
    title: "TRUNCATE without TABLE",
    category: "Removing data",
    summary: "The short form of TRUNCATE.",
    sql: "TRUNCATE orders",
    fixture: { file: "truncate_orders.sql", labels: ["data_loss"] },
  },
];

export function exampleById(id: string): ExampleMigration | undefined {
  return EXAMPLES.find((example) => example.id === id);
}
