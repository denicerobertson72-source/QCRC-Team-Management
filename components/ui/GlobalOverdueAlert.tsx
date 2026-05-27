"use client";

import { useEffect } from "react";

export function GlobalOverdueAlert({
  count,
  boatNames,
}: {
  count: number;
  boatNames: string[];
}) {
  useEffect(() => {
    const key = `qcrc-overdue-alert:${count}:${boatNames.join("|")}`;
    if (count > 0 && window.sessionStorage.getItem(key) !== "1") {
      window.sessionStorage.setItem(key, "1");
      window.alert(
        count === 1
          ? `Overdue boat alert: ${boatNames[0]} is overdue.`
          : `Overdue boat alert: ${count} boats are overdue.`,
      );
    }
  }, [boatNames, count]);

  if (count === 0) return null;

  return (
    <div className="global-alert" role="alert">
      <strong>Overdue Boat Alert</strong>
      <span>
        {count === 1 ? `${boatNames[0]} is overdue.` : `${count} boats are overdue.`}
      </span>
    </div>
  );
}
