"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";

type RosterMember = {
  id: string;
  full_name: string;
};

type Seat = {
  id: string;
  seat_number: number;
  member_id: string | null;
  member_name: string | null;
};

type Boat = {
  id: string;
  boat_name: string;
  boat_class_id: string;
  seats: Seat[];
};
type FleetBoat = { id: string; name: string; boat_class_id: string; status: string };

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

function orderedSeats(boatClassId: string, seats: Seat[]) {
  if (boatClassId !== "4x") return seats;
  const order = new Map([
    [4, 0],
    [3, 1],
    [2, 2],
    [1, 3],
  ]);
  return [...seats].sort((a, b) => (order.get(a.seat_number) ?? a.seat_number) - (order.get(b.seat_number) ?? b.seat_number));
}

export function LineupBuilder({
  boats,
  roster,
  action,
  addBoatAction,
  saveAndPublishAction,
  publishAction,
  removeBoatAction,
  lineupBoardId,
  isPublished = false,
  allowMultiSeat = false,
  returnTo,
  fleetBoats = [],
}: {
  boats: Boat[];
  roster: RosterMember[];
  action: (formData: FormData) => void;
  addBoatAction: (formData: FormData) => void;
  saveAndPublishAction?: (formData: FormData) => void;
  publishAction?: (formData: FormData) => void;
  removeBoatAction: (formData: FormData) => void;
  lineupBoardId?: string;
  isPublished?: boolean;
  allowMultiSeat?: boolean;
  returnTo?: string;
  fleetBoats?: FleetBoat[];
}) {
  const [localBoats, setLocalBoats] = useState<Boat[]>(boats);
  const [newBoatClass, setNewBoatClass] = useState("4x");

  const assignedMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const boat of localBoats) {
      for (const seat of boat.seats) {
        if (seat.member_id) ids.add(seat.member_id);
      }
    }
    return ids;
  }, [localBoats]);

  const sortedRoster = useMemo(() => [...roster].sort((a, b) => a.full_name.localeCompare(b.full_name)), [roster]);
  const unassignedRoster = useMemo(
    () => sortedRoster.filter((member) => !assignedMemberIds.has(member.id)),
    [assignedMemberIds, sortedRoster],
  );

  const memberNameById = useMemo(() => {
    return new Map(roster.map((member) => [member.id, member.full_name]));
  }, [roster]);

  function onDropMember(seatId: string, memberId: string) {
    setLocalBoats((prev) => {
      const next = prev.map((boat) => ({ ...boat, seats: boat.seats.map((seat) => ({ ...seat })) }));

      if (!allowMultiSeat) {
        for (const boat of next) {
          for (const seat of boat.seats) {
            if (seat.member_id === memberId) {
              seat.member_id = null;
              seat.member_name = null;
            }
          }
        }
      }

      const member = roster.find((m) => m.id === memberId);
      for (const boat of next) {
        for (const seat of boat.seats) {
          if (seat.id === seatId) {
            seat.member_id = memberId;
            seat.member_name = member?.full_name ?? null;
          }
        }
      }

      return next;
    });
  }

  function clearSeat(seatId: string) {
    setLocalBoats((prev) =>
      prev.map((boat) => ({
        ...boat,
        seats: boat.seats.map((seat) =>
          seat.id === seatId
            ? {
                ...seat,
                member_id: null,
                member_name: null,
              }
            : seat,
        ),
      })),
    );
  }

  function seatOptions(currentMemberId: string | null) {
    return sortedRoster.filter((member) => !assignedMemberIds.has(member.id) || member.id === currentMemberId);
  }

  const assignmentsJson = JSON.stringify(
    localBoats.flatMap((boat) => boat.seats.map((seat) => ({ seatId: seat.id, memberId: seat.member_id }))),
  );
  const boatsWithOpenSeats = localBoats
    .map((boat) => ({ boat, openSeats: boat.seats.filter((seat) => !seat.member_id).length }))
    .filter((item) => item.openSeats > 0);

  return (
    <div className="stack">
      <div className="card lineup-top-actions">
        <div className="row lineup-action-buttons">
          <form action={action} className="inline-form">
            <input type="hidden" name="assignments_json" value={assignmentsJson} />
            {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
            <Button type="submit">Save Assignments</Button>
          </form>
          {!isPublished && saveAndPublishAction && lineupBoardId ? (
            <form action={saveAndPublishAction} className="inline-form">
              <input type="hidden" name="lineup_board_id" value={lineupBoardId} />
              <input type="hidden" name="assignments_json" value={assignmentsJson} />
              {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
              <Button type="submit" variant="secondary">Save + Publish</Button>
            </form>
          ) : null}
          {isPublished && publishAction && lineupBoardId ? (
            <form action={publishAction} className="inline-form">
              <input type="hidden" name="lineup_board_id" value={lineupBoardId} />
              <input type="hidden" name="publish" value="false" />
              {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
              <Button type="submit" variant="secondary">Unpublish</Button>
            </form>
          ) : null}
        </div>
      </div>

      {lineupBoardId ? (
        <form action={addBoatAction} className="card form-grid lineup-add-boat-form">
          <input type="hidden" name="lineup_board_id" value={lineupBoardId} />
          {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
          <h3>Add Fleet Boats</h3>
          <div className="lineup-add-boat-fields">
            <div>
              <label className="field-label">Boat size</label>
              <select name="boat_class_id" value={newBoatClass} onChange={(event) => setNewBoatClass(event.target.value)}>
                <option value="1x">1x</option>
                <option value="2x">2x</option>
                <option value="4x">4x</option>
                <option value="8x">8x</option>
              </select>
            </div>
          </div>
          <div className="stack">
            {fleetBoats.filter((boat) => boat.boat_class_id === newBoatClass && boat.status === "available").map((boat) => (
              <label key={boat.id}><input type="checkbox" name="boat_ids" value={boat.id} /> {boat.name}</label>
            ))}
            {fleetBoats.filter((boat) => boat.boat_class_id === newBoatClass && boat.status === "available").length === 0 ? <p className="muted">No available fleet boats of this size.</p> : null}
            {newBoatClass === "1x" ? <label><input type="checkbox" name="private_boat" value="true" /> Private boat</label> : null}
          </div>
          <Button type="submit">Add Selected Boats</Button>
        </form>
      ) : null}

      {!allowMultiSeat ? (
        <div className="card stack lineup-unassigned-box">
          <div className="page-title">
            <h3>Unassigned Rowers</h3>
            <span className="muted">{unassignedRoster.length} remaining</span>
          </div>
          {unassignedRoster.length > 0 ? (
            <div className="row lineup-unassigned-list">
              {unassignedRoster.map((member) => (
                <span key={member.id} className="card-subtle lineup-unassigned-chip">
                  {member.full_name}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">Everyone is assigned.</p>
          )}
        </div>
      ) : null}

      {boatsWithOpenSeats.length > 0 ? (
        <div className="card lineup-open-seats-summary">
          <div className="page-title">
            <div>
              <h3>Open Seats</h3>
              <p className="muted">Tap a boat to jump directly to the remaining assignment.</p>
            </div>
          </div>
          <div className="stack" style={{ gap: "0.45rem" }}>
            {boatsWithOpenSeats.map(({ boat, openSeats }) => (
              <a key={boat.id} href={`#lineup-boat-${boat.id}`} className="lineup-open-seat-link">
                {openSeats} person{openSeats === 1 ? "" : "s"} missing from {boat.boat_name} ({boat.boat_class_id})
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid">
        {localBoats.map((boat) => {
          const openSeats = boat.seats.filter((seat) => !seat.member_id).length;
          return (
          <details key={boat.id} id={`lineup-boat-${boat.id}`} className="card lineup-boat-card lineup-boat-collapsible" open={openSeats > 0}>
            <summary className="lineup-boat-summary">
              <div className="stack">
                <h3>
                  {boat.boat_name} ({boat.boat_class_id})
                </h3>
                <span className="muted">
                  {boat.seats.filter((seat) => seat.member_id).length}/{boat.seats.length} seats assigned
                </span>
              </div>
              <span className={openSeats > 0 ? "error" : "member-summary-hint"}>
                {openSeats > 0 ? `${openSeats} open` : "Assigned · expand"}
              </span>
            </summary>
            <div className="lineup-boat-details stack">
              <form action={removeBoatAction} className="inline-form lineup-boat-remove">
                <input type="hidden" name="lineup_boat_id" value={boat.id} />
                {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
                <Button type="submit" variant="secondary">
                  Remove Boat
                </Button>
              </form>
            {orderedSeats(boat.boat_class_id, boat.seats).map((seat) => (
              <div
                key={seat.id}
                className="card-subtle row lineup-seat-card"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const memberId = event.dataTransfer.getData("text/member-id");
                  if (!memberId) return;
                  onDropMember(seat.id, memberId);
                }}
                style={{ justifyContent: "space-between" }}
              >
                <strong className="lineup-seat-label">{seatLabel(boat.boat_class_id, seat.seat_number)}</strong>
                <div className="stack lineup-seat-controls">
                  <select
                    value={seat.member_id ?? ""}
                    onChange={(event) => {
                      const nextMemberId = event.target.value;
                      if (!nextMemberId) {
                        clearSeat(seat.id);
                        return;
                      }
                      onDropMember(seat.id, nextMemberId);
                    }}
                  >
                    <option value="">Select a rower</option>
                    {seatOptions(seat.member_id).map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                  <span className="muted">{seat.member_id ? `Assigned: ${memberNameById.get(seat.member_id) ?? seat.member_name}` : "No rower assigned yet."}</span>
                </div>
                <Button type="button" variant="secondary" className="lineup-seat-clear" onClick={() => clearSeat(seat.id)}>
                  Clear
                </Button>
              </div>
            ))}
            </div>
          </details>
          );
        })}
      </div>

      {localBoats.length === 0 ? <p className="muted">No boats added yet.</p> : null}
    </div>
  );
}
