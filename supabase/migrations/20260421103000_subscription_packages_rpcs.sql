-- Keep migration history aligned with the mobile app:
-- RPCs for subscription packages (mobile listing + staff management).

create or replace function public.api_list_subscription_packages()
returns table (
  package_id uuid,
  package_key text,
  name text,
  name_ar text,
  description text,
  description_ar text,
  package_active boolean,
  variant_id uuid,
  duration_days integer,
  price_cents integer,
  currency text,
  variant_active boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as package_id,
    p.key as package_key,
    p.name,
    p.name_ar,
    p.description,
    p.description_ar,
    p.active as package_active,
    v.id as variant_id,
    v.duration_days,
    v.price_cents,
    v.currency,
    v.active as variant_active,
    greatest(p.updated_at, v.updated_at) as updated_at
  from public.subscription_packages p
  join public.subscription_package_variants v
    on v.package_id = p.id
  where (p.active = true and v.active = true)
     or (public.is_admin() or public.is_coach());
$$;

revoke all on function public.api_list_subscription_packages() from public;
grant execute on function public.api_list_subscription_packages() to authenticated;

create or replace function public.api_staff_upsert_subscription_package(
  p_key text,
  p_name text,
  p_name_ar text default null,
  p_description text default null,
  p_description_ar text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  out_id uuid;
begin
  if not (public.is_admin() or public.is_coach()) then
    raise exception 'not_allowed';
  end if;
  if p_key is null or btrim(p_key) = '' then
    raise exception 'PACKAGE_KEY_REQUIRED';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'PACKAGE_NAME_REQUIRED';
  end if;

  insert into public.subscription_packages(
    key, name, name_ar, description, description_ar, active, created_by
  )
  values (
    lower(btrim(p_key)),
    btrim(p_name),
    nullif(btrim(coalesce(p_name_ar, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_description_ar, '')), ''),
    coalesce(p_active, true),
    auth.uid()
  )
  on conflict (key)
  do update set
    name = excluded.name,
    name_ar = excluded.name_ar,
    description = excluded.description,
    description_ar = excluded.description_ar,
    active = excluded.active,
    updated_at = timezone('utc', now())
  returning id into out_id;

  insert into public.subscription_package_entitlements(package_id, entitlements)
  values (out_id, '{}'::jsonb)
  on conflict (package_id) do nothing;

  return out_id;
end;
$$;

grant execute on function public.api_staff_upsert_subscription_package(text, text, text, text, text, boolean) to authenticated;

create or replace function public.api_staff_upsert_subscription_package_variant(
  p_package_id uuid,
  p_duration_days integer,
  p_price_cents integer,
  p_currency text default 'EGP',
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  out_id uuid;
begin
  if not (public.is_admin() or public.is_coach()) then
    raise exception 'not_allowed';
  end if;
  if p_package_id is null then
    raise exception 'PACKAGE_REQUIRED';
  end if;
  if coalesce(p_duration_days, 0) < 1 then
    raise exception 'DURATION_REQUIRED';
  end if;
  if p_price_cents is null or p_price_cents < 0 then
    raise exception 'PRICE_REQUIRED';
  end if;

  insert into public.subscription_package_variants(
    package_id, duration_days, price_cents, currency, active, set_by
  )
  values (
    p_package_id,
    p_duration_days,
    p_price_cents,
    upper(btrim(coalesce(p_currency, 'EGP'))),
    coalesce(p_active, true),
    auth.uid()
  )
  on conflict (package_id, duration_days)
  do update set
    price_cents = excluded.price_cents,
    currency = excluded.currency,
    active = excluded.active,
    set_by = auth.uid(),
    updated_at = timezone('utc', now())
  returning id into out_id;

  return out_id;
end;
$$;

grant execute on function public.api_staff_upsert_subscription_package_variant(uuid, integer, integer, text, boolean) to authenticated;

create or replace function public.api_staff_set_subscription_package_entitlements(
  p_package_id uuid,
  p_entitlements jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.is_coach()) then
    raise exception 'not_allowed';
  end if;
  if p_package_id is null then
    raise exception 'PACKAGE_REQUIRED';
  end if;

  insert into public.subscription_package_entitlements(package_id, entitlements)
  values (p_package_id, coalesce(p_entitlements, '{}'::jsonb))
  on conflict (package_id)
  do update set
    entitlements = excluded.entitlements,
    updated_at = timezone('utc', now());
end;
$$;

grant execute on function public.api_staff_set_subscription_package_entitlements(uuid, jsonb) to authenticated;

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

  update public.profiles
  set
    subscription_package_id = p.id,
    subscription_variant_id = v.id,
    plan = p.key,
    plan_expires_at = expires_at,
    feature_flags = coalesce(feature_flags, '{}'::jsonb) || ent,
    updated_at = timezone('utc', now())
  where id = p_user_id;
end;
$$;

grant execute on function public.api_staff_assign_user_package(uuid, uuid) to authenticated;

create or replace function public.api_staff_revoke_user_package(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.is_coach()) then
    raise exception 'not_allowed';
  end if;
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  update public.profiles
  set
    subscription_package_id = null,
    subscription_variant_id = null,
    plan = 'trial',
    plan_expires_at = null,
    updated_at = timezone('utc', now())
  where id = p_user_id;
end;
$$;

grant execute on function public.api_staff_revoke_user_package(uuid) to authenticated;

