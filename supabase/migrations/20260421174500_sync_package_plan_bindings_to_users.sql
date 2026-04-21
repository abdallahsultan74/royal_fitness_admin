-- Keep migration history aligned with the mobile app:
-- Sync package->plan bindings to subscribed users automatically.

create or replace function public.sync_package_plan_bindings_to_users(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_weeks integer;
  v_ends_at date;
  u record;
begin
  if p_package_id is null then
    return;
  end if;

  select spp.plan_id
  into v_plan_id
  from public.subscription_package_plans spp
  where spp.package_id = p_package_id
  order by spp.created_at asc
  limit 1;

  if v_plan_id is null then
    update public.plan_assignments pa
    set status = 'cancelled'
    from public.profiles pr
    where pr.id = pa.user_id
      and pr.subscription_package_id = p_package_id
      and (pr.plan_expires_at is null or pr.plan_expires_at > timezone('utc', now()))
      and pa.status = 'active';
    return;
  end if;

  select coalesce(tp.duration_weeks, 4)
  into v_weeks
  from public.training_plans tp
  where tp.id = v_plan_id;

  v_ends_at := (timezone('utc', now())::date + ((coalesce(v_weeks, 4) * 7) - 1));

  for u in
    select pr.id as user_id
    from public.profiles pr
    where pr.subscription_package_id = p_package_id
      and (pr.plan_expires_at is null or pr.plan_expires_at > timezone('utc', now()))
      and public.profile_feature_enabled(pr.feature_flags, 'admin_plans', true)
  loop
    update public.plan_assignments
    set status = 'cancelled'
    where user_id = u.user_id
      and status = 'active';

    insert into public.plan_assignments(plan_id, user_id, assigned_by, starts_at, ends_at, status)
    values (v_plan_id, u.user_id, u.user_id, timezone('utc', now())::date, v_ends_at, 'active');
  end loop;
end;
$$;

create or replace function public.trg_sync_package_plan_bindings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_package_plan_bindings_to_users(coalesce(new.package_id, old.package_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_package_plan_bindings_ins on public.subscription_package_plans;
create trigger trg_sync_package_plan_bindings_ins
after insert on public.subscription_package_plans
for each row
execute function public.trg_sync_package_plan_bindings();

drop trigger if exists trg_sync_package_plan_bindings_del on public.subscription_package_plans;
create trigger trg_sync_package_plan_bindings_del
after delete on public.subscription_package_plans
for each row
execute function public.trg_sync_package_plan_bindings();

