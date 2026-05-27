"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export function InviteMemberForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function inviteMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/reservations`,
      },
    });

    if (error) {
      setStatus(`Invite failed: ${error.message}`);
      return;
    }

    setStatus("Invite sent. Member can complete login from email.");
    setEmail("");
  }

  return (
    <form onSubmit={inviteMember} className="card form-grid">
      <h3>Add Member</h3>
      <p className="muted">Send a magic-link invite to onboard a new member.</p>
      <Field label="Member email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Button type="submit">Send Invite</Button>
      {status ? <p className="muted">{status}</p> : null}
    </form>
  );
}
