-- The least privilege role used only to execute generated SQL for the SQL
-- retrieval route (FR-3.20b). Created here so the read only guarantee belongs to
-- the database from the first migration, rather than depending on a statement
-- inspection layer catching everything.
--
-- Local development provisions the role with a password so the connection string
-- in .env works out of the box. In a real deployment the role is provisioned out
-- of band and only the GRANT statements below apply.

DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'notebook_ro') THEN
		CREATE ROLE notebook_ro LOGIN PASSWORD 'notebook_ro';
	END IF;
END
$$;--> statement-breakpoint

-- Read only is the role's default, so a write is refused by the transaction
-- before the statement is even considered.
ALTER ROLE notebook_ro SET default_transaction_read_only = on;--> statement-breakpoint

-- A floor, independent of SQL_TIMEOUT_MS on the connection pool. Whichever is
-- lower wins, and the database enforces this one.
ALTER ROLE notebook_ro SET statement_timeout = '5s';--> statement-breakpoint

DO $$
BEGIN
	EXECUTE format('GRANT CONNECT ON DATABASE %I TO notebook_ro', current_database());
END
$$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO notebook_ro;--> statement-breakpoint

-- Aggregates over chunks, so a question like "which source is longest" can be
-- answered without exposing chunk text to the query generator.
CREATE OR REPLACE VIEW source_chunk_stats AS
SELECT
	source_id,
	notebook_id,
	count(*)::int AS chunk_count,
	sum(token_count)::int AS token_count
FROM chunks
GROUP BY source_id, notebook_id;--> statement-breakpoint

-- The allowlist. Everything else is deliberately absent: chunk text, the stored
-- file bytes, messages, citations, chats and retrieval runs.
GRANT SELECT ON notebooks TO notebook_ro;--> statement-breakpoint
GRANT SELECT ON sources TO notebook_ro;--> statement-breakpoint
GRANT SELECT ON source_chunk_stats TO notebook_ro;
