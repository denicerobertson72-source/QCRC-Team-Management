"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Reservation } from "@/lib/types";

const TRACKING_STORAGE_KEY = "rowing-live-sharing-reservation-id";
const INTENT_STORAGE_KEY = "rowing-live-sharing-intent-reservation-id";

export function ReservationTrackingManager({
  reservations,
  currentUserId,
}: {
  reservations: Pick<Reservation, "id" | "status">[];
  currentUserId: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"success" | "error" | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const activeReservationIdRef = useRef<string | null>(null);
  const lastUploadAtRef = useRef<number>(0);

  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }

  useEffect(() => {
    const intendedReservationId = window.localStorage.getItem(INTENT_STORAGE_KEY);
    if (intendedReservationId && reservations.some((reservation) => reservation.id === intendedReservationId && reservation.status === "checked_out")) {
      window.localStorage.setItem(TRACKING_STORAGE_KEY, intendedReservationId);
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
      setStatus("success");
      setMessage("Live location tracking is ready for this outing.");
    }

    const activeReservationId = window.localStorage.getItem(TRACKING_STORAGE_KEY);
    const activeReservation = reservations.find((reservation) => reservation.id === activeReservationId && reservation.status === "checked_out");

    if (!activeReservation) {
      activeReservationIdRef.current = null;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (activeReservationId) {
        window.localStorage.removeItem(TRACKING_STORAGE_KEY);
      }
      return;
    }

    activeReservationIdRef.current = activeReservation.id;
    if (!navigator.geolocation || watchIdRef.current !== null) {
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const reservationId = activeReservationIdRef.current;
        if (!reservationId) return;

        const now = Date.now();
        if (now - lastUploadAtRef.current < 30000) return;
        lastUploadAtRef.current = now;

        const { error } = await supabaseRef.current!.from("rowing_location_points").insert({
          reservation_id: reservationId,
          member_id: currentUserId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: position.coords.accuracy ?? null,
          recorded_at: new Date(position.timestamp).toISOString(),
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
  }, [currentUserId, reservations]);

  if (!message || !status) return null;
  return <p className={status}>{message}</p>;
}
