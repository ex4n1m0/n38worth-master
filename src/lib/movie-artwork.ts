import { type NpcPhotoMeta } from "@/lib/npc-names";

/**
 * TMDB (themoviedb.org) movie-artwork source for NPC avatars.
 *
 * Used as an ADD-ON alongside the existing Unsplash source — the random-player
 * cron alternates between the two on each NPC creation (see the `npc_source_parity`
 * setting in src/lib/random-player.ts), so roughly half of all new NPCs get a
 * movie backdrop as their avatar and the other half keep getting Unsplash photos.
 *
 * We use BACKDROPS (16:9 horizontal scene artwork) rather than POSTERS (2:3
 * vertical) because the card avatar container is square (aspect-square with
 * object-cover). A 2:3 poster cropped to square loses 25% of the image
 * top/bottom — often cutting off heads, title text, or key art. A 16:9
 * backdrop cropped to square keeps the center 56% of the width, which
 * reliably captures the main subject since backdrops are designed as wide
 * establishing shots. The caller also center-crops to square server-side
 * (see downloadAndCompressAvatar with cropToSquare) so the stored avatar is
 * a clean square with no display-time cropping.
 *
 * API docs:
 *   - https://developer.themoviedb.org/reference/discover-movie
 *   - https://developer.themoviedb.org/docs/image-basics
 *
 * Attribution: TMDB requires attribution for use of their data/images. We
 * record the movie title as `photoAuthorName` and the TMDB movie URL as
 * `photoAuthorUrl`, which the existing PlayerCard attribution footer renders
 * at the bottom of every card.
 */

// v3 API key (32-char hex). Trimmed because Vercel env add can append a newline.
const TMDB_API_KEY = process.env.TMDB_API_KEY?.trim() || "";

const API_BASE = "https://api.themoviedb.org/3";
// Backdrops are 16:9. w1280 gives 1280x720 — high enough that a center-crop to
// square (720x720) is crisp, and small enough to download quickly. (Posters
// used w500 which is 500x750 — too small and wrong aspect ratio for square.)
const IMAGE_BASE = "https://image.tmdb.org/t/p/w1280";

// discover/movie paginates in pages of 20 results. The endpoint reports
// `total_pages` in the tens of thousands, but past ~500 pages the API often
// returns empty results (their backend caps deep pagination). Sampling from
// pages 1-500 gives us 10,000 distinct popular movies — more than enough
// variety for NPC avatars, and every page reliably returns 20 results.
const MAX_DISCOVER_PAGE = 500;

export interface MovieArtwork {
  imageUrl: string; // full https://image.tmdb.org/t/p/w1280/<path>.jpg URL
  photoAuthorName: string; // "Inception" (the movie title)
  photoAuthorUrl: string; // https://www.themoviedb.org/movie/<id>
  photoSourceUrl: string; // "tmdb-/<backdrop_path>.jpg" — used for dedup via the unique index on photo_source_url
  photoMeta: NpcPhotoMeta; // title + genres, fed to generateNpcNameFromMeta
  photoScore: number; // TMDB vote_average (0-10) — analogous to Unsplash "likes"
  movieId: number;
  title: string;
}

interface DiscoverResult {
  id: number;
  title: string;
  backdrop_path: string | null;
  vote_average?: number;
  genre_ids?: number[];
}
interface DiscoverResponse {
  page: number;
  results: DiscoverResult[];
}

// TMDB genre IDs → human-readable names. Used only for NPC name generation
// (the title alone is usually enough, but genres give variety when titles are
// short/common). Map sourced from TMDB's /genre/movie/list endpoint.
const GENRE_NAMES: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

/**
 * Fetch one random movie backdrop (artwork) from TMDB.
 *
 * Strategy: pick a random page in [1, MAX_DISCOVER_PAGE], sorted by popularity
 * descending, then pick a random movie on that page that has a `backdrop_path`.
 * The randomness comes from both the page selection and the in-page shuffle,
 * so consecutive calls return different movies even when the cron fires back
 * to back.
 *
 * Returns null on any error (network, auth, empty page, no movies with
 * backdrops). The caller falls back to Unsplash for that tick.
 */
export async function fetchRandomMovieArtwork(): Promise<MovieArtwork | null> {
  if (!TMDB_API_KEY) {
    console.warn("TMDB_API_KEY is not configured — movie-artwork source disabled");
    return null;
  }

  try {
    const page = 1 + Math.floor(Math.random() * MAX_DISCOVER_PAGE);
    const url = `${API_BASE}/discover/movie?api_key=${TMDB_API_KEY}&sort_by=popularity.desc&page=${page}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`TMDB discover error: HTTP ${res.status} on page ${page}`);
      return null;
    }

    const data = (await res.json()) as DiscoverResponse;
    const movies = (data.results ?? []).filter((m) => m && m.backdrop_path);
    if (movies.length === 0) {
      console.warn(`TMDB page ${page} returned no movies with backdrops`);
      return null;
    }

    // Shuffle and take the first — gives variety within a page.
    const shuffled = [...movies].sort(() => Math.random() - 0.5);
    const movie = shuffled[0];

    const backdropPath = movie.backdrop_path as string;
    const imageUrl = `${IMAGE_BASE}${backdropPath}`;
    const genreNames = (movie.genre_ids ?? [])
      .map((id) => GENRE_NAMES[id])
      .filter(Boolean) as string[];

    // Build a NpcPhotoMeta-compatible object. extractKeywords() in npc-names.ts
    // splits on non-alpha, so "The Hunger Games: Mockingjay" + "Action, Drama"
    // yields keywords like {the, hunger, games, mockingjay, action, drama}.
    const photoMeta: NpcPhotoMeta = {
      tags: genreNames.map((name) => ({ title: name })),
      altDescription: movie.title ?? null,
      description: null,
    };

    return {
      imageUrl,
      photoAuthorName: movie.title ?? "TMDB",
      photoAuthorUrl: `https://www.themoviedb.org/movie/${movie.id}`,
      photoSourceUrl: `tmdb-${backdropPath}`,
      photoMeta,
      photoScore: Math.round(Number(movie.vote_average ?? 0) * 100), // 0-1000 scale, like Unsplash "likes"
      movieId: movie.id,
      title: movie.title ?? "",
    };
  } catch (err) {
    console.error(
      "TMDB fetch failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
