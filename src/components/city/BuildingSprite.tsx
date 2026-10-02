/**
 * Static building preview for avatar cards (the "Buildings" browse grid).
 *
 * CARD-MATCHES-3D RULING (2026-10-02): the card renders the COMPILED
 * VOLUMES of the shared art spec — buildingArt → compileArtToVolumes →
 * volume-art's 2:1 iso projection — i.e. the exact boxes/spheres/tori the
 * 3D world map builds, with the engine's own face-shading constants. Card
 * and 3D view therefore share ONE art language by construction; whatever
 * the compiler drops (paths, sub-cell detail) also disappears here, which
 * is the intended simplification.
 *
 * Pure display: the tier derives from the SAME `buildingTier` the city
 * projection uses, so the preview always matches the building that hire
 * would add to the city. Goddess cards render their monument echo the same
 * way (monumentArt → volumes).
 */

import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { buildingTier } from "@/lib/city/projection";
import { buildingArt, monumentArt, type ArtShape, type ArtSpec } from "@/lib/city/building-art";
import { ART_K, MONUMENT_K, compileArtToVolumes } from "@/lib/city/map3d/art-geometry";
import { volumesToCardArt } from "@/lib/city/volume-art";
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
  let spec: ArtSpec;
  if (goddessUsername) {
    const index = GODDESS_USERNAMES.indexOf(goddessUsername);
    spec =
      index >= 0
        ? volumesToCardArt(compileArtToVolumes(monumentArt(index), MONUMENT_K), {
            targetWidth: 128,
          })
        : { w: 128, h: 128, shapes: [] };
  } else {
    const tier = buildingTier(playerValue, valueFloor);
    spec = volumesToCardArt(
      compileArtToVolumes(buildingArt({ tier, family: profession, seed: cardId }), ART_K(tier)),
      { targetWidth: 128 }
    );
  }
  return <ArtCard spec={spec} className={className} title={title} />;
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
