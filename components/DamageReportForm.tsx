import { submitDamageAction } from "@/lib/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import type { Boat, Reservation } from "@/lib/types";

export function DamageReportForm({
  boats,
  reservations,
  defaultReservationId = "",
  defaultBoatId = "",
}: {
  boats: Boat[];
  reservations: Reservation[];
  defaultReservationId?: string;
  defaultBoatId?: string;
}) {
  return (
    <form action={submitDamageAction} className="card form-grid">
      <h2>New Damage Report</h2>
      <p className="muted">Tell us what you found. Photos are optional and can be added from your phone or computer.</p>

      <Field label="Related outing (optional)">
        <select name="reservation_id" defaultValue={defaultReservationId}>
          <option value="">Not linked to a reservation</option>
          {reservations.map((reservation) => (
            <option key={reservation.id} value={reservation.id}>
              {(reservation.boats?.name ?? reservation.boat_id)} | {new Date(reservation.start_time).toLocaleDateString("en-US")}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Boat">
        <select name="boat_id" defaultValue={defaultBoatId} required>
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
      <Field label="How serious is it? (1 minor – 5 unsafe)">
        <input name="severity" type="number" min={1} max={5} defaultValue={3} required />
      </Field>
      <Field label="Who was rowing? (optional)">
        <input name="responsible_member_name" placeholder="Example: Jane Doe" />
      </Field>
      <Field label="What did you find?">
        <textarea name="description" rows={4} required />
      </Field>
      <Field label="Upload photos (optional)">
        <input name="photos" type="file" accept="image/*" multiple />
      </Field>
      <Button type="submit">Send Damage Report</Button>
    </form>
  );
}
