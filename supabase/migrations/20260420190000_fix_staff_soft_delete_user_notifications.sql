-- Copied from app repo to keep migration history aligned with remote.
-- Fix api_staff_soft_delete_user: user_notifications has no recipient_id (uses user_id).

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

  delete from public.user_notifications
  where user_id = p_user_id or sender_id = p_user_id;

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

