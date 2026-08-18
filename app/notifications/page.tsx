import { TopNav } from "@/components/TopNav";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { Button } from "@/components/ui/Button";
import { getMyNotifications } from "@/lib/queries";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/actions";
import { formatEasternDateTime } from "@/lib/time";
import Link from "next/link";
import { PushNotificationSettings } from "@/components/PushNotificationSettings";

function notificationTitle(notification: { notification_type: string; payload: Record<string, unknown> }) {
  if (notification.notification_type === "boat_out_of_service") {
    return `${String(notification.payload.boat_name ?? "Boat")} is out of service`;
  }
  if (notification.notification_type === "lineup_published") {
    return `Lineup published: ${String(notification.payload.title ?? "Lineup")}`;
  }
  if (notification.notification_type === "session_cancelled") {
    return `Session cancelled: ${String(notification.payload.title ?? "Session")}`;
  }
  if (notification.notification_type === "overdue_boat_alert") {
    return "Overdue boat alert";
  }
  if (notification.notification_type === "billing_reminder") {
    return "Billing reminder";
  }
  if (notification.notification_type === "rowing_meetup_signup") {
    return "Rowing Meetup alert";
  }
  if (notification.notification_type === "team_announcement") {
    return String(notification.payload.title ?? "Team announcement");
  }
  return notification.notification_type.replaceAll("_", " ");
}

function notificationBody(notification: { notification_type: string; payload: Record<string, unknown> }) {
  if (notification.notification_type === "boat_out_of_service") {
    return `Your reserved boat is no longer available. Please reserve another boat for ${String(notification.payload.reservation_start ?? "")}.`;
  }
  if (notification.notification_type === "lineup_published") {
    return "Your lineup is now available to review.";
  }
  if (notification.notification_type === "session_cancelled") {
    return `Reason: ${String(notification.payload.cancelled_reason ?? "Cancelled by coach/admin")}`;
  }
  if (notification.notification_type === "billing_reminder") {
    return `Reminder for ${String(notification.payload.category ?? "billing")} due on ${String(notification.payload.renewal_date ?? "")}.`;
  }
  if (notification.notification_type === "rowing_meetup_signup") {
    return `${String(notification.payload.member_name ?? "A new rower")} joined Rowing Meetup. Open the meetup page to check their availability.`;
  }
  if (notification.notification_type === "team_announcement") {
    return String(notification.payload.body ?? "A new team announcement was posted.");
  }
  return "";
}

function notificationHref(notification: { notification_type: string; payload: Record<string, unknown> }) {
  if (notification.notification_type === "lineup_published") return "/lineups";
  if (notification.notification_type === "boat_out_of_service") return "/reserve";
  if (notification.notification_type === "rowing_meetup_signup") return "/programs/meetup";
  if (notification.notification_type === "overdue_boat_alert") return "/reservations";
  if (notification.notification_type === "billing_reminder") return "/account/security";
  if (notification.notification_type === "session_cancelled") {
    const sessionType = String(notification.payload.session_type ?? "");
    if (sessionType === "coached_training_beginner_intermediate") return "/programs/training/beginner-intermediate";
    if (sessionType === "coached_training_advanced") return "/programs/training/advanced";
    if (sessionType === "saturday_coached_row") return "/programs/saturday";
    return "/programs";
  }
  if (notification.notification_type === "team_announcement") return "/";
  return null;
}

export default async function NotificationsPage() {
  const notifications = await getMyNotifications();

  return (
    <>
      <TopNav />
      <main className="stack">
        <PageTitle
          title="Notifications"
          subtitle="Club alerts, lineup updates, cancellations, and reservation issues from the last 24 hours."
          actions={
            notifications.some((item) => item.read_at === null) ? (
              <form action={markAllNotificationsReadAction}>
                <Button type="submit" variant="secondary">
                  Mark All Read
                </Button>
              </form>
            ) : undefined
          }
        />

        <Card subtle className="stack">
          <div>
            <h3>Push notifications</h3>
            <p className="muted">Receive QCRC alerts even when the app is closed. On iPhone and iPad, install QCRC to your Home Screen first.</p>
          </div>
          <PushNotificationSettings />
        </Card>

        <div className="stack">
          {notifications.length === 0 ? <Card subtle>No notifications yet.</Card> : null}
          {notifications.map((notification) => (
            <Card key={notification.id} className="stack">
              <div className="page-title">
                <h3>{notificationTitle(notification)}</h3>
                <span className="muted">
                  {notification.read_at ? "Read" : "Unread"} | {formatEasternDateTime(notification.sent_at)} ET
                </span>
              </div>
              <p>{notificationBody(notification)}</p>
              <div className="notification-actions">
                {notificationHref(notification) ? (
                  <Link href={notificationHref(notification)!} className="cta-link">
                    Open
                  </Link>
                ) : null}
                {notification.read_at === null ? (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="notification_id" value={notification.id} />
                    <Button type="submit" variant="secondary">
                      Mark Read
                    </Button>
                  </form>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
