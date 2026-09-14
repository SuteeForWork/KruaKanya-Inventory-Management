-- ==========================================================================
-- Migration 009 — items counted by piece instead of weight, with an
-- optional pack/case conversion for convenient receiving
--
-- Some items (e.g. "การ์ดคู่มือ" instruction cards) aren't meaningfully
-- weighed — they're counted as pieces/sheets, packaged N-per-pack and
-- M-packs-per-case. Forcing weight_per_unit on these items made the
-- reorder-point alert and dashboard/stock weight totals meaningless for
-- them (see src/core/inventory.js#lowStock, #pricePerKg).
--
-- track_by lets an item opt out of weight tracking entirely — 'count'
-- means reorder alerts and stock figures compare qty (pieces) instead of
-- weight (kg), and weight_per_unit is no longer required for it.
--
-- pack_unit/pack_size and case_unit/case_size are optional and independent
-- of track_by — any item can define them so receiving can be entered as
-- "2 กล่อง" instead of doing the multiplication by hand. Everything below
-- them (lots, moves, FEFO, costing) still only ever stores and works in
-- the item's base unit — see src/core/inventory.js#unitLevels/baseQtyFor.
--
-- Safe to run against a live database: adds five columns with safe
-- defaults, touches nothing existing. Safe to re-run too.
-- ==========================================================================

alter table items add column if not exists track_by  text not null default 'weight' check (track_by in ('weight', 'count'));
alter table items add column if not exists pack_unit  text;
alter table items add column if not exists pack_size  numeric;
alter table items add column if not exists case_unit  text;
alter table items add column if not exists case_size  numeric;
