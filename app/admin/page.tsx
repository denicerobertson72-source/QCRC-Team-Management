import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { ensureProfile } from "@/lib/auth";

export default async function AdminPage() {
  await ensureProfile();

  return (
    <>
      <TopNav />
      <main className="stack">
        <section className="hero-panel stack">
          <span className="eyebrow">Club Control</span>
          <PageTitle title="Admin" subtitle="Manage members, boats, lineup publishing, race setup, and damage workflow from one place." />
        </section>

        <div className="grid">
          <Card className="stack program-tile">
            <span className="section-kicker">Roster</span>
            <h3>Members</h3>
            <p className="muted">Update roles, dues, skill level, and weight class.</p>
            <Link href="/admin/members" className="cta-link">Open Members</Link>
          </Card>

          <Card className="stack program-tile">
            <span className="section-kicker">Fleet</span>
            <h3>Boats</h3>
            <p className="muted">Add boats and set out-of-service availability.</p>
            <Link href="/admin/boats" className="cta-link">Open Boats</Link>
          </Card>

          <Card className="stack program-tile">
            <span className="section-kicker">Scheduling</span>
            <h3>Availability</h3>
            <p className="muted">Block all boats (or a class/group) during practice windows.</p>
            <Link href="/admin/availability" className="cta-link">Open Availability</Link>
          </Card>

          <Card className="stack program-tile">
            <span className="section-kicker">Assignments</span>
            <h3>Lineups</h3>
            <p className="muted">Build drag-and-drop lineups and publish for members.</p>
            <Link href="/admin/lineups" className="cta-link">Open Lineups</Link>
          </Card>

          <Card className="stack program-tile">
            <span className="section-kicker">Events</span>
            <h3>Races</h3>
            <p className="muted">Create race events and review race signup preferences.</p>
            <Link href="/admin/races" className="cta-link">Open Races</Link>
          </Card>

          <Card className="stack program-tile">
            <span className="section-kicker">Calendar</span>
            <h3>Program Schedule</h3>
            <p className="muted">Generate monthly dates and cancel sessions shown to rowers.</p>
            <Link href="/admin/programs" className="cta-link">Open Program Schedule</Link>
          </Card>

          <Card className="stack program-tile">
            <span className="section-kicker">Safety</span>
            <h3>Basic Safety Info</h3>
            <p className="muted">Post photos, procedures, and quiz links for members.</p>
            <Link href="/admin/safety" className="cta-link">Manage Safety Info</Link>
          </Card>
        </div>

        <Card className="quick-links">
          <Link href="/admin/clearances" className="cta-link">Clearances</Link>
          <Link href="/admin/damage" className="cta-link">Damage Queue</Link>
          <Link href="/admin/analytics" className="cta-link">Analytics</Link>
        </Card>
      </main>
    </>
  );
}
