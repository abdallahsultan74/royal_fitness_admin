create unique index if not exists idx_exercises_legacy_id_unique
on public.exercises(legacy_id)
where legacy_id is not null;

insert into storage.buckets (id, name, public)
values ('exercise-gifs', 'exercise-gifs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "exercise_gifs_public_read" on storage.objects;
create policy "exercise_gifs_public_read"
on storage.objects for select
to public
using (bucket_id = 'exercise-gifs');

drop policy if exists "exercise_gifs_admin_insert" on storage.objects;
create policy "exercise_gifs_admin_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'exercise-gifs' and public.is_admin());

drop policy if exists "exercise_gifs_admin_update" on storage.objects;
create policy "exercise_gifs_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'exercise-gifs' and public.is_admin())
with check (bucket_id = 'exercise-gifs' and public.is_admin());

drop policy if exists "exercise_gifs_admin_delete" on storage.objects;
create policy "exercise_gifs_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'exercise-gifs' and public.is_admin());

create or replace function public.api_list_exercises(
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
    e.image_asset_path as image_url,
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
