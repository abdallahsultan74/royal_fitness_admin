-- Ensure mobile app can always read exercises list.
-- This keeps write operations protected while allowing public/anon reads.

drop policy if exists "exercises_read_authenticated" on public.exercises;
drop policy if exists "exercises_read_public" on public.exercises;

create policy "exercises_read_public"
on public.exercises
for select
to public
using (true);

grant execute on function public.api_list_exercises(text, text, text) to anon, authenticated;
