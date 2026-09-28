import OpengraphImage from "./opengraph-image";

export const runtime = "nodejs";
export const alt = "n38worth — the city trading simulation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";

export default async function TwitterImage() {
  return OpengraphImage();
}
