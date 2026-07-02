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
  const unreadBadgeLabel = unreadNotificationCount > 99 ? "99+" : String(unreadNotificationCount);
  const navLinks = [
    { href: "/", label: "Home", home: true },
    { href: "/reservations", label: "Reservations" },
    { href: "/reserve", label: "Reserve" },
    { href: "/safety", label: "Safety" },
    { href: "/programs/meetup", label: "Rowing Meetup" },
    { href: "/programs", label: "Programs" },
    { href: "/lineups", label: "Lineups" },
    { href: "/notifications", label: "Notifications", badge: unreadNotificationCount > 0 ? unreadBadgeLabel : null },
    { href: "/boats", label: "Boats" },
    { href: "/damage/new", label: "Damage" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
    { href: "/account/security", label: "Account Setting" },
  ];

  return (
    <>
      <GlobalReservationAlert alerts={reservationAlerts.map(({ boatName, startTime }) => ({ boatName, startTime }))} />
      <GlobalOverdueAlert count={overdueBoats.length} boatNames={overdueBoats.map((boat) => boat.boat_name)} />
      <header className="topnav">
        <div className="topnav-home">
          <img src="/QCRC.png" alt="QCRC" className="topnav-logo topnav-logo-plain" />
          <Link href="/">Home</Link>
        </div>
        <details className="topnav-menu">
          <summary className="topnav-menu-trigger" aria-label="Open navigation menu">
            <span />
            <span />
            <span />
          </summary>
          <div className="topnav-menu-backdrop" />
          <div className="topnav-menu-panel">
            <div className="topnav-menu-header">
              <div className="topnav-home">
                <img src="/QCRC.png" alt="QCRC" className="topnav-logo topnav-logo-plain" />
                <span>Menu</span>
              </div>
            </div>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={link.href === "/notifications" ? "topnav-notification-link" : undefined}
              >
                {link.label}
                {link.badge ? <span className="topnav-badge">{link.badge}</span> : null}
              </Link>
            ))}
            <form action={signOutAction} className="topnav-menu-signout">
              <Button type="submit" variant="secondary">
                Sign Out
              </Button>
            </form>
          </div>
        </details>
      </header>
    </>
  );
}
