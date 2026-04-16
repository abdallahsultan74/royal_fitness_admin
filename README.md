# Royal Fitness Admin

Admin dashboard for managing the Royal Fitness platform.

This project is a React + Vite web app used by administrators to:
- monitor key platform metrics,
- manage users,
- manage exercise content,
- maintain core app settings.

The UI supports both English and Arabic, and can run in:
- **Live mode** (Supabase connected), or
- **Local demo mode** (no backend required).

---

## Tech Stack

- React 18
- Vite 6
- TypeScript
- Tailwind CSS 4
- MUI + Radix UI components
- Supabase (auth + database)
- Firebase Hosting/Rules files (deployment/config support)

---

## Current Modules

- **Dashboard**: user, exercise, and revenue-style overview with activity chart.
- **Exercise Management**: list, filter, create, edit, view, and delete exercises.
- **User Management**: list/search users and update account status.
- **Settings**: update admin-facing app settings.
- **Auth**: admin login flow with protected routes.

The following routes are present as placeholders and currently show **Coming soon**:
- Subscriptions
- Analytics
- Support
- Notifications

---

## Prerequisites

- Node.js 18+ (recommended)
- npm

---

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Update `.env` values (see Environment Variables below).

4. Run the app locally:

```bash
npx vite
```

5. Build for production:

```bash
npm run build
```

---

## Environment Variables

Use `.env.example` as your reference:

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | For live mode | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | For live mode | Supabase anon key |
| `VITE_ADMIN_EMAIL` | Optional | Admin email used for programmatic auth fallback |
| `VITE_ADMIN_PASSWORD` | Optional | Admin password used for programmatic auth fallback |
| `VITE_LOCAL_AUTH` | Optional | Set to `true` to force local demo auth mode |
| `VITE_FIREBASE_API_KEY` | Optional | Legacy/compat placeholder in env template |
| `VITE_FIREBASE_AUTH_DOMAIN` | Optional | Legacy/compat placeholder in env template |
| `VITE_FIREBASE_PROJECT_ID` | Optional | Legacy/compat placeholder in env template |
| `VITE_FIREBASE_STORAGE_BUCKET` | Optional | Legacy/compat placeholder in env template |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Optional | Legacy/compat placeholder in env template |
| `VITE_FIREBASE_APP_ID` | Optional | Legacy/compat placeholder in env template |

If Supabase credentials are missing, the app falls back to local/demo behavior in key areas.

---

## Database Setup (Supabase)

Supabase migration and seed files are available under:
- `supabase/migrations/`
- `supabase/seed.sql`

For setup steps, see:
- [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)

---

## Deployment

The repository includes Firebase configuration files:
- `firebase.json`
- `firestore.rules`
- `storage.rules`

Production build output is generated in `dist/` and used by Firebase Hosting config.

---

## Project Structure

```text
src/
  app/
    components/      # dashboard pages and shared app components
    App.tsx          # app providers + router provider
    routes.tsx       # route definitions
    firebase.ts      # Supabase client/auth helpers
  styles/            # global and theme styles
  main.tsx           # application entry point
```

---

## Notes

- This repository currently exposes only a `build` npm script.
- For local development, use `npx vite` unless a `dev` script is added later.

