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
      my_active_outing_id: null,
      outings: [],
    };
  }

  const cutoffIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const reservationIdsByKind = {
    reservation: activeReservations.filter((entry) => entry.outing_kind === "reservation").map((entry) => entry.id),
    private_boat: activeReservations.filter((entry) => entry.outing_kind === "private_boat").map((entry) => entry.id),
  };
  const pointQueries = await Promise.all([
    reservationIdsByKind.reservation.length > 0
      ? supabase
          .from("rowing_location_points")
          .select("id, reservation_id, private_outing_id, member_id, latitude, longitude, accuracy_meters, recorded_at")
          .in("reservation_id", reservationIdsByKind.reservation)
          .gte("recorded_at", cutoffIso)
          .order("recorded_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    reservationIdsByKind.private_boat.length > 0
      ? supabase
          .from("rowing_location_points")
          .select("id, reservation_id, private_outing_id, member_id, latitude, longitude, accuracy_meters, recorded_at")
          .in("private_outing_id", reservationIdsByKind.private_boat)
          .gte("recorded_at", cutoffIso)
          .order("recorded_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const [reservationPoints, privateBoatPoints] = pointQueries;
  if (reservationPoints.error) throw reservationPoints.error;
  if (privateBoatPoints.error) throw privateBoatPoints.error;

  const pointsByReservation = new Map<string, RowingLocationPoint[]>();
  for (const point of [...((reservationPoints.data ?? []) as RowingLocationPoint[]), ...((privateBoatPoints.data ?? []) as RowingLocationPoint[])]) {
    const pointId = point.reservation_id ?? point.private_outing_id;
    if (!pointId) continue;
    const existing = pointsByReservation.get(pointId) ?? [];
    existing.push(point);
    pointsByReservation.set(pointId, existing);
  }

  const outings: SafetyTrackedOuting[] = activeReservations.map((entry) => {
    const trackPoints = pointsByReservation.get(entry.id) ?? [];
    return {
      outing_id: entry.id,
      outing_kind: entry.outing_kind,
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
    my_active_outing_id: outings.find((outing) => outing.member_id === userId)?.outing_id ?? null,
    outings,
  };
}
