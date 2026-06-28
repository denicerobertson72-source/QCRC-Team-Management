import { TopNav } from "@/components/TopNav";
import { ensureProfile } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { StatusChip } from "@/components/ui/StatusChip";

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

function skillLevelToClearance(level: string | null | undefined) {
  switch (level) {
    case "Elite":
      return 4;
    case "Advanced":
      return 3;
    case "Intermediate":
      return 2;
    case "LTR":
    case "Beginner":
    default:
      return 1;
  }
}

export default async function AdminClearancesPage() {
  const { supabase } = await ensureProfile();
  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, skill_level, status, membership_type")
    .order("full_name");

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle
          title="Admin: Clearances"
          subtitle="Skill Level in Admin Members is the single source of truth for boat access. This page is now a read-only club-wide view of those levels."
        />

        <Card subtle className="stack">
          <p className="muted">
            To change a rower&apos;s access, update their <strong>Skill Level</strong> on Admin Members. Boat access now follows that value directly, together with each boat&apos;s required skill and weight class.
          </p>
        </Card>

        <Card>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Status</th>
                <th>Membership</th>
                <th>Skill Level</th>
                <th>1x</th>
                <th>2x</th>
                <th>4x</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((member) => {
                const derivedTier = clearanceLabel(skillLevelToClearance(member.skill_level));
                return (
                <tr key={member.id}>
                  <td>{member.full_name}</td>
                  <td>
                    <StatusChip label={member.status} kind={member.status === "active" ? "checked_out" : "reserved"} />
                  </td>
                  <td>{member.membership_type}</td>
                  <td>{member.skill_level}</td>
                  <td>{derivedTier}</td>
                  <td>{derivedTier}</td>
                  <td>{derivedTier}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
