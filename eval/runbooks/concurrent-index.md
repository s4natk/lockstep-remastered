Use CREATE INDEX CONCURRENTLY so Postgres builds the index without locking writes. The index build takes longer, and it cannot run inside a transaction block.
