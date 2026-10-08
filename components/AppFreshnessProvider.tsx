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
  updateApp: () => Promise<void>;
};

const FreshnessContext = createContext<FreshnessContextValue | null>(null);
const RESUME_REFRESH_MS = 5 * 60 * 1000;
const FRESH_CHECK_CACHE_MS = 45 * 1000;

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
  const lastFreshAtRef = useRef(0);
  const updateInProgressRef = useRef(false);
  const hasReloadedForUpdateRef = useRef(false);
  const serverBuildRef = useRef<string | null>(null);
  const updateAppRef = useRef<() => Promise<void>>(async () => undefined);
  const [staleReason, setStaleReason] = useState<"deployment" | "action" | "worker" | null>(null);
  const [staleDataNotice, setStaleDataNotice] = useState(false);
  const isOperationalLineup = pathname.startsWith("/admin/lineups/session/");

  const ensureFresh = useCallback(async (force = false) => {
    if (staleReason) return false;
    if (!force && Date.now() - lastFreshAtRef.current < FRESH_CHECK_CACHE_MS) return true;
    if (checkInFlightRef.current) return checkInFlightRef.current;
    checkInFlightRef.current = fetch("/api/app-version", { cache: "no-store", headers: { "Cache-Control": "no-cache" } })
      .then(async (response) => {
        if (!response.ok) return true;
        const result = (await response.json()) as { version?: string };
        if (result.version && result.version !== clientBuild) {
          console.info("[qcrc-version] stale client detected", { clientBuild, serverBuild: result.version, route: window.location.pathname });
          serverBuildRef.current = result.version;
          if (dirtyRef.current) setStaleReason("deployment");
          else void updateAppRef.current();
          return false;
        }
        lastFreshAtRef.current = Date.now();
        return true;
      })
      .catch(() => {
        lastFreshAtRef.current = Date.now();
        return true;
      })
      .finally(() => { checkInFlightRef.current = null; });
    return checkInFlightRef.current;
  }, [clientBuild, staleReason]);

  const reloadDocument = useCallback(() => {
    if (hasReloadedForUpdateRef.current) return;
    hasReloadedForUpdateRef.current = true;
    window.location.reload();
  }, []);

  const updateApp = useCallback(async () => {
    if (updateInProgressRef.current || hasReloadedForUpdateRef.current) return;
    if (dirtyRef.current) {
      setStaleReason("deployment");
      return;
    }
    updateInProgressRef.current = true;
    try {
      const serverBuild = serverBuildRef.current;
      const attemptKey = serverBuild ? `qcrc-build-update:${serverBuild}` : null;
      const previousAttempt = attemptKey ? window.sessionStorage.getItem(attemptKey) : null;
      if (attemptKey && previousAttempt === "normal") {
        window.sessionStorage.setItem(attemptKey, "recovery");
        const registration = "serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistration().catch(() => undefined)
          : undefined;
        await registration?.unregister().catch(() => false);
        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.filter((name) => name.startsWith("qcrc-")).map((name) => caches.delete(name)));
        }
        const url = new URL(window.location.href);
        url.searchParams.set("qcrc_update", serverBuild!);
        hasReloadedForUpdateRef.current = true;
        window.location.assign(url.toString());
        return;
      }
      if (attemptKey && !previousAttempt) window.sessionStorage.setItem(attemptKey, "normal");
      const registration = "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration().catch(() => undefined)
        : undefined;
      if (registration) {
        await registration.update().catch(() => undefined);
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      }
      // controllerchange below usually wins; this covers browsers with no worker or
      // an already-active replacement worker.
      window.setTimeout(reloadDocument, 1200);
    } finally {
      updateInProgressRef.current = false;
    }
  }, [reloadDocument]);

  useEffect(() => {
    updateAppRef.current = updateApp;
  }, [updateApp]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onControllerChange = () => {
      if (updateInProgressRef.current || serverBuildRef.current) reloadDocument();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, [reloadDocument]);

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
    const onFocus = () => { void ensureFresh(true); };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      void ensureFresh(true).then((fresh) => {
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
    updateApp,
  }), [ensureFresh, refreshOperationalData, setLineupDirty, staleDataNotice, updateApp]);

  const reload = () => { void updateApp(); };
  const updateCopy = staleReason === "action"
    ? "QCRC was updated while this page was open. Save or discard changes, then update the app."
    : "A newer version of QCRC is available. Save or discard changes, then update the app.";

  return (
    <FreshnessContext.Provider value={value}>
      {children}
      {staleReason ? (
        <div className="app-update-backdrop">
          <div className="card stack app-update-dialog" role="dialog" aria-modal="true" aria-labelledby="app-update-title" tabIndex={-1} ref={(node) => node?.focus()}>
            <h2 id="app-update-title">QCRC has been updated</h2>
            <p>{updateCopy}</p>
            <p className="muted">Build: {clientBuild.slice(0, 7)}{serverBuildRef.current ? ` → ${serverBuildRef.current.slice(0, 7)}` : ""}</p>
            {dirtyRef.current ? <p className="error">You have unsaved lineup changes. Reloading will discard them.</p> : null}
            <div className="row"><Button type="button" onClick={reload}>Update QCRC</Button></div>
          </div>
        </div>
      ) : null}
    </FreshnessContext.Provider>
  );
}
