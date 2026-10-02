import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { executeMassHire } from "@/lib/mass-hire";
import { guardGameAction, noteAutopilotAction } from "@/lib/autopilot/guard";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const buyerId = Number(session.user.id);

    const guard = await guardGameAction(req, buyerId);
    if (guard.blocked) return guard.response;

    const result = await executeMassHire(buyerId);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (guard.viaAutopilot) {
      await noteAutopilotAction(buyerId, "mass_hire");
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Mass Hire API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
