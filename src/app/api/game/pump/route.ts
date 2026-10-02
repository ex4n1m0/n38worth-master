import { pumpPlayer } from "@/actions/pumpPlayer";
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
    const { ownershipId, targetId } = body;

    if (!ownershipId && !targetId) {
      return NextResponse.json({ error: "Must provide ownershipId or targetId" }, { status: 400 });
    }

    const result = await pumpPlayer({ ownershipId, targetId });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (guard.viaAutopilot) {
      await noteAutopilotAction(userId, "pump", {
        id: Number(ownershipId ?? targetId ?? 0) || undefined,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Pump API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
