-- Keep migration history aligned with the mobile app:
-- Apply subscription effects automatically when a request is approved.

create or replace function public.apply_subscription_request_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if (old.status is distinct from new.status) and lower(coalesce(new.status, '')) = 'approved' then
    if lower(coalesce(new.request_kind, '')) = 'cancel' then
      perform public.api_staff_revoke_user_package(new.user_id);
    else
      if new.variant_id is not null then
        perform public.api_staff_assign_user_package(new.user_id, new.variant_id);
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_subscription_request_on_approval on public.subscription_requests;
create trigger trg_apply_subscription_request_on_approval
after update of status on public.subscription_requests
for each row
execute function public.apply_subscription_request_on_approval();

do $$
declare
  r record;
begin
  for r in
    select distinct on (sr.user_id)
      sr.user_id, sr.request_kind, sr.variant_id
    from public.subscription_requests sr
    where sr.status = 'approved'
    order by sr.user_id, sr.approved_at desc nulls last, sr.created_at desc
  loop
    if lower(coalesce(r.request_kind, '')) = 'cancel' then
      perform public.api_staff_revoke_user_package(r.user_id);
    else
      if r.variant_id is not null then
        perform public.api_staff_assign_user_package(r.user_id, r.variant_id);
      end if;
    end if;
  end loop;
end;
$$;

