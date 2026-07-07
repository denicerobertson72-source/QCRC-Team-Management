"use client";

import { useEffect } from "react";

export function GlobalOverdueAlert({
  count,
  firstBoatName,
}: {
  count: number;
  firstBoatName: string | null;
}) {
  useEffect(() => {
    const key = `qcrc-overdue-alert:${count}:${firstBoatName ?? ""}`;
    if (count > 0 && window.sessionStorage.getItem(key) !== "1") {
      window.sessionStorage.setItem(key, "1");
      window.alert(
        count === 1
          ? `Overdue boat alert: ${firstBoatName ?? "A boat"} is overdue.`
          : `Overdue boat alert: ${count} boats are overdue.`,
      );
    }
  }, [count, firstBoatName]);

  if (count === 0) return null;

  return (
    <div className="global-alert" role="alert">
      <strong>Overdue Boat Alert</strong>
      <span>
        {count === 1 ? `${firstBoatName ?? "A boat"} is overdue.` : `${count} boats are overdue.`}
      </span>
    </div>
  );
}
