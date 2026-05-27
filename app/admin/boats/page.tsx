import { TopNav } from "@/components/TopNav";
import { getBoats } from "@/lib/queries";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { addBoatAdminAction, updateBoatAdminAction } from "@/lib/actions";

export default async function AdminBoatsPage() {
  const boats = await getBoats();

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Boats" subtitle="Add boats and set out-of-service status." />

        <form action={addBoatAdminAction} className="card form-grid">
          <h3>Add Boat</h3>
          <Field label="Boat name">
            <input name="name" required />
          </Field>
          <Field label="Boat number">
            <input name="boat_number" placeholder="e.g. 3" />
          </Field>
          <Field label="Boat class">
            <select name="boat_class_id" defaultValue="1x">
              <option value="1x">1x</option>
              <option value="2x">2x</option>
              <option value="4x">4x</option>
            </select>
          </Field>
          <Field label="Boat type">
            <input name="boat_type" defaultValue="training" />
          </Field>
          <Field label="Photo URL">
            <input name="photo_url" placeholder="https://..." />
          </Field>
          <Field label="Required skill level">
            <select name="required_skill_level" defaultValue="Beginner">
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
              <option value="Elite">Elite</option>
            </select>
          </Field>
          <Field label="Weight class">
            <select name="weight_class" defaultValue="">
              <option value="">Any</option>
              <option value="Lightweight">Lightweight</option>
              <option value="Mid-weight">Mid-weight</option>
              <option value="Heavyweight">Heavyweight</option>
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue="available">
              <option value="available">available</option>
              <option value="maintenance">out of service (maintenance)</option>
              <option value="locked">out of service (locked)</option>
            </select>
          </Field>
          <Field label="Rigging notes">
            <input name="rigging_notes" />
          </Field>
          <Button type="submit">Add Boat</Button>
        </form>

        <div className="grid">
          {boats.map((boat) => (
            <form key={boat.id} action={updateBoatAdminAction} className="card form-grid">
              <h3>
                Edit {boat.name}
                {boat.boat_number ? ` #${boat.boat_number}` : ""}
              </h3>
              <input type="hidden" name="boat_id" value={boat.id} />
              <Field label="Boat name">
                <input name="name" defaultValue={boat.name} required />
              </Field>
              <Field label="Boat number">
                <input name="boat_number" defaultValue={boat.boat_number ?? ""} />
              </Field>
              <Field label="Boat class">
                <select name="boat_class_id" defaultValue={boat.boat_class_id}>
                  <option value="1x">1x</option>
                  <option value="2x">2x</option>
                  <option value="4x">4x</option>
                </select>
              </Field>
              <Field label="Boat type">
                <input name="boat_type" defaultValue={boat.boat_type} />
              </Field>
              <Field label="Photo URL">
                <input name="photo_url" defaultValue={boat.photo_url ?? ""} placeholder="https://..." />
              </Field>
              <Field label="Required skill level">
                <select name="required_skill_level" defaultValue={boat.required_skill_level}>
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                  <option value="Elite">Elite</option>
                </select>
              </Field>
              <Field label="Weight class">
                <select name="weight_class" defaultValue={boat.weight_class ?? ""}>
                  <option value="">Any</option>
                  <option value="Lightweight">Lightweight</option>
                  <option value="Mid-weight">Mid-weight</option>
                  <option value="Heavyweight">Heavyweight</option>
                </select>
              </Field>
              <Field label="Status">
                <select name="status" defaultValue={boat.status}>
                  <option value="available">available</option>
                  <option value="maintenance">out of service (maintenance)</option>
                  <option value="locked">out of service (locked)</option>
                </select>
              </Field>
              <Field label="Rigging notes">
                <input name="rigging_notes" defaultValue={boat.rigging_notes ?? ""} />
              </Field>
              <Button type="submit" variant="secondary">
                Save Boat
              </Button>
            </form>
          ))}
        </div>
      </main>
    </>
  );
}
