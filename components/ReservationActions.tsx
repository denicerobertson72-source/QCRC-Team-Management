"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { cancelReservationAction, checkinAction, checkoutAction, updateReservationAction, updateReservationGateStatusAction } from "@/lib/actions";
import type { Reservation } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { INTENT_STORAGE_KEY, TRACKING_STORAGE_KEY, makeOutingKey } from "@/lib/live-tracking";
import { deriveReservationEndLocal } from "@/lib/reservations";
import { formatEasternLocalInput, toEasternDateTimeLocalValue } from "@/lib/time";

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location access was denied. You can still launch without live tracking.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Your location is currently unavailable. Check Safari location permissions and macOS Location Services, then try again.";
  }
  if (error.code === error.TIMEOUT) {
    return "Location lookup timed out. Safari may still be trying to get a GPS fix. You can retry or continue without live tracking.";
  }
  return error.message || "Location access was blocked or unavailable.";
}

function describeUnknownLocationError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "object" && error) {
    const details = {
      name: "name" in error ? String((error as { name?: unknown }).name ?? "") : "",
      code: "code" in error ? String((error as { code?: unknown }).code ?? "") : "",
      message: "message" in error ? String((error as { message?: unknown }).message ?? "") : "",
    };
    return JSON.stringify(details);
  }
  return String(error);
}

export function ReservationActions({ reservation }: { reservation: Reservation }) {
  const canCheckout = reservation.status === "reserved";
  const canCheckin = reservation.status === "checked_out";
  const canUpdateGate = reservation.status === "checked_in";
  const resumeSubmitRef = useRef(false);
  const [startTime, setStartTime] = useState(() => toEasternDateTimeLocalValue(reservation.start_time));
  const derivedEndTime = useMemo(() => deriveReservationEndLocal(startTime) ?? "", [startTime]);

  if (!canCheckout && !canCheckin && !canUpdateGate) return null;

  async function handleCheckoutSubmit(event: FormEvent<HTMLFormElement>) {
    if (resumeSubmitRef.current) {
      resumeSubmitRef.current = false;
      return;
    }

    if (!navigator.geolocation) {
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
      return;
    }

    event.preventDefault();
    const form = event.currentTarget;

    const continueWithoutTracking = () => {
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
      resumeSubmitRef.current = true;
      form.requestSubmit();
    };

    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0,
        });
      });
      window.localStorage.setItem(INTENT_STORAGE_KEY, makeOutingKey("reservation", reservation.id));
      resumeSubmitRef.current = true;
      form.requestSubmit();
    } catch (error) {
      const detail =
        typeof error === "object" && error && "code" in error
          ? geolocationErrorMessage(error as GeolocationPositionError)
          : `Location access was blocked or unavailable. Debug: ${describeUnknownLocationError(error)}`;
      const shouldContinue = window.confirm(
        `${detail}\n\nLaunch anyway without live tracking?`,
      );
      if (shouldContinue) {
        continueWithoutTracking();
      }
    }
  }

  function handleCheckinSubmit() {
    const outingKey = makeOutingKey("reservation", reservation.id);
    if (window.localStorage.getItem(TRACKING_STORAGE_KEY) === outingKey) {
      window.localStorage.removeItem(TRACKING_STORAGE_KEY);
    }
    if (window.localStorage.getItem(INTENT_STORAGE_KEY) === outingKey) {
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
    }
  }

  return (
    <details className="card-subtle">
      <summary>{canCheckout ? "Show reservation options" : canCheckin ? "Show return options" : "Show gate options"}</summary>
      <div className="row" style={{ marginTop: "0.8rem" }}>
        {canCheckout ? (
          <>
            <div className="form-grid" style={{ flex: "1 1 320px" }}>
              <form action={updateReservationAction} className="form-grid">
                <input type="hidden" name="reservation_id" value={reservation.id} />
                <input type="hidden" name="end_time" value={derivedEndTime} />
                <label>
                  Start Time
                  <input
                    name="start_time"
                    type="datetime-local"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    required
                  />
                </label>
                <p className="muted">
                  {derivedEndTime
                    ? `End time will be set automatically to ${formatEasternLocalInput(derivedEndTime)} ET.`
                    : "Choose a start time that stays within the same day."}
                </p>
                <label>
                  Planned Launch Site
                  <select name="checkout_location" defaultValue={reservation.checkout_location ?? "OH"} required>
                    <option value="OH">OH</option>
                    <option value="LM">LM</option>
                  </select>
                </label>
                <label>
                  Crew Names
                  <input
                    name="crew_names"
                    defaultValue={(reservation.crew_names ?? []).join(", ")}
                    placeholder="Optional crew names"
                  />
                </label>
                <label>
                  Notes
                  <input name="notes" defaultValue={reservation.notes ?? ""} placeholder="Optional notes" />
                </label>
                <Button type="submit">Save Changes</Button>
              </form>

              <form action={cancelReservationAction}>
                <input type="hidden" name="reservation_id" value={reservation.id} />
                <div className="row">
                  <Button type="submit" variant="secondary">
                    Cancel Reservation
                  </Button>
                </div>
              </form>
            </div>

            <form action={checkoutAction} className="inline-form" onSubmit={handleCheckoutSubmit} style={{ flex: "1 1 320px" }}>
              <input type="hidden" name="reservation_id" value={reservation.id} />
              <select name="location" defaultValue={reservation.checkout_location ?? "OH"} required>
                <option value="OH">OH</option>
                <option value="LM">LM</option>
              </select>
              <select name="river_direction" defaultValue={reservation.river_direction ?? "Upriver"} required>
                <option value="Upriver">Upriver</option>
                <option value="Downriver">Downriver</option>
              </select>
              <Button type="submit">Launching</Button>
            </form>
          </>
        ) : null}

        {canCheckin ? (
          <form action={checkinAction} className="inline-form" onSubmit={handleCheckinSubmit}>
            <input type="hidden" name="reservation_id" value={reservation.id} />
            <input name="notes" placeholder="Condition notes" />
            <Button type="submit">Mark Returned</Button>
          </form>
        ) : null}

        {canUpdateGate ? (
          <form action={updateReservationGateStatusAction} className="inline-form">
            <input type="hidden" name="reservation_id" value={reservation.id} />
            <span className="muted">Gate status</span>
            <select name="gate_status" defaultValue={reservation.gate_status ?? "locked"} required>
              <option value="locked">Gate locked</option>
              <option value="unlocked">Gate left unlocked</option>
            </select>
            <Button type="submit" variant="secondary">
              Save Gate Status
            </Button>
          </form>
        ) : null}
      </div>
    </details>
  );
}
