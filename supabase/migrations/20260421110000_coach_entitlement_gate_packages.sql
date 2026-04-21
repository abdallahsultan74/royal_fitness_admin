-- Keep migration history aligned with the mobile app:
-- Treat package-based subscriptions as coach-content entitled.

create or replace function public.profile_coach_content_entitled(
  plan_tier text,
  plan_expires_at timestamptz,
  subscription_package_id uuid default null
) returns boolean
language sql
stable
as $$
  select
    (
      subscription_package_id is not null
      or lower(trim(coalesce(plan_tier, 'basic'))) in ('pro', 'premium', 'royal', 'elite')
    )
    and (
      plan_expires_at is null
      or plan_expires_at > timezone('utc', now())
    );
$$;

create or replace function public.profile_coach_content_entitled(
  plan_tier text,
  plan_expires_at timestamptz
) returns boolean
language sql
stable
as $$
  select public.profile_coach_content_entitled(plan_tier, plan_expires_at, null::uuid);
$$;

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
    and public.profile_coach_content_entitled(pr.plan, pr.plan_expires_at, pr.subscription_package_id)
    and public.profile_feature_enabled(pr.feature_flags, 'admin_plans', true)
  order by pa.created_at desc
  limit 1;
$$;

grant execute on function public.api_my_active_plan() to authenticated;

