import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { transactions, users } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

// A user id is visible if the user is an NPC or a human with avatar uploaded.
const visibleUserSql = (idCol: string) => sql.raw(
  `EXISTS (SELECT 1 FROM users u WHERE u.id = ${idCol} AND (u.is_npc = 1 OR (u.avatar_url IS NOT NULL AND u.avatar_completed = 1)))`
);

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  try {
    // Get all transactions from all players
    const txns = await db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        createdAt: transactions.createdAt,
        buyerId: transactions.buyerId,
        targetId: transactions.targetId,
      })
      .from(transactions)
      .where(sql`${visibleUserSql('"transactions"."buyer_id"')} AND ${visibleUserSql('"transactions"."target_id"')}`)
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);

    // Enrich with usernames
    const enrichedTxns = await Promise.all(
      txns.map(async (txn) => {
        const [buyer] = await db
          .select({ username: users.username, avatarUrl: users.avatarUrl })
          .from(users)
          .where(eq(users.id, txn.buyerId));

        const [target] = await db
          .select({ username: users.username, avatarUrl: users.avatarUrl })
          .from(users)
          .where(eq(users.id, txn.targetId));

        return {
          ...txn,
          buyer: buyer || { username: "Unknown", avatarUrl: null },
          target: target || { username: "Unknown", avatarUrl: null },
          isInitiator: txn.buyerId === userId,
        };
      })
    );

    return NextResponse.json({ transactions: enrichedTxns });
  } catch (error) {
    console.error("Transactions API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
