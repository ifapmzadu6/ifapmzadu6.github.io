import type { APIRoute } from "astro";
import sharp from "sharp";
import { apps } from "../../../../../data/apps";

export function getStaticPaths() {
  return apps.flatMap(({ slug, icon, externalUrl }) => {
    const sizes = externalUrl ? [64] : [64, 256];
    return sizes.map((size) => ({
      params: { slug: size === 64 ? slug : slug + "-" + size },
      props: { icon, size },
    }));
  });
}

export const GET: APIRoute = async ({ props }) => {
  const thumbnail = await sharp(`public${props.icon}`, { density: 144 })
    .resize(props.size, props.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88 })
    .toBuffer();
  return new Response(new Uint8Array(thumbnail), {
    headers: { "Content-Type": "image/webp" },
  });
};
