import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { executeRaid } from "@/lib/raid";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const targetId = Number(body?.targetId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return NextResponse.json({ error: "Must provide targetId" }, { status: 400 });
    }
    const result = await executeRaid(parseInt(session.user.id), targetId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Raid execute error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
