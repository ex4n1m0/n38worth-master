import { pgTable, serial, integer, timestamp, doublePrecision, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Vault Raid layer (2026-10-01, GAME_INTEGRATION_STUDY §5A).
 *
 * raid_state is the per-player energy row: charges accrue lazily (no cron —
 * computed from next_charge_at whenever the row is read) and revenge grants
 * may push charges one above the normal cap. raid_log is the audit trail for
 * every executed raid (loot breakdown + lock rolls) — read-only history, the
 * economy writes happen against users.credits inside the raid service.
 */
export const raidState = pgTable(
  "raid_state",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    charges: integer("charges").default(3).notNull(),
    nextChargeAt: timestamp("next_charge_at").defaultNow().notNull(),
    // Anti revenge-farming: a victim earns at most ONE revenge charge per
    // window (see REVENGE_GRANT_COOLDOWN_MS in src/lib/raid.ts).
    lastRevengeAt: timestamp("last_revenge_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_raid_state_user").on(table.userId),
  ]
);

export const raidLog = pgTable(
  "raid_log",
  {
    id: serial("id").primaryKey(),
    attackerId: integer("attacker_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    victimId: integer("victim_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    // How many of the 3 vault locks the attacker cracked (0..3).
    locksCracked: integer("locks_cracked").notNull(),
    // Total credited to the attacker (pool + victim share, × multiplier).
    lootCredits: doublePrecision("loot_credits").notNull(),
    // Minted component — bounded by the attacker's own portfolio.
    poolCredits: doublePrecision("pool_credits").notNull(),
    // Stolen component — actually debited from the victim's liquid credits.
    victimCredits: doublePrecision("victim_credits").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_raid_log_attacker").on(table.attackerId, table.createdAt),
    index("idx_raid_log_victim").on(table.victimId, table.createdAt),
  ]
);
