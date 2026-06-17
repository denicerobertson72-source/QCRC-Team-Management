import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { getMyTrainingGroupAssignment } from "@/lib/queries";

export default async function TrainingProgramHubPage() {
  const trainingGroup = await getMyTrainingGroupAssignment();

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle
          title="Coached Training"
          subtitle={
            trainingGroup
              ? "Open your assigned training group to view date-based signups."
              : "A club admin must assign you to a coached training group before these signups become visible."
          }
        />
        <div className="grid">
          {trainingGroup === "beginner_intermediate" ? (
            <Card className="stack">
              <h3>Beginner/Intermediate</h3>
              <p className="muted">Monday and Thursday at 5:30 PM ET. Arrival time 5:10 PM.</p>
              <Link href="/programs/training/beginner-intermediate">Open Group</Link>
            </Card>
          ) : null}
          {trainingGroup === "advanced" ? (
            <Card className="stack">
              <h3>Advanced</h3>
              <p className="muted">Tuesday and Thursday at 6:30 AM ET. Arrival time 6:10 AM.</p>
              <Link href="/programs/training/advanced">Open Group</Link>
            </Card>
          ) : null}
          {!trainingGroup ? <Card subtle>No coached training group is assigned to your account yet.</Card> : null}
        </div>
      </main>
    </>
  );
}
