import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { executeMassHire } from "@/lib/mass-hire";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const buyerId = Number(session.user.id);
    const result = await executeMassHire(buyerId);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Mass Hire API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
