import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";

export default function TrainingProgramHubPage() {
  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Coached Training" subtitle="Choose your group to view date-based signups." />
        <div className="grid">
          <Card className="stack">
            <h3>Beginner/Intermediate</h3>
            <p className="muted">Monday and Thursday at 5:30 PM ET. Arrival time 5:10 PM.</p>
            <Link href="/programs/training/beginner-intermediate">Open Group</Link>
          </Card>
          <Card className="stack">
            <h3>Advanced</h3>
            <p className="muted">Tuesday and Thursday at 6:30 AM ET. Arrival time 6:10 AM.</p>
            <Link href="/programs/training/advanced">Open Group</Link>
          </Card>
        </div>
      </main>
    </>
  );
}
