-- Copied from app repo to keep migration history aligned with remote.
-- Coach-assigned content: profile tier + expiry + per-user feature_flags, revoke on downgrade, RPC gates.

alter table public.profiles
  add column if not exists feature_flags jsonb not null default '{}'::jsonb;

create or replace function public.profile_coach_content_entitled(
  plan_tier text,
  plan_expires_at timestamptz
) returns boolean
language sql
stable
as $$
  select
    lower(trim(coalesce(plan_tier, 'basic'))) in ('pro', 'premium', 'royal', 'elite')
    and (
      plan_expires_at is null
      or plan_expires_at > timezone('utc', now())
    );
$$;

create or replace function public.profile_feature_enabled(
  flags jsonb,
  key text,
  default_when_missing boolean default true
) returns boolean
language sql
stable
as $$
  select case
    when flags is null then default_when_missing
    when not (flags ? key) then default_when_missing
    when jsonb_typeof(flags -> key) = 'boolean' then (flags ->> key)::boolean
    when lower(trim(flags ->> key)) in ('false', '0', 'no') then false
    when lower(trim(flags ->> key)) in ('true', '1', 'yes') then true
    else default_when_missing
  end;
$$;

create or replace function public.handle_profile_coach_entitlement_revoke()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if public.profile_coach_content_entitled(new.plan, new.plan_expires_at)
       is distinct from
       public.profile_coach_content_entitled(old.plan, old.plan_expires_at)
    then
      if not public.profile_coach_content_entitled(new.plan, new.plan_expires_at) then
        update public.plan_assignments
        set status = 'cancelled'
        where user_id = new.id
          and status = 'active';

        update public.user_challenges
        set
          status = 'cancelled',
          updated_at = timezone('utc', now())
        where user_id = new.id
          and status = 'active';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_revoke_coach_content on public.profiles;
create trigger trg_profiles_revoke_coach_content
after update of plan, plan_expires_at on public.profiles
for each row
execute function public.handle_profile_coach_entitlement_revoke();

drop function if exists public.api_my_active_plan();
create function public.api_my_active_plan()
returns table (
  assignment_id uuid,
  plan_id uuid,
  title text,
  description text,
  level text,
  duration_weeks integer,
  json_plan jsonb,
  starts_at date,
  ends_at date,
  status text,
  assigned_by uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pa.id,
    tp.id,
    tp.title,
    tp.description,
    tp.level,
    tp.duration_weeks,
    tp.json_plan,
    pa.starts_at,
    pa.ends_at,
    pa.status,
    pa.assigned_by,
    pa.created_at
  from public.plan_assignments pa
  join public.training_plans tp
    on tp.id = pa.plan_id
  join public.profiles pr
    on pr.id = pa.user_id
  where pa.user_id = auth.uid()
    and pa.status = 'active'
    and public.profile_coach_content_entitled(pr.plan, pr.plan_expires_at)
    and public.profile_feature_enabled(pr.feature_flags, 'admin_plans', true)
  order by pa.created_at desc
  limit 1;
$$;

grant execute on function public.api_my_active_plan() to authenticated;

create or replace function public.api_my_active_challenge()
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
  status text,
  cover_image_url text
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
    uc.status,
    ct.cover_image_url
  from public.user_challenges uc
  join public.challenge_templates ct
    on ct.id = uc.challenge_id
  join public.profiles pr
    on pr.id = uc.user_id
  where uc.user_id = auth.uid()
    and uc.status in ('active', 'completed')
    and public.profile_coach_content_entitled(pr.plan, pr.plan_expires_at)
    and public.profile_feature_enabled(pr.feature_flags, 'challenges', true)
  order by uc.started_at desc
  limit 1;
$$;

grant execute on function public.api_my_active_challenge() to authenticated;

