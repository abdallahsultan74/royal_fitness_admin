create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' ->> 'admin')::boolean, false)
    or exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and lower(coalesce(u.email, '')) = 'admin@royalfitness.com'
    );
$$;
