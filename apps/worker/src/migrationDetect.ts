const DDL =
  /\b(ALTER|CREATE|DROP|TRUNCATE|RENAME|GRANT|REVOKE|COMMENT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b/i;

export function looksLikeMigration(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") {
    return false;
  }
  if (DDL.test(trimmed)) {
    return true;
  }
  if (/;\s*$/.test(trimmed) && /\b(TABLE|INDEX|COLUMN|TYPE|CONSTRAINT|SCHEMA|DATABASE)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}
