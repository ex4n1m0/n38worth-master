import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMassHireCooldownEnd, MASS_HIRE_COOLDOWN_MS } from "@/lib/mass-hire";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const buyerId = Number(session.user.id);
    const cooldownEnd = await getMassHireCooldownEnd(buyerId);

    return NextResponse.json({
      cooldownEndsAt: cooldownEnd, // epoch seconds
      cooldownMs: MASS_HIRE_COOLDOWN_MS,
      onCooldown: cooldownEnd > Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    console.error("Mass Hire status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
