import { pgTable, serial, integer, varchar, timestamp, jsonb, doublePrecision, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { BattleCard } from "@/lib/crew-battle";

/**
 * Crew Battles (2026-10-02, GAME_INTEGRATION_STUDY §5D) — the async
 * auto-battler. Three tables:
 *
 *  - crew_lineups: each player's ONE saved defense lineup, stored as a
 *    SNAPSHOT (cards + combat stats at save time). Attacks resolve against
 *    this ghost, never against live card changes.
 *  - crew_battles: full audit per attack (both lineups, seed, winner, log).
 *  - crew_battle_records: W/L, Elo rating, streak — the ladder source.
 */
export const crewLineups = pgTable(
  "crew_lineups",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    cards: jsonb("cards").$type<BattleCard[]>().notNull(),
    band: integer("band").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_crew_lineups_user").on(table.userId),
    index("idx_crew_lineups_band").on(table.band),
  ]
);

export const crewBattles = pgTable(
  "crew_battles",
  {
    id: serial("id").primaryKey(),
    attackerId: integer("attacker_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    defenderId: integer("defender_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    attackerCards: jsonb("attacker_cards").$type<BattleCard[]>().notNull(),
    defenderCards: jsonb("defender_cards").$type<BattleCard[]>().notNull(),
    seed: bigint("seed", { mode: "number" }).notNull(),
    winnerId: integer("winner_id").notNull(),
    rounds: integer("rounds").notNull(),
    log: jsonb("log").notNull(),
    fee: doublePrecision("fee").notNull(),
    prize: doublePrecision("prize").notNull(),
    defenseReward: doublePrecision("defense_reward").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_crew_battles_attacker").on(table.attackerId, table.createdAt),
    index("idx_crew_battles_defender").on(table.defenderId, table.createdAt),
  ]
);

export const crewBattleRecords = pgTable(
  "crew_battle_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    wins: integer("wins").default(0).notNull(),
    losses: integer("losses").default(0).notNull(),
    streak: integer("streak").default(0).notNull(), // +win streak, −loss streak
    rating: integer("rating").default(1000).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("idx_crew_battle_records_user").on(table.userId)]
);
