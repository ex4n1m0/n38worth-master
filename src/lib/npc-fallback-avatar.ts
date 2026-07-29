import { downloadAndCompressAvatar } from "@/lib/compress-avatar";

export interface FallbackNpcAvatar {
  avatarUrl: string;
  photoAuthorName: string;
  photoAuthorUrl: string;
  photoSourceUrl: string;
}

/**
 * Last-resort avatar for NPCs created outside the Unsplash path (mission
 * rewards, onboarding starter fallback). Uses picsum.photos — no API key, no
 * rate limits, unique per seed — compressed like any other NPC avatar.
 * Returns null on failure so callers can degrade to the hidden placeholder.
 */
export async function fetchFallbackNpcAvatar(): Promise<FallbackNpcAvatar | null> {
  try {
    const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const compressed = await downloadAndCompressAvatar(
      `https://picsum.photos/seed/${seed}/200/200`
    );
    if (!compressed) return null;
    return {
      avatarUrl: compressed,
      photoAuthorName: "Lorem Picsum",
      photoAuthorUrl: "https://picsum.photos/",
      photoSourceUrl: `picsum-${seed}`,
    };
  } catch (e) {
    console.error("picsum fallback avatar failed:", e);
    return null;
  }
}
