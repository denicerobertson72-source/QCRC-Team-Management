import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { getLineupBoardDetail, getPublishedLineups } from "@/lib/queries";
import { formatEasternDateTime } from "@/lib/time";

function seatLabel(boatClassId: string, seatNumber: number) {
  if (boatClassId === "1x") return "Sculler";
  if (boatClassId === "2x") return seatNumber === 1 ? "Stroke" : "Bow";
  if (boatClassId === "4x") {
    if (seatNumber === 4) return "Bow";
    if (seatNumber === 3) return "Seat 2";
    if (seatNumber === 2) return "Seat 3";
    return "Stroke";
  }
  return `Seat ${seatNumber}`;
}

function orderedSeats<T extends { seat_number: number }>(boatClassId: string, seats: T[]) {
  if (boatClassId !== "4x") return seats;
  const order = new Map([
    [4, 0],
    [3, 1],
    [2, 2],
    [1, 3],
  ]);
  return [...seats].sort((a, b) => (order.get(a.seat_number) ?? a.seat_number) - (order.get(b.seat_number) ?? b.seat_number));
}

export default async function LineupsPage() {
  const boards = await getPublishedLineups();

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Published Lineups" subtitle="See your boats, teammates, and seat order." />

        {boards.length === 0 ? <Card subtle>No published lineups yet.</Card> : null}

        <div className="stack">
          {await Promise.all(
            boards.map(async (board) => {
              const detail = await getLineupBoardDetail(board.id);
              const race = Array.isArray(board.race_events) ? board.race_events[0] : board.race_events;
              const session = Array.isArray(board.sessions) ? board.sessions[0] : board.sessions;

              return (
                <Card key={board.id} className="stack">
                  <h3>{board.title}</h3>
                  {race ? <p className="muted">{race.title} | {race.event_date}</p> : null}
                  {session ? <p className="muted">{formatEasternDateTime(session.starts_at)} ET</p> : null}

                  <div className="grid">
                    {detail.boats.map((boat) => (
                      <Card key={boat.id} subtle>
                        <h4>
                          {boat.boat_name} ({boat.boat_class_id})
                        </h4>
                        {"race_time" in boat && boat.race_time ? (
                          <p className="muted">Race time: {formatEasternDateTime(String(boat.race_time))} ET</p>
                        ) : null}
                        <ul>
                          {orderedSeats(boat.boat_class_id, boat.seats).map((seat) => (
                            <li key={seat.id}>
                              {seatLabel(boat.boat_class_id, seat.seat_number)}: {seat.member_name ?? "TBD"}
                            </li>
                          ))}
                        </ul>
                      </Card>
                    ))}
                  </div>
                </Card>
              );
            }),
          )}
        </div>
      </main>
    </>
  );
}
