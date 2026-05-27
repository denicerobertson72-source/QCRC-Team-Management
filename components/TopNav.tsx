import Link from "next/link";
import { signOutAction } from "@/lib/actions";
import { Button } from "@/components/ui/Button";
import { ensureProfile } from "@/lib/auth";
import { GlobalOverdueAlert } from "@/components/ui/GlobalOverdueAlert";
import { GlobalReservationAlert } from "@/components/ui/GlobalReservationAlert";
import type { OverdueBoatAlert } from "@/lib/types";
import { getUnreadNotificationCount } from "@/lib/queries";

export async function TopNav() {
  const { supabase, user } = await ensureProfile();
  const [{ data }, overdueResult, reservationAlertResult, unreadNotificationCount] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.rpc("overdue_boat_summary"),
    supabase
      .from("reservations")
      .select("id, start_time, boats(name,status)")
      .eq("created_by", user.id)
      .eq("status", "reserved")
      .gte("start_time", new Date().toISOString()),
    getUnreadNotificationCount(),
  ]);
  const isAdmin = data?.role === "admin";
  const overdueBoats = (Array.isArray(overdueResult.data) ? overdueResult.data : []) as OverdueBoatAlert[];
  const reservationAlerts = (reservationAlertResult.data ?? [])
    .map((row: any) => ({
      boatName: (Array.isArray(row.boats) ? row.boats[0] : row.boats)?.name ?? row.id,
      boatStatus: (Array.isArray(row.boats) ? row.boats[0] : row.boats)?.status ?? "available",
      startTime: row.start_time,
    }))
    .filter((row) => row.boatStatus !== "available");

  return (
    <>
      <GlobalReservationAlert alerts={reservationAlerts.map(({ boatName, startTime }) => ({ boatName, startTime }))} />
      <GlobalOverdueAlert count={overdueBoats.length} boatNames={overdueBoats.map((boat) => boat.boat_name)} />
      <header className="topnav">
        <nav>
          <div className="topnav-home">
            <img src="/QCRC.png" alt="QCRC" className="topnav-logo topnav-logo-plain" />
            <Link href="/reservations">Reservations</Link>
          </div>
          <Link href="/reserve">Reserve</Link>
          <Link href="/safety">Safety</Link>
          <Link href="/programs">Programs</Link>
          <Link href="/lineups">Lineups</Link>
          <Link href="/notifications">Notifications{unreadNotificationCount > 0 ? ` (${unreadNotificationCount})` : ""}</Link>
          <Link href="/boats">Boats</Link>
          <Link href="/damage/new">Damage</Link>
          {isAdmin ? <Link href="/admin">Admin</Link> : null}
          <Link href="/account/security">Security</Link>
        </nav>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary">
            Sign Out
          </Button>
        </form>
      </header>
    </>
  );
}
