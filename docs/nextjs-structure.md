# Next.js Structure (App Router, V1)

## Suggested project layout
```txt
QCRC Team Management/
  app/
    layout.tsx
    page.tsx
    login/page.tsx
    boats/page.tsx
    reserve/page.tsx
    reservations/page.tsx
    damage/new/page.tsx
    admin/
      members/page.tsx
      boats/page.tsx
      clearances/page.tsx
      damage/page.tsx
      analytics/page.tsx
  components/
    BoatCard.tsx
    ReservationActions.tsx
    ReservationForm.tsx
    DamageReportForm.tsx
    MemberClearanceTable.tsx
  lib/
    supabase-browser.ts
    supabase-server.ts
    auth.ts
    permissions.ts
    queries.ts
```

## Page responsibilities
- `/boats`: list/filter boats by class, status, clearance requirement.
- `/reserve`: pick a time window, fetch eligible boats with `available_boats_for_window`, reserve.
- `/reservations`: upcoming/past reservations + one-tap checkout/checkin.
- `/damage/new`: submit incident report with photos.
- `/admin/members`: profile status, dues, waiver state, role.
- `/admin/clearances`: set clearance by member + boat class.
- `/admin/damage`: triage and resolve damage queue.
- `/admin/analytics`: usage, damage, and overdue-return summaries.

## Workflow endpoints
Call these RPCs from Server Actions or Route Handlers:
- `available_boats_for_window`
- `reserve_boat`
- `checkout_reservation`
- `checkin_reservation`
- `submit_damage_report`
- `triage_damage_report`

## Dock adoption tips
- Put QR codes on each boat linking to `/boats/[boatId]`.
- Make checkout/checkin visible on one button per reservation card.
- Require only essential fields at dock; collect detail later in triage.
