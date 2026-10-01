import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelBounty } from "@/lib/bounties";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Must provide bounty id" }, { status: 400 });
    }
    const result = await cancelBounty(parseInt(session.user.id), id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Bounty cancel error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
