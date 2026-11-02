import { DatabaseSync } from "node:sqlite";
type BindValue = string | number | null;
export function sqliteD1() {
  const sqlite = new DatabaseSync(":memory:");
  const prepare = (sql: string) => {
    let values: BindValue[] = [];
    const statement = {
      bind(...input: BindValue[]) {
        values = input;
        return statement;
      },
      async first<T>() {
        return (sqlite.prepare(sql).get(...values) ?? null) as T | null;
      },
      async all<T>() {
        return { results: sqlite.prepare(sql).all(...values) as T[] };
      },
      async run() {
        return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } };
      },
    };
    return statement;
  };
  const adapter = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db: adapter as unknown as D1Database, close: () => sqlite.close() };
}
