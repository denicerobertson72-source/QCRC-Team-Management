"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type InviteGuidanceButtonProps = {
  email: string;
  fullName: string;
  hasAuthAccount: boolean;
  hasSignedIn: boolean;
  lastInviteAt: string | null;
  emailDeliveryConfigured: boolean;
};

function buildGuidanceText({
  email,
  fullName,
  hasAuthAccount,
  hasSignedIn,
  lastInviteAt,
  emailDeliveryConfigured,
}: InviteGuidanceButtonProps) {
  const lines = [
    `Invite status for ${fullName}`,
    `Email: ${email}`,
    hasSignedIn
      ? "Account status: Activated"
      : hasAuthAccount
        ? "Account status: Invite pending"
        : "Account status: No auth account found yet",
  ];

  if (lastInviteAt) {
    lines.push(`Last invite generated: ${new Date(lastInviteAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET`);
  }

  if (!emailDeliveryConfigured) {
    lines.push("Club email delivery is not configured in the app yet, so a fresh sign-in email cannot be sent from the system right now.");
  } else {
    lines.push("A fresh sign-in email can be sent from Admin Members if the member still needs access.");
  }

  lines.push("Ask the member to check spam/junk and search for earlier QCRC invite or sign-in emails.");
  lines.push("If the member still cannot sign in after email delivery is configured, resend a magic link from Admin Members.");

  return lines.join("\n");
}

export function InviteGuidanceButton(props: InviteGuidanceButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        const text = buildGuidanceText(props);
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Guidance Copied" : "Copy Invite Guidance"}
    </Button>
  );
}
