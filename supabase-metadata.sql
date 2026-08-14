-- Disney World Tracker: synced metadata migration
-- Run this AFTER supabase-setup.sql. It is intentionally additive and does
-- not change the existing trip RPCs, so existing devices continue to work.

create table if not exists public.trip_metadata (
  code text primary key,
  family jsonb not null default '[]'::jsonb,
  packing jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.trip_metadata enable row level security;

-- Anonymous clients must not read/write the table directly. The current app
-- uses the publishable/anon key, so this table is intentionally fail-closed
-- until the authenticated metadata RPCs are added in the auth migration.
revoke all on table public.trip_metadata from anon, authenticated;

-- Temporary RPCs preserve the existing share-code workflow while keeping the
-- table itself inaccessible. They should be replaced by auth-bound RPCs once
-- Supabase Auth is enabled for the app.
create or replace function public.get_trip_metadata(p_code text)
returns table(family jsonb, packing jsonb, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select tm.family, tm.packing, tm.updated_at
  from public.trip_metadata tm
  where tm.code = p_code
  limit 1;
$$;

create or replace function public.upsert_trip_metadata(
  p_code text,
  p_family jsonb,
  p_packing jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null or length(trim(p_code)) < 6 or length(trim(p_code)) > 32 then
    raise exception 'Invalid trip code';
  end if;
  insert into public.trip_metadata(code, family, packing, updated_at)
  values (trim(p_code), coalesce(p_family, '[]'::jsonb), coalesce(p_packing, '[]'::jsonb), now())
  on conflict (code) do update
    set family = excluded.family,
        packing = excluded.packing,
        updated_at = now();
end;
$$;

grant execute on function public.get_trip_metadata(text) to anon, authenticated;
grant execute on function public.upsert_trip_metadata(text, jsonb, jsonb) to anon, authenticated;
