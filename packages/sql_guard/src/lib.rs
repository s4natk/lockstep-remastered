//! Classifies dangerous data-definition statements in a SQL migration.
//!
//! Hazard labels come from this crate. The language model only explains them.

mod classify;
mod split;

#[cfg(target_arch = "wasm32")]
mod wasm;

#[cfg(test)]
mod fixtures;

pub use classify::{classify_migration, Hazard, HazardCode, ParseResult};
pub use split::{split_statements, ParseError, ParsedStatement};
