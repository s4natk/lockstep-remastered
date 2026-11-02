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
cargo test --locked --manifest-path packages/sql_guard/Cargo.toml
rustup target add wasm32-unknown-unknown
pnpm build:sql
```

Run these commands from the repository root with wasm-pack installed. The build
script strips symbols, remaps the local home/project roots to generic build paths,
and verifies the generated binary before copying matching web bindings into `pkg/`.
It uses Rust release optimization without the additional wasm-opt pass, avoiding
bulk-memory compatibility issues with older bundled Binaryen versions. Intermediate
files stay in the ignored `target/` directory.

The WASM export `parse_migration` returns JSON with camelCase properties and
snake_case hazard codes. Keep `pkg/` bindings and the binary together when rebuilding.
The release profile optimizes for size with link-time optimization. PostgreSQL dialect
selection is explicit; this crate does not ship a PostgreSQL-only feature flag.
