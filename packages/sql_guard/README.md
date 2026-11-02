# sql_guard

PostgreSQL DDL parsing and deterministic hazard classification using `sqlparser`.
The Worker runs the checked-in WebAssembly binding; submitted SQL is never executed.

The classifier reports recognized `data_loss`, `lock_risk`, and `rewrite` patterns.
A migration with no recognized hazards is not guaranteed safe. Table size, PostgreSQL
version, extensions, lock contention, and live schema state are outside its input.

Statements and hazards retain byte spans in the original SQL. JavaScript consumers
must translate UTF-8 byte spans before calculating source lines or editor positions.

## Build and test

```sh
cargo test --locked
rustup target add wasm32-unknown-unknown
wasm-pack build --target web --release
```

The WASM export `parse_migration` returns JSON with camelCase properties and
snake_case hazard codes. Keep `pkg/` bindings and the binary together when rebuilding.
The release profile optimizes for size with link-time optimization. PostgreSQL dialect
selection is explicit; this crate does not ship a PostgreSQL-only feature flag.
