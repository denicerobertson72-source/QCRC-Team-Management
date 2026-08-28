import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { LineupBuilder } from "@/components/admin/LineupBuilder";
import { formatEasternDateTime } from "@/lib/time";
import {
  createLineupBoardAdminAction,
  addLineupBoatAdminAction,
  removeLineupBoatAdminAction,
  publishLineupBoardAdminAction,
  saveLineupAssignmentsAdminAction,
  saveAndPublishLineupAssignmentsAdminAction,
} from "@/lib/actions";
import { getLineupBoardDetail, getRosterForBoard } from "@/lib/queries";

function boardTypeForSession(sessionType: string) {
  if (sessionType === "coached_training_beginner_intermediate") return "coached_training_beginner_intermediate";
  if (sessionType === "coached_training_advanced") return "coached_training_advanced";
  return "saturday_coached_row";
}

export default async function SessionLineupPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { supabase } = await ensureAdminProfile();
  const returnTo = `/admin/lineups/session/${sessionId}`;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, title, starts_at, ends_at, session_type")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return (
      <>
        <TopNav />
        <main className="stack">
          <Card>Session not found.</Card>
        </main>
      </>
    );
  }

  const boardType = boardTypeForSession(session.session_type);
  const { data: board } = await supabase
    .from("lineup_boards")
    .select("id, title, is_published")
    .eq("session_id", session.id)
    .limit(1)
    .maybeSingle();

  if (!board) {
    return (
      <>
        <TopNav />
        <main className="stack">
          <PageTitle title={`Session Lineup: ${session.title}`} subtitle={`${formatEasternDateTime(session.starts_at)} ET`} />
          <form action={createLineupBoardAdminAction} className="card form-grid">
            <input type="hidden" name="board_type" value={boardType} />
            <input type="hidden" name="session_id" value={session.id} />
            <input type="hidden" name="title" value={`${session.title} Lineup`} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Button type="submit">Create Session Lineup</Button>
          </form>
        </main>
      </>
    );
  }

  const detail = await getLineupBoardDetail(board.id);
  const roster = await getRosterForBoard(boardType, undefined, session.id);
  const [{ data: fleetBoats }, { data: conflictingReservations }] = await Promise.all([
    supabase.from("boats").select("id, name, boat_class_id, status").order("boat_class_id").order("name"),
    supabase
      .from("reservations")
      .select("boat_id")
      .in("status", ["reserved", "checked_out"])
      .lt("start_time", session.ends_at)
      .gt("end_time", session.starts_at),
  ]);
  const unavailableFleetBoatIds = new Set((conflictingReservations ?? []).map((reservation) => reservation.boat_id));

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title={`Session Lineup: ${session.title}`} subtitle={`${formatEasternDateTime(session.starts_at)} ET`} />

        <div className="row">
          <Link href="/admin/lineups">Back to Lineups</Link>
        </div>

        <Card className="stack">
          <div className="page-title">
            <h3>{detail.board.title}</h3>
            <span className="muted">{detail.board.is_published ? "Currently published" : "Draft only"}</span>
          </div>
          <LineupBuilder
            boats={detail.boats}
            roster={roster}
            action={saveLineupAssignmentsAdminAction}
            addBoatAction={addLineupBoatAdminAction}
            saveAndPublishAction={saveAndPublishLineupAssignmentsAdminAction}
            publishAction={publishLineupBoardAdminAction}
            removeBoatAction={removeLineupBoatAdminAction}
            lineupBoardId={board.id}
            isPublished={detail.board.is_published}
            returnTo={returnTo}
            fleetBoats={(fleetBoats ?? []).map((boat) => ({ ...boat, status: unavailableFleetBoatIds.has(boat.id) ? "reserved" : boat.status }))}
          />
        </Card>
      </main>
    </>
  );
}
