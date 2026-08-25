import { TopNav } from "@/components/TopNav";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { FlashNotice } from "@/components/ui/FlashNotice";
import {
  closeRowingMeetupCallAction,
  createRowingMeetupCallAction,
  removeRowingMeetupCallInterestAction,
  saveRowingMeetupCallInterestAction,
  saveRowingMeetupMembershipAction,
} from "@/lib/actions";
import { getActiveRowingMeetupCalls, getRowingMeetupState } from "@/lib/queries";
import { formatEasternDateTime, nowEasternDateTimeLocalValue } from "@/lib/time";

type SearchParams = Promise<{ call_status?: string; call_message?: string }>;

function boatLabel(value: string) {
  if (value === "any") return "Any boat";
  return value;
}

export default async function RowingMeetupPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [{ myMembership, members }, calls] = await Promise.all([getRowingMeetupState(), getActiveRowingMeetupCalls()]);

  return (
    <>
      <TopNav />
      <main className="stack">
        <section className="hero-panel stack">
          <span className="eyebrow">Programs</span>
          <PageTitle
            title="Rowing Meetup"
            subtitle={`Find a partner or crew for a near-term row. Current pool: ${members.length} rower${members.length === 1 ? "" : "s"}.`}
          />
        </section>

        {params.call_status && params.call_message ? (
          <FlashNotice status={params.call_status === "success" ? "success" : "error"} message={params.call_message} />
        ) : null}

        <form action={saveRowingMeetupMembershipAction} className="card form-grid">
          <h3>{myMembership ? "My Meetup Profile" : "Join Rowing Meetup"}</h3>
          <p className="muted">Your name, rowing level, and preferred boat types help other members find the right crew.</p>
          <Field label="Participation">
            <select name="joined" defaultValue={myMembership ? "true" : "false"}>
              <option value="true">{myMembership ? "stay opted in" : "join Meetup"}</option>
              <option value="false">leave Meetup</option>
            </select>
          </Field>
          <Field label="Rowing Level">
            <select name="skill_level" defaultValue={myMembership?.skill_level ?? "Beginner"}>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
              <option value="Elite">Elite</option>
            </select>
          </Field>
          <Field label="Boat Preferences">
            <div className="row">
              <label><input type="checkbox" name="wants_1x" value="true" defaultChecked={myMembership?.wants_1x ?? false} /> 1x</label>
              <label><input type="checkbox" name="wants_2x" value="true" defaultChecked={myMembership?.wants_2x ?? true} /> 2x</label>
              <label><input type="checkbox" name="wants_4x" value="true" defaultChecked={myMembership?.wants_4x ?? true} /> 4x</label>
            </div>
          </Field>
          <Button type="submit">{myMembership ? "Save Meetup Profile" : "Join Meetup"}</Button>
        </form>

        {myMembership ? (
          <>
            <form action={createRowingMeetupCallAction} className="card form-grid">
              <h3>Create a Rowing Call</h3>
              <p className="muted">Calls automatically disappear once their end time passes. Current Meetup members receive a notification.</p>
              <Field label="What are you looking for?">
                <textarea name="message" rows={3} placeholder="Anyone want to row Sunday morning?" required maxLength={500} />
              </Field>
              <Field label="Start time">
                <input name="starts_at" type="datetime-local" defaultValue={nowEasternDateTimeLocalValue()} required />
              </Field>
              <Field label="End time">
                <input name="ends_at" type="datetime-local" required />
              </Field>
              <Field label="Launch location (optional)">
                <input name="launch_location" placeholder="Ohio River" maxLength={100} />
              </Field>
              <Field label="Boat preference">
                <select name="boat_class_id" defaultValue="any">
                  <option value="any">Any boat</option>
                  <option value="1x">1x</option>
                  <option value="2x">2x</option>
                  <option value="4x">4x</option>
                </select>
              </Field>
              <Button type="submit">Post Rowing Call</Button>
            </form>

            <section className="stack">
              <div className="page-title">
                <h3>Upcoming Rowing Calls</h3>
                <span className="muted">Only current calls are shown.</span>
              </div>
              {calls.length === 0 ? <Card subtle>No active rowing calls right now.</Card> : null}
              {calls.map((call) => {
                const myInterest = call.interests.find((interest) => interest.member_id === myMembership.member_id) ?? null;
                const isCreator = call.created_by === myMembership.member_id;
                return (
                  <Card key={call.id} className="stack">
                    <div className="page-title">
                      <div>
                        <h3>{call.message}</h3>
                        <p className="muted">Posted by {call.creator_name} · {call.creator_skill_level}</p>
                      </div>
                      <strong>{boatLabel(call.boat_class_id)}</strong>
                    </div>
                    <p className="muted">
                      {formatEasternDateTime(call.starts_at)}–{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeStyle: "short" }).format(new Date(call.ends_at))} ET
                      {call.launch_location ? ` · ${call.launch_location}` : ""}
                    </p>
                    <div className="stack">
                      <strong>Interested Rowers ({call.interests.length})</strong>
                      {call.interests.length === 0 ? <p className="muted">No responses yet.</p> : null}
                      {call.interests.map((interest) => (
                        <p key={interest.id} className="muted">
                          {interest.full_name} · {interest.skill_level}{interest.comment ? ` — ${interest.comment}` : ""}
                        </p>
                      ))}
                    </div>
                    {!isCreator ? (
                      <div className="stack">
                        <form action={saveRowingMeetupCallInterestAction} className="stack">
                          <input type="hidden" name="call_id" value={call.id} />
                          <Field label={myInterest ? "Update your response" : "Interested? Add an optional note"}>
                            <input name="comment" defaultValue={myInterest?.comment ?? ""} placeholder="I can make it after 8:15." maxLength={300} />
                          </Field>
                          <Button type="submit">{myInterest ? "Update Interest" : "I’m Interested"}</Button>
                        </form>
                        {myInterest ? (
                          <form action={removeRowingMeetupCallInterestAction}>
                            <input type="hidden" name="call_id" value={call.id} />
                            <Button type="submit" variant="secondary">Remove Interest</Button>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <form action={closeRowingMeetupCallAction}>
                        <input type="hidden" name="call_id" value={call.id} />
                        <Button type="submit" variant="secondary">Close Call</Button>
                      </form>
                    )}
                  </Card>
                );
              })}
            </section>
          </>
        ) : null}

        <Card className="stack">
          <h3>Meetup Roster</h3>
          {members.length === 0 ? <p className="muted">No one has joined Meetup yet.</p> : null}
          {members.map((member) => (
            <Card key={member.member_id} subtle className="stack">
              <div className="page-title">
                <h4>{member.full_name}</h4>
                <span className="muted">{member.skill_level}</span>
              </div>
              <p className="muted">Boat preferences: {[member.wants_1x ? "1x" : null, member.wants_2x ? "2x" : null, member.wants_4x ? "4x" : null].filter(Boolean).join(", ") || "none set"}</p>
            </Card>
          ))}
        </Card>
      </main>
    </>
  );
}
