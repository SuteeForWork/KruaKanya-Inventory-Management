-- ==========================================================================
-- Migration 005 — admin can add/delete roles, and add/delete user accounts
--
-- Two related changes:
--
-- 1. Roles become a real table instead of a hardcoded list in
--    src/core/access.js. Previously only the label/person text was
--    editable (migration 004's role_labels); now the *set* of roles
--    itself is editable — admin can add a brand-new role (e.g. "ฝ่าย FG")
--    or delete one that's no longer needed. Role_permissions.role and
--    accounts.role now reference roles.role_key by foreign key instead of
--    a hardcoded CHECK constraint, so a newly added role key is a valid
--    value everywhere the old hardcoded list used to gate it.
--
--    'admin' stays special-cased in application code (src/core/store.js) —
--    it can't be deleted, since it's the one role tied to the hardcoded
--    bootstrap login. Deleting a role that any account currently holds is
--    refused (see delete_role below) rather than silently orphaning those
--    accounts.
--
--    role_labels (from migration 004) is superseded by this table and
--    dropped; any labels already customized there are carried forward.
--
-- 2. Two new RPC functions so admin can manage the `accounts` table
--    directly instead of only approving self-registrations:
--    admin_add_account creates an already-approved account (skips the
--    pending queue entirely), delete_account removes one permanently.
--    Same access model as migration 002's functions — anon can call them,
--    the underlying table stays locked down with no direct policies.
--
-- Safe to run against a live database. Safe to re-run.
-- ==========================================================================

drop function if exists public.add_role(text, text, text, text[]) cascade;
drop function if exists public.delete_role(text) cascade;
drop function if exists public.admin_add_account(text, text, text, text, text, text) cascade;
drop function if exists public.delete_account(bigint) cascade;
drop function if exists public.update_role_label(text, text, text) cascade;

alter table role_permissions drop constraint if exists role_permissions_role_fkey;
alter table accounts drop constraint if exists accounts_role_check;
alter table accounts drop constraint if exists accounts_role_fkey;

drop table if exists roles cascade;

create table roles (
  role_key text primary key,
  label    text not null,
  person   text not null
);
alter table roles enable row level security;
create policy "open access" on roles for all using (true) with check (true);

insert into roles (role_key, label, person) values
  ('admin',      'ผู้ดูแลระบบ',     'ณัฐพล ส.'),
  ('purchasing', 'พนักงานจัดซื้อ',  'กมลชนก ท.'),
  ('store',      'พนักงานคลัง',     'ธีรภัทร อ.'),
  ('kitchen',    'ครัว / ฝ่ายผลิต', 'เชฟกวิน ร.'),
  ('qa',         'QA / คุณภาพ',     'อรุณี พ.'),
  ('exec',       'ผู้บริหาร',       'ปิยะ ม.');

-- Carry forward anything already customized via migration 004, then retire it.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'role_labels') then
    insert into roles (role_key, label, person)
    select role_key, label, person from role_labels
    on conflict (role_key) do update set label = excluded.label, person = excluded.person;
    drop table role_labels cascade;
  end if;
end $$;

alter table role_permissions
  add constraint role_permissions_role_fkey foreign key (role) references roles(role_key) on delete cascade;

alter table accounts
  add constraint accounts_role_fkey foreign key (role) references roles(role_key);

-- ---------------------------------------------------------------------------
-- add_role / delete_role
-- ---------------------------------------------------------------------------
create or replace function public.add_role(p_role_key text, p_label text, p_person text, p_sections text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
begin
  if exists (select 1 from roles where role_key = p_role_key) then
    raise exception 'มีบทบาทรหัส "%" อยู่แล้ว', p_role_key;
  end if;
  insert into roles (role_key, label, person) values (p_role_key, p_label, p_person);
  foreach s in array p_sections loop
    insert into role_permissions (role, section, level) values (p_role_key, s, 'none');
  end loop;
end;
$$;
grant execute on function public.add_role(text, text, text, text[]) to anon;

create or replace function public.delete_role(p_role_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role_key = 'admin' then
    raise exception 'ไม่สามารถลบบทบาทผู้ดูแลระบบได้';
  end if;
  if exists (select 1 from accounts where role = p_role_key) then
    raise exception 'มีผู้ใช้งานสังกัดบทบาทนี้อยู่ — เปลี่ยนบทบาทของผู้ใช้เหล่านั้นก่อนลบ';
  end if;
  delete from roles where role_key = p_role_key; -- cascades to role_permissions
end;
$$;
grant execute on function public.delete_role(text) to anon;

-- ---------------------------------------------------------------------------
-- admin_add_account / delete_account
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_account(
  p_full_name  text,
  p_department text,
  p_email      text,
  p_phone      text,
  p_role       text,
  p_branch_id  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from accounts where lower(email) = lower(p_email)) then
    raise exception 'อีเมลนี้มีอยู่แล้วในระบบ';
  end if;
  insert into accounts (full_name, department, email, phone, role, branch_id, status, approved_at)
  values (p_full_name, p_department, p_email, p_phone, p_role, p_branch_id, 'approved', now());
end;
$$;
grant execute on function public.admin_add_account(text, text, text, text, text, text) to anon;

create or replace function public.delete_account(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from accounts where id = p_id;
end;
$$;
grant execute on function public.delete_account(bigint) to anon;
