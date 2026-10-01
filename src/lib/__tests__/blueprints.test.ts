import { describe, it, expect } from "vitest";
import {
  BLUEPRINTS,
  ALBUMS,
  BLUEPRINTS_BY_ID,
  RARITY_WEIGHTS,
  albumBlueprints,
  albumComplete,
  completedProps,
  tradeableDuplicates,
  rollDrop,
  backfillGrant,
  type Inventory,
} from "@/lib/blueprints";

describe("blueprint catalog integrity", () => {
  it("has unique ids and valid rarities/categories", () => {
    const ids = BLUEPRINTS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BLUEPRINTS) {
      expect(BLUEPRINTS_BY_ID.get(b.id)).toBeDefined();
      expect(RARITY_WEIGHTS[b.rarity]).toBeGreaterThan(0);
      expect(ALBUMS.some((a) => a.id === b.category)).toBe(true);
      expect(b.nameEn.length).toBeGreaterThan(0);
      expect(b.nameZh.length).toBeGreaterThan(0);
    }
  });

  it("legendary exists ONLY in the vault album (raids are the sole source)", () => {
    const legendary = BLUEPRINTS.filter((b) => b.rarity === "legendary");
    expect(legendary.length).toBe(1);
    expect(legendary[0].category).toBe("vault");
  });

  it("every album has items and a distinct prop", () => {
    const props = new Set(ALBUMS.map((a) => a.prop));
    expect(props.size).toBe(ALBUMS.length);
    for (const a of ALBUMS) expect(albumBlueprints(a.id).length).toBeGreaterThanOrEqual(4);
  });
});

describe("album completion", () => {
  const resi = albumBlueprints("residential");

  it("completes only with one of every blueprint in the album", () => {
    const partial: Inventory = new Map(resi.slice(0, 4).map((b) => [b.id, 1]));
    expect(albumComplete(partial, "residential")).toBe(false);
    const full: Inventory = new Map(resi.map((b) => [b.id, 1]));
    expect(albumComplete(full, "residential")).toBe(true);
  });

  it("derives props for completed albums only", () => {
    const inv: Inventory = new Map(resi.map((b) => [b.id, 2]));
    expect(completedProps(inv)).toEqual(["park"]);
    const vault = albumBlueprints("vault");
    const inv2: Inventory = new Map([...resi, ...vault].map((b) => [b.id, 1]));
    expect(new Set(completedProps(inv2))).toEqual(new Set(["park", "goldvault"]));
  });

  it("marks duplicates (count > 1) tradeable", () => {
    const inv: Inventory = new Map([
      [resi[0].id, 3],
      [resi[1].id, 1],
    ]);
    const dups = tradeableDuplicates(inv);
    expect(dups).toEqual([{ id: resi[0].id, count: 3 }]);
  });
});

describe("rollDrop", () => {
  it("always returns an id from the requested category", () => {
    for (let i = 0; i < 200; i++) {
      const id = rollDrop("vault", [i / 200, (i % 7) / 7]);
      expect(id).toBeTruthy();
      expect(BLUEPRINTS_BY_ID.get(id!)!.category).toBe("vault");
    }
  });

  it("respects rarity boundaries deterministically", () => {
    // vault pool: common(60) + rare(27) + epic(11) + legendary(2) → total 100
    expect(rollDrop("vault", [0.0, 0.0])).toBe("bp-vault-1"); // common
    expect(rollDrop("vault", [0.999, 0.999])).toBe("bp-vault-4"); // legendary
    const epic = rollDrop("vault", [0.9, 0.0]);
    expect(BLUEPRINTS_BY_ID.get(epic!)!.rarity).toBe("epic");
  });
});

describe("backfillGrant", () => {
  it("grants commons/rares only, spread across categories, capped", () => {
    const grant = backfillGrant({
      residential: 100,
      commercial: 40,
      industrial: 0,
      civic: 6,
      vault: 16,
    });
    const total = grant.reduce((s, g) => s + g.count, 0);
    expect(total).toBeLessThanOrEqual(30);
    expect(grant.length).toBeGreaterThan(0);
    for (const g of grant) {
      const def = BLUEPRINTS_BY_ID.get(g.id)!;
      expect(["common", "rare"]).toContain(def.rarity);
    }
    // no industrial grant when its count is 0
    expect(grant.every((g) => BLUEPRINTS_BY_ID.get(g.id)!.category !== "industrial")).toBe(true);
  });

  it("grants nothing for a fresh account", () => {
    expect(backfillGrant({})).toEqual([]);
  });
});
