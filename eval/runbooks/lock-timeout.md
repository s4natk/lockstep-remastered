Set lock_timeout before DDL so a blocked migration fails instead of waiting forever. Pair it with statement_timeout for long rewrites.
