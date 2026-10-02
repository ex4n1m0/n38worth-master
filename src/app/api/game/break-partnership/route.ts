import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { breakPartnershipCore } from "@/lib/purchaseCore";
import { guardGameAction, noteAutopilotAction } from "@/lib/autopilot/guard";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const buyerId = parseInt(session.user.id);

  const guard = await guardGameAction(req, buyerId);
  if (guard.blocked) return guard.response;

  try {
    const { targetId } = await req.json();

    if (!targetId || typeof targetId !== "number") {
      return NextResponse.json({ error: "Invalid target player" }, { status: 400 });
    }

    const result = await breakPartnershipCore(buyerId, targetId);

    if (result.error) {
      // Format the error message with proper currency notation for the API
      const status = result.error.includes("unbreakable") ? 403 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    if (guard.viaAutopilot) {
      await noteAutopilotAction(buyerId, "break", {
        id: targetId,
        username: result.targetUsername,
      });
    }

    return NextResponse.json({
      success: true,
      breakCost: result.breakCost,
      purchaseCost: result.purchaseCost,
      totalCost: result.totalCost,
      newValue: result.newValue,
      targetUsername: result.targetUsername,
      countdownStarted: result.countdownStarted,
    });
  } catch (error) {
    console.error("Break partnership error:", error);
    return NextResponse.json({ error: "Failed to break partnership" }, { status: 500 });
  }
}
