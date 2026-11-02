ADD COLUMN NOT NULL without a default rewrites the table on Postgres. Existing rows have no value for the new column, so the rewrite takes an exclusive lock.
