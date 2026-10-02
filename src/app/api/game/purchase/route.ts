import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { purchasePlayer } from "@/actions/purchasePlayer";
import { purchaseSchema } from "@/lib/validators";
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
    const result = purchaseSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    const purchaseResult = await purchasePlayer(result.data.targetId, result.data.blockDurationHours);

    if (purchaseResult.error) {
      return NextResponse.json(
        { error: purchaseResult.error },
        { status: 400 }
      );
    }

    if (guard.viaAutopilot) {
      await noteAutopilotAction(userId, "purchase", { id: result.data.targetId });
    }

    return NextResponse.json(purchaseResult);
  } catch (error) {
    console.error("Purchase API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
