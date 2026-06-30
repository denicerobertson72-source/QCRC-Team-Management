# Email Delivery Setup

This app already generates Supabase auth links and sends them through Resend. To make invites and sign-in emails work reliably in production, the production environment needs the correct sender and app URL values.

## Required production environment variables

Set these in Vercel for the production environment:

```bash
RESEND_API_KEY=re_...
EMAIL_FROM=QCRC Team Management <noreply@queencityrowing.com>
APP_URL=https://queencityrowing.com
```

## Notes

- `RESEND_API_KEY` must be a valid Resend API key with access to your verified domain.
- `EMAIL_FROM` must use an address on a domain that Resend has verified.
- `APP_URL` is the production base URL used when the app creates invite and magic-link redirects.
- Keep `NEXT_PUBLIC_APP_URL=http://localhost:3000` in local development if you want local auth redirects during development.

## Why `APP_URL` matters

Invite and magic-link emails are created by the server, not the browser. If production falls back to a localhost URL, emailed auth links can send people to the wrong place. The app now prefers:

1. `APP_URL`
2. Vercel production URL environment variables
3. a final fallback Vercel URL

That makes production email links much safer.

## Resend recommendations

- A verified sending domain is required before sending email with Resend.
- Resend recommends using a sending subdomain to isolate reputation, but because `queencityrowing.com` is already the verified domain you linked, `noreply@queencityrowing.com` is the simplest first production sender.

## App flows covered by this setup

Once configured, these flows should send automatically:

- Admin -> Members -> `Send Invite`
- Admin -> Members -> `Send Magic Link`
- CSV import for new members
- Dues reminder cron emails
- Overdue alert emails

## After setting the variables

Test these in production:

1. Invite a brand-new member from Admin Members.
2. Resend a magic link for an existing invite-pending member.
3. Confirm the received email link opens `https://queencityrowing.com/...` and not localhost.
4. Complete sign-in and confirm the user lands on `/reservations`.
