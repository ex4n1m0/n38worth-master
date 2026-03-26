import { blockSell } from "@/actions/blockSell";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { ownershipId } = body;

  if (!ownershipId || typeof ownershipId !== "number") {
    return NextResponse.json({ error: "ownershipId is required" }, { status: 400 });
  }

  const result = await blockSell(ownershipId);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
