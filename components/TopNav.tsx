import { Suspense } from "react";
import Link from "next/link";
import { signOutAction } from "@/lib/actions";
import { Button } from "@/components/ui/Button";
import { ensureProfile } from "@/lib/auth";
import { GlobalOverdueAlert } from "@/components/ui/GlobalOverdueAlert";
import { GlobalReservationAlert } from "@/components/ui/GlobalReservationAlert";
import { getOverdueBoatAlertSummary, getUnreadNotificationCount } from "@/lib/queries";

async function NotificationBadge() {
  const unreadNotificationCount = await getUnreadNotificationCount();
  if (unreadNotificationCount <= 0) return null;

  return <span className="topnav-badge">{unreadNotificationCount > 99 ? "99+" : String(unreadNotificationCount)}</span>;
}

async function ReservationAlerts({ userId }: { userId: string }) {
  const { supabase } = await ensureProfile();
  const { data, error } = await supabase
    .from("reservations")
    .select("id, start_time, boats(name,status)")
    .eq("created_by", userId)
    .eq("status", "reserved")
    .gte("start_time", new Date().toISOString());

  if (error) throw error;

  const alerts = (data ?? [])
    .map((row: any) => ({
      boatName: (Array.isArray(row.boats) ? row.boats[0] : row.boats)?.name ?? row.id,
      boatStatus: (Array.isArray(row.boats) ? row.boats[0] : row.boats)?.status ?? "available",
    }))
    .filter((row) => row.boatStatus !== "available");

  return <GlobalReservationAlert count={alerts.length} firstBoatName={alerts[0]?.boatName ?? null} />;
}

async function OverdueAlerts() {
  const summary = await getOverdueBoatAlertSummary();
  return <GlobalOverdueAlert count={summary.overdue_count} firstBoatName={summary.first_boat_name} />;
}

export async function TopNav() {
  const { user, profile } = await ensureProfile();
  const isAdmin = profile.role === "admin";
  const navLinks = [
    { href: "/", label: "Home", home: true },
    { href: "/reservations", label: "Reservations" },
    { href: "/reserve", label: "Reserve" },
    { href: "/safety", label: "Safety" },
    { href: "/programs/meetup", label: "Rowing Meetup" },
    { href: "/programs", label: "Programs" },
    { href: "/lineups", label: "Lineups" },
    { href: "/notifications", label: "Notifications" },
    { href: "/boats", label: "Boats" },
    { href: "/damage/new", label: "Damage" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
    { href: "/account/security", label: "Account Setting" },
  ];

  return (
    <>
      <Suspense fallback={null}>
        <ReservationAlerts userId={user.id} />
      </Suspense>
      <Suspense fallback={null}>
        <OverdueAlerts />
      </Suspense>
      <header className="topnav">
        <div className="topnav-home">
          <img src="/QCRC.png" alt="QCRC" width={52} height={52} className="topnav-logo topnav-logo-plain" />
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
                <img src="/QCRC.png" alt="QCRC" width={52} height={52} className="topnav-logo topnav-logo-plain" />
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
                {link.href === "/notifications" ? (
                  <Suspense fallback={null}>
                    <NotificationBadge />
                  </Suspense>
                ) : null}
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
