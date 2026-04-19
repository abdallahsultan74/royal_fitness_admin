-- Staff can delete subscription rows, admin/user notification rows (admin panel cleanup).
-- Extend user summary RPC with profiles.role for correct role display in the admin UI.

-- ========== RLS: DELETE for staff ==========

drop policy if exists "subscription_requests_delete_staff" on public.subscription_requests;
create policy "subscription_requests_delete_staff"
on public.subscription_requests for delete
to authenticated
using (public.is_admin() or public.is_coach());

drop policy if exists "admin_notifications_delete_staff" on public.admin_notifications;
create policy "admin_notifications_delete_staff"
on public.admin_notifications for delete
to authenticated
using (public.is_admin() or public.is_coach());

drop policy if exists "user_notifications_delete_staff" on public.user_notifications;
create policy "user_notifications_delete_staff"
on public.user_notifications for delete
to authenticated
using (public.is_admin() or public.is_coach());

-- ========== RPC: include profile role ==========

create or replace function public.api_admin_user_progress_summary()
returns table (
  user_id uuid,
  email text,
  name text,
  plan text,
  role text,
  status text,
  current_weight_kg numeric,
  target_weight_kg numeric,
  height_cm numeric,
  bmi numeric,
  bmi_status text,
  last_weight_log_at timestamptz,
  active_challenge_slug text,
  active_challenge_title text,
  challenge_level text,
  challenge_status text,
  challenge_current_day integer,
  challenge_progress_percent numeric,
  streak_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  with active_challenge as (
    select distinct on (uc.user_id)
      uc.user_id,
      ct.slug,
      ct.title,
      ct.level,
      uc.status,
      uc.current_day,
      uc.progress_percent
    from public.user_challenges uc
    join public.challenge_templates ct
      on ct.id = uc.challenge_id
    where uc.status in ('active', 'completed')
    order by uc.user_id, uc.started_at desc
  ),
  streaks as (
    select
      ds.user_id,
      count(*)::integer as streak_days
    from public.daily_stats ds
    where ds.session_count > 0
       or ds.completed_exercises > 0
       or ds.total_minutes > 0
    group by ds.user_id
  )
  select
    p.id,
    p.email,
    p.name,
    p.plan,
    p.role,
    p.status,
    p.current_weight_kg,
    p.target_weight_kg,
    p.height_cm,
    p.bmi,
    p.bmi_status,
    p.last_weight_log_at,
    ac.slug,
    ac.title,
    ac.level,
    ac.status,
    ac.current_day,
    ac.progress_percent,
    coalesce(s.streak_days, 0)
  from public.profiles p
  left join active_challenge ac
    on ac.user_id = p.id
  left join streaks s
    on s.user_id = p.id
  where public.is_admin() or public.is_coach();
$$;
