"use client";

import { useCallback, useMemo, useState } from "react";
import { Link2, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { professionName } from "@/lib/professions";
import {
  DISTRICT_PROFESSIONS,
  districtsFromFamilies,
  familyHex,
} from "@/lib/city/district";
import { useComboDock } from "@/components/ComboDock";
import { CityPanelHead } from "./CityPanelHead";

/**
 * Profession-district panel (DOM, in the world shell — Phase C).
 *
 * Presence is DERIVED from the city projection: "families present" ==
 * "professions owned", and "all six present" == district complete, exactly
 * mirroring the existing six-profession combo state.
 *
 * ⚠ COMBO SEMANTICS (eligibility, selection, sale, payout, firewall rules)
 * LIVE ENTIRELY IN THE EXISTING COMBO MODULE — src/components/ComboDock.tsx
 * + src/hooks/useProfessionComboSelection.ts + its server action. This panel
 * implements NONE of that logic; when the district is complete it merely
 * opens the EXISTING global dock through its shared store. Server stays
 * authoritative for everything.
 */
export function DistrictPanel({
  families,
  isOwner,
}: {
  families: ReadonlyArray<{ profession: string; total: number }>;
  isOwner: boolean;
}) {
  const { t, locale } = useLanguage();
  const { play } = useSound();
  const setOpen = useComboDock((s) => s.setOpen);
  const [collapsed, setCollapsed] = useState(false);
  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  const presence = useMemo(() => districtsFromFamilies(families), [families]);

  return (
    <section
      className={`city-world-district ${presence.complete ? "city-world-district-complete" : ""} ${
        collapsed ? "city-panel-collapsed" : ""
      }`}
      aria-label={t.cityDistrictTitle}
    >
      <header>
        <CityPanelHead
          title={t.cityDistrictTitle}
          icon={<Link2 className="h-4 w-4 shrink-0 text-t1-400" aria-hidden="true" />}
          count={t.cityDistrictCount.replace("{count}", String(presence.present.length))}
          collapsed={collapsed}
          onToggle={toggle}
          bodyId="city-district-body"
        />
      </header>

      <div id="city-district-body" hidden={collapsed}>
        <ul className="city-world-district-list">
        {DISTRICT_PROFESSIONS.map((name) => {
          const owned = presence.present.includes(name);
          return (
            <li key={name} className="city-world-district-row">
              <span
                className="city-world-district-dot"
                style={{ backgroundColor: familyHex(name) }}
                aria-hidden="true"
              />
              <span
                className={`min-w-0 truncate text-[11px] font-semibold ${
                  owned ? "text-gray-200" : "text-gray-600"
                }`}
              >
                {professionName(name, locale)}
              </span>
              <span className="sr-only">
                {owned ? t.cityDistrictPresent : t.cityDistrictAbsent}
              </span>
              <span
                className={`ml-auto h-1.5 w-6 rounded-full ${
                  owned ? "" : "bg-gray-800"
                }`}
                style={owned ? { backgroundColor: familyHex(name) } : undefined}
                aria-hidden="true"
              />
            </li>
          );
        })}
      </ul>

      {presence.complete ? (
        <div className="city-world-district-complete-box">
          <p className="text-[11px] font-bold text-amber-300">
            {t.cityDistrictComplete}
          </p>
          {isOwner ? (
            <button
              type="button"
              onClick={() => {
                play("open");
                setOpen(true);
              }}
              className="city-world-btn city-world-btn-primary mt-1.5 w-full"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t.cityDistrictOpenCombo}
            </button>
          ) : null}
        </div>
      ) : null}
      </div>
    </section>
  );
}
