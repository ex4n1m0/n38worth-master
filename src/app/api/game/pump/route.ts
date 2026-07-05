import { pumpPlayer } from "@/actions/pumpPlayer";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ownershipId, targetId } = body;

    if (!ownershipId && !targetId) {
      return NextResponse.json({ error: "Must provide ownershipId or targetId" }, { status: 400 });
    }

    const result = await pumpPlayer({ ownershipId, targetId });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Pump API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}