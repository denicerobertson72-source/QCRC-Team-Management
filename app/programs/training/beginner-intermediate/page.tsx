import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getProgramSessionsForMonth } from "@/lib/queries";
import { toggleSessionSignupAction } from "@/lib/actions";
import { formatEasternDateTime, formatEasternMonthLabel } from "@/lib/time";

type SearchParams = Promise<{ month?: string }>;

function monthBounds(monthInput?: string) {
  const now = new Date();
  const [yearRaw, monthRaw] = (monthInput ?? "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const safeYear = Number.isFinite(year) && year > 2000 ? year : now.getUTCFullYear();
  const safeMonthIndex = Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : now.getUTCMonth();

  const start = new Date(Date.UTC(safeYear, safeMonthIndex, 1, 0, 0, 0));
  const end = new Date(Date.UTC(safeYear, safeMonthIndex + 1, 1, 0, 0, 0));
  const prev = new Date(Date.UTC(safeYear, safeMonthIndex - 1, 1, 0, 0, 0));
  const next = new Date(Date.UTC(safeYear, safeMonthIndex + 1, 1, 0, 0, 0));

  const label = formatEasternMonthLabel(start);
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  return { start, end, label, prev: fmt(prev), next: fmt(next) };
}

function prettyDateTime(value: string) {
  return `${formatEasternDateTime(value)} ET`;
}

export default async function TrainingBIPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const month = monthBounds(params.month);
  const sessions = await getProgramSessionsForMonth(
    ["coached_training_beginner_intermediate"],
    month.start.toISOString(),
    month.end.toISOString(),
  );

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Training: Beginner/Intermediate" subtitle={`${month.label} (Mon + Thu at 5:30 PM ET, arrival 5:10 PM)`} />

        <div className="row">
          <Link href="/programs/training">Back to Groups</Link>
          <Link href={`/programs/training/beginner-intermediate?month=${month.prev}`}>Previous Month</Link>
          <Link href={`/programs/training/beginner-intermediate?month=${month.next}`}>Next Month</Link>
        </div>

        {sessions.length === 0 ? <Card subtle>No sessions for this month yet.</Card> : null}

        <div className="stack">
          {sessions.map((session) => (
            <Card key={session.id} className="stack">
              <h3>{prettyDateTime(session.starts_at)}</h3>
              <p className="muted">Arrival 5:10 PM ET | Signups: {session.signup_count}</p>
              {session.is_cancelled ? (
                <p className="error">Cancelled{session.cancelled_reason ? `: ${session.cancelled_reason}` : ""}</p>
              ) : (
                <form action={toggleSessionSignupAction} className="inline-form">
                  <input type="hidden" name="session_id" value={session.id} />
                  <input type="hidden" name="signed_up" value={session.my_signed_up ? "false" : "true"} />
                  <Button type="submit">{session.my_signed_up ? "Remove Me" : "Sign Me Up"}</Button>
                </form>
              )}
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
