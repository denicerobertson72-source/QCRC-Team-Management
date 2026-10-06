import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { LineupBuilder } from "@/components/admin/LineupBuilder";
import {
  createLineupBoardAdminAction,
  addLineupBoatAdminAction,
  removeLineupBoatAdminAction,
  publishLineupBoardAdminAction,
  saveLineupAssignmentsAdminAction,
  saveAndPublishLineupAssignmentsAdminAction,
  updateLineupBoatRaceTimeAdminAction,
  updateRaceEntryTypeAdminAction,
} from "@/lib/actions";
import { getLineupBoardDetail, getRosterForBoard } from "@/lib/queries";
import { findRaceConflicts, type RaceCommitment } from "@/lib/race-conflicts";

export default async function RaceLineupPage({ params }: { params: Promise<{ raceId: string }> }) {
  const { raceId } = await params;
  const { supabase } = await ensureAdminProfile();
  const returnTo = `/admin/races/${raceId}/lineup`;

  const { data: race } = await supabase.from("race_events").select("id, title, event_date, entry_type").eq("id", raceId).maybeSingle();

  const { data: board } = await supabase
    .from("lineup_boards")
    .select("id, title, is_published")
    .eq("board_type", "racing")
    .eq("race_event_id", raceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!race) {
    return (
      <>
        <TopNav />
        <main className="stack">
          <Card>Race not found.</Card>
        </main>
      </>
    );
  }

  if (!board) {
    return (
      <>
        <TopNav />
        <main className="stack">
          <PageTitle title={`Regatta Lineups: ${race.title}`} subtitle={race.event_date} />
          <form action={createLineupBoardAdminAction} className="card form-grid">
            <input type="hidden" name="board_type" value="racing" />
            <input type="hidden" name="race_event_id" value={race.id} />
            <input type="hidden" name="title" value={`${race.title} Lineup`} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Button type="submit">Create Race Lineup Board</Button>
          </form>
        </main>
      </>
    );
  }

  const [detail, roster, fleetResult, settingsResult, raceBoardsResult] = await Promise.all([
    getLineupBoardDetail(board.id),
    getRosterForBoard("racing", race.id),
    supabase.from("boats").select("id, name, boat_class_id, status").order("boat_class_id").order("name"),
    supabase.from("racing_planning_settings").select("minimum_race_turnaround_minutes").eq("id", true).maybeSingle(),
    supabase.from("lineup_boards").select("id, race_event_id, race_events(title)").eq("board_type", "racing"),
  ]);
  const raceBoards = raceBoardsResult.data ?? [];
  const allBoardIds = raceBoards.map((item) => item.id);
  const { data: allRaceBoats } = allBoardIds.length
    ? await supabase.from("lineup_boats").select("id, lineup_board_id, boat_name, fleet_boat_id, race_time").in("lineup_board_id", allBoardIds)
    : { data: [] };
  const allBoatIds = (allRaceBoats ?? []).map((item) => item.id);
  const { data: allRaceSeats } = allBoatIds.length
    ? await supabase.from("lineup_seats").select("lineup_boat_id, member_id, profiles(full_name)").in("lineup_boat_id", allBoatIds)
    : { data: [] };
  const seatsByBoat = new Map<string, { member_id: string | null; profiles: unknown }[]>();
  (allRaceSeats ?? []).forEach((seat: any) => seatsByBoat.set(seat.lineup_boat_id, [...(seatsByBoat.get(seat.lineup_boat_id) ?? []), seat]));
  const boardById = new Map(raceBoards.map((item: any) => [item.id, item]));
  const commitments: RaceCommitment[] = (allRaceBoats ?? []).map((boat: any) => {
    const boardInfo: any = boardById.get(boat.lineup_board_id);
    const event = Array.isArray(boardInfo?.race_events) ? boardInfo.race_events[0] : boardInfo?.race_events;
    return { raceId: boardInfo?.race_event_id ?? boat.lineup_board_id, raceTitle: event?.title ?? "Race", boatId: boat.fleet_boat_id, boatName: boat.boat_name, raceTime: boat.race_time, memberIds: (seatsByBoat.get(boat.id) ?? []).map((seat) => seat.member_id).filter(Boolean) as string[] };
  });
  const turnaroundMinutes = settingsResult.data?.minimum_race_turnaround_minutes ?? 30;
  const conflicts = findRaceConflicts(commitments, turnaroundMinutes);
  const nameByMember = new Map<string, string>();
  (allRaceSeats ?? []).forEach((seat: any) => {
    const profile = Array.isArray(seat.profiles) ? seat.profiles[0] : seat.profiles;
    if (seat.member_id) nameByMember.set(seat.member_id, profile?.full_name ?? "Rower");
  });
  const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(value)) : "unscheduled";
  const currentBoatMessages: Record<string, string[]> = {};
  const fleetBoatMessages: Record<string, string[]> = {};
  conflicts.boat.forEach((conflict) => {
    const message = `Also assigned to ${conflict.first.raceTitle} at ${formatTime(conflict.first.raceTime)} — ${conflict.minutesApart} min apart`;
    const relevant = [conflict.first, conflict.second].filter((item) => item.raceId === race.id);
    relevant.forEach((item) => {
      const currentBoat = detail.boats.find((boat) => boat.fleet_boat_id === item.boatId);
      if (currentBoat) currentBoatMessages[currentBoat.id] = [...(currentBoatMessages[currentBoat.id] ?? []), message];
    });
    if (conflict.second.raceId !== race.id && conflict.second.boatId) fleetBoatMessages[conflict.second.boatId] = [...(fleetBoatMessages[conflict.second.boatId] ?? []), message];
    if (conflict.first.raceId !== race.id && conflict.first.boatId) fleetBoatMessages[conflict.first.boatId] = [...(fleetBoatMessages[conflict.first.boatId] ?? []), `Also assigned to ${conflict.second.raceTitle} at ${formatTime(conflict.second.raceTime)} — ${conflict.minutesApart} min apart`];
  });
  const currentRowerConflicts = conflicts.rower.filter((conflict) => conflict.first.raceId === race.id || conflict.second.raceId === race.id);

  return (
    <>
      <TopNav />
      <main className="stack">
          <PageTitle title={`Regatta Lineups: ${race.title}`} subtitle={race.event_date} />

        <Card className="stack">
          <div className="page-title">
            <h3>{detail.board.title}</h3>
            <span className="muted">{detail.board.is_published ? "Currently published" : "Draft only"}</span>
          </div>
          <form action={updateRaceEntryTypeAdminAction} className="card-subtle inline-form">
            <input type="hidden" name="race_event_id" value={race.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Field label="Lineup type">
              <select name="entry_type" defaultValue={race.entry_type ?? "masters"}>
                <option value="masters">Masters / QCRC lineup</option>
                <option value="youth_boat_only">Youth boat-only use</option>
              </select>
            </Field>
            <Button type="submit" variant="secondary">Update type</Button>
          </form>
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
            fleetBoats={fleetResult.data ?? []}
            autoSaveAssignments
            boatOnly={race.entry_type === "youth_boat_only"}
            boatConflictMessages={fleetBoatMessages}
            raceTimeAction={updateLineupBoatRaceTimeAdminAction}
            eventScopedAssignments
          />

          {(currentRowerConflicts.length > 0 || Object.keys(currentBoatMessages).length > 0) ? <Card subtle className="stack">
            <h3>Race planning conflicts</h3>
            <p className="muted">Warnings use a {turnaroundMinutes}-minute turnaround and never block an intentional assignment.</p>
            {Object.entries(currentBoatMessages).map(([boatId, messages]) => <p key={boatId} className="error">⚠ {detail.boats.find((boat) => boat.id === boatId)?.boat_name}: {messages.join(" ")}</p>)}
            {currentRowerConflicts.map((conflict) => <p key={`${conflict.resourceId}-${conflict.first.raceId}-${conflict.second.raceId}`} className="error">⚠ {nameByMember.get(conflict.resourceId) ?? "Rower"}: {conflict.first.raceTitle} {formatTime(conflict.first.raceTime)} / {conflict.second.raceTitle} {formatTime(conflict.second.raceTime)} ({conflict.minutesApart} min apart)</p>)}
          </Card> : null}

        </Card>
      </main>
    </>
  );
}
