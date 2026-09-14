-- ==========================================================================
-- Migration 007 — editable business date/time on issues, plus an audit trail
--
-- Until now "เบิกวัตถุดิบออก" always stamped move_date/move_time from the
-- browser's clock at submit time, with no way to fix it afterwards — and
-- since config.businessDate pins today() to a fixed date, that stamp could
-- be flat wrong. store.js#submitIssue now lets the person pick the date and
-- time instead of trusting a default, and store.js#saveMoveDateTime lets an
-- existing entry be corrected later.
--
-- Two new columns on `moves` support that:
--   created_at — the real wall-clock moment the row was first inserted.
--     Postgres stamps this itself (default now()); nothing in the app ever
--     writes to it. Existing rows have no way to recover their true original
--     timestamp, so running this migration stamps them with "now" (the
--     moment this migration runs) — a known gap for pre-existing history,
--     harmless going forward. Shown only to admin (src/ui/views/issue.js),
--     as the one immutable record of when a line was really entered — the
--     check against move_date/move_time being backdated or postdated.
--   edited_at — set only when someone corrects move_date/move_time (see
--     db.js#updateMoveDateTime); null means "never edited". Shown to
--     everyone who can see the issue history.
--
-- Safe to run against a live database: adds two columns, touches nothing
-- existing. Safe to re-run too.
-- ==========================================================================

alter table moves add column if not exists created_at timestamptz not null default now();
alter table moves add column if not exists edited_at  timestamptz;
