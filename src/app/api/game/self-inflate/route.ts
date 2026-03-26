import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Self-inflate has been removed from the game" },
    { status: 410 }
  );
}
