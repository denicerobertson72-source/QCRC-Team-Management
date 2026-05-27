type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

export async function sendTransactionalEmail(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return { sent: false, reason: "Email provider not configured" } as const;
  }

  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email send failed: ${body}`);
  }

  return { sent: true } as const;
}

export function formatCurrencyStatusLine(label: string, paid: boolean, renewalDate: string | null) {
  return `${label}: ${paid ? "paid" : "due"}${renewalDate ? `, renews ${renewalDate}` : ""}`;
}
