import { describe, expect, it } from "vitest";
import {
  NEIGHBOR_BUILDING_LIMIT,
  NEIGHBOR_CITY_LIMIT,
  assembleCityNeighbors,
  type NeighborCandidate,
  type NeighborOwnedRow,
} from "@/lib/city/neighbors";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { makeCityFixture, makeFixtureNeighbors } from "@/lib/city/fixtures";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function candidate(
  cardId: number,
  username: string,
  extra: Partial<NeighborCandidate> = {}
): NeighborCandidate {
  return { cardId, username, profession: "Overclocker", isNpc: 1, ...extra };
}

function row(
  ownerId: number,
  cardId: number,
  username: string,
  extra: Partial<NeighborOwnedRow> = {}
): NeighborOwnedRow {
  return {
    ownerId,
    cardId,
    username,
    profession: "Zero-Day",
    playerValue: 10_000,
    valueFloor: 5_000,
    isNpc: 1,
    blockSellUntil: null,
    permBlockUntil: null,
    ownedByCityOwner: false,
    ...extra,
  };
}

describe("assembleCityNeighbors", () => {
  it("returns empty when no candidate owns visible cards", () => {
    const out = assembleCityNeighbors(
      [candidate(1, "a"), candidate(2, "b")],
      new Map(),
      [],
      "owner",
      NOW
    );
    expect(out).toEqual([]);
  });

  it("keeps candidates in arrival (value) order and caps at the city limit", () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      candidate(100 + i, `owner_${i}`)
    );
    const counts = new Map(candidates.map((c) => [c.cardId, 3]));
    const rows = candidates.flatMap((c) =>
      [1, 2, 3].map((k) => row(c.cardId, c.cardId * 10 + k, `b_${c.cardId}_${k}`))
    );
    const out = assembleCityNeighbors(candidates, counts, rows, "owner", NOW);
    expect(out).toHaveLength(NEIGHBOR_CITY_LIMIT);
    expect(out.map((n) => n.cardId)).toEqual(candidates.slice(0, NEIGHBOR_CITY_LIMIT).map((c) => c.cardId));
  });

  it("caps buildings per neighbor in value order and flags truncation", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row(7, 1000 + i, `b_${i}`, { playerValue: 30_000 - i * 100 })
    );
    const out = assembleCityNeighbors(
      [candidate(7, "rich")],
      new Map([[7, 30]]),
      rows,
      "owner",
      NOW
    );
    expect(out).toHaveLength(1);
    expect(out[0].buildings).toHaveLength(NEIGHBOR_BUILDING_LIMIT);
    expect(out[0].truncated).toBe(true);
    // Priciest first (canonical projection order).
    expect(out[0].buildings[0].value).toBe(30_000);
    expect(out[0].buildings[NEIGHBOR_BUILDING_LIMIT - 1].value).toBe(30_000 - (NEIGHBOR_BUILDING_LIMIT - 1) * 100);
  });

  it("never marks truncated when everything fits", () => {
    const out = assembleCityNeighbors(
      [candidate(1, "a")],
      new Map([[1, 2]]),
      [row(1, 11, "x"), row(1, 12, "y")],
      "owner",
      NOW
    );
    expect(out[0].buildings).toHaveLength(2);
    expect(out[0].truncated).toBe(false);
  });

  it("excludes goddesses as owners AND as buildings (landmark invariant)", () => {
    const out = assembleCityNeighbors(
      [candidate(1, GODDESS_USERNAMES[0]), candidate(2, "human")],
      new Map([
        [1, 5],
        [2, 5],
      ]),
      [
        // Goddess-owned rows attached to the HUMAN neighbor.
        row(2, 50, GODDESS_USERNAMES[1]),
        row(2, 51, "normal"),
      ],
      "owner",
      NOW
    );
    expect(out.map((n) => n.username)).toEqual(["human"]);
    expect(out[0].buildings.map((b) => b.username)).toEqual(["normal"]);
  });

  it("skips the city owner's own card inside a satellite", () => {
    const out = assembleCityNeighbors(
      [candidate(2, "x")],
      new Map([[2, 2]]),
      [row(2, 10, "owner"), row(2, 11, "someone")],
      "owner",
      NOW
    );
    expect(out[0].buildings.map((b) => b.username)).toEqual(["someone"]);
  });

  it("derives tier and protection exactly like the home orbit", () => {
    const future = new Date(NOW.getTime() + 60_000);
    const expired = new Date(NOW.getTime() - 60_000);
    const out = assembleCityNeighbors(
      [candidate(1, "a")],
      new Map([[1, 3]]),
      [
        row(1, 11, "tiered", { playerValue: 20_000, valueFloor: 5_000 }), // 4× → tier 3
        row(1, 12, "walled", { blockSellUntil: future }),
        row(1, 13, "stale", { blockSellUntil: expired, permBlockUntil: expired }),
      ],
      "owner",
      NOW
    );
    const [tiered, walled, stale] = out[0].buildings;
    expect(tiered.tier).toBe(3);
    expect(walled.protection).toBe("firewall");
    expect(stale.protection).toBeNull();
  });

  it("passes the co-ownership flag through for the steal UI", () => {
    const out = assembleCityNeighbors(
      [candidate(1, "a")],
      new Map([[1, 2]]),
      [row(1, 11, "mine", { ownedByCityOwner: true }), row(1, 12, "theirs")],
      "owner",
      NOW
    );
    expect(out[0].buildings.map((b) => b.ownedByCityOwner)).toEqual([true, false]);
  });

  it("drops a chosen candidate whose rows were all filtered out", () => {
    const out = assembleCityNeighbors(
      [candidate(1, "a"), candidate(2, "b")],
      new Map([
        [1, 1],
        [2, 1],
      ]),
      [row(2, 21, "only_b")], // a's single owned card is a goddess → filtered
      "owner",
      NOW
    );
    expect(out.map((n) => n.username)).toEqual(["b"]);
  });
});

describe("makeFixtureNeighbors (dev-only QA satellites)", () => {
  it("derives deterministic satellites from a fixture city", () => {
    const { ownedCards } = makeCityFixture(100, 42);
    const a = makeFixtureNeighbors(ownedCards);
    const b = makeFixtureNeighbors(makeCityFixture(100, 42).ownedCards);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    for (const neighbor of a) {
      expect(neighbor.buildings).toHaveLength(5);
      expect(neighbor.truncated).toBe(true);
      // Owners are fixture cards (never goddesses — landmark invariant).
      expect(GODDESS_USERNAMES).not.toContain(neighbor.username);
    }
    // Coverage flags: one firewall, one hard lock, one co-owned.
    const all = a.flatMap((n) => n.buildings);
    expect(all.some((x) => x.protection === "firewall")).toBe(true);
    expect(all.some((x) => x.protection === "hardlock")).toBe(true);
    expect(all.some((x) => x.ownedByCityOwner)).toBe(true);
    // Satellite card ids never collide with home-orbit ids (100k range).
    for (const x of all) {
      expect(x.cardId).toBeGreaterThanOrEqual(900_000);
    }
  });
});
