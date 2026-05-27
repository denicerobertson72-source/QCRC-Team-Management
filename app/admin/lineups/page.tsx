import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";

export default async function AdminLineupsPage() {
  await ensureAdminProfile();

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Lineups" subtitle="Choose a group and date-specific session lineup." />
        <div className="grid">
          <Card className="stack">
            <h3>Saturday Coached Row</h3>
            <Link href="/admin/lineups/saturday">Open Saturday Lineups</Link>
          </Card>
          <Card className="stack">
            <h3>Training: Beginner/Intermediate</h3>
            <Link href="/admin/lineups/training/beginner-intermediate">Open BI Lineups</Link>
          </Card>
          <Card className="stack">
            <h3>Training: Advanced</h3>
            <Link href="/admin/lineups/training/advanced">Open Advanced Lineups</Link>
          </Card>
          <Card className="stack">
            <h3>Racing Lineups</h3>
            <Link href="/admin/races">Open Racing</Link>
          </Card>
        </div>
      </main>
    </>
  );
}
