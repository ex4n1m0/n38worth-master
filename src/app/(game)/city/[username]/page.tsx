import type { Metadata } from "next";
import { PublicCityView } from "@/components/city/PublicCityView";

/**
 * Public read-only visit of a player's city (Phase F).
 *
 * The page itself does no data fetching — the client view consumes the same
 * public CDN-cached projection as everything else (GET /api/city/[username],
 * viewer-independent by construction). Visiting your own username redirects
 * to /city (the owner/build-mode home). Share metadata below uses only the
 * raw DB username; the sitewide static og.jpg remains the social card.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const safe = username.slice(0, 30);
  return {
    title: `${safe}'s City — n38worth`,
    description: `Visit ${safe}'s city: buildings, districts and landmarks derived from their live portfolio on n38worth.`,
  };
}

export default async function PublicCityPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <PublicCityView username={username} />;
}
