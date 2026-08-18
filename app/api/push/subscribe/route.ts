import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subscription = await request.json().catch(() => null);
  const endpoint = typeof subscription?.endpoint === "string" ? subscription.endpoint : "";
  const p256dh = typeof subscription?.keys?.p256dh === "string" ? subscription.keys.p256dh : "";
  const auth = typeof subscription?.keys?.auth === "string" ? subscription.keys.auth : "";
  let isHttpsEndpoint = false;
  try {
    isHttpsEndpoint = new URL(endpoint).protocol === "https:";
  } catch {
    // Invalid endpoints are rejected below.
  }
  if (!isHttpsEndpoint || !p256dh || !auth) return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });

  const { error } = await createAdminClient().from("push_subscriptions").upsert(
    { member_id: user.id, endpoint, p256dh, auth, user_agent: request.headers.get("user-agent") },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
