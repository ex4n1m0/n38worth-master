import sharp from "sharp";

const TARGET_MAX_BYTES = 300 * 1024; // 300 KB
const MAX_DIMENSION = 1024;

/**
 * Compress an avatar image buffer to ≤ 300 KB using WebP.
 * Strategy: maximize image quality while staying under 300 KB.
 *   1. Resize to 1024×1024 max, convert to WebP
 *   2. Binary-search for the highest quality that stays ≤ 300 KB
 *   3. If quality=1 is still over 300 KB, progressively shrink dimensions
 *
 * Images already ≤ 100 KB are returned as-is (already lightweight).
 *
 * @returns { buffer, mimeType } – the compressed image buffer and its MIME type
 */
export async function compressAvatar(
  input: Buffer,
  originalMimeType?: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const inputSize = input.length;

  // Already within the target — no compression needed
  if (inputSize <= TARGET_MAX_BYTES) {
    return {
      buffer: input,
      mimeType: originalMimeType ?? "image/webp",
    };
  }

  // Try resizing + highest quality first
  const result = await compressAtDimension(input, MAX_DIMENSION);
  if (result) return result;

  // If still over 300 KB at quality=1 and 1024px, progressively shrink
  for (const dim of [768, 512, 384, 256]) {
    const smaller = await compressAtDimension(input, dim);
    if (smaller) return smaller;
  }

  // Final fallback — smallest possible
  const fallback = await sharp(input)
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 20 })
    .toBuffer();

  return { buffer: fallback, mimeType: "image/webp" };
}

/**
 * Binary-search for the highest WebP quality that stays ≤ 300 KB
 * at the given max dimension. Returns null if even quality=1 exceeds the limit.
 */
async function compressAtDimension(
  input: Buffer,
  maxDim: number
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const pipeline = sharp(input).resize(maxDim, maxDim, {
    fit: "inside",
    withoutEnlargement: true,
  });

  // Check if even max quality already fits
  const maxQ = await pipeline.clone().webp({ quality: 95 }).toBuffer();
  if (maxQ.length <= TARGET_MAX_BYTES) {
    return { buffer: maxQ, mimeType: "image/webp" };
  }

  // Check if min quality fits
  const minQ = await pipeline.clone().webp({ quality: 1 }).toBuffer();
  if (minQ.length > TARGET_MAX_BYTES) {
    return null; // need smaller dimensions
  }

  // Binary search: find highest quality where size ≤ 300 KB
  let lo = 1;
  let hi = 94;
  let bestBuffer: Buffer = minQ;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = await pipeline.clone().webp({ quality: mid }).toBuffer();

    if (candidate.length <= TARGET_MAX_BYTES) {
      bestBuffer = candidate; // this quality works, try higher
      lo = mid + 1;
    } else {
      hi = mid - 1; // too large, try lower
    }
  }

  return { buffer: bestBuffer, mimeType: "image/webp" };
}

/**
 * Convert a base64 data URL to a compressed base64 data URL.
 * Useful for migrating existing avatar data stored in the DB.
 */
export async function compressAvatarDataUrl(
  dataUrl: string
): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL format");
  }

  const [, mimeType, base64Data] = match;
  const inputBuffer = Buffer.from(base64Data, "base64");

  const { buffer: compressed, mimeType: newMimeType } = await compressAvatar(
    inputBuffer,
    mimeType
  );

  const newBase64 = compressed.toString("base64");
  return `data:${newMimeType};base64,${newBase64}`;
}

/**
 * Download an image from a URL and compress it to a ≤ 300 KB WebP data URL.
 * Used for Unsplash and TMDB avatars on random player / quickplay creation.
 * Returns null if the download fails.
 *
 * When `cropToSquare` is true, the image is center-cropped to a square BEFORE
 * compression. This is used for TMDB backdrops (16:9) so the stored avatar is
 * a clean square — no display-time cropping artifacts. Unsplash photos are
 * typically already close to square and use the default (no crop).
 */
export async function downloadAndCompressAvatar(
  imageUrl: string,
  options?: { cropToSquare?: boolean }
): Promise<string | null> {
  try {
    // Add timeout to prevent hanging on slow CDN responses in serverless functions
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(imageUrl, { signal: controller.signal });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`downloadAndCompressAvatar: HTTP ${response.status} for ${imageUrl.slice(0, 80)}...`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    let inputBuffer: Buffer = Buffer.from(arrayBuffer);

    // Center-crop to square if requested (used for 16:9 TMDB backdrops).
    // sharp extracts the center square: min(width, height) × min(width, height).
    if (options?.cropToSquare) {
      const metadata = await sharp(inputBuffer).metadata();
      const w = metadata.width ?? 0;
      const h = metadata.height ?? 0;
      if (w > 0 && h > 0) {
        const size = Math.min(w, h);
        const left = Math.floor((w - size) / 2);
        const top = Math.floor((h - size) / 2);
        inputBuffer = Buffer.from(
          await sharp(inputBuffer)
            .extract({ left, top, width: size, height: size })
            .toBuffer()
        );
      }
    }

    const { buffer: compressed, mimeType } = await compressAvatar(inputBuffer, "image/jpeg");
    const base64 = compressed.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`downloadAndCompressAvatar failed: ${message}`);
    return null;
  }
}
