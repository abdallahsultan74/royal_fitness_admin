-- Staff: deactivate (soft-delete) a subscription package and its variants.

create or replace function public.api_staff_delete_subscription_package(p_package_id uuid)
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

  update public.subscription_package_variants
  set active = false,
      updated_at = timezone('utc', now())
  where package_id = p_package_id;

  update public.subscription_packages
  set active = false,
      updated_at = timezone('utc', now())
  where id = p_package_id;
end;
$$;

grant execute on function public.api_staff_delete_subscription_package(uuid) to authenticated;

