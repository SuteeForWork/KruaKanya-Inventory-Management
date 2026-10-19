-- ==========================================================================
-- Migration 011 — weight after prep on a recipe line
--
-- A BOM line's `qty` is what is issued from stock: the raw, before-prep
-- weight (it drives stock capacity, standard cost and yield). Some
-- ingredients lose weight in prep — e.g. 1000 g of pork is 850 g once the
-- fat is trimmed — so a line can now also record what's left after prep:
--
--   prep_qty — kg usable after prep, per unit of output. Null means no prep
--              loss recorded (treated as equal to qty). Never above qty.
--
-- The waste from prep (qty - prep_qty, and its %) is derived, not stored —
-- see src/core/production.js#recipePlan.
--
-- Safe to run against a live database: adds one nullable column, touches
-- nothing existing. Safe to re-run too.
-- ==========================================================================

alter table recipe_lines add column if not exists prep_qty numeric;
