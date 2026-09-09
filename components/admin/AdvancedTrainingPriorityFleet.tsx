"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type FleetBoat = {
  id: string;
  name: string;
  boat_class_id: string;
  status: string;
  required_skill_level: string | null;
};

type ActionResult = { ok: boolean; message: string };

function boatDetails(boat: FleetBoat) {
  const details = [boat.boat_class_id, boat.required_skill_level ? `${boat.required_skill_level} clearance` : null];
  if (boat.status !== "available") details.push(boat.status === "maintenance" ? "Maintenance" : boat.status);
  return details.filter(Boolean).join(" · ");
}

export function AdvancedTrainingPriorityFleet({
  priorityBoats,
  availableBoats,
  addBoatAction,
  removeBoatAction,
}: {
  priorityBoats: FleetBoat[];
  availableBoats: FleetBoat[];
  addBoatAction: (boatId: string) => Promise<ActionResult>;
  removeBoatAction: (boatId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(action: (boatId: string) => Promise<ActionResult>, boatId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action(boatId);
      setMessage(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card className="stack">
      <div className="page-title">
        <h2>Advanced Training Priority Fleet</h2>
        <p className="muted">Priority boats are held for the full duration of every Advanced Training session.</p>
      </div>

      {message ? (
        <p className={message.ok ? "success" : "error"} role={message.ok ? "status" : "alert"}>
          {message.message}
        </p>
      ) : null}

      <div className="stack">
        <h3>Priority Fleet</h3>
        {priorityBoats.length === 0 ? <p className="muted">No priority boats configured yet.</p> : null}
        {priorityBoats.map((boat) => (
          <div key={boat.id} className="row">
            <div>
              <strong>{boat.name}</strong>
              <div className="muted">{boatDetails(boat)}</div>
            </div>
            <Button type="button" variant="secondary" disabled={isPending} onClick={() => runAction(removeBoatAction, boat.id)}>
              Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="stack">
        <h3>Available Fleet Boats</h3>
        {availableBoats.length === 0 ? <p className="muted">Every eligible fleet boat is already in the priority fleet.</p> : null}
        {availableBoats.map((boat) => (
          <div key={boat.id} className="row">
            <div>
              <strong>{boat.name}</strong>
              <div className="muted">{boatDetails(boat)}</div>
            </div>
            <Button type="button" disabled={isPending} onClick={() => runAction(addBoatAction, boat.id)}>
              Add
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
