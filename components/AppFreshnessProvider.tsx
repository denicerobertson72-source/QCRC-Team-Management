"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { isStaleDeploymentError } from "@/lib/stale-deployment";

type FreshnessContextValue = {
  ensureFresh: () => Promise<boolean>;
  setLineupDirty: (dirty: boolean) => void;
  staleDataNotice: boolean;
  refreshOperationalData: () => void;
  reportActionError: (error: unknown) => boolean;
  notifyServiceWorkerUpdate: () => void;
};

const FreshnessContext = createContext<FreshnessContextValue | null>(null);
const RESUME_REFRESH_MS = 5 * 60 * 1000;

export function useAppFreshness() {
  const value = useContext(FreshnessContext);
  if (!value) throw new Error("useAppFreshness must be used within AppFreshnessProvider");
  return value;
}

export function AppFreshnessProvider({ clientBuild, children }: { clientBuild: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const dirtyRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);
  const checkInFlightRef = useRef<Promise<boolean> | null>(null);
  const [staleReason, setStaleReason] = useState<"deployment" | "action" | "worker" | null>(null);
  const [staleDataNotice, setStaleDataNotice] = useState(false);
  const isOperationalLineup = pathname.startsWith("/admin/lineups/session/");

  const ensureFresh = useCallback(async () => {
    if (staleReason) return false;
    if (checkInFlightRef.current) return checkInFlightRef.current;
    checkInFlightRef.current = fetch("/api/app-version", { cache: "no-store", headers: { "Cache-Control": "no-cache" } })
      .then(async (response) => {
        if (!response.ok) return true;
        const result = (await response.json()) as { version?: string };
        if (result.version && result.version !== clientBuild) {
          console.info("[qcrc-version] stale client detected", { clientBuild, serverBuild: result.version, route: window.location.pathname });
          setStaleReason("deployment");
          return false;
        }
        return true;
      })
      .catch(() => true)
      .finally(() => { checkInFlightRef.current = null; });
    return checkInFlightRef.current;
  }, [clientBuild, staleReason]);

  const refreshOperationalData = useCallback(() => {
    setStaleDataNotice(false);
    router.refresh();
  }, [router]);

  const setLineupDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    if (!dirty) setStaleDataNotice(false);
  }, []);

  useEffect(() => {
    void ensureFresh();
    const onFocus = () => { void ensureFresh(); };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      void ensureFresh().then((fresh) => {
        if (!fresh || !isOperationalLineup || hiddenFor < RESUME_REFRESH_MS) return;
        if (dirtyRef.current) setStaleDataNotice(true);
        else refreshOperationalData();
      });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ensureFresh, isOperationalLineup, refreshOperationalData]);

  const value = useMemo<FreshnessContextValue>(() => ({
    ensureFresh,
    setLineupDirty,
    staleDataNotice,
    refreshOperationalData,
    reportActionError: (error) => {
      if (!isStaleDeploymentError(error)) return false;
      setStaleReason("action");
      return true;
    },
    notifyServiceWorkerUpdate: () => setStaleReason("worker"),
  }), [ensureFresh, refreshOperationalData, setLineupDirty, staleDataNotice]);

  const reload = () => {
    void navigator.serviceWorker?.getRegistration().then((registration) => registration?.waiting?.postMessage({ type: "SKIP_WAITING" })).finally(() => {
      window.location.assign(window.location.href);
    });
  };
  const updateCopy = staleReason === "action"
    ? "QCRC was updated while this page was open. Reload QCRC to continue."
    : "A newer version of QCRC is available. Reload before continuing so your page uses the current version.";

  return (
    <FreshnessContext.Provider value={value}>
      {children}
      {staleReason ? (
        <div className="app-update-backdrop">
          <div className="card stack app-update-dialog" role="dialog" aria-modal="true" aria-labelledby="app-update-title" tabIndex={-1} ref={(node) => node?.focus()}>
            <h2 id="app-update-title">QCRC has been updated</h2>
            <p>{updateCopy}</p>
            {dirtyRef.current ? <p className="error">You have unsaved lineup changes. Reloading will discard them.</p> : null}
            <div className="row"><Button type="button" onClick={reload}>Reload QCRC</Button></div>
          </div>
        </div>
      ) : null}
    </FreshnessContext.Provider>
  );
}
