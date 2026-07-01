"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SetPasswordForm } from "@/components/account/SetPasswordForm";

export function LoginForm({
  initialError = null,
  initialMessage = null,
  nextPath = "/",
}: {
  initialError?: string | null;
  initialMessage?: string | null;
  nextPath?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [error, setError] = useState<string | null>(initialError);
  const [preferPassword, setPreferPassword] = useState(false);
  const [isSendingEmailLink, setIsSendingEmailLink] = useState(false);
  const [isSendingRecoveryLink, setIsSendingRecoveryLink] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [isPreparingRecovery, setIsPreparingRecovery] = useState(false);

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

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash.includes("access_token=")) {
      return;
    }

    const supabase = createClient();
    let cancelled = false;
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const recoveryMode = hashParams.get("type") === "recovery";

    if (recoveryMode) {
      setIsRecoveryMode(true);
      setIsPreparingRecovery(true);
      setError(null);
      setMessage("Preparing your secure reset session...");
    }

    async function finishHashLogin() {
      if (!accessToken || !refreshToken) {
        if (!cancelled) {
          setError("This email link is missing required sign-in information.");
          setIsPreparingRecovery(false);
        }
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        if (!cancelled) {
          setError(sessionError.message);
          setIsPreparingRecovery(false);
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || cancelled) {
        if (!cancelled) {
          setError("We could not establish your sign-in session from that email link. Please request a new one.");
          setIsPreparingRecovery(false);
        }
        return;
      }

      if (recoveryMode) {
        setMessage("Your reset link is active. Save a new password below.");
        setIsPreparingRecovery(false);
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        return;
      }

      setError(null);
      setMessage(null);
      router.replace(nextPath || "/");
      router.refresh();
    }

    void finishHashLogin();

    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

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
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected password sign-in error");
    }
  }

  async function sendPublicEmailLink(mode: "magiclink" | "recovery") {
    setMessage(null);
    setError(null);

    if (!email) {
      setError("Email is required.");
      return;
    }

    if (mode === "magiclink") {
      setIsSendingEmailLink(true);
    } else {
      setIsSendingRecoveryLink(true);
    }

    try {
      const response = await fetch("/api/auth/email-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, mode }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        setError(payload.error || "Unable to send email link.");
        return;
      }

      setMessage(payload.message || "Email sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected email delivery error");
    } finally {
      setIsSendingEmailLink(false);
      setIsSendingRecoveryLink(false);
    }
  }

  if (isRecoveryMode) {
    return (
      <div className="stack">
        {message ? <p className="success">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {isPreparingRecovery ? (
          <div className="card form-grid">
            <h2>Choose a New Password</h2>
            <p className="muted">Preparing your secure reset session. This should only take a moment.</p>
          </div>
        ) : (
          <SetPasswordForm
            title="Choose a New Password"
            description="Your reset link is active. Save a new password to finish signing in."
            successMessage="Password saved. Redirecting you into the app."
            redirectPath="/"
          />
        )}
      </div>
    );
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
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={() => void sendPublicEmailLink("recovery")}
        disabled={!email || isSendingRecoveryLink}
      >
        Forgot / Reset Password
      </Button>
      {!preferPassword ? (
        <Button type="button" onClick={() => void sendPublicEmailLink("magiclink")} disabled={!email || isSendingEmailLink}>
          {isSendingEmailLink ? "Sending..." : "Send Magic Link"}
        </Button>
      ) : (
        <div className="card-subtle">
          <p className="muted">Password login enabled for this email on this device.</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void sendPublicEmailLink("magiclink")}
            disabled={!email || isSendingEmailLink}
          >
            {isSendingEmailLink ? "Sending..." : "Use Magic Link Instead"}
          </Button>
        </div>
      )}
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
