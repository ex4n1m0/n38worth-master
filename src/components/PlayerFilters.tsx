"use client";

import type { LucideIcon } from "lucide-react";
import {
  TrendingUp,
  Coins,
  Star,
  ShoppingCart,
  Clock,
  Calendar,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { PROFESSIONS } from "@/lib/professions";

export type SortDir = "asc" | "desc";

export interface PlayerSortOption {
  key: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The single, shared set of sort options used on the market and on player
 * profiles. Exactly one is active at a time; direction is controlled by the
 * separate Asc/Desc toggle. Keys match the `sort` param accepted by
 * /api/players (the market) and the client-side comparators (profiles).
 */
export const PLAYER_SORTS: PlayerSortOption[] = [
  { key: "value", label: "Value", icon: TrendingUp },
  { key: "credits", label: "Credits", icon: Coins },
  { key: "score", label: "Score", icon: Star },
  { key: "hired-times", label: "Hired Times", icon: ShoppingCart },
  { key: "last-online", label: "Last Online", icon: Clock },
  { key: "newest", label: "Newest", icon: Calendar },
];

/**
 * Presentational pill button — the single consistent look for every sort/filter
 * toggle across the app. `tone` picks the active accent colour.
 */
export function FilterPill({
  active,
  onClick,
  children,
  tone = "amber",
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "cyan" | "amber";
  title?: string;
}) {
  const activeCls =
    tone === "amber"
      ? "border-amber-500/60 text-amber-300 bg-amber-500/10"
      : "border-cyan-500/50 text-cyan-400 bg-cyan-500/10";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border transition-colors ${
        active ? activeCls : "border-gray-700 text-gray-500 hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

/** "Sort:" label + single-select Core-6 pills + an Asc/Desc direction toggle. */
export function SortBar({
  sort,
  dir,
  onSortChange,
  onToggleDir,
}: {
  sort: string;
  dir: SortDir;
  onSortChange: (key: string) => void;
  onToggleDir: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500 mr-1">Sort:</span>
      {PLAYER_SORTS.map(({ key, label, icon: Icon }) => (
        <FilterPill key={key} active={sort === key} onClick={() => onSortChange(key)} tone="amber">
          <Icon className="h-3 w-3" /> {label}
        </FilterPill>
      ))}
      <button
        type="button"
        onClick={onToggleDir}
        title={dir === "asc" ? "Ascending — tap for descending" : "Descending — tap for ascending"}
        className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border border-amber-500/60 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
      >
        {dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {dir === "asc" ? "Asc" : "Desc"}
      </button>
    </div>
  );
}

/** "Profession:" label + single-select profession pills. Empty string clears. */
export function ProfessionFilterBar({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500 mr-1">Profession:</span>
      {PROFESSIONS.map((p) => (
        <FilterPill
          key={p.name}
          tone="amber"
          active={selected === p.name}
          onClick={() => onSelect(selected === p.name ? "" : p.name)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.imagePath} alt="" className="h-3.5 w-3.5 object-contain" /> {p.name}
        </FilterPill>
      ))}
    </div>
  );
}
