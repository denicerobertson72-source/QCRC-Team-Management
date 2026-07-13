"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GlobalOverdueAlert } from "@/components/ui/GlobalOverdueAlert";
import { GlobalReservationAlert } from "@/components/ui/GlobalReservationAlert";

type NavStatus = {
  reservation_alert_count: number;
  first_reservation_boat_name: string | null;
  overdue_count: number;
  first_overdue_boat_name: string | null;
  unread_notification_count: number;
};

export function NavStatusClient() {
  const [status, setStatus] = useState<NavStatus | null>(null);
  const [badgeTarget, setBadgeTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      const response = await fetch("/api/nav/status", { cache: "no-store" });
      if (!response.ok) return;
      const nextStatus = (await response.json()) as NavStatus;
      if (!cancelled) {
        setStatus(nextStatus);
      }
    }

    setBadgeTarget(document.getElementById("topnav-notification-badge"));
    void loadStatus();

    const intervalId = window.setInterval(loadStatus, 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const unreadBadgeLabel =
    status && status.unread_notification_count > 0
      ? status.unread_notification_count > 99
        ? "99+"
        : String(status.unread_notification_count)
      : null;

  return (
    <>
      {status ? (
        <>
          <GlobalReservationAlert
            count={status.reservation_alert_count}
            firstBoatName={status.first_reservation_boat_name}
          />
          <GlobalOverdueAlert count={status.overdue_count} firstBoatName={status.first_overdue_boat_name} />
        </>
      ) : null}
      {badgeTarget && unreadBadgeLabel
        ? createPortal(<span className="topnav-badge">{unreadBadgeLabel}</span>, badgeTarget)
        : null}
    </>
  );
}
