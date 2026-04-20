-- Copied from app repo to keep migration history aligned with remote.
-- Dashboard metrics + subscription pricing (admin/coach-tunable).

-- ========== Subscription pricing ==========

create table if not exists public.subscription_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null,
  duration_days integer not null default 30,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'EGP',
  active boolean not null default true,
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_subscription_plan_prices_active_unique
  on public.subscription_plan_prices (plan_key, duration_days)
  where active = true;

drop trigger if exists trg_subscription_plan_prices_updated_at on public.subscription_plan_prices;
create trigger trg_subscription_plan_prices_updated_at
before update on public.subscription_plan_prices
for each row
execute function public.set_updated_at();

alter table public.subscription_plan_prices enable row level security;

drop policy if exists "subscription_plan_prices_read_authenticated" on public.subscription_plan_prices;
create policy "subscription_plan_prices_read_authenticated"
on public.subscription_plan_prices for select
to authenticated
using (true);

drop policy if exists "subscription_plan_prices_write_staff" on public.subscription_plan_prices;
create policy "subscription_plan_prices_write_staff"
on public.subscription_plan_prices for all
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

create or replace function public.api_list_subscription_prices()
returns table (
  plan_key text,
  duration_days integer,
  price_cents integer,
  currency text,
  active boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    spp.plan_key,
    spp.duration_days,
    spp.price_cents,
    spp.currency,
    spp.active,
    spp.updated_at
  from public.subscription_plan_prices spp
  where (public.is_admin() or public.is_coach()) or spp.active = true
  order by spp.plan_key asc, spp.duration_days asc, spp.active desc, spp.updated_at desc;
$$;

grant execute on function public.api_list_subscription_prices() to authenticated;

-- ========== Subscription requests: persist approved price ==========

alter table public.subscription_requests
  add column if not exists price_cents integer,
  add column if not exists currency text,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

create index if not exists idx_subscription_requests_approved_at
  on public.subscription_requests (approved_at desc)
  where status = 'approved';

create or replace function public.fill_subscription_request_price_on_approve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p_price integer;
  p_currency text;
begin
  if (tg_op = 'UPDATE' and new.status = 'approved' and old.status is distinct from 'approved')
     or (tg_op = 'INSERT' and new.status = 'approved') then
    select spp.price_cents, spp.currency
    into p_price, p_currency
    from public.subscription_plan_prices spp
    where spp.active = true
      and lower(spp.plan_key) = lower(coalesce(new.requested_plan, 'pro'))
      and spp.duration_days = coalesce(new.duration_days, 30)
    order by spp.updated_at desc
    limit 1;

    new.price_cents := coalesce(p_price, new.price_cents);
    new.currency := coalesce(p_currency, new.currency, 'EGP');
    new.approved_at := coalesce(new.approved_at, timezone('utc', now()));
    if (public.is_admin() or public.is_coach()) then
      new.approved_by := coalesce(new.approved_by, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_subscription_request_price_on_approve on public.subscription_requests;
create trigger trg_fill_subscription_request_price_on_approve
before insert or update on public.subscription_requests
for each row
execute function public.fill_subscription_request_price_on_approve();

-- ========== Dashboard metrics RPC ==========

create or replace function public.api_admin_dashboard_metrics(p_days integer default 30)
returns table (
  total_users integer,
  active_users integer,
  active_subscribers integer,
  pending_subscription_requests integer,
  approved_subscription_requests integer,
  revenue_cents numeric,
  currency text
)
language sql
stable
security definer
set search_path = public
as $$
  with x as (
    select greatest(coalesce(p_days, 30), 1) as days
  ),
  u as (
    select
      count(*)::integer as total_users,
      count(*) filter (where coalesce(p.status, 'active') = 'active')::integer as active_users,
      count(*) filter (
        where coalesce(p.status, 'active') = 'active'
          and coalesce(p.plan, 'trial') not in ('trial', 'free')
          and coalesce(p.plan_expires_at, timezone('utc', now()) - interval '1 day') > timezone('utc', now())
      )::integer as active_subscribers
    from public.profiles p
  ),
  sr as (
    select
      count(*) filter (where s.status = 'pending')::integer as pending_subscription_requests,
      count(*) filter (where s.status = 'approved')::integer as approved_subscription_requests,
      coalesce(sum(s.price_cents) filter (
        where s.status = 'approved'
          and s.approved_at >= timezone('utc', now()) - (select (days || ' days')::interval from x)
      ), 0)::numeric as revenue_cents,
      coalesce(
        max(s.currency) filter (where s.status = 'approved' and s.currency is not null),
        'EGP'
      ) as currency
    from public.subscription_requests s
  )
  select
    u.total_users,
    u.active_users,
    u.active_subscribers,
    sr.pending_subscription_requests,
    sr.approved_subscription_requests,
    sr.revenue_cents,
    sr.currency
  from u cross join sr
  where public.is_admin() or public.is_coach();
$$;

grant execute on function public.api_admin_dashboard_metrics(integer) to authenticated;

-- ========== Staff soft delete user ==========

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists idx_profiles_deleted_at on public.profiles (deleted_at desc);

create or replace function public.api_staff_soft_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.is_coach()) then
    raise exception 'not_allowed';
  end if;

  if auth.uid() = p_user_id then
    raise exception 'cannot_delete_self';
  end if;

  delete from public.workout_session_items wsi
  using public.workout_sessions ws
  where wsi.session_id = ws.id
    and ws.user_id = p_user_id;

  delete from public.workout_sessions where user_id = p_user_id;
  delete from public.daily_stats where user_id = p_user_id;
  delete from public.user_notifications where sender_id = p_user_id or recipient_id = p_user_id;
  delete from public.subscription_requests where user_id = p_user_id;
  delete from public.admin_notifications where user_id = p_user_id;
  delete from public.user_challenges where user_id = p_user_id;
  delete from public.user_measurements where user_id = p_user_id;

  update public.profiles
  set
    status = 'deleted',
    plan = 'trial',
    plan_expires_at = null,
    feature_flags = '{}'::jsonb,
    name = 'Deleted User',
    email = null,
    photo_url = null,
    deleted_at = timezone('utc', now())
  where id = p_user_id;
end;
$$;

grant execute on function public.api_staff_soft_delete_user(uuid) to authenticated;

