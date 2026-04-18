-- Subscription requests: support activation + renewal and prevent duplicate pending requests.

alter table public.subscription_requests
  add column if not exists request_kind text not null default 'activate',
  add column if not exists duration_days integer not null default 30;

alter table public.subscription_requests
  drop constraint if exists subscription_requests_kind_check;
alter table public.subscription_requests
  add constraint subscription_requests_kind_check check (request_kind in ('activate', 'renew'));

-- One pending request per user per kind.
create unique index if not exists idx_subscription_requests_one_pending_per_kind
  on public.subscription_requests (user_id, request_kind)
  where status = 'pending';

-- Store subscription expiry on profiles to support renewals.
alter table public.profiles
  add column if not exists plan_expires_at timestamptz;

create index if not exists idx_profiles_plan_expires_at on public.profiles(plan_expires_at);

