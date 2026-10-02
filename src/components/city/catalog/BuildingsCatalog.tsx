"use client";

import { useCallback } from "react";
import { drawBuilding, drawHq, drawLandmark, drawProp, tierScale } from "@/lib/city/map2d/draw";
import { BLUEPRINT, familyStyle } from "@/lib/city/map2d/palette";
import type { WorldBuilding } from "@/lib/city/map2d/layout";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { cardDisplayName } from "@/lib/display-names";
import { professionName } from "@/lib/professions";
import { ALBUMS } from "@/lib/blueprints";
import { BuildingSprite } from "@/components/city/BuildingSprite";
import { Plate2D, Plate3D } from "./Plates";
import { useLanguage } from "@/components/LanguageContext";

/**
 * The comprehensive Buildings Catalog (BUILDING_CATALOG_STUDY.md §9, 2026-10-02):
 * EVERY subject the city can render — 7 trade families × the full 14-tier
 * ladder, protection states, the 3 HQ stages, the six Founder landmarks and
 * the five album props — each shown in all of its surfaces side by side:
 *
 *   2D map  (the live map2d primitives)  ·  Card art (the live BuildingSprite)
 *   3D view (offscreen shots built by the live engine's own builders)
 */

const PLATE = 100;
/** The lot cell drawn faintly behind each 2D footprint (scale context). */
const LOT_CELL = 60;

const FAMILY_SECTIONS: { key: string | null; index: number }[] = [
  { key: "Cryptographer", index: 0 },
  { key: "Zero-Day", index: 1 },
  { key: "Overclocker", index: 2 },
  { key: "Cache Keeper", index: 3 },
  { key: "Server Marshal", index: 4 },
  { key: "Bot Herder", index: 5 },
  { key: null, index: 6 },
];

const TIERS = Array.from({ length: 14 }, (_, i) => i + 1);

/** Representative trade for the HQ body (the body follows the owner's trade —
 *  every family's megaform is visible in the family sections at tiers 10–14). */
const HQ_FAMILY = "Server Marshal";

function tierMult(tier: number): string {
  return tier === 14 ? "8192+" : String(2 ** (tier - 1));
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-2">
      <h2 className="text-sm font-bold text-gray-200">{title}</h2>
      {note ? <p className="text-[11px] text-gray-500">{note}</p> : null}
      {children}
    </section>
  );
}

/** One tier of one family: 2D blueprint plate · live card art · 3D shot. */
function TierEntry({
  familyKey,
  familyIndex,
  tier,
}: {
  familyKey: string | null;
  familyIndex: number;
  tier: number;
}) {
  const { t } = useLanguage();

  const draw2d = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.strokeStyle = BLUEPRINT.grid;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        PLATE / 2 - LOT_CELL / 2,
        PLATE / 2 - LOT_CELL / 2,
        LOT_CELL,
        LOT_CELL
      );
      ctx.globalAlpha = 1;
      const b: WorldBuilding = { id: 0, u: "", f: familyIndex, t: tier, p: null };
      drawBuilding(ctx, PLATE / 2, PLATE / 2, tierScale(tier) * LOT_CELL, b);
    },
    [familyIndex, tier]
  );

  const label = t.catalogStage.replace("{n}", String(tier));
  const sub = t.catalogTierValue.replace("{mult}", tierMult(tier));

  return (
    <div className="rounded-lg border border-gray-700/60 bg-gray-900/40 p-2">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-bold text-gray-200">{label}</span>
        <span className="text-[10px] text-gray-500">{sub}</span>
      </div>
      <div className="flex items-end justify-center gap-2">
        <Plate2D width={PLATE} height={PLATE} draw={draw2d} label={t.catalogCol2d} />
        <div className="flex flex-col items-center gap-1">
          <BuildingSprite
            cardId={1000 + familyIndex * 20 + tier}
            profession={familyKey}
            playerValue={2 ** (tier - 1)}
            valueFloor={1}
            className="w-[84px]"
          />
          <span className="text-[11px] font-bold text-gray-300">{t.catalogColCard}</span>
        </div>
        <Plate3D
          subject={{ kind: "building", familyIndex, tier }}
          size={PLATE}
          label={t.catalogCol3d}
        />
      </div>
    </div>
  );
}

export function BuildingsCatalog() {
  const { t, locale } = useLanguage();

  const chips = [
    { href: "#catalog-buildings", label: t.catalogSectionBuildings },
    { href: "#catalog-protection", label: t.catalogSectionProtection },
    { href: "#catalog-hq", label: t.catalogSectionHq },
    { href: "#catalog-landmarks", label: t.catalogSectionLandmarks },
    { href: "#catalog-props", label: t.catalogSectionProps },
  ];

  return (
    <div className="space-y-8">
      {/* column legend + section jumps */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-800 pb-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-400">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[#7FA8C9]" />
          {t.catalogCol2d}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-400">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#6b5f49]" />
          {t.catalogColCard}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-400">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[#EFE9DA] ring-1 ring-[#9FB4C4]" />
          {t.catalogCol3d}
        </span>
        <span className="mx-1 hidden h-4 w-px bg-gray-700 sm:block" />
        <nav className="flex flex-wrap gap-1.5" aria-label={t.catalogTitle}>
          {chips.map((c) => (
            <a
              key={c.href}
              href={c.href}
              className="rounded-full border border-gray-700 px-2.5 py-0.5 text-[11px] text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
            >
              {c.label}
            </a>
          ))}
        </nav>
      </div>

      {/* 1 — trade families × the 14-tier ladder */}
      <Section
        id="catalog-buildings"
        title={t.catalogSectionBuildings}
        note={t.catalogStageLegend}
      >
        <div className="space-y-6">
          {FAMILY_SECTIONS.map(({ key, index }) => (
            <div key={key ?? "unassigned"} className="space-y-2">
              <h3 className="flex items-center gap-2 text-[13px] font-bold text-gray-300">
                <span
                  className="inline-block h-3 w-3 rounded-[2px]"
                  style={{ background: familyStyle(index).fill }}
                />
                {key ? professionName(key, locale) : t.catalogUnassigned}
              </h3>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                <div className="sm:col-span-2 xl:col-span-3 flex items-center gap-2 text-[11px] font-semibold text-gray-500">
                  <span className="h-px flex-1 bg-gray-800" />
                  {t.catalogLeagueCivic}
                </div>
                {TIERS.filter((tier) => tier <= 7).map((tier) => (
                  <TierEntry key={tier} familyKey={key} familyIndex={index} tier={tier} />
                ))}
                <div className="sm:col-span-2 xl:col-span-3 flex items-center gap-2 text-[11px] font-semibold text-amber-500/70">
                  <span className="h-px flex-1 bg-gray-800" />
                  {t.catalogLeagueGrand}
                </div>
                {TIERS.filter((tier) => tier >= 8).map((tier) => (
                  <TierEntry key={tier} familyKey={key} familyIndex={index} tier={tier} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 2 — protection states */}
      <Section
        id="catalog-protection"
        title={t.catalogSectionProtection}
        note={t.catalogProtection3dNote}
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(["firewall", "hardlock"] as const).map((p) => {
            const draw2d = (ctx: CanvasRenderingContext2D) => {
              const b: WorldBuilding = { id: 0, u: "", f: 2, t: 6, p };
              drawBuilding(ctx, PLATE / 2, PLATE / 2, tierScale(6) * LOT_CELL, b);
            };
            return (
              <div
                key={p}
                className="flex items-end justify-center gap-3 rounded-lg border border-gray-700/60 bg-gray-900/40 p-3"
              >
                <Plate2D
                  width={PLATE}
                  height={PLATE}
                  draw={draw2d}
                  label={p === "firewall" ? t.catalogFirewall : t.catalogHardLock}
                  sub={t.catalogCol2d}
                />
                <Plate3D
                  subject={{ kind: "building", familyIndex: 2, tier: 6 }}
                  size={PLATE}
                  label={t.catalogCol3d}
                />
              </div>
            );
          })}
        </div>
      </Section>

      {/* 3 — HQ core */}
      <Section id="catalog-hq" title={t.catalogSectionHq} note={t.catalogHqBodyNote}>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {[1, 2, 3].map((stage) => {
            const draw2d = (ctx: CanvasRenderingContext2D) => {
              drawHq(ctx, PLATE / 2 + 5, PLATE / 2 + 5, 64, stage);
            };
            return (
              <div
                key={stage}
                className="flex items-end justify-center gap-3 rounded-lg border border-gray-700/60 bg-gray-900/40 p-3"
              >
                <Plate2D
                  width={110}
                  height={110}
                  draw={draw2d}
                  label={t.catalogStage.replace("{n}", String(stage))}
                  sub={t.catalogCol2d}
                />
                <Plate3D
                  subject={{ kind: "hq", stage, family: HQ_FAMILY }}
                  size={PLATE}
                  label={t.catalogCol3d}
                />
              </div>
            );
          })}
        </div>
      </Section>

      {/* 4 — the six Founder landmarks */}
      <Section
        id="catalog-landmarks"
        title={t.catalogSectionLandmarks}
        note={t.catalogLandmark2dNote}
      >
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {GODDESS_USERNAMES.map((username, i) => (
            <div
              key={username}
              className="flex items-end justify-center gap-3 rounded-lg border border-gray-700/60 bg-gray-900/40 p-3"
            >
              <div className="flex flex-col items-center gap-1">
                <BuildingSprite
                  cardId={2000 + i}
                  goddessUsername={username}
                  playerValue={0}
                  valueFloor={1}
                  className="w-[74px]"
                />
                <span className="text-[11px] font-bold text-gray-300">{t.catalogColCard}</span>
              </div>
              <Plate2D
                width={PLATE}
                height={PLATE}
                draw={(ctx) => drawLandmark(ctx, PLATE / 2, PLATE / 2, 58)}
                label={t.catalogCol2d}
              />
              <Plate3D
                subject={{ kind: "monument", canonical: i }}
                size={PLATE}
                label={cardDisplayName(username, locale)}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* 5 — blueprint album props */}
      <Section id="catalog-props" title={t.catalogSectionProps} note={t.catalogPropNote}>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {ALBUMS.map((album) => (
            <div
              key={album.id}
              className="flex items-end justify-center gap-3 rounded-lg border border-gray-700/60 bg-gray-900/40 p-3"
            >
              <Plate2D
                width={PLATE}
                height={PLATE}
                draw={(ctx) => drawProp(ctx, PLATE / 2, PLATE / 2, 62, album.prop)}
                label={locale === "zh" ? album.propNameZh : album.propNameEn}
                sub={t.catalogCol2d}
              />
              <Plate3D
                subject={{ kind: "prop", prop: album.prop }}
                size={PLATE}
                label={t.catalogCol3d}
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
