"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { isStaleDeploymentError } from "@/lib/stale-deployment";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const staleDeployment = isStaleDeploymentError(error);

  useEffect(() => {
    console.error("QCRC page error", { message: error.message, digest: error.digest });
  }, [error]);

  if (staleDeployment) {
    return (
      <main className="page-shell">
        <section className="card stack" role="alert">
          <h1>QCRC was updated while this page was open</h1>
          <p>Reload QCRC to continue with the current version.</p>
          <div className="row"><Button type="button" onClick={() => window.location.assign(window.location.href)}>Reload QCRC</Button></div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="card stack" role="alert">
        <h1>Something went wrong</h1>
        <p>Please try again. If the issue continues, contact a club administrator.</p>
        <div className="row"><Button type="button" onClick={reset}>Try again</Button></div>
      </section>
    </main>
  );
}
