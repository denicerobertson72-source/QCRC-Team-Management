import { TopNav } from "@/components/TopNav";
import { ensureProfile } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { formatEasternDate, formatEasternDateTime } from "@/lib/time";

export default async function AdminAnalyticsPage() {
  const { supabase } = await ensureProfile();

  const [{ data: usage }, { data: damage }, { count: overdue }] = await Promise.all([
    supabase.from("v_boat_usage_hours").select("boat_name, usage_month, reserved_hours, on_water_hours").limit(50),
    supabase.from("v_damage_by_boat").select("boat_name, damage_reports, avg_severity, last_reported_at").limit(50),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "checked_out")
      .lt("end_time", new Date().toISOString()),
  ]);

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Analytics" subtitle="Utilization and incident visibility across the fleet." />

        <Card>
          <h2>Overdue Returns</h2>
          <p>{overdue ?? 0} checked-out boats are past expected return.</p>
        </Card>

        <Card className="stack">
          <h2>Boat Usage (Recent)</h2>
          <table>
            <thead>
              <tr>
                <th>Boat</th>
                <th>Month</th>
                <th>Reserved Hrs</th>
                <th>On-Water Hrs</th>
              </tr>
            </thead>
            <tbody>
              {(usage ?? []).map((row: any, idx: number) => (
                <tr key={`${row.boat_name}-${idx}`}>
                  <td>{row.boat_name}</td>
                  <td>{formatEasternDate(row.usage_month)}</td>
                  <td>{Number(row.reserved_hours ?? 0).toFixed(1)}</td>
                  <td>{Number(row.on_water_hours ?? 0).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="stack">
          <h2>Damage by Boat</h2>
          <table>
            <thead>
              <tr>
                <th>Boat</th>
                <th>Reports</th>
                <th>Avg Severity</th>
                <th>Last Report</th>
              </tr>
            </thead>
            <tbody>
              {(damage ?? []).map((row: any, idx: number) => (
                <tr key={`${row.boat_name}-${idx}`}>
                  <td>{row.boat_name}</td>
                  <td>{row.damage_reports}</td>
                  <td>{row.avg_severity ?? "-"}</td>
                  <td>{row.last_reported_at ? `${formatEasternDateTime(row.last_reported_at)} ET` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
