import { NextResponse } from "next/server";
import { discardAllPlayers } from "@/actions/discardAllPlayers";

export async function POST() {
  try {
    const result = await discardAllPlayers();

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Discard all API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
