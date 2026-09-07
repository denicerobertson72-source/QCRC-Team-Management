"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TrackableOuting } from "@/lib/types";
import {
  distanceBetweenMeters,
  LOCATION_MOVEMENT_THRESHOLD_METERS,
  LOCATION_UPLOAD_RETRY_INTERVAL_MS,
  MAX_LOCATION_UPLOAD_INTERVAL_MS,
  MIN_LOCATION_UPLOAD_INTERVAL_MS,
} from "@/lib/location-tracking";

type PermissionState = "checking" | "granted" | "prompt" | "denied" | "unsupported" | "unknown";
type TrackingState = "idle" | "acquiring" | "active" | "error";
type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (type: "release", listener: () => void) => void };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } };
type UploadReason = "initial" | "maximum interval" | "movement" | "foreground recovery";
type SavedLocation = { latitude: number; longitude: number; uploadedAt: number };

function formatTrackingTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "Location permission is denied for this active outing.";
  if (error.code === error.POSITION_UNAVAILABLE) return "Your location is temporarily unavailable. Check GPS, signal, and Location Services.";
  if (error.code === error.TIMEOUT) return "Location acquisition timed out. Keep QCRC open and try again.";
  return error.message || "Location sharing stopped unexpectedly.";
}

function developmentTrackingLog(message: string, detail?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") console.info(`[QCRC location] ${message}`, detail ?? "");
}

export function ReservationTrackingManager({ outings, currentUserId }: { outings: TrackableOuting[]; currentUserId: string }) {
  const activeOuting = outings.find((outing) => outing.status === "checked_out") ?? null;
  const [permission, setPermission] = useState<PermissionState>("checking");
  const [trackingState, setTrackingState] = useState<TrackingState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [lastPingAt, setLastPingAt] = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const activeOutingRef = useRef<TrackableOuting | null>(activeOuting);
  const lastSavedLocationRef = useRef<SavedLocation | null>(null);
  const uploadInFlightRef = useRef(false);
  const lastUploadFailureAtRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  if (!supabaseRef.current) supabaseRef.current = createClient();

  const stopTracking = useCallback((nextState: TrackingState = "idle") => {
    if (watchIdRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    activeOutingRef.current = null;
    lastSavedLocationRef.current = null;
    uploadInFlightRef.current = false;
    lastUploadFailureAtRef.current = 0;
    setTrackingState(nextState);
    void wakeLockRef.current?.release();
    wakeLockRef.current = null;
    setWakeLockActive(false);
  }, []);

  const checkPermission = useCallback(async (): Promise<PermissionState> => {
    if (!navigator.geolocation) {
      setPermission("unsupported");
      return "unsupported";
    }
    if (!navigator.permissions?.query) {
      // iOS Safari does not reliably expose the Permissions API. A launch has
      // already requested a point, so the watcher reports the real result.
      setPermission("unknown");
      return "unknown";
    }
    try {
      const result = await navigator.permissions.query({ name: "geolocation" });
      const next = result.state as PermissionState;
      setPermission(next);
      return next;
    } catch {
      setPermission("unknown");
      return "unknown";
    }
  }, []);

  const savePosition = useCallback(async (position: GeolocationPosition, outing: TrackableOuting, force = false) => {
    if (activeOutingRef.current?.id !== outing.id || watchIdRef.current === null) return;
    const now = Date.now();
    const lastSavedLocation = lastSavedLocationRef.current;
    const elapsedSinceUpload = lastSavedLocation ? now - lastSavedLocation.uploadedAt : null;
    const movedMeters = lastSavedLocation
      ? distanceBetweenMeters(lastSavedLocation, position.coords)
      : null;
    let uploadReason: UploadReason | null = force
      ? "foreground recovery"
      : !lastSavedLocation
        ? "initial"
        : elapsedSinceUpload! >= MAX_LOCATION_UPLOAD_INTERVAL_MS
          ? "maximum interval"
          : movedMeters! >= LOCATION_MOVEMENT_THRESHOLD_METERS && elapsedSinceUpload! >= MIN_LOCATION_UPLOAD_INTERVAL_MS
            ? "movement"
            : null;

    developmentTrackingLog("Raw GPS fix received", {
      outingId: outing.id,
      accuracyMeters: position.coords.accuracy,
      elapsedSinceUpload,
      movedMeters,
    });
    if (!uploadReason) {
      developmentTrackingLog("GPS point skipped because of throttling", { outingId: outing.id, elapsedSinceUpload, movedMeters });
      return;
    }
    if (uploadInFlightRef.current) {
      developmentTrackingLog("GPS point skipped while another upload is in flight", { outingId: outing.id, uploadReason });
      return;
    }
    if (!force && now - lastUploadFailureAtRef.current < LOCATION_UPLOAD_RETRY_INTERVAL_MS) {
      developmentTrackingLog("GPS point skipped during upload retry backoff", { outingId: outing.id, uploadReason });
      return;
    }

    uploadInFlightRef.current = true;
    const recordedAt = new Date(position.timestamp).toISOString();
    const { error } = await supabaseRef.current!.from("rowing_location_points").insert({
      member_id: currentUserId,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy_meters: position.coords.accuracy ?? null,
      recorded_at: recordedAt,
      ...(outing.kind === "reservation" ? { reservation_id: outing.id, private_outing_id: null } : { reservation_id: null, private_outing_id: outing.id }),
    });
    if (error) {
      uploadInFlightRef.current = false;
      lastUploadFailureAtRef.current = Date.now();
      developmentTrackingLog("Supabase location write failed", { outingId: outing.id, message: error.message });
      setTrackingState("error");
      setMessage(`Live tracking upload failed: ${error.message}`);
      return;
    }
    uploadInFlightRef.current = false;
    if (activeOutingRef.current?.id !== outing.id || watchIdRef.current === null) return;
    lastSavedLocationRef.current = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      uploadedAt: now,
    };
    lastUploadFailureAtRef.current = 0;
    developmentTrackingLog("GPS point uploaded", { outingId: outing.id, uploadReason });
    setPermission("granted");
    setTrackingState("active");
    setLastPingAt(recordedAt);
    setMessage(`Location sharing active. Last update: ${formatTrackingTime(recordedAt)} ET.`);
  }, [currentUserId]);

  const startTracking = useCallback(async (requestPermission = false, restart = false) => {
    if (!activeOuting || !navigator.geolocation) {
      setPermission("unsupported");
      setTrackingState("error");
      setMessage("Location sharing is unavailable on this device.");
      return;
    }
    if (watchIdRef.current !== null && activeOutingRef.current?.id === activeOuting.id && !restart) return;
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;

    if (activeOutingRef.current?.id !== activeOuting.id) {
      lastSavedLocationRef.current = null;
      lastUploadFailureAtRef.current = 0;
    }

    const currentPermission = await checkPermission();
    if (currentPermission === "denied") {
      stopTracking("error");
      setMessage("Location permission is denied for this active outing.");
      return;
    }
    if (currentPermission === "prompt" && !requestPermission) {
      stopTracking();
      setMessage("Location permission is needed to track your active outing.");
      return;
    }

    activeOutingRef.current = activeOuting;
    setTrackingState("acquiring");
    setMessage("Safety tracking is starting. Looking for a GPS update…");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => void savePosition(position, activeOuting),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setPermission("denied");
        stopTracking("error");
        setMessage(geolocationErrorMessage(error));
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    if (restart) {
      navigator.geolocation.getCurrentPosition(
        (position) => void savePosition(position, activeOuting, true),
        (error) => setMessage(`Tracking active, but a fresh location is temporarily unavailable: ${geolocationErrorMessage(error)}`),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    }
  }, [activeOuting, checkPermission, savePosition, stopTracking]);

  useEffect(() => {
    if (!activeOuting) {
      stopTracking();
      setPermission("checking");
      setMessage(null);
      setLastPingAt(null);
      return;
    }
    void startTracking(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void startTracking(false, true);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [activeOuting?.id, activeOuting?.kind, startTracking, stopTracking]);

  useEffect(() => {
    const handleReturn = () => stopTracking();
    window.addEventListener("qcrc:outing-returned", handleReturn);
    return () => window.removeEventListener("qcrc:outing-returned", handleReturn);
  }, [stopTracking]);

  useEffect(() => () => stopTracking(), [stopTracking]);

  useEffect(() => {
    if (trackingState !== "active" && trackingState !== "acquiring") return;
    let cancelled = false;
    const requestWakeLock = async () => {
      const wakeLock = (navigator as WakeLockNavigator).wakeLock;
      if (!wakeLock || document.visibilityState !== "visible" || wakeLockRef.current) return;
      try {
        const sentinel = await wakeLock.request("screen");
        if (cancelled) return void sentinel.release();
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener("release", () => { wakeLockRef.current = null; setWakeLockActive(false); });
      } catch { setWakeLockActive(false); }
    };
    void requestWakeLock();
    document.addEventListener("visibilitychange", requestWakeLock);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", requestWakeLock); };
  }, [trackingState]);

  if (!activeOuting) return null;
  const needsManualStart = trackingState !== "active" && (permission === "prompt" || permission === "unknown" || trackingState === "error");
  const iosHelp = isIos() && (permission === "denied" || trackingState === "error");

  return (
    <div className="card-subtle stack" role="status">
      <strong>{trackingState === "active" ? "Location Sharing Active" : trackingState === "acquiring" ? "Safety Tracking Is Starting" : "Location Sharing Needs Attention"}</strong>
      {message ? <p className={trackingState === "error" ? "error" : "muted"}>{message}</p> : null}
      {lastPingAt ? <p className="success">Most recent successful update: {formatTrackingTime(lastPingAt)} ET.</p> : null}
      {needsManualStart ? <button type="button" onClick={() => void startTracking(true, true)}>Restart Location Sharing</button> : null}
      {iosHelp ? <p className="muted">On iPhone, open Settings → Privacy &amp; Security → Location Services → Safari Websites, choose While Using the App, and turn Precise Location on. Also set Safari’s permission for the QCRC website to Allow or Ask.</p> : null}
      <p className="muted">Keep QCRC open while rowing. iOS may pause web-app location updates in the background.</p>
      {wakeLockActive ? <p className="success">Screen stay-awake mode is active while tracking runs.</p> : null}
    </div>
  );
}
