import type { APIRoute } from "astro";
import sharp from "sharp";
import { publicApps } from "../../../../../data/apps";

export function getStaticPaths() {
  return publicApps.map(({ slug, icon }) => ({ params: { slug }, props: { icon } }));
}

export const GET: APIRoute = async ({ props }) => {
  const thumbnail = await sharp(`public${props.icon}`, { density: 144 })
    .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88 })
    .toBuffer();
  return new Response(new Uint8Array(thumbnail), {
    headers: { "Content-Type": "image/webp" },
  });
};
