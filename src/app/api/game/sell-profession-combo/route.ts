import { NextResponse } from "next/server";
import { sellProfessionCombo } from "@/actions/sellProfessionCombo";

export async function POST(req: Request) {
  try {
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

    return NextResponse.json(result);
  } catch (error) {
    console.error("Sell profession combo API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}