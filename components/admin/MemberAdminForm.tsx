"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { updateMemberAdminAction } from "@/lib/actions";

type MemberAdminFormProps = {
  member: {
    id: string;
    role: string;
    status: string;
    membership_type: string;
    phone: string | null;
    sms_opt_in: boolean | null;
    dues_ok: boolean;
    dues_renewal_date: string | null;
    usrowing_membership_date: string | null;
    safesport_date: string | null;
    owns_private_boat: boolean | null;
    boat_storage_fee_ok: boolean | null;
    boat_storage_fee_renewal_date: string | null;
    skill_level: string;
    weight_class: string;
  };
};

export function MemberAdminForm({ member }: MemberAdminFormProps) {
  const [ownsPrivateBoat, setOwnsPrivateBoat] = useState(Boolean(member.owns_private_boat));

  return (
    <form action={updateMemberAdminAction} className="form-grid">
      <input type="hidden" name="member_id" value={member.id} />

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

      <Field label="Membership Type">
        <select name="membership_type" defaultValue={member.membership_type}>
          <option value="community">community</option>
          <option value="competitive">competitive</option>
          <option value="ltr">ltr</option>
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

      <Field label="Dues">
        <select name="dues_ok" defaultValue={member.dues_ok ? "true" : "false"}>
          <option value="true">paid</option>
          <option value="false">due</option>
        </select>
      </Field>

      <Field label="Dues Renewal Date">
        <input name="dues_renewal_date" type="date" defaultValue={member.dues_renewal_date ?? ""} />
      </Field>

      <Field label="USRowing Membership Date">
        <input name="usrowing_membership_date" type="date" defaultValue={member.usrowing_membership_date ?? ""} />
      </Field>

      <Field label="SafeSport Date">
        <input name="safesport_date" type="date" defaultValue={member.safesport_date ?? ""} />
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

      <div className="row">
        <Button type="submit">Save Member</Button>
        <Button type="submit" variant="secondary" name="status" value="inactive">
          Remove Access
        </Button>
      </div>
    </form>
  );
}
