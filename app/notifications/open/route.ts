import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const notificationId = url.searchParams.get("id") ?? "";
  const requestedDestination = url.searchParams.get("to") ?? "/notifications";
  const destination = requestedDestination.startsWith("/") && !requestedDestination.startsWith("//") ? requestedDestination : "/notifications";

  if (notificationId) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase
        .from("notification_events")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("member_id", data.user.id)
        .is("read_at", null);
    }
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
