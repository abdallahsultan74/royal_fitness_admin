# Supabase Setup (Free Plan)

This project ships with a complete Supabase database setup (schema + RLS + seed) under:

- `supabase/migrations/20260415111000_init_royal_fitness.sql`
- `supabase/seed.sql`

## 1) Login to the Supabase CLI

```bash
npx supabase login
```

Alternative (non-interactive) login using an access token:

```bash
set SUPABASE_ACCESS_TOKEN=YOUR_TOKEN
```

## 2) Link the project to your Supabase project

```bash
npx supabase link --project-ref thndmcqsjoejqnvfbnto
```

## 3) Apply database schema + policies

```bash
npx supabase db push
```

## 4) (Optional) Load seed data

```bash
npx supabase db reset
```

> `db reset` recreates the database (local or linked, depending on context). Use it carefully if you already have data.

## Core tables (high level)

- `public.profiles`
- `public.exercises`
- `public.workout_sessions`
- `public.workout_session_items`
- `public.daily_stats`

## Security model (RLS overview)

- Standard users can access only their own data (`auth.uid()`).
- Admin/staff capabilities are enforced via role/claims and security-definer RPCs where appropriate.
- `exercises` are readable by authenticated users; write access is restricted to staff.

## Important note

Never ship the `service_role` key in the Flutter app or the React admin panel. Use it only in secure server-side contexts (Edge Functions / trusted scripts).
