# Royal Fitness Admin

Web-based admin dashboard for managing the Royal Fitness platform (users, subscriptions, exercises, challenges, plans, analytics, and notifications).

## Highlights

- Bilingual UI (English / Arabic)
- Staff-only access (admin + coach roles via Supabase)
- Live metrics backed by Supabase RPCs (no fake numbers)
- Subscription pricing managed by staff and reflected in revenue analytics
- Safe user deletion flows (soft delete via RPC + optional permanent delete via Edge Function)

## Tech stack

- React 18 + TypeScript
- Vite 6
- Tailwind CSS
- Supabase (`@supabase/supabase-js`) for auth + database + RPC
- Recharts for charts, jsPDF for exports (Analytics page)

## Prerequisites

- Node.js 18+ (recommended)
- npm

## Setup

1) Install dependencies:

```bash
npm install
```

2) Create `.env` from the template and set values:

```bash
cp .env.example .env
```

Required for live mode:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional (useful for demo/testing):
- `VITE_LOCAL_AUTH=true` to force local/demo mode

## Run locally

```bash
npx vite
```

## Build for production

```bash
npm run build
```

Build output is created under `dist/`.

## Database setup (Supabase)

Migrations and seed files live in:
- `supabase/migrations/`
- `supabase/seed.sql`

Setup guide:
- [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)

## Deployment

### Vercel

This project can be deployed as a standard Vite app. Configure the same environment variables used locally (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the Vercel project settings.

### GitHub Pages (via Actions)

Workflow:
- [`.github/workflows/deploy-github-pages.yml`](./.github/workflows/deploy-github-pages.yml)

Steps:
1) GitHub → Settings → Pages → Build and deployment → Source: GitHub Actions
2) GitHub → Settings → Secrets and variables → Actions → add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3) Push to `main`. The site will be published under:
   - `https://<account>.github.io/royal_fitness_admin/`

### Firebase hosting (optional)

Firebase configuration files are included:
- `firebase.json`
- `firestore.rules`
- `storage.rules`

If you use Firebase Hosting, deploy the `dist/` output.

## Project structure

```text
src/
  app/
    components/      # pages + shared components
    App.tsx          # providers + router
    routes.tsx       # route definitions
    firebase.ts      # Supabase helpers (historical name)
  styles/
  main.tsx
```
