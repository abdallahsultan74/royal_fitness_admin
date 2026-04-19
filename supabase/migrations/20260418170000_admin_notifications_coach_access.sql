-- Coaches can manage the admin notifications inbox (same as admins), but user creation stays admin-only in app logic.

drop policy if exists "admin_notifications_select_admin_only" on public.admin_notifications;
drop policy if exists "admin_notifications_select_staff" on public.admin_notifications;
create policy "admin_notifications_select_staff"
on public.admin_notifications for select
to authenticated
using (public.is_admin() or public.is_coach());

drop policy if exists "admin_notifications_update_admin_only" on public.admin_notifications;
drop policy if exists "admin_notifications_update_staff" on public.admin_notifications;
create policy "admin_notifications_update_staff"
on public.admin_notifications for update
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

drop policy if exists "admin_notifications_insert_admin_only" on public.admin_notifications;
drop policy if exists "admin_notifications_insert_staff" on public.admin_notifications;
create policy "admin_notifications_insert_staff"
on public.admin_notifications for insert
to authenticated
with check (public.is_admin() or public.is_coach());
