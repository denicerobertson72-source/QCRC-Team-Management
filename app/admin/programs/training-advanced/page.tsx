import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { AdvancedTrainingPriorityFleet } from "@/components/admin/AdvancedTrainingPriorityFleet";
import {
  addAdvancedTrainingPriorityBoatAdminAction,
  cancelSessionAdminAction,
  generateProgramSessionsMonthAction,
  removeAdvancedTrainingPriorityBoatAdminAction,
  resetProgramMonthToDefaultTimesAction,
  updateSessionTimesAdminAction,
} from "@/lib/actions";
import { formatEasternDateTime, formatEasternMonthLabel, toEasternDateTimeLocalValue } from "@/lib/time";

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
  const isCurrentMonth = safeYear === now.getUTCFullYear() && safeMonthIndex === now.getUTCMonth();
  return { start, end, label, current: fmt(start), prev: fmt(prev), next: fmt(next), queryStart: isCurrentMonth ? now : start };
}

export default async function AdminProgramsAdvancedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const month = monthBounds(params.month);
  const { supabase } = await ensureAdminProfile();

  const [{ data: sessions }, { data: priorityRows }, { data: fleetBoats }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, title, starts_at, ends_at, is_cancelled, cancelled_reason")
      .eq("session_type", "coached_training_advanced")
      .gte("starts_at", month.queryStart.toISOString())
      .lt("starts_at", month.end.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("program_priority_boats")
      .select("boat_id, boats ( id, name, boat_class_id, status, required_skill_level )")
      .eq("session_type", "coached_training_advanced"),
    supabase
      .from("boats")
      .select("id, name, boat_class_id, status, required_skill_level")
      .neq("status", "locked")
      .order("boat_class_id", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const priorityBoats = (priorityRows ?? []).flatMap((row) => row.boats ?? []);
  const priorityBoatIds = new Set(priorityBoats.map((boat) => boat.id));
  const availableBoats = (fleetBoats ?? []).filter((boat) => !priorityBoatIds.has(boat.id));

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Training Advanced Schedule" subtitle={`Manage ${month.label} (Tue/Thu 6:30-7:30 AM ET default).`} />

        <div className="row">
          <Link href="/admin/programs">Back</Link>
          <Link href={`/admin/programs/training-advanced?month=${month.prev}`}>Previous Month</Link>
          <Link href={`/admin/programs/training-advanced?month=${month.next}`}>Next Month</Link>
        </div>

        <AdvancedTrainingPriorityFleet
          priorityBoats={priorityBoats}
          availableBoats={availableBoats}
          addBoatAction={addAdvancedTrainingPriorityBoatAdminAction}
          removeBoatAction={removeAdvancedTrainingPriorityBoatAdminAction}
        />

        <form action={generateProgramSessionsMonthAction} className="card inline-form">
          <input type="hidden" name="month" value={month.current} />
          <input type="hidden" name="program_scope" value="training_advanced" />
          <Button type="submit">Generate Month Sessions</Button>
        </form>

        <form action={resetProgramMonthToDefaultTimesAction} className="card inline-form">
          <input type="hidden" name="month" value={month.current} />
          <input type="hidden" name="session_type" value="coached_training_advanced" />
          <Button type="submit" variant="secondary">Reset Month To Default ET Times</Button>
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
