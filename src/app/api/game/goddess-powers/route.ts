import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGoddessPowers } from "@/lib/goddess-powers";
import { getWarDeleteCooldownUntil } from "@/actions/warDeletePlayer";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = parseInt(session.user.id);
    const powers = await getGoddessPowers(userId);
    // War-delete cooldown rides along so every PlayerCard can disable its
    // War Delete button without an extra request.
    const warDeleteCooldownUntil = powers.hasWar
      ? await getWarDeleteCooldownUntil(userId)
      : null;
    return NextResponse.json({ ...powers, warDeleteCooldownUntil });
  } catch (error) {
    console.error("Goddess powers API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch goddess powers" },
      { status: 500 }
    );
  }
}
