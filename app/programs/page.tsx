import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";

export default function ProgramsPage() {
  return (
    <>
      <TopNav />
      <main className="stack">
        <section className="hero-panel stack">
          <span className="eyebrow">Programs</span>
          <PageTitle title="Programs" subtitle="Sign up for coached rows, training blocks, and racing with the current QCRC schedule." />
        </section>
        <div className="grid">
          <Card className="stack program-tile">
            <span className="section-kicker">Weekly</span>
            <h3>Saturday Coached Row</h3>
            <p className="muted">Row at 8:30 AM ET. Arrival time 7:45 AM.</p>
            <Link href="/programs/saturday" className="cta-link">Open Signup</Link>
          </Card>
          <Card className="stack program-tile">
            <span className="section-kicker">Coaching</span>
            <h3>Coached Training</h3>
            <p className="muted">Choose Beginner/Intermediate or Advanced with date-based weekly signups.</p>
            <Link href="/programs/training" className="cta-link">Open Signup</Link>
          </Card>
          <Card className="stack program-tile">
            <span className="section-kicker">Competition</span>
            <h3>Racing</h3>
            <p className="muted">Select races, add birthdate, and choose preferred boat classes.</p>
            <Link href="/programs/racing" className="cta-link">Open Signup</Link>
          </Card>
          <Card className="stack program-tile">
            <span className="section-kicker">Community</span>
            <h3>Rowing Meetup</h3>
            <p className="muted">Opt in, share your availability, and get alerts when new rowers join the meetup pool.</p>
            <Link href="/programs/meetup" className="cta-link">Open Meetup</Link>
          </Card>
        </div>
      </main>
    </>
  );
}
