"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TrackableOuting } from "@/lib/types";
import { INTENT_STORAGE_KEY, TRACKING_STORAGE_KEY, parseOutingKey } from "@/lib/live-tracking";

export function ReservationTrackingManager({
  outings,
  currentUserId,
}: {
  outings: TrackableOuting[];
  currentUserId: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"success" | "error" | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const activeOutingRef = useRef<TrackableOuting | null>(null);
  const lastUploadAtRef = useRef<number>(0);

  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }

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
          setMessage("Live location sharing is active for your current outing.");
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

  if (!message || !status) return null;
  return <p className={status}>{message}</p>;
}
