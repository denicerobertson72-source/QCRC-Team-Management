"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { recordPasswordSetAction } from "@/lib/actions";

export function PasswordSetupPrompt({ needsPassword, email }: { needsPassword: boolean; email: string | null | undefined }) {
  const router = useRouter();
  const [confirmingExistingPassword, setConfirmingExistingPassword] = useState(false);

  useEffect(() => {
    if (!needsPassword || !email) return;
    const key = `qcrc-password-login:${email.toLowerCase()}`;
    if (window.localStorage.getItem(key) !== "1") return;

    setConfirmingExistingPassword(true);
    void recordPasswordSetAction()
      .then(() => router.refresh())
      .finally(() => setConfirmingExistingPassword(false));
  }, [email, needsPassword, router]);

  if (!needsPassword) return null;

  if (confirmingExistingPassword) {
    return (
      <Card className="stack">
        <h3>Confirming Your Password Setup</h3>
        <p className="muted">Updating your account now.</p>
      </Card>
    );
  }

  return (
    <Card className="stack">
      <div className="page-title">
        <h3>Set Your QCRC Password</h3>
        <span className="muted">A password has not been recorded for this account yet.</span>
      </div>
      <p>Set one now so you can sign in directly without waiting for an email link.</p>
      <Link href="/account/security" className="cta-link">Set Password</Link>
    </Card>
  );
}
