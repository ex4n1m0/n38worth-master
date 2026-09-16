/**
 * Professions system - players can choose a profession during onboarding,
 * and NPCs randomly acquire one with weighted probabilities.
 *
 * Sci-fi rebrand mapping (2026-09): Rift Binder → Cryptographer,
 * Hexblade Courier → Zero-Day, Scrap Alchemist → Overclocker,
 * Spirit Archivist → Cache Keeper, Iron Choir Marshal → Server Marshal,
 * Plague Cartographer → Bot Herder. Existing DB rows were migrated with
 * `npm run rebrand:professions`.
 */

export interface Profession {
  name: string;
  imagePath: string;
  probability: number; // 0-100, used only for NPC random assignment
}

export const PROFESSIONS: Profession[] = [
  {
    name: "Cryptographer",
    imagePath: "/NewCryptographer.webp",
    probability: 5,
  },
  {
    name: "Zero-Day",
    imagePath: "/NewZeroDay.webp",
    probability: 6,
  },
  {
    name: "Overclocker",
    imagePath: "/NewOverclocker.webp",
    probability: 7,
  },
  {
    name: "Cache Keeper",
    imagePath: "/NewCacheKeeper.webp",
    probability: 8,
  },
  {
    name: "Server Marshal",
    imagePath: "/NewServerMarshal.webp",
    probability: 9,
  },
  {
    name: "Bot Herder",
    imagePath: "/NewBotHerder.webp",
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
 *   Cryptographer: 5%
 *   Zero-Day: 6%
 *   Overclocker: 7%
 *   Cache Keeper: 8%
 *   Server Marshal: 9%
 *   Bot Herder: 10%
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
 * Profession perks ("Firmware Perks") — display metadata. A perk is active for a
 * player while they either ARE that profession or OWN at least one card with
 * it. Server-side checks live in src/lib/professionPerks.ts.
 */
export const PROFESSION_PERKS: Record<string, { name: string; description: string }> = {
  "Cryptographer": {
    name: "Deep Encryption",
    description: "Your firewalls last 50% longer (1.5h per press).",
  },
  "Zero-Day": {
    name: "Exploit Chain",
    description: "Breaches you pay for are 20% cheaper.",
  },
  "Overclocker": {
    name: "Turbo Boost",
    description: "Overclocking costs 10% less but still doubles the avatar's value.",
  },
  "Cache Keeper": {
    name: "Cached Dividends",
    description: "Your daily login reward is 25% bigger.",
  },
  "Server Marshal": {
    name: "Extra Racks",
    description: "+2 hire slots.",
  },
  "Bot Herder": {
    name: "Wider Botnet",
    description: "Botnet grabs +1 extra avatar.",
  },
};
