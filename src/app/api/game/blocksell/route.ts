import { blockSell } from "@/actions/blockSell";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ownershipId } = body;

    if (!ownershipId || typeof ownershipId !== "number") {
      return NextResponse.json({ error: "Invalid ownershipId" }, { status: 400 });
    }

    const result = await blockSell(ownershipId);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Blocksell API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}