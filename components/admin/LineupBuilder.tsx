"use client";

import { useEffect, useMemo, useState } from "react";
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
  saveAndPublishAction,
  publishAction,
  removeBoatAction,
  lineupBoardId,
  isPublished = false,
  allowMultiSeat = false,
  returnTo,
}: {
  boats: Boat[];
  roster: RosterMember[];
  action: (formData: FormData) => void;
  saveAndPublishAction?: (formData: FormData) => void;
  publishAction?: (formData: FormData) => void;
  removeBoatAction: (formData: FormData) => void;
  lineupBoardId?: string;
  isPublished?: boolean;
  allowMultiSeat?: boolean;
  returnTo?: string;
}) {
  const [localBoats, setLocalBoats] = useState<Boat[]>(boats);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(allowMultiSeat ? roster[0]?.id ?? null : null);
  const [mobileRosterOpen, setMobileRosterOpen] = useState(false);
  const [activeBoatId, setActiveBoatId] = useState<string | null>(boats[0]?.id ?? null);

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
  const sortedRoster = useMemo(() => [...roster].sort((a, b) => a.full_name.localeCompare(b.full_name)), [roster]);
  const sortedUnassigned = useMemo(
    () => [...unassigned].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [unassigned],
  );
  const pickerMembers = allowMultiSeat ? sortedRoster : sortedUnassigned;

  const memberNameById = useMemo(() => {
    return new Map(roster.map((member) => [member.id, member.full_name]));
  }, [roster]);

  const selectedMember =
    selectedMemberId ? roster.find((member) => member.id === selectedMemberId) ?? null : null;
  const totalSeats = useMemo(() => localBoats.reduce((count, boat) => count + boat.seats.length, 0), [localBoats]);
  const assignedSeats = useMemo(
    () => localBoats.reduce((count, boat) => count + boat.seats.filter((seat) => seat.member_id).length, 0),
    [localBoats],
  );
  const emptySeats = Math.max(totalSeats - assignedSeats, 0);

  useEffect(() => {
    if (!activeBoatId || !localBoats.some((boat) => boat.id === activeBoatId)) {
      setActiveBoatId(localBoats[0]?.id ?? null);
    }
  }, [activeBoatId, localBoats]);

  useEffect(() => {
    if (selectedMemberId === null) {
      return;
    }
    if (pickerMembers.some((member) => member.id === selectedMemberId)) {
      return;
    }
    setSelectedMemberId(pickerMembers[0]?.id ?? null);
  }, [pickerMembers, selectedMemberId]);

  function onDropMember(seatId: string, memberId: string, advanceSelection = false) {
    let nextSelectedMemberId: string | null = selectedMemberId;
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

      if (advanceSelection && !allowMultiSeat) {
        const assignedIds = new Set<string>();
        for (const boat of next) {
          for (const seat of boat.seats) {
            if (seat.member_id) assignedIds.add(seat.member_id);
          }
        }
        nextSelectedMemberId =
          sortedRoster.find((member) => !assignedIds.has(member.id) && member.id !== memberId)?.id ?? null;
      }

      return next;
    });
    if (advanceSelection && !allowMultiSeat) {
      setSelectedMemberId(nextSelectedMemberId);
    }
    setMobileRosterOpen(false);
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
      <div className="card stack lineup-progress-card">
        <div className="page-title">
          <h3>Assignment Progress</h3>
          <span className="muted">
            {assignedSeats}/{totalSeats} seats assigned
          </span>
        </div>
        <div className="row lineup-progress-summary">
          <span className="card-subtle lineup-progress-pill">Assigned: {assignedSeats}</span>
          <span className="card-subtle lineup-progress-pill">{allowMultiSeat ? `Roster: ${roster.length}` : `Unassigned: ${sortedUnassigned.length}`}</span>
          <span className="card-subtle lineup-progress-pill">Empty seats: {emptySeats}</span>
        </div>
        <div className="lineup-mobile-toolbar">
          <div className="stack lineup-selected-member">
            <strong>{selectedMember ? selectedMember.full_name : "No rower selected"}</strong>
            <span className="muted">
              {selectedMember
                ? allowMultiSeat
                  ? "Selected for quick assignment to multiple seats."
                  : "Tap a seat button below to place this rower quickly."
                : "Choose a rower to assign without jumping back to the top of the page."}
            </span>
          </div>
          <div className="row lineup-mobile-toolbar-actions">
            <Button type="button" variant="secondary" onClick={() => setMobileRosterOpen(true)}>
              {allowMultiSeat ? "Open Roster" : `Choose Rower (${sortedUnassigned.length})`}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setSelectedMemberId(null)}>
              Clear Selected
            </Button>
          </div>
        </div>
      </div>

      <div className="card stack lineup-desktop-roster">
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
              className={`card-subtle lineup-member-chip${selectedMemberId === member.id ? " lineup-member-chip-active" : ""}`}
              style={{ cursor: "grab" }}
              onClick={() => setSelectedMemberId(member.id)}
            >
              {member.full_name}
            </div>
          ))}
          {unassigned.length === 0 ? <p className="muted">Everyone is assigned.</p> : null}
        </div>
      </div>

      <div className="lineup-boat-tabs" role="tablist" aria-label="Lineup boats">
        {localBoats.map((boat) => {
          const boatAssignedCount = boat.seats.filter((seat) => seat.member_id).length;
          return (
            <button
              key={boat.id}
              type="button"
              className={`lineup-boat-tab${boat.id === activeBoatId ? " lineup-boat-tab-active" : ""}`}
              onClick={() => setActiveBoatId(boat.id)}
            >
              {boat.boat_name} ({boatAssignedCount}/{boat.seats.length})
            </button>
          );
        })}
      </div>

      {mobileRosterOpen ? (
        <div className="lineup-roster-sheet" role="dialog" aria-modal="true" aria-label="Select a rower">
          <button type="button" className="lineup-roster-sheet-backdrop" onClick={() => setMobileRosterOpen(false)} aria-label="Close roster picker" />
          <div className="card stack lineup-roster-sheet-panel">
            <div className="page-title">
              <h3>{allowMultiSeat ? "Roster" : "Choose a Rower"}</h3>
              <Button type="button" variant="secondary" onClick={() => setMobileRosterOpen(false)}>
                Close
              </Button>
            </div>
            <div className="stack lineup-roster-sheet-list">
              {pickerMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className={`lineup-roster-sheet-item${selectedMemberId === member.id ? " lineup-roster-sheet-item-active" : ""}`}
                  onClick={() => {
                    setSelectedMemberId(member.id);
                    setMobileRosterOpen(false);
                  }}
                >
                  {member.full_name}
                </button>
              ))}
              {pickerMembers.length === 0 ? <p className="muted">Everyone is assigned.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid">
        {localBoats.map((boat) => (
          <div
            key={boat.id}
            className="card stack lineup-boat-card"
            data-mobile-active={boat.id === activeBoatId ? "true" : "false"}
          >
            <div className="page-title lineup-boat-header">
              <div className="stack">
                <h3>
                  {boat.boat_name} ({boat.boat_class_id})
                </h3>
                <span className="muted">
                  {boat.seats.filter((seat) => seat.member_id).length}/{boat.seats.length} seats assigned
                </span>
              </div>
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
                  <div className="lineup-seat-quick-actions">
                    {selectedMember ? (
                      <Button
                        type="button"
                        onClick={() => onDropMember(seat.id, selectedMember.id, true)}
                      >
                        {seat.member_id === selectedMember.id ? `Keep ${selectedMember.full_name}` : `Assign ${selectedMember.full_name}`}
                      </Button>
                    ) : (
                      <Button type="button" variant="secondary" onClick={() => setMobileRosterOpen(true)}>
                        Choose a rower first
                      </Button>
                    )}
                  </div>
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

      <div className="card lineup-action-bar">
        <div className="stack lineup-action-copy">
          <strong>{isPublished ? "Published lineup" : "Draft lineup"}</strong>
          <span className="muted">
            Save your changes here, then publish when the lineup is ready for rowers to see.
          </span>
        </div>
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
    </div>
  );
}
