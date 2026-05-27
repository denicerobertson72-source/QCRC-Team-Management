"use client";

import { useEffect } from "react";

export function GlobalReservationAlert({
  alerts,
}: {
  alerts: { boatName: string; startTime: string }[];
}) {
  useEffect(() => {
    if (alerts.length === 0) return;
    const key = `qcrc-reservation-alert:${alerts.map((alert) => `${alert.boatName}:${alert.startTime}`).join("|")}`;
    if (window.sessionStorage.getItem(key) === "1") return;
    window.sessionStorage.setItem(key, "1");
    const first = alerts[0];
    const message =
      alerts.length === 1
        ? `Reservation alert: ${first.boatName} is now out of service. Please reserve another boat.`
        : `Reservation alert: ${alerts.length} of your reserved boats are now out of service. Please review My Reservations.`;
    window.alert(message);
  }, [alerts]);

  if (alerts.length === 0) return null;

  return (
    <div className="global-alert global-alert-warning" role="alert">
      <strong>Reservation Alert</strong>
      <span>
        {alerts.length === 1
          ? `${alerts[0].boatName} is now out of service.`
          : `${alerts.length} reserved boats are now out of service.`}
      </span>
    </div>
  );
}
