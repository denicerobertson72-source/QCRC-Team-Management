import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import {
  cancelSessionAdminAction,
  generateProgramSessionsMonthAction,
  resetProgramMonthToDefaultTimesAction,
  updateProgramMonthTimesAdminAction,
  updateSessionTimesAdminAction,
} from "@/lib/actions";
import { formatEasternDateTime, programMonthFromInput, toEasternDateTimeLocalValue } from "@/lib/time";

type SearchParams = Promise<{ month?: string }>;

export default async function AdminProgramsSaturdayPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const month = programMonthFromInput(params.month);
  const { supabase } = await ensureAdminProfile();

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, title, starts_at, ends_at, is_cancelled, cancelled_reason")
    .eq("session_type", "saturday_coached_row")
    .gte("starts_at", month.start.toISOString())
    .lt("starts_at", month.end.toISOString())
    .order("starts_at", { ascending: true });

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Saturday Schedule" subtitle={`Manage ${month.label} (7:30 AM ET default).`} />

        <div className="row">
          <Link href="/admin/programs">Back</Link>
          <Link href={`/admin/programs/saturday?month=${month.previous}`}>Previous Month</Link>
          <Link href={`/admin/programs/saturday?month=${month.next}`}>Next Month</Link>
        </div>

        <form action={generateProgramSessionsMonthAction} className="card inline-form">
          <input type="hidden" name="month" value={month.current} />
          <input type="hidden" name="program_scope" value="saturday" />
          <Button type="submit">Generate Month Sessions</Button>
        </form>

        <form action={resetProgramMonthToDefaultTimesAction} className="card inline-form">
          <input type="hidden" name="month" value={month.current} />
          <input type="hidden" name="session_type" value="saturday_coached_row" />
          <Button type="submit" variant="secondary">Reset Month To 7:30-9:00 ET</Button>
        </form>

        <form action={updateProgramMonthTimesAdminAction} className="card form-grid">
          <input type="hidden" name="month" value={month.current} />
          <input type="hidden" name="session_type" value="saturday_coached_row" />
          <Field label="Month row start (ET)">
            <input name="start_time" type="time" defaultValue="07:30" required />
          </Field>
          <Field label="Month row end (ET)">
            <input name="end_time" type="time" defaultValue="09:00" required />
          </Field>
          <p className="muted">Applies this time to all Saturday coached rows in {month.label}. Arrival displays 5 minutes before row time.</p>
          <Button type="submit" variant="secondary">Apply Times To Month</Button>
        </form>

        <div className="stack">
          {(sessions ?? []).map((session) => (
            <Card key={session.id} className="stack">
              <div className="page-title">
                <h3>{session.title}</h3>
                <span className="muted">{formatEasternDateTime(session.starts_at)} ET</span>
              </div>

              {session.is_cancelled ? <p className="error">Cancelled: {session.cancelled_reason ?? "No reason"}</p> : null}

              <form action={updateSessionTimesAdminAction} className="form-grid">
                <input type="hidden" name="session_id" value={session.id} />
                <Field label="Start (ET)">
                  <input name="starts_at" type="datetime-local" defaultValue={toEasternDateTimeLocalValue(session.starts_at)} />
                </Field>
                <Field label="End (ET)">
                  <input name="ends_at" type="datetime-local" defaultValue={toEasternDateTimeLocalValue(session.ends_at)} />
                </Field>
                <Button type="submit" variant="secondary">Save Time</Button>
              </form>

              <form action={cancelSessionAdminAction} className="form-grid">
                <input type="hidden" name="session_id" value={session.id} />
                <input type="hidden" name="is_cancelled" value={session.is_cancelled ? "false" : "true"} />
                <Field label="Cancellation reason (shown to rowers)">
                  <input name="cancelled_reason" defaultValue={session.cancelled_reason ?? ""} />
                </Field>
                <Button type="submit" variant="secondary">{session.is_cancelled ? "Reopen Session" : "Cancel Session"}</Button>
              </form>
            </Card>
          ))}

          {(sessions ?? []).length === 0 ? <Card subtle>No sessions in this month yet.</Card> : null}
        </div>
      </main>
    </>
  );
}
