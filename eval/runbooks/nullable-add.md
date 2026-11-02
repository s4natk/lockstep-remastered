A nullable column add is metadata-only. Postgres updates the catalog and does not rewrite existing rows when the new column allows null.
