-- Expose challenge cover image on active-challenge RPC for home / banners.
create or replace function public.api_my_active_challenge()
returns table (
  user_challenge_id uuid,
  challenge_id uuid,
  slug text,
  title text,
  title_ar text,
  level text,
  days_count integer,
  current_day integer,
  completed_days integer,
  progress_percent numeric,
  status text,
  cover_image_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    uc.id,
    ct.id,
    ct.slug,
    ct.title,
    ct.title_ar,
    ct.level,
    ct.days_count,
    uc.current_day,
    uc.completed_days,
    uc.progress_percent,
    uc.status,
    ct.cover_image_url
  from public.user_challenges uc
  join public.challenge_templates ct
    on ct.id = uc.challenge_id
  where uc.user_id = auth.uid()
    and uc.status in ('active', 'completed')
  order by uc.started_at desc
  limit 1;
$$;
