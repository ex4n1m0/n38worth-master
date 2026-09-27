import { describe, expect, it } from "vitest";
import {
  AGGREGATE_BLOCK_BUDGET,
  MIRROR_NODE_BUDGET,
  MIRROR_NODE_CEILING,
  aggregateBlockBudget,
  lodFor,
  mirrorNodeBudget,
} from "@/lib/city/scene/lod";

describe("lod bands", () => {
  it("splits at the 0.7 / 1.2 thresholds (boundaries → lower band)", () => {
    expect(lodFor(2.5)).toBe("close");
    expect(lodFor(1.21)).toBe("close");
    expect(lodFor(1.2)).toBe("district");
    expect(lodFor(0.7)).toBe("district");
    expect(lodFor(0.69)).toBe("world");
    expect(lodFor(0.5)).toBe("world");
  });

  it("covers the whole camera zoom clamp without gaps", () => {
    for (let z = 0.5; z <= 2.5; z += 0.01) {
      const lod = lodFor(z);
      expect(["close", "district", "world"]).toContain(lod);
    }
  });
});

describe("lod budgets", () => {
  it("keeps every DOM-bridge budget under the QA ceiling", () => {
    for (const budget of Object.values(MIRROR_NODE_BUDGET)) {
      expect(budget).toBeLessThanOrEqual(MIRROR_NODE_CEILING);
    }
    expect(MIRROR_NODE_CEILING).toBe(1500);
    expect(mirrorNodeBudget("world")).toBeLessThan(mirrorNodeBudget("close"));
  });

  it("keeps aggregate block budgets modest", () => {
    expect(aggregateBlockBudget("close")).toBe(AGGREGATE_BLOCK_BUDGET.close);
    expect(aggregateBlockBudget("world")).toBeLessThan(aggregateBlockBudget("district"));
  });
});
