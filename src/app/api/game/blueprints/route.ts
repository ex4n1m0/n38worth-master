import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBlueprintView, proposeTrade, acceptTrade, declineTrade, cancelTrade } from "@/lib/blueprint-service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const view = await getBlueprintView(parseInt(session.user.id));
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Blueprint view error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = parseInt(session.user.id);
  try {
    const body = await request.json();
    const action = body?.action;
    if (action === "propose") {
      if (typeof body.toUsername !== "string" || typeof body.offerBp !== "string" || typeof body.requestBp !== "string") {
        return NextResponse.json({ error: "Missing trade fields" }, { status: 400 });
      }
      const result = await proposeTrade(userId, body.toUsername, body.offerBp, body.requestBp);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true });
    }
    const tradeId = Number(body?.tradeId);
    if (!Number.isInteger(tradeId) || tradeId <= 0) {
      return NextResponse.json({ error: "Must provide tradeId" }, { status: 400 });
    }
    if (action === "accept") {
      const result = await acceptTrade(userId, tradeId);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true });
    }
    if (action === "decline") {
      const result = await declineTrade(userId, tradeId);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true });
    }
    if (action === "cancel") {
      const result = await cancelTrade(userId, tradeId);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Blueprint trade error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
