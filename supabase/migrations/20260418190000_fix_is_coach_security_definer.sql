-- is_coach() / current_profile_role() must use SECURITY DEFINER like is_admin().
-- Otherwise RLS on public.profiles (policies that call is_coach()) causes recursion
-- or empty reads, so coaches never pass is_coach() and the admin panel rejects them.

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    'user'
  );
$$;

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_role() = 'coach';
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.is_coach() from public;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_coach() to authenticated;
grant execute on function public.current_profile_role() to service_role;
grant execute on function public.is_coach() to service_role;
