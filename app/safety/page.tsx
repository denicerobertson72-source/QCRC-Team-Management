import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import Link from "next/link";
import { getPublishedSafetyResources, getSafetyDashboard } from "@/lib/queries";
import { formatEasternDateTime } from "@/lib/time";
import { StatusChip } from "@/components/ui/StatusChip";
import { ensureProfile } from "@/lib/auth";
import { getSafetyLiveMapState } from "@/lib/safety-live";
import { SafetyLiveMap } from "@/components/safety/SafetyLiveMap";

export default async function SafetyPage() {
  const [{ onWater, recentLog }, resources, { supabase, user, profile }] = await Promise.all([
    getSafetyDashboard(),
    getPublishedSafetyResources(),
    ensureProfile(),
  ]);
  const canManageSafety = profile?.role === "admin" || profile?.role === "coach" || profile?.role === "equipment_manager";
  const overdue = onWater.filter((entry) => entry.is_overdue);
  const visibleOnWater = onWater;
  const visibleOverdue = canManageSafety ? overdue : overdue.filter((entry) => entry.created_by === user.id);
  const visibleRecentLog = recentLog;
  const liveMapState = await getSafetyLiveMapState(supabase as never, user.id, profile?.role, onWater);
  const mapboxAccessToken =
    process.env.ROWING_MAP_KEY ??
    process.env.MAPBOX_MAIN_KEY ??
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ??
    null;
  const mapboxStyleUrl =
    process.env.MAPBOX_STYLE_URL ??
    process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL ??
    "mapbox://styles/mapbox/outdoors-v12";
  const weatherRadarSources = [
    {
      id: "ILN",
      label: "ILN (Wilmington/Cincinnati)",
      tileUrl: process.env.WEATHER_RADAR_TILE_URL ?? process.env.NEXT_PUBLIC_WEATHER_RADAR_TILE_URL ?? null,
    },
    {
      id: "LVX",
      label: "LVX (Louisville)",
      tileUrl: process.env.WEATHER_RADAR_TILE_LVX ?? process.env.NEXT_PUBLIC_WEATHER_RADAR_TILE_LVX ?? null,
    },
  ].filter((source) => source.tileUrl);
  const weatherRadarAttribution =
    process.env.WEATHER_RADAR_ATTRIBUTION ?? process.env.NEXT_PUBLIC_WEATHER_RADAR_ATTRIBUTION ?? null;

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
                      loading="lazy"
                      decoding="async"
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
            <div className="page-title">
              <h3>Live Outing Map</h3>
              <span className="muted">Track your active outing or monitor all active boats if you manage safety.</span>
            </div>
            <SafetyLiveMap
              initialState={liveMapState}
              currentUserId={user.id}
              mapboxAccessToken={mapboxAccessToken}
              mapboxStyleUrl={mapboxStyleUrl}
              weatherRadarSources={weatherRadarSources}
              weatherRadarAttribution={weatherRadarAttribution}
            />
          </Card>

          <Card className="stack">
            <h3>Currently On The Water</h3>
            {visibleOnWater.length === 0 ? <p className="muted">No active launches right now.</p> : null}
            {visibleOnWater.map((entry) => (
              <Card key={entry.id} subtle>
                <div className="page-title">
                  <h4>{entry.boat_name}</h4>
                  <StatusChip label={entry.is_overdue ? "overdue" : "on water"} kind={entry.is_overdue ? "reserved" : "checked_out"} />
                </div>
                <p className="muted">{entry.rower_name}</p>
                {entry.crew_names.length > 0 ? <p>Boat roster: {[entry.rower_name, ...entry.crew_names].join(", ")}</p> : null}
                <p>
                  Launched: {formatEasternDateTime(entry.checked_out_at ?? entry.start_time)} ET
                </p>
                {canManageSafety ? (
                  <p>
                    {entry.checkout_location ?? "Location not set"} | {entry.river_direction ?? "Direction not set"}
                  </p>
                ) : entry.river_direction ? (
                  <p>Route: {entry.river_direction}</p>
                ) : null}
                {entry.launch_comment || entry.notes ? <p>Launch comments: {entry.launch_comment ?? entry.notes}</p> : null}
                {entry.return_comment ? <p>Return comments: {entry.return_comment}</p> : null}
                <p>Gate: {entry.gate_status === "unlocked" ? "Left unlocked" : entry.gate_status === "locked" ? "Locked" : "Not recorded"}</p>
              </Card>
            ))}
          </Card>

          <Card className="stack">
            <h3>Overdue Boats</h3>
            {visibleOverdue.length === 0 ? <p className="muted">No overdue boats.</p> : null}
            {visibleOverdue.map((entry) => (
              <Card key={entry.id} subtle>
                <h4>{entry.boat_name}</h4>
                <p className="muted">{entry.rower_name}</p>
                {entry.crew_names.length > 0 ? <p>Boat roster: {[entry.rower_name, ...entry.crew_names].join(", ")}</p> : null}
                <p>Launched: {formatEasternDateTime(entry.checked_out_at ?? entry.start_time)} ET</p>
                {entry.launch_comment || entry.notes ? <p>Launch comments: {entry.launch_comment ?? entry.notes}</p> : null}
                {entry.return_comment ? <p>Return comments: {entry.return_comment}</p> : null}
              </Card>
            ))}
          </Card>
        </div>

        <Card className="stack">
          <h3>Recent Launch / Return Log</h3>
          {visibleRecentLog.length === 0 ? <p className="muted">No launch or return activity yet.</p> : null}
          <table>
            <thead>
              <tr>
                <th>Boat</th>
                <th>Rower</th>
                <th>Status</th>
                <th>Crew</th>
                <th>Launch</th>
                <th>Return</th>
                <th>Last Activity</th>
                <th>Route</th>
                <th>Gate</th>
                <th>Launch Comments</th>
                <th>Return Comments</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecentLog.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.boat_name}</td>
                  <td>{entry.rower_name}</td>
                  <td>{entry.status === "checked_out" ? "On Water" : "Returned"}</td>
                  <td>{entry.crew_names.length > 0 ? [entry.rower_name, ...entry.crew_names].join(", ") : entry.rower_name}</td>
                  <td>{entry.checked_out_at ? `${formatEasternDateTime(entry.checked_out_at)} ET` : "-"}</td>
                  <td>{entry.checked_in_at ? `${formatEasternDateTime(entry.checked_in_at)} ET` : "-"}</td>
                  <td>{entry.checked_in_at ? `${formatEasternDateTime(entry.checked_in_at)} ET` : entry.checked_out_at ? `${formatEasternDateTime(entry.checked_out_at)} ET` : "-"}</td>
                  <td>
                    {canManageSafety
                      ? `${entry.checkout_location ?? "-"}${entry.river_direction ? ` / ${entry.river_direction}` : ""}`
                      : entry.river_direction ?? "-"}
                  </td>
                  <td>
                    {entry.gate_status === "locked" ? "Locked" : entry.gate_status === "unlocked" ? "Unlocked" : "-"}
                  </td>
                  <td>{entry.launch_comment ?? entry.notes ?? "-"}</td>
                  <td>{entry.return_comment ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
