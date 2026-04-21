-- Keep migration history aligned with the mobile app:
-- Fix missing unique constraint for ON CONFLICT(package_id, duration_days).

drop index if exists public.idx_subscription_package_variants_active_unique;

alter table public.subscription_package_variants
  drop constraint if exists subscription_package_variants_package_duration_unique;

alter table public.subscription_package_variants
  add constraint subscription_package_variants_package_duration_unique
  unique (package_id, duration_days);

