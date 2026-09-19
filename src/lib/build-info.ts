/**
 * Build stamp inlined at compile time (see next.config.ts `env`). Shows the
 * deployed commit SHA + deployment date on the landing page; both bump
 * automatically on every commit and deploy.
 */
export const BUILD_SHA: string = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";

export const BUILD_DATE: string = process.env.NEXT_PUBLIC_BUILD_DATE ?? "";

/** "Sep 19, 2026 · 14:32 UTC" — fixed locale/timezone so server-prerendered
 *  HTML and client hydration render identically. */
export function buildStampLabel(): string {
  if (!BUILD_DATE) return `build ${BUILD_SHA}`;
  const d = new Date(BUILD_DATE);
  const date = d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `build ${BUILD_SHA} · deployed ${date} · ${time} UTC`;
}
