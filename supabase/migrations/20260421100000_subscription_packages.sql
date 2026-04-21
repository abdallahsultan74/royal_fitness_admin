-- Keep migration history aligned with the mobile app:
-- Subscription packages (named tiers) + variants + entitlements + bindings.

create table if not exists public.subscription_packages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  name_ar text,
  description text,
  description_ar text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_subscription_packages_updated_at on public.subscription_packages;
create trigger trg_subscription_packages_updated_at
before update on public.subscription_packages
for each row
execute function public.set_updated_at();

create table if not exists public.subscription_package_variants (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.subscription_packages(id) on delete cascade,
  duration_days integer not null default 30 check (duration_days >= 1),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'EGP',
  active boolean not null default true,
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_subscription_package_variants_updated_at on public.subscription_package_variants;
create trigger trg_subscription_package_variants_updated_at
before update on public.subscription_package_variants
for each row
execute function public.set_updated_at();

create unique index if not exists idx_subscription_package_variants_active_unique
  on public.subscription_package_variants (package_id, duration_days)
  where active = true;

create index if not exists idx_subscription_package_variants_package
  on public.subscription_package_variants (package_id);

create table if not exists public.subscription_package_entitlements (
  package_id uuid primary key references public.subscription_packages(id) on delete cascade,
  entitlements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_subscription_package_entitlements_updated_at on public.subscription_package_entitlements;
create trigger trg_subscription_package_entitlements_updated_at
before update on public.subscription_package_entitlements
for each row
execute function public.set_updated_at();

create table if not exists public.subscription_package_plans (
  package_id uuid not null references public.subscription_packages(id) on delete cascade,
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (package_id, plan_id)
);

create index if not exists idx_subscription_package_plans_plan
  on public.subscription_package_plans (plan_id);

alter table public.subscription_requests
  add column if not exists package_id uuid references public.subscription_packages(id) on delete set null,
  add column if not exists variant_id uuid references public.subscription_package_variants(id) on delete set null;

create index if not exists idx_subscription_requests_package
  on public.subscription_requests (package_id, variant_id);

alter table public.profiles
  add column if not exists subscription_package_id uuid references public.subscription_packages(id) on delete set null,
  add column if not exists subscription_variant_id uuid references public.subscription_package_variants(id) on delete set null;

create index if not exists idx_profiles_subscription_package
  on public.profiles (subscription_package_id);

alter table public.subscription_packages enable row level security;
alter table public.subscription_package_variants enable row level security;
alter table public.subscription_package_entitlements enable row level security;
alter table public.subscription_package_plans enable row level security;

drop policy if exists "subscription_packages_read_authenticated" on public.subscription_packages;
create policy "subscription_packages_read_authenticated"
on public.subscription_packages for select
to authenticated
using (active = true or public.is_admin() or public.is_coach());

drop policy if exists "subscription_package_variants_read_authenticated" on public.subscription_package_variants;
create policy "subscription_package_variants_read_authenticated"
on public.subscription_package_variants for select
to authenticated
using (active = true or public.is_admin() or public.is_coach());

drop policy if exists "subscription_package_entitlements_read_staff" on public.subscription_package_entitlements;
create policy "subscription_package_entitlements_read_staff"
on public.subscription_package_entitlements for select
to authenticated
using (public.is_admin() or public.is_coach());

drop policy if exists "subscription_package_plans_read_staff" on public.subscription_package_plans;
create policy "subscription_package_plans_read_staff"
on public.subscription_package_plans for select
to authenticated
using (public.is_admin() or public.is_coach());

drop policy if exists "subscription_packages_write_staff" on public.subscription_packages;
create policy "subscription_packages_write_staff"
on public.subscription_packages for all
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

drop policy if exists "subscription_package_variants_write_staff" on public.subscription_package_variants;
create policy "subscription_package_variants_write_staff"
on public.subscription_package_variants for all
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

drop policy if exists "subscription_package_entitlements_write_staff" on public.subscription_package_entitlements;
create policy "subscription_package_entitlements_write_staff"
on public.subscription_package_entitlements for all
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

drop policy if exists "subscription_package_plans_write_staff" on public.subscription_package_plans;
create policy "subscription_package_plans_write_staff"
on public.subscription_package_plans for all
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

