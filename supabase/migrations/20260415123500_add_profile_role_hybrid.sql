alter table public.profiles
add column if not exists role text not null default 'user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
    add constraint profiles_role_check check (role in ('user', 'admin'));
  end if;
end $$;

create index if not exists idx_profiles_role on public.profiles(role);

create or replace function public.role_from_claim(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when coalesce((u.raw_app_meta_data ->> 'admin')::boolean, false) then 'admin'
    else 'user'
  end
  from auth.users u
  where u.id = target_user_id;
$$;

create or replace function public.sync_profile_role_from_claim()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  new.role := coalesce(public.role_from_claim(new.id), 'user');
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_role on public.profiles;
create trigger trg_profiles_sync_role
before insert or update of id on public.profiles
for each row
execute function public.sync_profile_role_from_claim();

update public.profiles p
set role = coalesce(public.role_from_claim(p.id), 'user');
