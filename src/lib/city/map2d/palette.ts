/**
 * map2d PALETTE — Style A "Blueprint" (user pick 2026-10-01), ALWAYS DAY.
 * One palette, no clock, no themes. Family indices follow layout.FAMILY order
 * (the 6 trade DB names + "no trade").
 */

export const BLUEPRINT = {
  paper: "#F4F1E8",
  grid: "#9FB4C4",
  gridAlpha: 0.5,
  ink: "#33506B",
  inkStrong: "#1B2F42",
  // 6 trades + no-trade — fill (footprint) and stroke (outline/avatar ring).
  families: [
    { key: "Cryptographer", fill: "#7FA8C9", stroke: "#33506B" },
    { key: "Zero-Day", fill: "#89B49B", stroke: "#3B5F49" },
    { key: "Overclocker", fill: "#C9A97F", stroke: "#6B5335" },
    { key: "Cache Keeper", fill: "#A893C9", stroke: "#4E3F6B" },
    { key: "Server Marshal", fill: "#C98F8F", stroke: "#6B4545" },
    { key: "Bot Herder", fill: "#8FC0C9", stroke: "#3F6069" },
    { key: null, fill: "#B9B3A8", stroke: "#5C574E" }, // no trade
  ] as const,
  hq: { plate: "#2E4A66", stroke: "#1B2F42", gold: "#F5C518" },
  landmark: { fill: "#F5C518", fillAlpha: 0.92, stroke: "#6B5335" },
  // Completed-album props (drawProp) — hues already proven on the paper.
  props: {
    park: { lawn: "#6FA35C", lawnDark: "#2F5226", path: "#F4F1E8" },
    marquee: { canopy: "#F5C518", post: "#6B5335" },
    crane: { mast: "#33506B" },
    rotunda: { stroke: "#33506B", finial: "#F5C518" },
    goldvault: { gold: "#F5C518", stroke: "#6B5335", dial: "#1B2F42" },
  },
  road: "#5A7186",
  lockBadge: { body: "#1F2328", keyhole: "#F5C518" },
  you: "#E8590C", // highlight ring for the viewer's own plot
  label: "#3A3630",
  selection: "#E8590C",
} as const;

export type FamilyStyle = { fill: string; stroke: string };

/** Family style by index (0..6); out-of-range falls back to no-trade. */
export function familyStyle(f: number): FamilyStyle {
  const list = BLUEPRINT.families;
  return list[Math.max(0, Math.min(list.length - 1, f))];
}
