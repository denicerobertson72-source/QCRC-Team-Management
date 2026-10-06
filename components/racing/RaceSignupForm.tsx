"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

type Signup = { birthdate: string; desired_race_count: number; wants_1x: boolean; wants_2x: boolean; wants_4x: boolean; comments: string | null } | null;
type Result = { ok: boolean; message: string };

export function RaceSignupForm({ raceEventId, signup, action }: { raceEventId: string; signup: Signup; action: (formData: FormData) => Promise<Result> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState(signup ? "Added" : "");
  const [hasError, setHasError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function persist() {
    const form = formRef.current;
    if (!form || !new FormData(form).get("birthdate")) return;
    setStatus(signup ? "Saving…" : "Adding…");
    setHasError(false);
    startTransition(async () => {
      const result = await action(new FormData(form));
      setStatus(result.message);
      setHasError(!result.ok);
      if (result.ok) router.refresh();
    });
  }

  function remove() {
    const formData = new FormData();
    formData.set("race_event_id", raceEventId);
    formData.set("attending", "false");
    setStatus("Removing…");
    setHasError(false);
    startTransition(async () => {
      const result = await action(formData);
      setStatus(result.message);
      setHasError(!result.ok);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="stack">
      <form ref={formRef} className="form-grid" onSubmit={(event) => { event.preventDefault(); persist(); }} onChange={(event) => { if (!(event.target instanceof HTMLTextAreaElement)) persist(); }} onBlur={(event) => { if (event.target instanceof HTMLTextAreaElement) persist(); }}>
        <input type="hidden" name="race_event_id" value={raceEventId} />
        <input type="hidden" name="attending" value="true" />
        <Field label="Birthdate"><input name="birthdate" type="date" defaultValue={signup?.birthdate ?? ""} required /></Field>
        <Field label="Desired number of events"><select name="desired_race_count" defaultValue={String(signup?.desired_race_count ?? 1)}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></Field>
        <div className="row">
          <label><input type="checkbox" name="wants_1x" value="true" defaultChecked={Boolean(signup?.wants_1x)} /> 1x</label>
          <label><input type="checkbox" name="wants_2x" value="true" defaultChecked={Boolean(signup?.wants_2x)} /> 2x</label>
          <label><input type="checkbox" name="wants_4x" value="true" defaultChecked={Boolean(signup?.wants_4x)} /> 4x</label>
        </div>
        <Field label="Comments (optional)"><textarea name="comments" rows={3} defaultValue={signup?.comments ?? ""} placeholder="Share lineup preferences, availability constraints, or anything coaches should know." /></Field>
      </form>
      <p className={hasError ? "error" : "muted"} role="status">{isPending ? status : status || "Complete the details to join this race; changes save automatically."}</p>
      {signup ? <Button type="button" variant="secondary" onClick={remove} disabled={isPending}>Remove From This Race</Button> : null}
    </div>
  );
}
