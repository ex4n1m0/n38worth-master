"use client";

import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";

/**
 * Shared disclosure header for the city map's information panels (2026-09-28):
 * the whole header row IS the toggle. Collapsed, the panel body leaves the
 * layout (`hidden`) and the header stays behind as the slim reopen bar — on
 * mobile the overview sheet used to blanket most of the canvas. Standard
 * disclosure semantics (button + aria-expanded + aria-controls) keep the
 * panels reachable for keyboard/screen-reader users.
 */
export function CityPanelHead({
  title,
  icon,
  count,
  trailing,
  collapsed,
  onToggle,
  bodyId,
}: {
  /** Panel title (already localized) — also feeds the aria-label. */
  title: string;
  /** Leading lucide icon node. */
  icon: React.ReactNode;
  /** Trailing count/badge node (already localized). */
  count?: React.ReactNode;
  /** Extra trailing node pinned left of the chevron (e.g. the sim clock) —
   *  takes over the row's ml-auto push when `count` is absent. */
  trailing?: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  /** id of the body element this head controls. */
  bodyId: string;
}) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls={bodyId}
      aria-label={
        collapsed
          ? t.cityPanelShow.replace("{title}", title)
          : t.cityPanelHide.replace("{title}", title)
      }
      className="flex w-full min-w-0 items-center gap-1.5 rounded-md border border-transparent px-1 py-0.5 text-left transition-colors hover:border-gray-700/60 hover:bg-gray-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1-400"
    >
      {icon}
      <span className="min-w-0 truncate text-xs font-bold uppercase tracking-[0.2em] text-t1-300">
        {title}
      </span>
      {count !== undefined ? (
        <span className="ml-auto shrink-0 text-[10px] font-bold tabular-nums text-gray-500">
          {count}
        </span>
      ) : null}
      {trailing !== undefined ? (
        <span
          className={`inline-flex shrink-0 items-center gap-1 ${
            count === undefined ? "ml-auto" : ""
          }`}
        >
          {trailing}
        </span>
      ) : null}
      <ChevronDown
        className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform duration-150 ${
          collapsed ? "" : "rotate-180"
        }`}
        aria-hidden="true"
      />
    </button>
  );
}
