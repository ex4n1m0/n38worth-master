import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBattlesView, saveLineup, attackLineup } from "@/lib/crew-battle-service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const view = await getBattlesView(parseInt(session.user.id));
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Crew battles view error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = parseInt(session.user.id);
  try {
    const body = await request.json();
    if (body?.action === "lineup") {
      const ids = Array.isArray(body.cardIds) ? body.cardIds.map(Number) : [];
      const result = await saveLineup(userId, ids);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, lineup: result.lineup, band: result.band });
    }
    if (body?.action === "attack") {
      const targetUserId = Number(body.targetUserId);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        return NextResponse.json({ error: "Must provide targetUserId" }, { status: 400 });
      }
      const result = await attackLineup(userId, targetUserId);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Crew battles action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
