import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { LineupBuilder } from "@/components/admin/LineupBuilder";
import { toEasternDateTimeLocalValue } from "@/lib/time";
import {
  addLineupBoatAdminAction,
  createLineupBoardAdminAction,
  publishLineupBoardAdminAction,
  saveLineupAssignmentsAdminAction,
  updateLineupBoatRaceTimeAdminAction,
} from "@/lib/actions";
import { getLineupBoardDetail, getRosterForBoard } from "@/lib/queries";

export default async function RaceLineupPage({ params }: { params: Promise<{ raceId: string }> }) {
  const { raceId } = await params;
  const { supabase } = await ensureAdminProfile();
  const returnTo = `/admin/races/${raceId}/lineup`;

  const { data: race } = await supabase.from("race_events").select("id, title, event_date").eq("id", raceId).maybeSingle();

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
          <PageTitle title={`Race Lineup: ${race.title}`} subtitle={race.event_date} />
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

  const detail = await getLineupBoardDetail(board.id);
  const roster = await getRosterForBoard("racing", race.id);

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title={`Race Lineup: ${race.title}`} subtitle={race.event_date} />

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

          <div className="stack">
            {detail.boats.map((boat) => (
              <form key={boat.id} action={updateLineupBoatRaceTimeAdminAction} className="inline-form">
                <input type="hidden" name="lineup_boat_id" value={boat.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <Field label={`${boat.boat_name} race time`}>
                  <input
                    name="race_time"
                    type="datetime-local"
                    defaultValue={toEasternDateTimeLocalValue(boat.race_time ? String(boat.race_time) : null)}
                  />
                </Field>
                <Button type="submit" variant="secondary">
                  Save Time
                </Button>
              </form>
            ))}
          </div>

          <LineupBuilder
            boats={detail.boats}
            roster={roster}
            action={saveLineupAssignmentsAdminAction}
            allowMultiSeat
            returnTo={returnTo}
          />
        </Card>
      </main>
    </>
  );
}
