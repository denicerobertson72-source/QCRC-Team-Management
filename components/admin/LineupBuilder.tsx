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
  removeBoatAction,
  allowMultiSeat = false,
  returnTo,
}: {
  boats: Boat[];
  roster: RosterMember[];
  action: (formData: FormData) => void;
  removeBoatAction: (formData: FormData) => void;
  allowMultiSeat?: boolean;
  returnTo?: string;
}) {
  const [localBoats, setLocalBoats] = useState<Boat[]>(boats);

  const assignedMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const boat of localBoats) {
      for (const seat of boat.seats) {
        if (seat.member_id) ids.add(seat.member_id);
      }
    }
    return ids;
  }, [localBoats]);

  const unassigned = allowMultiSeat ? roster : roster.filter((member) => !assignedMemberIds.has(member.id));

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
    const sortedRoster = [...roster].sort((a, b) => a.full_name.localeCompare(b.full_name));
    const available = sortedRoster.filter((member) => !assignedMemberIds.has(member.id) || member.id === currentMemberId);
    const assignedElsewhere = allowMultiSeat
      ? []
      : sortedRoster.filter((member) => assignedMemberIds.has(member.id) && member.id !== currentMemberId);

    return { available, assignedElsewhere };
  }

  const assignmentsJson = JSON.stringify(
    localBoats.flatMap((boat) => boat.seats.map((seat) => ({ seatId: seat.id, memberId: seat.member_id }))),
  );

  return (
    <div className="stack">
      <div className="card stack">
        <h3>Unassigned Rowers</h3>
        <p className="muted">Use the seat dropdowns on phone or drag-and-drop on desktop. Once a rower is assigned, they disappear from the remaining unassigned options.</p>
        <div className="row lineup-unassigned-list">
          {unassigned.map((member) => (
            <div
              key={member.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/member-id", member.id);
              }}
              className="card-subtle"
              style={{ cursor: "grab" }}
            >
              {member.full_name}
            </div>
          ))}
          {unassigned.length === 0 ? <p className="muted">Everyone is assigned.</p> : null}
        </div>
      </div>

      <div className="grid">
        {localBoats.map((boat) => (
          <div key={boat.id} className="card stack lineup-boat-card">
            <div className="page-title lineup-boat-header">
              <h3>
                {boat.boat_name} ({boat.boat_class_id})
              </h3>
              <form action={removeBoatAction} className="inline-form lineup-boat-remove">
                <input type="hidden" name="lineup_boat_id" value={boat.id} />
                {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
                <Button type="submit" variant="secondary">
                  Remove Boat
                </Button>
              </form>
            </div>
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
                    {seatOptions(seat.member_id).available.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name}
                      </option>
                    ))}
                    {!allowMultiSeat && seatOptions(seat.member_id).assignedElsewhere.length > 0 ? (
                      <optgroup label="Move from another boat">
                        {seatOptions(seat.member_id).assignedElsewhere.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.full_name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  <span className="muted">{seat.member_id ? `Assigned: ${memberNameById.get(seat.member_id) ?? seat.member_name}` : "No rower assigned yet."}</span>
                </div>
                <Button type="button" variant="secondary" className="lineup-seat-clear" onClick={() => clearSeat(seat.id)}>
                  Clear
                </Button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <form action={action} className="inline-form">
        <input type="hidden" name="assignments_json" value={assignmentsJson} />
        {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
        <Button type="submit">Save Lineup Assignments</Button>
      </form>
    </div>
  );
}
