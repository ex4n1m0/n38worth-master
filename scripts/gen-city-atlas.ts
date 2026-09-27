/**
 * City building atlas pipeline (CITY_VISUALS_STUDY §Track C / §C3).
 *
 * Deterministic POST-PROCESSING for AI-generated building sprites — the AI
 * generation step itself is manual (drop raw PNGs into scripts/city-art-raw/,
 * prompts + constraints in the study §C2); everything from that directory on
 * is re-runnable and deterministic:
 *
 *   scripts/city-art-raw/<Family>-t<N>.png       base sprite (solid key bg)
 *   scripts/city-art-raw/<Family>-t<N>-e.png     optional emissive-only pass
 *
 *   1. CHROMA KEY      corner-pixel color → alpha (de-fringed edges)
 *   2. HUE CLAMP       saturated+lit pixels are re-hued to the canonical
 *                      FAMILY_NEON_HEX accent (kills model palette drift)
 *   3. TRIM + MIP LADDER  transparent-margin trim, then 256/128/64-px-tall
 *                      WebP variants (close/district/world LOD)
 *   4. MANIFEST        emits city-atlas.generated.ts with the URL table
 *                      consumed by CITY_ART_MANIFEST.atlasByTier
 *
 * Run: npm run gen:city-atlas
 */
import * as path from "path";
import * as fs from "fs";
import sharp from "sharp";
import { FAMILY_NEON_HEX, UNASSIGNED_NEON_HEX } from "../src/lib/city/district";

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "scripts", "city-art-raw");
const OUT_DIR = path.join(ROOT, "public", "city");
const MANIFEST_TS = path.join(
  ROOT, "src", "components", "city", "world", "scene", "city-atlas.generated.ts"
);

/** Output heights per LOD band (px, of the building art itself). */
const MIP_HEIGHTS = [256, 128, 64] as const;
const TIERS = [1, 2, 3, 4, 5, 6, 7] as const;

/** File stem → { family, tier } (e.g. "Server-Marshal-t3-e"). */
function parseStem(stem: string): { family: string; tier: number; emissive: boolean } | null {
  const m = /^(.+)-t([1-7])(-e)?$/.exec(stem);
  if (!m) return null;
  return { family: m[1], tier: Number(m[2]), emissive: !!m[3] };
}

function targetNeonHex(family: string): string {
  return FAMILY_NEON_HEX[family] ?? UNASSIGNED_NEON_HEX;
}

// ── HSL helpers (no deps) ─────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

// ── pipeline steps ────────────────────────────────────────────────────────

/**
 * Chroma key: sample the 4 corner pixels (median), remove pixels within
 * `tol` distance, and soften the alpha of pixels just outside the tolerance
 * (cheap de-fringe). Mutates the raw RGBA buffer in place.
 */
function chromaKey(data: Buffer, w: number, h: number, tol = 90): void {
  const samples: Array<[number, number, number]> = [];
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]] as const) {
    const i = (y * w + x) * 4;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  }
  const key = samples.reduce(
    (acc, s) => [acc[0] + s[0] / 4, acc[1] + s[1] / 4, acc[2] + s[2] / 4],
    [0, 0, 0]
  ) as [number, number, number];
  const soft = tol * 1.35;
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.hypot(data[i] - key[0], data[i + 1] - key[1], data[i + 2] - key[2]);
    if (d < tol) data[i + 3] = 0;
    else if (d < soft) data[i + 3] = Math.round(data[i + 3] * ((d - tol) / (soft - tol)));
  }
}

/**
 * Hue clamp: re-hue saturated, non-dark pixels to the canonical accent hue,
 * preserving each pixel's saturation/lightness (study §C3 step 2 — keeps
 * model-generated variation while locking the family palette).
 */
function hueClamp(data: Buffer, targetHex: string): void {
  const [tr, tg, tb] = [
    parseInt(targetHex.slice(1, 3), 16),
    parseInt(targetHex.slice(3, 5), 16),
    parseInt(targetHex.slice(5, 7), 16),
  ];
  const [targetH] = rgbToHsl(tr, tg, tb);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 24) continue;
    const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.3 || l < 0.22 || l > 0.97) continue; // massing/neutrals/whites stay
    const [r, g, b] = hslToRgb(targetH, s, l);
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
}

interface Processed {
  family: string;
  tier: number;
  emissive: boolean;
  /** Output file basenames per mip (no leading slash). */
  files: string[];
}

async function processOne(file: string): Promise<Processed | null> {
  const stem = path.basename(file, ".png");
  const parsed = parseStem(stem);
  if (!parsed) {
    console.warn(`[gen:city-atlas] skipping unrecognized file: ${file}`);
    return null;
  }
  const { family, tier, emissive } = parsed;
  const neon = targetNeonHex(family);

  const img = sharp(path.join(RAW_DIR, file)).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  chromaKey(data, info.width, info.height);
  if (!emissive) hueClamp(data, neon); // emissive passes are already accent-only

  let out = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  // Trim keyed-transparent margins (top-left pixel is transparent post-key).
  out = out.trim({ threshold: 12 });
  const trimmed = await out.raw().toBuffer({ resolveWithObject: true });

  const files: string[] = [];
  for (const mipH of MIP_HEIGHTS) {
    // Never upscale — small art stays at its natural size.
    const h = Math.min(mipH, trimmed.info.height);
    const w = Math.max(1, Math.round((trimmed.info.width * h) / trimmed.info.height));
    const base = `${stem}-${mipH}.webp`;
    await sharp(trimmed.data, {
      raw: { width: trimmed.info.width, height: trimmed.info.height, channels: 4 },
    })
      .resize(w, h, { fit: "fill", kernel: "lanczos3" })
      .webp({ quality: 82, alphaQuality: 90 })
      .toFile(path.join(OUT_DIR, base));
    files.push(`city/${base}`);
  }
  console.log(`[gen:city-atlas] ${stem} → ${files.map((f) => path.basename(f)).join(", ")}`);
  return { family, tier, emissive, files };
}

function emitManifest(results: Processed[]): void {
  const families = new Map<string, Map<string, string[]>>();
  for (const r of results) {
    if (r.emissive) continue; // manifest v1: base sprites only
    if (!families.has(r.family)) families.set(r.family, new Map());
    families.get(r.family)!.set(String(r.tier), r.files);
  }
  const lines: string[] = [
    "// AUTO-GENERATED by scripts/gen-city-atlas.ts — do not edit by hand.",
    "// URLs are CDN paths under /public (atlasByTier slots, art.ts).",
    "export const CITY_ATLAS_URLS: Readonly<Record<string, readonly (readonly string[] | null)[]>> = Object.freeze({",
  ];
  for (const [family, tiers] of [...families.entries()].sort()) {
    lines.push(`  ${JSON.stringify(family)}: [`);
    for (const tier of TIERS) {
      const urls = tiers.get(String(tier));
      if (!urls) {
        lines.push("    null,");
        continue;
      }
      lines.push(
        `    [${urls.map((u) => JSON.stringify(`/${u}`)).join(", ")}],`
      );
    }
    lines.push("  ],");
  }
  lines.push("});");
  fs.writeFileSync(MANIFEST_TS, lines.join("\n") + "\n");
  console.log(`[gen:city-atlas] manifest → ${path.relative(ROOT, MANIFEST_TS)}`);
}

async function main(): Promise<void> {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`[gen:city-atlas] missing ${path.relative(ROOT, RAW_DIR)} — drop AI-generated raws there first (study §C2).`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".png")).sort();
  if (files.length === 0) {
    console.error(`[gen:city-atlas] no .png files in ${path.relative(ROOT, RAW_DIR)}.`);
    process.exit(1);
  }
  const results: Processed[] = [];
  for (const file of files) {
    const processed = await processOne(file);
    if (processed) results.push(processed);
  }
  emitManifest(results);
  console.log(
    `[gen:city-atlas] done: ${results.length} sprites (${results.filter((r) => r.emissive).length} emissive).`
  );
}

main().catch((err) => {
  console.error("[gen:city-atlas] failed:", err);
  process.exit(1);
});
