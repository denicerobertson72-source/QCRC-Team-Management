"use client";

import { useMemo, useRef } from "react";
import type { FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { privateBoatLaunchAction, privateBoatReturnAction, updatePrivateBoatGateStatusAction } from "@/lib/actions";
import type { PrivateBoatOuting } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { INTENT_STORAGE_KEY, TRACKING_STORAGE_KEY, makeOutingKey } from "@/lib/live-tracking";

const GPS_LAUNCH_TIMEOUT_MS = 8000;
const GPS_LAUNCH_MAX_AGE_MS = 60000;

function PendingSubmitButton({
  label,
  pendingLabel,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

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
  return String(error);
}

export function PrivateBoatOutingPanel({
  canLaunch,
  activeOuting,
  recentReturnedOuting,
}: {
  canLaunch: boolean;
  activeOuting: PrivateBoatOuting | null;
  recentReturnedOuting: PrivateBoatOuting | null;
}) {
  const resumeSubmitRef = useRef(false);
  const launchOutingId = useMemo(() => crypto.randomUUID(), []);

  async function handleLaunchSubmit(event: FormEvent<HTMLFormElement>) {
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
    const outingKey = makeOutingKey("private_boat", launchOutingId);

    const continueWithoutTracking = () => {
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
      resumeSubmitRef.current = true;
      form.requestSubmit();
    };

    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: GPS_LAUNCH_TIMEOUT_MS,
          maximumAge: GPS_LAUNCH_MAX_AGE_MS,
        });
      });
      window.localStorage.setItem(INTENT_STORAGE_KEY, outingKey);
      resumeSubmitRef.current = true;
      form.requestSubmit();
    } catch (error) {
      const detail =
        typeof error === "object" && error && "code" in error
          ? geolocationErrorMessage(error as GeolocationPositionError)
          : `Location access was blocked or unavailable. Debug: ${describeUnknownLocationError(error)}`;
      const shouldContinue = window.confirm(`${detail}\n\nLaunch anyway without live tracking?`);
      if (shouldContinue) {
        continueWithoutTracking();
      }
    }
  }

  function handleReturnSubmit() {
    if (!activeOuting) return;
    const outingKey = makeOutingKey("private_boat", activeOuting.id);
    if (window.localStorage.getItem(TRACKING_STORAGE_KEY) === outingKey) {
      window.localStorage.removeItem(TRACKING_STORAGE_KEY);
    }
    if (window.localStorage.getItem(INTENT_STORAGE_KEY) === outingKey) {
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
    }
  }

  if (!canLaunch && !activeOuting && !recentReturnedOuting) return null;

  return (
    <details className="card-subtle" open>
      <summary>
        {activeOuting ? "Show private boat return options" : recentReturnedOuting ? "Show private boat gate options" : "Show private boat launch options"}
      </summary>
      <div className="row" style={{ marginTop: "0.8rem" }}>
        {!activeOuting && canLaunch ? (
          <form action={privateBoatLaunchAction} className="inline-form" onSubmit={handleLaunchSubmit}>
            <input type="hidden" name="private_outing_id" value={launchOutingId} />
            <select name="location" defaultValue="OH" required>
              <option value="OH">OH</option>
              <option value="LM">LM</option>
            </select>
            <select name="river_direction" defaultValue="Upriver" required>
              <option value="Upriver">Upriver</option>
              <option value="Downriver">Downriver</option>
            </select>
            <PendingSubmitButton label="Launch Private Boat" pendingLabel="Launching..." />
          </form>
        ) : null}

        {activeOuting ? (
          <form action={privateBoatReturnAction} className="inline-form" onSubmit={handleReturnSubmit}>
            <input type="hidden" name="private_outing_id" value={activeOuting.id} />
            <input name="notes" placeholder="Condition notes" defaultValue={activeOuting.notes ?? ""} />
            <PendingSubmitButton label="Mark Returned" pendingLabel="Saving Return..." />
          </form>
        ) : null}

        {recentReturnedOuting ? (
          <form action={updatePrivateBoatGateStatusAction} className="inline-form">
            <input type="hidden" name="private_outing_id" value={recentReturnedOuting.id} />
            <span className="muted">Gate status</span>
            <select name="gate_status" defaultValue={recentReturnedOuting.gate_status ?? "locked"} required>
              <option value="locked">Gate locked</option>
              <option value="unlocked">Gate left unlocked</option>
            </select>
            <PendingSubmitButton label="Save Gate Status" pendingLabel="Saving Gate..." variant="secondary" />
          </form>
        ) : null}
      </div>
    </details>
  );
}
