/**
 * Client-side UTM capture for self-hosted acquisition analytics.
 *
 * When a visitor arrives with ?utm_source=&utm_medium=&utm_campaign= in the
 * URL (the tagged links from DISTRIBUTION_STUDY.md), copy the values into
 * first-party cookies so the server can attribute a later signup to the
 * channel that brought the visitor. First-touch only: later visits don't
 * overwrite the cookies, so the channel that INTRODUCED the player wins.
 *
 * Deliberately cookie-based (not localStorage) so the server-side signup
 * routes can read attribution without any request-body changes. No PII,
 * no third parties, 30-day expiry.
 */

export const UTM_FIELDS = ["source", "medium", "campaign"] as const;
export type UtmField = (typeof UTM_FIELDS)[number];

export const UTM_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const utmCookieName = (field: UtmField) => `nw_utm_${field}`;

export type UtmValues = Partial<Record<UtmField, string>>;

/** Trim + clamp so cookie values and DB columns can never blow up. */
export function cleanUtmValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().slice(0, 64);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Copy utm_* URL params of the current page into first-party cookies.
 * No-op on the server, on pages without UTM params, and when a value is
 * already stored (first-touch wins).
 */
export function captureUtmCookies(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  for (const field of UTM_FIELDS) {
    const existing = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${utmCookieName(field)}=`));
    if (existing) continue; // first touch already recorded

    const value = cleanUtmValue(params.get(`utm_${field}`));
    if (!value) continue;

    document.cookie = [
      `${utmCookieName(field)}=${encodeURIComponent(value)}`,
      `max-age=${UTM_COOKIE_MAX_AGE}`,
      "path=/",
      "SameSite=Lax",
    ].join("; ");
  }
}

/**
 * Fire-and-forget landing-visit beacon. Uses sendBeacon when available
 * (survives tab close, never blocks the page) with a fetch keepalive
 * fallback. Deduped per browser session so dev double-render doesn't
 * double-count.
 */
export function sendVisitBeacon(path: string): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem("nw_visit_sent")) return;
    sessionStorage.setItem("nw_visit_sent", "1");
  } catch {
    /* private mode — fall through and just send */
  }

  const payload = JSON.stringify({ path, referrer: document.referrer || null });
  if (typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon("/api/analytics/visit", blob)) return;
  }
  fetch("/api/analytics/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}
