-- Keep migration history aligned with the mobile app:
-- User-initiated cancellation: no staff approval required.

create or replace function public.api_my_cancel_subscription()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.subscription_requests(
    user_id, requested_plan, request_kind, duration_days, status, note, approved_at
  )
  values (
    uid,
    'cancel',
    'cancel',
    0,
    'approved',
    'Cancelled from mobile (instant)',
    timezone('utc', now())
  );

  perform public.apply_subscription_request_effects(uid, 'cancel', null::uuid);

  insert into public.admin_notifications(type, title, body, read)
  values (
    'subscription_cancelled',
    'Subscription cancelled',
    'User ' || uid::text || ' cancelled subscription.',
    false
  );
end;
$$;

revoke all on function public.api_my_cancel_subscription() from public;
grant execute on function public.api_my_cancel_subscription() to authenticated;

