-- ==========================================================================
-- Migration 002 — employee registration + admin approval
--
-- Adds a real accounts table for self-registering staff (name, department,
-- email, phone, requested role) that sit as 'pending' until an admin
-- approves them, at which point they can log in with their email as the
-- username and the shared default password '1234'.
--
-- The single admin account (adminkruakanya) stays hardcoded in
-- src/core/access.js, not in this table — it's the one login that must keep
-- working even if this table or Supabase itself is unreachable, and keeping
-- it out of a database table limits the blast radius of table access.
--
-- Security note, read this before assuming this table is safe to open up:
-- `accounts` holds real names, emails and phone numbers — the first PII this
-- project stores. Unlike every other table so far, this one is NOT given an
-- "open access" RLS policy. It has NO direct policies at all, so `anon`
-- cannot SELECT/INSERT/UPDATE it through the REST API even though the whole
-- rest of the database is wide open. The only door in is the four
-- `security definer` functions below, each returning only what its job
-- needs (never the password hash).
--
-- That said: without real Supabase Auth, the database still can't tell an
-- authenticated admin apart from any other visitor holding the public
-- anon key — "only admin can approve/reject" is enforced by the app's UI,
-- same as every other admin-only action in this app, not by the database.
-- Someone who calls approve_account() directly with the anon key could
-- approve their own registration. That is a real gap, not a hypothetical
-- one — closing it for good means migrating login to Supabase Auth so RLS
-- can check auth.uid() instead of trusting the caller. Until then, this is
-- meaningfully better than an open table (no passwords, no bulk roster
-- listing without knowing to call list_accounts by name) but is not a
-- substitute for real per-user authentication.
--
-- Safe to run against a live database: creates one new table and four new
-- functions, touches nothing existing. Also safe to re-run (e.g. after
-- fixing a mistake in this file) — it drops its own table and functions
-- first, so nothing is left half-created from a failed attempt. Only re-run
-- against a project where you don't yet have real registrations you'd lose.
-- ==========================================================================

create extension if not exists pgcrypto;

drop table if exists accounts cascade;
drop function if exists public.register_account(text, text, text, text, text) cascade;
drop function if exists public.check_login(text, text) cascade;
drop function if exists public.list_accounts() cascade;
drop function if exists public.approve_account(bigint, text) cascade;
drop function if exists public.reject_account(bigint) cascade;

create table accounts (
  id            bigint generated always as identity primary key,
  full_name     text not null,
  department    text not null,
  email         text not null,
  phone         text,
  role          text not null check (role in ('purchasing', 'store', 'kitchen', 'qa', 'exec')),
  branch_id     text references branches(id),   -- null = ทุกสาขา, set on approval
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  password_hash text not null default extensions.crypt('1234', extensions.gen_salt('bf')),
  created_at    timestamptz not null default now(),
  approved_at   timestamptz
);

create unique index accounts_email_unique_idx on accounts (lower(email));

alter table accounts enable row level security;
-- Deliberately no policies — see the note above. All access goes through
-- the functions below, which run as the table owner and bypass RLS.

-- ---------------------------------------------------------------------------
-- register_account — the public sign-up form calls this.
-- ---------------------------------------------------------------------------
create or replace function public.register_account(
  p_full_name  text,
  p_department text,
  p_email      text,
  p_phone      text,
  p_role       text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from accounts where lower(email) = lower(p_email)) then
    raise exception 'อีเมลนี้เคยลงทะเบียนไว้แล้ว';
  end if;
  insert into accounts (full_name, department, email, phone, role)
  values (p_full_name, p_department, p_email, p_phone, p_role);
end;
$$;
grant execute on function public.register_account(text, text, text, text, text) to anon;

-- ---------------------------------------------------------------------------
-- check_login — the login form calls this for any username that isn't the
-- hardcoded admin. Only ever returns a row for an approved account whose
-- password matches; never returns the hash itself.
-- ---------------------------------------------------------------------------
create or replace function public.check_login(p_email text, p_password text)
returns table (account_id bigint, full_name text, role text, branch_id text)
language sql
security definer
set search_path = public
as $$
  select id, full_name, role, branch_id
  from accounts
  where lower(email) = lower(p_email)
    and status = 'approved'
    and password_hash = extensions.crypt(p_password, password_hash)
  limit 1;
$$;
grant execute on function public.check_login(text, text) to anon;

-- ---------------------------------------------------------------------------
-- list_accounts — powers the admin's approval queue and staff roster.
-- Never returns password_hash.
-- ---------------------------------------------------------------------------
create or replace function public.list_accounts()
returns table (
  id bigint, full_name text, department text, email text, phone text,
  role text, branch_id text, status text, created_at timestamptz, approved_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, full_name, department, email, phone, role, branch_id, status, created_at, approved_at
  from accounts
  order by created_at desc;
$$;
grant execute on function public.list_accounts() to anon;

-- ---------------------------------------------------------------------------
-- approve_account / reject_account — the admin's queue action buttons.
-- ---------------------------------------------------------------------------
create or replace function public.approve_account(p_id bigint, p_branch_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update accounts
  set status = 'approved', branch_id = p_branch_id, approved_at = now()
  where id = p_id;
end;
$$;
grant execute on function public.approve_account(bigint, text) to anon;

create or replace function public.reject_account(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update accounts set status = 'rejected' where id = p_id;
end;
$$;
grant execute on function public.reject_account(bigint) to anon;
