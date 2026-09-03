-- ==========================================================================
-- Migration 003 — admin can edit their own display name and other users'
--
-- Two independent pieces:
--
-- 1. admin_profile — a one-row table holding just the admin's display name.
--    The admin account itself stays hardcoded in src/core/access.js (not in
--    a table, by design — see migration 002's notes on why), but a display
--    name is not a credential, so it's fine to let it live in Supabase and
--    be editable like everything else. Given "open access" like most other
--    tables: worst case someone renames the label the admin sees for
--    themselves, not a real security exposure.
--
-- 2. update_account_name — a narrow RPC so the admin can fix a typo in a
--    registered employee's name. Deliberately scoped to just the name, not
--    a general-purpose account editor — matches exactly what was asked for.
--    Same access model as the other accounts functions in migration 002:
--    anon can call it, `accounts` itself stays locked down.
--
-- Safe to run against a live database: adds one table and one function,
-- touches nothing existing. Safe to re-run too.
-- ==========================================================================

drop table if exists admin_profile cascade;
drop function if exists public.update_account_name(bigint, text) cascade;

create table admin_profile (
  id        bigint primary key,
  full_name text not null default 'ผู้ดูแลระบบ',
  check (id = 1)
);
insert into admin_profile (id, full_name) values (1, 'ผู้ดูแลระบบ');

alter table admin_profile enable row level security;
create policy "open access" on admin_profile for all using (true) with check (true);

create or replace function public.update_account_name(p_id bigint, p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update accounts set full_name = p_full_name where id = p_id;
end;
$$;
grant execute on function public.update_account_name(bigint, text) to anon;
