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
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha(),
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
  },
};

export default nextConfig;
