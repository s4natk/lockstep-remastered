use serde::Serialize;
use sqlparser::ast::{
    AlterColumnOperation, AlterTableOperation, ColumnDef, ColumnOption, ObjectType, Statement,
};
use sqlparser::dialect::PostgreSqlDialect;
use sqlparser::parser::Parser;

use crate::{split_statements, ParseError, ParsedStatement};

/// A hazard the parser can prove from the statement AST.
///
/// A statement that is not listed here is safe, and it does not appear in [`ParseResult::hazards`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HazardCode {
    LockRisk,
    DataLoss,
    Rewrite,
}

impl HazardCode {
    pub fn as_str(self) -> &'static str {
        match self {
            HazardCode::LockRisk => "lock_risk",
            HazardCode::DataLoss => "data_loss",
            HazardCode::Rewrite => "rewrite",
        }
    }
}

/// One dangerous statement, with the byte span it occupies in the original migration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hazard {
    pub code: HazardCode,
    pub statement_index: usize,
    pub start: usize,
    pub end: usize,
    pub sql: String,
    pub reason: String,
}

/// Statements plus the hazards the classifier found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    pub statements: Vec<ParsedStatement>,
    pub hazards: Vec<Hazard>,
}

/// Split `sql` and classify each Postgres statement.
pub fn classify_migration(sql: &str) -> Result<ParseResult, ParseError> {
    let statements = split_statements(sql)?;
    let mut hazards = Vec::new();
    for statement in &statements {
        hazards.extend(classify_statement(statement)?);
    }
    Ok(ParseResult {
        statements,
        hazards,
    })
}

fn classify_statement(statement: &ParsedStatement) -> Result<Vec<Hazard>, ParseError> {
    let parsed = Parser::parse_sql(&PostgreSqlDialect {}, &statement.sql).map_err(|err| {
        ParseError {
            message: err.to_string(),
        }
    })?;
    let Some(ast) = parsed.first() else {
        return Err(ParseError {
            message: "expected one statement".to_string(),
        });
    };
    Ok(hazards_for(ast, statement))
}

fn hazards_for(ast: &Statement, statement: &ParsedStatement) -> Vec<Hazard> {
    match ast {
        Statement::Drop {
            object_type: ObjectType::Table,
            ..
        } => vec![hazard(
            statement,
            HazardCode::DataLoss,
            "DROP TABLE deletes the table and its rows.",
        )],
        Statement::Truncate(_) => vec![hazard(
            statement,
            HazardCode::DataLoss,
            "TRUNCATE deletes every row.",
        )],
        Statement::CreateIndex(index) if !index.concurrently => vec![hazard(
            statement,
            HazardCode::LockRisk,
            "CREATE INDEX without CONCURRENTLY locks writes.",
        )],
        Statement::AlterTable(alter) => alter
            .operations
            .iter()
            .filter_map(|operation| alter_operation_hazard(operation, statement))
            .collect(),
        _ => Vec::new(),
    }
}

fn alter_operation_hazard(
    operation: &AlterTableOperation,
    statement: &ParsedStatement,
) -> Option<Hazard> {
    match operation {
        AlterTableOperation::DropColumn { .. } => Some(hazard(
            statement,
            HazardCode::DataLoss,
            "DROP COLUMN deletes stored values.",
        )),
        AlterTableOperation::AddColumn { column_def, .. } => add_column_hazard(column_def)
            .map(|(code, reason)| hazard(statement, code, reason)),
        AlterTableOperation::AlterColumn { op, .. } => match op {
            AlterColumnOperation::SetNotNull => Some(hazard(
                statement,
                HazardCode::LockRisk,
                "SET NOT NULL scans existing rows and locks writes.",
            )),
            AlterColumnOperation::SetDataType { .. } => Some(hazard(
                statement,
                HazardCode::Rewrite,
                "ALTER COLUMN TYPE rewrites the table.",
            )),
            _ => None,
        },
        _ => None,
    }
}

fn add_column_hazard(column_def: &ColumnDef) -> Option<(HazardCode, &'static str)> {
    let mut not_null = false;
    let mut has_default = false;
    let mut primary_key = false;
    for option in &column_def.options {
        match &option.option {
            ColumnOption::NotNull => not_null = true,
            ColumnOption::Default(_) => has_default = true,
            ColumnOption::PrimaryKey(_) => primary_key = true,
            _ => {}
        }
    }
    if primary_key {
        return Some((
            HazardCode::LockRisk,
            "ADD COLUMN PRIMARY KEY builds an index and locks writes.",
        ));
    }
    if not_null && !has_default {
        return Some((
            HazardCode::LockRisk,
            "ADD COLUMN NOT NULL without a default rewrites the table.",
        ));
    }
    None
}

fn hazard(statement: &ParsedStatement, code: HazardCode, reason: &str) -> Hazard {
    Hazard {
        code,
        statement_index: statement.index,
        start: statement.start,
        end: statement.end,
        sql: statement.sql.clone(),
        reason: reason.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn codes(sql: &str) -> Vec<&'static str> {
        classify_migration(sql)
            .unwrap()
            .hazards
            .iter()
            .map(|hazard| hazard.code.as_str())
            .collect()
    }

    #[test]
    fn drop_column_drop_table_and_truncate_are_data_loss() {
        assert_eq!(
            codes("ALTER TABLE users DROP COLUMN email"),
            vec!["data_loss"]
        );
        assert_eq!(codes("DROP TABLE sessions"), vec!["data_loss"]);
        assert_eq!(codes("TRUNCATE orders"), vec!["data_loss"]);
        let parsed = classify_migration("ALTER TABLE users DROP COLUMN email").unwrap();
        assert_eq!(
            parsed.hazards[0].reason,
            "DROP COLUMN deletes stored values."
        );
    }

    #[test]
    fn not_null_and_blocking_index_builds_are_lock_risk() {
        assert_eq!(
            codes("ALTER TABLE users ADD COLUMN bio text NOT NULL"),
            vec!["lock_risk"]
        );
        assert_eq!(
            codes("ALTER TABLE users ALTER COLUMN bio SET NOT NULL"),
            vec!["lock_risk"]
        );
        assert_eq!(
            codes("CREATE INDEX users_email_idx ON users (email)"),
            vec!["lock_risk"]
        );
        assert_eq!(
            codes("ALTER TABLE users ADD COLUMN id bigint PRIMARY KEY"),
            vec!["lock_risk"]
        );
    }

    #[test]
    fn alter_column_type_is_a_rewrite() {
        let parsed =
            classify_migration("ALTER TABLE users ALTER COLUMN age TYPE bigint").unwrap();
        assert_eq!(parsed.hazards.len(), 1);
        assert_eq!(parsed.hazards[0].code, HazardCode::Rewrite);
        assert_eq!(
            parsed.hazards[0].reason,
            "ALTER COLUMN TYPE rewrites the table."
        );
    }

    #[test]
    fn nullable_columns_defaults_and_concurrent_indexes_are_safe() {
        assert!(codes("ALTER TABLE users ADD COLUMN bio text").is_empty());
        assert!(codes("ALTER TABLE users ADD COLUMN bio text NOT NULL DEFAULT ''").is_empty());
        assert!(codes("CREATE INDEX CONCURRENTLY users_email_idx ON users (email)").is_empty());
    }

    #[test]
    fn hazards_keep_statement_index_and_source_span() {
        let sql = "ALTER TABLE users ADD COLUMN bio text;\nDROP TABLE sessions";
        let parsed = classify_migration(sql).unwrap();
        assert_eq!(parsed.statements.len(), 2);
        assert_eq!(parsed.hazards.len(), 1);
        let hazard = &parsed.hazards[0];
        assert_eq!(hazard.statement_index, 1);
        assert_eq!(hazard.sql, "DROP TABLE sessions");
        assert_eq!(&sql[hazard.start..hazard.end], hazard.sql);
    }
}
