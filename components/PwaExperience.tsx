"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_DISMISSED_KEY = "qcrc-pwa-install-dismissed";
const IOS_DISMISSED_KEY = "qcrc-pwa-ios-dismissed";
const UPDATE_DISMISSED_KEY = "qcrc-pwa-update-dismissed";

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(userAgent);
  const isSafari = /safari/i.test(userAgent) && !/crios|fxios|edgios/i.test(userAgent);
  return isIos && isSafari;
}

export function PwaExperience() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const installDismissed = window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "true";
    const iosDismissed = window.localStorage.getItem(IOS_DISMISSED_KEY) === "true";

    if (!isStandaloneMode() && isIosSafari() && !iosDismissed) {
      setShowIosHint(true);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (installDismissed || isStandaloneMode()) {
        return;
      }
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShowInstallPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    let cancelled = false;
    let handleVisibilityChange: (() => void) | null = null;

    const handleControllerChange = () => {
      if (cancelled) return;
      setIsRefreshing(true);
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (cancelled) return;
      void registration.update().catch(() => undefined);

      const updateDismissed = window.sessionStorage.getItem(UPDATE_DISMISSED_KEY) === "true";
      const maybePromptForUpdate = (worker: ServiceWorker | null) => {
        if (!worker) {
          return;
        }
        if (updateDismissed) {
          return;
        }
        setWaitingWorker(worker);
        setShowUpdatePrompt(true);
      };

      maybePromptForUpdate(registration.waiting);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            maybePromptForUpdate(registration.waiting);
          }
        });
      });

      handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          void registration.update().catch(() => undefined);
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);
    });

    return () => {
      cancelled = true;
      if (handleVisibilityChange) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  async function handleInstallClick() {
    if (!installEvent) return;

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      window.localStorage.removeItem(INSTALL_DISMISSED_KEY);
      setShowInstallPrompt(false);
      setInstallEvent(null);
      return;
    }

    window.localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
    setShowInstallPrompt(false);
  }

  function dismissInstallPrompt() {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
    setShowInstallPrompt(false);
  }

  function dismissIosHint() {
    window.localStorage.setItem(IOS_DISMISSED_KEY, "true");
    setShowIosHint(false);
  }

  function dismissUpdatePrompt() {
    window.sessionStorage.setItem(UPDATE_DISMISSED_KEY, "true");
    setShowUpdatePrompt(false);
  }

  function applyUpdate() {
    if (!waitingWorker) return;
    window.sessionStorage.removeItem(UPDATE_DISMISSED_KEY);
    setShowUpdatePrompt(false);
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  if (isRefreshing) {
    return (
      <div className="pwa-banner pwa-banner-update" role="status" aria-live="polite">
        <div className="pwa-banner-copy">
          <strong>Updating QCRC Team Management</strong>
          <span>Refreshing to load the newest app version.</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {showUpdatePrompt ? (
        <div className="pwa-banner pwa-banner-update" role="status" aria-live="polite">
          <div className="pwa-banner-copy">
            <strong>App update ready</strong>
            <span>A newer version of QCRC Team Management is available.</span>
          </div>
          <div className="pwa-banner-actions">
            <Button type="button" onClick={applyUpdate}>
              Update app
            </Button>
            <Button type="button" variant="secondary" onClick={dismissUpdatePrompt}>
              Later
            </Button>
          </div>
        </div>
      ) : null}

      {!showUpdatePrompt && showInstallPrompt ? (
        <div className="pwa-banner" role="status" aria-live="polite">
          <div className="pwa-banner-copy">
            <strong>Install this app</strong>
            <span>Add QCRC Team Management to your home screen for a faster, app-like launch.</span>
          </div>
          <div className="pwa-banner-actions">
            <Button type="button" onClick={handleInstallClick}>
              Install
            </Button>
            <Button type="button" variant="secondary" onClick={dismissInstallPrompt}>
              Not now
            </Button>
          </div>
        </div>
      ) : null}

      {!showUpdatePrompt && !showInstallPrompt && showIosHint ? (
        <div className="pwa-banner" role="status" aria-live="polite">
          <div className="pwa-banner-copy">
            <strong>Install on iPhone</strong>
            <span>Open Safari share options, then choose Add to Home Screen for the best mobile experience.</span>
          </div>
          <div className="pwa-banner-actions">
            <Button type="button" variant="secondary" onClick={dismissIosHint}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
