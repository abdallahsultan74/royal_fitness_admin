-- Allow users to send messages to staff (admin/coach) and enable safe realtime updates

-- Insert policy: staff can insert any, users can:
-- 1) insert to themselves (local inbox copies), OR
-- 2) send to staff only when type='message' and sender_id=auth.uid().
drop policy if exists "user_notifications_insert_staff" on public.user_notifications;
create policy "user_notifications_insert_staff"
on public.user_notifications for insert
to authenticated
with check (
  public.is_admin()
  or public.is_coach()
  or (
    auth.uid() = sender_id
    and type = 'message'
    and exists (
      select 1
      from public.profiles p
      where p.id = user_id
        and p.role in ('admin', 'coach')
    )
  )
  or (auth.uid() = user_id)
);

-- Users can also read messages they sent (to staff), not only those addressed to them.
drop policy if exists "user_notifications_select_own_or_staff" on public.user_notifications;
create policy "user_notifications_select_own_or_staff"
on public.user_notifications for select
to authenticated
using (
  auth.uid() = user_id
  or auth.uid() = sender_id
  or public.is_admin()
  or public.is_coach()
);

