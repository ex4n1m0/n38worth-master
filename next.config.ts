import { execSync } from "node:child_process";
import type { NextConfig } from "next";

/**
 * Build stamp for the landing page ("build <sha> · deployed <date>").
 *
 * The values are inlined into the bundle at compile time via `env`, so the
 * page always shows the version of the deployed build and bumps automatically
 * on every commit + deploy — there is no manual version to maintain.
 * - SHA: Vercel provides VERCEL_GIT_COMMIT_SHA during builds; local builds
 *   fall back to the checked-out git commit.
 * - Date: when this config is evaluated, i.e. build/deployment time.
 */
function buildSha(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  images: {
    unoptimized: true
  },
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  // Windows desktop client build (scripts/build-desktop-client.mjs): the UI
  // is statically exported into the Tauri exe and talks to the live API
  // cross-origin (NEXT_PUBLIC_API_BASE). Server-only routes are hidden by
  // the build script before `next build` runs.
  ...(process.env.N38_CLIENT_EXPORT
    ? ({
        output: "export" as const,
        distDir: "out",
      })
    : {}),
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha(),
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
  },
};

export default nextConfig;
