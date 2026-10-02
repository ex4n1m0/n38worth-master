"use client";

import { useEffect, useRef, useState } from "react";
import { BLUEPRINT } from "@/lib/city/map2d/palette";
import type { PlateSubject } from "@/lib/city/map3d/plate";
import { useLanguage } from "@/components/LanguageContext";

/**
 * Catalog plates (/catalog): the two static rendering surfaces every catalog
 * subject is photographed on.
 *
 * Plate2D — canvas 2D, drawn by the exact map2d primitives the live Blueprint
 * world map uses (same module imports — never a copy).
 * Plate3D  — an offscreen WebGL shot from map3d/plate.ts, which builds its
 * subjects with the SAME exported engine builders as the live 3D view.
 * If a plate and the world map disagree, one of them is buggy by definition.
 */

interface CaptionedProps {
  label: string;
  sub?: string;
}

export function Plate2D({
  width,
  height,
  draw,
  label,
  sub,
}: CaptionedProps & {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
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
    <PlateFrame width={width} height={height} label={label} sub={sub}>
      <canvas ref={ref} role="img" aria-label={label} className="block" />
    </PlateFrame>
  );
}

export function Plate3D({
  subject,
  size = 100,
  label,
  sub,
}: CaptionedProps & {
  subject: PlateSubject;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<"pending" | "ok" | "failed">("pending");
  const { t } = useLanguage();
  const subjectKey = JSON.stringify(subject);

  useEffect(() => {
    let alive = true;
    const canvas = ref.current;
    if (!canvas) return;
    setState("pending");
    void (async () => {
      try {
        const mod = await import("@/lib/city/map3d/plate");
        if (!alive) return;
        mod.renderPlate(
          JSON.parse(subjectKey) as PlateSubject,
          canvas,
          size,
          (ok) => {
            if (alive) setState(ok ? "ok" : "failed");
          }
        );
      } catch (err) {
        console.error("3D catalog plate failed", err);
        if (alive) setState("failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [subjectKey, size]);

  return (
    <PlateFrame width={size} height={size} label={label} sub={sub}>
      <canvas ref={ref} role="img" aria-label={label} className="block" />
      {state !== "ok" && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="rounded-full bg-[#F4F1E8]/85 px-2 py-0.5 text-[10px] font-semibold text-[#33506B]/70">
            {state === "pending" ? t.catalog3dLoading : t.catalog3dUnavailable}
          </span>
        </span>
      )}
    </PlateFrame>
  );
}

function PlateFrame({
  width,
  height,
  label,
  sub,
  children,
}: CaptionedProps & {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <div
        className="relative overflow-hidden rounded-lg border border-[#33506B]/30 bg-[#F4F1E8]"
        style={{ width, height }}
      >
        {children}
      </div>
      <figcaption className="text-center leading-tight">
        <span className="block text-[11px] font-bold text-gray-300">{label}</span>
        {sub ? <span className="block text-[10px] text-gray-500">{sub}</span> : null}
      </figcaption>
    </figure>
  );
}
