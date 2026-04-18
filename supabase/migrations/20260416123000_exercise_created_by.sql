alter table public.exercises
  add column if not exists created_by text not null default 'app'
  check (created_by in ('app', 'trainer', 'admin'));

create index if not exists idx_exercises_created_by on public.exercises(created_by);

update public.exercises
set created_by = case
  when lower(coalesce(source, 'app')) = 'admin' then 'trainer'
  else 'app'
end
where created_by is null or created_by = '';

drop function if exists public.api_list_exercises(text, text, text);

create function public.api_list_exercises(
  lang text default 'en',
  kind text default null,
  search_query text default null
)
returns table (
  id uuid,
  legacy_id text,
  name text,
  name_ar text,
  display_name text,
  type text,
  target text,
  equipment text,
  level text,
  minutes integer,
  calories integer,
  image_url text,
  media_url text,
  media_type text,
  audio_url text,
  tts_script text,
  tts_script_ar text,
  created_by text,
  exercise_steps integer,
  rating numeric,
  instructions jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.legacy_id,
    e.name,
    e.name_ar,
    case when lower(coalesce(lang, 'en')) = 'ar' then coalesce(e.name_ar, e.name) else e.name end as display_name,
    e.type,
    e.target,
    e.equipment,
    e.level,
    e.minutes,
    e.calories,
    coalesce(e.media_url, e.image_asset_path) as image_url,
    e.media_url,
    e.media_type,
    e.audio_url,
    e.tts_script,
    e.tts_script_ar,
    e.created_by,
    e.exercise_steps,
    e.rating,
    e.instructions
  from public.exercises e
  where
    (kind is null or kind = '' or e.type = kind)
    and (
      search_query is null
      or search_query = ''
      or e.name ilike ('%' || search_query || '%')
      or coalesce(e.name_ar, '') ilike ('%' || search_query || '%')
      or coalesce(e.target, '') ilike ('%' || search_query || '%')
    )
  order by
    case when e.created_by = 'trainer' then 0 else 1 end,
    e.created_at desc,
    e.name asc;
$$;
