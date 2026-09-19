import { NextResponse } from "next/server";
import { buildVersion } from "@/lib/build-version";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { version: buildVersion },
    { headers: { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" } },
  );
}
