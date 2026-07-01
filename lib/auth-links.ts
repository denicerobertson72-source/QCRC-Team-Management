import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";
import { headers } from "next/headers";

export async function listAllAuthUsersByEmail(admin: ReturnType<typeof createAdminClient>) {
  const byEmail = new Map<string, string>();
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;

    const users = data.users ?? [];
    for (const user of users) {
      const email = user.email?.trim().toLowerCase();
      if (email) {
        byEmail.set(email, user.id);
      }
    }

    if (users.length < 200) break;
    page += 1;
  }

  return byEmail;
}

export async function generateAndSendMemberAuthLink(
  admin: ReturnType<typeof createAdminClient>,
  {
    email,
    fullName,
    type,
    nextPath,
    appUrl,
  }: {
    email: string;
    fullName: string;
    type: "invite" | "magiclink" | "recovery";
    nextPath?: string;
    appUrl?: string;
  },
) {
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const requestOrigin = forwardedHost ? `${forwardedProto || "https"}://${forwardedHost}` : null;
  const resolvedAppUrl = appUrl || requestOrigin || getAppUrl();
  const callbackPath = nextPath ?? "/reservations";
  const redirectTo =
    type === "recovery"
      ? `${resolvedAppUrl}${callbackPath}`
      : `${resolvedAppUrl}/auth/confirm?next=${encodeURIComponent(callbackPath)}`;
  const { data, error } =
    type === "recovery"
      ? await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: {
            redirectTo,
          },
        })
      : await admin.auth.admin.generateLink({
          type,
          email,
          options: {
            data: { full_name: fullName },
            redirectTo,
          },
        });

  if (error || !data.properties.action_link || !data.user?.id) {
    throw new Error(error?.message || `Unable to create a ${type} link for ${email}.`);
  }

  const emailContent =
    type === "invite"
      ? {
          subject: "QCRC invitation link",
          text: `Hello ${fullName},\n\nYou have been invited to join QCRC Team Management. Use this secure link to get started:\n\n${data.properties.action_link}\n\nAfter opening the link, you will land on your reservations page.`,
          html: `<p>Hello ${fullName},</p><p>You have been invited to join QCRC Team Management.</p><p><a href="${data.properties.action_link}">Accept Invitation</a></p><p>If the button does not work, paste this link into your browser:</p><p>${data.properties.action_link}</p><p>After opening the link, you will land on your reservations page.</p>`,
        }
      : type === "recovery"
        ? {
            subject: "QCRC password reset link",
            text: `Hello ${fullName},\n\nUse this secure link to reset your QCRC Team Management password:\n\n${data.properties.action_link}\n\nAfter opening the link, you will land on the account settings page where you can save a new password.`,
            html: `<p>Hello ${fullName},</p><p>Use this secure link to reset your QCRC Team Management password:</p><p><a href="${data.properties.action_link}">Reset Password</a></p><p>If the button does not work, paste this link into your browser:</p><p>${data.properties.action_link}</p><p>After opening the link, you will land on the account settings page where you can save a new password.</p>`,
          }
        : {
            subject: "QCRC sign-in link",
            text: `Hello ${fullName},\n\nUse this secure link to sign in to QCRC Team Management:\n\n${data.properties.action_link}\n\nAfter opening the link, you will land on your reservations page.`,
            html: `<p>Hello ${fullName},</p><p>Use this secure link to sign in to QCRC Team Management:</p><p><a href="${data.properties.action_link}">Open QCRC Team Management</a></p><p>If the button does not work, paste this link into your browser:</p><p>${data.properties.action_link}</p><p>After opening the link, you will land on your reservations page.</p>`,
          };

  const sendResult = await sendTransactionalEmail({
    to: email,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });

  if (!sendResult.sent) {
    return {
      userId: data.user.id,
      delivery: "manual" as const,
      actionLink: data.properties.action_link,
      reason: sendResult.reason || "Email provider not configured",
    };
  }

  return {
    userId: data.user.id,
    delivery: "email" as const,
    actionLink: data.properties.action_link,
    reason: null,
  };
}
