/**
 * Professions system - players can choose a profession during onboarding,
 * and NPCs randomly acquire one with weighted probabilities.
 */

export interface Profession {
  name: string;
  imagePath: string;
  probability: number; // 0-100, used only for NPC random assignment
}

export const PROFESSIONS: Profession[] = [
  {
    name: "Rift Binder",
    imagePath: "/NewRiftBinder.webp",
    probability: 5,
  },
  {
    name: "Hexblade Courier",
    imagePath: "/NewHexbladeCourier.webp",
    probability: 6,
  },
  {
    name: "Scrap Alchemist",
    imagePath: "/NewScrapAlchemist.webp",
    probability: 7,
  },
  {
    name: "Spirit Archivist",
    imagePath: "/NewSpiritArchivist.webp",
    probability: 8,
  },
  {
    name: "Iron Choir Marshal",
    imagePath: "/NewChoirMarshal.webp",
    probability: 9,
  },
  {
    name: "Plague Cartographer",
    imagePath: "/NewPlagueCartographer.webp",
    probability: 10,
  },
];

/** Total probability of receiving any profession (sum of all 6). */
const TOTAL_PROFESSION_PROBABILITY = 45;

/**
 * Rolls a random profession for an NPC based on weighted probabilities.
 * Returns the profession name, or null if the NPC gets no profession (hidden card).
 *
 * Probabilities:
 *   Rift Binder: 5%
 *   Hexblade Courier: 6%
 *   Scrap Alchemist: 7%
 *   Spirit Archivist: 8%
 *   Iron Choir Marshal: 9%
 *   Plague Cartographer: 10%
 *   Hidden Card (null): 55%
 */
export function rollProfession(): string | null {
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (const profession of PROFESSIONS) {
    cumulative += profession.probability;
    if (roll < cumulative) {
      return profession.name;
    }
  }

  return null; // Hidden card (55%)
}

/**
 * Returns the image path for a given profession name.
 */
export function getProfessionImage(professionName: string | null | undefined): string | null {
  if (!professionName) return null;
  const profession = PROFESSIONS.find((p) => p.name === professionName);
  return profession?.imagePath ?? null;
}

/**
 * Profession perks ("Guild Perks") — display metadata. A perk is active for a
 * player while they either ARE that profession or OWN at least one card with
 * it. Server-side checks live in src/lib/professionPerks.ts.
 */
export const PROFESSION_PERKS: Record<string, { name: string; description: string }> = {
  "Rift Binder": {
    name: "Warding Rift",
    description: "Your sell blocks last 50% longer (1.5h per press).",
  },
  "Hexblade Courier": {
    name: "Severing Blade",
    description: "Break fees you pay are 20% cheaper.",
  },
  "Scrap Alchemist": {
    name: "Transmutation",
    description: "Pumping costs 10% less but still doubles the card's value.",
  },
  "Spirit Archivist": {
    name: "Recorded Fortunes",
    description: "Your daily login reward is 25% bigger.",
  },
  "Iron Choir Marshal": {
    name: "Rally the Choir",
    description: "+2 hire slots.",
  },
  "Plague Cartographer": {
    name: "Charted Spread",
    description: "Mass Hire grabs +1 extra card.",
  },
};