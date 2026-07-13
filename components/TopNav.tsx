import Link from "next/link";
import { signOutAction } from "@/lib/actions";
import { Button } from "@/components/ui/Button";
import { ensureProfile } from "@/lib/auth";
import { NavStatusClient } from "@/components/NavStatusClient";

export async function TopNav() {
  const { profile } = await ensureProfile();
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
      <NavStatusClient />
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
                {link.href === "/notifications" ? <span id="topnav-notification-badge" /> : null}
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
