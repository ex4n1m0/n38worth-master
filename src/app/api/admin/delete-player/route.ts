import { NextResponse } from "next/server";
import { adminDeletePlayer } from "@/actions/adminDeletePlayer";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = Number(body?.targetUserId);
    const result = await adminDeletePlayer(targetUserId);

    if ("error" in result) {
      const status =
        result.error === "Forbidden" ? 403 :
        result.error === "Unauthorized" ? 401 :
        result.error === "Player not found" ? 404 :
        400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Admin delete-player API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
