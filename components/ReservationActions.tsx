"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { cancelReservationAction, checkinAction, checkoutAction, updateReservationAction } from "@/lib/actions";
import type { Reservation } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { INTENT_STORAGE_KEY, TRACKING_STORAGE_KEY, makeOutingKey } from "@/lib/live-tracking";
import { deriveReservationEndLocal } from "@/lib/reservations";
import { formatEasternLocalInput, toEasternDateTimeLocalValue } from "@/lib/time";

// A launch needs a usable position, not a brand-new high-accuracy GPS lock. iOS can take longer
// than a few seconds to obtain the latter even when location permission is correctly allowed.
const GPS_LAUNCH_TIMEOUT_MS = 20000;
const GPS_LAUNCH_MAX_AGE_MS = 60000;

function PendingSubmitButton({
  label,
  pendingLabel,
  variant = "primary",
  className = "",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={className} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location access was denied. Live location tracking is required before launching for safety. Enable location access for this app/site in your browser settings, then try Launching again.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Your location is currently unavailable. Check browser location permissions, device Location Services, and signal/GPS availability, then try Launching again.";
  }
  if (error.code === error.TIMEOUT) {
    return "Location lookup timed out. Live location tracking is required before launching, so please try Launching again when your device has a better location fix.";
  }
  return error.message || "Location access was blocked or unavailable. Live location tracking is required before launching.";
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
  const resumeSubmitRef = useRef(false);
  const [showEdit, setShowEdit] = useState(false);
  const [startTime, setStartTime] = useState(() => toEasternDateTimeLocalValue(reservation.start_time));
  const derivedEndTime = useMemo(() => deriveReservationEndLocal(startTime) ?? "", [startTime]);

  if (!canCheckout && !canCheckin) return null;

  async function handleCheckoutSubmit(event: FormEvent<HTMLFormElement>) {
    if (resumeSubmitRef.current) {
      resumeSubmitRef.current = false;
      return;
    }

    event.preventDefault();

    if (!navigator.geolocation) {
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
      window.alert("Live location tracking is required before launching, but this browser does not support location services. Please launch from a browser/device with location enabled.");
      return;
    }

    const form = event.currentTarget;

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: GPS_LAUNCH_TIMEOUT_MS,
          maximumAge: GPS_LAUNCH_MAX_AGE_MS,
        });
      });
      form.querySelector<HTMLInputElement>('input[name="gps_latitude"]')!.value = String(position.coords.latitude);
      form.querySelector<HTMLInputElement>('input[name="gps_longitude"]')!.value = String(position.coords.longitude);
      form.querySelector<HTMLInputElement>('input[name="gps_accuracy_meters"]')!.value = String(position.coords.accuracy ?? "");
      form.querySelector<HTMLInputElement>('input[name="gps_recorded_at"]')!.value = new Date(position.timestamp).toISOString();
      window.localStorage.setItem(INTENT_STORAGE_KEY, makeOutingKey("reservation", reservation.id));
      resumeSubmitRef.current = true;
      form.requestSubmit();
    } catch (error) {
      const detail =
        typeof error === "object" && error && "code" in error
          ? geolocationErrorMessage(error as GeolocationPositionError)
          : `Location access was blocked or unavailable. Debug: ${describeUnknownLocationError(error)}`;
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
      window.alert(`${detail}\n\nLaunch was not recorded. Please enable location access and try again.`);
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

  if (canCheckout) {
    return (
      <div className="stack">
        <div className="row">
          <form action={checkoutAction} className="inline-form" onSubmit={handleCheckoutSubmit} style={{ flex: "1 1 320px" }}>
            <input type="hidden" name="reservation_id" value={reservation.id} />
            <input type="hidden" name="gps_latitude" />
            <input type="hidden" name="gps_longitude" />
            <input type="hidden" name="gps_accuracy_meters" />
            <input type="hidden" name="gps_recorded_at" />
            <select name="location" defaultValue={reservation.checkout_location ?? "OH"} required>
              <option value="OH">OH</option>
              <option value="LM">LM</option>
            </select>
            <select name="river_direction" defaultValue={reservation.river_direction ?? "Upriver"} required>
              <option value="Upriver">Upriver</option>
              <option value="Downriver">Downriver</option>
            </select>
            <input name="launch_comment" placeholder="Comments for other rowers (optional)" defaultValue={reservation.notes ?? ""} maxLength={500} />
            <PendingSubmitButton label="Launching" pendingLabel="Launching..." />
          </form>

          <Button type="button" variant="secondary" onClick={() => setShowEdit((current) => !current)}>
            {showEdit ? "Hide Edit / Cancel" : "Edit / Cancel"}
          </Button>
        </div>

        {showEdit ? (
          <div className="card-subtle stack">
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
              <div className="row">
                <PendingSubmitButton label="Save Changes" pendingLabel="Saving..." />
              </div>
            </form>

            <form action={cancelReservationAction}>
              <input type="hidden" name="reservation_id" value={reservation.id} />
              <div className="row">
                <PendingSubmitButton label="Cancel Reservation" pendingLabel="Cancelling..." variant="secondary" />
              </div>
            </form>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <details className="card-subtle">
      <summary>Show return options</summary>
      <div className="row" style={{ marginTop: "0.8rem" }}>

        {canCheckin ? (
          <form action={checkinAction} className="inline-form" onSubmit={handleCheckinSubmit}>
            <input type="hidden" name="reservation_id" value={reservation.id} />
            <input name="return_comment" placeholder="Return comments for safety (optional)" maxLength={500} />
            <PendingSubmitButton label="Mark Returned" pendingLabel="Saving Return..." />
          </form>
        ) : null}
      </div>
    </details>
  );
}
