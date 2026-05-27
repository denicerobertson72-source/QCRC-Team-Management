import { submitDamageAction } from "@/lib/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import type { Boat, Reservation } from "@/lib/types";

export function DamageReportForm({
  boats,
  reservations,
}: {
  boats: Boat[];
  reservations: Reservation[];
}) {
  return (
    <form action={submitDamageAction} className="card form-grid">
      <h2>New Damage Report</h2>
      <p className="muted">Attach clear notes. Photos are optional and can be added from your phone or computer.</p>

      <Field label="Reservation ID (optional)">
        <select name="reservation_id" defaultValue="">
          <option value="">No linked reservation</option>
          {reservations.map((reservation) => (
            <option key={reservation.id} value={reservation.id}>
              {(reservation.boats?.name ?? reservation.boat_id)} | {new Date(reservation.start_time).toLocaleDateString("en-US")}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Boat ID">
        <select name="boat_id" defaultValue="" required>
          <option value="" disabled>
            Select a boat
          </option>
          {boats.map((boat) => (
            <option key={boat.id} value={boat.id}>
              {boat.name}
              {boat.boat_number ? ` #${boat.boat_number}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Severity (1-5)">
        <input name="severity" type="number" min={1} max={5} defaultValue={3} required />
      </Field>
      <Field label="Responsible Rower Name (optional)">
        <input name="responsible_member_name" placeholder="Example: Jane Doe" />
      </Field>
      <Field label="Description">
        <textarea name="description" rows={4} required />
      </Field>
      <Field label="Photo storage paths (optional, one per line)">
        <textarea
          name="photo_paths"
          rows={4}
          placeholder={"damage/<report-id>/photo1.jpg\\ndamage/<report-id>/photo2.jpg"}
        />
      </Field>
      <Field label="Upload photos (optional)">
        <input name="photos" type="file" accept="image/*" capture="environment" multiple />
      </Field>
      <Button type="submit">Submit Damage</Button>
    </form>
  );
}
