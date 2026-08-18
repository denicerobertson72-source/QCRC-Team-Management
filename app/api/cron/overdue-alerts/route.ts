import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { formatEasternDateTime } from "@/lib/time";
import { sendPushNotifications } from "@/lib/push";

function ensureCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function markNotification(admin: ReturnType<typeof createAdminClient>, key: string, memberId: string, reservationId: string) {
  const { error } = await admin.from("notification_events").insert({
    notification_key: key,
    notification_type: "overdue_boat_alert",
    member_id: memberId,
    reservation_id: reservationId,
    payload: {},
  });

  if (!error) {
    await sendPushNotifications([memberId], "overdue_boat_alert", {});
    return true;
  }
  if (error.code === "23505") return false;
  throw error;
}

export async function GET(request: Request) {
  if (!ensureCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const thresholdIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const [{ data: reservations, error: reservationError }, { data: admins, error: adminError }] = await Promise.all([
    admin
      .from("reservations")
      .select("id, checked_out_at, checkout_location, river_direction, boats(name), profiles!reservations_created_by_fkey(id,full_name,email,phone,sms_opt_in)")
      .eq("status", "checked_out")
      .lte("checked_out_at", thresholdIso),
    admin.from("profiles").select("email, phone, sms_opt_in").eq("role", "admin").eq("status", "active"),
  ]);

  if (reservationError) {
    return NextResponse.json({ error: reservationError.message }, { status: 500 });
  }
  if (adminError) {
    return NextResponse.json({ error: adminError.message }, { status: 500 });
  }

  const adminEmails = [...new Set((admins ?? []).map((entry) => entry.email).filter(Boolean))];
  const adminPhones = [...new Set((admins ?? []).filter((entry) => entry.sms_opt_in).map((entry) => entry.phone).filter(Boolean))];
  let sent = 0;

  for (const row of reservations ?? []) {
    const boat = Array.isArray(row.boats) ? row.boats[0] : row.boats;
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!profile?.id) continue;

    const shouldSend = await markNotification(
      admin,
      `overdue:${row.id}:${row.checked_out_at}`,
      profile.id,
      row.id,
    );
    if (!shouldSend) continue;

    const recipients = [...new Set([profile.email, ...adminEmails].filter(Boolean))];
    if (recipients.length === 0) continue;

    const launchSummary = [
      `Boat: ${boat?.name ?? row.id}`,
      `Launched: ${row.checked_out_at ? `${formatEasternDateTime(row.checked_out_at)} ET` : "unknown"}`,
      `Location: ${row.checkout_location ?? "not set"}`,
      `Direction: ${row.river_direction ?? "not set"}`,
    ].join("\n");

    await sendTransactionalEmail({
      to: recipients,
      subject: `QCRC overdue boat alert: ${boat?.name ?? "Boat"}`,
      text: `An active outing is overdue by more than 2 hours.\n\nRower: ${profile.full_name}\n${launchSummary}`,
      html: `<p>An active outing is overdue by more than 2 hours.</p><p><strong>Rower:</strong> ${profile.full_name}</p><ul><li><strong>Boat:</strong> ${boat?.name ?? row.id}</li><li><strong>Launched:</strong> ${
        row.checked_out_at ? `${formatEasternDateTime(row.checked_out_at)} ET` : "unknown"
      }</li><li><strong>Location:</strong> ${row.checkout_location ?? "not set"}</li><li><strong>Direction:</strong> ${row.river_direction ?? "not set"}</li></ul>`,
    });

    const smsRecipients = [...new Set([profile.sms_opt_in ? profile.phone : null, ...adminPhones].filter(Boolean))] as string[];
    if (smsRecipients.length > 0) {
      await sendSms({
        to: smsRecipients,
        body: `QCRC overdue boat alert: ${boat?.name ?? "Boat"} launched ${row.checked_out_at ? `${formatEasternDateTime(row.checked_out_at)} ET` : "unknown"}. Location: ${row.checkout_location ?? "not set"}. Direction: ${row.river_direction ?? "not set"}.`,
      });
    }
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}
