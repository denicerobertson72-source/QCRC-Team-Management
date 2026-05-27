import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";

export default async function AdminProgramsHubPage() {
  await ensureAdminProfile();

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Program Schedule" subtitle="Open a specific program schedule page." />
        <div className="grid">
          <Card className="stack">
            <h3>Saturday Coached Row</h3>
            <Link href="/admin/programs/saturday">Open Saturday Schedule</Link>
          </Card>
          <Card className="stack">
            <h3>Training: Beginner/Intermediate</h3>
            <Link href="/admin/programs/training-beginner-intermediate">Open BI Schedule</Link>
          </Card>
          <Card className="stack">
            <h3>Training: Advanced</h3>
            <Link href="/admin/programs/training-advanced">Open Advanced Schedule</Link>
          </Card>
        </div>
      </main>
    </>
  );
}
