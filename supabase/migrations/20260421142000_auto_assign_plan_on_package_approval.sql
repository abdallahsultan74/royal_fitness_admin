-- Keep migration history aligned with the mobile app:
-- Auto-assign one of the package's bound training plans on package approval.

create or replace function public.api_staff_assign_user_package(
  p_user_id uuid,
  p_variant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  p record;
  ent jsonb;
  expires_at timestamptz;
  allow_plans boolean;
  chosen_plan_id uuid;
  chosen_weeks integer;
  ends_at date;
begin
  if not (public.is_admin() or public.is_coach()) then
    raise exception 'not_allowed';
  end if;
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;
  if p_variant_id is null then
    raise exception 'VARIANT_REQUIRED';
  end if;

  select vv.id, vv.package_id, vv.duration_days, vv.active
  into v
  from public.subscription_package_variants vv
  where vv.id = p_variant_id;
  if v.id is null then
    raise exception 'VARIANT_NOT_FOUND';
  end if;
  if v.active is distinct from true then
    raise exception 'VARIANT_INACTIVE';
  end if;

  select pp.id, pp.key, pp.active
  into p
  from public.subscription_packages pp
  where pp.id = v.package_id;
  if p.id is null then
    raise exception 'PACKAGE_NOT_FOUND';
  end if;
  if p.active is distinct from true then
    raise exception 'PACKAGE_INACTIVE';
  end if;

  select e.entitlements into ent
  from public.subscription_package_entitlements e
  where e.package_id = p.id;
  ent := coalesce(ent, '{}'::jsonb);

  expires_at := timezone('utc', now()) + make_interval(days => v.duration_days);
  allow_plans := public.profile_feature_enabled(ent, 'admin_plans', true);

  update public.profiles
  set
    subscription_package_id = p.id,
    subscription_variant_id = v.id,
    plan = p.key,
    plan_expires_at = expires_at,
    feature_flags = coalesce(feature_flags, '{}'::jsonb) || ent,
    updated_at = timezone('utc', now())
  where id = p_user_id;

  if allow_plans then
    select spp.plan_id
    into chosen_plan_id
    from public.subscription_package_plans spp
    where spp.package_id = p.id
    order by spp.created_at asc
    limit 1;

    if chosen_plan_id is not null then
      select coalesce(tp.duration_weeks, 4)
      into chosen_weeks
      from public.training_plans tp
      where tp.id = chosen_plan_id;

      ends_at := (timezone('utc', now())::date + ((coalesce(chosen_weeks, 4) * 7) - 1));

      update public.plan_assignments
      set status = 'cancelled'
      where user_id = p_user_id
        and status = 'active';

      insert into public.plan_assignments(plan_id, user_id, assigned_by, starts_at, ends_at, status)
      values (chosen_plan_id, p_user_id, auth.uid(), timezone('utc', now())::date, ends_at, 'active');
    end if;
  end if;
end;
$$;

grant execute on function public.api_staff_assign_user_package(uuid, uuid) to authenticated;

