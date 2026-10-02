import { describe, it, expect } from "vitest";
import { layoutCity, type WorldCity, type WorldBuilding } from "@/lib/city/map2d/layout";
import { planStreets, STREET_WIDTH, type StreetRun } from "@/lib/city/map2d/streets";

function b(id: number): WorldBuilding {
  return { id, u: `card_${id}`, f: 0, t: 5, p: null };
}
function city(count: number, props: string[] = [], landmarks = 0): WorldCity {
  return {
    username: "player",
    profession: null,
    ownedCount: count,
    hqStage: 1,
    landmarks: Array.from({ length: landmarks }, (_, i) => `goddess_${i}`),
    buildings: Array.from({ length: count }, (_, i) => b(i)),
    props,
  };
}

/** Runs as a comparable set of "axis:at:from-to" strings. */
function tag(runs: StreetRun[], axis: string): string[] {
  return runs.map((r) => `${axis}${r.at}:${r.from}-${r.to}`).sort();
}

describe("planStreets — roads around every building (NET-F, 2026-10-02)", () => {
  it("frames a lone building fully (4 sides) plus the HQ core block", () => {
    // One building → first ring-3 cell (-3,-3) (the walk starts at the
    // top-left corner), nothing else built.
    const plan = planStreets(layoutCity(city(1)));
    // Vertical: the building's boundaries at -3.5/-2.5 (y=-3..-3) and the
    // core's outer edges at ±1.5 (y=-1..1).
    expect(tag(plan.v, "v")).toEqual(["v-1.5:-1-1", "v-2.5:-3--3", "v-3.5:-3--3", "v1.5:-1-1"]);
    expect(tag(plan.h, "h")).toEqual(["h-1.5:-1-1", "h-2.5:-3--3", "h-3.5:-3--3", "h1.5:-1-1"]);
  });

  it("adjacent buildings SHARE one road between them (never doubled)", () => {
    // 5 buildings fill ring-3 top-row cells (-3,-3)..(1,-3).
    const plan = planStreets(layoutCity(city(5)));
    // The whole row is framed by ONE merged horizontal run per side (not 5
    // unit strips).
    expect(plan.h).toContainEqual({ at: -3.5, from: -3, to: 1 });
    expect(plan.h).toContainEqual({ at: -2.5, from: -3, to: 1 });
    // Every interior boundary line crosses the row exactly ONCE — a single
    // shared road between neighbors, never one per building side.
    for (const at of [-2.5, -1.5, -0.5, 0.5]) {
      const row = plan.v.filter((r) => r.at === at && r.from <= -3 && r.to >= -3);
      expect(row).toHaveLength(1);
      expect(row[0].from).toBe(-3);
      expect(row[0].to).toBe(-3);
    }
  });

  it("empty city (0 buildings/props/landmarks) frames ONLY the HQ core", () => {
    const plan = planStreets(layoutCity(city(0)));
    expect(tag(plan.v, "v")).toEqual(["v-1.5:-1-1", "v1.5:-1-1"]);
    expect(tag(plan.h, "h")).toEqual(["h-1.5:-1-1", "h1.5:-1-1"]);
  });

  it("suppresses the HQ core's interior boundaries (one superblock)", () => {
    // Full ring 3 (24 buildings): the lines at ±0.5 DO carry roads where ring
    // buildings sit (y=±3 columns/x=±3 rows) but NEVER cross the core rows.
    const plan = planStreets(layoutCity(city(24)));
    for (const r of [...plan.v.filter((r) => r.at === -0.5 || r.at === 0.5),
                      ...plan.h.filter((r) => r.at === -0.5 || r.at === 0.5)]) {
      expect(r.to < -1 || r.from > 1).toBe(true);
    }
    // The ring-3 perimeter is fully framed (merged outer runs).
    expect(plan.h).toContainEqual({ at: -3.5, from: -3, to: 3 });
    expect(plan.h).toContainEqual({ at: 3.5, from: -3, to: 3 });
    expect(plan.v).toContainEqual({ at: -3.5, from: -3, to: 3 });
    expect(plan.v).toContainEqual({ at: 3.5, from: -3, to: 3 });
  });

  it("no road where neither side is built (empty arcs/rings stay clean)", () => {
    // 30 buildings: ring 3 full (24) + 6 on ring 4's top row — nothing is
    // built in ring 4's right column (x=4), so the line right of it (x=4.5)
    // derives no road, while ring 3's outer line (x=3.5) is one full run.
    const layout = layoutCity(city(30));
    expect(layout.radius).toBe(4);
    const plan = planStreets(layout);
    expect(plan.v.filter((r) => r.at === 4.5)).toHaveLength(0);
    expect(plan.v.filter((r) => r.at === 3.5)).toEqual([{ at: 3.5, from: -3, to: 3 }]);
    // The ring-4 partial row gets its own outer perimeter at y=-4.5.
    expect(plan.h).toContainEqual({ at: -4.5, from: -4, to: 1 });
  });

  it("frames album-prop cells like buildings", () => {
    const plan = planStreets(layoutCity(city(0, ["park"])));
    // park claims its fixed ring-3 cell (0,-3) — its four boundaries appear.
    expect(plan.v).toContainEqual({ at: -0.5, from: -3, to: -3 });
    expect(plan.v).toContainEqual({ at: 0.5, from: -3, to: -3 });
    expect(plan.h).toContainEqual({ at: -3.5, from: 0, to: 0 });
    expect(plan.h).toContainEqual({ at: -2.5, from: 0, to: 0 });
  });

  it("frames Founder-landmark slots (moat cells count as built)", () => {
    const plan = planStreets(layoutCity(city(0, [], 2)));
    // landmark slot 0 is (0,-2): its left/right boundaries at ±0.5.
    expect(plan.v).toContainEqual({ at: -0.5, from: -2, to: -2 });
    expect(plan.v).toContainEqual({ at: 0.5, from: -2, to: -2 });
  });

  it("is deterministic and rides boundary lines only (never paves a cell)", () => {
    const a = planStreets(layoutCity(city(60, ["park", "crane"], 3)));
    const b2 = planStreets(layoutCity(city(60, ["park", "crane"], 3)));
    expect(a).toEqual(b2);
    // Roads sit on half-integer boundary lines — a run's strip can never
    // cover a cell center, so no building/prop/landmark cell is paved.
    for (const r of [...a.v, ...a.h]) expect(Math.abs(r.at % 1)).toBe(0.5);
    expect(STREET_WIDTH).toBeLessThan(1);
  });
});
