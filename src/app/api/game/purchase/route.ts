import { NextResponse } from "next/server";
import { purchasePlayer } from "@/actions/purchasePlayer";
import { purchaseSchema } from "@/lib/validators";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = purchaseSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    const purchaseResult = await purchasePlayer(result.data.targetId);

    if (purchaseResult.error) {
      return NextResponse.json(
        { error: purchaseResult.error },
        { status: 400 }
      );
    }

    return NextResponse.json(purchaseResult);
  } catch (error) {
    console.error("Purchase API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
