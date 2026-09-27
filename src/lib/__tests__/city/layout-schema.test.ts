import { describe, it, expect } from "vitest";
import {
  GRID_SIZE,
  MAX_BATCH,
  MAX_COORD,
  ROTATIONS,
  SECTOR_KEYS,
  VARIANTS,
  invalidReason,
  layoutPatchSchema,
} from "@/lib/city/layout-schema";
import { MISSIONS } from "@/lib/missions-data";

function placement(overrides: Record<string, unknown> = {}) {
  return { cardId: 42, sector: "s0", x: 5, y: 7, rotation: 0, variant: 0, ...overrides };
}

function patch(overrides: Record<string, unknown> = {}) {
  return { baseVersion: 0, placements: [placement()], ...overrides };
}

describe("layout constants", () => {
  it("derives the sector whitelist from the mission ladder (Boot + one per mission)", () => {
    expect(MISSIONS.length).toBe(8);
    expect(SECTOR_KEYS).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]);
    expect(SECTOR_KEYS).toHaveLength(MISSIONS.length + 1);
  });

  it("bounds the grid, batch, rotations and variants", () => {
    expect(GRID_SIZE).toBe(32);
    expect(MAX_COORD).toBe(31);
    expect(MAX_BATCH).toBe(32);
    expect(ROTATIONS).toEqual([0, 1, 2, 3]);
    expect(VARIANTS).toEqual([0, 1, 2, 3]);
  });
});

describe("layoutPatchSchema accept", () => {
  it("accepts a minimal valid patch and defaults rotation/variant to 0", () => {
    const parsed = layoutPatchSchema.safeParse({
      baseVersion: 3,
      placements: [{ cardId: 1, sector: "s3", x: 0, y: 31 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.placements[0]).toEqual({
        cardId: 1,
        sector: "s3",
        x: 0,
        y: 31,
        rotation: 0,
        variant: 0,
      });
      expect(parsed.data.removedCardIds).toBeUndefined();
    }
  });

  it("accepts a full-size batch with removals", () => {
    const placements = Array.from({ length: MAX_BATCH }, (_, i) => ({
      cardId: i + 1,
      sector: `s${i % SECTOR_KEYS.length}`,
      x: i % GRID_SIZE,
      y: Math.floor(i / GRID_SIZE),
      rotation: i % 4,
      variant: (i + 1) % 4,
    }));
    const parsed = layoutPatchSchema.safeParse({
      baseVersion: 0,
      placements,
      removedCardIds: [999, 1000],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("layoutPatchSchema reject (adversarial payloads, TH-04)", () => {
  const rejects = (body: unknown) =>
    expect(layoutPatchSchema.safeParse(body).success).toBe(false);

  it("rejects missing/invalid baseVersion", () => {
    rejects({ placements: [placement()] });
    rejects({ baseVersion: -1, placements: [placement()] });
    rejects({ baseVersion: 1.5, placements: [placement()] });
    rejects({ baseVersion: "0", placements: [placement()] });
    rejects({ baseVersion: 2 ** 31, placements: [placement()] }); // > INTEGER
  });

  it("rejects non-integer / out-of-range coordinates", () => {
    rejects(patch({ placements: [placement({ x: -1 })] }));
    rejects(patch({ placements: [placement({ y: GRID_SIZE })] }));
    rejects(patch({ placements: [placement({ x: MAX_COORD + 1 })] }));
    rejects(patch({ placements: [placement({ x: 1.5 })] }));
    rejects(patch({ placements: [placement({ y: 2 ** 31 })] }));
    rejects(patch({ placements: [placement({ x: "5" })] }));
    rejects(patch({ placements: [placement({ x: NaN })] }));
  });

  it("rejects SQL-injection-shaped and unknown sector values", () => {
    rejects(patch({ placements: [placement({ sector: "1; DROP TABLE users" })] }));
    rejects(patch({ placements: [placement({ sector: "s9" })] })); // ladder is 8 → s0..s8
    rejects(patch({ placements: [placement({ sector: "S0" })] })); // case-sensitive
    rejects(patch({ placements: [placement({ sector: "" })] }));
    rejects(patch({ placements: [placement({ sector: 0 })] }));
  });

  it("rejects bad cardIds", () => {
    rejects(patch({ placements: [placement({ cardId: 0 })] }));
    rejects(patch({ placements: [placement({ cardId: -3 })] }));
    rejects(patch({ placements: [placement({ cardId: "1; DROP TABLE ownership" })] }));
    rejects(patch({ placements: [placement({ cardId: 2 ** 40 })] })); // > INTEGER
  });

  it("rejects bad rotation/variant", () => {
    rejects(patch({ placements: [placement({ rotation: 4 })] }));
    rejects(patch({ placements: [placement({ rotation: -1 })] }));
    rejects(patch({ placements: [placement({ variant: 4 })] }));
    rejects(patch({ placements: [placement({ variant: 0.5 })] }));
  });

  it("rejects empty and oversized arrays", () => {
    rejects(patch({ placements: [] }));
    rejects(
      patch({
        placements: Array.from({ length: MAX_BATCH + 1 }, (_, i) =>
          placement({ cardId: i + 1, x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE) })
        ),
      })
    );
    // 10k-element array: shape cap fires long before any DB contact.
    rejects(
      patch({
        placements: Array.from({ length: 10_000 }, (_, i) =>
          placement({ cardId: i + 1, x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE) })
        ),
      })
    );
    rejects(
      patch({
        placements: [placement()],
        removedCardIds: Array.from({ length: MAX_BATCH + 1 }, (_, i) => 5000 + i),
      })
    );
  });

  it("rejects duplicate cardIds and duplicate tiles within placements", () => {
    rejects(
      patch({
        placements: [placement(), placement({ x: 6 })], // same cardId twice
      })
    );
    rejects(
      patch({
        placements: [placement({ cardId: 1 }), placement({ cardId: 2 })], // same tile
      })
    );
    rejects(
      patch({
        placements: [
          placement({ cardId: 1, sector: "s2" }),
          placement({ cardId: 2, sector: "s2" }),
        ],
      })
    );
  });

  it("rejects overlap between placements and removedCardIds", () => {
    rejects(
      patch({
        placements: [placement({ cardId: 7 })],
        removedCardIds: [7],
      })
    );
  });

  it("rejects duplicate ids inside removedCardIds, non-array bodies, and unknown keys", () => {
    rejects(patch({ placements: [placement()], removedCardIds: [9, 9] }));
    rejects(null);
    rejects(undefined);
    rejects("1; DROP TABLE city_layout");
    rejects([1, 2, 3]);
    rejects(patch({ placements: [placement()], extra: "nope" })); // strict
    rejects(patch({ placements: [placement({ evil: true })] })); // strict
  });
});

describe("invalidReason", () => {
  it("returns null for a valid, unlocked placement", () => {
    expect(invalidReason(placement(), 1)).toBeNull();
    expect(invalidReason(placement({ sector: "s3" }), 4)).toBeNull();
    expect(invalidReason({ ...placement(), rotation: undefined, variant: undefined }, 1)).toBeNull();
  });

  it("reports locked sectors against the unlocked count", () => {
    expect(invalidReason(placement({ sector: "s1" }), 1)).toBe("Sector not unlocked");
    expect(invalidReason(placement({ sector: "s8" }), 9)).toBeNull(); // all 9 open
    expect(invalidReason(placement({ sector: "s8" }), 8)).toBe("Sector not unlocked");
  });

  it("reports unknown sectors and bad coordinates/rotation/variant", () => {
    expect(invalidReason({ sector: "s99", x: 0, y: 0 }, 9)).toBe("Unknown sector");
    expect(invalidReason({ sector: 1, x: 0, y: 0 }, 9)).toBe("Invalid sector");
    expect(invalidReason({ sector: "s0", x: -1, y: 0 }, 9)).toBe("x out of range");
    expect(invalidReason({ sector: "s0", x: 0, y: 32 }, 9)).toBe("y out of range");
    expect(invalidReason({ sector: "s0", x: 0.5, y: 0 }, 9)).toBe("Invalid x");
    expect(invalidReason({ sector: "s0", x: "0", y: 0 }, 9)).toBe("Invalid x");
    expect(invalidReason({ sector: "s0", x: 0, y: 0, rotation: 9 }, 9)).toBe("Invalid rotation");
    expect(invalidReason({ sector: "s0", x: 0, y: 0, variant: -1 }, 9)).toBe("Invalid variant");
  });
});
