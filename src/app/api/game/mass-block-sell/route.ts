import { massBlockSell } from "@/actions/massBlockSell";
import { NextResponse } from "next/server";

export async function POST() {
  const result = await massBlockSell();

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}