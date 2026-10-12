"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { createRegattaBoatHoldAdminAction, releaseRegattaBoatHoldAdminAction } from "@/lib/actions";
import type { Boat } from "@/lib/types";
import type { ActiveRegattaBoatHold } from "@/lib/queries";

export function RegattaBoatHolds({ boats, activeHolds }: { boats: Boat[]; activeHolds: ActiveRegattaBoatHold[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isBlocking, setIsBlocking] = useState(false);
  const [releasingHoldId, setReleasingHoldId] = useState<string | null>(null);
  const heldBoatIds = new Set(activeHolds.flatMap((hold) => hold.boats.map((boat) => boat.id)));
  const operationalBoats = boats.filter((boat) => boat.status === "available" && !heldBoatIds.has(boat.id));

  function toggleBoat(boatId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(boatId);
      else next.delete(boatId);
      return next;
    });
  }

  async function blockSelected() {
    if (isBlocking || selectedIds.size === 0) return;
    setMessage(null);
    setIsBlocking(true);
    try {
      const formData = new FormData();
      formData.set("label", label);
      selectedIds.forEach((boatId) => formData.append("boat_ids", boatId));
      const result = await createRegattaBoatHoldAdminAction(formData);
      if (!result.ok) {
        setMessage(result.message ?? "Unable to block the selected boats.");
        return;
      }
      setSelectedIds(new Set());
      setLabel("");
      setMessage("Regatta boats blocked.");
      router.refresh();
    } finally {
      setIsBlocking(false);
    }
  }

  async function releaseHold(holdId: string) {
    if (releasingHoldId) return;
    setMessage(null);
    setReleasingHoldId(holdId);
    const formData = new FormData();
    formData.set("hold_id", holdId);
    const result = await releaseRegattaBoatHoldAdminAction(formData);
    if (!result.ok) setMessage(result.message ?? "Unable to release this regatta hold.");
    else {
      setMessage("Regatta boats released. Other availability restrictions remain in effect.");
      router.refresh();
    }
    setReleasingHoldId(null);
  }

  return (
    <section className="card stack" aria-labelledby="regatta-boats-title">
      <div>
        <h3 id="regatta-boats-title">Regatta Boats</h3>
        <p className="muted">Regatta holds keep operational boats out of member reservations without changing their maintenance condition.</p>
      </div>
      <Field label="Regatta / reason (optional)">
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Head of the Hooch" disabled={isBlocking} />
      </Field>
      <div className="row">
        <Button type="button" variant="secondary" onClick={() => setSelectedIds(new Set(operationalBoats.map((boat) => boat.id)))} disabled={isBlocking || operationalBoats.length === 0}>Select All</Button>
        <Button type="button" variant="secondary" onClick={() => setSelectedIds(new Set())} disabled={isBlocking || selectedIds.size === 0}>Clear</Button>
      </div>
      <div className="stack">
        {operationalBoats.map((boat) => (
          <label key={boat.id} className="card-subtle row">
            <input type="checkbox" checked={selectedIds.has(boat.id)} onChange={(event) => toggleBoat(boat.id, event.target.checked)} disabled={isBlocking} />
            <span>{boat.name} <span className="muted">({boat.boat_class_id})</span></span>
          </label>
        ))}
        {operationalBoats.length === 0 ? <p className="muted">No operational club boats are available to add to a regatta hold.</p> : null}
      </div>
      <Button type="button" onClick={blockSelected} disabled={isBlocking || selectedIds.size === 0}>{isBlocking ? "Blocking…" : "Block Selected Boats"}</Button>
      {message ? <p className="muted" role="status">{message}</p> : null}

      {activeHolds.length > 0 ? <div className="stack">
        <h4>Active Regatta Holds</h4>
        {activeHolds.map((hold) => (
          <div key={hold.id} className="card-subtle stack">
            <strong>{hold.label}</strong>
            <span className="muted">{hold.boats.length} boat{hold.boats.length === 1 ? "" : "s"} blocked: {hold.boats.map((boat) => boat.name).join(", ")}</span>
            <Button type="button" variant="secondary" onClick={() => void releaseHold(hold.id)} disabled={releasingHoldId !== null}>{releasingHoldId === hold.id ? "Releasing…" : "Release All Regatta Boats"}</Button>
          </div>
        ))}
      </div> : null}
    </section>
  );
}
