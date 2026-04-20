-- Copied from app repo to keep migration history aligned with remote.
-- Public bucket for challenge cover images (admin panel uploads → app CachedNetworkImage).

insert into storage.buckets (id, name, public)
values ('challenge-covers', 'challenge-covers', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "challenge_covers_public_read" on storage.objects;
create policy "challenge_covers_public_read"
on storage.objects for select
to public
using (bucket_id = 'challenge-covers');

drop policy if exists "challenge_covers_staff_insert" on storage.objects;
create policy "challenge_covers_staff_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'challenge-covers' and (public.is_admin() or public.is_coach()));

drop policy if exists "challenge_covers_staff_update" on storage.objects;
create policy "challenge_covers_staff_update"
on storage.objects for update
to authenticated
using (bucket_id = 'challenge-covers' and (public.is_admin() or public.is_coach()))
with check (bucket_id = 'challenge-covers' and (public.is_admin() or public.is_coach()));

drop policy if exists "challenge_covers_staff_delete" on storage.objects;
create policy "challenge_covers_staff_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'challenge-covers' and (public.is_admin() or public.is_coach()));

