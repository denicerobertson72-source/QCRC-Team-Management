import { reserveBoatAction } from "@/lib/actions";
import type { Boat } from "@/lib/types";
import { StatusChip } from "@/components/ui/StatusChip";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ReservationTimeFields } from "@/components/ReservationTimeFields";

export function ReservationForm({ boat, start, returnTo }: { boat: Boat; start: string; returnTo: string }) {
  const additionalSeats = boat.boat_class_id === "8x" ? 7 : boat.boat_class_id === "4x" ? 3 : boat.boat_class_id === "2x" ? 1 : 0;
  const crewLabel =
    additionalSeats === 0
      ? null
      : additionalSeats === 1
        ? "Other rower"
        : `Other rowers (${additionalSeats})`;

  return (
    <form action={reserveBoatAction} className="card form-grid">
      {boat.photo_url ? (
        <img
          src={boat.photo_url}
          alt={`${boat.name} photo`}
          loading="lazy"
          decoding="async"
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
        {boat.boat_type ? `${boat.boat_type} | ` : ""}skill {boat.required_skill_level} | weight {boat.weight_class ?? "Any"}
      </p>

      <input type="hidden" name="boat_id" value={boat.id} />
      <input type="hidden" name="return_to" value={returnTo} />
      <ReservationTimeFields start={start} />
      {crewLabel ? (
        <Field label={crewLabel}>
          <textarea
            name="crew_names"
            rows={additionalSeats + 1}
            placeholder={additionalSeats === 1 ? "Enter the other rower's full name" : "Enter one full name per line"}
          />
        </Field>
      ) : null}
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
