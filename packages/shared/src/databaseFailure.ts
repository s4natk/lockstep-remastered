import type { Evidence } from "./investigation.js";
import { addFinding, emptyDetails, plainText } from "./parsing.js";
import type { ParsedFailureDetails } from "./parsing.js";

export function parseDatabaseFailure(evidence: Evidence[]): ParsedFailureDetails {
  const result = emptyDetails();
  result.metadata.database = "PostgreSQL-compatible diagnostic";
  for (const item of evidence) {
    const text = plainText(item.content).trim();
    if (/SQLITE_|sqlite3\./i.test(text)) result.metadata.database = "SQLite diagnostic";
    const sqlstate = text.match(/\bSQLSTATE\s*[[(":=]*\s*([A-Z0-9]{5})\b/i);
    if (sqlstate?.[1]) {
      result.metadata.sqlstate = sqlstate[1].toUpperCase();
      addFinding(
        result,
        "database.sqlstate",
        `The input reports SQLSTATE ${result.metadata.sqlstate}.`,
        [item.id],
      );
    }
    if (
      /\bSQLITE_[A-Z_]+:|sqlite3\.(?:OperationalError|IntegrityError|DatabaseError):|UNIQUE constraint failed:|\b(?:ERROR|FATAL|DETAIL|HINT):|(?:psycopg\d?|PG::|SequelizeDatabaseError)|violates (?:foreign key|not-null|unique) constraint/i.test(
        text,
      )
    ) {
      result.errorMessages.push(text);
      addFinding(result, "database.error", text, [item.id]);
    }
  }
  return result;
}
