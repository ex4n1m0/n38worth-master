import sharp from "sharp";

const TARGET_MAX_BYTES = 100 * 1024; // 100 KB
const MAX_DIMENSION = 512;

/**
 * Compress an avatar image buffer to ≤ 100 KB using WebP.
 * Strategy: maximize image quality while staying under 100 KB.
 *   1. Resize to 512×512 max, convert to WebP
 *   2. Binary-search for the highest quality that stays ≤ 100 KB
 *   3. If quality=1 is still over 100 KB, progressively shrink dimensions
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

  // If still over 100 KB at quality=1 and 512px, progressively shrink
  for (const dim of [384, 256, 192, 128]) {
    const smaller = await compressAtDimension(input, dim);
    if (smaller) return smaller;
  }

  // Final fallback — smallest possible
  const fallback = await sharp(input)
    .resize(128, 128, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 1 })
    .toBuffer();

  return { buffer: fallback, mimeType: "image/webp" };
}

/**
 * Binary-search for the highest WebP quality that stays ≤ 100 KB
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

  // Binary search: find highest quality where size ≤ 100 KB
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
 * Download an image from a URL and compress it to a ≤ 100 KB WebP data URL.
 * Used for Unsplash avatars on random player / quickplay creation.
 * Returns null if the download fails.
 */
export async function downloadAndCompressAvatar(
  imageUrl: string
): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const { buffer: compressed, mimeType } = await compressAvatar(inputBuffer, "image/jpeg");
    const base64 = compressed.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error("Failed to download/compress avatar:", error);
    return null;
  }
}
