// Builds the static UI bundle for the Windows desktop client (wave 2).
//
// The web app and the desktop client share one codebase: this script hides
// everything that cannot be statically exported (the API tree, middleware,
// the legacy dynamic-segment pages), runs `next build` with
// N38_CLIENT_EXPORT=1 + NEXT_PUBLIC_API_BASE baked in, and restores the
// tree. Output lands in out/ for Tauri to embed
// (desktop/src-tauri/tauri.bundled.conf.json → frontendDist ../out).
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const HIDE = [
  ["src/app/api", ".n38-export-hide/api"],
  ["src/proxy.ts", ".n38-export-hide/proxy.ts"],
  ["src/app/(game)/players/[username]", ".n38-export-hide/players-username"],
  ["src/app/(game)/city/[username]", ".n38-export-hide/city-username"],
  // Social-card image routes are web-only and cannot be force-static.
  ["src/app/opengraph-image.tsx", ".n38-export-hide/opengraph-image.tsx"],
  ["src/app/twitter-image.tsx", ".n38-export-hide/twitter-image.tsx"],
];

const moved = [];
function hideAll() {
  mkdirSync(resolve(root, ".n38-export-hide"), { recursive: true });
  for (const [from, to] of HIDE) {
    const src = resolve(root, from);
    const dst = resolve(root, to);
    if (!existsSync(src)) continue;
    rmSync(dst, { recursive: true, force: true });
    renameSync(src, dst);
    moved.push([src, dst]);
  }
}
function restoreAll() {
  while (moved.length) {
    const [src, dst] = moved.pop();
    rmSync(src, { recursive: true, force: true });
    renameSync(dst, src);
  }
  rmSync(resolve(root, ".n38-export-hide"), { recursive: true, force: true });
}

const hideDir = resolve(root, ".n38-export-hide");
if (existsSync(hideDir)) {
  const leftovers = readdirSync(hideDir);
  if (leftovers.length > 0) {
    console.error(
      `[build-desktop-client] leftover .n38-export-hide (${leftovers.join(", ")}) — restore src/ via git and retry.`
    );
    process.exit(1);
  }
  rmSync(hideDir, { recursive: true, force: true });
}
rmSync(resolve(root, "out"), { recursive: true, force: true });
// A running `next dev` holds .next and dies when this script wipes it —
// refuse to start while one is live (2026-10-06: a release cut during a dev
// session killed both builds). A stale .next/dev dir without a live server
// is fine.
if (existsSync(resolve(root, ".next/dev"))) {
  const probe = spawnSync("curl", ["-s", "-o", "NUL", "-m", "2", "http://localhost:3000/"], { encoding: "utf8" });
  if (probe.status === 0) {
    console.error(
      "[build-desktop-client] a `next dev` server is live on :3000 — stop it before cutting a desktop build."
    );
    process.exit(1);
  }
  console.log("[build-desktop-client] stale .next/dev found (no server on :3000) — proceeding");
}
// A stale .next/types tree still references hidden pages and fails the
// type pass — always export from a clean build cache.
rmSync(resolve(root, ".next"), { recursive: true, force: true });

try {
  hideAll();
  execSync("npx next build", {
    stdio: "inherit",
    cwd: root,
    env: {
      ...process.env,
      N38_CLIENT_EXPORT: "1",
      NEXT_PUBLIC_API_BASE: "https://n38worth.com",
    },
  });
} finally {
  restoreAll();
}
console.log("[build-desktop-client] static UI exported to out/");
