"use client";

import type { FormEvent } from "react";
import { checkinAction, checkoutAction } from "@/lib/actions";
import type { Reservation } from "@/lib/types";
import { Button } from "@/components/ui/Button";

const TRACKING_STORAGE_KEY = "rowing-live-sharing-reservation-id";
const INTENT_STORAGE_KEY = "rowing-live-sharing-intent-reservation-id";

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

  if (!canCheckout && !canCheckin) return null;

  async function handleCheckoutSubmit(event: FormEvent<HTMLFormElement>) {
    if (!navigator.geolocation) {
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
      return;
    }

    event.preventDefault();

    const continueWithoutTracking = () => {
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
      event.currentTarget.submit();
    };

    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0,
        });
      });
      window.localStorage.setItem(INTENT_STORAGE_KEY, reservation.id);
      event.currentTarget.submit();
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
    if (window.localStorage.getItem(TRACKING_STORAGE_KEY) === reservation.id) {
      window.localStorage.removeItem(TRACKING_STORAGE_KEY);
    }
    if (window.localStorage.getItem(INTENT_STORAGE_KEY) === reservation.id) {
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
    }
  }

  return (
    <details className="card-subtle">
      <summary>{canCheckout ? "Show launching options" : "Show return options"}</summary>
      <div className="row" style={{ marginTop: "0.8rem" }}>
        {canCheckout ? (
          <form action={checkoutAction} className="inline-form" onSubmit={handleCheckoutSubmit}>
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
        ) : null}

        {canCheckin ? (
          <form action={checkinAction} className="inline-form" onSubmit={handleCheckinSubmit}>
            <input type="hidden" name="reservation_id" value={reservation.id} />
            <select name="gate_status" defaultValue={reservation.gate_status ?? "locked"} required>
              <option value="locked">Gate locked</option>
              <option value="unlocked">Gate left unlocked</option>
            </select>
            <input name="notes" placeholder="Condition notes" />
            <Button type="submit">Returned</Button>
          </form>
        ) : null}
      </div>
    </details>
  );
}
