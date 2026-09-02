import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { addRaceEventAdminAction, updateRaceEventAdminAction, updateRaceSignupAdminAction } from "@/lib/actions";

export default async function AdminRacesPage() {
  const { supabase } = await ensureAdminProfile();
  const { data: races } = await supabase
    .from("race_events")
    .select("id, title, event_date, location, notes, eligible_skill_levels")
    .order("event_date", { ascending: false });

  const raceIds = (races ?? []).map((r) => r.id);
  const signups = raceIds.length
    ? (
        await supabase
          .from("race_signups")
          .select("id, race_event_id, birthdate, desired_race_count, wants_1x, wants_2x, wants_4x, wants_8x, comments, profiles(full_name)")
          .in("race_event_id", raceIds)
      ).data ?? []
    : [];

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Racing" subtitle="Create races and review rower signups." />

        <form action={addRaceEventAdminAction} className="card form-grid">
          <h3>Add Race</h3>
          <Field label="Race title">
            <input name="title" required />
          </Field>
          <Field label="Race date">
            <input name="event_date" type="date" required />
          </Field>
          <Field label="Location">
            <input name="location" />
          </Field>
          <Field label="Notes">
            <input name="notes" />
          </Field>
          <Field label="Visible to rower skill levels"><div className="row" style={{ flexWrap: "wrap" }}>{["LTR", "Beginner", "Intermediate", "Advanced", "Elite"].map((level) => <label key={level}><input type="checkbox" name="eligible_skill_levels" value={level} defaultChecked /> {level}</label>)}</div></Field>
          <Button type="submit">Create Race</Button>
        </form>

        <div className="stack">
          {(races ?? []).length === 0 ? <Card subtle>No upcoming races posted.</Card> : null}

          {(races ?? []).map((race) => {
            const raceSignups = signups.filter((s) => s.race_event_id === race.id);

            return (
              <Card key={race.id} className="stack">
                <div className="page-title">
                  <h3>{race.title}</h3>
                  <Link href={`/admin/races/${race.id}/lineup`}>Build Lineup</Link>
                </div>
                <p className="muted">
                  {race.event_date}
                  {race.location ? ` | ${race.location}` : ""}
                </p>
                <form action={updateRaceEventAdminAction} className="form-grid">
                  <input type="hidden" name="race_event_id" value={race.id} />
                  <Field label="Race title"><input name="title" defaultValue={race.title} required /></Field>
                  <Field label="Race date"><input name="event_date" type="date" defaultValue={race.event_date} required /></Field>
                  <Field label="Location"><input name="location" defaultValue={race.location ?? ""} /></Field>
                  <Field label="Notes"><input name="notes" defaultValue={race.notes ?? ""} /></Field>
                  <Field label="Visible to rower skill levels"><div className="row" style={{ flexWrap: "wrap" }}>{["LTR", "Beginner", "Intermediate", "Advanced", "Elite"].map((level) => <label key={level}><input type="checkbox" name="eligible_skill_levels" value={level} defaultChecked={(race.eligible_skill_levels ?? ["LTR", "Beginner", "Intermediate", "Advanced", "Elite"]).includes(level)} /> {level}</label>)}</div></Field>
                  <Button type="submit" variant="secondary">Save Race Posting</Button>
                </form>
                <table>
                  <thead>
                    <tr>
                      <th>Rower</th>
                      <th>Birthdate</th>
                      <th>Race Count</th>
                      <th>Prefs</th>
                      <th>Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {raceSignups.length === 0 ? (
                      <tr>
                        <td colSpan={5}>No signups yet.</td>
                      </tr>
                    ) : (
                      raceSignups.map((signup, idx) => {
                        const profile = Array.isArray(signup.profiles) ? signup.profiles[0] : signup.profiles;
                        return (
                          <tr key={`${race.id}-${idx}`}>
                            <td colSpan={5}>
                              <form action={updateRaceSignupAdminAction} className="form-grid">
                                <input type="hidden" name="signup_id" value={signup.id} />
                                <strong>{profile?.full_name ?? "Unknown"}</strong>
                                <Field label="Birthdate"><input name="birthdate" type="date" defaultValue={signup.birthdate} required /></Field>
                                <Field label="Number of races"><select name="desired_race_count" defaultValue={String(signup.desired_race_count ?? 1)}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}</select></Field>
                                <div className="row" style={{ flexWrap: "wrap" }}>
                                  <label><input type="checkbox" name="wants_1x" value="true" defaultChecked={signup.wants_1x} /> 1x</label>
                                  <label><input type="checkbox" name="wants_2x" value="true" defaultChecked={signup.wants_2x} /> 2x</label>
                                  <label><input type="checkbox" name="wants_4x" value="true" defaultChecked={signup.wants_4x} /> 4x</label>
                                  <label><input type="checkbox" name="wants_8x" value="true" defaultChecked={signup.wants_8x} /> 8x</label>
                                </div>
                                <Field label="Comments"><input name="comments" defaultValue={signup.comments ?? ""} /></Field>
                                <Button type="submit" variant="secondary">Save {profile?.full_name ?? "Signup"}</Button>
                              </form>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
      </main>
    </>
  );
}
