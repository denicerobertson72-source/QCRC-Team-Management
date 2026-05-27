"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function LoginForm({ initialError = null }: { initialError?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [preferPassword, setPreferPassword] = useState(false);

  const storageKey = useMemo(() => {
    if (!email) return "";
    return `qcrc-password-login:${email.trim().toLowerCase()}`;
  }, [email]);

  useEffect(() => {
    if (!storageKey) {
      setPreferPassword(false);
      return;
    }
    const stored = window.localStorage.getItem(storageKey);
    setPreferPassword(stored === "1");
  }, [storageKey]);

  async function sendMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/reservations`,
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      setMessage("Magic link sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected login error");
    }
  }

  async function createPasswordAccount() {
    setMessage(null);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/reservations`,
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (storageKey) window.localStorage.setItem(storageKey, "1");
      setPreferPassword(true);
      setMessage(
        "If this is a new account, confirm email once. If you already had an account, sign in via magic link once and set password under Security.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected sign-up error");
    }
  }

  async function signInWithPassword() {
    setMessage(null);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      if (storageKey) window.localStorage.setItem(storageKey, "1");
      router.replace("/reservations");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected password sign-in error");
    }
  }

  async function sendResetPassword() {
    setMessage(null);
    setError(null);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/account/security?reset=1`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setMessage("Password reset email sent. Open the link in the same browser, then choose a new password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected password reset error");
    }
  }

  return (
    <div className="card form-grid">
      <h1>QCRC Login</h1>
      <p className="muted">Use your club email to get a one-time sign-in link.</p>
      <Field label="Email">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@club.org"
        />
      </Field>
      <Field label="Password (optional)">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Use password login after setup"
        />
      </Field>
      <div className="row">
        <Button type="button" variant="secondary" onClick={signInWithPassword} disabled={!email || !password}>
          Sign In with Password
        </Button>
        <Button type="button" variant="secondary" onClick={createPasswordAccount} disabled={!email || !password}>
          Create Password Login
        </Button>
      </div>
      <Button type="button" variant="secondary" onClick={sendResetPassword} disabled={!email}>
        Forgot / Reset Password
      </Button>
      {!preferPassword ? (
        <form onSubmit={sendMagicLink}>
          <Button type="submit">Send Magic Link</Button>
        </form>
      ) : (
        <div className="card-subtle">
          <p className="muted">Password login enabled for this email on this device.</p>
          <form onSubmit={sendMagicLink}>
            <Button type="submit" variant="secondary">
              Use Magic Link Instead
            </Button>
          </form>
        </div>
      )}
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
