export async function formatSql(sql: string): Promise<string> {
  const { format } = await import("sql-formatter");
  return format(sql, {
    language: "postgresql",
    keywordCase: "upper",
    tabWidth: 2,
    linesBetweenQueries: 1,
  });
}
