import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership, transactions, messages } from "@/db/schema";

export async function POST() {
  try {
    // Delete in order due to foreign key constraints
    await db.delete(messages);
    await db.delete(transactions);
    await db.delete(ownership);
    await db.delete(users);

    return NextResponse.json({ success: true, message: "All game data deleted" });
  } catch (error) {
    console.error("Reset error:", error);
    return NextResponse.json({ error: "Failed to reset game" }, { status: 500 });
  }
}
