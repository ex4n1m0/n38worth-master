/**
 * Static building preview for avatar cards (the "Buildings" browse grid).
 * A THIN SVG RENDERER over the pure art spec (src/lib/city/building-art.ts):
 *
 *   tiers 1–7  → CIVIC preview (family stack + shared tier features)
 *   tiers 8–14 → GRAND preview (the family megaform: taller massing, glow
 *                band, halo rings, crown/spire — one more detail per tier)
 *   goddesses  → their LANDMARK monument echo (stage-2 elaborated form)
 *
 * Pure display: the tier derives from the SAME `buildingTier` the city
 * projection uses, so the preview always matches the building that hire
 * would add to the city. The geometry itself lives in the pure module —
 * this file only maps one ArtShape to one SVG element, in spec order
 * (= paint order), emitting only the attributes the spec sets.
 */

import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { buildingTier } from "@/lib/city/projection";
import {
  buildingArt,
  monumentArt,
  type ArtShape,
  type ArtSpec,
} from "@/lib/city/building-art";
import { cn } from "@/lib/utils";

interface BuildingSpriteProps {
  /** Card id — drives the deterministic detail seed. */
  cardId: number;
  /** DB profession name (family); null/unknown → Unassigned. */
  profession?: string | null;
  playerValue: number;
  valueFloor: number;
  /** Raw goddess username — renders the landmark monument instead. */
  goddessUsername?: string;
  /** Width-side layout hook; height follows the art's aspect ratio. */
  className?: string;
  /** Tooltip (already localized by the caller). */
  title?: string;
}

export function BuildingSprite({
  cardId,
  profession,
  playerValue,
  valueFloor,
  goddessUsername,
  className,
  title,
}: BuildingSpriteProps) {
  if (goddessUsername) {
    const index = GODDESS_USERNAMES.indexOf(goddessUsername);
    if (index >= 0) {
      return <ArtCard spec={monumentArt(index)} className={className} title={title} />;
    }
  }
  const tier = buildingTier(playerValue, valueFloor);
  return (
    <ArtCard
      spec={buildingArt({ tier, family: profession, seed: cardId })}
      className={className}
      title={title}
    />
  );
}

function ArtCard({
  spec,
  className,
  title,
}: {
  spec: ArtSpec;
  className?: string;
  title?: string;
}) {
  return (
    <div
      aria-hidden="true"
      title={title}
      className={cn(
        "relative overflow-hidden shrink-0 flex items-end justify-center",
        className
      )}
    >
      <svg
        viewBox={`0 0 ${spec.w} ${spec.h}`}
        className="w-full h-auto select-none pointer-events-none"
        role="presentation"
      >
        {spec.shapes.map((shape, i) => (
          <ShapeNode key={i} shape={shape} />
        ))}
      </svg>
    </div>
  );
}

/** One ArtShape → one SVG element. Unset style props are passed as
 *  undefined so React omits the attribute entirely (matching the hand-
 *  written elements this replaces). Shapes flagged pulse carry the CSS
 *  opacity beacon (static under reduced motion). */
function ShapeNode({ shape: s }: { shape: ArtShape }) {
  const pulseClass =
    "pulse" in s && s.pulse ? "animate-pulse motion-reduce:animate-none" : undefined;
  switch (s.kind) {
    case "poly":
      return (
        <polygon
          points={s.pts.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={s.fill}
          opacity={s.opacity}
          stroke={s.stroke}
          strokeWidth={s.strokeW}
          className={pulseClass}
        />
      );
    case "rect":
      return (
        <rect
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          rx={s.rx}
          fill={s.fill}
          opacity={s.opacity}
          stroke={s.stroke}
          strokeWidth={s.strokeW}
          className={pulseClass}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={s.cx}
          cy={s.cy}
          rx={s.rx}
          ry={s.ry}
          fill={s.fill}
          stroke={s.stroke}
          strokeWidth={s.strokeW}
          opacity={s.opacity}
          className={pulseClass}
        />
      );
    case "circle":
      return (
        <circle
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          fill={s.fill}
          stroke={s.stroke}
          strokeWidth={s.strokeW}
          opacity={s.opacity}
          className={pulseClass}
        />
      );
    case "line":
      return (
        <line
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={s.stroke}
          strokeWidth={s.strokeW}
          opacity={s.opacity}
        />
      );
    case "path":
      return (
        <path
          d={s.d}
          fill={s.fill}
          stroke={s.stroke}
          strokeWidth={s.strokeW}
          opacity={s.opacity}
        />
      );
  }
}
