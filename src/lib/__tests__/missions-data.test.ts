import { describe, it, expect } from "vitest";
import {
  MISSIONS,
  MASS_HIRE_CARD,
  MASS_HIRE_UNLOCK_THRESHOLD,
  MISSION_HIRE_SLOTS_REWARD,
  FINAL_MISSION_INDEX,
  FINAL_GODDESS_CARD,
  WIN_THRESHOLD_INCREMENT,
  MISSION_LABELS_ZH,
  MISSION_CARD_INDEX,
  finalGoddessThreshold,
  missionLabel,
  finalGoddessLabel,
  isLockablePurchaseCard,
  isPurchaseUnlockedAtLevel,
  purchaseUnlockThreshold,
} from "@/lib/missions-data";

const GODDESS_REWARD_ORDER = [
  "Goddess of Wealth",
  "Goddess of Knowledge",
  "Goddess of Fate",
  "Goddess of Time",
  "Goddess of War",
  "Goddess",
];

describe("mission ladder structure", () => {
  it("has exactly 8 missions with strictly increasing thresholds", () => {
    expect(MISSIONS).toHaveLength(8);
    for (let i = 1; i < MISSIONS.length; i++) {
      expect(MISSIONS[i].threshold).toBeGreaterThan(MISSIONS[i - 1].threshold);
    }
  });

  it("starts at 20 (game unlock) and ends at 5000 (final goddess)", () => {
    expect(MISSIONS[0].threshold).toBe(20);
    expect(MISSIONS[FINAL_MISSION_INDEX].threshold).toBe(5000);
    expect(FINAL_GODDESS_CARD).toBe("Goddess");
  });

  it("awards the six goddesses in the fixed canonical order, then Botnet at mission 1", () => {
    const goddessMissions = MISSIONS.filter((m) =>
      m.rewardCards.some((c) => c.startsWith("Goddess"))
    );
    expect(goddessMissions.map((m) => m.rewardCards[0])).toEqual(
      GODDESS_REWARD_ORDER
    );
    expect(MISSIONS[1].rewardCards).toEqual([MASS_HIRE_CARD]);
  });

  it("every mission adds exactly MISSION_HIRE_SLOTS_REWARD slots", () => {
    for (const mission of MISSIONS) {
      expect(mission.addHireSlots).toBe(MISSION_HIRE_SLOTS_REWARD);
    }
  });

  it("Botnet unlock threshold constant stays in sync with the ladder", () => {
    expect(MISSIONS[1].threshold).toBe(MASS_HIRE_UNLOCK_THRESHOLD);
  });

  it("every reward card maps back to its awarding mission", () => {
    for (const [card, index] of Object.entries(MISSION_CARD_INDEX)) {
      expect(MISSIONS[index].rewardCards).toContain(card);
    }
  });
});

describe("finalGoddessThreshold", () => {
  it("base threshold with zero wins", () => {
    expect(finalGoddessThreshold(0)).toBe(5000);
  });

  it("grows by WIN_THRESHOLD_INCREMENT per win", () => {
    expect(finalGoddessThreshold(3)).toBe(5000 + 3 * WIN_THRESHOLD_INCREMENT);
  });

  it("treats negative win counts as zero", () => {
    expect(finalGoddessThreshold(-2)).toBe(5000);
  });
});

describe("purchase locks", () => {
  it("lockable cards are exactly the mission rewards plus Botnet", () => {
    for (const card of Object.keys(MISSION_CARD_INDEX)) {
      expect(isLockablePurchaseCard(card)).toBe(true);
    }
    expect(isLockablePurchaseCard(MASS_HIRE_CARD)).toBe(true);
    expect(isLockablePurchaseCard("some_regular_player")).toBe(false);
  });

  it("a card awarded by mission i unlocks at missionLevel i + 1, not below", () => {
    // Goddess of Wealth is awarded by mission index 2
    expect(isPurchaseUnlockedAtLevel("Goddess of Wealth", 2)).toBe(false);
    expect(isPurchaseUnlockedAtLevel("Goddess of Wealth", 3)).toBe(true);
    expect(isPurchaseUnlockedAtLevel("Goddess of Wealth", 8)).toBe(true);
  });

  it("non-lockable cards are always purchasable", () => {
    expect(isPurchaseUnlockedAtLevel("anyone", 0)).toBe(true);
  });

  it("purchaseUnlockThreshold mirrors the ladder (null for regular cards)", () => {
    expect(purchaseUnlockThreshold("Goddess of Fate")).toBe(500);
    expect(purchaseUnlockThreshold("Mass Hire")).toBe(50);
    expect(purchaseUnlockThreshold("regular")).toBeNull();
  });
});

describe("locale-aware labels", () => {
  it("zh labels exist for every mission index", () => {
    for (let i = 0; i < MISSIONS.length; i++) {
      expect(MISSION_LABELS_ZH[i]).toBeTruthy();
    }
  });

  it("missionLabel interpolates the threshold into the zh template", () => {
    expect(missionLabel(0, "zh")).toBe("拥有 20 座建筑，取得建造执照");
    // 5,000 uses the en-US thousands separator inside zh copy (canon)
    expect(missionLabel(7, "zh")).toContain("5,000");
  });

  it("missionLabel falls back to English label or empty for bad indices", () => {
    expect(missionLabel(99, "en")).toBe("");
    expect(missionLabel(99, "zh")).toBe("");
  });

  it("finalGoddessLabel reflects the effective threshold in both locales", () => {
    expect(finalGoddessLabel(8000, "en")).toBe(
      "Own 8,000 buildings to unlock The Architect"
    );
    expect(finalGoddessLabel(8000, "zh")).toContain("8,000");
    expect(finalGoddessLabel(8000, "zh")).toContain("总建筑师");
  });
});
