drop index if exists public.idx_exercises_legacy_id_unique;

create unique index if not exists idx_exercises_legacy_id_unique_full
on public.exercises(legacy_id);

drop policy if exists "exercise_gifs_admin_insert" on storage.objects;
drop policy if exists "exercise_gifs_admin_update" on storage.objects;
drop policy if exists "exercise_gifs_admin_delete" on storage.objects;

create policy "exercise_gifs_authenticated_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'exercise-gifs');

create policy "exercise_gifs_authenticated_update"
on storage.objects for update
to authenticated
using (bucket_id = 'exercise-gifs')
with check (bucket_id = 'exercise-gifs');

create policy "exercise_gifs_authenticated_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'exercise-gifs');

drop policy if exists "exercises_write_admin" on public.exercises;
create policy "exercises_write_authenticated"
on public.exercises for all
to authenticated
using (true)
with check (true);
