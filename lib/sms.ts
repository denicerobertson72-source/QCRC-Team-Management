type SmsPayload = {
  to: string | string[];
  body: string;
};

function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

export async function sendSms(payload: SmsPayload) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    return { sent: false, reason: "SMS provider not configured" } as const;
  }

  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  const normalizedRecipients = recipients.map(normalizePhone).filter(Boolean);

  for (const to of normalizedRecipients) {
    const params = new URLSearchParams();
    params.set("To", to);
    params.set("From", from);
    params.set("Body", payload.body);

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SMS send failed: ${body}`);
    }
  }

  return { sent: true } as const;
}
