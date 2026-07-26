import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BONUS_CARD_COOLDOWN_MS, getAllBonusCooldownEnds } from "@/lib/card-cooldowns";

/**
 * Cooldown status for the three pinned bonus cards (Mass Hire, 10 Slots,
 * Reveal) in a single request. All timestamps are epoch SECONDS.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ends = await getAllBonusCooldownEnds(Number(session.user.id));
    const nowSec = Math.floor(Date.now() / 1000);

    return NextResponse.json({
      cooldownMs: BONUS_CARD_COOLDOWN_MS,
      massHire: { endsAt: ends.massHire, onCooldown: ends.massHire > nowSec },
      slots: { endsAt: ends.slots, onCooldown: ends.slots > nowSec },
      reveal: { endsAt: ends.reveal, onCooldown: ends.reveal > nowSec },
    });
  } catch (error) {
    console.error("Bonus cooldowns error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
