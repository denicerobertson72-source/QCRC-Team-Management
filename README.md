# QCRC Team Management (V1 App Skeleton)

Next.js + Supabase app scaffold for rowing reservations, checkout/checkin, and damage reporting.

## Prereqs
- Node 20+
- Supabase project with SQL already applied (`sql/v1/001..003`)
  - Skill/weight model extension: `sql/v1/005_skill_weight_model.sql`
  - Optional seed/setup helper: `sql/v1/004_seed.sql`

## Environment
Copy `.env.example` to `.env.local` and fill values:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` for local development, such as `http://localhost:3000`

For production email delivery, also configure:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `APP_URL`

See [docs/email-delivery-setup.md](/Users/robertsonde/Documents/New%20project/Coding%20Projects/QCRC%20Team%20Management/docs/email-delivery-setup.md) for the production email setup.

## Install + run
```bash
npm install
npm run dev
```

## Implemented routes
- `/login`
- `/boats`
- `/reserve`
- `/reservations`
- `/damage/new`
- `/admin/members`
- `/admin/boats`
- `/admin/clearances`
- `/admin/damage`
- `/admin/analytics`

## Core RPCs wired
- `available_boats_for_window`
- `reserve_boat`
- `checkout_reservation`
- `checkin_reservation`
- `submit_damage_report`
