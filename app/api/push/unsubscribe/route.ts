import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = await request.json().catch(() => ({}));
  if (typeof endpoint !== "string" || !endpoint) return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  const { error } = await supabase.from("push_subscriptions").delete().eq("member_id", user.id).eq("endpoint", endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
