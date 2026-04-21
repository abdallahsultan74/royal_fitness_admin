-- Keep migration history aligned with the mobile app:
-- Apply subscription effects automatically when a request is approved.

-- Internal apply function (no staff/JWT required). Used by trigger + backfill.
create or replace function public.apply_subscription_request_effects(
  p_user_id uuid,
  p_request_kind text,
  p_variant_id uuid
) returns void
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
  if p_user_id is null then
    return;
  end if;

  if lower(coalesce(p_request_kind, '')) = 'cancel' then
    update public.profiles
    set
      subscription_package_id = null,
      subscription_variant_id = null,
      plan = 'trial',
      plan_expires_at = null,
      updated_at = timezone('utc', now())
    where id = p_user_id;

    update public.plan_assignments
    set status = 'cancelled'
    where user_id = p_user_id
      and status = 'active';

    return;
  end if;

  if p_variant_id is null then
    return;
  end if;

  -- Ensure profile exists.
  insert into public.profiles(id) values (p_user_id)
  on conflict (id) do nothing;

  select vv.id, vv.package_id, vv.duration_days, vv.active
  into v
  from public.subscription_package_variants vv
  where vv.id = p_variant_id;
  if v.id is null or v.active is distinct from true then
    return;
  end if;

  select pp.id, pp.key, pp.active
  into p
  from public.subscription_packages pp
  where pp.id = v.package_id;
  if p.id is null or p.active is distinct from true then
    return;
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
    status = 'active',
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
      values (chosen_plan_id, p_user_id, coalesce(auth.uid(), p_user_id), timezone('utc', now())::date, ends_at, 'active');
    end if;
  end if;
end;
$$;

create or replace function public.apply_subscription_request_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if (old.status is distinct from new.status) and lower(coalesce(new.status, '')) = 'approved' then
    perform public.apply_subscription_request_effects(new.user_id, new.request_kind, new.variant_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_subscription_request_on_approval on public.subscription_requests;
create trigger trg_apply_subscription_request_on_approval
after update of status on public.subscription_requests
for each row
execute function public.apply_subscription_request_on_approval();

do $$
declare
  r record;
begin
  for r in
    select distinct on (sr.user_id)
      sr.user_id, sr.request_kind, sr.variant_id
    from public.subscription_requests sr
    where sr.status = 'approved'
    order by sr.user_id, sr.approved_at desc nulls last, sr.created_at desc
  loop
    perform public.apply_subscription_request_effects(r.user_id, r.request_kind, r.variant_id);
  end loop;
end;
$$;

