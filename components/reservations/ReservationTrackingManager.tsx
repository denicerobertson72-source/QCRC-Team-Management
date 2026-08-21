"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TrackableOuting } from "@/lib/types";
import { INTENT_STORAGE_KEY, TRACKING_STORAGE_KEY, parseOutingKey } from "@/lib/live-tracking";

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

function formatTrackingTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function ReservationTrackingManager({
  outings,
  currentUserId,
}: {
  outings: TrackableOuting[];
  currentUserId: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"success" | "error" | null>(null);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [trackingActive, setTrackingActive] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const activeOutingRef = useRef<TrackableOuting | null>(null);
  const lastUploadAtRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }

  useEffect(() => {
    setIsPageVisible(document.visibilityState === "visible");

    function handleVisibilityChange() {
      setIsPageVisible(document.visibilityState === "visible");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const intendedOutingKey = window.localStorage.getItem(INTENT_STORAGE_KEY);
    const intendedOuting = parseOutingKey(intendedOutingKey);
    if (intendedOuting && outings.some((outing) => outing.id === intendedOuting.id && outing.kind === intendedOuting.kind && outing.status === "checked_out")) {
      window.localStorage.setItem(TRACKING_STORAGE_KEY, intendedOutingKey!);
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
      setStatus("success");
      setMessage("Live location tracking is ready for this outing.");
    }

    const activeOutingKey = window.localStorage.getItem(TRACKING_STORAGE_KEY);
    const parsedActiveOuting = parseOutingKey(activeOutingKey);
    const activeOuting =
      parsedActiveOuting
        ? outings.find((outing) => outing.id === parsedActiveOuting.id && outing.kind === parsedActiveOuting.kind && outing.status === "checked_out") ?? null
        : null;

    if (!activeOuting) {
      setTrackingActive(false);
      activeOutingRef.current = null;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (activeOutingKey) {
        window.localStorage.removeItem(TRACKING_STORAGE_KEY);
      }
      return;
    }

    activeOutingRef.current = activeOuting;
    setTrackingActive(true);
    if (!navigator.geolocation || watchIdRef.current !== null) {
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const outing = activeOutingRef.current;
        if (!outing) return;

        const now = Date.now();
        if (now - lastUploadAtRef.current < 30000) return;
        lastUploadAtRef.current = now;

        const recordedAt = new Date(position.timestamp).toISOString();
        const pointFields = {
          member_id: currentUserId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: position.coords.accuracy ?? null,
          recorded_at: recordedAt,
        };

        const { error } =
          outing.kind === "reservation"
            ? await supabaseRef.current!.from("rowing_location_points").insert({
                ...pointFields,
                reservation_id: outing.id,
              })
            : await supabaseRef.current!.from("rowing_location_points").insert({
                ...pointFields,
                private_outing_id: outing.id,
              });

        if (error) {
          setStatus("error");
          setMessage(`Live tracking upload failed: ${error.message}`);
        } else {
          setStatus("success");
          setMessage(`Live location sharing active. Last upload: ${formatTrackingTime(recordedAt)} ET.`);
        }
      },
      (error) => {
        setStatus("error");
        setMessage(error.message || "Location sharing was denied or interrupted.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 20000,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [currentUserId, outings]);

  useEffect(() => {
    if (!trackingActive) {
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
      setWakeLockActive(false);
      return;
    }

    let cancelled = false;
    const requestWakeLock = async () => {
      const wakeLock = (navigator as WakeLockNavigator).wakeLock;
      if (!wakeLock || document.visibilityState !== "visible" || wakeLockRef.current) return;
      try {
        const sentinel = await wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener("release", () => {
          wakeLockRef.current = null;
          setWakeLockActive(false);
        });
      } catch {
        setWakeLockActive(false);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      if (sentinel) void sentinel.release();
    };
  }, [trackingActive]);

  if (!message || !status) return null;
  return (
    <div className="stack" style={{ gap: "0.35rem" }}>
      <p className={status}>{message}</p>
      {!isPageVisible ? (
        <p className="error">
          Live tracking may pause while QCRC is in the background. Keep this app open and the screen awake while rowing.
        </p>
      ) : (
        <p className="muted">For the live map to keep moving, keep QCRC open and the phone awake while you are on the water.</p>
      )}
      {wakeLockActive ? <p className="success">Screen stay-awake mode is active while live tracking runs.</p> : null}
    </div>
  );
}
