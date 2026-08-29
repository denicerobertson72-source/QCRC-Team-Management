import { TopNav } from "@/components/TopNav";
import { getBoats } from "@/lib/queries";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FlashNotice } from "@/components/ui/FlashNotice";
import { addBoatAdminAction, deleteBoatAdminAction, importBoatsCsvAdminAction, updateBoatAdminAction } from "@/lib/actions";

type SearchParams = Promise<{ import_status?: string; import_message?: string; boat_status?: string; boat_message?: string }>;

const BOAT_BRANDS = ["Hudson", "Kaschper", "Wintech", "Sykes", "Fluid", "Dirigo"];

export default async function AdminBoatsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const boats = await getBoats();

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Boats" subtitle="Add boats and set out-of-service status." />

        {params.import_status && params.import_message ? (
          <FlashNotice
            status={params.import_status === "success" ? "success" : "error"}
            message={params.import_message}
          />
        ) : null}
        {params.boat_status && params.boat_message ? (
          <FlashNotice
            status={params.boat_status === "success" ? "success" : "error"}
            message={params.boat_message}
          />
        ) : null}

        <form action={importBoatsCsvAdminAction} className="card form-grid">
          <h3>Import Boats from Spreadsheet</h3>
          <p className="muted">
            Upload a CSV exported from Excel or Google Sheets. Existing boats are matched by boat name and updated.
            New boat names are added automatically.
          </p>
          <Field label="CSV File">
            <input name="file" type="file" accept=".csv,text/csv" required />
          </Field>
          <Card subtle className="stack">
            <strong>Expected column names</strong>
            <p className="muted">
              `name`, `boat_number`, `boat_class_id`, `boat_type`, `photo_url`, `required_skill_level`,
              `weight_class`, `status`, `rigging_notes`
            </p>
            <p className="muted">
              `boat_type` now stores the boat brand, such as `Hudson`, `Kaschper`, `Wintech`, `Sykes`, `Fluid`, or `Dirigo`.
              `boat_class_id` defaults to `1x` if blank. `status` accepts `available`, `maintenance`, or `locked`.
            </p>
          </Card>
          <Button type="submit">Import CSV</Button>
        </form>

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
              <option value="8x">8x (Octuple)</option>
            </select>
          </Field>
          <Field label="Boat brand / type">
            <input name="boat_type" list="boat-brand-options" placeholder="Hudson" />
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
                  <option value="8x">8x (Octuple)</option>
                </select>
              </Field>
              <Field label="Boat brand / type">
                <input name="boat_type" list="boat-brand-options" defaultValue={boat.boat_type ?? ""} />
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
              <Button type="submit" formAction={deleteBoatAdminAction} variant="secondary">
                Delete Boat
              </Button>
            </form>
          ))}
        </div>
        <datalist id="boat-brand-options">
          {BOAT_BRANDS.map((brand) => (
            <option key={brand} value={brand} />
          ))}
        </datalist>
      </main>
    </>
  );
}
