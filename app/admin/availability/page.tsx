import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import {
  addBoatAvailabilityBlockAdminAction,
  addRecurringBoatAvailabilityBlocksAdminAction,
  updateBoatAvailabilityBlockAdminAction,
} from "@/lib/actions";
import { getBoatAvailabilityBlocks } from "@/lib/queries";
import { formatEasternDateTime, toEasternDateTimeLocalValue } from "@/lib/time";

function toInputDateTime(value: string) {
  return toEasternDateTimeLocalValue(value);
}

export default async function AdminAvailabilityPage() {
  const blocks = await getBoatAvailabilityBlocks();

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle
          title="Admin: Availability Blocks"
          subtitle="Block exact Eastern date/time reservation windows across all boats or targeted member groups."
        />

        <form action={addBoatAvailabilityBlockAdminAction} className="card form-grid">
          <h3>Add Block</h3>
          <Field label="Title">
            <input name="title" required placeholder="Youth practice" />
          </Field>
          <Field label="Starts (date and time)">
            <input name="starts_at" type="datetime-local" required />
          </Field>
          <Field label="Ends (date and time)">
            <input name="ends_at" type="datetime-local" required />
          </Field>
          <Field label="Membership group (optional)">
            <input name="applies_to_membership_type" placeholder="masters" />
          </Field>
          <Field label="Boat class (optional)">
            <select name="applies_to_boat_class_id" defaultValue="">
              <option value="">All</option>
              <option value="1x">1x</option>
              <option value="2x">2x</option>
              <option value="4x">4x</option>
            </select>
          </Field>
          <Field label="Active">
            <select name="is_active" defaultValue="true">
              <option value="true">active</option>
              <option value="false">inactive</option>
            </select>
          </Field>
          <Field label="Notes">
            <input name="notes" placeholder="Seasonal schedule block" />
          </Field>
          <Button type="submit">Save Block</Button>
        </form>

        <form action={addRecurringBoatAvailabilityBlocksAdminAction} className="card form-grid">
          <h3>Add Recurring Block Series</h3>
          <p className="muted">
            Use this for patterns like June 8 to July 30, Monday through Friday, 9:00 AM to 11:00 AM.
          </p>
          <Field label="Title">
            <input name="title" required placeholder="Summer coached row" />
          </Field>
          <div className="row">
            <Field label="Start Date">
              <input name="start_date" type="date" required />
            </Field>
            <Field label="End Date">
              <input name="end_date" type="date" required />
            </Field>
          </div>
          <div className="row">
            <Field label="Daily Start Time">
              <input name="daily_start_time" type="time" required />
            </Field>
            <Field label="Daily End Time">
              <input name="daily_end_time" type="time" required />
            </Field>
          </div>
          <Field label="Weekdays">
            <div className="row" style={{ flexWrap: "wrap" }}>
              <label><input type="checkbox" name="weekdays" value="mon" /> Mon</label>
              <label><input type="checkbox" name="weekdays" value="tue" /> Tue</label>
              <label><input type="checkbox" name="weekdays" value="wed" /> Wed</label>
              <label><input type="checkbox" name="weekdays" value="thu" /> Thu</label>
              <label><input type="checkbox" name="weekdays" value="fri" /> Fri</label>
              <label><input type="checkbox" name="weekdays" value="sat" /> Sat</label>
              <label><input type="checkbox" name="weekdays" value="sun" /> Sun</label>
            </div>
          </Field>
          <Field label="Membership group (optional)">
            <input name="applies_to_membership_type" placeholder="masters" />
          </Field>
          <Field label="Boat class (optional)">
            <select name="applies_to_boat_class_id" defaultValue="">
              <option value="">All</option>
              <option value="1x">1x</option>
              <option value="2x">2x</option>
              <option value="4x">4x</option>
            </select>
          </Field>
          <Field label="Active">
            <select name="is_active" defaultValue="true">
              <option value="true">active</option>
              <option value="false">inactive</option>
            </select>
          </Field>
          <Field label="Notes">
            <input name="notes" placeholder="Seasonal recurring block" />
          </Field>
          <Button type="submit">Create Recurring Blocks</Button>
        </form>

        <div className="grid">
          {blocks.map((block) => (
            <form key={block.id} action={updateBoatAvailabilityBlockAdminAction} className="card form-grid">
              <h3>{block.title}</h3>
              <p className="muted">
                {formatEasternDateTime(block.starts_at)} ET to {formatEasternDateTime(block.ends_at)} ET
              </p>
              <input type="hidden" name="block_id" value={block.id} />
              <Field label="Title">
                <input name="title" defaultValue={block.title} required />
              </Field>
              <Field label="Starts (date and time)">
                <input name="starts_at" type="datetime-local" defaultValue={toInputDateTime(block.starts_at)} required />
              </Field>
              <Field label="Ends (date and time)">
                <input name="ends_at" type="datetime-local" defaultValue={toInputDateTime(block.ends_at)} required />
              </Field>
              <Field label="Membership group (optional)">
                <input name="applies_to_membership_type" defaultValue={block.applies_to_membership_type ?? ""} />
              </Field>
              <Field label="Boat class (optional)">
                <select name="applies_to_boat_class_id" defaultValue={block.applies_to_boat_class_id ?? ""}>
                  <option value="">All</option>
                  <option value="1x">1x</option>
                  <option value="2x">2x</option>
                  <option value="4x">4x</option>
                </select>
              </Field>
              <Field label="Active">
                <select name="is_active" defaultValue={block.is_active ? "true" : "false"}>
                  <option value="true">active</option>
                  <option value="false">inactive</option>
                </select>
              </Field>
              <Field label="Notes">
                <input name="notes" defaultValue={block.notes ?? ""} />
              </Field>
              <Button type="submit" variant="secondary">
                Update Block
              </Button>
            </form>
          ))}
        </div>
      </main>
    </>
  );
}
