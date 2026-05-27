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
import { importMembersCsvAdminAction } from "@/lib/actions";

type SearchParams = Promise<{ import_status?: string; import_message?: string }>;

export default async function AdminMembersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase } = await ensureSiteAdmin();
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, phone, sms_opt_in, role, status, dues_ok, dues_renewal_date, usrowing_membership_date, safesport_date, membership_type, skill_level, weight_class, owns_private_boat, boat_storage_fee_ok, boat_storage_fee_renewal_date",
    )
    .order("full_name");

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

        <InviteMemberForm />

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
          {(data ?? []).map((m) => (
            <Card key={m.id} className="stack">
              <div className="page-title">
                <div className="stack" style={{ gap: "0.35rem" }}>
                  <h3>{m.full_name}</h3>
                  <span className="muted">{m.email}</span>
                </div>
                <div className="row">
                  {m.owns_private_boat ? <StatusChip label="Private Boat Owner" kind="checked_out" /> : null}
                </div>
              </div>

              <MemberAdminForm member={m} />
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
