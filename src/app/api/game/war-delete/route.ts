import { NextResponse } from "next/server";
import { warDeletePlayer } from "@/actions/warDeletePlayer";

// Deleting an owned NPC spawns 2 fresh NPCs (Unsplash fetches + image
// compression), which can take a while — allow the full Pro-plan budget.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = Number(body?.targetUserId);
    if (!Number.isFinite(targetUserId)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result = await warDeletePlayer(targetUserId);

    if ("error" in result) {
      const status =
        result.error === "Unauthorized" ? 401 :
        result.error === "Requires the Goddess of War power" ? 403 :
        result.error === "Player not found" ? 404 :
        "cooldownUntil" in result ? 429 :
        400;
      return NextResponse.json(
        { error: result.error, ...("cooldownUntil" in result ? { cooldownUntil: result.cooldownUntil } : {}) },
        { status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("War delete API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
