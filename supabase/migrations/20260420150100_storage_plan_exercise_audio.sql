-- Copied from app repo to keep migration history aligned with remote.
-- Audio files referenced from training plan JSON (admin uploads).

insert into storage.buckets (id, name, public)
values ('plan-exercise-audio', 'plan-exercise-audio', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "plan_exercise_audio_public_read" on storage.objects;
create policy "plan_exercise_audio_public_read"
on storage.objects for select
to public
using (bucket_id = 'plan-exercise-audio');

drop policy if exists "plan_exercise_audio_staff_insert" on storage.objects;
create policy "plan_exercise_audio_staff_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'plan-exercise-audio' and (public.is_admin() or public.is_coach()));

drop policy if exists "plan_exercise_audio_staff_update" on storage.objects;
create policy "plan_exercise_audio_staff_update"
on storage.objects for update
to authenticated
using (bucket_id = 'plan-exercise-audio' and (public.is_admin() or public.is_coach()))
with check (bucket_id = 'plan-exercise-audio' and (public.is_admin() or public.is_coach()));

drop policy if exists "plan_exercise_audio_staff_delete" on storage.objects;
create policy "plan_exercise_audio_staff_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'plan-exercise-audio' and (public.is_admin() or public.is_coach()));

