import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const tokenHash = requestUrl.searchParams.get("token_hash");
    const rawType = requestUrl.searchParams.get("type");
    const nextPath = requestUrl.searchParams.get("next") ?? "/reservations";

    if (!tokenHash || !rawType) {
      return NextResponse.redirect(new URL("/login?error=missing_token", requestUrl.origin));
    }

    // Supabase email links can pass type=magiclink, while verifyOtp expects EmailOtpType values.
    const otpType: EmailOtpType = rawType === "magiclink" ? "email" : (rawType as EmailOtpType);

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash: tokenHash,
    });

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin),
      );
    }

    return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  } catch {
    const requestUrl = new URL(request.url);
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", requestUrl.origin));
  }
}
