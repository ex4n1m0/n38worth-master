import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Mainframe City — persisted building placement (cosmetic only; see
 * MAINFRAME_CITY_RTS_PLAN §D6). Rows are orphans by design when ownership
 * is lost: every read path joins through `ownership` so orphaned rows are
 * invisible, and the layout write route lazily deletes them. FKs CASCADE
 * because the existing user-deletion flows enumerate FK tables manually
 * and don't know about this table.
 */
export const cityLayout = pgTable(
  "city_layout",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ownedPlayerId: integer("owned_player_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sectorKey: varchar("sector_key", { length: 8 }).notNull(),
    tileX: integer("tile_x").notNull(),
    tileY: integer("tile_y").notNull(),
    rotation: integer("rotation").notNull().default(0),
    variant: integer("variant").notNull().default(0),
    layoutVersion: integer("layout_version").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_city_layout_owner_avatar").on(t.ownerUserId, t.ownedPlayerId),
    uniqueIndex("idx_city_layout_owner_tile").on(
      t.ownerUserId,
      t.sectorKey,
      t.tileX,
      t.tileY
    ),
    index("idx_city_layout_owned_player").on(t.ownedPlayerId),
  ]
);

/** Per-owner layout epoch — single-row UPDATE on this table is the
 * compare-and-swap that replaces a transaction (neon-http has none). */
export const cityLayoutMeta = pgTable("city_layout_meta", {
  ownerUserId: integer("owner_user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  layoutVersion: integer("layout_version").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
