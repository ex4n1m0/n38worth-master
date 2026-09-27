import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admins";
import { db } from "@/db";
import { users, ownership, transactions, messages } from "@/db/schema";
import { sql } from "drizzle-orm";

// TH-00 hotfix (2026-09-26): this route previously had NO auth gate — an
// unauthenticated POST wiped the whole game. Admin-only now, per the
// code-allowlist in src/lib/admins.ts.
export async function POST() {
  const session = await auth();
  if (!isAdminUser(session?.user?.name)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Delete in order due to foreign key constraints
    // Skip protected users (e.g., goddesses)
    await db.delete(messages);
    await db.delete(transactions);
    await db.delete(ownership);
    await db.delete(users).where(sql`${users.isProtected} = 0`);

    return NextResponse.json({ success: true, message: "All game data deleted (protected users preserved)" });
  } catch (error) {
    console.error("Reset error:", error);
    return NextResponse.json({ error: "Failed to reset game" }, { status: 500 });
  }
}
