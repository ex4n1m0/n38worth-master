import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBountyBoard, getMyBounties, createBounty, isBountyType } from "@/lib/bounties";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [board, mine] = await Promise.all([
      getBountyBoard(),
      getMyBounties(parseInt(session.user.id)),
    ]);
    return NextResponse.json({ board, mine }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Bounty board error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { type, targetUsername, reward } = body ?? {};
    if (!isBountyType(type)) {
      return NextResponse.json({ error: "Invalid bounty type" }, { status: 400 });
    }
    if (typeof targetUsername !== "string") {
      return NextResponse.json({ error: "Must provide targetUsername" }, { status: 400 });
    }
    const result = await createBounty(
      parseInt(session.user.id),
      type,
      targetUsername,
      Number(reward)
    );
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Bounty create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
