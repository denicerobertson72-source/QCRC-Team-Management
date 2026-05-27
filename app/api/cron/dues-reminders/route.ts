import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/email";

function ensureCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

function addYears(dateString: string, years: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const value = new Date(Date.UTC(year + years, month - 1, day));
  return value.toISOString().slice(0, 10);
}

async function markNotification(admin: ReturnType<typeof createAdminClient>, key: string, memberId: string, payload: Record<string, unknown>) {
  const { error } = await admin.from("notification_events").insert({
    notification_key: key,
    notification_type: "billing_reminder",
    member_id: memberId,
    payload,
  });

  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

export async function GET(request: Request) {
  if (!ensureCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const in30 = addDays(new Date(), 30);
  const in7 = addDays(new Date(), 7);

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name, email, dues_renewal_date, boat_storage_fee_renewal_date, usrowing_membership_date, safesport_date, status")
    .eq("status", "active")
    .neq("email", "");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;

  for (const profile of profiles ?? []) {
    const lines: string[] = [];
    if (profile.dues_renewal_date === in30) {
      const shouldSend = await markNotification(admin, `dues-30:${profile.id}:${profile.dues_renewal_date}`, profile.id, {
        category: "dues",
        days_before: 30,
        renewal_date: profile.dues_renewal_date,
      });
      if (shouldSend) lines.push(`Annual dues renew on ${profile.dues_renewal_date}. This is your 1 month reminder.`);
    }
    if (profile.dues_renewal_date === in7) {
      const shouldSend = await markNotification(admin, `dues-7:${profile.id}:${profile.dues_renewal_date}`, profile.id, {
        category: "dues",
        days_before: 7,
        renewal_date: profile.dues_renewal_date,
      });
      if (shouldSend) lines.push(`Annual dues renew on ${profile.dues_renewal_date}. This is your 1 week reminder.`);
    }
    if (profile.boat_storage_fee_renewal_date === in30) {
      const shouldSend = await markNotification(
        admin,
        `storage-30:${profile.id}:${profile.boat_storage_fee_renewal_date}`,
        profile.id,
        {
          category: "boat_storage_fee",
          days_before: 30,
          renewal_date: profile.boat_storage_fee_renewal_date,
        },
      );
      if (shouldSend) lines.push(`Boat storage fee renews on ${profile.boat_storage_fee_renewal_date}. This is your 1 month reminder.`);
    }
    if (profile.boat_storage_fee_renewal_date === in7) {
      const shouldSend = await markNotification(
        admin,
        `storage-7:${profile.id}:${profile.boat_storage_fee_renewal_date}`,
        profile.id,
        {
          category: "boat_storage_fee",
          days_before: 7,
          renewal_date: profile.boat_storage_fee_renewal_date,
        },
      );
      if (shouldSend) lines.push(`Boat storage fee renews on ${profile.boat_storage_fee_renewal_date}. This is your 1 week reminder.`);
    }
    if (profile.usrowing_membership_date) {
      const renewalDate = addYears(profile.usrowing_membership_date, 1);
      if (renewalDate === in30) {
        const shouldSend = await markNotification(admin, `usrowing-30:${profile.id}:${renewalDate}`, profile.id, {
          category: "usrowing_membership",
          days_before: 30,
          renewal_date: renewalDate,
        });
        if (shouldSend) lines.push(`USRowing membership renews on ${renewalDate}. This is your 1 month reminder.`);
      }
      if (renewalDate === in7) {
        const shouldSend = await markNotification(admin, `usrowing-7:${profile.id}:${renewalDate}`, profile.id, {
          category: "usrowing_membership",
          days_before: 7,
          renewal_date: renewalDate,
        });
        if (shouldSend) lines.push(`USRowing membership renews on ${renewalDate}. This is your 1 week reminder.`);
      }
    }
    if (profile.safesport_date) {
      const renewalDate = addYears(profile.safesport_date, 1);
      if (renewalDate === in30) {
        const shouldSend = await markNotification(admin, `safesport-30:${profile.id}:${renewalDate}`, profile.id, {
          category: "safesport",
          days_before: 30,
          renewal_date: renewalDate,
        });
        if (shouldSend) lines.push(`SafeSport renews on ${renewalDate}. This is your 1 month reminder.`);
      }
      if (renewalDate === in7) {
        const shouldSend = await markNotification(admin, `safesport-7:${profile.id}:${renewalDate}`, profile.id, {
          category: "safesport",
          days_before: 7,
          renewal_date: renewalDate,
        });
        if (shouldSend) lines.push(`SafeSport renews on ${renewalDate}. This is your 1 week reminder.`);
      }
    }

    if (profile.email && lines.length > 0) {
      await sendTransactionalEmail({
        to: profile.email,
        subject: "QCRC billing reminder",
        text: `Hello ${profile.full_name},\n\n${lines.join("\n")}\n\nQCRC`,
        html: `<p>Hello ${profile.full_name},</p><ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul><p>QCRC</p>`,
      });
      sent += 1;
    }
  }

  return NextResponse.json({ ok: true, sent });
}
