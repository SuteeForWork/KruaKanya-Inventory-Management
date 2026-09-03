-- ==========================================================================
-- Migration 001 — allow renaming an item's code
--
-- items.code is referenced by lots.item_code, moves.item_code and
-- recipe_lines.item_code. Without ON UPDATE CASCADE, renaming a code that
-- any of those already point to fails with a foreign key violation the
-- moment the item has a real receiving/issue/recipe history — which is
-- exactly when you'd want to rename it.
--
-- Safe to run against a live database: this only replaces three constraint
-- definitions. No table is touched, no row is dropped or changed.
--
-- Only needed once, on a project that already ran db/schema.sql before this
-- migration existed. A fresh db/schema.sql already includes ON UPDATE
-- CASCADE, so a brand-new project doesn't need this file at all.
-- ==========================================================================

alter table lots drop constraint lots_item_code_fkey;
alter table lots add constraint lots_item_code_fkey
  foreign key (item_code) references items(code) on update cascade;

alter table moves drop constraint moves_item_code_fkey;
alter table moves add constraint moves_item_code_fkey
  foreign key (item_code) references items(code) on update cascade;

alter table recipe_lines drop constraint recipe_lines_item_code_fkey;
alter table recipe_lines add constraint recipe_lines_item_code_fkey
  foreign key (item_code) references items(code) on update cascade;
