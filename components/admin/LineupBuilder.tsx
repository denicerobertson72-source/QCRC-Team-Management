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
    if (seatNumber === 1) return "Stroke";
    if (seatNumber === 4) return "Bow";
    return `Seat ${seatNumber}`;
  }
  return `Seat ${seatNumber}`;
}

export function LineupBuilder({
  boats,
  roster,
  action,
  allowMultiSeat = false,
  returnTo,
}: {
  boats: Boat[];
  roster: RosterMember[];
  action: (formData: FormData) => void;
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

  const assignmentsJson = JSON.stringify(
    localBoats.flatMap((boat) => boat.seats.map((seat) => ({ seatId: seat.id, memberId: seat.member_id }))),
  );

  return (
    <div className="stack">
      <div className="card stack">
        <h3>Unassigned Rowers</h3>
        <div className="row">
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
          <div key={boat.id} className="card stack">
            <h3>
              {boat.boat_name} ({boat.boat_class_id})
            </h3>
            {boat.seats.map((seat) => (
              <div
                key={seat.id}
                className="card-subtle row"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const memberId = event.dataTransfer.getData("text/member-id");
                  if (!memberId) return;
                  onDropMember(seat.id, memberId);
                }}
                style={{ justifyContent: "space-between" }}
              >
                <strong>{seatLabel(boat.boat_class_id, seat.seat_number)}</strong>
                <span>{seat.member_name ?? "Drop rower here"}</span>
                <Button type="button" variant="secondary" onClick={() => clearSeat(seat.id)}>
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
