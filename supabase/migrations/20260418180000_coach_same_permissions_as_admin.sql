-- Coaches get the same RLS access as admins for panel operations.
-- Creating staff accounts remains admin-only (Edge Function checks is_admin()).

-- ========== profiles ==========
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff"
on public.profiles for select
to authenticated
using (auth.uid() = id or public.is_admin() or public.is_coach());

drop policy if exists "profiles_insert_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own_or_staff" on public.profiles;
create policy "profiles_insert_own_or_staff"
on public.profiles for insert
to authenticated
with check (auth.uid() = id or public.is_admin() or public.is_coach());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_staff" on public.profiles;
create policy "profiles_update_own_or_staff"
on public.profiles for update
to authenticated
using (auth.uid() = id or public.is_admin() or public.is_coach())
with check (auth.uid() = id or public.is_admin() or public.is_coach());

-- ========== exercises ==========
drop policy if exists "exercises_write_admin" on public.exercises;
drop policy if exists "exercises_write_authenticated" on public.exercises;
drop policy if exists "exercises_write_staff" on public.exercises;
create policy "exercises_write_staff"
on public.exercises for all
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

-- ========== workout_sessions ==========
drop policy if exists "sessions_select_own_or_admin" on public.workout_sessions;
create policy "sessions_select_own_or_staff"
on public.workout_sessions for select
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "sessions_insert_own_or_admin" on public.workout_sessions;
create policy "sessions_insert_own_or_staff"
on public.workout_sessions for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "sessions_update_own_or_admin" on public.workout_sessions;
create policy "sessions_update_own_or_staff"
on public.workout_sessions for update
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach())
with check (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "sessions_delete_admin_only" on public.workout_sessions;
create policy "sessions_delete_staff"
on public.workout_sessions for delete
to authenticated
using (public.is_admin() or public.is_coach());

-- ========== workout_session_items ==========
drop policy if exists "session_items_select_own_or_admin" on public.workout_session_items;
create policy "session_items_select_own_or_staff"
on public.workout_session_items for select
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and (ws.user_id = auth.uid() or public.is_admin() or public.is_coach())
  )
);

drop policy if exists "session_items_insert_own_or_admin" on public.workout_session_items;
create policy "session_items_insert_own_or_staff"
on public.workout_session_items for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and (ws.user_id = auth.uid() or public.is_admin() or public.is_coach())
  )
);

drop policy if exists "session_items_update_own_or_admin" on public.workout_session_items;
create policy "session_items_update_own_or_staff"
on public.workout_session_items for update
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and (ws.user_id = auth.uid() or public.is_admin() or public.is_coach())
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and (ws.user_id = auth.uid() or public.is_admin() or public.is_coach())
  )
);

drop policy if exists "session_items_delete_admin_only" on public.workout_session_items;
create policy "session_items_delete_staff"
on public.workout_session_items for delete
to authenticated
using (public.is_admin() or public.is_coach());

-- ========== daily_stats ==========
drop policy if exists "daily_stats_select_own_or_admin" on public.daily_stats;
create policy "daily_stats_select_own_or_staff"
on public.daily_stats for select
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "daily_stats_insert_own_or_admin" on public.daily_stats;
create policy "daily_stats_insert_own_or_staff"
on public.daily_stats for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "daily_stats_update_own_or_admin" on public.daily_stats;
create policy "daily_stats_update_own_or_staff"
on public.daily_stats for update
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach())
with check (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "daily_stats_delete_admin_only" on public.daily_stats;
create policy "daily_stats_delete_staff"
on public.daily_stats for delete
to authenticated
using (public.is_admin() or public.is_coach());

-- ========== subscription_requests ==========
drop policy if exists "subscription_requests_select_own_or_admin" on public.subscription_requests;
create policy "subscription_requests_select_own_or_staff"
on public.subscription_requests for select
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "subscription_requests_insert_own_or_admin" on public.subscription_requests;
create policy "subscription_requests_insert_own_or_staff"
on public.subscription_requests for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "subscription_requests_update_admin_only" on public.subscription_requests;
create policy "subscription_requests_update_staff"
on public.subscription_requests for update
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

-- ========== storage exercise-gifs ==========
drop policy if exists "exercise_gifs_admin_insert" on storage.objects;
drop policy if exists "exercise_gifs_authenticated_insert" on storage.objects;
drop policy if exists "exercise_gifs_staff_insert" on storage.objects;
create policy "exercise_gifs_staff_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'exercise-gifs' and (public.is_admin() or public.is_coach()));

drop policy if exists "exercise_gifs_admin_update" on storage.objects;
drop policy if exists "exercise_gifs_authenticated_update" on storage.objects;
drop policy if exists "exercise_gifs_staff_update" on storage.objects;
create policy "exercise_gifs_staff_update"
on storage.objects for update
to authenticated
using (bucket_id = 'exercise-gifs' and (public.is_admin() or public.is_coach()))
with check (bucket_id = 'exercise-gifs' and (public.is_admin() or public.is_coach()));

drop policy if exists "exercise_gifs_admin_delete" on storage.objects;
drop policy if exists "exercise_gifs_authenticated_delete" on storage.objects;
drop policy if exists "exercise_gifs_staff_delete" on storage.objects;
create policy "exercise_gifs_staff_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'exercise-gifs' and (public.is_admin() or public.is_coach()));

-- ========== weight_logs & challenges (from weight_bmi migration) ==========
drop policy if exists "weight_logs_select_own_or_admin" on public.weight_logs;
create policy "weight_logs_select_own_or_staff"
on public.weight_logs for select
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "weight_logs_insert_own_or_admin" on public.weight_logs;
create policy "weight_logs_insert_own_or_staff"
on public.weight_logs for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "weight_logs_update_own_or_admin" on public.weight_logs;
create policy "weight_logs_update_own_or_staff"
on public.weight_logs for update
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach())
with check (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "challenge_templates_read_authenticated" on public.challenge_templates;
create policy "challenge_templates_read_authenticated"
on public.challenge_templates for select
to authenticated
using (is_active = true or public.is_admin() or public.is_coach());

drop policy if exists "challenge_templates_write_admin" on public.challenge_templates;
create policy "challenge_templates_write_staff"
on public.challenge_templates for all
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

drop policy if exists "challenge_template_days_read_authenticated" on public.challenge_template_days;
create policy "challenge_template_days_read_authenticated"
on public.challenge_template_days for select
to authenticated
using (
  exists (
    select 1
    from public.challenge_templates ct
    where ct.id = challenge_id
      and (ct.is_active = true or public.is_admin() or public.is_coach())
  )
);

drop policy if exists "challenge_template_days_write_admin" on public.challenge_template_days;
create policy "challenge_template_days_write_staff"
on public.challenge_template_days for all
to authenticated
using (public.is_admin() or public.is_coach())
with check (public.is_admin() or public.is_coach());

drop policy if exists "user_challenges_select_own_or_admin" on public.user_challenges;
create policy "user_challenges_select_own_or_staff"
on public.user_challenges for select
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "user_challenges_insert_own_or_admin" on public.user_challenges;
create policy "user_challenges_insert_own_or_staff"
on public.user_challenges for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "user_challenges_update_own_or_admin" on public.user_challenges;
create policy "user_challenges_update_own_or_staff"
on public.user_challenges for update
to authenticated
using (auth.uid() = user_id or public.is_admin() or public.is_coach())
with check (auth.uid() = user_id or public.is_admin() or public.is_coach());

drop policy if exists "user_challenge_days_select_owner_or_admin" on public.user_challenge_days;
create policy "user_challenge_days_select_owner_or_staff"
on public.user_challenge_days for select
to authenticated
using (
  exists (
    select 1
    from public.user_challenges uc
    where uc.id = user_challenge_id
      and (uc.user_id = auth.uid() or public.is_admin() or public.is_coach())
  )
);

drop policy if exists "user_challenge_days_update_owner_or_admin" on public.user_challenge_days;
create policy "user_challenge_days_update_owner_or_staff"
on public.user_challenge_days for update
to authenticated
using (
  exists (
    select 1
    from public.user_challenges uc
    where uc.id = user_challenge_id
      and (uc.user_id = auth.uid() or public.is_admin() or public.is_coach())
  )
)
with check (
  exists (
    select 1
    from public.user_challenges uc
    where uc.id = user_challenge_id
      and (uc.user_id = auth.uid() or public.is_admin() or public.is_coach())
  )
);
