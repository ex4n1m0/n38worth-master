import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "n38worth — the human trading simulation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";

export default async function OpengraphImage() {
  const imageBuffer = await readFile(
    join(process.cwd(), "public", "okworld_OG.jpg")
  );
  return new Response(imageBuffer, {
    headers: { "Content-Type": "image/jpeg" },
  });
}
