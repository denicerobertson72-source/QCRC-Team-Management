# PWA Post-Deploy Checklist

Use this checklist after the PWA changes are deployed to production.

## 1. Confirm deployment

- Confirm the deployed site includes the latest PWA commit.
- Open the production site in a desktop browser and verify `manifest.webmanifest` loads.
- Confirm `sw.js` loads with a successful `200` response.

## 2. Installability checks

### iPhone Safari

- Open the production site in Safari on iPhone.
- Confirm the site loads normally and branding looks correct.
- Use `Share` -> `Add to Home Screen`.
- Confirm the installed app icon uses the QCRC logo.
- Launch the installed app from the home screen.
- Confirm it opens in standalone mode without the normal Safari browser chrome.

### Android Chrome

- Open the production site in Chrome on Android.
- Confirm the install banner appears if the app is not already installed.
- Install the app.
- Confirm the installed app icon uses the QCRC logo.
- Launch the app from the home screen and confirm standalone behavior.

## 3. Update flow checks

- Open the installed app once so the current service worker is registered.
- Deploy a small follow-up change.
- Reopen the installed app.
- Confirm the `App update ready` banner appears.
- Tap `Update app`.
- Confirm the app refreshes and loads the newest deployed version.

## 4. Safe cached route checks

Visit these routes while online first:

- `/programs`
- `/boats`
- `/lineups`

Then disable network on the phone and confirm these routes still open with previously loaded content:

- `/programs`
- `/boats`
- `/lineups`

## 5. Network-first route checks

While online, verify these routes still load fresh server data normally:

- `/reservations`
- `/reserve`
- `/safety`
- `/notifications`
- `/account/security`
- `/admin` (admin account only)

Then briefly test with network disabled:

- Confirm these routes do not show misleading stale interactive data.
- Confirm the offline fallback behavior is reasonable if the route cannot load.

## 6. Visual checks

- Confirm the PWA banners do not cover important content on mobile.
- Confirm sticky top navigation still behaves correctly in standalone mode.
- Confirm the home page, `/programs`, and `/boats` feel normal on a phone-sized screen.
- Confirm the icon and splash feel consistent with QCRC branding.

## 7. Regression checks

- Sign in and sign out successfully.
- Open `/programs/meetup` and confirm existing meetup behavior still works.
- Open `/programs/racing` and confirm signup comments still save.
- Open `/admin/races` and confirm race comments still display.
- Open `/reservations` and confirm launch/return flows still work.

## 8. Follow-up notes

Track anything observed during testing:

- Install prompt behavior by platform
- Update banner behavior
- Any standalone-mode layout issues
- Any route that feels like a candidate for future safe caching
