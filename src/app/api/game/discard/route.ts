import { NextResponse } from "next/server";
import { sellPlayer } from "@/actions/discardPlayer";
import { discardSchema } from "@/lib/validators";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = discardSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    const sellResult = await sellPlayer(result.data.otherId);

    if (sellResult.error) {
      return NextResponse.json(
        { error: sellResult.error },
        { status: 400 }
      );
    }

    return NextResponse.json(sellResult);
  } catch (error) {
    console.error("Sell API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
