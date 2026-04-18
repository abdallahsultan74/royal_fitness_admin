-- Coach roles + plans + user notifications/messages + measurements timeline

-- 1) profiles extensions
alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists whatsapp_phone text,
  add column if not exists height_cm numeric,
  add column if not exists current_weight_kg numeric,
  add column if not exists target_weight_kg numeric,
  add column if not exists bmi numeric,
  add column if not exists bmi_status text,
  add column if not exists last_weight_log_at timestamptz;

create index if not exists idx_profiles_role on public.profiles(role);

create or replace function public.current_profile_role()
returns text
language sql
stable
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'user');
$$;

create or replace function public.is_coach()
returns boolean
language sql
stable
as $$
  select public.current_profile_role() = 'coach';
$$;

-- 2) training plans
create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  level text not null default 'beginner',
  duration_weeks integer not null default 4,
  json_plan jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_training_plans_created_by on public.training_plans(created_by, created_at desc);

drop trigger if exists trg_training_plans_updated_at on public.training_plans;
create trigger trg_training_plans_updated_at
before update on public.training_plans
for each row
execute function public.set_updated_at();

alter table public.training_plans enable row level security;

drop policy if exists "training_plans_select_authed" on public.training_plans;
create policy "training_plans_select_authed"
on public.training_plans for select
to authenticated
using (true);

drop policy if exists "training_plans_write_coach_or_admin" on public.training_plans;
create policy "training_plans_write_coach_or_admin"
on public.training_plans for all
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

-- 3) plan assignments
create table if not exists public.plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete set null,
  starts_at date,
  ends_at date,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_plan_assignments_user on public.plan_assignments(user_id, created_at desc);
create index if not exists idx_plan_assignments_plan on public.plan_assignments(plan_id, created_at desc);

alter table public.plan_assignments enable row level security;

drop policy if exists "plan_assignments_select_own_or_staff" on public.plan_assignments;
create policy "plan_assignments_select_own_or_staff"
on public.plan_assignments for select
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "plan_assignments_write_staff" on public.plan_assignments;
create policy "plan_assignments_write_staff"
on public.plan_assignments for all
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

-- 4) user notifications/messages (single table)
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  type text not null default 'notification', -- notification | message
  title text,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_notifications_user on public.user_notifications(user_id, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "user_notifications_select_own_or_staff" on public.user_notifications;
create policy "user_notifications_select_own_or_staff"
on public.user_notifications for select
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "user_notifications_insert_staff" on public.user_notifications;
create policy "user_notifications_insert_staff"
on public.user_notifications for insert
to authenticated
with check (public.is_admin() or public.is_coach());

drop policy if exists "user_notifications_update_own" on public.user_notifications;
create policy "user_notifications_update_own"
on public.user_notifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 5) measurements timeline (vitals)
create table if not exists public.user_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, -- weight,bp_sys,bp_dia,hr,steps,spo2,temp,...
  value_num numeric,
  value_text text,
  unit text,
  measured_at timestamptz not null default timezone('utc', now()),
  source text default 'app',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_measurements_user_time on public.user_measurements(user_id, measured_at desc);

alter table public.user_measurements enable row level security;

drop policy if exists "user_measurements_select_own_or_staff" on public.user_measurements;
create policy "user_measurements_select_own_or_staff"
on public.user_measurements for select
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "user_measurements_write_own_or_staff" on public.user_measurements;
create policy "user_measurements_write_own_or_staff"
on public.user_measurements for all
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach())
with check (auth.uid() = user_id or public.is_admin() or public.is_coach());

-- 6) keep profiles synced from weight_logs (if weight_logs exists)
create or replace function public.sync_profile_from_weight_log()
returns trigger
language plpgsql
as $$
declare
  h numeric;
begin
  update public.profiles
    set current_weight_kg = new.weight_kg,
        last_weight_log_at = timezone('utc', now())
  where id = new.user_id;

  select height_cm into h from public.profiles where id = new.user_id;
  if h is not null and h > 0 and new.weight_kg is not null and new.weight_kg > 0 then
    update public.profiles
      set bmi = round((new.weight_kg / power((h/100.0), 2))::numeric, 1),
          bmi_status = case
            when (new.weight_kg / power((h/100.0), 2)) < 18.5 then 'underweight'
            when (new.weight_kg / power((h/100.0), 2)) < 25 then 'normal'
            when (new.weight_kg / power((h/100.0), 2)) < 30 then 'overweight'
            else 'obese'
          end
    where id = new.user_id;
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='weight_logs') then
    drop trigger if exists trg_weight_logs_sync_profile on public.weight_logs;
    create trigger trg_weight_logs_sync_profile
      after insert or update on public.weight_logs
      for each row
      execute function public.sync_profile_from_weight_log();
  end if;
end;
$$;

