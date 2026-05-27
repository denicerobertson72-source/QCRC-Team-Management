# QCRC Team Management - V1 Setup

## Supabase setup
1. Create a Supabase project.
2. In SQL Editor, run these files in order:
   - `sql/v1/001_schema.sql`
   - `sql/v1/002_rls.sql`
   - `sql/v1/003_rpc.sql`
   - `sql/v1/005_skill_weight_model.sql` (adds skill/weight model + matching rules)
3. Configure Supabase Auth with Email magic link.
4. Create one admin profile row (same `id` as that user's `auth.users.id`) and set `role = 'admin'`.

## Profile bootstrap
`profiles.id` must match `auth.users.id`. Create or upsert the profile right after login.

Example client bootstrap:
```ts
await supabase.from('profiles').upsert({
  id: user.id,
  full_name: user.user_metadata?.full_name ?? 'Unknown Member',
  email: user.email,
}, { onConflict: 'id' });
```

## Storage buckets
Create these private buckets:
- `damage-photos`
- `boat-photos` (optional)

Store `damage_photos.storage_path` as `damage/<damage-report-id>/<filename>`.

## V1 behavior defaults
- Clearance levels: `1..4`
- Boat classes: `1x`, `2x`, `4x`
- Damage auto-lock threshold: `severity >= 3`
- Reservation records are permanent (no delete policy)

## Suggested deployment
- Frontend/API: Vercel + Next.js App Router
- Database/Auth/Storage: Supabase
- Coaching videos (later): store link metadata only (Google Drive / Vimeo / YouTube unlisted)
