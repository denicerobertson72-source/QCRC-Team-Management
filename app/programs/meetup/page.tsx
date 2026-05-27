import { TopNav } from "@/components/TopNav";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import {
  addRowingMeetupAvailabilityAction,
  removeRowingMeetupAvailabilityAction,
  saveRowingMeetupMembershipAction,
} from "@/lib/actions";
import { getRowingMeetupState } from "@/lib/queries";

const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTimeLabel(value: string) {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? "0");
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute));
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

export default async function RowingMeetupPage() {
  const { myMembership, myAvailability, members, availabilityByMember } = await getRowingMeetupState();

  return (
    <>
      <TopNav />
      <main className="stack">
        <section className="hero-panel stack">
          <span className="eyebrow">Programs</span>
          <PageTitle
            title="Rowing Meetup"
            subtitle={`Opt in to connect with other rowers, share weekly availability, and receive alerts when new meetup members join. Current pool: ${members.length} rower${members.length === 1 ? "" : "s"}.`}
          />
        </section>

        <form action={saveRowingMeetupMembershipAction} className="card form-grid">
          <h3>{myMembership ? "Update Meetup Profile" : "Join Rowing Meetup"}</h3>
          <Field label="Participation">
            <select name="joined" defaultValue={myMembership ? "true" : "false"}>
              <option value="true">{myMembership ? "stay opted in" : "join meetup"}</option>
              <option value="false">leave meetup</option>
            </select>
          </Field>
          <Field label="Skill Level">
            <select name="skill_level" defaultValue={myMembership?.skill_level ?? "Beginner"}>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
              <option value="Elite">Elite</option>
            </select>
          </Field>
          <Field label="Boat Preferences">
            <div className="row">
              <label>
                <input type="checkbox" name="wants_2x" value="true" defaultChecked={myMembership ? myMembership.wants_2x : true} /> 2x
              </label>
              <label>
                <input type="checkbox" name="wants_4x" value="true" defaultChecked={myMembership ? myMembership.wants_4x : true} /> 4x
              </label>
            </div>
          </Field>
          <Field label="Notes (optional)">
            <textarea
              name="notes"
              rows={3}
              defaultValue={myMembership?.notes ?? ""}
              placeholder="Anything helpful for matching, such as morning-only or prefers longer rows."
            />
          </Field>
          <Button type="submit">{myMembership ? "Save Meetup Profile" : "Join Meetup"}</Button>
        </form>

        {myMembership ? (
          <Card className="stack">
            <h3>My Availability</h3>
            <form action={addRowingMeetupAvailabilityAction} className="form-grid">
              <div className="row">
                <Field label="Weekday">
                  <select name="weekday" defaultValue="1">
                    {weekdayLabels.map((label, index) => (
                      <option key={label} value={index}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Start Time">
                  <input name="start_time" type="time" required />
                </Field>
                <Field label="End Time">
                  <input name="end_time" type="time" required />
                </Field>
              </div>
              <Button type="submit" variant="secondary">
                Add Availability Slot
              </Button>
            </form>

            <div className="stack">
              {myAvailability.length === 0 ? <p className="muted">No availability added yet.</p> : null}
              {myAvailability.map((slot) => (
                <Card key={slot.id} subtle className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    {weekdayLabels[slot.weekday]} | {formatTimeLabel(slot.start_time)} - {formatTimeLabel(slot.end_time)}
                  </span>
                  <form action={removeRowingMeetupAvailabilityAction}>
                    <input type="hidden" name="slot_id" value={slot.id} />
                    <Button type="submit" variant="secondary">
                      Remove
                    </Button>
                  </form>
                </Card>
              ))}
            </div>
          </Card>
        ) : null}

        <Card className="stack">
          <h3>Meetup Roster</h3>
          {members.length === 0 ? <p className="muted">No one has joined the meetup yet.</p> : null}
          <div className="stack">
            {members.map((member) => (
              <Card key={member.member_id} subtle className="stack">
                <div className="page-title">
                  <h4>{member.full_name}</h4>
                  <span className="muted">{member.skill_level}</span>
                </div>
                <p className="muted">
                  Boat preferences: {[member.wants_2x ? "2x" : null, member.wants_4x ? "4x" : null].filter(Boolean).join(", ") || "none set"}
                </p>
                {member.notes ? <p>{member.notes}</p> : null}
                <div className="stack" style={{ gap: "0.4rem" }}>
                  {(availabilityByMember[member.member_id] ?? []).length === 0 ? (
                    <p className="muted">No availability posted yet.</p>
                  ) : (
                    (availabilityByMember[member.member_id] ?? []).map((slot) => (
                      <span key={slot.id} className="muted">
                        {weekdayLabels[slot.weekday]} | {formatTimeLabel(slot.start_time)} - {formatTimeLabel(slot.end_time)}
                      </span>
                    ))
                  )}
                </div>
              </Card>
            ))}
          </div>
        </Card>
      </main>
    </>
  );
}
