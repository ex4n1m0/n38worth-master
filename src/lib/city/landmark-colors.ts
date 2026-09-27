/**
 * Mainframe City — The Six landmark accent palette (client-safe, no Pixi).
 *
 * ONE source of truth shared by the canvas monuments (landmarks.ts) and the
 * DOM landmarks panel (LandmarkPanel.tsx), keyed by roster index
 * (GODDESS_USERNAMES order): Architect sky, Locksmith amber, Oracle violet,
 * Clockkeeper teal, War crimson, Banker gold.
 */

/** Pixi-side numbers (0xRRGGBB). */
export const LANDMARK_COLORS: readonly number[] = [
  0x7dd3fc, 0xf59e0b, 0xa78bfa, 0x5eead4, 0xef4444, 0xfbbf24,
];

/** DOM-side CSS color strings, same roster order. */
export const LANDMARK_HEX_COLORS: readonly string[] = [
  "#7dd3fc", "#f59e0b", "#a78bfa", "#5eead4", "#ef4444", "#fbbf24",
];
