import type { SafetyEntry, SafetyLiveMapState, RowingLocationPoint, SafetyTrackedOuting } from "@/lib/types";

// At the normal one-minute cadence this provides roughly 90 minutes of route;
// the 15-second movement cadence still keeps a useful recent route bounded.
export const SAFETY_TRACK_POINTS_PER_OUTING = 90;

type SupabaseLike = {
  from: (table: string) => {
    select: (query: string) => any;
  };
  rpc: (functionName: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function getSafetyLiveMapState(
  supabase: SupabaseLike,
  userId: string,
  onWater: SafetyEntry[],
): Promise<SafetyLiveMapState> {
  const activeReservations = onWater;

  const reservationIds = activeReservations.map((entry) => entry.id);
  if (reservationIds.length === 0) {
    return {
      my_active_outing_id: null,
      on_water: [],
      outings: [],
    };
  }

  const reservationIdsByKind = {
    reservation: activeReservations.filter((entry) => entry.outing_kind === "reservation").map((entry) => entry.id),
    private_boat: activeReservations.filter((entry) => entry.outing_kind === "private_boat").map((entry) => entry.id),
  };
  const { data: pointData, error: pointError } = await supabase.rpc("get_safety_location_points", {
    p_reservation_ids: reservationIdsByKind.reservation,
    p_private_outing_ids: reservationIdsByKind.private_boat,
    p_max_points_per_outing: SAFETY_TRACK_POINTS_PER_OUTING,
  });
  if (pointError) throw pointError;

  const pointsByReservation = new Map<string, RowingLocationPoint[]>();
  for (const point of (pointData ?? []) as RowingLocationPoint[]) {
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
    my_active_outing_id: outings.find((outing) => outing.member_id === userId)?.outing_id ?? null,
    on_water: activeReservations,
    outings,
  };
}
