-- ==========================================================================
-- Migration 012 — office and kitchen supplies alongside raw materials
--
-- items.kind says what an item is for:
--   'material' — ingredients and packaging (every existing item; the default)
--   'office'   — office consumables: A4 paper, pens, toner…
--   'kitchen'  — kitchen consumables: tissue, kitchen gloves, hair nets…
--
-- Supplies are stocked, received and issued like any item, but the app
-- treats them differently: no expiry unless given a shelf life (shelf_life 0
-- means none), counted rather than weighed, left out of BOM recipes, and left
-- out of production raw-material cost and yield (src/core/inventory.js#issuedOn).
--
-- Safe to run against a live database: adds one column with a default, so
-- every existing item becomes 'material' and behaves exactly as before.
-- Safe to re-run too.
-- ==========================================================================

alter table items add column if not exists kind text not null default 'material';
