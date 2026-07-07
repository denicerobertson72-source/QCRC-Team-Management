"use client";

import { useEffect } from "react";

export function GlobalReservationAlert({
  count,
  firstBoatName,
}: {
  count: number;
  firstBoatName: string | null;
}) {
  useEffect(() => {
    if (count === 0) return;
    const key = `qcrc-reservation-alert:${count}:${firstBoatName ?? ""}`;
    if (window.sessionStorage.getItem(key) === "1") return;
    window.sessionStorage.setItem(key, "1");
    const message =
      count === 1
        ? `Reservation alert: ${firstBoatName ?? "Your boat"} is now out of service. Please reserve another boat.`
        : `Reservation alert: ${count} of your reserved boats are now out of service. Please review My Reservations.`;
    window.alert(message);
  }, [count, firstBoatName]);

  if (count === 0) return null;

  return (
    <div className="global-alert global-alert-warning" role="alert">
      <strong>Reservation Alert</strong>
      <span>
        {count === 1
          ? `${firstBoatName ?? "Your boat"} is now out of service.`
          : `${count} reserved boats are now out of service.`}
      </span>
    </div>
  );
}
