/**
 * Safeguard constants and helpers to prevent integer overflow
 * across credits, player values, and portfolio calculations.
 *
 * PostgreSQL bigint max:          9,223,372,036,854,775,807  (2^63 − 1)
 * JS Number.MAX_SAFE_INTEGER:     9,007,199,254,740,991      (2^53 − 1)
 * Credits column (double precision): ~15-16 significant digits
 */

/** PostgreSQL bigint upper bound */
export const PG_BIGINT_MAX = BigInt("9223372036854775807");

/**
 * Maximum player (card) value ceiling — 1e12.
 *
 * Player values grow multiplicatively on every hire/pump. Without a ceiling
 * they eventually approach Number.MAX_SAFE_INTEGER, at which point (a) plain JS
 * number math loses precision and, more importantly, (b) the purchase cost
 * (value × up to 6 block-hours) exceeds the maximum credits any player can ever
 * hold (MAX_CREDITS ≈ 9e15) — so the card becomes impossible to buy.
 *
 * We cap values at 1e12. The priciest a card can ever cost is then
 * 1e12 × 6 = 6e12, still ~1,500× below MAX_CREDITS, so top cards always stay
 * affordable and every value/cost stays comfortably inside the lossless
 * integer range (< 2^53).
 */
export const MAX_PLAYER_VALUE = 1_000_000_000_000; // 1e12

/** String form for embedding inside raw SQL `LEAST(expr, ...)` */
export const MAX_PLAYER_VALUE_SQL = "1000000000000";

/**
 * Cap a player value so it never exceeds MAX_PLAYER_VALUE (and never drops
 * below 1). Use at every site that grows a player's value before writing it.
 */
export function capPlayerValue(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(value, MAX_PLAYER_VALUE));
}

/**
 * Maximum credits we allow.  We use JS MAX_SAFE_INTEGER so that every
 * arithmetic operation in Node stays lossless.  The DB column is
 * double-precision which can store this exactly.
 */
export const MAX_CREDITS = Number.MAX_SAFE_INTEGER; // 9_007_199_254_740_991

/** String form for embedding inside raw SQL `LEAST(expr, ...)` */
export const MAX_CREDITS_SQL = "9007199254740991";

/**
 * Cap a credits value so it never exceeds MAX_CREDITS.
 * Useful when computing a new balance in JS before writing to the DB.
 */
export function capCredits(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(value, MAX_CREDITS);
}

/**
 * Compute portfolio value using BigInt to avoid floating-point
 * precision loss when player values are extremely large.
 *
 * Portfolio value = owned cards' value × max(ownerCount, 1).
 *
 * NOTE: the player's OWN card value (playerValue) is intentionally NOT
 * included — a player's portfolio is what they OWN, not what they ARE. This
 * prevents high-value cards (e.g. goddesses at 100B) from earning massive
 * passive rewards just for existing, and means every player must actively
 * own cards to earn portfolio income. The `playerValue` parameter is kept
 * in the signature for call-site compatibility but is ignored.
 *
 * Returns a regular JS number capped at MAX_SAFE_INTEGER.
 */
export function safePortfolioValue(
  playerValue: number,
  ownedValue: number,
  ownerCount: number
): number {
  try {
    const bigOV = BigInt(Math.round(ownedValue));
    const bigOC = BigInt(Math.max(ownerCount, 1));
    const result = bigOV * bigOC;
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number.MAX_SAFE_INTEGER;
    }
    return Number(result);
  } catch {
    // Fallback for any unexpected input
    return Math.min(
      ownedValue * Math.max(ownerCount, 1),
      Number.MAX_SAFE_INTEGER
    );
  }
}

/**
 * Safe reward / bonus calculation: multiplies then caps at MAX_CREDITS.
 */
export function safeReward(portfolioValue: number, percentage: number): number {
  try {
    const bigPV = BigInt(Math.round(portfolioValue));
    // percentage is e.g. 0.01 — scale up to avoid fractions
    // floor(portfolioValue * percentage) = floor(bigPV * numerator / denominator)
    const basisPoints = Math.round(percentage * 10000); // 0.01 → 100
    const result = (bigPV * BigInt(basisPoints)) / BigInt(10000);
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number.MAX_SAFE_INTEGER;
    }
    return Number(result);
  } catch {
    return Math.min(
      Math.floor(portfolioValue * percentage),
      Number.MAX_SAFE_INTEGER
    );
  }
}
