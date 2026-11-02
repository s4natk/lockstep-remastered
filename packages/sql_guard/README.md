# sql_guard

Postgres DDL hazard classifier. Hazard labels come from this crate.

## Wasm

The `wasm32-unknown-unknown` build exports `parse_migration`. It returns JSON with `statements` and `hazards`, using camelCase fields and snake_case codes (`data_loss`, `lock_risk`, `rewrite`).

```text
rustup target add wasm32-unknown-unknown
wasm-pack build --target web --release
```

The release profile uses `opt-level = "s"` and link-time optimization so the Worker bundle stays small. `sqlparser` is built with `default-features = false` and the `std` feature only. Dialect selection is `PostgreSqlDialect` in code. The crate does not ship a Postgres-only feature flag.
