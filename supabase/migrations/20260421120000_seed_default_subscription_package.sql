-- Keep migration history aligned with the mobile app:
-- Seed a default "pro" package + 30-day variant for backward compatibility.

do $$
declare
  v_pkg_id uuid;
  v_price_cents integer;
  v_currency text;
begin
  insert into public.subscription_packages(key, name, name_ar, description, description_ar, active)
  values ('pro', 'Pro', 'برو', 'Default subscription package', 'الباقة الافتراضية للاشتراك', true)
  on conflict (key) do update set
    active = excluded.active,
    updated_at = timezone('utc', now())
  returning id into v_pkg_id;

  insert into public.subscription_package_entitlements(package_id, entitlements)
  values (v_pkg_id, jsonb_build_object('admin_plans', true, 'challenges', true))
  on conflict (package_id) do update set
    entitlements = excluded.entitlements,
    updated_at = timezone('utc', now());

  select
    coalesce((p.price_cents)::int, 0),
    coalesce(p.currency::text, 'EGP')
  into v_price_cents, v_currency
  from public.subscription_plan_prices p
  where p.active = true
    and lower(trim(p.plan_key)) = 'pro'
    and p.duration_days = 30
  order by p.updated_at desc
  limit 1;

  insert into public.subscription_package_variants(
    package_id, duration_days, price_cents, currency, active
  )
  values (
    v_pkg_id, 30, coalesce(v_price_cents, 0), upper(coalesce(v_currency, 'EGP')), true
  )
  on conflict (package_id, duration_days)
  do update set
    price_cents = excluded.price_cents,
    currency = excluded.currency,
    active = true,
    updated_at = timezone('utc', now());
end;
$$;

