import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { ensureProfile } from "@/lib/auth";
import { SetPasswordForm } from "@/components/account/SetPasswordForm";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { FlashNotice } from "@/components/ui/FlashNotice";
import { updateMyFullNameAction } from "@/lib/actions";

type SearchParams = Promise<{ reset?: string; profile_status?: string; profile_message?: string }>;

export default async function AccountSecurityPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, user } = await ensureProfile();
  const params = await searchParams;
  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).single();
  const subtitle = params.reset
    ? "Your reset link is active. Save a new password now."
    : "Set a password so you can sign in directly without waiting for magic links.";

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Account Setting" subtitle={subtitle} />
        {params.profile_status && params.profile_message ? (
          <FlashNotice
            status={params.profile_status === "success" ? "success" : "error"}
            message={params.profile_message}
          />
        ) : null}
        <form action={updateMyFullNameAction} className="card form-grid">
          <h2>Profile</h2>
          <p className="muted">Update the name shown around the club site and on safety records.</p>
          <Field label="Full Name">
            <input
              name="full_name"
              defaultValue={profile?.full_name && !profile.full_name.includes("@") ? profile.full_name : ""}
              placeholder="Denice Robertson"
              required
            />
          </Field>
          <Field label="Email">
            <input value={profile?.email ?? user.email ?? ""} disabled />
          </Field>
          <Button type="submit">Save Full Name</Button>
        </form>
        <SetPasswordForm />
      </main>
    </>
  );
}
