create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'admin')::boolean, false);
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text not null default 'User',
  language text not null default 'en',
  goal text not null default 'general_fitness',
  plan text not null default 'trial',
  status text not null default 'active',
  photo_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  name text not null,
  name_ar text,
  type text default 'home',
  target text,
  equipment text,
  level text default 'beginner',
  minutes integer not null default 1,
  calories integer not null default 0,
  image_asset_path text,
  exercise_steps integer not null default 0,
  rating numeric(3,1) not null default 4.0,
  instructions jsonb not null default '[]'::jsonb,
  source text default 'app',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  duration_sec integer not null default 0,
  calories integer not null default 0,
  exercise_count integer not null default 0,
  completed boolean not null default false,
  date_key date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workout_session_items (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text,
  exercise_name_ar text,
  duration_sec integer not null default 0,
  minutes integer not null default 0,
  calories integer not null default 0,
  done boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key date not null,
  total_minutes integer not null default 0,
  total_calories integer not null default 0,
  completed_exercises integer not null default 0,
  session_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, date_key)
);

create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_exercises_name on public.exercises(name);
create index if not exists idx_workout_sessions_user_date on public.workout_sessions(user_id, date_key desc);
create index if not exists idx_session_items_session_id on public.workout_session_items(session_id);
create index if not exists idx_daily_stats_user_date on public.daily_stats(user_id, date_key desc);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_exercises_updated_at on public.exercises;
create trigger trg_exercises_updated_at
before update on public.exercises
for each row
execute function public.set_updated_at();

drop trigger if exists trg_sessions_updated_at on public.workout_sessions;
create trigger trg_sessions_updated_at
before update on public.workout_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists trg_session_items_updated_at on public.workout_session_items;
create trigger trg_session_items_updated_at
before update on public.workout_session_items
for each row
execute function public.set_updated_at();

drop trigger if exists trg_daily_stats_updated_at on public.daily_stats;
create trigger trg_daily_stats_updated_at
before update on public.daily_stats
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_session_items enable row level security;
alter table public.daily_stats enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own_or_admin" on public.profiles;
create policy "profiles_insert_own_or_admin"
on public.profiles for insert
to authenticated
with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles for update
to authenticated
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists "exercises_read_authenticated" on public.exercises;
create policy "exercises_read_authenticated"
on public.exercises for select
to authenticated
using (true);

drop policy if exists "exercises_write_admin" on public.exercises;
create policy "exercises_write_admin"
on public.exercises for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "sessions_select_own_or_admin" on public.workout_sessions;
create policy "sessions_select_own_or_admin"
on public.workout_sessions for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "sessions_insert_own_or_admin" on public.workout_sessions;
create policy "sessions_insert_own_or_admin"
on public.workout_sessions for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "sessions_update_own_or_admin" on public.workout_sessions;
create policy "sessions_update_own_or_admin"
on public.workout_sessions for update
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "sessions_delete_admin_only" on public.workout_sessions;
create policy "sessions_delete_admin_only"
on public.workout_sessions for delete
to authenticated
using (public.is_admin());

drop policy if exists "session_items_select_own_or_admin" on public.workout_session_items;
create policy "session_items_select_own_or_admin"
on public.workout_session_items for select
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and (ws.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "session_items_insert_own_or_admin" on public.workout_session_items;
create policy "session_items_insert_own_or_admin"
on public.workout_session_items for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and (ws.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "session_items_update_own_or_admin" on public.workout_session_items;
create policy "session_items_update_own_or_admin"
on public.workout_session_items for update
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and (ws.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and (ws.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "session_items_delete_admin_only" on public.workout_session_items;
create policy "session_items_delete_admin_only"
on public.workout_session_items for delete
to authenticated
using (public.is_admin());

drop policy if exists "daily_stats_select_own_or_admin" on public.daily_stats;
create policy "daily_stats_select_own_or_admin"
on public.daily_stats for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "daily_stats_insert_own_or_admin" on public.daily_stats;
create policy "daily_stats_insert_own_or_admin"
on public.daily_stats for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "daily_stats_update_own_or_admin" on public.daily_stats;
create policy "daily_stats_update_own_or_admin"
on public.daily_stats for update
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "daily_stats_delete_admin_only" on public.daily_stats;
create policy "daily_stats_delete_admin_only"
on public.daily_stats for delete
to authenticated
using (public.is_admin());
