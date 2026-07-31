/**
 * Build a small square avatar URL that hotlinks Unsplash's CDN.
 *
 * Unsplash's API guidelines REQUIRE hotlinking the URLs returned by the API
 * (`photo.urls`) instead of hosting compressed copies. Their CDN (imgix)
 * resizes/crops/transcodes on the fly, and requests to images.unsplash.com
 * do not count against the API rate limit. We request a 256px square webp —
 * enough for every avatar slot in the UI (cards render at ~200px max).
 *
 * `urls.raw` accepts imgix params; the fixed sizes (regular/small/thumb)
 * already carry their own params and are used as-is only when raw is absent.
 */
export function unsplashAvatarUrl(
  urls:
    | { raw?: string; regular?: string; small?: string; thumb?: string }
    | undefined
    | null
): string | null {
  if (!urls) return null;
  if (urls.raw) {
    const sep = urls.raw.includes("?") ? "&" : "?";
    return `${urls.raw}${sep}w=256&h=256&fit=crop&fm=webp&q=70`;
  }
  return urls.regular || urls.small || urls.thumb || null;
}
