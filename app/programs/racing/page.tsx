import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { saveRaceSignupAction } from "@/lib/actions";
import { getRaceEventsWithMySignup } from "@/lib/queries";
import { SignupRoster } from "@/components/SignupRoster";
import { RaceSignupForm } from "@/components/racing/RaceSignupForm";

export default async function RacingProgramPage() {
  const events = await getRaceEventsWithMySignup();

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Racing Signups" subtitle="Pick races, enter birthdate, choose preferred boat classes, and note how many races you want to row." />

        <div className="stack">
          {events.length === 0 ? <Card subtle>No upcoming races posted.</Card> : null}

          {events.map((event) => (
            <Card key={event.id} className="stack">
              <h3>{event.title}</h3>
              <p className="muted">
                {event.event_date}
                {event.location ? ` | ${event.location}` : ""}
              </p>
              <SignupRoster names={event.attendee_names} />
              {event.my_signup?.comments ? (
                <Card subtle>
                  <strong>Saved comment</strong>
                  <p>{event.my_signup.comments}</p>
                </Card>
              ) : null}

              <RaceSignupForm raceEventId={event.id} signup={event.my_signup} action={saveRaceSignupAction} />
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
