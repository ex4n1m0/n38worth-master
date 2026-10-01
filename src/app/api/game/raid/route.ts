import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRaidOverview } from "@/lib/raid";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const overview = await getRaidOverview(parseInt(session.user.id));
    return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Raid overview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
