import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { rewardHistory } from "@/db/schema";
import { eq, and, gte, gt } from "drizzle-orm";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "24h"; // '24h' | '7d' | 'all'

  try {
    // Calculate cutoff date based on period
    let cutoffDate: Date | null = null;
    const now = new Date();

    if (period === "24h") {
      cutoffDate = new Date(now.getTime() - DAY_MS);
    } else if (period === "7d") {
      cutoffDate = new Date(now.getTime() - 7 * DAY_MS);
    }
    // 'all' => no cutoff

    // Query boss tax entries from reward history (only positive amounts = income received)
    const conditions = cutoffDate
      ? and(
          eq(rewardHistory.userId, userId),
          eq(rewardHistory.type, "boss_portfolio_tax"),
          gt(rewardHistory.amount, 0),
          gte(rewardHistory.createdAt, cutoffDate)
        )
      : and(
          eq(rewardHistory.userId, userId),
          eq(rewardHistory.type, "boss_portfolio_tax"),
          gt(rewardHistory.amount, 0)
        );

    const portfolioTaxRows = await db
      .select({
        amount: rewardHistory.amount,
        details: rewardHistory.details,
      })
      .from(rewardHistory)
      .where(conditions);

    // Query no-income tax entries (only positive amounts = income received)
    const noIncomeConditions = cutoffDate
      ? and(
          eq(rewardHistory.userId, userId),
          eq(rewardHistory.type, "boss_no_income_tax"),
          gt(rewardHistory.amount, 0),
          gte(rewardHistory.createdAt, cutoffDate)
        )
      : and(
          eq(rewardHistory.userId, userId),
          eq(rewardHistory.type, "boss_no_income_tax"),
          gt(rewardHistory.amount, 0)
        );

    const noIncomeTaxRows = await db
      .select({
        amount: rewardHistory.amount,
        details: rewardHistory.details,
      })
      .from(rewardHistory)
      .where(noIncomeConditions);

    // Calculate totals
    const portfolioTax = portfolioTaxRows.reduce((sum, row) => sum + Number(row.amount), 0);
    const noIncomeTax = noIncomeTaxRows.reduce((sum, row) => sum + Number(row.amount), 0);
    const totalIncome = portfolioTax + noIncomeTax;

    // Count unique contributing players from details JSON
    const contributingPlayerIds = new Set<string>();

    for (const row of portfolioTaxRows) {
      if (row.details) {
        try {
          const details = JSON.parse(row.details);
          if (details.fromPlayerId) {
            contributingPlayerIds.add(String(details.fromPlayerId));
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    for (const row of noIncomeTaxRows) {
      if (row.details) {
        try {
          const details = JSON.parse(row.details);
          if (details.fromPlayerId) {
            contributingPlayerIds.add(String(details.fromPlayerId));
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return NextResponse.json({
      totalIncome,
      portfolioTax,
      noIncomeTax,
      contributingPlayers: contributingPlayerIds.size,
      period,
    });
  } catch (error) {
    console.error("Boss income fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch boss income" },
      { status: 500 }
    );
  }
}
