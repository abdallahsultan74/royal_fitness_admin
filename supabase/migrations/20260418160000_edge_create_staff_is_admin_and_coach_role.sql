-- Fix Edge Function create-staff-user failures:
-- 1) is_admin() must recognize admins via profiles.role (not only fixed email / JWT claim).
-- 2) profiles.role must allow 'coach' in CHECK constraint.
-- 3) sync_profile_role_from_claim must not overwrite coach/admin rows inserted via service_role.

-- A) is_admin: JWT claim OR profile.role = admin OR legacy dashboard email
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
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
    or exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and lower(coalesce(u.email, '')) = 'admin@royalfitness.com'
    );
$$;

-- B) Allow coach in profiles.role
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'admin', 'coach'));

-- C) Preserve staff roles when inserting/updating via service_role (Edge Functions)
create or replace function public.sync_profile_role_from_claim()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') = 'service_role'
     and new.role in ('coach', 'admin') then
    return new;
  end if;

  new.role := coalesce(public.role_from_claim(new.id), 'user');
  return new;
end;
$$;
