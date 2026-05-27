import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { addRaceEventAdminAction } from "@/lib/actions";

export default async function AdminRacesPage() {
  const { supabase } = await ensureAdminProfile();

  const { data: races } = await supabase
    .from("race_events")
    .select("id, title, event_date, location, notes")
    .order("event_date", { ascending: true });

  const raceIds = (races ?? []).map((r) => r.id);
  const signups = raceIds.length
    ? (
        await supabase
          .from("race_signups")
          .select("race_event_id, birthdate, desired_race_count, wants_1x, wants_2x, wants_4x, wants_8x, profiles(full_name)")
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
          <Button type="submit">Create Race</Button>
        </form>

        <div className="stack">
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
                <table>
                  <thead>
                    <tr>
                      <th>Rower</th>
                      <th>Birthdate</th>
                      <th>Race Count</th>
                      <th>Prefs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {raceSignups.length === 0 ? (
                      <tr>
                        <td colSpan={4}>No signups yet.</td>
                      </tr>
                    ) : (
                      raceSignups.map((signup, idx) => {
                        const profile = Array.isArray(signup.profiles) ? signup.profiles[0] : signup.profiles;
                        const prefs = [
                          signup.wants_1x ? "1x" : null,
                          signup.wants_2x ? "2x" : null,
                          signup.wants_4x ? "4x" : null,
                          signup.wants_8x ? "8x" : null,
                        ]
                          .filter(Boolean)
                          .join(", ");
                        return (
                          <tr key={`${race.id}-${idx}`}>
                            <td>{profile?.full_name ?? "Unknown"}</td>
                            <td>{signup.birthdate}</td>
                            <td>{signup.desired_race_count ?? 1}</td>
                            <td>{prefs || "-"}</td>
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
