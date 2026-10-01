import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRaidTargets } from "@/lib/raid";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const targets = await getRaidTargets(parseInt(session.user.id));
    return NextResponse.json({ targets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Raid targets error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
