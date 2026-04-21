-- Keep migration history aligned with the mobile app:
-- Support subscription cancellation requests.

alter table public.subscription_requests
  drop constraint if exists subscription_requests_kind_check;

alter table public.subscription_requests
  add constraint subscription_requests_kind_check
  check (request_kind in ('activate', 'renew', 'cancel'));

