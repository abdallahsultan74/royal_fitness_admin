create table if not exists public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_plan text not null default 'pro',
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null default 'general',
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_subscription_requests_user on public.subscription_requests(user_id);
create index if not exists idx_subscription_requests_status on public.subscription_requests(status);
create index if not exists idx_admin_notifications_created_at on public.admin_notifications(created_at desc);

drop trigger if exists trg_subscription_requests_updated_at on public.subscription_requests;
create trigger trg_subscription_requests_updated_at
before update on public.subscription_requests
for each row
execute function public.set_updated_at();

create or replace function public.notify_subscription_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_name text;
  profile_email text;
begin
  select p.name, p.email
  into profile_name, profile_email
  from public.profiles p
  where p.id = new.user_id;

  insert into public.admin_notifications(user_id, type, title, body)
  values (
    new.user_id,
    'subscription_request',
    'New subscription request',
    coalesce(profile_name, 'User') || ' (' || coalesce(profile_email, 'unknown@email.com') || ') requested plan: ' || coalesce(new.requested_plan, 'pro')
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_subscription_request on public.subscription_requests;
create trigger trg_notify_subscription_request
after insert on public.subscription_requests
for each row
execute function public.notify_subscription_request();

alter table public.subscription_requests enable row level security;
alter table public.admin_notifications enable row level security;

drop policy if exists "subscription_requests_select_own_or_admin" on public.subscription_requests;
create policy "subscription_requests_select_own_or_admin"
on public.subscription_requests for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "subscription_requests_insert_own_or_admin" on public.subscription_requests;
create policy "subscription_requests_insert_own_or_admin"
on public.subscription_requests for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "subscription_requests_update_admin_only" on public.subscription_requests;
create policy "subscription_requests_update_admin_only"
on public.subscription_requests for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin_notifications_select_admin_only" on public.admin_notifications;
create policy "admin_notifications_select_admin_only"
on public.admin_notifications for select
to authenticated
using (public.is_admin());

drop policy if exists "admin_notifications_update_admin_only" on public.admin_notifications;
create policy "admin_notifications_update_admin_only"
on public.admin_notifications for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin_notifications_insert_admin_only" on public.admin_notifications;
create policy "admin_notifications_insert_admin_only"
on public.admin_notifications for insert
to authenticated
with check (public.is_admin());
