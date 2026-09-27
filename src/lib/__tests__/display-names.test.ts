import { describe, it, expect } from "vitest";
import {
  CARD_DISPLAY_NAMES,
  CARD_DISPLAY_NAMES_ZH,
  cardDisplayName,
  theSixLabel,
} from "@/lib/display-names";
import { MISSIONS } from "@/lib/missions-data";

describe("display-name dictionaries", () => {
  it("en and zh dictionaries cover exactly the same DB keys", () => {
    expect(Object.keys(CARD_DISPLAY_NAMES_ZH).sort()).toEqual(
      Object.keys(CARD_DISPLAY_NAMES).sort()
    );
  });

  it("every mission reward card has a display name (guards ladder/dictionary drift)", () => {
    for (const mission of MISSIONS) {
      for (const card of mission.rewardCards) {
        expect(CARD_DISPLAY_NAMES[card], `missing en name for ${card}`).toBeTruthy();
        expect(CARD_DISPLAY_NAMES_ZH[card], `missing zh name for ${card}`).toBeTruthy();
      }
    }
  });

  it("maps the six goddesses and Botnet to their rebranded names", () => {
    expect(cardDisplayName("Goddess")).toBe("The Architect");
    expect(cardDisplayName("Goddess of War")).toBe("NullPointer");
    expect(cardDisplayName("Mass Hire")).toBe("Botnet");
    expect(cardDisplayName("Goddess", "zh")).toBe("架构师");
    expect(cardDisplayName("Mass Hire", "zh")).toBe("僵尸网络");
  });

  it("passes regular players through unchanged in both locales", () => {
    expect(cardDisplayName("ex4n1m0")).toBe("ex4n1m0");
    expect(cardDisplayName("ex4n1m0", "zh")).toBe("ex4n1m0");
  });

  it("returns empty string for null/undefined", () => {
    expect(cardDisplayName(null)).toBe("");
    expect(cardDisplayName(undefined)).toBe("");
  });
});

describe("theSixLabel", () => {
  it("renders the collective noun per locale", () => {
    expect(theSixLabel("en")).toBe("the Six");
    expect(theSixLabel("zh")).toBe("六使");
  });
});
