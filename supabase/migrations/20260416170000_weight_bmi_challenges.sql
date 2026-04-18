alter table public.profiles
  add column if not exists height_cm numeric(5,2),
  add column if not exists current_weight_kg numeric(5,2),
  add column if not exists target_weight_kg numeric(5,2),
  add column if not exists bmi numeric(5,2),
  add column if not exists bmi_status text,
  add column if not exists last_weight_log_at timestamptz;

create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at date not null default current_date,
  weight_kg numeric(5,2) not null check (weight_kg > 0),
  source text not null default 'app',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, logged_at)
);

create table if not exists public.challenge_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  title_ar text,
  description text,
  description_ar text,
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  days_count integer not null default 30 check (days_count > 0),
  cover_image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.challenge_template_days (
  id bigint generated always as identity primary key,
  challenge_id uuid not null references public.challenge_templates(id) on delete cascade,
  day_number integer not null check (day_number > 0),
  title text not null,
  title_ar text,
  target_minutes integer not null default 0,
  target_exercises integer not null default 0,
  target_calories integer not null default 0,
  notes text,
  notes_ar text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (challenge_id, day_number)
);

create table if not exists public.user_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenge_templates(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  current_day integer not null default 1,
  completed_days integer not null default 0,
  progress_percent numeric(5,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_challenge_days (
  id bigint generated always as identity primary key,
  user_challenge_id uuid not null references public.user_challenges(id) on delete cascade,
  day_number integer not null check (day_number > 0),
  title text not null,
  title_ar text,
  target_minutes integer not null default 0,
  target_exercises integer not null default 0,
  target_calories integer not null default 0,
  completed boolean not null default false,
  progress_percent numeric(5,2) not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_challenge_id, day_number)
);

create index if not exists idx_weight_logs_user_logged_at
  on public.weight_logs(user_id, logged_at desc);

create index if not exists idx_user_challenges_user_status
  on public.user_challenges(user_id, status);

create index if not exists idx_user_challenge_days_user_challenge_day
  on public.user_challenge_days(user_challenge_id, day_number);

drop trigger if exists trg_weight_logs_updated_at on public.weight_logs;
create trigger trg_weight_logs_updated_at
before update on public.weight_logs
for each row
execute function public.set_updated_at();

drop trigger if exists trg_challenge_templates_updated_at on public.challenge_templates;
create trigger trg_challenge_templates_updated_at
before update on public.challenge_templates
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_challenges_updated_at on public.user_challenges;
create trigger trg_user_challenges_updated_at
before update on public.user_challenges
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_challenge_days_updated_at on public.user_challenge_days;
create trigger trg_user_challenge_days_updated_at
before update on public.user_challenge_days
for each row
execute function public.set_updated_at();

create or replace function public.calculate_bmi(height_cm numeric, weight_kg numeric)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(height_cm, 0) <= 0 or coalesce(weight_kg, 0) <= 0 then null
    else round((weight_kg / power(height_cm / 100.0, 2))::numeric, 2)
  end;
$$;

create or replace function public.calculate_bmi_status(bmi_value numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when bmi_value is null then null
    when bmi_value < 18.5 then 'underweight'
    when bmi_value < 25 then 'normal'
    when bmi_value < 30 then 'overweight'
    else 'obese'
  end;
$$;

create or replace function public.sync_profile_bmi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.bmi := public.calculate_bmi(new.height_cm, new.current_weight_kg);
  new.bmi_status := public.calculate_bmi_status(new.bmi);
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_bmi on public.profiles;
create trigger trg_profiles_sync_bmi
before insert or update of height_cm, current_weight_kg on public.profiles
for each row
execute function public.sync_profile_bmi();

create or replace function public.apply_weight_log_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    current_weight_kg = new.weight_kg,
    last_weight_log_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_apply_weight_log_to_profile on public.weight_logs;
create trigger trg_apply_weight_log_to_profile
after insert or update on public.weight_logs
for each row
execute function public.apply_weight_log_to_profile();

create or replace function public.start_user_challenge(challenge_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_template public.challenge_templates%rowtype;
  v_user_challenge_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_template
  from public.challenge_templates
  where slug = challenge_slug
    and is_active = true
  limit 1;

  if v_template.id is null then
    raise exception 'Challenge not found';
  end if;

  update public.user_challenges
  set status = 'cancelled',
      updated_at = timezone('utc', now())
  where user_id = v_user_id
    and status = 'active';

  insert into public.user_challenges(user_id, challenge_id, status, current_day, completed_days, progress_percent)
  values (v_user_id, v_template.id, 'active', 1, 0, 0)
  returning id into v_user_challenge_id;

  insert into public.user_challenge_days(
    user_challenge_id,
    day_number,
    title,
    title_ar,
    target_minutes,
    target_exercises,
    target_calories
  )
  select
    v_user_challenge_id,
    d.day_number,
    d.title,
    d.title_ar,
    d.target_minutes,
    d.target_exercises,
    d.target_calories
  from public.challenge_template_days d
  where d.challenge_id = v_template.id
  order by d.day_number;

  return v_user_challenge_id;
end;
$$;

create or replace function public.complete_user_challenge_day(target_day integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_challenge public.user_challenges%rowtype;
  v_total_days integer;
  v_completed_days integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_user_challenge
  from public.user_challenges
  where user_id = v_user_id
    and status = 'active'
  order by started_at desc
  limit 1;

  if v_user_challenge.id is null then
    raise exception 'No active challenge';
  end if;

  update public.user_challenge_days
  set
    completed = true,
    progress_percent = 100,
    completed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where user_challenge_id = v_user_challenge.id
    and day_number = target_day;

  select count(*)
  into v_total_days
  from public.user_challenge_days
  where user_challenge_id = v_user_challenge.id;

  select count(*)
  into v_completed_days
  from public.user_challenge_days
  where user_challenge_id = v_user_challenge.id
    and completed = true;

  update public.user_challenges
  set
    completed_days = v_completed_days,
    current_day = least(v_completed_days + 1, greatest(v_total_days, 1)),
    progress_percent = round((v_completed_days::numeric / greatest(v_total_days, 1)::numeric) * 100, 2),
    status = case when v_completed_days >= v_total_days then 'completed' else status end,
    completed_at = case when v_completed_days >= v_total_days then timezone('utc', now()) else completed_at end,
    updated_at = timezone('utc', now())
  where id = v_user_challenge.id;
end;
$$;

drop function if exists public.api_my_active_challenge();
create function public.api_my_active_challenge()
returns table (
  user_challenge_id uuid,
  challenge_id uuid,
  slug text,
  title text,
  title_ar text,
  level text,
  days_count integer,
  current_day integer,
  completed_days integer,
  progress_percent numeric,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    uc.id,
    ct.id,
    ct.slug,
    ct.title,
    ct.title_ar,
    ct.level,
    ct.days_count,
    uc.current_day,
    uc.completed_days,
    uc.progress_percent,
    uc.status
  from public.user_challenges uc
  join public.challenge_templates ct
    on ct.id = uc.challenge_id
  where uc.user_id = auth.uid()
    and uc.status in ('active', 'completed')
  order by uc.started_at desc
  limit 1;
$$;

drop function if exists public.api_admin_user_progress_summary();
create function public.api_admin_user_progress_summary()
returns table (
  user_id uuid,
  email text,
  name text,
  plan text,
  status text,
  current_weight_kg numeric,
  target_weight_kg numeric,
  height_cm numeric,
  bmi numeric,
  bmi_status text,
  last_weight_log_at timestamptz,
  active_challenge_slug text,
  active_challenge_title text,
  challenge_level text,
  challenge_status text,
  challenge_current_day integer,
  challenge_progress_percent numeric,
  streak_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  with active_challenge as (
    select distinct on (uc.user_id)
      uc.user_id,
      ct.slug,
      ct.title,
      ct.level,
      uc.status,
      uc.current_day,
      uc.progress_percent
    from public.user_challenges uc
    join public.challenge_templates ct
      on ct.id = uc.challenge_id
    where uc.status in ('active', 'completed')
    order by uc.user_id, uc.started_at desc
  ),
  streaks as (
    select
      ds.user_id,
      count(*)::integer as streak_days
    from public.daily_stats ds
    where ds.session_count > 0
       or ds.completed_exercises > 0
       or ds.total_minutes > 0
    group by ds.user_id
  )
  select
    p.id,
    p.email,
    p.name,
    p.plan,
    p.status,
    p.current_weight_kg,
    p.target_weight_kg,
    p.height_cm,
    p.bmi,
    p.bmi_status,
    p.last_weight_log_at,
    ac.slug,
    ac.title,
    ac.level,
    ac.status,
    ac.current_day,
    ac.progress_percent,
    coalesce(s.streak_days, 0)
  from public.profiles p
  left join active_challenge ac
    on ac.user_id = p.id
  left join streaks s
    on s.user_id = p.id
  where public.is_admin();
$$;

alter table public.weight_logs enable row level security;
alter table public.challenge_templates enable row level security;
alter table public.challenge_template_days enable row level security;
alter table public.user_challenges enable row level security;
alter table public.user_challenge_days enable row level security;

drop policy if exists "weight_logs_select_own_or_admin" on public.weight_logs;
create policy "weight_logs_select_own_or_admin"
on public.weight_logs for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "weight_logs_insert_own_or_admin" on public.weight_logs;
create policy "weight_logs_insert_own_or_admin"
on public.weight_logs for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "weight_logs_update_own_or_admin" on public.weight_logs;
create policy "weight_logs_update_own_or_admin"
on public.weight_logs for update
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "challenge_templates_read_authenticated" on public.challenge_templates;
create policy "challenge_templates_read_authenticated"
on public.challenge_templates for select
to authenticated
using (is_active = true or public.is_admin());

drop policy if exists "challenge_templates_write_admin" on public.challenge_templates;
create policy "challenge_templates_write_admin"
on public.challenge_templates for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "challenge_template_days_read_authenticated" on public.challenge_template_days;
create policy "challenge_template_days_read_authenticated"
on public.challenge_template_days for select
to authenticated
using (
  exists (
    select 1
    from public.challenge_templates ct
    where ct.id = challenge_id
      and (ct.is_active = true or public.is_admin())
  )
);

drop policy if exists "challenge_template_days_write_admin" on public.challenge_template_days;
create policy "challenge_template_days_write_admin"
on public.challenge_template_days for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "user_challenges_select_own_or_admin" on public.user_challenges;
create policy "user_challenges_select_own_or_admin"
on public.user_challenges for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_challenges_insert_own_or_admin" on public.user_challenges;
create policy "user_challenges_insert_own_or_admin"
on public.user_challenges for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_challenges_update_own_or_admin" on public.user_challenges;
create policy "user_challenges_update_own_or_admin"
on public.user_challenges for update
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_challenge_days_select_owner_or_admin" on public.user_challenge_days;
create policy "user_challenge_days_select_owner_or_admin"
on public.user_challenge_days for select
to authenticated
using (
  exists (
    select 1
    from public.user_challenges uc
    where uc.id = user_challenge_id
      and (uc.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "user_challenge_days_update_owner_or_admin" on public.user_challenge_days;
create policy "user_challenge_days_update_owner_or_admin"
on public.user_challenge_days for update
to authenticated
using (
  exists (
    select 1
    from public.user_challenges uc
    where uc.id = user_challenge_id
      and (uc.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.user_challenges uc
    where uc.id = user_challenge_id
      and (uc.user_id = auth.uid() or public.is_admin())
  )
);

grant execute on function public.start_user_challenge(text) to authenticated;
grant execute on function public.complete_user_challenge_day(integer) to authenticated;
grant execute on function public.api_my_active_challenge() to authenticated;
grant execute on function public.api_admin_user_progress_summary() to authenticated;

insert into public.challenge_templates (
  slug, title, title_ar, description, description_ar, level, days_count, is_active
)
values
  ('royal-transform-beginner', '30-Day Royal Transform', 'تحول ملكي 30 يوما', 'A beginner-friendly full body challenge.', 'تحدي تدريجي للمبتدئين للجسم بالكامل.', 'beginner', 30, true),
  ('royal-transform-intermediate', '30-Day Power Builder', 'بناء القوة 30 يوما', 'An intermediate challenge for consistency and strength.', 'تحد متوسط لرفع الاستمرار والقوة.', 'intermediate', 30, true),
  ('royal-transform-advanced', '30-Day Elite Burn', 'حرق النخبة 30 يوما', 'An advanced challenge with higher volume and intensity.', 'تحد متقدم بحجم وشدة أعلى.', 'advanced', 30, true)
on conflict (slug) do update
set
  title = excluded.title,
  title_ar = excluded.title_ar,
  description = excluded.description,
  description_ar = excluded.description_ar,
  level = excluded.level,
  days_count = excluded.days_count,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

delete from public.challenge_template_days
where challenge_id in (
  select id
  from public.challenge_templates
  where slug in (
    'royal-transform-beginner',
    'royal-transform-intermediate',
    'royal-transform-advanced'
  )
);

insert into public.challenge_template_days (
  challenge_id,
  day_number,
  title,
  title_ar,
  target_minutes,
  target_exercises,
  target_calories,
  notes,
  notes_ar
)
select
  ct.id,
  gs.day_number,
  case
    when ct.level = 'beginner' then 'Beginner Day ' || gs.day_number
    when ct.level = 'intermediate' then 'Intermediate Day ' || gs.day_number
    else 'Advanced Day ' || gs.day_number
  end,
  case
    when ct.level = 'beginner' then 'اليوم ' || gs.day_number || ' للمبتدئين'
    when ct.level = 'intermediate' then 'اليوم ' || gs.day_number || ' للمتوسط'
    else 'اليوم ' || gs.day_number || ' للمتقدم'
  end,
  case
    when ct.level = 'beginner' then 12 + gs.day_number
    when ct.level = 'intermediate' then 18 + gs.day_number
    else 24 + gs.day_number
  end,
  case
    when ct.level = 'beginner' then 3 + (gs.day_number % 3)
    when ct.level = 'intermediate' then 4 + (gs.day_number % 4)
    else 5 + (gs.day_number % 5)
  end,
  case
    when ct.level = 'beginner' then 80 + (gs.day_number * 4)
    when ct.level = 'intermediate' then 110 + (gs.day_number * 5)
    else 150 + (gs.day_number * 6)
  end,
  'Focus on consistency and form.',
  'ركز على الاستمرارية وجودة الأداء.'
from public.challenge_templates ct
cross join generate_series(1, 30) as gs(day_number)
where ct.slug in (
  'royal-transform-beginner',
  'royal-transform-intermediate',
  'royal-transform-advanced'
);
