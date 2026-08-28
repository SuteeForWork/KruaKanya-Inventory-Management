-- ==========================================================================
-- Ingredient Inventory — Supabase / Postgres schema
--
-- Mirrors the data model already used by src/data/seed.js. Run this once in
-- the Supabase SQL Editor (Project → SQL Editor → New query) right after
-- creating the project, before generating an anon key for the app to use.
--
-- This defines structure only — it does not insert the demo seed rows.
-- Migrating the seed data and wiring src/core/store.js to read/write through
-- this schema is a separate follow-up step (see DEPLOY.md).
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------
create table branches (
  id      text primary key,          -- 'BR-01'
  name    text not null,
  type    text not null,             -- 'โรงผลิต' | 'สาขาหน้าร้าน' | 'คลังกระจายสินค้า'
  manager text,
  phone   text
);

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
create table suppliers (
  id       text primary key,         -- 'SUP-001'
  name     text not null,
  category text,
  contact  text,
  phone    text,
  terms    text,                     -- payment terms, e.g. 'เครดิต 30 วัน'
  cert     text,                     -- certifications, e.g. 'GMP/HACCP'
  score    integer not null default 80
);

-- ---------------------------------------------------------------------------
-- Items (raw-material master)
-- ---------------------------------------------------------------------------
create table items (
  code            text primary key,  -- 'ING-VEG-004'
  name            text not null,
  category        text,
  unit            text not null,     -- 'ลัง', 'แพ็ค', ...
  weight_per_unit numeric not null,  -- kg per unit, current/default
  shelf_life      integer not null,  -- days, current/default
  min_stock       numeric not null,  -- reorder point, kg
  storage         text,
  main_supplier_id text references suppliers(id)
);

-- ---------------------------------------------------------------------------
-- Recipes (BOM) — one row per menu item, one unit of output
-- ---------------------------------------------------------------------------
create table recipes (
  id           text primary key,     -- 'BOM-001'
  product      text not null unique, -- menu name; production output rows join on this
  unit         text not null,        -- output unit, e.g. 'กล่อง'
  net          numeric not null,     -- expected net output weight per unit (kg)
  cap_per_day  integer not null default 0
);

create table recipe_lines (
  recipe_id text not null references recipes(id) on delete cascade,
  item_code text not null references items(code),
  qty       numeric not null,        -- kg of this ingredient per unit of output
  primary key (recipe_id, item_code)
);

-- ---------------------------------------------------------------------------
-- Lots — one row per receipt; qty_left is drawn down by issues (FEFO)
-- ---------------------------------------------------------------------------
create table lots (
  id              text primary key,  -- 'LOT-260819-01'
  branch_id       text not null references branches(id),
  item_code       text not null references items(code),
  supplier_id     text references suppliers(id),
  buyer           text,
  recv_date       date not null,
  recv_time       time not null,
  mfg_date        date not null,
  -- snapshotted at receipt time — an item's master shelf_life/weight_per_unit
  -- can change later without rewriting history
  shelf_life      integer not null,
  weight_per_unit numeric not null,
  qty_in          numeric not null,
  qty_left        numeric not null check (qty_left >= 0),
  price_per_unit  numeric not null,
  ref             text               -- PO / delivery note number
);

create index lots_branch_item_idx on lots (branch_id, item_code) where qty_left > 0;

-- ---------------------------------------------------------------------------
-- Moves — the full ledger: receipts, issues, and waste write-offs
-- ---------------------------------------------------------------------------
create table moves (
  move_id      bigint generated always as identity primary key,
  doc_no       text not null,        -- 'RC-260819-01', 'IS-2608-101' (display id, not unique — a
                                      -- multi-lot issue splits into several rows sharing a doc_no)
  branch_id    text not null references branches(id),
  lot_id       text not null references lots(id),
  item_code    text not null references items(code),
  type         text not null check (type in ('รับเข้า', 'เบิกออก', 'ตัดทิ้ง')),
  move_date    date not null,
  move_time    time not null,
  qty          numeric not null,
  weight       numeric not null,
  cost         numeric not null,
  staff_name   text,
  purpose      text,                 -- 'เบิกผลิต' | 'เบิกโอนสาขา' | 'เบิกทดลองสูตร' | 'ตัดทิ้ง/ของเสีย' | 'รับเข้าคลัง' | ...
  note         text,
  age_left_days integer              -- shelf life remaining at the moment of issue; null for receipts
);

create index moves_branch_date_idx on moves (branch_id, move_date desc);

-- ---------------------------------------------------------------------------
-- Production outputs — daily yield is computed by joining this against moves
-- ---------------------------------------------------------------------------
create table outputs (
  id           text primary key,     -- 'PD-260821-ขน'
  branch_id    text not null references branches(id),
  output_date  date not null,
  shift        text,
  product      text not null,        -- matches recipes.product when a recipe exists
  qty          numeric not null,
  unit         text not null,
  weight       numeric not null,
  reject       numeric not null default 0,
  staff_name   text
);

create index outputs_branch_date_idx on outputs (branch_id, output_date desc);

-- ---------------------------------------------------------------------------
-- Roles & the section permission matrix
-- (replaces the hardcoded table in src/core/access.js#defaultPerms)
-- ---------------------------------------------------------------------------
create table role_permissions (
  role    text not null,   -- 'admin' | 'purchasing' | 'store' | 'kitchen' | 'qa' | 'exec'
  section text not null,   -- one of SECTIONS in src/core/access.js: dash/receive/stock/issue/output/recipe/master/moves/branch
  level   text not null check (level in ('none', 'view', 'edit')),
  primary key (role, section)
);

-- ---------------------------------------------------------------------------
-- Profiles — one row per Supabase Auth user, carrying role + home branch.
-- Replaces the plaintext ACCOUNTS array in src/core/access.js.
-- branch_id = null means "ทุกสาขา" (all branches), matching today's 'ALL'.
-- ---------------------------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role         text not null,
  branch_id    text references branches(id)
);

-- ==========================================================================
-- Row Level Security — starter policies
--
-- These are intentionally coarse (signed-in users can read everything, only
-- admins can write the master/permission tables). Section-by-section write
-- rules that mirror role_permissions exactly are the next step once the app
-- is actually calling Supabase — wiring that up needs the client code changes
-- in src/core/store.js, not just SQL, so it is left for that follow-up pass.
-- ==========================================================================

alter table branches         enable row level security;
alter table suppliers        enable row level security;
alter table items            enable row level security;
alter table recipes          enable row level security;
alter table recipe_lines     enable row level security;
alter table lots             enable row level security;
alter table moves            enable row level security;
alter table outputs          enable row level security;
alter table role_permissions enable row level security;
alter table profiles         enable row level security;

-- Any signed-in user can read every table — the app itself decides what to
-- show per role; this just stops anonymous/unauthenticated access.
create policy "signed-in users can read" on branches         for select using (auth.role() = 'authenticated');
create policy "signed-in users can read" on suppliers        for select using (auth.role() = 'authenticated');
create policy "signed-in users can read" on items            for select using (auth.role() = 'authenticated');
create policy "signed-in users can read" on recipes          for select using (auth.role() = 'authenticated');
create policy "signed-in users can read" on recipe_lines     for select using (auth.role() = 'authenticated');
create policy "signed-in users can read" on lots             for select using (auth.role() = 'authenticated');
create policy "signed-in users can read" on moves            for select using (auth.role() = 'authenticated');
create policy "signed-in users can read" on outputs          for select using (auth.role() = 'authenticated');
create policy "signed-in users can read" on role_permissions for select using (auth.role() = 'authenticated');

-- A user may always read their own profile row.
create policy "users can read own profile" on profiles for select using (auth.uid() = id);

-- Only admins may write role_permissions or profiles (role/branch changes).
create policy "admins manage role_permissions" on role_permissions for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "admins manage profiles" on profiles for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Writes to the operational tables (lots/moves/outputs/recipes/suppliers/...)
-- are intentionally left open to any authenticated user for now — add
-- per-section policies here once store.js is wired to call Supabase, so the
-- database enforces the same "edit" rights the UI already checks with
-- store.canEdit(section).
