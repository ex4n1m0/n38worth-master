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
 * Returns a regular JS number capped at MAX_SAFE_INTEGER.
 */
export function safePortfolioValue(
  playerValue: number,
  ownedValue: number,
  ownerCount: number
): number {
  try {
    const bigPV = BigInt(Math.round(playerValue));
    const bigOV = BigInt(Math.round(ownedValue));
    const bigOC = BigInt(Math.max(ownerCount, 1));
    const result = (bigPV + bigOV) * bigOC;
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number.MAX_SAFE_INTEGER;
    }
    return Number(result);
  } catch {
    // Fallback for any unexpected input
    return Math.min(
      (playerValue + ownedValue) * Math.max(ownerCount, 1),
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
