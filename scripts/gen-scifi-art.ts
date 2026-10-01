/**
 * Placeholder-art generator for the CITY BUILDING rebrand (2026-09-29):
 * night-skyline placeholder art for the six Founders, the six trades, the
 * Land Grab / Aerial View / +10 Plots bonus cards, the off-market avatar,
 * the landing hero, the city-rebuild backdrop, the social/OG card, and the
 * app icon.
 *
 * Everything is drawn as SVG (skyline silhouettes with lit windows,
 * blueprint grid lines, construction cranes, glyph + label) and rasterized
 * to WebP with sharp. Replace with hand-made art whenever ready — filenames
 * are referenced from professions.ts, rebrand-goddess-art.ts, MassHireCard,
 * RevealCard, TenSlotsCard, page.tsx and WorldRebootingOverlay.
 *
 * NOTE: filenames intentionally keep their historical names (TheOracle.webp
 * is The Surveyor's art etc.) — they are DB avatarUrl contracts.
 *
 * Run: npm run gen:scifi-art
 */
import * as path from "path";
import * as fs from "fs";
import sharp from "sharp";

const PUBLIC = path.join(process.cwd(), "public");

/* ── Deterministic RNG so regenerating produces identical art ── */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CardSpec {
  file: string;
  glyph: string;
  label: string;
  sub: string;
  /** Accent color (hex). */
  accent: string;
  /** RNG seed. */
  seed: number;
}

const CARDS: CardSpec[] = [
  // ── The Founders (landmark cards; filenames are DB avatarUrl contracts) ──
  { file: "TheBanker.webp",     glyph: "$",  label: "THE BANKER",     sub: "founder · double rent",      accent: "#ffd24a", seed: 101 },
  { file: "TheOracle.webp",     glyph: "@",  label: "THE SURVEYOR",   sub: "founder · total sight",     accent: "#37e6ff", seed: 102 },
  { file: "TheLocksmith.webp",  glyph: "#",  label: "THE REGISTRAR",  sub: "founder · sealed deeds",    accent: "#ffb020", seed: 103 },
  { file: "TheClockkeeper.webp",glyph: "▲",  label: "THE FOREMAN",    sub: "founder · 2x paydays",      accent: "#2ee6c8", seed: 104 },
  { file: "NullPointer.webp",   glyph: "Ø",  label: "THE WRECKER",    sub: "founder · free foreclosures", accent: "#ff4a3d", seed: 105 },
  { file: "TheArchitect.webp",  glyph: "Ω",  label: "THE ARCHITECT",  sub: "founder · all powers",      accent: "#c8ffd0", seed: 106 },
  // ── Trades (filenames keyed by the DB profession values) ──
  { file: "NewCryptographer.webp", glyph: "§", label: "NOTARY",       sub: "longer deed locks",   accent: "#7dff9e", seed: 201 },
  { file: "NewZeroDay.webp",       glyph: "!", label: "AUCTIONEER",   sub: "cheaper foreclosures", accent: "#ff7d5e", seed: 202 },
  { file: "NewOverclocker.webp",   glyph: "^", label: "RENOVATOR",    sub: "cheaper renovations", accent: "#ff5ed6", seed: 203 },
  { file: "NewCacheKeeper.webp",   glyph: "=", label: "VAULT KEEPER", sub: "bigger daily dividend", accent: "#5eff8a", seed: 204 },
  { file: "NewServerMarshal.webp", glyph: "▮", label: "CITY PLANNER", sub: "+2 land plots",       accent: "#8fb8ff", seed: 205 },
  { file: "NewBotHerder.webp",     glyph: "*", label: "PROSPECTOR",   sub: "land grab +1",        accent: "#ffe14a", seed: 206 },
  // ── Bonus cards ──
  { file: "botnet.webp",    glyph: "≡", label: "LAND GRAB",   sub: "bulk acquire",          accent: "#ffd24a", seed: 301 },
  { file: "scan.webp",      glyph: "◎", label: "AERIAL VIEW", sub: "see every building",    accent: "#b18cff", seed: 302 },
  { file: "10slots.webp",   glyph: "+", label: "+10 PLOTS",   sub: "expand your city",      accent: "#4ac8ff", seed: 303 },
  // ── Off-market placeholder (shown for every unowned card — filename is
  //    stored on DB rows, keep it) ──
  { file: "NEW_HIDDEN.webp", glyph: "?", label: "OFF-MARKET", sub: "acquire to reveal", accent: "#7dd3fc", seed: 401 },
];

/** Deterministic night-skyline silhouette with lit windows. */
function skyline(
  rand: () => number,
  w: number,
  baseY: number,
  maxH: number,
  fill: string,
  lit: boolean,
  windowColor = "#ffd24a"
): string {
  let x = -10;
  let out = "";
  while (x < w) {
    const bw = Math.floor(18 + rand() * 58);
    const bh = Math.floor(maxH * (0.25 + rand() * 0.75));
    const y = baseY - bh;
    out += `<rect x="${x}" y="${y}" width="${bw}" height="${bh + 4}" fill="${fill}"/>`;
    // Occasional rooftop antenna
    if (rand() < 0.3) {
      out += `<line x1="${x + bw / 2}" y1="${y}" x2="${x + bw / 2}" y2="${y - 6 - Math.floor(rand() * 10)}" stroke="${fill}" stroke-width="2"/>`;
    }
    if (lit) {
      for (let wy = y + 7; wy < baseY - 6; wy += 11) {
        for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
          if (rand() < 0.3) {
            out += `<rect x="${wx}" y="${wy}" width="3" height="5" fill="${windowColor}" opacity="${(0.25 + rand() * 0.55).toFixed(2)}"/>`;
          }
        }
      }
    }
    x += bw + Math.floor(3 + rand() * 6);
  }
  return out;
}

/** Simple line-art tower crane. */
function crane(x: number, baseY: number, h: number, color: string, op: number): string {
  const top = baseY - h;
  const jib = Math.floor(h * 0.9);
  return `<g stroke="${color}" stroke-width="3" fill="none" opacity="${op}" stroke-linecap="round">
    <line x1="${x}" y1="${baseY}" x2="${x}" y2="${top}"/>
    <line x1="${x - 12}" y1="${baseY}" x2="${x + 12}" y2="${baseY}"/>
    <line x1="${x - 5}" y1="${baseY - h * 0.35}" x2="${x + 5}" y2="${baseY - h * 0.55}"/>
    <line x1="${x + 5}" y1="${baseY - h * 0.35}" x2="${x - 5}" y2="${baseY - h * 0.55}"/>
    <line x1="${x - 4}" y1="${baseY - h * 0.75}" x2="${x + 4}" y2="${baseY - h * 0.92}"/>
    <line x1="${x + 4}" y1="${baseY - h * 0.75}" x2="${x - 4}" y2="${baseY - h * 0.92}"/>
    <line x1="${x}" y1="${top}" x2="${x + jib}" y2="${top + 6}"/>
    <line x1="${x}" y1="${top}" x2="${x - jib * 0.45}" y2="${top + 8}"/>
    <line x1="${x - jib * 0.45}" y1="${top + 8}" x2="${x - jib * 0.45 + 14}" y2="${top + 20}"/>
    <line x1="${x - jib * 0.45}" y1="${top + 8}" x2="${x - 6}" y2="${top + 4}"/>
    <line x1="${x + jib}" y1="${top + 6}" x2="${x + 6}" y2="${top + 2}"/>
    <line x1="${x + jib * 0.72}" y1="${top + 5}" x2="${x + jib * 0.72}" y2="${top + Math.floor(h * 0.3)}"/>
    <rect x="${x + jib * 0.72 - 8}" y="${top + Math.floor(h * 0.3)}" width="16" height="16" fill="${color}" stroke="none"/>
  </g>`;
}

/** Square Founder/trade card SVG. */
function cardSvg(spec: CardSpec, size: number): string {
  const rand = mulberry32(spec.seed);
  const pad = Math.floor(size * 0.09);
  const glyphSize = Math.floor(size * 0.34);
  const baseY = Math.floor(size * 0.995);

  // Blueprint grid
  let grid = "";
  const step = Math.floor(size / 12);
  for (let g = step; g < size; g += step) {
    grid += `<line x1="${g}" y1="0" x2="${g}" y2="${size}" stroke="${spec.accent}" stroke-width="1" opacity="0.05"/>`;
    grid += `<line x1="0" y1="${g}" x2="${size}" y2="${g}" stroke="${spec.accent}" stroke-width="1" opacity="0.05"/>`;
  }

  const sky = skyline(rand, size, baseY, Math.floor(size * 0.26), "#04160b", true, spec.accent);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="${spec.accent}" stop-opacity="0.30"/>
      <stop offset="60%" stop-color="${spec.accent}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#07130c"/>
      <stop offset="55%" stop-color="#030b06"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
    <linearGradient id="skyfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <filter id="blurGlow"><feGaussianBlur stdDeviation="${Math.floor(size * 0.02)}"/></filter>
  </defs>

  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  ${grid}
  ${sky}
  <rect x="0" y="${baseY - size * 0.26}" width="${size}" height="${size * 0.26}" fill="url(#skyfade)"/>
  <rect width="${size}" height="${size}" fill="url(#glow)"/>

  <!-- Central glyph with glow -->
  <text x="${size / 2}" y="${size * 0.42}" text-anchor="middle" dominant-baseline="middle"
        font-family="Consolas, 'Courier New', monospace" font-weight="bold"
        font-size="${glyphSize}" fill="${spec.accent}" opacity="0.35" filter="url(#blurGlow)">${spec.glyph}</text>
  <text x="${size / 2}" y="${size * 0.42}" text-anchor="middle" dominant-baseline="middle"
        font-family="Consolas, 'Courier New', monospace" font-weight="bold"
        font-size="${glyphSize}" fill="${spec.accent}">${spec.glyph}</text>

  <!-- Corner brackets (plot markers) -->
  <g stroke="${spec.accent}" stroke-width="${Math.max(2, Math.floor(size * 0.006))}" fill="none" opacity="0.8">
    <path d="M ${pad} ${pad + 26} L ${pad} ${pad} L ${pad + 26} ${pad}"/>
    <path d="M ${size - pad - 26} ${pad} L ${size - pad} ${pad} L ${size - pad} ${pad + 26}"/>
    <path d="M ${size - pad} ${size - pad - 26} L ${size - pad} ${size - pad} L ${size - pad - 26} ${size - pad}"/>
    <path d="M ${pad + 26} ${size - pad} L ${pad} ${size - pad} L ${pad} ${size - pad - 26}"/>
  </g>

  <!-- Label block -->
  <text x="${size / 2}" y="${size * 0.72}" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace" font-weight="bold"
        font-size="${Math.floor(size * 0.052)}" fill="#e8ffe8" letter-spacing="${Math.floor(size * 0.008)}">${spec.label}</text>
  <text x="${size / 2}" y="${size * 0.78}" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace"
        font-size="${Math.floor(size * 0.032)}" fill="${spec.accent}" opacity="0.85">${spec.sub}</text>
  <text x="${size / 2}" y="${size * 0.85}" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace"
        font-size="${Math.floor(size * 0.024)}" fill="#5f8f6f" opacity="0.8">n38worth // the city</text>
</svg>`;
}

/** Wide hero / rebuild backdrop SVG (skyline + cranes + dawn glow). */
function backdropSvg(w: number, h: number, seed: number, opts: { cranes: boolean; dawn: boolean }): string {
  const rand = mulberry32(seed);
  const horizonY = Math.floor(h * 0.78);

  const sky = skyline(rand, w, horizonY, Math.floor(h * 0.5), "#04160b", true);
  const far = skyline(rand, w, horizonY - Math.floor(h * 0.04), Math.floor(h * 0.34), "#020c07", false);

  let cranes = "";
  if (opts.cranes) {
    cranes = crane(Math.floor(w * 0.24), horizonY, Math.floor(h * 0.34), "#00ff41", 0.5) +
             crane(Math.floor(w * 0.73), horizonY, Math.floor(h * 0.28), "#ffd24a", 0.45);
  }

  const dawnStops = opts.dawn
    ? `<stop offset="0%" stop-color="#000000"/>
       <stop offset="55%" stop-color="#160d02"/>
       <stop offset="78%" stop-color="#2a1a04"/>
       <stop offset="100%" stop-color="#000000"/>`
    : `<stop offset="0%" stop-color="#000000"/>
       <stop offset="55%" stop-color="#02150a"/>
       <stop offset="100%" stop-color="#000000"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">${dawnStops}</linearGradient>
    <radialGradient id="vig" cx="50%" cy="45%" r="75%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.9"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${far}
  ${sky}
  ${cranes}
  <line x1="0" y1="${horizonY}" x2="${w}" y2="${horizonY}" stroke="${opts.dawn ? "#ffb020" : "#00ff41"}" stroke-width="2" opacity="0.3"/>
  <rect width="${w}" height="${h}" fill="url(#vig)"/>
</svg>`;
}

/** Social/OG card (1200×630) — wordmark over the skyline. */
function ogSvg(w: number, h: number): string {
  const rand = mulberry32(501);
  const horizonY = Math.floor(h * 0.86);

  const sky = skyline(rand, w, horizonY, Math.floor(h * 0.5), "#04160b", true);
  const craneArt = crane(Math.floor(w * 0.82), horizonY, Math.floor(h * 0.38), "#00ff41", 0.55);

  const pad = 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000"/>
      <stop offset="55%" stop-color="#02150a"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="45%" r="75%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.9"/>
    </radialGradient>
    <linearGradient id="word" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7dfba0"/>
      <stop offset="50%" stop-color="#c9a2f5"/>
      <stop offset="100%" stop-color="#2fe07f"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="16"/></filter>
  </defs>

  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${sky}
  ${craneArt}
  <line x1="0" y1="${horizonY}" x2="${w}" y2="${horizonY}" stroke="#00ff41" stroke-width="2" opacity="0.3"/>
  <rect width="${w}" height="${h}" fill="url(#vig)"/>

  <!-- Plot corner brackets -->
  <g stroke="#00ff41" stroke-width="3" fill="none" opacity="0.75">
    <path d="M ${pad} ${pad + 30} L ${pad} ${pad} L ${pad + 30} ${pad}"/>
    <path d="M ${w - pad - 30} ${pad} L ${w - pad} ${pad} L ${w - pad} ${pad + 30}"/>
    <path d="M ${w - pad} ${h - pad - 30} L ${w - pad} ${h - pad} L ${w - pad - 30} ${h - pad}"/>
    <path d="M ${pad + 30} ${h - pad} L ${pad} ${h - pad} L ${pad} ${h - pad - 30}"/>
  </g>

  <!-- Blueprint kicker -->
  <text x="${w / 2}" y="140" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace" font-size="26" fill="#5f8f6f">plot surveyed · vaults located…</text>

  <!-- Wordmark (glow copy + gradient fill), mirroring the landing title -->
  <text x="${w / 2}" y="300" text-anchor="middle" dominant-baseline="middle"
        font-family="Consolas, 'Courier New', monospace" font-weight="bold"
        font-size="150" fill="#00ff41" opacity="0.35" filter="url(#glow)">n38worth</text>
  <text x="${w / 2}" y="300" text-anchor="middle" dominant-baseline="middle"
        font-family="Consolas, 'Courier New', monospace" font-weight="bold"
        font-size="150" fill="url(#word)">n38worth</text>

  <!-- Tagline + action line -->
  <text x="${w / 2}" y="400" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace" font-weight="bold"
        font-size="30" letter-spacing="12" fill="#e8ffe8">THE CITY HEIST SIMULATION</text>
  <text x="${w / 2}" y="455" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace"
        font-size="24" fill="#00ff41" opacity="0.9">acquire · raid · crown the skyline</text>

  <!-- Footer -->
  <text x="${w / 2}" y="${h - 74}" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace"
        font-size="20" fill="#5f8f6f">n38worth.com // crown the skyline</text>
</svg>`;
}

/** Skyline app icon (replaces the old terminal ">_" icon). */
function iconSvg(size: number): string {
  const pad = Math.floor(size * 0.16);
  const base = size - pad;
  const maxH = size - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#063f1c"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.floor(size * 0.18)}" fill="url(#g)"/>
  <rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="${Math.floor(size * 0.18)}" fill="none" stroke="#00ff41" stroke-width="${Math.max(2, Math.floor(size * 0.02))}" opacity="0.9"/>
  <!-- Three-tower skyline with lit windows -->
  <g fill="#00ff41">
    <rect x="${size * 0.28}" y="${base - maxH}" width="${size * 0.16}" height="${maxH}"/>
    <rect x="${size * 0.47}" y="${base - maxH * 0.68}" width="${size * 0.14}" height="${maxH * 0.68}"/>
    <rect x="${size * 0.64}" y="${base - maxH * 0.42}" width="${size * 0.12}" height="${maxH * 0.42}"/>
    <line x1="${size * 0.36}" y1="${base - maxH}" x2="${size * 0.36}" y2="${base - maxH - size * 0.06}" stroke="#00ff41" stroke-width="${Math.max(3, size * 0.015)}"/>
  </g>
  <g fill="#eafff0">
    <rect x="${size * 0.315}" y="${base - maxH + size * 0.05}" width="${size * 0.035}" height="${size * 0.045}"/>
    <rect x="${size * 0.37}" y="${base - maxH + size * 0.14}" width="${size * 0.035}" height="${size * 0.045}"/>
    <rect x="${size * 0.505}" y="${base - maxH * 0.68 + size * 0.06}" width="${size * 0.032}" height="${size * 0.042}"/>
  </g>
</svg>`;
}

async function main() {
  fs.mkdirSync(PUBLIC, { recursive: true });

  for (const spec of CARDS) {
    await sharp(Buffer.from(cardSvg(spec, 1024))).webp({ quality: 88 }).toFile(path.join(PUBLIC, spec.file));
    console.log("•", spec.file);
  }

  // NEW_HIDDEN.png twin — legacy placeholder checks/rows reference the .png path
  const hiddenSpec = CARDS.find((s) => s.file === "NEW_HIDDEN.webp")!;
  await sharp(Buffer.from(cardSvg(hiddenSpec, 1024))).png().toFile(path.join(PUBLIC, "NEW_HIDDEN.png"));
  console.log("• NEW_HIDDEN.png");

  // Landing hero backdrop (portrait-ish crop-safe landscape) — city skyline
  await sharp(Buffer.from(backdropSvg(1920, 1280, 42, { cranes: true, dawn: false })))
    .webp({ quality: 85 })
    .toFile(path.join(PUBLIC, "simulation.webp"));
  console.log("• simulation.webp");

  // City-rebuild backdrop (used behind the rebuild overlay) — cranes at dawn
  await sharp(Buffer.from(backdropSvg(1920, 1080, 77, { cranes: true, dawn: true })))
    .webp({ quality: 85 })
    .toFile(path.join(PUBLIC, "reboot.webp"));
  console.log("• reboot.webp");

  // Social/OG card — served by src/app/opengraph-image.tsx and twitter-image.tsx
  await sharp(Buffer.from(ogSvg(1200, 630))).jpeg({ quality: 88 }).toFile(path.join(PUBLIC, "og.jpg"));
  console.log("• og.jpg");

  // App icon (brand favicon — skyline glyph)
  await sharp(Buffer.from(iconSvg(512))).png().toFile(path.join(PUBLIC, "VW_Icon.png"));
  console.log("• VW_Icon.png");

  console.log("✅ City placeholder art generated.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
