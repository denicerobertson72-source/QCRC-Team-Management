import { TopNav } from "@/components/TopNav";
import { PageTitle } from "@/components/ui/PageTitle";
import { ensureProfile } from "@/lib/auth";
import { SetPasswordForm } from "@/components/account/SetPasswordForm";

type SearchParams = Promise<{ reset?: string }>;

export default async function AccountSecurityPage({ searchParams }: { searchParams: SearchParams }) {
  await ensureProfile();
  const params = await searchParams;
  const subtitle = params.reset
    ? "Your reset link is active. Save a new password now."
    : "Set a password so you can sign in directly without waiting for magic links.";

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Account Security" subtitle={subtitle} />
        <SetPasswordForm />
      </main>
    </>
  );
}
