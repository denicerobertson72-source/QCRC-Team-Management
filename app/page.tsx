import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { FlashNotice } from "@/components/ui/FlashNotice";
import { PageTitle } from "@/components/ui/PageTitle";
import { ensureProfile } from "@/lib/auth";
import { addTeamAnnouncementAction, deleteTeamAnnouncementAction } from "@/lib/actions";
import { getActiveTeamAnnouncements } from "@/lib/queries";
import { formatEasternDateTime, nowEasternDateTimeLocalValue } from "@/lib/time";

type SearchParams = Promise<{
  announcement_status?: string;
  announcement_message?: string;
}>;

const QUICK_LINKS = [
  { href: "/reservations", label: "My Reservations", description: "Launch, return, and manage active outings." },
  { href: "/reserve", label: "Reserve a Boat", description: "Find an eligible shell for your next outing." },
  { href: "/safety", label: "Safety", description: "Live map, on-water roster, and recent outing log." },
  { href: "/programs", label: "Programs", description: "Training, racing, and meetup signups." },
  { href: "/lineups", label: "Lineups", description: "Published race and session lineups." },
  { href: "/notifications", label: "Notifications", description: "Club alerts and updates sent to you." },
  { href: "/boats", label: "Boat Roster", description: "Browse the current fleet and statuses." },
  { href: "/damage/new", label: "Report Damage", description: "Log issues and upload damage photos." },
  { href: "/account/security", label: "Account Setting", description: "Membership, compliance, and contact info." },
];

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [{ profile, supabase }, announcements] = await Promise.all([ensureProfile(), getActiveTeamAnnouncements()]);
  const isAdmin = profile?.role === "admin";
  const races = isAdmin
    ? (await supabase.from("race_events").select("id, title, event_date").order("event_date", { ascending: true })).data ?? []
    : [];
  const displayName = profile?.full_name?.trim() && !profile.full_name.includes("@") ? profile.full_name.trim() : "";
  const links = isAdmin ? [...QUICK_LINKS, { href: "/admin", label: "Admin", description: "Manage members, boats, safety, and programs." }] : QUICK_LINKS;

  return (
    <>
      <TopNav />
      <main className="stack">
        <section className="hero-panel stack">
          <span className="eyebrow">QCRC Team Management</span>
          <PageTitle
            title={`Welcome${displayName ? `, ${displayName}` : ""}`}
            subtitle="Use this home page as the club dashboard for reservations, safety, and team-wide notices."
          />
        </section>

        {params.announcement_status && params.announcement_message ? (
          <FlashNotice
            status={params.announcement_status === "success" ? "success" : "error"}
            message={params.announcement_message}
          />
        ) : null}

        <Card className="stack">
          <div className="page-title">
            <h3>Team Announcements</h3>
            <span className="muted">Post marina closures, weather holds, and other club-wide updates here.</span>
          </div>
          {announcements.length === 0 ? <p className="muted">No active announcements right now.</p> : null}
          <div className="stack">
            {announcements.map((announcement) => (
              <Card key={announcement.id} subtle className="stack">
                <div className="page-title">
                  <h4>{announcement.title}</h4>
                  {isAdmin ? (
                    <form action={deleteTeamAnnouncementAction}>
                      <input type="hidden" name="announcement_id" value={announcement.id} />
                      <Button type="submit" variant="secondary">
                        Remove
                      </Button>
                    </form>
                  ) : null}
                </div>
                <p className="muted">Posted {formatEasternDateTime(announcement.created_at)} ET</p>
                <div className="announcement-body">{announcement.body}</div>
                {announcement.ends_at ? (
                  <p className="muted">Visible until {formatEasternDateTime(announcement.ends_at)} ET</p>
                ) : null}
              </Card>
            ))}
          </div>
        </Card>

        {isAdmin ? (
          <form action={addTeamAnnouncementAction} className="card form-grid">
            <h3>Post Announcement</h3>
            <Field label="Title">
              <input name="title" placeholder="Marina closed for weather" required />
            </Field>
            <Field label="Message">
              <textarea name="body" rows={4} placeholder="The marina is closed today because of..." required />
            </Field>
            <Field label="Show starting">
              <input name="starts_at" type="datetime-local" defaultValue={nowEasternDateTimeLocalValue()} />
            </Field>
            <Field label="Optional end time">
              <input name="ends_at" type="datetime-local" />
            </Field>
            <Field label="Audience">
              <select name="audience_type" defaultValue="all">
                <option value="all">All active members</option>
                <option value="training_beginner_intermediate">Training: Beginner / Intermediate</option>
                <option value="training_advanced">Training: Advanced</option>
                <option value="saturday_community_row">Saturday Community Row</option>
                <option value="race">Racing: specific race</option>
                <option value="meetup">Rowing Meetup members</option>
              </select>
            </Field>
            <Field label="Race (only for a Racing audience)">
              <select name="race_event_id" defaultValue="">
                <option value="">Choose a race</option>
                {races.map((race) => (
                  <option key={race.id} value={race.id}>
                    {race.title} — {race.event_date}
                  </option>
                ))}
              </select>
            </Field>
            <label className="member-checkbox-row">
              <input name="send_push" type="checkbox" />
              <span>Send push notification to this audience</span>
            </label>
            <Button type="submit">Post Announcement</Button>
          </form>
        ) : null}

        <Card className="stack">
          <div className="page-title">
            <h3>Quick Links</h3>
            <span className="muted">The same core destinations from the top navigation, gathered in one place.</span>
          </div>
          <div className="grid">
            {links.map((link) => (
              <Card key={link.href} subtle className="stack">
                <h4>{link.label}</h4>
                <p className="muted">{link.description}</p>
                <Link href={link.href} className="cta-link">
                  Open
                </Link>
              </Card>
            ))}
          </div>
        </Card>
      </main>
    </>
  );
}
