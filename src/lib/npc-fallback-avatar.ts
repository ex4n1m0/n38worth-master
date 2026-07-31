export interface FallbackNpcAvatar {
  avatarUrl: string;
  photoAuthorName: string;
  photoAuthorUrl: string;
  photoSourceUrl: string;
}

/**
 * Last-resort avatar for NPCs created outside the Unsplash path (mission
 * rewards, onboarding starter fallback). Uses picsum.photos — no API key, no
 * rate limits, unique per seed — hotlinked straight from picsum's CDN (the
 * URL is stable; no download or compression needed). Kept async so callers
 * don't change.
 */
export async function fetchFallbackNpcAvatar(): Promise<FallbackNpcAvatar | null> {
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    avatarUrl: `https://picsum.photos/seed/${seed}/200/200`,
    photoAuthorName: "Lorem Picsum",
    photoAuthorUrl: "https://picsum.photos/",
    photoSourceUrl: `picsum-${seed}`,
  };
}
