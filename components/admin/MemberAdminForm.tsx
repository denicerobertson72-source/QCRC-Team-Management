"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { updateMemberAdminAction } from "@/lib/actions";

type MemberAdminFormProps = {
  member: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    status: string;
    phone: string | null;
    sms_opt_in: boolean | null;
    owns_private_boat: boolean | null;
    boat_storage_fee_ok: boolean | null;
    boat_storage_fee_renewal_date: string | null;
    skill_level: string;
    weight_class: string;
    training_group?: string | null;
  };
};

export function MemberAdminForm({ member }: MemberAdminFormProps) {
  const [ownsPrivateBoat, setOwnsPrivateBoat] = useState(Boolean(member.owns_private_boat));

  return (
    <form action={updateMemberAdminAction} className="form-grid">
      <input type="hidden" name="member_id" value={member.id} />

      <Field label="Account Email">
        <input name="email" type="email" defaultValue={member.email} required />
      </Field>

      <Field label="Full Name">
        <input name="full_name" defaultValue={member.full_name} required />
      </Field>

      <Field label="Role">
        <select name="role" defaultValue={member.role}>
          <option value="member">member</option>
          <option value="coach">coach</option>
          <option value="equipment_manager">equipment_manager</option>
          <option value="admin">admin</option>
        </select>
      </Field>

      <Field label="Status">
        <select name="status" defaultValue={member.status}>
          <option value="active">active</option>
          <option value="suspended">suspended</option>
          <option value="inactive">inactive (removed)</option>
        </select>
      </Field>

      <Field label="Mobile Phone">
        <input name="phone" defaultValue={member.phone ?? ""} placeholder="5135551234 or +15135551234" />
      </Field>

      <Field label="SMS Alerts">
        <select name="sms_opt_in" defaultValue={member.sms_opt_in ? "true" : "false"}>
          <option value="false">off</option>
          <option value="true">on</option>
        </select>
      </Field>

      <Field label="Owns Private Boat">
        <select
          name="owns_private_boat"
          defaultValue={ownsPrivateBoat ? "true" : "false"}
          onChange={(event) => setOwnsPrivateBoat(event.target.value === "true")}
        >
          <option value="false">no</option>
          <option value="true">yes</option>
        </select>
      </Field>

      {ownsPrivateBoat ? (
        <>
          <Field label="Boat Storage Fee">
            <select name="boat_storage_fee_ok" defaultValue={member.boat_storage_fee_ok ? "true" : "false"}>
              <option value="true">paid</option>
              <option value="false">due</option>
            </select>
          </Field>

          <Field label="Boat Storage Renewal Date">
            <input
              name="boat_storage_fee_renewal_date"
              type="date"
              defaultValue={member.boat_storage_fee_renewal_date ?? ""}
            />
          </Field>
        </>
      ) : null}

      <Field label="Skill Level">
        <select name="skill_level" defaultValue={member.skill_level}>
          <option value="Beginner">Beginner</option>
          <option value="Intermediate">Intermediate</option>
          <option value="Advanced">Advanced</option>
          <option value="Elite">Elite</option>
        </select>
      </Field>

      <Field label="Weight Class">
        <select name="weight_class" defaultValue={member.weight_class}>
          <option value="Lightweight">Lightweight</option>
          <option value="Mid-weight">Mid-weight</option>
          <option value="Heavyweight">Heavyweight</option>
        </select>
      </Field>

      <Field label="Coached Training Group">
        <select name="training_group" defaultValue={member.training_group ?? ""}>
          <option value="">Not assigned</option>
          <option value="beginner_intermediate">Beginner/Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </Field>

      <div className="row">
        <Button type="submit">Save Member</Button>
        <Button type="submit" variant="secondary" name="status" value="inactive">
          Remove Access
        </Button>
      </div>
    </form>
  );
}
