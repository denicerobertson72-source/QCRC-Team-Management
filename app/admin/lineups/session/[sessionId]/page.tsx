import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { LineupBuilder } from "@/components/admin/LineupBuilder";
import { TrainingHoldConflictPanel } from "@/components/admin/TrainingHoldConflictPanel";
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

type TrainingHoldConflictRow = {
  boat_name: string;
  member_id: string;
  reservation_id: string;
  reservation_start: string;
  reservation_end: string;
};

export default async function SessionLineupPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { supabase } = await ensureAdminProfile();
  const returnTo = `/admin/lineups/session/${sessionId}`;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, title, starts_at, ends_at, session_type, is_cancelled")
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

  const showTrainingHoldPanel =
    session.session_type === "coached_training_advanced" && !session.is_cancelled && new Date(session.ends_at) > new Date();
  let heldBoats: Array<{ id: string; boatName: string }> = [];
  let trainingHoldConflicts: Array<{
    id: string;
    boatName: string;
    memberName: string;
    reservationStart: string;
    reservationEnd: string;
    reservationStatus: string;
  }> = [];
  let trainingHoldLoadFailed = false;

  if (showTrainingHoldPanel) {
    const [{ data: holdRows, error: holdError }, { data: conflictRows, error: conflictError }] = await Promise.all([
      supabase
        .from("training_boat_holds")
        .select("id, starts_at, ends_at, boats(name)")
        .eq("session_id", session.id)
        .eq("auto_generated", true)
        .order("starts_at", { ascending: true }),
      supabase.rpc("training_hold_reservation_conflicts", { p_session_id: session.id }),
    ]);

    if (holdError || conflictError) {
      console.error("Could not load Advanced Training hold conflicts", { sessionId: session.id, holdError, conflictError });
      trainingHoldLoadFailed = true;
    } else {
      const conflicts = (conflictRows ?? []) as TrainingHoldConflictRow[];
      heldBoats = (holdRows ?? []).map((hold) => {
        const boat = Array.isArray(hold.boats) ? hold.boats[0] : hold.boats;
        return { id: hold.id, boatName: boat?.name ?? "Unknown boat" };
      });

      const memberIds = [...new Set(conflicts.map((conflict) => conflict.member_id))];
      const reservationIds = [...new Set(conflicts.map((conflict) => conflict.reservation_id))];
      const [{ data: profiles, error: profileError }, { data: reservations, error: reservationError }] = await Promise.all([
        memberIds.length
          ? supabase.from("profiles").select("id, full_name, email").in("id", memberIds)
          : Promise.resolve({ data: [], error: null }),
        reservationIds.length
          ? supabase.from("reservations").select("id, status").in("id", reservationIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (profileError || reservationError) {
        console.error("Could not load details for Advanced Training hold conflicts", { sessionId: session.id, profileError, reservationError });
      }
      const memberNames = new Map(
        (profiles ?? []).map((profile) => [profile.id, profile.full_name?.trim() || profile.email?.split("@")[0] || "Unknown member"]),
      );
      const reservationStatuses = new Map((reservations ?? []).map((reservation) => [reservation.id, reservation.status]));
      trainingHoldConflicts = conflicts.map((conflict) => ({
        id: conflict.reservation_id,
        boatName: conflict.boat_name,
        memberName: memberNames.get(conflict.member_id) ?? "Member details unavailable",
        reservationStart: conflict.reservation_start,
        reservationEnd: conflict.reservation_end,
        reservationStatus: reservationStatuses.get(conflict.reservation_id) ?? "active",
      }));
    }
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
          {showTrainingHoldPanel ? (
            <TrainingHoldConflictPanel
              sessionStartsAt={session.starts_at}
              sessionEndsAt={session.ends_at}
              heldBoats={heldBoats}
              conflicts={trainingHoldConflicts}
              loadFailed={trainingHoldLoadFailed}
            />
          ) : null}
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
  const isCoachedTraining = session.session_type === "coached_training_beginner_intermediate" || session.session_type === "coached_training_advanced";
  const rosterMemberIds = new Set(roster.map((member) => member.id));
  const [{ data: fleetBoats }, { data: conflictingReservations }] = await Promise.all([
    supabase.from("boats").select("id, name, boat_class_id, status").order("boat_class_id").order("name"),
    supabase
      .from("reservations")
      .select("id, boat_id, created_by, start_time, end_time, status, profiles!reservations_created_by_fkey(full_name, email), reservation_crew(member_id)")
      .in("status", ["reserved", "checked_out"])
      .lt("start_time", session.ends_at)
      .gt("end_time", session.starts_at),
  ]);
  const reservationByBoatId = new Map((conflictingReservations ?? []).map((reservation) => [reservation.boat_id, reservation]));

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title={`Session Lineup: ${session.title}`} subtitle={`${formatEasternDateTime(session.starts_at)} ET`} />

        <div className="row">
          <Link href="/admin/lineups">Back to Lineups</Link>
        </div>

        {showTrainingHoldPanel ? (
          <TrainingHoldConflictPanel
            sessionStartsAt={session.starts_at}
            sessionEndsAt={session.ends_at}
            heldBoats={heldBoats}
            conflicts={trainingHoldConflicts}
            loadFailed={trainingHoldLoadFailed}
          />
        ) : null}

        <Card className="stack">
          <div className="page-title">
            <h3>{detail.board.title}</h3>
            <span className="muted">{detail.board.is_published ? "Currently published" : "Draft only"}</span>
          </div>
          <LineupBuilder
            key={`${board.id}:${detail.boats.map((boat) => `${boat.id}:${boat.seats.map((seat) => seat.id).join(",")}`).join("|")}`}
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
            fleetBoats={(fleetBoats ?? []).map((boat) => {
              const reservation = reservationByBoatId.get(boat.id);
              const profile = Array.isArray(reservation?.profiles) ? reservation?.profiles[0] : reservation?.profiles;
              const memberName = profile?.full_name?.trim() || profile?.email?.split("@")[0] || "another member";
              const participantReservation = Boolean(reservation && rosterMemberIds.has(reservation.created_by));
              const reservationState = !reservation
                ? boat.status
                : isCoachedTraining && reservation.status === "reserved"
                  ? participantReservation ? "reserved_by_participant" : "reserved_by_nonparticipant"
                  : "unavailable";
              return {
                ...boat,
                status: reservationState,
                reservation: reservation ? { id: reservation.id, member_name: memberName, start_time: reservation.start_time, end_time: reservation.end_time } : null,
              };
            })}
            isCoachedTraining={isCoachedTraining}
            participantReservations={(conflictingReservations ?? []).map((reservation) => ({
              id: reservation.id,
              boat_id: reservation.boat_id,
              member_ids: [...new Set([reservation.created_by, ...((reservation.reservation_crew ?? []).map((crew) => crew.member_id))])].filter((memberId) => rosterMemberIds.has(memberId)),
            })).filter((reservation) => reservation.member_ids.length > 0)}
          />
        </Card>
      </main>
    </>
  );
}
