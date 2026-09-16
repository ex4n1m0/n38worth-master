/**
 * One-time art generator for the sci-fi rebrand: terminal/matrix-style
 * placeholder art for the Six daemons, the six professions, the Botnet,
 * Scan and 10 Slots bonus cards, the masked avatar, the landing hero,
 * the social/OG card, and the simulation-reboot backdrop.
 *
 * Everything is drawn as SVG (gradients, code-rain columns, grid lines,
 * reticle brackets, monospace glyph + label) and rasterized to WebP with
 * sharp. Replace these with hand-made art whenever ready — filenames are
 * referenced from professions.ts, rebrand-goddess-art.ts, MassHireCard,
 * RevealCard, page.tsx and WorldRebootingOverlay.
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
  // ── The Six (daemon cards) ──
  { file: "TheBanker.webp",     glyph: "$",  label: "THE BANKER",     sub: "daemon · double yield",   accent: "#ffd24a", seed: 101 },
  { file: "TheOracle.webp",     glyph: "@",  label: "THE ORACLE",     sub: "daemon · total sight",    accent: "#37e6ff", seed: 102 },
  { file: "TheLocksmith.webp",  glyph: "#",  label: "THE LOCKSMITH",  sub: "daemon · hard-lock",      accent: "#ffb020", seed: 103 },
  { file: "TheClockkeeper.webp",glyph: "%",  label: "THE CLOCKKEEPER",sub: "daemon · 2x cadence",     accent: "#2ee6c8", seed: 104 },
  { file: "NullPointer.webp",   glyph: "Ø",  label: "NULLPOINTER",    sub: "daemon · free breaches",  accent: "#ff4a3d", seed: 105 },
  { file: "TheArchitect.webp",  glyph: "Ω",  label: "THE ARCHITECT",  sub: "daemon · all powers",     accent: "#c8ffd0", seed: 106 },
  // ── Professions ──
  { file: "NewCryptographer.webp", glyph: "§", label: "CRYPTOGRAPHER", sub: "longer firewalls",       accent: "#7dff9e", seed: 201 },
  { file: "NewZeroDay.webp",       glyph: "!", label: "ZERO-DAY",      sub: "cheaper breaches",       accent: "#ff7d5e", seed: 202 },
  { file: "NewOverclocker.webp",   glyph: "^", label: "OVERCLOCKER",   sub: "cheaper overclocks",     accent: "#ff5ed6", seed: 203 },
  { file: "NewCacheKeeper.webp",   glyph: "=", label: "CACHE KEEPER",  sub: "bigger login reward",    accent: "#5eff8a", seed: 204 },
  { file: "NewServerMarshal.webp", glyph: "▮", label: "SERVER MARSHAL",sub: "+2 hire slots",          accent: "#8fb8ff", seed: 205 },
  { file: "NewBotHerder.webp",     glyph: "*", label: "BOT HERDER",    sub: "wider botnet",           accent: "#ffe14a", seed: 206 },
  // ── Bonus cards ──
  { file: "botnet.webp",    glyph: "≡", label: "BOTNET",   sub: "bulk hire",     accent: "#ffd24a", seed: 301 },
  { file: "scan.webp",      glyph: "◎", label: "SCAN",     sub: "decloak all",   accent: "#b18cff", seed: 302 },
  { file: "10slots.webp",   glyph: "+", label: "10 SLOTS", sub: "+10 hire slots", accent: "#4ac8ff", seed: 303 },
  // ── Masked avatar placeholder (shown for every player the viewer
  //    hasn't hired — filename is stored on DB rows, keep it) ──
  { file: "NEW_HIDDEN.webp", glyph: "?", label: "CLOAKED", sub: "hire to reveal", accent: "#7dd3fc", seed: 401 },
];

/** Faint falling-code columns as SVG text elements. */
function codeRain(rand: () => number, w: number, h: number, count: number, accent: string): string {
  const glyphs = "01[]/=+*#$%@アイウエオカキクケコサシスセソ";
  let out = "";
  for (let c = 0; c < count; c++) {
    const x = Math.floor(rand() * w);
    const size = 10 + Math.floor(rand() * 10);
    const startY = -Math.floor(rand() * h);
    const chars = 8 + Math.floor(rand() * 16);
    const opacity = 0.05 + rand() * 0.12;
    let text = "";
    for (let i = 0; i < chars; i++) {
      text += glyphs[Math.floor(rand() * glyphs.length)] + "\n";
    }
    out += `<text x="${x}" y="${startY}" font-family="Consolas, 'Courier New', monospace" font-size="${size}" fill="${accent}" opacity="${opacity.toFixed(3)}" xml:space="preserve">${text}</text>`;
  }
  return out;
}

/** Square daemon/profession card SVG. */
function cardSvg(spec: CardSpec, size: number): string {
  const rand = mulberry32(spec.seed);
  const pad = Math.floor(size * 0.09);
  const glyphSize = Math.floor(size * 0.4);

  // Grid lines
  let grid = "";
  const step = Math.floor(size / 12);
  for (let g = step; g < size; g += step) {
    grid += `<line x1="${g}" y1="0" x2="${g}" y2="${size}" stroke="${spec.accent}" stroke-width="1" opacity="0.05"/>`;
    grid += `<line x1="0" y1="${g}" x2="${size}" y2="${g}" stroke="${spec.accent}" stroke-width="1" opacity="0.05"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="55%">
      <stop offset="0%" stop-color="${spec.accent}" stop-opacity="0.32"/>
      <stop offset="60%" stop-color="${spec.accent}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#031007"/>
      <stop offset="55%" stop-color="#010803"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
    <filter id="blurGlow"><feGaussianBlur stdDeviation="${Math.floor(size * 0.02)}"/></filter>
  </defs>

  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  ${codeRain(rand, size, size, 26, "#00ff41")}
  ${grid}
  <rect width="${size}" height="${size}" fill="url(#glow)"/>

  <!-- Central glyph with glow -->
  <text x="${size / 2}" y="${size * 0.46}" text-anchor="middle" dominant-baseline="middle"
        font-family="Consolas, 'Courier New', monospace" font-weight="bold"
        font-size="${glyphSize}" fill="${spec.accent}" opacity="0.35" filter="url(#blurGlow)">${spec.glyph}</text>
  <text x="${size / 2}" y="${size * 0.46}" text-anchor="middle" dominant-baseline="middle"
        font-family="Consolas, 'Courier New', monospace" font-weight="bold"
        font-size="${glyphSize}" fill="${spec.accent}">${spec.glyph}</text>

  <!-- Reticle corner brackets -->
  <g stroke="${spec.accent}" stroke-width="${Math.max(2, Math.floor(size * 0.006))}" fill="none" opacity="0.8">
    <path d="M ${pad} ${pad + 26} L ${pad} ${pad} L ${pad + 26} ${pad}"/>
    <path d="M ${size - pad - 26} ${pad} L ${size - pad} ${pad} L ${size - pad} ${pad + 26}"/>
    <path d="M ${size - pad} ${size - pad - 26} L ${size - pad} ${size - pad} L ${size - pad - 26} ${size - pad}"/>
    <path d="M ${pad + 26} ${size - pad} L ${pad} ${size - pad} L ${pad} ${size - pad - 26}"/>
  </g>

  <!-- Label block -->
  <text x="${size / 2}" y="${size * 0.79}" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace" font-weight="bold"
        font-size="${Math.floor(size * 0.052)}" fill="#e8ffe8" letter-spacing="${Math.floor(size * 0.008)}">${spec.label}</text>
  <text x="${size / 2}" y="${size * 0.86}" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace"
        font-size="${Math.floor(size * 0.032)}" fill="${spec.accent}" opacity="0.85">${spec.sub}</text>
  <text x="${size / 2}" y="${size * 0.93}" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace"
        font-size="${Math.floor(size * 0.024)}" fill="#5f8f6f" opacity="0.8">n38worth // simulation</text>
</svg>`;
}

/** Wide hero / reboot backdrop SVG (perspective grid + heavy rain). */
function backdropSvg(w: number, h: number, seed: number, opts: { rain: number; horizon: boolean }): string {
  const rand = mulberry32(seed);
  const horizonY = Math.floor(h * 0.62);

  let perspective = "";
  if (opts.horizon) {
    // Vertical rays converging to the horizon
    for (let i = -14; i <= 14; i++) {
      const xBottom = w / 2 + i * (w / 8);
      perspective += `<line x1="${w / 2 + i * (w / 60)}" y1="${horizonY}" x2="${xBottom}" y2="${h}" stroke="#00ff41" stroke-width="1" opacity="0.10"/>`;
    }
    // Horizontal lines spacing out toward the viewer
    let y = horizonY;
    let gap = 4;
    while (y < h) {
      perspective += `<line x1="0" y1="${Math.floor(y)}" x2="${w}" y2="${Math.floor(y)}" stroke="#00ff41" stroke-width="1" opacity="0.10"/>`;
      y += gap;
      gap *= 1.35;
    }
    // Horizon glow line
    perspective += `<line x1="0" y1="${horizonY}" x2="${w}" y2="${horizonY}" stroke="#00ff41" stroke-width="2" opacity="0.35"/>`;
  }

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
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${codeRain(rand, w, h, opts.rain, "#00ff41")}
  ${perspective}
  <rect width="${w}" height="${h}" fill="url(#vig)"/>
</svg>`;
}

/** Social/OG card (1200×630) — wordmark over the terminal backdrop. */
function ogSvg(w: number, h: number): string {
  const rand = mulberry32(501);
  const horizonY = Math.floor(h * 0.8);

  let perspective = "";
  for (let i = -16; i <= 16; i++) {
    const xBottom = w / 2 + i * (w / 7);
    perspective += `<line x1="${w / 2 + i * (w / 70)}" y1="${horizonY}" x2="${xBottom}" y2="${h}" stroke="#00ff41" stroke-width="1" opacity="0.10"/>`;
  }
  let y = horizonY;
  let gap = 5;
  while (y < h) {
    perspective += `<line x1="0" y1="${Math.floor(y)}" x2="${w}" y2="${Math.floor(y)}" stroke="#00ff41" stroke-width="1" opacity="0.10"/>`;
    y += gap;
    gap *= 1.4;
  }

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
  ${codeRain(rand, w, h, 70, "#00ff41")}
  ${perspective}
  <line x1="0" y1="${horizonY}" x2="${w}" y2="${horizonY}" stroke="#00ff41" stroke-width="2" opacity="0.3"/>
  <rect width="${w}" height="${h}" fill="url(#vig)"/>

  <!-- Reticle corner brackets -->
  <g stroke="#00ff41" stroke-width="3" fill="none" opacity="0.75">
    <path d="M ${pad} ${pad + 30} L ${pad} ${pad} L ${pad + 30} ${pad}"/>
    <path d="M ${w - pad - 30} ${pad} L ${w - pad} ${pad} L ${w - pad} ${pad + 30}"/>
    <path d="M ${w - pad} ${h - pad - 30} L ${w - pad} ${h - pad} L ${w - pad - 30} ${h - pad}"/>
    <path d="M ${pad + 30} ${h - pad} L ${pad} ${h - pad} L ${pad} ${h - pad - 30}"/>
  </g>

  <!-- Shell prompt -->
  <text x="${w / 2}" y="140" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace" font-size="26" fill="#5f8f6f">&gt; initializing simulation…</text>

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
        font-size="30" letter-spacing="12" fill="#e8ffe8">THE HUMAN TRADING SIMULATION</text>
  <text x="${w / 2}" y="455" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace"
        font-size="24" fill="#00ff41" opacity="0.9">hire · overclock · trade</text>

  <!-- Footer -->
  <text x="${w / 2}" y="${h - 74}" text-anchor="middle"
        font-family="Consolas, 'Courier New', monospace"
        font-size="20" fill="#5f8f6f">n38worth.com // root the mainframe</text>
</svg>`;
}

/** Terminal ">_" app icon. */
function iconSvg(size: number): string {
  const pad = Math.floor(size * 0.16);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#063f1c"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.floor(size * 0.18)}" fill="url(#g)"/>
  <rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="${Math.floor(size * 0.18)}" fill="none" stroke="#00ff41" stroke-width="${Math.max(2, Math.floor(size * 0.02))}" opacity="0.9"/>
  <text x="${size / 2}" y="${size * 0.54}" text-anchor="middle" dominant-baseline="middle"
        font-family="Consolas, 'Courier New', monospace" font-weight="bold"
        font-size="${Math.floor(size * 0.34)}" fill="#00ff41">&gt;_</text>
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

  // Landing hero backdrop (portrait-ish crop-safe landscape)
  await sharp(Buffer.from(backdropSvg(1920, 1280, 42, { rain: 90, horizon: true })))
    .webp({ quality: 85 })
    .toFile(path.join(PUBLIC, "simulation.webp"));
  console.log("• simulation.webp");

  // Simulation-reboot backdrop (used behind the reboot overlay)
  await sharp(Buffer.from(backdropSvg(1920, 1080, 77, { rain: 70, horizon: false })))
    .webp({ quality: 85 })
    .toFile(path.join(PUBLIC, "reboot.webp"));
  console.log("• reboot.webp");

  // Social/OG card — served by src/app/opengraph-image.tsx and twitter-image.tsx
  await sharp(Buffer.from(ogSvg(1200, 630))).jpeg({ quality: 88 }).toFile(path.join(PUBLIC, "og.jpg"));
  console.log("• og.jpg");

  // App icon (brand favicon — replaces the old VW icon)
  await sharp(Buffer.from(iconSvg(512))).png().toFile(path.join(PUBLIC, "VW_Icon.png"));
  console.log("• VW_Icon.png");

  console.log("✅ Sci-fi placeholder art generated.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
