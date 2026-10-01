"use client";

import { useEffect, useRef } from "react";
import { drawBuilding, drawHq, drawLandmark, tierScale } from "@/lib/city/map2d/draw";
import { familyStyle } from "@/lib/city/map2d/palette";
import { BLUEPRINT } from "@/lib/city/map2d/palette";
import type { WorldBuilding } from "@/lib/city/map2d/layout";
import { useLanguage } from "@/components/LanguageContext";
import { professionName } from "@/lib/professions";

/**
 * 2D Buildings Catalog (2026-10-01 rebuild): static canvas plates drawn by
 * the SAME map2d primitives the shared world map uses — no WebGL, no Kenney
 * GLBs, no day/night (always day). If it looks different on the map, it's a
 * bug in one of the two.
 */

const FAMILY_KEYS = [
  "Cryptographer",
  "Zero-Day",
  "Overclocker",
  "Cache Keeper",
  "Server Marshal",
  "Bot Herder",
  null, // no trade
];

function Plate({
  width,
  height,
  draw,
  label,
  sub,
}: {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
  label: string;
  sub?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BLUEPRINT.paper;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = BLUEPRINT.grid;
    ctx.globalAlpha = BLUEPRINT.gridAlpha;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 32) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += 32) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    draw(ctx);
  }, [width, height, draw]);
  return (
    <figure className="flex flex-col items-center gap-1">
      <canvas
        ref={ref}
        role="img"
        aria-label={label}
        className="rounded-lg border border-[#33506B]/30"
      />
      <figcaption className="text-center">
        <span className="block text-xs font-bold text-gray-300">{label}</span>
        {sub ? <span className="block text-[11px] text-gray-500">{sub}</span> : null}
      </figcaption>
    </figure>
  );
}

export function Catalog2D() {
  const { t, locale } = useLanguage();
  const tiers = [1, 4, 8, 14];

  const building = (fam: number, tier: number, w = 96, h = 96) => (ctx: CanvasRenderingContext2D) => {
    const b: WorldBuilding = { id: 0, u: "", f: fam, t: tier, p: null };
    const size = tierScale(tier) * 56;
    drawBuilding(ctx, w / 2, h / 2, size, b);
  };
  const protectedBuilding = (p: "hardlock" | "firewall") => (ctx: CanvasRenderingContext2D) => {
    const b: WorldBuilding = { id: 0, u: "", f: 2, t: 6, p };
    drawBuilding(ctx, 48, 48, tierScale(6) * 56, b);
  };

  return (
    <div className="space-y-6">
      {/* Families × tier ladder */}
      {FAMILY_KEYS.map((key, fam) => (
        <section key={fam} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gray-200">
            <span
              className="inline-block h-3 w-3 rounded-[2px]"
              style={{ background: familyStyle(fam).fill }}
            />
            {key ? professionName(key, locale) : t.catalogUnassigned}
          </h2>
          <div className="flex flex-wrap gap-3">
            {tiers.map((tier) => (
              <Plate
                key={tier}
                width={96}
                height={96}
                draw={building(fam, tier)}
                label={`${t.catalogStage.replace("{n}", String(tier))}`}
                sub={t.catalogTierValue.replace(
                  "{mult}",
                  tier === 14 ? "8192+" : String(2 ** (tier - 1))
                )}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Protection states */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-gray-200">{t.catalogSectionProtection}</h2>
        <div className="flex flex-wrap gap-3">
          <Plate width={96} height={96} draw={protectedBuilding("firewall")} label={t.catalogFirewall} />
          <Plate width={96} height={96} draw={protectedBuilding("hardlock")} label={t.catalogHardLock} />
        </div>
      </section>

      {/* HQ stages */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-gray-200">{t.catalogSectionHq}</h2>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3].map((stage) => (
            <Plate
              key={stage}
              width={110}
              height={110}
              draw={(ctx) => drawHq(ctx, 55, 55, 64, stage)}
              label={t.catalogStage.replace("{n}", String(stage))}
            />
          ))}
        </div>
      </section>

      {/* The six Founder landmarks */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-gray-200">{t.catalogSectionLandmarks}</h2>
        <div className="flex flex-wrap gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Plate
              key={i}
              width={88}
              height={88}
              draw={(ctx) => drawLandmark(ctx, 44, 44, 56)}
              label={t.city2dLandmark}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
