-- Provide a safe, RLS-bypassing way for normal users to list staff (admin/coach)
-- Needed because profiles select policy is own-only for authenticated users.

create or replace function public.list_staff_recipients()
returns table (
  id uuid,
  name text,
  email text,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.email, p.role
  from public.profiles p
  where p.status = 'active'
    and p.role in ('admin', 'coach')
  order by case when p.role = 'admin' then 0 else 1 end, p.created_at desc
  limit 200;
$$;

revoke all on function public.list_staff_recipients() from public;
grant execute on function public.list_staff_recipients() to authenticated;

