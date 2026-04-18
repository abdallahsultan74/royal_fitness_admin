-- Fix: user INSERT policy referenced profiles in a subquery, but normal users cannot
-- SELECT other users' profile rows (RLS), so EXISTS(...) was always false → 42501.

create or replace function public.is_staff_user(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target
      and p.status = 'active'
      and p.role in ('admin', 'coach')
  );
$$;

revoke all on function public.is_staff_user(uuid) from public;
grant execute on function public.is_staff_user(uuid) to authenticated;

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
    and public.is_staff_user(user_id)
  )
  or (auth.uid() = user_id)
);
