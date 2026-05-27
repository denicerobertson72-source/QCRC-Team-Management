"use client";

import { useMemo, useState } from "react";
import { reserveBoatAction } from "@/lib/actions";
import type { Boat } from "@/lib/types";
import { StatusChip } from "@/components/ui/StatusChip";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { deriveReservationEndLocal } from "@/lib/reservations";
import { formatEasternDateTime } from "@/lib/time";

export function ReservationForm({ boat, start, returnTo }: { boat: Boat; start: string; returnTo: string }) {
  const [startTime, setStartTime] = useState(start);
  const end = useMemo(() => deriveReservationEndLocal(startTime), [startTime]);

  return (
    <form action={reserveBoatAction} className="card form-grid">
      {boat.photo_url ? (
        <img
          src={boat.photo_url}
          alt={`${boat.name} photo`}
          style={{ width: "100%", borderRadius: "12px", border: "1px solid var(--line)", objectFit: "cover" }}
        />
      ) : null}
      <div className="page-title">
        <h3>
          {boat.name}
          {boat.boat_number ? ` #${boat.boat_number}` : ""}
        </h3>
        <StatusChip label={boat.boat_class_id} />
      </div>
      <p className="muted">
        {boat.boat_type} | skill {boat.required_skill_level} | weight {boat.weight_class ?? "Any"}
      </p>

      <input type="hidden" name="boat_id" value={boat.id} />
      <input type="hidden" name="return_to" value={returnTo} />
      <Field label="Start">
        <input
          name="start_time"
          type="datetime-local"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          required
        />
      </Field>
      <input type="hidden" name="end_time" value={end ?? ""} />
      <p className="muted">
        {end ? `End time will be set automatically to ${formatEasternDateTime(end)} ET.` : "Choose a start time that stays within the same day."}
      </p>
      <Field label="Crew Names (optional)">
        <input name="crew_names" placeholder="Jane Doe, Sam Smith" />
      </Field>
      <Field label="Location">
        <input name="checkout_location" placeholder="Main Dock" />
      </Field>
      <Field label="Notes">
        <input name="notes" />
      </Field>
      <Button type="submit">Book</Button>
    </form>
  );
}
