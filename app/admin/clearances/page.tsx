import { TopNav } from "@/components/TopNav";
import { ensureProfile } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { updateClearanceAdminAction } from "@/lib/actions";
import { formatEasternDateTime } from "@/lib/time";

function clearanceLabel(level: number) {
  switch (level) {
    case 4:
      return "Elite";
    case 3:
      return "Advanced";
    case 2:
      return "Intermediate";
    case 1:
    default:
      return "Beginner";
  }
}

export default async function AdminClearancesPage() {
  const { supabase } = await ensureProfile();

  const [{ data: clearances }, { data: members }] = await Promise.all([
    supabase
      .from("member_clearances")
      .select("id, member_id, boat_class_id, clearance_level, approved_at, profiles!member_clearances_member_id_fkey(full_name)")
      .order("approved_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Clearances" subtitle="Set member access by boat class using named skill tiers." />

        <form action={updateClearanceAdminAction} className="card form-grid">
          <h3>Set Clearance</h3>
          <Field label="Member">
            <select name="member_id" defaultValue="" required>
              <option value="" disabled>
                Select member
              </option>
              {(members ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Boat class">
            <select name="boat_class_id" defaultValue="1x">
              <option value="1x">1x</option>
              <option value="2x">2x</option>
              <option value="4x">4x</option>
            </select>
          </Field>
          <Field label="Skill tier">
            <select name="clearance_level" defaultValue="Beginner">
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
              <option value="Elite">Elite</option>
            </select>
          </Field>
          <Button type="submit">Save Clearance</Button>
        </form>

        <Card>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Boat Class</th>
                <th>Skill Tier</th>
                <th>Approved At</th>
              </tr>
            </thead>
            <tbody>
              {(clearances ?? []).map((row: any) => (
                <tr key={row.id}>
                  <td>{row.profiles?.full_name}</td>
                  <td>{row.boat_class_id}</td>
                  <td>{clearanceLabel(row.clearance_level)}</td>
                  <td>{formatEasternDateTime(row.approved_at)} ET</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
