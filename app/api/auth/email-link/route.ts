import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAndSendMemberAuthLink, listAllAuthUsersByEmail } from "@/lib/auth-links";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mode = body?.mode === "recovery" ? "recovery" : "magiclink";
    const email = String(body?.email ?? "").trim().toLowerCase();
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");
    const requestUrl = new URL(request.url);
    const origin = forwardedHost ? `${forwardedProto || "https"}://${forwardedHost}` : requestUrl.origin;

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const authUsersByEmail = await listAllAuthUsersByEmail(admin);
    const { data: profile } = await admin.from("profiles").select("full_name").eq("email", email).maybeSingle();
    const fullName = profile?.full_name?.trim() || email;

    if (mode === "recovery" && !authUsersByEmail.has(email)) {
      return NextResponse.json(
        { error: "No account was found for that email. Ask an admin to send you an invite first." },
        { status: 404 },
      );
    }

    const result = await generateAndSendMemberAuthLink(admin, {
      email,
      fullName,
      type: mode === "recovery" ? "recovery" : authUsersByEmail.has(email) ? "magiclink" : "invite",
      nextPath: mode === "recovery" ? "/account/security?reset=1" : "/reservations",
      appUrl: origin,
    });

    if (result.delivery !== "email") {
      return NextResponse.json({ error: result.reason || "Email delivery is not configured." }, { status: 500 });
    }

    return NextResponse.json({
      message:
        mode === "recovery"
          ? "Password reset email sent. Open the link in the same browser, then choose a new password."
          : "Magic link sent. Check your inbox.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send email link." },
      { status: 500 },
    );
  }
}
