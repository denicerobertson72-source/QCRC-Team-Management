"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function MobileFeatureSetup() {
  const [show, setShow] = useState(false);
  const [locationState, setLocationState] = useState<"idle" | "working" | "granted" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setShow(isIos());
  }, []);

  if (!show) return null;

  async function enableLocation() {
    if (!navigator.geolocation) {
      setLocationState("error");
      setMessage("This browser does not provide location services. Use Safari or the installed QCRC app.");
      return;
    }
    setLocationState("working");
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationState("granted");
        setMessage("Location access is enabled for QCRC. You can now launch with live tracking.");
      },
      (error) => {
        setLocationState("error");
        setMessage(error.code === error.PERMISSION_DENIED ? "Location access was denied. Enable Location for QCRC in iPhone Settings, then try again." : "Location could not be confirmed. Turn on Location Services and try again.");
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
    );
  }

  return (
    <CardLike>
      <div className="page-title">
        <h3>iPhone Setup</h3>
        <span className="muted">Enable location tracking and notifications for QCRC.</span>
      </div>
      {!isStandalone() ? (
        <p className="muted">In Safari, tap Share → Add to Home Screen, then open QCRC from its new home-screen icon. iPhone lists notification permissions only for the installed app.</p>
      ) : (
        <p className="muted">Use the buttons below once. If access was previously denied, open iPhone Settings → QCRC to allow Location and Notifications.</p>
      )}
      <div className="row">
        <Button type="button" variant="secondary" disabled={locationState === "working"} onClick={enableLocation}>
          {locationState === "working" ? "Requesting Location…" : locationState === "granted" ? "Location Enabled" : "Enable Location"}
        </Button>
        <Link href="/notifications" className="cta-link">Enable Notifications</Link>
      </div>
      {message ? <p className={locationState === "error" ? "error" : "success"} role="status">{message}</p> : null}
    </CardLike>
  );
}

function CardLike({ children }: { children: ReactNode }) {
  return <section className="card stack">{children}</section>;
}
