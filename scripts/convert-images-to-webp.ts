/**
 * One-time script: convert actively-used game image assets from PNG/JPEG
 * to lightweight WebP for faster loading on slow internet connections
 * while keeping good visual quality.
 *
 * Avatars (1254×1254) → resized to 1024×1024, WebP q85 (~70-90% smaller)
 * Backgrounds / covers → keep dimensions, WebP q80
 * Icons → keep dimensions, WebP q85
 *
 * After running, update all code references from .png to .webp
 * (roster.ts, professions.ts, useProfessionComboSelection.ts, avatar-utils.ts,
 *  MassHireCard.tsx, TenSlotsCard.tsx, RevealCard.tsx, PoachEffect.tsx,
 *  utils.ts, page.tsx, layout.tsx, WorldRebootingOverlay.tsx, mass-hire.ts,
 *  demo-register, onboarding-npc, default-avatar cron, settings page, etc.)
 *
 * Run: npx tsx scripts/convert-images-to-webp.ts
 */
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

const PUBLIC = path.join(process.cwd(), "public");

type Job = {
  file: string;
  out?: string; // defaults to <stem>.webp
  resize?: number; // max dimension (square, inside)
  quality: number;
};

const JOBS: Job[] = [
  // AGI players (6)
  { file: "NewAIPlayer.png", resize: 1024, quality: 85 },
  { file: "NewAstra.png", resize: 1024, quality: 85 },
  { file: "NewLyra.png", resize: 1024, quality: 85 },
  { file: "NewMira.png", resize: 1024, quality: 85 },
  { file: "NewNova.png", resize: 1024, quality: 85 },
  { file: "NewVesper.png", resize: 1024, quality: 85 },
  // Goddesses (6) — source PNGs; also stored in DB as compressed data URLs
  { file: "NewGoddess.png", resize: 1024, quality: 85 },
  { file: "NewGoddessFate.png", resize: 1024, quality: 85 },
  { file: "NewGoddessKnowledge.png", resize: 1024, quality: 85 },
  { file: "NewGoddessTime.png", resize: 1024, quality: 85 },
  { file: "NewGoddessWar.png", resize: 1024, quality: 85 },
  { file: "NewGoddessWealth.png", resize: 1024, quality: 85 },
  // Professions (6)
  { file: "NewRiftBinder.png", resize: 1024, quality: 85 },
  { file: "NewHexbladeCourier.png", resize: 1024, quality: 85 },
  { file: "NewScrapAlchemist.png", resize: 1024, quality: 85 },
  { file: "NewSpiritArchivist.png", resize: 1024, quality: 85 },
  { file: "NewChoirMarshal.png", resize: 1024, quality: 85 },
  { file: "NewPlagueCartographer.png", resize: 1024, quality: 85 },
  // Hidden avatar (used as default for unhired/demo/onboarding)
  { file: "NEW_HIDDEN.png", resize: 1024, quality: 85 },
  // Bonus cards (3)
  { file: "masshire.png", resize: 1024, quality: 85 },
  { file: "10slots.png", resize: 1024, quality: 85 },
  { file: "reveal.png", resize: 1024, quality: 85 },
  // Background image (navbar banner)
  { file: "navbar.png", quality: 80 },
  // Landing / cover / overlay images
  { file: "okworld.png", quality: 80 },
  { file: "endgame.png", quality: 80 },
  { file: "WORLD_RESET.png", resize: 1920, quality: 75 },
  // App icon
  { file: "VW_Icon.png", quality: 85 },
];

async function main() {
  let totalIn = 0;
  let totalOut = 0;
  console.log("Converting game image assets to WebP...\n");

  for (const job of JOBS) {
    const inPath = path.join(PUBLIC, job.file);
    if (!fs.existsSync(inPath)) {
      console.log(`⚠️  skip (missing): ${job.file}`);
      continue;
    }
    const stem = path.parse(job.file).name;
    const outName = job.out ?? `${stem}.webp`;
    const outPath = path.join(PUBLIC, outName);

    let pipeline = sharp(inPath, { failOn: "none" });
    if (job.resize) {
      pipeline = pipeline.resize(job.resize, job.resize, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const buf = await pipeline.webp({ quality: job.quality }).toBuffer();
    fs.writeFileSync(outPath, buf);

    const inSize = fs.statSync(inPath).size;
    totalIn += inSize;
    totalOut += buf.length;
    const pct = ((1 - buf.length / inSize) * 100).toFixed(0);
    console.log(
      `✅ ${job.file} → ${outName}  ${(inSize / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB  (-${pct}%)`
    );
  }

  console.log(
    `\nTotal: ${(totalIn / 1024 / 1024).toFixed(1)}MB → ${(totalOut / 1024 / 1024).toFixed(1)}MB  (saved ${((1 - totalOut / totalIn) * 100).toFixed(0)}%)`
  );
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
