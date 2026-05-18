import { NextResponse } from "next/server";
import { letGoPlayer } from "@/actions/letGoPlayer";

export async function POST(req: Request) {
  try {
    const { targetId } = await req.json();

    if (!targetId || typeof targetId !== "number") {
      return NextResponse.json(
        { error: "Invalid target player" },
        { status: 400 }
      );
    }

    const result = await letGoPlayer(targetId);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Let go API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
