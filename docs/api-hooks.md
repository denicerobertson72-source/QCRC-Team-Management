# API Hooks / Queries (V1)

## Get current profile
```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', user.id)
  .single();
```

## List boats for browsing
```ts
const { data: boats } = await supabase
  .from('boats')
  .select('id, name, boat_class_id, boat_type, required_clearance, status, rigging_notes')
  .order('boat_class_id')
  .order('name');
```

## Get eligible boats for a date/time window
```ts
const { data: eligibleBoats } = await supabase.rpc('available_boats_for_window', {
  p_start_time: startIso,
  p_end_time: endIso,
  p_boat_class_id: null,
});
```

## Create reservation
```ts
const { data: reservationId, error } = await supabase.rpc('reserve_boat', {
  p_boat_id: boatId,
  p_start_time: startIso,
  p_end_time: endIso,
  p_checkout_location: 'Main Dock',
  p_notes: null,
  p_crew: crewMemberIds,
});
```

## Checkout / checkin
```ts
await supabase.rpc('checkout_reservation', {
  p_reservation_id: reservationId,
  p_location: 'Main Dock',
});

await supabase.rpc('checkin_reservation', {
  p_reservation_id: reservationId,
  p_notes: 'No issues',
});
```

## Submit damage report with photo paths
Upload files to Storage first, then submit DB metadata.

```ts
const { data: damageId } = await supabase.rpc('submit_damage_report', {
  p_reservation_id: reservationId,
  p_boat_id: boatId,
  p_severity: 3,
  p_description: 'Port rigger loose after outing',
  p_photo_paths: [
    'damage/abc/photo1.jpg',
    'damage/abc/photo2.jpg',
  ],
  p_responsible_member_id: null,
});
```

## Triage / resolve (equipment manager or admin)
```ts
await supabase.rpc('triage_damage_report', {
  p_damage_report_id: damageId,
  p_status: 'resolved',
  p_resolution_notes: 'Replaced bolt and tightened rig',
  p_unlock_boat: true,
  p_labor_cost: 25,
  p_parts_cost: 12,
});
```
