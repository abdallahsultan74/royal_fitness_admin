-- Admin analytics RPCs (admin-only).
-- Provides time-series + summary metrics for: subscriptions/revenue, users growth, workouts engagement,
-- challenges & plans, notifications/support.

-- ========== Ensure columns exist (for compatibility) ==========

alter table public.subscription_requests
  add column if not exists price_cents integer,
  add column if not exists currency text,
  add column if not exists approved_at timestamptz;

alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- ========== Helpers ==========

create or replace function public._analytics_range(p_from timestamptz, p_to timestamptz, p_days integer default 30)
returns table (
  from_ts timestamptz,
  to_ts timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(p_from, timezone('utc', now()) - (greatest(coalesce(p_days, 30), 1) || ' days')::interval) as from_ts,
    coalesce(p_to, timezone('utc', now())) as to_ts
  where public.is_admin();
$$;

grant execute on function public._analytics_range(timestamptz, timestamptz, integer) to authenticated;

-- ========== 1) Subscriptions / Revenue: daily series ==========

create or replace function public.api_admin_analytics_revenue_daily(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_days integer default 30
)
returns table (
  day date,
  approved_count integer,
  revenue_cents numeric,
  currency text
)
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select * from public._analytics_range(p_from, p_to, p_days)
  ),
  s as (
    select
      (sr.approved_at at time zone 'utc')::date as day,
      count(*)::integer as approved_count,
      coalesce(sum(sr.price_cents), 0)::numeric as revenue_cents,
      coalesce(max(sr.currency), 'EGP') as currency
    from public.subscription_requests sr
    join r on true
    where sr.status = 'approved'
      and sr.approved_at >= r.from_ts
      and sr.approved_at <= r.to_ts
    group by 1
  ),
  days as (
    select generate_series(
      (select from_ts::date from r),
      (select to_ts::date from r),
      interval '1 day'
    )::date as day
  )
  select
    d.day,
    coalesce(s.approved_count, 0) as approved_count,
    coalesce(s.revenue_cents, 0) as revenue_cents,
    coalesce(s.currency, 'EGP') as currency
  from days d
  left join s on s.day = d.day
  order by d.day asc;
$$;

grant execute on function public.api_admin_analytics_revenue_daily(timestamptz, timestamptz, integer) to authenticated;

-- ========== 2) Users growth: daily series + breakdown ==========

create or replace function public.api_admin_analytics_users_daily(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_days integer default 30
)
returns table (
  day date,
  new_users integer,
  active_users integer,
  deleted_users integer
)
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select * from public._analytics_range(p_from, p_to, p_days)
  ),
  agg as (
    select
      (p.created_at at time zone 'utc')::date as day,
      count(*)::integer as new_users,
      count(*) filter (where coalesce(p.status, 'active') = 'active')::integer as active_users,
      count(*) filter (where p.deleted_at is not null or coalesce(p.status, '') = 'deleted')::integer as deleted_users
    from public.profiles p
    join r on true
    where p.created_at >= r.from_ts
      and p.created_at <= r.to_ts
    group by 1
  ),
  days as (
    select generate_series(
      (select from_ts::date from r),
      (select to_ts::date from r),
      interval '1 day'
    )::date as day
  )
  select
    d.day,
    coalesce(agg.new_users, 0) as new_users,
    coalesce(agg.active_users, 0) as active_users,
    coalesce(agg.deleted_users, 0) as deleted_users
  from days d
  left join agg on agg.day = d.day
  order by d.day asc;
$$;

grant execute on function public.api_admin_analytics_users_daily(timestamptz, timestamptz, integer) to authenticated;

create or replace function public.api_admin_analytics_users_breakdown()
returns table (
  plan text,
  role text,
  status text,
  count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(nullif(btrim(p.plan), ''), 'unknown') as plan,
    coalesce(nullif(btrim(p.role), ''), 'user') as role,
    coalesce(nullif(btrim(p.status), ''), 'active') as status,
    count(*)::integer as count
  from public.profiles p
  where public.is_admin()
  group by 1,2,3
  order by count desc;
$$;

grant execute on function public.api_admin_analytics_users_breakdown() to authenticated;

-- ========== 3) Workouts engagement: daily totals + top users ==========

create or replace function public.api_admin_analytics_workouts_daily(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_days integer default 30
)
returns table (
  day date,
  total_minutes integer,
  total_calories integer,
  total_steps integer,
  total_sessions integer,
  active_users integer
)
language sql
stable
security definer
set search_path = public
as $$
  with r as (select * from public._analytics_range(p_from, p_to, p_days)),
  agg as (
    select
      ds.date_key as day,
      sum(ds.total_minutes)::integer as total_minutes,
      sum(ds.total_calories)::integer as total_calories,
      sum(coalesce(ds.steps, 0))::integer as total_steps,
      sum(ds.session_count)::integer as total_sessions,
      count(*) filter (
        where ds.session_count > 0
           or ds.completed_exercises > 0
           or ds.total_minutes > 0
           or ds.total_calories > 0
           or coalesce(ds.steps, 0) > 0
      )::integer as active_users
    from public.daily_stats ds
    join r on true
    where ds.date_key >= r.from_ts::date
      and ds.date_key <= r.to_ts::date
    group by 1
  ),
  days as (
    select generate_series(
      (select from_ts::date from r),
      (select to_ts::date from r),
      interval '1 day'
    )::date as day
  )
  select
    d.day,
    coalesce(agg.total_minutes, 0) as total_minutes,
    coalesce(agg.total_calories, 0) as total_calories,
    coalesce(agg.total_steps, 0) as total_steps,
    coalesce(agg.total_sessions, 0) as total_sessions,
    coalesce(agg.active_users, 0) as active_users
  from days d
  left join agg on agg.day = d.day
  where public.is_admin()
  order by d.day asc;
$$;

grant execute on function public.api_admin_analytics_workouts_daily(timestamptz, timestamptz, integer) to authenticated;

create or replace function public.api_admin_analytics_workouts_top_users(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_days integer default 30,
  p_limit integer default 10
)
returns table (
  user_id uuid,
  name text,
  email text,
  total_minutes integer,
  total_calories integer,
  total_steps integer,
  total_sessions integer
)
language sql
stable
security definer
set search_path = public
as $$
  with r as (select * from public._analytics_range(p_from, p_to, p_days))
  select
    p.id as user_id,
    p.name,
    p.email,
    sum(ds.total_minutes)::integer as total_minutes,
    sum(ds.total_calories)::integer as total_calories,
    sum(coalesce(ds.steps, 0))::integer as total_steps,
    sum(ds.session_count)::integer as total_sessions
  from public.daily_stats ds
  join public.profiles p on p.id = ds.user_id
  join r on true
  where ds.date_key >= r.from_ts::date
    and ds.date_key <= r.to_ts::date
    and public.is_admin()
  group by 1,2,3
  order by total_minutes desc, total_sessions desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

grant execute on function public.api_admin_analytics_workouts_top_users(timestamptz, timestamptz, integer, integer) to authenticated;

-- ========== 4) Challenges & Plans: summaries ==========

create or replace function public.api_admin_analytics_challenges_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_days integer default 30
)
returns table (
  active_count integer,
  completed_count integer,
  avg_progress_percent numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with r as (select * from public._analytics_range(p_from, p_to, p_days))
  select
    count(*) filter (where uc.status = 'active')::integer as active_count,
    count(*) filter (where uc.status = 'completed')::integer as completed_count,
    coalesce(avg(uc.progress_percent), 0)::numeric as avg_progress_percent
  from public.user_challenges uc
  join r on true
  where uc.started_at >= r.from_ts
    and uc.started_at <= r.to_ts
    and public.is_admin();
$$;

grant execute on function public.api_admin_analytics_challenges_summary(timestamptz, timestamptz, integer) to authenticated;

create or replace function public.api_admin_analytics_plans_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_days integer default 30
)
returns table (
  active_assignments integer,
  ended_assignments integer,
  total_assignments integer
)
language sql
stable
security definer
set search_path = public
as $$
  with r as (select * from public._analytics_range(p_from, p_to, p_days))
  select
    count(*) filter (where pa.status = 'active')::integer as active_assignments,
    count(*) filter (where pa.status <> 'active')::integer as ended_assignments,
    count(*)::integer as total_assignments
  from public.plan_assignments pa
  join r on true
  where pa.created_at >= r.from_ts
    and pa.created_at <= r.to_ts
    and public.is_admin();
$$;

grant execute on function public.api_admin_analytics_plans_summary(timestamptz, timestamptz, integer) to authenticated;

-- ========== 5) Notifications/support: summaries ==========

create or replace function public.api_admin_analytics_notifications_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_days integer default 30
)
returns table (
  user_notifications integer,
  user_messages integer,
  admin_notifications integer
)
language sql
stable
security definer
set search_path = public
as $$
  with r as (select * from public._analytics_range(p_from, p_to, p_days))
  select
    count(*) filter (where un.type = 'notification')::integer as user_notifications,
    count(*) filter (where un.type = 'message')::integer as user_messages,
    (select count(*)::integer from public.admin_notifications an join r on true where an.created_at >= r.from_ts and an.created_at <= r.to_ts) as admin_notifications
  from public.user_notifications un
  join r on true
  where un.created_at >= r.from_ts
    and un.created_at <= r.to_ts
    and public.is_admin();
$$;

grant execute on function public.api_admin_analytics_notifications_summary(timestamptz, timestamptz, integer) to authenticated;

