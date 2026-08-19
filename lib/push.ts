import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type NotificationPayload = Record<string, unknown>;

type PushContent = {
  title: string;
  body: string;
  url: string;
};

function getPushContent(notificationType: string, payload: NotificationPayload): PushContent {
  switch (notificationType) {
    case "boat_out_of_service":
      return {
        title: `${String(payload.boat_name ?? "Boat")} is out of service`,
        body: "Your reserved boat is no longer available. Please reserve another boat.",
        url: "/reserve",
      };
    case "lineup_published":
      return { title: `Lineup published: ${String(payload.title ?? "Lineup")}`, body: "Your lineup is ready to review.", url: "/lineups" };
    case "session_cancelled":
      return { title: `Session cancelled: ${String(payload.title ?? "Session")}`, body: `Reason: ${String(payload.cancelled_reason ?? "Cancelled by coach/admin")}`, url: "/programs" };
    case "overdue_boat_alert":
      return {
        title: `Emergency: ${String(payload.boat_name ?? "Boat")} overdue`,
        body: `${String(payload.rower_name ?? "A rower")} has been on the water for more than two hours.`,
        url: "/reservations",
      };
    case "billing_reminder":
      return { title: "Billing reminder", body: `Reminder for ${String(payload.category ?? "billing")} due on ${String(payload.renewal_date ?? "")}.`, url: "/account/security" };
    case "rowing_meetup_signup":
      return { title: "Rowing Meetup alert", body: `${String(payload.member_name ?? "A new rower")} joined Rowing Meetup.`, url: "/programs/meetup" };
    case "team_announcement":
      return { title: String(payload.title ?? "Team announcement"), body: String(payload.body ?? "A new team announcement was posted."), url: "/" };
    case "damage_report_submitted":
      return {
        title: `Damage report: ${String(payload.boat_name ?? "Boat")}`,
        body: `Severity ${String(payload.severity ?? "not set")}: ${String(payload.description ?? "Open the damage queue for details.")}`,
        url: "/admin/damage",
      };
    default:
      return { title: "QCRC notification", body: "You have a new club notification.", url: "/notifications" };
  }
}

function isConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

let configured = false;

function configureWebPush() {
  if (configured || !isConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
  return true;
}

/** Delivers a notification outside the app without changing its in-app source of truth. */
export async function sendPushNotifications(memberIds: string[], notificationType: string, payload: NotificationPayload) {
  try {
    if (memberIds.length === 0 || !configureWebPush()) return;

    const admin = createAdminClient();
    const { data: subscriptions, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("member_id", [...new Set(memberIds)]);
    if (error) {
      console.error("Could not load Web Push subscriptions", { message: error.message });
      return;
    }
    if (!subscriptions?.length) return;

    const content = getPushContent(notificationType, payload);
    const message = JSON.stringify({ ...content, icon: "/icon-192.png", badge: "/icon-192.png" });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          message,
        );
        } catch (error) {
          const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
          if (statusCode === 404 || statusCode === 410) {
            const { error: deleteError } = await admin.from("push_subscriptions").delete().eq("id", subscription.id);
            if (deleteError) console.error("Could not remove stale Web Push subscription", { message: deleteError.message, subscriptionId: subscription.id });
            return;
          }
          console.error("Web Push delivery failed", { statusCode, subscriptionId: subscription.id });
        }
      }),
    );
  } catch (error) {
    console.error("Web Push delivery setup failed", { message: error instanceof Error ? error.message : "Unknown error" });
  }
}
