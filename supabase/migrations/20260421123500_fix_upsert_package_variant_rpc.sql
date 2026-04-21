-- Keep migration history aligned with the mobile app:
-- Make variant upsert robust and compatible with the new unique constraint.

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

