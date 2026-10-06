import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { addRaceEventAdminAction, updateRaceEventAdminAction, updateRaceSignupAdminAction, updateRacingPlanningSettingsAdminAction, addRaceSignupAdminFormAction, removeRaceSignupAdminFormAction } from "@/lib/actions";

export default async function AdminRacesPage() {
  const { supabase } = await ensureAdminProfile();
  const { data: races } = await supabase
    .from("race_events")
    .select("id, title, event_date, location, notes, eligible_skill_levels, entry_type")
    .order("event_date", { ascending: false });

  const raceIds = (races ?? []).map((r) => r.id);
  const signups = raceIds.length
    ? (
        await supabase
          .from("race_signups")
          .select("id, race_event_id, member_id, birthdate, desired_race_count, wants_1x, wants_2x, wants_4x, wants_8x, comments, profiles(id, full_name)")
          .in("race_event_id", raceIds)
      ).data ?? []
    : [];
  const { data: planningSettings } = await supabase.from("racing_planning_settings").select("minimum_race_turnaround_minutes").eq("id", true).maybeSingle();
  const { data: members } = await supabase.from("profiles").select("id, full_name").eq("status", "active").order("full_name");

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Racing" subtitle="Create races and review rower signups." />

        <form action={updateRacingPlanningSettingsAdminAction} className="card inline-form">
          <Field label="Race resource turnaround (minutes)"><input name="minimum_race_turnaround_minutes" type="number" min={1} max={240} defaultValue={planningSettings?.minimum_race_turnaround_minutes ?? 30} required /></Field>
          <Button type="submit" variant="secondary">Save planning setting</Button>
        </form>

        <form action={addRaceEventAdminAction} className="card form-grid">
          <h3>Add Race</h3>
          <Field label="Race title">
            <input name="title" required />
          </Field>
          <Field label="Race date">
            <input name="event_date" type="date" required />
          </Field>
          <Field label="Race type"><select name="entry_type" defaultValue="masters"><option value="masters">Masters / QCRC lineup</option><option value="youth_boat_only">Youth boat-only use</option></select></Field>
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
            // Signup availability is deliberately based only on this race's
            // signup rows. Never use lineup seats or cross-race conflict data here.
            const currentRaceSignupIds = new Set(raceSignups.map((signup) => signup.member_id));

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
                  <Field label="Race type"><select name="entry_type" defaultValue={race.entry_type ?? "masters"}><option value="masters">Masters / QCRC lineup</option><option value="youth_boat_only">Youth boat-only use</option></select></Field>
                  <Field label="Location"><input name="location" defaultValue={race.location ?? ""} /></Field>
                  <Field label="Notes"><input name="notes" defaultValue={race.notes ?? ""} /></Field>
                  <Field label="Visible to rower skill levels"><div className="row" style={{ flexWrap: "wrap" }}>{["LTR", "Beginner", "Intermediate", "Advanced", "Elite"].map((level) => <label key={level}><input type="checkbox" name="eligible_skill_levels" value={level} defaultChecked={(race.eligible_skill_levels ?? ["LTR", "Beginner", "Intermediate", "Advanced", "Elite"]).includes(level)} /> {level}</label>)}</div></Field>
                  <Button type="submit" variant="secondary">Save Race Posting</Button>
                </form>
                <form action={addRaceSignupAdminFormAction} className="card-subtle inline-form">
                  <input type="hidden" name="race_event_id" value={race.id} />
                  <Field label="Add rower"><select name="member_id" required defaultValue=""><option value="" disabled>Select a member</option>{(members ?? []).filter((member) => !currentRaceSignupIds.has(member.id)).map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></Field>
                  <Field label="Birthdate"><input name="birthdate" type="date" required /></Field>
                  <Button type="submit" variant="secondary">Add to Race</Button>
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
                                </div>
                                <Field label="Comments"><input name="comments" defaultValue={signup.comments ?? ""} /></Field>
                                <Button type="submit" variant="secondary">Update {profile?.full_name ?? "Signup"}</Button>
                              </form>
                              <form action={removeRaceSignupAdminFormAction} className="inline-form">
                                <input type="hidden" name="race_event_id" value={race.id} />
                                <input type="hidden" name="member_id" value={(profile as { id?: string } | null)?.id ?? ""} />
                                <Button type="submit" variant="secondary">Remove from Race</Button>
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
