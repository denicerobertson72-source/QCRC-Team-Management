"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useAppFreshness } from "@/components/AppFreshnessProvider";

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
  fleet_boat_id?: string | null;
  seats: Seat[];
};
type ParticipantReservation = { id: string; boat_id: string; member_ids: string[] };
type PublishReconciliation = {
  memberId: string;
  memberName: string;
  assignedBoat: string;
  assignedBoatId: string;
  reservedBoat: string | null;
  reservedBoatId: string | null;
  reservationId: string | null;
};
type FleetBoat = {
  id: string;
  name: string;
  boat_class_id: string;
  status: "available" | "reserved_by_participant" | "reserved_by_nonparticipant" | "unavailable" | string;
  reservation?: {
    id: string;
    member_name: string;
    start_time: string;
    end_time: string;
  } | null;
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
  addBoatAction,
  saveAndPublishAction,
  publishAction,
  removeBoatAction,
  lineupBoardId,
  isPublished = false,
  allowMultiSeat = false,
  returnTo,
  fleetBoats = [],
  participantReservations = [],
  isCoachedTraining = false,
  isAdvancedTraining = false,
}: {
  boats: Boat[];
  roster: RosterMember[];
  action: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
  addBoatAction: (formData: FormData) => Promise<void | { ok: boolean; message?: string }>;
  saveAndPublishAction?: (formData: FormData) => Promise<{ ok: boolean; code?: string; message?: string }>;
  publishAction?: (formData: FormData) => void;
  removeBoatAction: (formData: FormData) => void;
  lineupBoardId?: string;
  isPublished?: boolean;
  allowMultiSeat?: boolean;
  returnTo?: string;
  fleetBoats?: FleetBoat[];
  participantReservations?: ParticipantReservation[];
  isCoachedTraining?: boolean;
  isAdvancedTraining?: boolean;
}) {
  const [localBoats, setLocalBoats] = useState<Boat[]>(boats);
  const [newBoatClass, setNewBoatClass] = useState("4x");
  const [privateBoatQuantity, setPrivateBoatQuantity] = useState(1);
  const [selectedFleetBoatIds, setSelectedFleetBoatIds] = useState<Set<string>>(new Set());
  const [fleetSelectionError, setFleetSelectionError] = useState(false);
  const [confirmedOverrideReservationIds, setConfirmedOverrideReservationIds] = useState<Set<string>>(new Set());
  const [pendingOverrideBoat, setPendingOverrideBoat] = useState<FleetBoat | null>(null);
  const [publishConfirmationOpen, setPublishConfirmationOpen] = useState(false);
  const [confirmedReconciliationSignature, setConfirmedReconciliationSignature] = useState<string | null>(null);
  const [reservationConfirmationErrorSignature, setReservationConfirmationErrorSignature] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ title: string; message: string } | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isPublishing, startPublishing] = useTransition();
  const saveFormRef = useRef<HTMLFormElement>(null);
  const publishFormRef = useRef<HTMLFormElement>(null);
  const actionErrorDialogRef = useRef<HTMLDivElement>(null);
  const actionErrorReturnFocusRef = useRef<HTMLElement | null>(null);
  const reservationConfirmationPanelRef = useRef<HTMLDivElement>(null);
  const reservationConfirmationCheckboxRef = useRef<HTMLInputElement>(null);
  const { ensureFresh, reportActionError, refreshOperationalData, setLineupDirty, staleDataNotice } = useAppFreshness();

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
  const initialAssignmentsJson = useMemo(
    () => JSON.stringify(boats.flatMap((boat) => boat.seats.map((seat) => ({ seatId: seat.id, memberId: seat.member_id })))),
    [boats],
  );
  const hasUnsavedAssignments = assignmentsJson !== initialAssignmentsJson;

  useEffect(() => {
    setLineupDirty(hasUnsavedAssignments);
    return () => setLineupDirty(false);
  }, [hasUnsavedAssignments, setLineupDirty]);
  const boatsWithOpenSeats = localBoats
    .map((boat) => ({ boat, openSeats: boat.seats.filter((seat) => !seat.member_id).length }))
    .filter((item) => item.openSeats > 0);
  const publishReconciliations = useMemo(() => {
    if (!isCoachedTraining) return [] as PublishReconciliation[];
    const assignments = localBoats.flatMap((boat) => boat.seats.filter((seat) => seat.member_id && boat.fleet_boat_id).map((seat) => ({ memberId: seat.member_id!, boat })));
    return assignments.flatMap(({ memberId, boat }) => {
      const matching = participantReservations.some((reservation) => reservation.boat_id === boat.fleet_boat_id && reservation.member_ids.includes(memberId));
      if (matching) return [];
      const previous = participantReservations.find((reservation) => reservation.member_ids.includes(memberId)) ?? null;
      return [{
        memberId,
        memberName: memberNameById.get(memberId) ?? "Participant",
        assignedBoat: boat.boat_name,
        assignedBoatId: boat.fleet_boat_id!,
        reservedBoat: previous ? fleetBoats.find((fleetBoat) => fleetBoat.id === previous.boat_id)?.name ?? "another club boat" : null,
        reservedBoatId: previous?.boat_id ?? null,
        reservationId: previous?.id ?? null,
      }];
    });
  }, [fleetBoats, isCoachedTraining, localBoats, memberNameById, participantReservations]);
  const reconciliationJson = JSON.stringify(publishReconciliations.map((item) => ({ reconciliation_member_id: item.memberId, action: "update" })));
  const advancedReservationChanges = isAdvancedTraining
    ? publishReconciliations.filter((item) => item.reservationId !== null && item.reservedBoatId !== item.assignedBoatId)
    : [];
  const reconciliationSignature = JSON.stringify(advancedReservationChanges.map((item) => ({ memberId: item.memberId, oldBoatId: item.reservedBoatId, newBoatId: item.assignedBoatId })));
  const reservationChangesConfirmed = confirmedReconciliationSignature === reconciliationSignature;
  const reservationConfirmationError = reservationConfirmationErrorSignature === reconciliationSignature;
  const finalAdvancedReservations = useMemo(() => {
    if (!isAdvancedTraining || !isPublished) return [] as Array<{ id: string; boatName: string; memberNames: string[] }>;
    return participantReservations.map((reservation) => ({
      id: reservation.id,
      boatName: fleetBoats.find((boat) => boat.id === reservation.boat_id)?.name ?? "Club boat",
      memberNames: reservation.member_ids.map((memberId) => memberNameById.get(memberId) ?? "Participant"),
    }));
  }, [fleetBoats, isAdvancedTraining, isPublished, memberNameById, participantReservations]);

  const selectableFleetBoats = fleetBoats.filter((boat) =>
    boat.boat_class_id === newBoatClass && (isAdvancedTraining ? boat.status === "held_for_advanced_training" : boat.status !== "unavailable"),
  );
  const advancedTrainingConflicts = isAdvancedTraining
    ? fleetBoats.filter((boat) => boat.boat_class_id === newBoatClass && boat.status === "held_conflict")
    : [];
  const canAddAdvancedPrivateBoat = isAdvancedTraining;

  useEffect(() => {
    if (!actionError) return;
    actionErrorDialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissActionError();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actionError]);

  function showActionError(title: string, message: string) {
    actionErrorReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActionError({ title, message });
  }

  function dismissActionError() {
    setActionError(null);
    requestAnimationFrame(() => actionErrorReturnFocusRef.current?.focus());
  }

  function setBoatSelected(boat: FleetBoat, checked: boolean) {
    if (checked && boat.status === "reserved_by_nonparticipant") {
      setPendingOverrideBoat(boat);
      return;
    }
    setSelectedFleetBoatIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(boat.id);
      else next.delete(boat.id);
      return next;
    });
    if (checked) setFleetSelectionError(false);
    if (!checked && boat.reservation?.id) {
      setConfirmedOverrideReservationIds((previous) => {
        const next = new Set(previous);
        next.delete(boat.reservation!.id);
        return next;
      });
    }
  }

  function confirmOverride() {
    if (!pendingOverrideBoat?.reservation) return;
    setSelectedFleetBoatIds((previous) => new Set(previous).add(pendingOverrideBoat.id));
    setConfirmedOverrideReservationIds((previous) => new Set(previous).add(pendingOverrideBoat.reservation!.id));
    setPendingOverrideBoat(null);
  }

  async function requestAddSelectedBoats(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFleetBoatIds.size === 0) {
      setFleetSelectionError(true);
      return;
    }
    if (!await ensureFresh()) return;
    try {
      const result = await addBoatAction(new FormData(event.currentTarget));
      if (result && !result.ok) {
        showActionError("Unable to add boats", result.message ?? "The selected boats could not be added. Please try again.");
      }
    } catch (error) {
      if (!reportActionError(error)) showActionError("Unable to add boats", "The selected boats could not be added. Please try again.");
    }
  }

  async function requestPrivateBoats(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!await ensureFresh()) return;
    try {
      const result = await addBoatAction(new FormData(event.currentTarget));
      if (result && !result.ok) {
        showActionError("Unable to add private singles", result.message ?? "The private singles could not be added. Please try again.");
      }
    } catch (error) {
      if (!reportActionError(error)) showActionError("Unable to add private singles", "The private singles could not be added. Please try again.");
    }
  }

  async function requestPublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    if (!await ensureFresh()) return;
    if (isAdvancedTraining && advancedReservationChanges.length > 0 && !reservationChangesConfirmed) {
      setReservationConfirmationErrorSignature(reconciliationSignature);
      requestAnimationFrame(() => {
        reservationConfirmationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        reservationConfirmationCheckboxRef.current?.focus();
      });
      return;
    }
    if (!isAdvancedTraining && publishReconciliations.length > 0) {
      setPublishConfirmationOpen(true);
      return;
    }
    submitPublish();
  }

  function requestSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saveFormRef.current) return;
    setActionError(null);
    startSaving(async () => {
      try {
        if (!await ensureFresh()) return;
        const result = await action(new FormData(saveFormRef.current!));
        if (!result.ok) {
          showActionError("Unable to save assignments", result.message ?? "The lineup assignments could not be saved. Please try again.");
          return;
        }
        window.location.assign(returnTo ?? window.location.href);
      } catch (error) {
        if (reportActionError(error)) return;
        showActionError("Unable to save assignments", "The lineup assignments could not be saved. Please try again.");
      }
    });
  }

  function submitPublish() {
    if (!saveAndPublishAction || !publishFormRef.current) return;
    setPublishConfirmationOpen(false);
    startPublishing(async () => {
      try {
        if (!await ensureFresh()) return;
        const result = await saveAndPublishAction(new FormData(publishFormRef.current!));
        if (!result.ok) {
          showActionError("Unable to publish lineup", result.message ?? "The lineup could not be published. Review the reservation reconciliation and try again.");
          return;
        }
        window.location.assign(returnTo ?? "/admin/lineups");
      } catch (error) {
        if (reportActionError(error)) return;
        showActionError("Unable to publish lineup", "The lineup could not be published. Please try again.");
      }
    });
  }

  return (
    <div className="stack">
      {staleDataNotice ? (
        <div className="card-subtle row">
          <span>Session information may have changed while this page was inactive.</span>
          <Button type="button" variant="secondary" onClick={refreshOperationalData}>Refresh session data</Button>
        </div>
      ) : null}
      {!isPublished && isAdvancedTraining && advancedReservationChanges.length > 0 ? (
        <div ref={reservationConfirmationPanelRef} className="card stack" tabIndex={-1} aria-labelledby="advanced-reservation-confirmation-title">
          <h3 id="advanced-reservation-confirmation-title">Reservation changes requiring confirmation</h3>
          <p>These rowers already have a different club-boat reservation. Publishing this lineup will change those reservations to match the final lineup.</p>
          {advancedReservationChanges.map((item) => (
            <div key={item.memberId} className="card-subtle stack">
              <strong>{item.memberName}</strong>
              <span>{item.reservedBoat ?? "No club-boat reservation"} → {item.assignedBoat}</span>
            </div>
          ))}
          <label>
            <input
              ref={reservationConfirmationCheckboxRef}
              type="checkbox"
              checked={reservationChangesConfirmed}
              onChange={(event) => {
                setConfirmedReconciliationSignature(event.target.checked ? reconciliationSignature : null);
                setReservationConfirmationErrorSignature(null);
              }}
              aria-invalid={reservationConfirmationError}
              aria-describedby={reservationConfirmationError ? "advanced-reservation-confirmation-error" : undefined}
            />{" "}
            I confirm these reservation changes
          </label>
          {reservationConfirmationError ? (
            <p id="advanced-reservation-confirmation-error" className="error" role="alert">Please confirm the reservation changes before publishing.</p>
          ) : null}
        </div>
      ) : null}

      <div className="card lineup-top-actions">
        <div className="row lineup-action-buttons">
          <form ref={saveFormRef} onSubmit={requestSave} className="inline-form">
            <input type="hidden" name="assignments_json" value={assignmentsJson} />
            {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
            <Button type="submit">{isSaving ? "Saving…" : "Save Assignments"}</Button>
          </form>
          {!isPublished && saveAndPublishAction && lineupBoardId ? (
            <form ref={publishFormRef} onSubmit={requestPublish} className="inline-form">
              <input type="hidden" name="lineup_board_id" value={lineupBoardId} />
              <input type="hidden" name="assignments_json" value={assignmentsJson} />
              <input type="hidden" name="reconciliation_json" value={reconciliationJson} />
              {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
              <Button type="submit" variant="secondary">{isPublishing ? "Publishing…" : "Save + Publish"}</Button>
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
        <>
            <form onSubmit={requestAddSelectedBoats} className="card form-grid lineup-add-boat-form">
          <input type="hidden" name="lineup_board_id" value={lineupBoardId} />
          {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
          <h3>Add Boats</h3>
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
          <details className="card-subtle lineup-fleet-picker">
            <summary>Choose {newBoatClass} boats</summary>
            <div className="stack lineup-fleet-picker-options">
              {[...selectedFleetBoatIds].map((boatId) => <input key={boatId} type="hidden" name="boat_ids" value={boatId} />)}
              {[...confirmedOverrideReservationIds].map((reservationId) => <input key={reservationId} type="hidden" name="confirmed_override_reservation_ids" value={reservationId} />)}
              {selectableFleetBoats.map((boat) => (
                <label key={boat.id} className="lineup-fleet-boat-option">
                  <input
                    type="checkbox"
                    checked={selectedFleetBoatIds.has(boat.id)}
                    onChange={(event) => setBoatSelected(boat, event.target.checked)}
                  />
                  <span>
                    {boat.name}
                    {boat.status === "reserved_by_participant" ? <small>Reserved by {boat.reservation?.member_name ?? "a training participant"} · Training participant</small> : null}
                    {boat.status === "reserved_by_nonparticipant" ? <small>Reserved by {boat.reservation?.member_name ?? "another member"} · Not in coached training</small> : null}
                    {boat.status === "held_for_advanced_training" ? <small>Held for Advanced Training</small> : null}
                    {boat.status === "available" ? <small>Available</small> : null}
                  </span>
                </label>
              ))}
              {selectableFleetBoats.length === 0 ? <p className="muted">No fleet boats of this size can be assigned.</p> : null}
              {fleetSelectionError ? <p className="error" role="alert">Choose at least one boat before adding.</p> : null}
              {advancedTrainingConflicts.map((boat) => (
                <p key={boat.id} className="error">
                  {boat.name} has an existing reservation conflict. Resolve it before adding this held boat.
                </p>
              ))}
              {!isAdvancedTraining && newBoatClass === "1x" ? (
                <label>
                  <input type="checkbox" name="private_boat" value="true" /> Add Private Boat ({newBoatClass})
                </label>
              ) : null}
            </div>
          </details>
            <Button type="submit">Add Selected Boats</Button>
          </form>

          {canAddAdvancedPrivateBoat ? (
            <form onSubmit={requestPrivateBoats} className="card form-grid lineup-add-boat-form">
              <input type="hidden" name="lineup_board_id" value={lineupBoardId} />
              <input type="hidden" name="boat_class_id" value="1x" />
              <input type="hidden" name="private_boat" value="true" />
              {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
              <h3>Private Singles</h3>
              <div className="private-boat-quantity-row">
                <Field label="Quantity">
                  <input
                    className="private-boat-quantity-input"
                    name="private_boat_quantity"
                    type="number"
                    min={1}
                    max={12}
                    step={1}
                    value={privateBoatQuantity}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      setPrivateBoatQuantity(Number.isFinite(value) ? Math.min(12, Math.max(1, Math.trunc(value))) : 1);
                    }}
                  />
                </Field>
                <Button type="submit">Add {privateBoatQuantity} Private Single{privateBoatQuantity === 1 ? "" : "s"}</Button>
              </div>
              <span className="muted">Private boats are lineup-only and do not need a QCRC hold or reservation.</span>
            </form>
          ) : null}
        </>
      ) : null}

      {!isPublished && !isAdvancedTraining && publishReconciliations.length > 0 ? (
        <div className="card stack">
          <h3>{isAdvancedTraining ? "Reservation changes on publish" : "Reservation reconciliation required before publishing"}</h3>
          <p className="muted">The recommended update is prepared, but nothing changes while you edit. Publishing will update these club-boat reservations to match the finalized lineup.</p>
          {publishReconciliations.map((item) => (
            <div key={item.memberId} className="card-subtle stack">
              <strong>{item.memberName}</strong>
              <span>Reserved: {item.reservedBoat ?? "No club-boat reservation"}</span>
              <span>Assigned: {item.assignedBoat}</span>
              <span className="muted">A reservation for the assigned club boat is required before this lineup can be published. Keeping the current reservation alone would not meet that rule.</span>
            </div>
          ))}
        </div>
      ) : null}

      {isPublished && isAdvancedTraining ? (
        <div className="card stack">
          <h3>Final boat reservations</h3>
          {finalAdvancedReservations.length > 0 ? finalAdvancedReservations.map((reservation) => (
            <div key={reservation.id} className="card-subtle stack">
              <strong>{reservation.boatName}</strong>
              <span>{reservation.memberNames.join(", ")}</span>
            </div>
          )) : <p className="muted">No current club-boat reservations were found for this lineup.</p>}
        </div>
      ) : null}

      {pendingOverrideBoat?.reservation ? (
        <div className="card stack" role="dialog" aria-modal="true" aria-labelledby="boat-override-title">
          <h3 id="boat-override-title">Use boat for coached training?</h3>
          <p>
            <strong>{pendingOverrideBoat.name}</strong> is currently reserved by {pendingOverrideBoat.reservation.member_name} from {new Date(pendingOverrideBoat.reservation.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{new Date(pendingOverrideBoat.reservation.end_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
          </p>
          <p className="muted">Coached training has priority for this boat. Continuing will cancel the reservation and notify the member to select another available boat.</p>
          <div className="row">
            <Button type="button" variant="secondary" onClick={() => setPendingOverrideBoat(null)}>Keep Existing Reservation</Button>
            <Button type="button" onClick={confirmOverride}>Use Boat for Coached Training</Button>
          </div>
        </div>
      ) : null}

      {publishConfirmationOpen ? (
        <div className="card stack" role="dialog" aria-modal="true" aria-labelledby="reconciliation-confirmation-title">
          <h3 id="reconciliation-confirmation-title">Confirm reservation changes</h3>
          <p>Publishing will update the following reservations to match the final coached-training lineup.</p>
          {publishReconciliations.map((item) => <p key={item.memberId}><strong>{item.memberName}</strong>: {item.reservedBoat ?? "No reservation"} → {item.assignedBoat}</p>)}
          <div className="row">
            <Button type="button" variant="secondary" onClick={() => setPublishConfirmationOpen(false)}>Continue Editing</Button>
            <Button type="button" onClick={submitPublish}>Update Reservations + Publish</Button>
          </div>
        </div>
      ) : null}

      {actionError ? (
        <div className="lineup-action-error-backdrop" role="presentation">
          <div ref={actionErrorDialogRef} className="card stack lineup-action-error-dialog" role="dialog" aria-modal="true" aria-labelledby="lineup-action-error-title" aria-describedby="lineup-action-error-message" tabIndex={-1}>
            <h3 id="lineup-action-error-title">{actionError.title}</h3>
            <p id="lineup-action-error-message" className="error">{actionError.message}</p>
            <div className="row">
              <Button type="button" onClick={dismissActionError}>OK</Button>
            </div>
          </div>
        </div>
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
