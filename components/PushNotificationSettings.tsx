"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

function supportsPush() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function needsIosHomeScreenInstall() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !standalone;
}

function vapidKeyToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function PushNotificationSettings() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  useEffect(() => {
    if (!supportsPush()) return;
    setSupported(true);
    setPermission(Notification.permission);
    if (needsIosHomeScreenInstall()) {
      setIosNeedsInstall(true);
      return;
    }
    void navigator.serviceWorker.register("/sw.js").then((registration) => registration.pushManager.getSubscription()).then((subscription) => setEnabled(Boolean(subscription))).catch(() => undefined);
  }, []);

  async function enable() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey || !supportsPush()) {
      setMessage("Push notifications are not configured for this app yet.");
      return;
    }
    if (Notification.permission === "denied") {
      setPermission("denied");
      setMessage("Notifications are blocked for QCRC. Enable them in your browser or device settings, then return here.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPermission(permission);
        setMessage("Notification permission was not granted. You can change it in your browser or device settings.");
        return;
      }
      setPermission("granted");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(publicKey) });
      const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
      if (!response.ok) throw new Error("Could not save your push subscription.");
      setEnabled(true);
      setMessage("Push notifications are enabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!response.ok) throw new Error("Could not remove your push subscription.");
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage("Push notifications are disabled on this device.");
    } catch {
      setMessage("Could not disable push notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return <p className="muted">Push notifications are not supported in this browser.</p>;
  if (iosNeedsInstall) {
    return <p className="muted">To receive phone notifications on iPhone or iPad, add QCRC to your Home Screen from Safari’s Share menu. Then open the installed app and enable notifications.</p>;
  }
  if (permission === "denied") {
    return <p className="muted">Notifications are blocked for QCRC. Enable them in your browser or device settings to receive club alerts.</p>;
  }
  return (
    <div className="notification-actions">
      <Button type="button" variant="secondary" disabled={busy} onClick={enabled ? disable : enable}>
        {busy ? "Saving…" : enabled ? "Disable Push Notifications" : "Enable Push Notifications"}
      </Button>
      {message ? <span className="muted" role="status">{message}</span> : null}
    </div>
  );
}
