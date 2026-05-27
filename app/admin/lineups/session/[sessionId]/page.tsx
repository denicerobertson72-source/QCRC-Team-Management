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
  addLineupBoatAdminAction,
  createLineupBoardAdminAction,
  publishLineupBoardAdminAction,
  saveLineupAssignmentsAdminAction,
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
    .select("id, title, starts_at, session_type")
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
            <form action={publishLineupBoardAdminAction} className="inline-form">
              <input type="hidden" name="lineup_board_id" value={board.id} />
              <input type="hidden" name="publish" value={detail.board.is_published ? "false" : "true"} />
              <input type="hidden" name="return_to" value={returnTo} />
              <Button type="submit" variant="secondary">
                {detail.board.is_published ? "Unpublish" : "Publish"}
              </Button>
            </form>
          </div>

          <form action={addLineupBoatAdminAction} className="inline-form">
            <input type="hidden" name="lineup_board_id" value={board.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Field label="Boat Name">
              <input name="boat_name" required />
            </Field>
            <Field label="Class">
              <select name="boat_class_id" defaultValue="4x">
                <option value="1x">1x</option>
                <option value="2x">2x</option>
                <option value="4x">4x</option>
              </select>
            </Field>
            <Button type="submit">Add Boat</Button>
          </form>

          <LineupBuilder
            boats={detail.boats}
            roster={roster}
            action={saveLineupAssignmentsAdminAction}
            returnTo={returnTo}
          />
        </Card>
      </main>
    </>
  );
}
