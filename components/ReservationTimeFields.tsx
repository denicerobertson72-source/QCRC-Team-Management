"use client";

import { useMemo, useState } from "react";
import { Field } from "@/components/ui/Field";
import { deriveReservationEndLocal } from "@/lib/reservations";
import { formatEasternLocalInput } from "@/lib/time";

export function ReservationTimeFields({ start }: { start: string }) {
  const [startTime, setStartTime] = useState(start);
  const end = useMemo(() => deriveReservationEndLocal(startTime), [startTime]);

  return (
    <>
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
        {end ? `End time will be set automatically to ${formatEasternLocalInput(end)} ET.` : "Choose a start time that stays within the same day."}
      </p>
    </>
  );
}
