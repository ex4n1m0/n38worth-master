import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProfessionPerks } from "@/lib/professionPerks";
import { PROFESSION_PERKS } from "@/lib/professions";

/** Returns the caller's active profession perks. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = parseInt(session.user.id);
    const active = await getProfessionPerks(userId);

    return NextResponse.json({
      activeProfessions: Array.from(active),
      perks: Array.from(active).map((profession) => ({
        profession,
        ...PROFESSION_PERKS[profession],
      })),
    });
  } catch (error) {
    console.error("Profession perks API error:", error);
    return NextResponse.json({ error: "Failed to fetch perks" }, { status: 500 });
  }
}
