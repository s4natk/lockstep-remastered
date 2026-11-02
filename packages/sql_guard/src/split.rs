use serde::Serialize;
use sqlparser::dialect::PostgreSqlDialect;
use sqlparser::parser::Parser;
use sqlparser::tokenizer::{Token, Tokenizer};

/// One top-level statement and the byte span it occupies in the original migration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedStatement {
    pub index: usize,
    pub sql: String,
    pub start: usize,
    pub end: usize,
}

/// The migration could not be split into Postgres statements.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub message: String,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ParseError {}

/// Split `sql` into statements using the Postgres dialect.
///
/// Spans are byte offsets into `sql`. Each statement's `sql` field is exactly
/// `&sql[start..end]`, without the trailing semicolon.
pub fn split_statements(sql: &str) -> Result<Vec<ParsedStatement>, ParseError> {
    let dialect = PostgreSqlDialect {};
    let tokens = Tokenizer::new(&dialect, sql)
        .tokenize_with_location()
        .map_err(|err| ParseError {
            message: err.to_string(),
        })?;

    let line_starts = line_starts(sql);
    let mut statements = Vec::new();
    let mut start: Option<usize> = None;

    for token in tokens {
        if matches!(token.token, Token::Whitespace(_)) {
            continue;
        }
        let at = byte_offset(
            sql,
            &line_starts,
            token.span.start.line,
            token.span.start.column,
        );
        match token.token {
            Token::EOF => break,
            Token::SemiColon => {
                if let Some(statement_start) = start.take() {
                    push_statement(sql, &mut statements, statement_start, at)?;
                }
            }
            _ => {
                if start.is_none() {
                    start = Some(at);
                }
            }
        }
    }

    if let Some(statement_start) = start {
        push_statement(sql, &mut statements, statement_start, sql.len())?;
    }

    Ok(statements)
}

fn push_statement(
    sql: &str,
    statements: &mut Vec<ParsedStatement>,
    start: usize,
    end: usize,
) -> Result<(), ParseError> {
    let end = trim_end_offset(sql, start, end);
    if start >= end {
        return Ok(());
    }

    let text = &sql[start..end];
    let parsed = Parser::parse_sql(&PostgreSqlDialect {}, text).map_err(|err| ParseError {
        message: err.to_string(),
    })?;
    if parsed.len() != 1 {
        return Err(ParseError {
            message: format!("expected one statement, found {}", parsed.len()),
        });
    }

    statements.push(ParsedStatement {
        index: statements.len(),
        sql: text.to_string(),
        start,
        end,
    });
    Ok(())
}

fn line_starts(sql: &str) -> Vec<usize> {
    let mut starts = vec![0];
    for (index, ch) in sql.char_indices() {
        if ch == '\n' {
            starts.push(index + ch.len_utf8());
        }
    }
    starts
}

fn byte_offset(sql: &str, line_starts: &[usize], line: u64, column: u64) -> usize {
    if line == 0 {
        return 0;
    }
    let line_start = line_starts
        .get(line as usize - 1)
        .copied()
        .unwrap_or(sql.len());
    if column <= 1 {
        return line_start;
    }
    let rest = sql.get(line_start..).unwrap_or("");
    let mut seen = 1u64;
    for (index, _) in rest.char_indices() {
        if seen == column {
            return line_start + index;
        }
        seen += 1;
    }
    line_start + rest.len()
}

fn trim_end_offset(sql: &str, start: usize, end: usize) -> usize {
    let slice = sql.get(start..end).unwrap_or("");
    start + slice.trim_end().len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_sql_has_no_statements() {
        let statements = split_statements("  \n\t").unwrap();
        assert!(statements.is_empty());
    }

    #[test]
    fn one_statement_keeps_its_span() {
        let sql = "ALTER TABLE users ADD COLUMN bio text";
        let statements = split_statements(sql).unwrap();
        assert_eq!(statements.len(), 1);
        assert_eq!(statements[0].index, 0);
        assert_eq!(statements[0].sql, sql);
        assert_eq!(statements[0].start, 0);
        assert_eq!(statements[0].end, sql.len());
        assert_eq!(&sql[statements[0].start..statements[0].end], statements[0].sql);
    }

    #[test]
    fn semicolon_splits_two_statements() {
        let sql = "ALTER TABLE users ADD COLUMN bio text;\nDROP TABLE sessions;";
        let statements = split_statements(sql).unwrap();
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[0].sql, "ALTER TABLE users ADD COLUMN bio text");
        assert_eq!(statements[1].sql, "DROP TABLE sessions");
        assert_eq!(statements[1].index, 1);
        assert_eq!(
            &sql[statements[0].start..statements[0].end],
            statements[0].sql
        );
        assert_eq!(
            &sql[statements[1].start..statements[1].end],
            statements[1].sql
        );
    }

    #[test]
    fn trailing_statement_without_semicolon_is_kept() {
        let sql = "SELECT 1;\nSELECT 2";
        let statements = split_statements(sql).unwrap();
        assert_eq!(
            statements.iter().map(|statement| statement.sql.as_str()).collect::<Vec<_>>(),
            vec!["SELECT 1", "SELECT 2"]
        );
    }

    #[test]
    fn semicolon_inside_a_string_is_not_a_separator() {
        let sql = "SELECT 'a;b' AS value";
        let statements = split_statements(sql).unwrap();
        assert_eq!(statements.len(), 1);
        assert_eq!(statements[0].sql, sql);
    }

    #[test]
    fn invalid_sql_is_an_error() {
        let error = split_statements("ALTER TABLE").unwrap_err();
        assert!(!error.message.is_empty());
    }
}
