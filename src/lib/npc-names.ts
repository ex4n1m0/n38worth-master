/**
 * NPC username generation.
 *
 * Primary strategy: derive an evocative name from the Unsplash photo's metadata
 * (tags + alt/description text), e.g. "NeonNomad", "GoldenDusk42". When a photo
 * has no usable metadata, fall back to the classic adjective+noun+number style.
 *
 * Usernames must fit the DB column (`varchar(30)`, unique). Callers run these in
 * a retry loop and rely on the username unique constraint to resolve collisions,
 * so every call returns a fresh randomized name.
 */

/** Photo metadata captured from the Unsplash `/photos/random` response. */
export interface NpcPhotoMeta {
  tags?: Array<{ title?: string | null }> | null;
  altDescription?: string | null;
  description?: string | null;
}

const ADJECTIVES = [
  "Swift", "Bold", "Lucky", "Chill", "Epic", "Witty", "Brave", "Noble",
  "Keen", "Sly", "Deft", "Wise", "Zany", "Vivid", "Rad", "Cool",
  "Sleek", "Prime", "Elite", "Mega", "Ultra", "Hyper", "Turbo", "Apex",
  "Neon", "Pixel", "Cyber", "Astro", "Nova", "Blaze", "Storm", "Frost",
  "Shadow", "Iron", "Steel", "Golden", "Silver", "Cosmic", "Lunar", "Solar",
];

const NOUNS = [
  "Trader", "Wolf", "Shark", "Hawk", "Eagle", "Tiger", "Lion", "Bear",
  "Fox", "Ace", "Root", "Boss", "Pro", "Star", "Cipher", "Pilot",
  "Kernel", "Chief", "Alpha", "Rider", "Hunter", "Ranger", "Phantom", "Viper",
  "Falcon", "Raven", "Phoenix", "Glitch", "Titan", "Rebel", "Maverick", "Nomad",
];

const MAX_USERNAME_LEN = 30;
// Numeric suffix range for generated names. A wide 1–9999 range keeps
// collisions rare even when the keyword pool is small (e.g. many photos
// sharing a "fashion" tag), since name-derived bases repeat often.
const MAX_NAME_SUFFIX = 9999;

function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Classic adjective + noun + number username (the fallback / legacy style). */
export function generateRandomNpcName(): string {
  const adj = ADJECTIVES[randInt(ADJECTIVES.length)];
  const noun = NOUNS[randInt(NOUNS.length)];
  const num = randInt(MAX_NAME_SUFFIX) + 1;
  return `${adj}${noun}${num}`;
}

/**
 * Extract candidate name words from photo metadata: keep alphabetic tokens of a
 * reasonable length. Order: tags first (most specific), then alt_description,
 * then description.
 */
function extractKeywords(meta: NpcPhotoMeta): string[] {
  const sources: string[] = [];
  if (Array.isArray(meta.tags)) {
    for (const t of meta.tags) {
      if (t?.title) sources.push(t.title);
    }
  }
  if (meta.altDescription) sources.push(meta.altDescription);
  if (meta.description) sources.push(meta.description);

  const seen = new Set<string>();
  const words: string[] = [];
  for (const src of sources) {
    for (const raw of src.split(/[^A-Za-z]+/)) {
      const w = raw.toLowerCase();
      if (w.length < 3 || w.length > 12) continue;
      if (seen.has(w)) continue;
      seen.add(w);
      words.push(w);
    }
  }
  return words;
}

/**
 * Build an NPC username from Unsplash photo metadata, falling back to the
 * classic generator when the photo has no usable keywords.
 */
export function generateNpcNameFromMeta(meta: NpcPhotoMeta | null | undefined): string {
  if (!meta) return generateRandomNpcName();

  const words = extractKeywords(meta);
  if (words.length === 0) return generateRandomNpcName();

  // Pick one or two distinct keywords (two when available for more variety).
  const first = words[randInt(words.length)];
  let base = titleCase(first);

  if (words.length > 1) {
    let second = words[randInt(words.length)];
    if (second === first) {
      second = words[(words.indexOf(first) + 1) % words.length];
    }
    if (second !== first) base += titleCase(second);
  }

  const num = randInt(MAX_NAME_SUFFIX) + 1;
  const suffix = String(num);

  // Reserve space for the numeric suffix within the 30-char limit.
  const maxBase = MAX_USERNAME_LEN - suffix.length;
  if (base.length > maxBase) base = base.slice(0, maxBase);

  return `${base}${suffix}`;
}
