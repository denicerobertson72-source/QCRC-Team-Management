import { TopNav } from "@/components/TopNav";
import { ensureProfile } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { StatusChip } from "@/components/ui/StatusChip";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { triageDamageAdminAction } from "@/lib/actions";
import { formatEasternDateTime } from "@/lib/time";

export default async function AdminDamagePage() {
  const { supabase } = await ensureProfile();

  const { data } = await supabase
    .from("damage_reports")
    .select("id, boat_id, severity, status, reported_at, description, boats(name,status), damage_photos(storage_path)")
    .order("reported_at", { ascending: false });

  const photoPaths = (data ?? []).flatMap((item) =>
    (Array.isArray(item.damage_photos) ? item.damage_photos : [])
      .map((photo) => photo.storage_path)
      .filter(Boolean),
  );

  const signedUrlMap = new Map<string, string>();
  if (photoPaths.length > 0) {
    const uniquePaths = [...new Set(photoPaths)];
    const { data: signedUrls } = await supabase.storage.from("damage-photos").createSignedUrls(uniquePaths, 60 * 60);
    for (const signed of signedUrls ?? []) {
      if (signed.path && signed.signedUrl) {
        signedUrlMap.set(signed.path, signed.signedUrl);
      }
    }
  }

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Damage Queue" subtitle="Review reports and document fixes." />

        <div className="stack">
          {(data ?? []).map((item) => (
            <Card key={item.id} className="stack">
              <div className="page-title">
                <h3>{(Array.isArray(item.boats) ? item.boats[0] : item.boats)?.name ?? item.boat_id}</h3>
                <div className="row">
                  <StatusChip label={item.status} />
                  {(Array.isArray(item.boats) ? item.boats[0] : item.boats)?.status !== "available" ? (
                    <StatusChip label="Out of Service" kind="reserved" />
                  ) : null}
                </div>
              </div>

              <p>
                <strong>Severity {item.severity}</strong>
              </p>
              <p>{item.description}</p>
              <p className="muted">{formatEasternDateTime(item.reported_at)} ET</p>

              {Array.isArray(item.damage_photos) && item.damage_photos.length > 0 ? (
                <div className="grid">
                  {item.damage_photos.map((photo, index) => {
                    const imageUrl = signedUrlMap.get(photo.storage_path);
                    if (!imageUrl) {
                      return (
                        <Card key={`${item.id}-photo-${index}`} subtle>
                          <p className="muted">{photo.storage_path}</p>
                        </Card>
                      );
                    }

                    return (
                      <a key={`${item.id}-photo-${index}`} href={imageUrl} target="_blank" rel="noreferrer" className="card-subtle">
                        <img
                          src={imageUrl}
                          alt={`Damage photo ${index + 1}`}
                          style={{ width: "100%", borderRadius: "12px", display: "block", objectFit: "cover" }}
                        />
                      </a>
                    );
                  })}
                </div>
              ) : (
                <p className="muted">No photos attached.</p>
              )}

              <form action={triageDamageAdminAction} className="form-grid">
                <input type="hidden" name="damage_report_id" value={item.id} />
                <Field label="Status">
                  <select name="status" defaultValue={item.status}>
                    <option value="new">new</option>
                    <option value="triaged">triaged</option>
                    <option value="in_repair">in_repair</option>
                    <option value="resolved">resolved</option>
                  </select>
                </Field>
                <Field label="Resolution notes">
                  <textarea name="resolution_notes" rows={3} />
                </Field>
                <Field label="Labor cost (optional)">
                  <input name="labor_cost" type="number" min={0} step="0.01" />
                </Field>
                <Field label="Parts cost (optional)">
                  <input name="parts_cost" type="number" min={0} step="0.01" />
                </Field>
                <Field label="Unlock boat when resolved?">
                  <select name="unlock_boat" defaultValue="false">
                    <option value="false">no</option>
                    <option value="true">yes</option>
                  </select>
                </Field>
                <Button type="submit">Save Triage</Button>
              </form>
            </Card>
          ))}
          {(data ?? []).length === 0 ? <Card subtle>No damage reports yet.</Card> : null}
        </div>
      </main>
    </>
  );
}
