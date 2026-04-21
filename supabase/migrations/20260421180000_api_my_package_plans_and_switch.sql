-- Keep migration history aligned with the mobile app:
-- List package-bound plans for the current user and allow switching the active plan.

create or replace function public.api_my_package_plans()
returns table (
  plan_id uuid,
  title text,
  description text,
  level text,
  duration_weeks integer,
  json_plan jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tp.id,
    tp.title,
    tp.description,
    tp.level,
    tp.duration_weeks,
    tp.json_plan,
    tp.created_at
  from public.profiles pr
  join public.subscription_package_plans spp
    on spp.package_id = pr.subscription_package_id
  join public.training_plans tp
    on tp.id = spp.plan_id
  where pr.id = auth.uid()
    and public.profile_coach_content_entitled(pr.plan, pr.plan_expires_at, pr.subscription_package_id)
    and public.profile_feature_enabled(pr.feature_flags, 'admin_plans', true)
  order by spp.created_at asc;
$$;

grant execute on function public.api_my_package_plans() to authenticated;

create or replace function public.api_my_switch_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr record;
  ok boolean;
  chosen_weeks integer;
  ends_at date;
begin
  if p_plan_id is null then
    raise exception 'PLAN_REQUIRED';
  end if;

  select id, subscription_package_id, plan, plan_expires_at, feature_flags
  into pr
  from public.profiles
  where id = auth.uid();

  if pr.id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.profile_coach_content_entitled(pr.plan, pr.plan_expires_at, pr.subscription_package_id) then
    raise exception 'not_entitled';
  end if;

  if not public.profile_feature_enabled(pr.feature_flags, 'admin_plans', true) then
    raise exception 'feature_disabled';
  end if;

  select exists(
    select 1
    from public.subscription_package_plans spp
    where spp.package_id = pr.subscription_package_id
      and spp.plan_id = p_plan_id
  )
  into ok;

  if not ok then
    raise exception 'plan_not_in_package';
  end if;

  select coalesce(tp.duration_weeks, 4)
  into chosen_weeks
  from public.training_plans tp
  where tp.id = p_plan_id;

  ends_at := (timezone('utc', now())::date + ((coalesce(chosen_weeks, 4) * 7) - 1));

  update public.plan_assignments
  set status = 'cancelled'
  where user_id = auth.uid()
    and status = 'active';

  insert into public.plan_assignments(plan_id, user_id, assigned_by, starts_at, ends_at, status)
  values (p_plan_id, auth.uid(), auth.uid(), timezone('utc', now())::date, ends_at, 'active');
end;
$$;

grant execute on function public.api_my_switch_plan(uuid) to authenticated;

