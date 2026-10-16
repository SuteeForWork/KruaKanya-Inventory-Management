-- ==========================================================================
-- Migration 010 — what a production record keeps beyond total weight/waste
--
-- The production form now also records the pork actually used, the fat
-- trimmed off it, and the BOM's other ingredients scaled to the real pork
-- weight (src/core/production.js#outputIngredients). Everything is kg, like
-- outputs.weight / outputs.reject beside it.
--
--   pork_kg           — total pork used for the run
--   trim_fat_kg       — pork fat trimmed off, total
--   other_ingredients — jsonb snapshot of the other BOM ingredients for the
--                       run: [{ code, name, unit, standard, used }], where
--                       `standard` is the recipe amount and `used` is that
--                       amount scaled by actual pork / standard pork. Stored
--                       as a snapshot, not recomputed, so editing the recipe
--                       later never rewrites a past run.
--
-- The work-time range needs no column: it is stored in the existing `shift`
-- text column as 'HH:MM–HH:MM'.
--
-- Safe to run against a live database: adds three nullable columns, touches
-- nothing existing. Safe to re-run too.
-- ==========================================================================

alter table outputs add column if not exists pork_kg           numeric;
alter table outputs add column if not exists trim_fat_kg       numeric;
alter table outputs add column if not exists other_ingredients jsonb;
