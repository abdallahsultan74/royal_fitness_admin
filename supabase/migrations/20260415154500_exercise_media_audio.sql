alter table public.exercises
  add column if not exists media_url text,
  add column if not exists media_type text check (media_type in ('image', 'video')),
  add column if not exists audio_url text;

insert into storage.buckets (id, name, public)
values ('exercise-media', 'exercise-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "exercise_media_public_read" on storage.objects;
create policy "exercise_media_public_read"
on storage.objects for select
to public
using (bucket_id = 'exercise-media');

drop policy if exists "exercise_media_authenticated_insert" on storage.objects;
create policy "exercise_media_authenticated_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'exercise-media');

drop policy if exists "exercise_media_authenticated_update" on storage.objects;
create policy "exercise_media_authenticated_update"
on storage.objects for update
to authenticated
using (bucket_id = 'exercise-media')
with check (bucket_id = 'exercise-media');

drop policy if exists "exercise_media_authenticated_delete" on storage.objects;
create policy "exercise_media_authenticated_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'exercise-media');

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
  order by e.name asc;
$$;
