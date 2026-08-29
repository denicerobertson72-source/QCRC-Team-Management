import { TopNav } from "@/components/TopNav";
import { BoatCard } from "@/components/BoatCard";
import { getBoats } from "@/lib/queries";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";

type BoatsSearchParams = Promise<{
  name?: string;
  boatNumber?: string;
  boatClassId?: string;
}>;

export default async function BoatsPage({ searchParams }: { searchParams: BoatsSearchParams }) {
  const params = await searchParams;
  const boats = await getBoats();
  const name = (params.name ?? "").trim().toLowerCase();
  const boatNumber = (params.boatNumber ?? "").trim().toLowerCase();
  const boatClassId = params.boatClassId ?? "";
  const visibleBoats = boats.filter((boat) => {
    if (name && !boat.name.toLowerCase().includes(name)) return false;
    if (boatNumber && !(boat.boat_number ?? "").toLowerCase().includes(boatNumber)) return false;
    if (boatClassId && boat.boat_class_id !== boatClassId) return false;
    return true;
  });

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Boats" subtitle="Inventory, status, and setup notes." />
        <form method="get" className="card form-grid">
          <Field label="Boat Name">
            <input name="name" defaultValue={params.name ?? ""} placeholder="Search by boat name" />
          </Field>
          <Field label="Boat Number">
            <input name="boatNumber" defaultValue={params.boatNumber ?? ""} placeholder="Search by number" />
          </Field>
          <Field label="Boat Class">
            <select name="boatClassId" defaultValue={boatClassId}>
              <option value="">All</option>
              <option value="1x">1x</option>
              <option value="2x">2x</option>
              <option value="4x">4x</option>
              <option value="8x">8x (Octuple)</option>
            </select>
          </Field>
          <p className="muted">
            Showing {visibleBoats.length} of {boats.length} boats.
          </p>
          <div className="row">
            <Button type="submit">Apply Filters</Button>
            <a href="/boats" className="cta-link">
              Clear Filters
            </a>
          </div>
        </form>
        <div className="grid">
          {visibleBoats.map((boat) => (
            <details key={boat.id} className="card boat-collapsible">
              <summary className="boat-summary">
                <div className="boat-summary-main">
                  <h3>
                    {boat.name}
                    {boat.boat_number ? ` #${boat.boat_number}` : ""}
                  </h3>
                  <p className="muted">
                    {boat.boat_class_id} | {boat.boat_type ? `${boat.boat_type} | ` : ""}skill {boat.required_skill_level} | weight {boat.weight_class ?? "Any"}
                  </p>
                </div>
                <div className="boat-summary-side">
                  <div className="row">
                    <StatusChip label={boat.boat_class_id} />
                    <StatusChip label={boat.status} kind={boat.status === "available" ? "checked_out" : "reserved"} />
                  </div>
                  <span className="member-summary-hint">Click to expand</span>
                </div>
              </summary>
              <div className="boat-details">
                <BoatCard boat={boat} />
              </div>
            </details>
          ))}
        </div>
      </main>
    </>
  );
}
