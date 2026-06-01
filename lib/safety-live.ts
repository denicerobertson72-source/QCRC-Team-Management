import type { SafetyEntry, SafetyLiveMapState, RowingLocationPoint, SafetyTrackedOuting } from "@/lib/types";

type SupabaseLike = {
  from: (table: string) => {
    select: (query: string) => any;
  };
};

export function canManageSafetyMap(role: string | null | undefined) {
  return role === "admin" || role === "coach" || role === "equipment_manager";
}

export async function getSafetyLiveMapState(
  supabase: SupabaseLike,
  userId: string,
  role: string | null | undefined,
  onWater: SafetyEntry[],
): Promise<SafetyLiveMapState> {
  const canManageAllBoats = canManageSafetyMap(role);
  const activeReservations = canManageAllBoats
    ? onWater
    : onWater.filter((entry) => entry.created_by === userId);

  const reservationIds = activeReservations.map((entry) => entry.id);
  if (reservationIds.length === 0) {
    return {
      can_manage_all_boats: canManageAllBoats,
      my_active_reservation_id: null,
      outings: [],
    };
  }

  const cutoffIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const pointsQuery = supabase
    .from("rowing_location_points")
    .select("id, reservation_id, member_id, latitude, longitude, accuracy_meters, recorded_at")
    .in("reservation_id", reservationIds)
    .gte("recorded_at", cutoffIso)
    .order("recorded_at", { ascending: true });
  const { data: pointsData, error: pointsError } = await pointsQuery;
  if (pointsError) throw pointsError;

  const pointsByReservation = new Map<string, RowingLocationPoint[]>();
  for (const point of (pointsData ?? []) as RowingLocationPoint[]) {
    const existing = pointsByReservation.get(point.reservation_id) ?? [];
    existing.push(point);
    pointsByReservation.set(point.reservation_id, existing);
  }

  const outings: SafetyTrackedOuting[] = activeReservations.map((entry) => {
    const trackPoints = pointsByReservation.get(entry.id) ?? [];
    return {
      reservation_id: entry.id,
      member_id: entry.created_by ?? "",
      boat_name: entry.boat_name,
      rower_name: entry.rower_name,
      checked_out_at: entry.checked_out_at,
      checkout_location: entry.checkout_location,
      river_direction: entry.river_direction,
      is_overdue: entry.is_overdue,
      latest_point: trackPoints.at(-1) ?? null,
      track_points: trackPoints,
    };
  });

  return {
    can_manage_all_boats: canManageAllBoats,
    my_active_reservation_id: outings.find((outing) => outing.member_id === userId)?.reservation_id ?? null,
    outings,
  };
}
