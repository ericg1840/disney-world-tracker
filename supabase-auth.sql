-- Disney World Tracker: authenticated cloud sync
-- Run after supabase-setup.sql. This is the secure replacement path for
-- share-code sync; the legacy RPCs can remain during migration.

create table if not exists public.user_trips (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trip_days jsonb not null default '[]'::jsonb,
  trip_info jsonb not null default '{}'::jsonb,
  family jsonb not null default '[]'::jsonb,
  packing jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_trips enable row level security;

drop policy if exists "Users can read their own trip" on public.user_trips;
create policy "Users can read their own trip"
  on public.user_trips for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own trip" on public.user_trips;
create policy "Users can insert their own trip"
  on public.user_trips for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own trip" on public.user_trips;
create policy "Users can update their own trip"
  on public.user_trips for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.user_trips from anon;
grant select, insert, update on table public.user_trips to authenticated;

create or replace function public.upsert_my_trip(
  p_days jsonb,
  p_info jsonb,
  p_family jsonb,
  p_packing jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.user_trips(user_id, trip_days, trip_info, family, packing, updated_at)
  values (
    auth.uid(),
    coalesce(p_days, '[]'::jsonb),
    coalesce(p_info, '{}'::jsonb),
    coalesce(p_family, '[]'::jsonb),
    coalesce(p_packing, '[]'::jsonb),
    now()
  )
  on conflict (user_id) do update set
    trip_days = excluded.trip_days,
    trip_info = excluded.trip_info,
    family = excluded.family,
    packing = excluded.packing,
    updated_at = now();
end;
$$;

create or replace function public.get_my_trip()
returns table(trip_days jsonb, trip_info jsonb, family jsonb, packing jsonb, updated_at timestamptz)
language sql
security invoker
set search_path = public
as $$
  select t.trip_days, t.trip_info, t.family, t.packing, t.updated_at
  from public.user_trips t
  where t.user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.upsert_my_trip(jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.get_my_trip() to authenticated;
