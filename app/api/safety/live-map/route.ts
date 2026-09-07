import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafetyDashboardForSupabase } from "@/lib/queries";
import { getSafetyLiveMapState } from "@/lib/safety-live";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { onWater } = await getSafetyDashboardForSupabase(supabase);
  const state = await getSafetyLiveMapState(supabase as never, user.id, onWater);
  return NextResponse.json(state);
}
