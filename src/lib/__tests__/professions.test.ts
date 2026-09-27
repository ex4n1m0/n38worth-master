import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  PROFESSIONS,
  PROFESSION_NAMES_ZH,
  PROFESSION_PERKS,
  PROFESSION_PERKS_ZH,
  getProfessionImage,
  professionName,
  professionPerk,
} from "@/lib/professions";

describe("profession roster", () => {
  it("has exactly the six rebranded professions with unique names", () => {
    const names = PROFESSIONS.map((p) => p.name);
    expect(names).toEqual([
      "Cryptographer",
      "Zero-Day",
      "Overclocker",
      "Cache Keeper",
      "Server Marshal",
      "Bot Herder",
    ]);
    expect(new Set(names).size).toBe(6);
  });

  it("NPC assignment probabilities sum to 45 (55% stay professionless)", () => {
    expect(PROFESSIONS.reduce((sum, p) => sum + p.probability, 0)).toBe(45);
  });

  it("every profession's art file exists in public/", () => {
    for (const profession of PROFESSIONS) {
      const file = join(process.cwd(), "public", profession.imagePath);
      expect(existsSync(file), `missing ${profession.imagePath}`).toBe(true);
    }
  });
});

describe("locale helpers", () => {
  it("zh name map covers every profession exactly", () => {
    expect(Object.keys(PROFESSION_NAMES_ZH).sort()).toEqual(
      PROFESSIONS.map((p) => p.name).sort()
    );
  });

  it("professionName translates zh and passes through en / unknown / null", () => {
    expect(professionName("Cryptographer", "zh")).toBe("密码学家");
    expect(professionName("Cryptographer")).toBe("Cryptographer");
    expect(professionName("NotAProfession", "zh")).toBe("NotAProfession");
    expect(professionName(null)).toBe("");
  });

  it("perk dictionaries (en + zh) cover every profession with name and description", () => {
    const names = PROFESSIONS.map((p) => p.name);
    for (const dict of [PROFESSION_PERKS, PROFESSION_PERKS_ZH]) {
      expect(Object.keys(dict).sort()).toEqual([...names].sort());
      for (const perk of Object.values(dict)) {
        expect(perk.name).toBeTruthy();
        expect(perk.description).toBeTruthy();
      }
    }
  });

  it("professionPerk returns undefined for unknown/null input", () => {
    expect(professionPerk("Nope", "en")).toBeUndefined();
    expect(professionPerk(null)).toBeUndefined();
  });
});

describe("getProfessionImage", () => {
  it("resolves the image path for a known profession", () => {
    expect(getProfessionImage("Overclocker")).toBe("/NewOverclocker.webp");
  });

  it("returns null for null/undefined/unknown professions", () => {
    expect(getProfessionImage(null)).toBeNull();
    expect(getProfessionImage("Unknown")).toBeNull();
  });
});
