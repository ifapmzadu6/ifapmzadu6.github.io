import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Each cel gives the star's center and the reach of its four rays in logical pixels.
const cels = [
  [8, 72, 2], [8, 72, 5], [8, 72, 6], [9, 68, 4], [10, 62, 4],
  [12, 53, 5], [16, 44, 5], [22, 34, 5], [29, 26, 5], [37, 19, 5],
  [44, 14, 4], [49, 11, 4], [52, 10, 5], [52, 10, 7], [52, 10, 6],
  [52, 10, 4], [52, 10, 3], [52, 10, 2], [52, 10, 1], [52, 10, 0],
];
const size = 80;
const width = size * cels.length;
const pixels = Buffer.alloc(width * size * 4);
const violet = 0xa789bdff;
const rose = 0xe7a9b7ff;
const amber = 0xf5af65ff;
const gold = 0xffdc78ff;
const cream = 0xfff3c7ff;

for (const [frame, [cx, cy, radius]] of cels.entries()) {
  function ink(x, y, color) {
    pixels.writeUInt32BE(color, (y * width + frame * size + x) * 4);
  }

  function glint(x, y, reach) {
    for (let dy = -reach; dy <= reach; dy++) {
      const half = Math.floor(reach * (1 - Math.abs(dy) / reach) ** 2.4);
      for (let dx = -half; dx <= half; dx++) {
        const light = Math.abs(dx) + Math.abs(dy) < reach / 2;
        ink(x + dx, y + dy, light ? cream : dy > 0 ? amber : gold);
      }
    }
  }

  // Redraw the last four segments as one ribbon. Its narrow end cools to lilac
  // while the leading edge picks up the warm color of the moon's star pin.
  const start = Math.max(2, frame - 4);
  const end = Math.min(12, frame);
  for (let i = start; i < end; i++) {
    const [x, y] = cels[i];
    const [nx, ny] = cels[i + 1];
    const steps = Math.max(nx - x, y - ny);
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const heat = (i - frame + 4 + t) / 4;
      const px = Math.round(x + (nx - x) * t);
      const py = Math.round(y + (ny - y) * t);
      ink(px, py, heat < 0.32 ? violet : rose);
      if (heat >= 0.18) ink(px + 1, py + 1, violet);
      if (heat >= 0.38) ink(px + 1, py, amber);
      if (heat >= 0.54) ink(px, py - 1, gold);
      if (heat >= 0.76) ink(px - 1, py - 1, cream);
      if (heat >= 0.22 && heat <= 0.42) ink(px - 3, py - 2, rose);
    }
  }

  if (radius) glint(cx, cy, radius);

  // Two small echoes open out from the crest as the main glint closes.
  if (frame >= 13 && frame <= 16) {
    glint(59 + frame - 13, 8 - Math.floor((frame - 13) / 2), [1, 3, 2, 1][frame - 13]);
  }
  if (frame >= 14 && frame <= 17) {
    glint(47 - Math.floor((frame - 14) / 2), 17 + frame - 14, [1, 2, 2, 1][frame - 14]);
  }
}

const output = fileURLToPath(new URL("../src/assets/orbit/arrival-trail.png", import.meta.url));
await sharp(pixels, { raw: { width, height: size, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(output);

// Cover precisely the eyes on the 48px sprite, so the rest of the face stays still.
const eyes = { left: 20, top: 13, width: 20, height: 10 };
async function eyeCel(pose) {
  const sprite = fileURLToPath(new URL(`../public/assets/images/orbit/${pose}.png`, import.meta.url));
  return sharp(sprite).extract(eyes).ensureAlpha().raw().toBuffer();
}
const open = await eyeCel("walk-1");
const lifted = await eyeCel("look");
const blink = Buffer.alloc(open.length);
blink.fill(open.subarray(0, 4)); // Solid lavender sampled from the original cheek.
for (const [left, top] of [[1, 5], [12, 3]]) {
  for (const [x, y] of [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [4, 1], [4, 0], [5, 0]]) {
    blink.writeUInt32BE(0x654379ff, ((top + y) * eyes.width + left + x) * 4);
  }
}
const eyeWidth = eyes.width * 3;
const eyeOutput = fileURLToPath(new URL("../src/assets/orbit/arrival-eyes.png", import.meta.url));
await sharp({ create: { width: eyeWidth, height: eyes.height, channels: 4, background: "#ccabe8" } })
  .composite([open, lifted, blink].map((input, index) => ({
    input,
    raw: { width: eyes.width, height: eyes.height, channels: 4 },
    left: index * eyes.width,
    top: 0,
  })))
  .png({ compressionLevel: 9 })
  .toFile(eyeOutput);
