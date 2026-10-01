/**
 * BLUEPRINT ALBUMS — the collection/trading glue of the heist-city loop
 * (GAME_INTEGRATION_STUDY.md §5E, v1 2026-10-01).
 *
 * Gameplay actions drop city-blueprint fragments; five albums (one per
 * action family) complete into COSMETIC city props rendered on the shared 2D
 * map for everyone to see. Duplicates (count > 1) are the ONLY tradeable
 * thing in the game — player cards stay unique, preserving the poach
 * economy. No power rewards anywhere: props are pure derived visuals; the
 * mission ladder remains the progression spine.
 *
 * Drop sources (see blueprint-service for the hooks):
 *   acquire → residential · renovate → commercial · foreclose → industrial
 *   permit (mission) → civic (guaranteed) · vault raid → vault (charge-gated,
 *   the only legendary source).
 */

export type Rarity = "common" | "rare" | "epic" | "legendary";
export type BlueprintCategory = "residential" | "commercial" | "industrial" | "civic" | "vault";

export interface BlueprintDef {
  id: string;
  category: BlueprintCategory;
  rarity: Rarity;
  nameEn: string;
  nameZh: string;
}

export interface AlbumDef {
  id: BlueprintCategory;
  nameEn: string;
  nameZh: string;
  /** Cosmetic prop key rendered on the completed city's plot (map2d). */
  prop: "park" | "marquee" | "crane" | "rotunda" | "goldvault";
  propNameEn: string;
  propNameZh: string;
}

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  rare: 27,
  epic: 11,
  legendary: 2,
};

export const RARITY_LABEL: Record<Rarity, { en: string; zh: string }> = {
  common: { en: "Common", zh: "普通" },
  rare: { en: "Rare", zh: "稀有" },
  epic: { en: "Epic", zh: "史诗" },
  legendary: { en: "Legendary", zh: "传说" },
};

export const BLUEPRINTS: readonly BlueprintDef[] = [
  // residential (acquire)
  { id: "bp-resi-1", category: "residential", rarity: "common", nameEn: "Row House Plans", nameZh: "排屋图纸" },
  { id: "bp-resi-2", category: "residential", rarity: "common", nameEn: "Starter Duplex", nameZh: "起步复式" },
  { id: "bp-resi-3", category: "residential", rarity: "rare", nameEn: "Garden Walk", nameZh: "花园步道" },
  { id: "bp-resi-4", category: "residential", rarity: "rare", nameEn: "Terrace Tower", nameZh: "阶梯塔楼" },
  { id: "bp-resi-5", category: "residential", rarity: "epic", nameEn: "Skyline Penthouse", nameZh: "天际顶层" },
  // commercial (renovate)
  { id: "bp-comm-1", category: "commercial", rarity: "common", nameEn: "Kiosk Permits", nameZh: "售货亭许可" },
  { id: "bp-comm-2", category: "commercial", rarity: "common", nameEn: "Shopfront Revamp", nameZh: "店面改造" },
  { id: "bp-comm-3", category: "commercial", rarity: "rare", nameEn: "Glass Atrium", nameZh: "玻璃中庭" },
  { id: "bp-comm-4", category: "commercial", rarity: "rare", nameEn: "Grand Marquee", nameZh: "大张灯门面" },
  { id: "bp-comm-5", category: "commercial", rarity: "epic", nameEn: "Exchange Spire", nameZh: "交易所尖塔" },
  // industrial (foreclose)
  { id: "bp-ind-1", category: "industrial", rarity: "common", nameEn: "Workshop Shed", nameZh: "工棚" },
  { id: "bp-ind-2", category: "industrial", rarity: "common", nameEn: "Freight Yard", nameZh: "货场" },
  { id: "bp-ind-3", category: "industrial", rarity: "rare", nameEn: "Silo Row", nameZh: "筒仓列" },
  { id: "bp-ind-4", category: "industrial", rarity: "rare", nameEn: "Foundry Hall", nameZh: "铸造厅" },
  { id: "bp-ind-5", category: "industrial", rarity: "epic", nameEn: "Megafactory", nameZh: "巨型工厂" },
  // civic (permits — guaranteed drops, hence slightly deeper pool)
  { id: "bp-civic-1", category: "civic", rarity: "common", nameEn: "Bus Stop Blueprint", nameZh: "公交站图纸" },
  { id: "bp-civic-2", category: "civic", rarity: "common", nameEn: "Clinic Wing", nameZh: "诊所翼楼" },
  { id: "bp-civic-3", category: "civic", rarity: "rare", nameEn: "Library Rotunda", nameZh: "图书馆穹顶" },
  { id: "bp-civic-4", category: "civic", rarity: "rare", nameEn: "Courthouse Steps", nameZh: "法院台阶" },
  { id: "bp-civic-5", category: "civic", rarity: "epic", nameEn: "City Hall Dome", nameZh: "市政厅穹顶" },
  // vault (raids — the ONLY legendary source)
  { id: "bp-vault-1", category: "vault", rarity: "common", nameEn: "Lockpick Sketch", nameZh: "开锁草图" },
  { id: "bp-vault-2", category: "vault", rarity: "rare", nameEn: "Drill Rig Specs", nameZh: "钻机规格" },
  { id: "bp-vault-3", category: "vault", rarity: "epic", nameEn: "Vault Door Casting", nameZh: "金库门铸件" },
  { id: "bp-vault-4", category: "vault", rarity: "legendary", nameEn: "The Golden Vault", nameZh: "黄金金库" },
];

export const ALBUMS: readonly AlbumDef[] = [
  { id: "residential", nameEn: "Residential Album", nameZh: "住宅专辑", prop: "park", propNameEn: "Central Park", propNameZh: "中央公园" },
  { id: "commercial", nameEn: "Commercial Album", nameZh: "商业专辑", prop: "marquee", propNameEn: "Neon Marquee", propNameZh: "霓虹门楼" },
  { id: "industrial", nameEn: "Industrial Album", nameZh: "工业专辑", prop: "crane", propNameEn: "Crane Row", propNameZh: "吊车阵" },
  { id: "civic", nameEn: "Civic Album", nameZh: "公共专辑", prop: "rotunda", propNameEn: "City Rotunda", propNameZh: "市政圆厅" },
  { id: "vault", nameEn: "Heist Album", nameZh: "劫案专辑", prop: "goldvault", propNameEn: "Golden Vault Emblem", propNameZh: "黄金金库徽记" },
];

export const BLUEPRINTS_BY_ID: ReadonlyMap<string, BlueprintDef> = new Map(
  BLUEPRINTS.map((b) => [b.id, b])
);

export function blueprintName(id: string, locale: "en" | "zh"): string {
  const def = BLUEPRINTS_BY_ID.get(id);
  if (!def) return id;
  return locale === "zh" ? def.nameZh : def.nameEn;
}

export function albumById(id: BlueprintCategory): AlbumDef {
  const a = ALBUMS.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown album ${id}`);
  return a;
}

// ── pure helpers (unit-tested) ──

export type Inventory = Map<string, number>;

export function albumBlueprints(category: BlueprintCategory): BlueprintDef[] {
  return BLUEPRINTS.filter((b) => b.category === category);
}

/** Is the album complete (≥1 of every blueprint in the category)? */
export function albumComplete(inv: Inventory, category: BlueprintCategory): boolean {
  return albumBlueprints(category).every((b) => (inv.get(b.id) ?? 0) >= 1);
}

/** Prop keys for every completed album (drives the map + payload). */
export function completedProps(inv: Inventory): AlbumDef["prop"][] {
  return ALBUMS.filter((a) => albumComplete(inv, a.id)).map((a) => a.prop);
}

/** Duplicates ownable for trade: ids with count > 1. */
export function tradeableDuplicates(inv: Inventory): { id: string; count: number }[] {
  return [...inv.entries()].filter(([, n]) => n > 1).map(([id, count]) => ({ id, count }));
}

/**
 * Resolve a drop: category roll + rarity roll. `roll` is a uniform [0,1)
 * pair injected for testability — production passes crypto randomness.
 * Returns null when the action simply doesn't drop (dropChance gate).
 */
export function rollDrop(
  category: BlueprintCategory,
  roll: [number, number]
): string | null {
  const pool = albumBlueprints(category);
  const [rarityRoll, itemRoll] = roll;
  // Rarity: filter to the category's available rarities, weighted.
  const rarities = [...new Set(pool.map((b) => b.rarity))] as Rarity[];
  const total = rarities.reduce((s, r) => s + RARITY_WEIGHTS[r], 0);
  let acc = 0;
  let picked: Rarity = rarities[0];
  for (const r of rarities) {
    acc += RARITY_WEIGHTS[r] / total;
    if (rarityRoll < acc) {
      picked = r;
      break;
    }
  }
  const inRarity = pool.filter((b) => b.rarity === picked);
  const idx = Math.min(inRarity.length - 1, Math.floor(itemRoll * inRarity.length));
  return inRarity[idx].id;
}

/**
 * One-time backfill from historical action counts (so veterans start with a
 * starter album instead of an empty grid). Common-heavy, capped.
 */
export function backfillGrant(
  historicalCounts: Partial<Record<BlueprintCategory, number>>,
  cap = 30
): { id: string; count: number }[] {
  const grant = new Map<string, number>();
  let total = 0;
  const order: BlueprintCategory[] = ["residential", "commercial", "industrial", "civic", "vault"];
  for (const cat of order) {
    const actions = historicalCounts[cat] ?? 0;
    let frags = Math.floor(actions / 8);
    if (frags <= 0) continue;
    const pool = albumBlueprints(cat);
    // Fill commons first, then rares — a taste of the set, never the epic/legendary.
    const fillOrder = [
      ...pool.filter((b) => b.rarity === "common"),
      ...pool.filter((b) => b.rarity === "rare"),
    ];
    let i = 0;
    while (frags > 0 && total < cap) {
      const def = fillOrder[i % fillOrder.length];
      grant.set(def.id, (grant.get(def.id) ?? 0) + 1);
      frags--;
      total++;
      i++;
    }
    if (total >= cap) break;
  }
  return [...grant.entries()].map(([id, count]) => ({ id, count }));
}
