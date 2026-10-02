import { blockSell } from "@/actions/blockSell";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { guardGameAction, noteAutopilotAction } from "@/lib/autopilot/guard";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = Number(session.user.id);

    const guard = await guardGameAction(request, userId);
    if (guard.blocked) return guard.response;

    const body = await request.json();
    const { ownershipId } = body;

    if (!ownershipId || typeof ownershipId !== "number") {
      return NextResponse.json({ error: "Invalid ownershipId" }, { status: 400 });
    }

    const result = await blockSell(ownershipId);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (guard.viaAutopilot) {
      await noteAutopilotAction(userId, "blocksell", { id: ownershipId });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Blocksell API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
