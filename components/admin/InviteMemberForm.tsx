import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { inviteMemberAdminAction } from "@/lib/actions";

export function InviteMemberForm() {
  return (
    <form action={inviteMemberAdminAction} className="card form-grid">
      <h3>Add Member</h3>
      <p className="muted">
        Send a magic-link invite to onboard a new member. Use a distinct name for test accounts so they do not get confused
        with real member logins.
      </p>
      <Field label="Member name">
        <input name="full_name" placeholder="Denice Robertson" />
      </Field>
      <Field label="Member email">
        <input name="email" type="email" required />
      </Field>
      <Button type="submit">Send Invite</Button>
    </form>
  );
}
