import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { getMyTrainingGroupAssignment, getNextProgramSessionMonth, getProgramSessionsForMonth } from "@/lib/queries";
import { toggleSessionSignupAction } from "@/lib/actions";
import { Button } from "@/components/ui/Button";
import { SignupRoster } from "@/components/SignupRoster";
import { formatEasternDateTime, formatEasternMonthLabel } from "@/lib/time";

type SearchParams = Promise<{ month?: string; view?: string }>;

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

  return { start, end, label, prev: fmt(prev), next: fmt(next), year: safeYear, monthIndex: safeMonthIndex };
}

function prettyDateTime(value: string) {
  return `${formatEasternDateTime(value)} ET`;
}

function formatEasternTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function monthDayKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default async function TrainingAdvancedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [trainingGroup, defaultMonth] = await Promise.all([
    getMyTrainingGroupAssignment(),
    getNextProgramSessionMonth(["coached_training_advanced"]),
  ]);
  const month = monthBounds(params.month ?? defaultMonth ?? undefined);
  const view = params.view === "calendar" ? "calendar" : "list";

  if (trainingGroup !== "advanced") {
    return (
      <>
        <TopNav />
        <main className="stack">
          <PageTitle
            title="Training: Advanced"
            subtitle="Only members assigned to this coached training group can view these signups."
          />
          <Card subtle>If you need access, ask an admin to assign your account to the Advanced coached training group.</Card>
          <Link href="/programs/training">Back to Groups</Link>
        </main>
      </>
    );
  }

  const sessions = await getProgramSessionsForMonth(
    ["coached_training_advanced"],
    month.start.toISOString(),
    month.end.toISOString(),
  );

  const monthQuery = `month=${month.start.getUTCFullYear()}-${String(month.monthIndex + 1).padStart(2, "0")}`;
  const viewQuery = `view=${view}`;
  const sessionDayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
  const daysInMonth = new Date(Date.UTC(month.year, month.monthIndex + 1, 0)).getUTCDate();
  const leadingBlankDays = new Date(Date.UTC(month.year, month.monthIndex, 1)).getUTCDay();
  const sessionsByDay = new Map<string, typeof sessions>();

  for (const session of sessions) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(session.starts_at));
    const existing = sessionsByDay.get(key) ?? [];
    existing.push(session);
    sessionsByDay.set(key, existing);
  }

  const calendarCells = [
    ...Array.from({ length: leadingBlankDays }, (_, index) => ({ key: `blank-${index}`, empty: true as const })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const key = monthDayKey(month.year, month.monthIndex, day);
      return {
        key,
        empty: false as const,
        day,
        sessions: sessionsByDay.get(key) ?? [],
      };
    }),
  ];

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Training: Advanced" subtitle={`${month.label} (Tue + Thu at 6:30 AM ET, arrival 6:10 AM)`} />

        <div className="row calendar-toolbar">
          <div className="row">
            <Link href="/programs/training">Back to Groups</Link>
            <Link href={`/programs/training/advanced?month=${month.prev}&${viewQuery}`}>Previous Month</Link>
            <Link href={`/programs/training/advanced?month=${month.next}&${viewQuery}`}>Next Month</Link>
          </div>
          <div className="calendar-toggle">
            <Link
              href={`/programs/training/advanced?${monthQuery}&view=list`}
              className={`button-link ${view === "list" ? "" : "button-link-secondary"}`.trim()}
            >
              List View
            </Link>
            <Link
              href={`/programs/training/advanced?${monthQuery}&view=calendar`}
              className={`button-link ${view === "calendar" ? "" : "button-link-secondary"}`.trim()}
            >
              Calendar View
            </Link>
          </div>
        </div>

        {sessions.length === 0 ? <Card subtle>No sessions for this month yet.</Card> : null}

        {sessions.length > 0 && view === "list" ? (
          <div className="stack">
            {sessions.map((session) => (
              <Card key={session.id} className="stack">
                <h3>{prettyDateTime(session.starts_at)}</h3>
                <p className="muted">Arrival 6:10 AM ET | Total signups: {session.signup_count}</p>
                <SignupRoster names={session.attendee_names} />
                {session.is_cancelled ? (
                  <p className="error">Cancelled{session.cancelled_reason ? `: ${session.cancelled_reason}` : ""}</p>
                ) : (
                  <form action={toggleSessionSignupAction} className="inline-form">
                    <input type="hidden" name="session_id" value={session.id} />
                    <input type="hidden" name="signed_up" value={session.my_signed_up ? "false" : "true"} />
                    <Button type="submit" variant={session.my_signed_up ? "secondary" : "primary"}>
                      {session.my_signed_up ? "Remove Me" : "Sign Me Up"}
                    </Button>
                  </form>
                )}
              </Card>
            ))}
          </div>
        ) : null}

        {sessions.length > 0 && view === "calendar" ? (
          <div className="calendar-grid">
            {calendarCells.map((cell) =>
              cell.empty ? (
                <div key={cell.key} className="card calendar-day calendar-day-muted" aria-hidden="true" />
              ) : (
                <Card key={cell.key} className="calendar-day">
                  <div className="calendar-day-header">
                    <span className="calendar-day-name">
                      {weekdayFormatter.format(new Date(Date.UTC(month.year, month.monthIndex, cell.day)))}
                    </span>
                    <span className="calendar-day-number">{cell.day}</span>
                  </div>
                  {cell.sessions.length === 0 ? <p className="muted">No session.</p> : null}
                  <div className="calendar-sessions">
                    {cell.sessions.map((session) => (
                      <div key={session.id} className="calendar-session">
                        <span className="calendar-session-time">{formatEasternTime(session.starts_at)} ET</span>
                        <p className="calendar-session-copy">
                          {sessionDayFormatter.format(new Date(session.starts_at))} | Total signups: {session.signup_count}
                        </p>
                        <SignupRoster names={session.attendee_names} />
                        {session.is_cancelled ? (
                          <p className="error">Cancelled{session.cancelled_reason ? `: ${session.cancelled_reason}` : ""}</p>
                        ) : (
                          <form action={toggleSessionSignupAction} className="inline-form">
                            <input type="hidden" name="session_id" value={session.id} />
                            <input type="hidden" name="signed_up" value={session.my_signed_up ? "false" : "true"} />
                            <Button type="submit" variant={session.my_signed_up ? "secondary" : "primary"}>
                              {session.my_signed_up ? "Remove Me" : "Sign Me Up"}
                            </Button>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              ),
            )}
          </div>
        ) : null}
      </main>
    </>
  );
}
