-- Disney World Trip Tracker — cloud sync schema
--
-- Run this once in your Supabase project's SQL Editor (Project -> SQL Editor
-- -> New query -> paste this in -> Run).
--
-- Design: there's no login. Instead, each trip is keyed by a random "sync
-- code" you enter on every device you want to see it on — like an unlisted
-- share link. To keep that safe, the anon key (which is public, embedded in
-- the page's own JS) is NOT allowed to read or write the table directly.
-- The only access path is through the two functions below, and both require
-- you to already know the specific code for the row you're touching. There
-- is no way to list or guess other people's trips through this API.

create table if not exists trips (
  sync_code text primary key,
  trip_days jsonb not null default '[]'::jsonb,
  trip_info jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table trips enable row level security;
-- No policies are created, which means: zero direct access via the anon key.
-- (RLS with no policies = default deny for every row.)

create or replace function get_trip(p_code text)
returns table (trip_days jsonb, trip_info jsonb)
language sql
security definer
set search_path = public
as $$
  select trip_days, trip_info from trips where sync_code = p_code;
$$;

create or replace function upsert_trip(p_code text, p_days jsonb, p_info jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into trips (sync_code, trip_days, trip_info, updated_at)
  values (p_code, p_days, p_info, now())
  on conflict (sync_code)
  do update set trip_days = excluded.trip_days,
                trip_info = excluded.trip_info,
                updated_at = now();
$$;

-- Let the public (anon) API call these two functions specifically — this is
-- what actually grants access, scoped to whatever code the caller passes in.
grant execute on function get_trip(text) to anon;
grant execute on function upsert_trip(text, jsonb, jsonb) to anon;
