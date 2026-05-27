import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import Link from "next/link";
import { getPublishedSafetyResources, getSafetyDashboard } from "@/lib/queries";
import { formatEasternDateTime } from "@/lib/time";
import { StatusChip } from "@/components/ui/StatusChip";
import { ensureProfile } from "@/lib/auth";

export default async function SafetyPage() {
  const [{ onWater, recentLog }, resources, { supabase, user }] = await Promise.all([
    getSafetyDashboard(),
    getPublishedSafetyResources(),
    ensureProfile(),
  ]);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const canManageSafety = profile?.role === "admin" || profile?.role === "coach" || profile?.role === "equipment_manager";
  const overdue = onWater.filter((entry) => entry.is_overdue);

  return (
    <>
      <TopNav />
      <main className="stack">
        <section className="hero-panel stack">
          <span className="eyebrow">Safety</span>
          <PageTitle
            title="On-Water Safety"
            subtitle={`Currently on the water: ${onWater.length}. Overdue boats: ${overdue.length}. A boat becomes overdue two hours after launch.`}
            actions={
              canManageSafety ? (
                <Link href="/admin/safety" className="cta-link">
                  Manage Basic Safety Info
                </Link>
              ) : undefined
            }
          />
        </section>

        <Card className="stack">
          <div className="page-title">
            <h3>Basic Safety Info</h3>
            <span className="muted">Photos, procedure references, and quiz links for members.</span>
          </div>
          {resources.length === 0 ? <p className="muted">No basic safety resources have been posted yet.</p> : null}
          <div className="grid">
            {resources.map((resource) => (
              <Card key={resource.id} subtle className="stack">
                <div className="page-title">
                  <h4>{resource.title}</h4>
                  <StatusChip label={resource.resource_type} kind={resource.resource_type === "quiz" ? "checked_out" : "default"} />
                </div>
                {resource.resource_url && (resource.resource_type === "photo" || resource.mime_type?.startsWith("image/")) ? (
                  <a href={resource.resource_url} target="_blank" rel="noreferrer">
                    <img
                      src={resource.resource_url}
                      alt={resource.title}
                      style={{ width: "100%", borderRadius: "12px", display: "block", objectFit: "cover" }}
                    />
                  </a>
                ) : null}
                {resource.description ? <p>{resource.description}</p> : null}
                {resource.resource_url ? (
                  <a href={resource.resource_url} target="_blank" rel="noreferrer" className="cta-link">
                    {resource.resource_type === "quiz"
                      ? "Open Quiz"
                      : resource.resource_type === "procedure"
                        ? "Open Procedure"
                        : "Open Resource"}
                  </a>
                ) : (
                  <p className="muted">Resource link unavailable.</p>
                )}
              </Card>
            ))}
          </div>
        </Card>

        <div className="grid">
          <Card className="stack">
            <h3>Currently On The Water</h3>
            {onWater.length === 0 ? <p className="muted">No active launches right now.</p> : null}
            {onWater.map((entry) => (
              <Card key={entry.id} subtle>
                <div className="page-title">
                  <h4>{entry.boat_name}</h4>
                  <StatusChip label={entry.is_overdue ? "overdue" : "on water"} kind={entry.is_overdue ? "reserved" : "checked_out"} />
                </div>
                <p className="muted">{entry.rower_name}</p>
                <p>
                  Launched: {formatEasternDateTime(entry.checked_out_at ?? entry.start_time)} ET
                </p>
                <p>
                  {entry.checkout_location ?? "Location not set"} | {entry.river_direction ?? "Direction not set"}
                </p>
                <p>Gate: {entry.gate_status === "unlocked" ? "Left unlocked" : entry.gate_status === "locked" ? "Locked" : "Not recorded"}</p>
              </Card>
            ))}
          </Card>

          <Card className="stack">
            <h3>Overdue Boats</h3>
            {overdue.length === 0 ? <p className="muted">No overdue boats.</p> : null}
            {overdue.map((entry) => (
              <Card key={entry.id} subtle>
                <h4>{entry.boat_name}</h4>
                <p className="muted">{entry.rower_name}</p>
                <p>Launched: {formatEasternDateTime(entry.checked_out_at ?? entry.start_time)} ET</p>
              </Card>
            ))}
          </Card>
        </div>

        <Card className="stack">
          <h3>Recent Launch / Return Log</h3>
          {recentLog.length === 0 ? <p className="muted">No launch or return activity yet.</p> : null}
          <table>
            <thead>
              <tr>
                <th>Boat</th>
                <th>Rower</th>
                <th>Status</th>
                <th>Launch</th>
                <th>Return</th>
                <th>Route</th>
                <th>Gate</th>
              </tr>
            </thead>
            <tbody>
              {recentLog.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.boat_name}</td>
                  <td>{entry.rower_name}</td>
                  <td>{entry.status === "checked_out" ? "On Water" : "Returned"}</td>
                  <td>{entry.checked_out_at ? `${formatEasternDateTime(entry.checked_out_at)} ET` : "-"}</td>
                  <td>{entry.checked_in_at ? `${formatEasternDateTime(entry.checked_in_at)} ET` : "-"}</td>
                  <td>
                    {entry.checkout_location ?? "-"}{entry.river_direction ? ` / ${entry.river_direction}` : ""}
                  </td>
                  <td>
                    {entry.gate_status === "locked" ? "Locked" : entry.gate_status === "unlocked" ? "Unlocked" : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
