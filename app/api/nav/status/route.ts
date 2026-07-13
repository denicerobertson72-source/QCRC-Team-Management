import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function notificationCutoffIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoffIso = notificationCutoffIso();
  const [reservationResult, overdueResult, notificationResult] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, boats(name,status)")
      .eq("created_by", user.id)
      .eq("status", "reserved")
      .gte("start_time", new Date().toISOString()),
    supabase.rpc("overdue_boat_alert_summary"),
    supabase
      .from("notification_events")
      .select("*", { count: "exact", head: true })
      .eq("member_id", user.id)
      .gte("sent_at", cutoffIso)
      .is("read_at", null),
  ]);

  if (reservationResult.error) {
    return NextResponse.json({ error: reservationResult.error.message }, { status: 500 });
  }
  if (overdueResult.error) {
    return NextResponse.json({ error: overdueResult.error.message }, { status: 500 });
  }
  if (notificationResult.error) {
    return NextResponse.json({ error: notificationResult.error.message }, { status: 500 });
  }

  const reservationAlerts = (reservationResult.data ?? [])
    .map((row: any) => ({
      boatName: (Array.isArray(row.boats) ? row.boats[0] : row.boats)?.name ?? row.id,
      boatStatus: (Array.isArray(row.boats) ? row.boats[0] : row.boats)?.status ?? "available",
    }))
    .filter((row) => row.boatStatus !== "available");
  const overdueSummary = ((overdueResult.data ?? [])[0] ?? null) as
    | { overdue_count?: number | string | null; first_boat_name?: string | null }
    | null;

  return NextResponse.json({
    reservation_alert_count: reservationAlerts.length,
    first_reservation_boat_name: reservationAlerts[0]?.boatName ?? null,
    overdue_count: Number(overdueSummary?.overdue_count ?? 0),
    first_overdue_boat_name: overdueSummary?.first_boat_name ?? null,
    unread_notification_count: notificationResult.count ?? 0,
  });
}
