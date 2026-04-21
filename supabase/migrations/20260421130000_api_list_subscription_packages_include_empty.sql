-- Keep migration history aligned with the mobile app:
-- Staff UX: include packages even if they have no variants yet.

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
    greatest(p.updated_at, coalesce(v.updated_at, p.updated_at)) as updated_at
  from public.subscription_packages p
  left join public.subscription_package_variants v
    on v.package_id = p.id
  where
    (public.is_admin() or public.is_coach())
    or (
      p.active = true
      and v.id is not null
      and v.active = true
    );
$$;

revoke all on function public.api_list_subscription_packages() from public;
grant execute on function public.api_list_subscription_packages() to authenticated;

