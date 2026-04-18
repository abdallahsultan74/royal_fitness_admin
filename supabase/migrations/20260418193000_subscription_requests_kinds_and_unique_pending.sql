-- Subscription requests: support activation + renewal and prevent duplicate pending requests.

alter table public.subscription_requests
  add column if not exists request_kind text not null default 'activate',
  add column if not exists duration_days integer not null default 30;

alter table public.subscription_requests
  drop constraint if exists subscription_requests_kind_check;
alter table public.subscription_requests
  add constraint subscription_requests_kind_check check (request_kind in ('activate', 'renew'));

-- Cleanup: ensure legacy rows have request_kind and dedupe pending rows before adding unique index.
-- Keep the most recent pending request per (user_id, request_kind); reject older duplicates.
update public.subscription_requests
set request_kind = 'activate'
where request_kind is null or btrim(request_kind) = '';

with ranked as (
  select
    id,
    user_id,
    request_kind,
    status,
    created_at,
    row_number() over (
      partition by user_id, request_kind
      order by created_at desc, id desc
    ) as rn
  from public.subscription_requests
  where status = 'pending'
)
update public.subscription_requests sr
set
  status = 'rejected',
  note = case
    when sr.note is null or btrim(sr.note) = '' then 'Auto-rejected duplicate pending request during migration'
    else sr.note || ' | Auto-rejected duplicate pending request during migration'
  end
from ranked r
where sr.id = r.id
  and r.rn > 1;

-- One pending request per user per kind.
create unique index if not exists idx_subscription_requests_one_pending_per_kind
  on public.subscription_requests (user_id, request_kind)
  where status = 'pending';

-- Store subscription expiry on profiles to support renewals.
alter table public.profiles
  add column if not exists plan_expires_at timestamptz;

create index if not exists idx_profiles_plan_expires_at on public.profiles(plan_expires_at);

