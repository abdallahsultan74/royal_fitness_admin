-- Fix ambiguity: a 3-arg function with a default makes 2-arg calls ambiguous.

create or replace function public.profile_coach_content_entitled(
  plan_tier text,
  plan_expires_at timestamptz,
  subscription_package_id uuid
) returns boolean
language sql
stable
as $$
  select
    (
      subscription_package_id is not null
      or lower(trim(coalesce(plan_tier, 'basic'))) in ('pro', 'premium', 'royal', 'elite')
    )
    and (
      plan_expires_at is null
      or plan_expires_at > timezone('utc', now())
    );
$$;

create or replace function public.profile_coach_content_entitled(
  plan_tier text,
  plan_expires_at timestamptz
) returns boolean
language sql
stable
as $$
  select public.profile_coach_content_entitled(plan_tier, plan_expires_at, null::uuid);
$$;

