import { TopNav } from "@/components/TopNav";
import { ensureSiteAdmin } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { FlashNotice } from "@/components/ui/FlashNotice";
import { InviteMemberForm } from "@/components/admin/InviteMemberForm";
import { MemberAdminForm } from "@/components/admin/MemberAdminForm";
import { StatusChip } from "@/components/ui/StatusChip";
import { importMembersCsvAdminAction, sendMemberMagicLinkAdminAction } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatEasternDateTime } from "@/lib/time";

type SearchParams = Promise<{
  import_status?: string;
  import_message?: string;
  invite_status?: string;
  invite_message?: string;
  auth_filter?: string;
}>;

async function listAuthUsersByEmail() {
  const admin = createAdminClient();
  const byEmail = new Map<
    string,
    {
      id: string;
      last_sign_in_at: string | null;
      confirmation_sent_at: string | null;
      invited_at: string | null;
    }
  >();
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const users = data.users ?? [];
    for (const user of users) {
      const email = user.email?.trim().toLowerCase();
      if (!email) continue;
      byEmail.set(email, {
        id: user.id,
        last_sign_in_at: user.last_sign_in_at ?? null,
        confirmation_sent_at: user.confirmation_sent_at ?? null,
        invited_at: user.invited_at ?? null,
      });
    }

    if (users.length < 200) break;
    page += 1;
  }

  return byEmail;
}

export default async function AdminMembersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const authFilter =
    params.auth_filter === "invite_pending" || params.auth_filter === "activated" ? params.auth_filter : "all";
  const { supabase } = await ensureSiteAdmin();
  const [{ data }, { data: trainingAssignments }, authUsersByEmail] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, sms_opt_in, role, status, dues_ok, dues_renewal_date, usrowing_membership_date, safesport_date, membership_type, skill_level, weight_class, owns_private_boat, boat_storage_fee_ok, boat_storage_fee_renewal_date",
      )
      .order("full_name"),
    supabase
      .from("program_signups")
      .select("member_id, training_group")
      .eq("program_type", "coached_training"),
    listAuthUsersByEmail(),
  ]);
  const trainingGroupByMemberId = new Map((trainingAssignments ?? []).map((row) => [row.member_id, row.training_group]));
  const membersWithAuth = (data ?? []).map((member) => {
    const authUser = authUsersByEmail.get(member.email.toLowerCase());
    const lastInviteAt = authUser?.confirmation_sent_at ?? authUser?.invited_at ?? null;
    const hasSignedIn = Boolean(authUser?.last_sign_in_at);
    const authState = hasSignedIn ? "activated" : "invite_pending";
    return {
      ...member,
      authUser,
      lastInviteAt,
      hasSignedIn,
      authState,
    };
  });
  const visibleMembers = membersWithAuth.filter((member) => authFilter === "all" || member.authState === authFilter);

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle title="Admin: Members" subtitle="Add members, update dues/compliance/status/role, and remove access." />

        {params.import_status && params.import_message ? (
          <FlashNotice
            status={params.import_status === "success" ? "success" : "error"}
            message={params.import_message}
          />
        ) : null}
        {params.invite_status && params.invite_message ? (
          <FlashNotice
            status={params.invite_status === "success" ? "success" : "error"}
            message={params.invite_message}
          />
        ) : null}

        <InviteMemberForm />

        <form method="get" className="card form-grid">
          <h3>Filter Members</h3>
          <Field label="Invite Status">
            <select name="auth_filter" defaultValue={authFilter}>
              <option value="all">All</option>
              <option value="invite_pending">Invite Pending</option>
              <option value="activated">Activated</option>
            </select>
          </Field>
          <p className="muted">
            Showing {visibleMembers.length} of {membersWithAuth.length} members.
          </p>
          <div className="row">
            <Button type="submit">Apply Filter</Button>
            <a href="/admin/members" className="cta-link">
              Clear Filter
            </a>
          </div>
        </form>

        <form action={importMembersCsvAdminAction} className="card form-grid">
          <h3>Import Members from Spreadsheet</h3>
          <p className="muted">
            Upload a CSV exported from Excel or Google Sheets. Existing members are matched by email and updated. New emails are invited into the app automatically.
          </p>
          <Field label="CSV File">
            <input name="file" type="file" accept=".csv,text/csv" required />
          </Field>
          <Card subtle className="stack">
            <strong>Expected column names</strong>
            <p className="muted">
              `email`, `full_name`, `phone`, `role`, `status`, `membership_type`, `skill_level`, `weight_class`,
              `dues_ok`, `dues_renewal_date`, `usrowing_membership_date`, `safesport_date`, `owns_private_boat`,
              `boat_storage_fee_ok`, `boat_storage_fee_renewal_date`, `sms_opt_in`
            </p>
            <p className="muted">
              Dates should be in `YYYY-MM-DD` format. Boolean fields accept `true/false`, `yes/no`, or `1/0`.
            </p>
          </Card>
          <Button type="submit">Import CSV</Button>
        </form>

        <div className="stack">
          {visibleMembers.map((m) => (
            <Card key={m.id} className="stack">
              <div className="page-title">
                <div className="stack" style={{ gap: "0.35rem" }}>
                  <h3>{m.full_name}</h3>
                  <span className="muted">{m.email}</span>
                  {m.authUser ? (
                    <span className="muted">
                      {m.hasSignedIn
                        ? `Activated: ${formatEasternDateTime(m.authUser.last_sign_in_at as string)} ET`
                        : m.lastInviteAt
                          ? `Invite pending. Last sent: ${formatEasternDateTime(m.lastInviteAt)} ET`
                          : "Auth record exists but no sign-in yet."}
                    </span>
                  ) : (
                    <span className="muted">No auth account found yet.</span>
                  )}
                </div>
                <div className="row">
                  {m.owns_private_boat ? <StatusChip label="Private Boat Owner" kind="checked_out" /> : null}
                  {m.hasSignedIn ? <StatusChip label="Activated" kind="checked_out" /> : <StatusChip label="Invite Pending" kind="reserved" />}
                </div>
              </div>

              <form action={sendMemberMagicLinkAdminAction} className="row">
                <input type="hidden" name="email" value={m.email} />
                <input type="hidden" name="full_name" value={m.full_name} />
                <Button type="submit" variant="secondary">
                  Send Magic Link
                </Button>
              </form>

              <MemberAdminForm member={{ ...m, training_group: trainingGroupByMemberId.get(m.id) ?? null }} />
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
