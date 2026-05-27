import { TopNav } from "@/components/TopNav";
import { ensureAdminProfile } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { addSafetyResourceAdminAction, updateSafetyResourceAdminAction } from "@/lib/actions";

export default async function AdminSafetyPage() {
  const { supabase } = await ensureAdminProfile();

  const { data: resources } = await supabase
    .from("safety_resources")
    .select("id, title, description, resource_type, external_url, storage_path, mime_type, sort_order, is_published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const storagePaths = (resources ?? []).map((resource) => resource.storage_path).filter(Boolean) as string[];
  const signedUrlMap = new Map<string, string>();
  if (storagePaths.length > 0) {
    const uniquePaths = [...new Set(storagePaths)];
    const { data: signedUrls } = await supabase.storage.from("safety-resources").createSignedUrls(uniquePaths, 60 * 60);
    for (const signed of signedUrls ?? []) {
      if (signed.path && signed.signedUrl) signedUrlMap.set(signed.path, signed.signedUrl);
    }
  }

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle
          title="Admin: Basic Safety Info"
          subtitle="Post photos, Google Form quizzes, and procedure documents/links for members."
        />

        <form action={addSafetyResourceAdminAction} className="card form-grid">
          <h3>Add Safety Resource</h3>
          <Field label="Title">
            <input name="title" required placeholder="Dock launch checklist" />
          </Field>
          <Field label="Type">
            <select name="resource_type" defaultValue="procedure">
              <option value="photo">photo</option>
              <option value="procedure">procedure</option>
              <option value="quiz">quiz</option>
            </select>
          </Field>
          <Field label="Description">
            <textarea name="description" rows={3} placeholder="What members should know before opening this resource." />
          </Field>
          <Field label="External Link (optional)">
            <input name="external_url" placeholder="https://docs.google.com/forms/... or https://drive.google.com/..." />
          </Field>
          <Field label="Upload File (optional)">
            <input name="file" type="file" accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.txt" />
          </Field>
          <Field label="Display Order">
            <input name="sort_order" type="number" min={0} defaultValue={0} />
          </Field>
          <Field label="Published">
            <select name="is_published" defaultValue="true">
              <option value="true">yes</option>
              <option value="false">no</option>
            </select>
          </Field>
          <Button type="submit">Save Safety Resource</Button>
        </form>

        <div className="stack">
          {(resources ?? []).length === 0 ? <Card subtle>No safety resources added yet.</Card> : null}
          {(resources ?? []).map((resource) => {
            const resourceUrl = resource.external_url ?? (resource.storage_path ? signedUrlMap.get(resource.storage_path) ?? null : null);

            return (
              <form key={resource.id} action={updateSafetyResourceAdminAction} className="card form-grid">
                <h3>{resource.title}</h3>
                <input type="hidden" name="resource_id" value={resource.id} />
                <Field label="Title">
                  <input name="title" defaultValue={resource.title} required />
                </Field>
                <Field label="Type">
                  <select name="resource_type" defaultValue={resource.resource_type}>
                    <option value="photo">photo</option>
                    <option value="procedure">procedure</option>
                    <option value="quiz">quiz</option>
                  </select>
                </Field>
                <Field label="Description">
                  <textarea name="description" rows={3} defaultValue={resource.description ?? ""} />
                </Field>
                <Field label="External Link (optional)">
                  <input name="external_url" defaultValue={resource.external_url ?? ""} placeholder="https://..." />
                </Field>
                <Field label="Replace File (optional)">
                  <input name="file" type="file" accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.txt" />
                </Field>
                <Field label="Display Order">
                  <input name="sort_order" type="number" min={0} defaultValue={resource.sort_order} />
                </Field>
                <Field label="Published">
                  <select name="is_published" defaultValue={resource.is_published ? "true" : "false"}>
                    <option value="true">yes</option>
                    <option value="false">no</option>
                  </select>
                </Field>
                {resourceUrl ? (
                  <a href={resourceUrl} target="_blank" rel="noreferrer" className="cta-link">
                    Open Current Resource
                  </a>
                ) : (
                  <p className="muted">No current file or link attached.</p>
                )}
                <Button type="submit" variant="secondary">
                  Update Safety Resource
                </Button>
              </form>
            );
          })}
        </div>
      </main>
    </>
  );
}
