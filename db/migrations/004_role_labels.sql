-- ==========================================================================
-- Migration 004 — editable role names + example-user labels
--
-- The permission matrix's "บทบาท / ผู้ใช้ตัวอย่าง" column (role label, e.g.
-- "พนักงานจัดซื้อ", and the placeholder persona shown under it, e.g.
-- "กมลชนก ท.") was hardcoded in src/core/access.js. This table lets an admin
-- override either per role from the UI.
--
-- Role *keys* (admin/purchasing/store/kitchen/qa/exec) stay fixed — they're
-- wired into permissions, registration, and everywhere else in the app.
-- Only the two display strings are editable.
--
-- Open RLS like most tables (branches, suppliers, ...) — these are cosmetic
-- labels, not data with any sensitivity, so no need for the locked-down
-- treatment `accounts` gets. No rows need seeding: the app already has
-- built-in defaults in access.js and only stores a row here once something
-- has actually been overridden.
--
-- Safe to run against a live database: adds one small table, touches
-- nothing existing. Safe to re-run.
-- ==========================================================================

drop table if exists role_labels cascade;

create table role_labels (
  role_key text primary key,
  label    text not null,
  person   text not null
);

alter table role_labels enable row level security;
create policy "open access" on role_labels for all using (true) with check (true);
