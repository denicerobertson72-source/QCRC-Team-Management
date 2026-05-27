"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function SetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (user?.email) {
      window.localStorage.setItem(`qcrc-password-login:${user.email.toLowerCase()}`, "1");
    }

    setMessage("Password saved. You can now use Sign In with Password.");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <form onSubmit={onSubmit} className="card form-grid">
      <h2>Set Password</h2>
      <p className="muted">After saving, you can sign in directly with email + password.</p>
      <Field label="New password">
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Field label="Confirm password">
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
      </Field>
      <Button type="submit">Save Password</Button>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}
