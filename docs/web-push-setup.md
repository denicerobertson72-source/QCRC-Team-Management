# Web Push setup

QCRC uses native browser Web Push. `notification_events` remains the in-app source of truth; Web Push is a best-effort delivery channel to the member's subscribed devices.

## Deploy

1. Apply `sql/v1/035_web_push_subscriptions.sql` in Supabase.
2. Generate one persistent VAPID pair (do not rotate it during normal deployments):

   ```bash
   npx web-push generate-vapid-keys
   ```

3. In Vercel, add these production environment variables:

   ```text
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<VAPID public key>
   VAPID_PRIVATE_KEY=<VAPID private key>
   VAPID_SUBJECT=mailto:club-notifications@example.com
   ```

   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is intentionally available to the browser. `VAPID_PRIVATE_KEY` is server-only and must never be committed or exposed. `VAPID_SUBJECT` must be a valid `mailto:` address or HTTPS URL.
4. Deploy normally on Vercel. No separate worker or push provider is required.

The migration enables RLS: users can only read, create, update, and delete their own subscriptions. Push delivery uses the server-only Supabase service-role client.

## Member setup

### iPhone and iPad

1. Open the production site in Safari.
2. Use Share → **Add to Home Screen**.
3. Open the installed QCRC app and sign in.
4. Open **Notifications**, choose **Enable Push Notifications**, and allow notifications.

Web Push requires the installed Home Screen app on iOS/iPadOS 16.4 or later.

### Android and desktop

Open **Notifications** and select **Enable Push Notifications**. Installing the PWA is recommended on Android, but supported browsers can also subscribe from the site.

## What is delivered

Each existing notification creation path sends push after creating its normal event: boat-out-of-service, lineup publication, session cancellation, overdue boat alerts, billing reminders, and Rowing Meetup signups. The optional **Send push notification to active members** checkbox on the admin Team Announcements form creates matching `team_announcement` notification events and sends push to that same active-member audience.

Each browser/device creates a separate subscription. Disabling push removes only that device's subscription. Endpoints returning HTTP 404 or 410 are removed automatically. Delivery failures are logged without credentials and never fail the originating action.

## Manual test checklist

- Enable notifications twice on one device; confirm only one endpoint row exists.
- Enable on a second browser/device; confirm both rows remain for the member.
- Disable one device; confirm the other device still has its row and receives alerts.
- Trigger each notification path and confirm `/notifications` contains the event even when no subscription exists.
- Trigger an announcement with its checkbox enabled; confirm active members receive the notification and push.
- Click a notification and confirm QCRC opens an in-app route, never an external URL.
- Test an expired subscription and confirm its row is cleaned up after a 404/410 response.
- On iPhone, complete the Home Screen sequence above, lock the device, trigger an alert, then verify Lock Screen/Notification Center delivery and the opened route.
- On Android Chrome, enable push, close the app, trigger an alert, and verify delivery and click-through.
