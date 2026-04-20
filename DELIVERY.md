# Delivery Checklist (Royal Fitness Admin)

This document is a lightweight handover checklist for the **admin dashboard** project:
- `royal_fitness_admin/` (React + Vite)

For the mobile app handover, see:
- `../royal_fitness_app/DELIVERY.md`

---

## 1) What you are receiving

Royal Fitness Admin is a web-based dashboard for staff (admin + coach roles) to manage the platform:
- live dashboard metrics backed by Supabase RPCs
- user management (including delete flows)
- subscription requests + staff-defined subscription pricing
- exercises content management
- challenges/plans management
- analytics reports and exports (charts, CSV/PDF)

Primary docs:
- `README.md`
- `SUPABASE_SETUP.md`

---

## 2) Prerequisites

- Node.js 18+ (recommended)
- npm

---

## 3) Supabase (shared backend)

This dashboard is designed to connect to the same Supabase backend used by the mobile app.

Migrations and seed files:
- `supabase/migrations/`
- `supabase/seed.sql`

Setup instructions:
- `SUPABASE_SETUP.md`

Security rule:
- Never ship `service_role` keys in the admin web app. Use Edge Functions / trusted server-side contexts for privileged actions.

---

## 4) Run locally (quick start)

From `royal_fitness_admin/`:

```bash
npm install
cp .env.example .env
npx vite
```

Required `.env` values for live mode:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional:
- `VITE_LOCAL_AUTH=true` to force local/demo mode

---

## 5) Quality check

```bash
npm run build
```

Build output is created under `dist/`.

---

## 6) Deployment

### Vercel

Deploy as a standard Vite app:
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### GitHub Pages (optional)

See `README.md` for the GitHub Actions workflow and required secrets.

---

## 7) Final handover checklist

- [ ] Supabase project is accessible and migrations are applied
- [ ] `.env` is configured for live mode
- [ ] Staff login works (admin/coach)
- [ ] `npm run build` passes on a clean machine
- [ ] Deployment target is configured (Vercel or GitHub Pages)

