import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { formatEasternDateTime, formatEasternMonthLabel } from "@/lib/time";

type SearchParams = Promise<{ month?: string }>;

function monthBounds(monthInput?: string) {
  const now = new Date();
  const [yearRaw, monthRaw] = (monthInput ?? "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const safeYear = Number.isFinite(year) && year > 2000 ? year : now.getUTCFullYear();
  const safeMonthIndex = Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : now.getUTCMonth();

  const start = new Date(Date.UTC(safeYear, safeMonthIndex, 1));
  const end = new Date(Date.UTC(safeYear, safeMonthIndex + 1, 1));
  const prev = new Date(Date.UTC(safeYear, safeMonthIndex - 1, 1));
  const next = new Date(Date.UTC(safeYear, safeMonthIndex + 1, 1));
  const label = formatEasternMonthLabel(start);
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, label, prev: fmt(prev), next: fmt(next) };
}

export default async function AdminSaturdayLineupsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const month = monthBounds(params.month);
  const { supabase } = await ensureAdminProfile();

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, title, starts_at, is_cancelled")
    .eq("session_type", "saturday_coached_row")
    .gte("starts_at", month.start.toISOString())
    .lt("starts_at", month.end.toISOString())
    .order("starts_at", { ascending: true });

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Saturday Lineups" subtitle={month.label} />
        <div className="row">
          <Link href="/admin/lineups">Back</Link>
          <Link href={`/admin/lineups/saturday?month=${month.prev}`}>Previous Month</Link>
          <Link href={`/admin/lineups/saturday?month=${month.next}`}>Next Month</Link>
        </div>

        <div className="stack">
          {(sessions ?? []).map((session) => (
            <Card key={session.id} className="page-title">
              <div>
                <h3>{formatEasternDateTime(session.starts_at)} ET</h3>
                {session.is_cancelled ? <p className="error">Cancelled</p> : null}
              </div>
              <Link href={`/admin/lineups/session/${session.id}`}>Open Lineup</Link>
            </Card>
          ))}
          {(sessions ?? []).length === 0 ? <Card subtle>No sessions this month.</Card> : null}
        </div>
      </main>
    </>
  );
}
