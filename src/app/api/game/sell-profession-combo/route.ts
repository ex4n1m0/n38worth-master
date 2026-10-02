import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sellProfessionCombo } from "@/actions/sellProfessionCombo";
import { guardGameAction, noteAutopilotAction } from "@/lib/autopilot/guard";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = Number(session.user.id);

    const guard = await guardGameAction(req, userId);
    if (guard.blocked) return guard.response;

    const body = await req.json();
    const { playerIds } = body;

    if (!Array.isArray(playerIds) || playerIds.length !== 6) {
      return NextResponse.json(
        { error: "Exactly 6 player IDs are required" },
        { status: 400 }
      );
    }

    if (!playerIds.every((id: unknown) => typeof id === "number" && Number.isFinite(id) && id > 0)) {
      return NextResponse.json(
        { error: "All player IDs must be valid positive numbers" },
        { status: 400 }
      );
    }

    const result = await sellProfessionCombo(playerIds);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (guard.viaAutopilot) {
      await noteAutopilotAction(userId, "sell_combo");
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Sell profession combo API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}