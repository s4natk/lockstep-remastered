use wasm_bindgen::prelude::*;

use crate::classify_migration;

/// JSON for one migration: `statements` plus the hazards the parser proved.
#[wasm_bindgen]
pub fn parse_migration(sql: &str) -> Result<String, JsValue> {
    match classify_migration(sql) {
        Ok(result) => {
            serde_json::to_string(&result).map_err(|err| JsValue::from_str(&err.to_string()))
        }
        Err(err) => Err(JsValue::from_str(&err.to_string())),
    }
}
