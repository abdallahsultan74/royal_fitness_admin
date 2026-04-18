-- APIs for the mobile app:
-- 1) api_my_active_plan: return latest active assignment + plan JSON.
-- 2) api_challenge_details: return template + day list.

drop function if exists public.api_my_active_plan();
create function public.api_my_active_plan()
returns table (
  assignment_id uuid,
  plan_id uuid,
  title text,
  description text,
  level text,
  duration_weeks integer,
  json_plan jsonb,
  starts_at date,
  ends_at date,
  status text,
  assigned_by uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pa.id,
    tp.id,
    tp.title,
    tp.description,
    tp.level,
    tp.duration_weeks,
    tp.json_plan,
    pa.starts_at,
    pa.ends_at,
    pa.status,
    pa.assigned_by,
    pa.created_at
  from public.plan_assignments pa
  join public.training_plans tp
    on tp.id = pa.plan_id
  where pa.user_id = auth.uid()
    and pa.status = 'active'
  order by pa.created_at desc
  limit 1;
$$;

grant execute on function public.api_my_active_plan() to authenticated;

drop function if exists public.api_challenge_details(uuid);
create function public.api_challenge_details(challenge_id uuid)
returns table (
  challenge_id uuid,
  slug text,
  title text,
  title_ar text,
  description text,
  description_ar text,
  level text,
  days_count integer,
  day_number integer,
  day_title text,
  day_title_ar text,
  target_minutes integer,
  target_exercises integer,
  target_calories integer,
  notes text,
  notes_ar text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ct.id,
    ct.slug,
    ct.title,
    ct.title_ar,
    ct.description,
    ct.description_ar,
    ct.level,
    ct.days_count,
    d.day_number,
    d.title,
    d.title_ar,
    d.target_minutes,
    d.target_exercises,
    d.target_calories,
    d.notes,
    d.notes_ar
  from public.challenge_templates ct
  left join public.challenge_template_days d
    on d.challenge_id = ct.id
  where ct.id = api_challenge_details.challenge_id
  order by d.day_number asc;
$$;

grant execute on function public.api_challenge_details(uuid) to authenticated;

