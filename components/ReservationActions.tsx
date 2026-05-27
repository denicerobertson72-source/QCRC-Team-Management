import { checkinAction, checkoutAction } from "@/lib/actions";
import type { Reservation } from "@/lib/types";
import { Button } from "@/components/ui/Button";

export function ReservationActions({ reservation }: { reservation: Reservation }) {
  const canCheckout = reservation.status === "reserved";
  const canCheckin = reservation.status === "checked_out";

  if (!canCheckout && !canCheckin) return null;

  return (
    <details className="card-subtle">
      <summary>{canCheckout ? "Show launching options" : "Show return options"}</summary>
      <div className="row" style={{ marginTop: "0.8rem" }}>
        {canCheckout ? (
          <form action={checkoutAction} className="inline-form">
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
          <form action={checkinAction} className="inline-form">
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
