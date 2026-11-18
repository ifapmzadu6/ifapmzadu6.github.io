/** All positions are in the 144 × 134 logical pixels of the stage. */
export interface OrbitApp {
  slug: string;
  name: string;
  description: string;
  icon: string;
  url: string;
}

export const HOME = -1;
const STATION_SPACING = 164;
const STAR = ["   *   ", "  ***  ", "*******", " ***** ", "  ***  ", " ** ** "];
const STONES = [[15, 127], [37, 125], [58, 129], [74, 126], [102, 128], [122, 125], [154, 127]];

interface Sky {
  top: readonly number[];
  horizon: readonly number[];
  lightX: number;
}

function rgb(hex: number) {
  return [hex >> 16, (hex >> 8) & 255, hex & 255];
}

function sky(top: number, horizon: number, lightX: number): Sky {
  return { top: rgb(top), horizon: rgb(horizon), lightX };
}

const homeSky = sky(0x181338, 0x413466, 54);
const skies: Record<string, Sky> = {
  tttt: sky(0x121934, 0x334a79, 42),
  "triple-take": sky(0x321b36, 0x794054, 68),
  otolume: sky(0x102438, 0x25616c, 38),
  "shortcuts-browser": sky(0x142a2c, 0x43684e, 58),
  "tax-calculator": sky(0x30232b, 0x785438, 44),
  "flickless-keyboard": sky(0x181d3b, 0x40558a, 62),
  tsugidopa: sky(0x271a38, 0x6e426f, 46),
};

export interface Journey {
  from: number;
  to: number;
  direction: number;
  progress: number;
  startSky: Sky;
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function ease(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

async function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function createOrbitScene(
  ctx: CanvasRenderingContext2D, sign: HTMLElement, apps: OrbitApp[],
) {
  const canvas = ctx.canvas;
  const sprites = await Promise.all(
    ["walk-0", "walk-1", "walk-2", "walk-3", "look"].map(name =>
      loadImage(`/assets/images/orbit/${name}.png`)),
  );
  const icons = new Map<number, HTMLImageElement>();
  const signName = sign.querySelector("h2")!;
  const signCopy = sign.querySelector("p")!;
  const signIcon = sign.querySelector("img")!;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  let posted = HOME;
  let currentSky = homeSky;
  ctx.imageSmoothingEnabled = false;

  function paintSky(color: Sky) {
    const css = document.documentElement.style;
    css.setProperty("--sky-top", `rgb(${color.top.join(",")})`);
    css.setProperty("--sky-low", `rgb(${color.horizon.join(",")})`);
    css.setProperty("--sky-x", color.lightX.toFixed(2) + "%");
    currentSky = color;
  }

  function skyFor(stop: number) {
    return stop === HOME ? homeSky : skies[apps[stop].slug] ?? homeSky;
  }

  function box(x: number, y: number, w: number, h: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function drawGround(scroll: number) {
    box(4, 123, 136, 1, "#877591");
    box(10, 124, 116, 1, "#574761");
    STONES.forEach(([x, y], i) => {
      const wrapped = ((x + scroll) % STATION_SPACING + STATION_SPACING) % STATION_SPACING;
      if (wrapped > 4 && wrapped < 138) box(wrapped, y, 2 + i % 2, 1, "#76647e");
    });
  }

  function drawMoon(center: number, stride: number | null, left: boolean, looking: boolean) {
    const frame = stride === null ? 1 : Math.floor(stride / 5) % 4;
    const lift = stride === null ? 0 : frame % 2;
    box(center - 13, 122, 27, 1, "#51416e");
    ctx.save();
    ctx.translate(Math.round(center) + (left ? 24 : -24), 76 - lift);
    if (left) ctx.scale(-1, 1);
    ctx.drawImage(sprites[looking ? 4 : frame], 0, 0);
    STAR.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === "*") box(25 + x, y, 1, 1, y < 4 ? "#ffdd58" : "#eda348");
      }
    });
    ctx.restore();
  }

  function drawPost(stop: number, offset: number, reveal: number) {
    const x = 113 + Math.round(offset);
    if (x < -15 || x > canvas.width + 15) return;
    box(x - 1, 64, 3, 59, "#8c749b");
    box(x, 64, 1, 59, "#b89db4");
    box(x - 2, 122, 6, 1, "#a68eae");

    ctx.save();
    ctx.globalAlpha = 1 - reveal;
    box(x - 14, 64, 28, 17, "#69537a");
    box(x - 12, 62, 24, 20, "#9c85a2");
    box(x - 13, 64, 26, 15, "#eddfb9");
    box(x - 11, 63, 22, 17, "#eddfb9");
    const icon = icons.get(stop);
    if (icon?.complete && icon.naturalWidth > 0) {
      ctx.drawImage(icon, x - 7, 64, 14, 14);
    } else {
      box(x - 1, 66, 3, 2, "#40334e");
      box(x - 3, 70, 5, 2, "#40334e");
      box(x - 1, 70, 3, 7, "#40334e");
      box(x - 3, 76, 7, 2, "#40334e");
    }
    ctx.restore();
  }

  function showSign(stop: number, offset: number, reveal: number) {
    if (posted !== stop && stop !== HOME) {
      const app = apps[stop];
      signName.textContent = app.name;
      signCopy.textContent = app.description;
      signIcon.src = app.icon;
    }
    posted = stop;
    sign.style.opacity = String(reveal);
    // Its CSS width is 88% of the stage. Translate the HTML label along with its post.
    sign.style.transform = `translate(${offset * 100 / (canvas.width * 0.88)}%, ${Math.round((1 - reveal) * 4)}px)`;
  }

  function prepareStop(stop: number) {
    if (stop === HOME || icons.has(stop)) return;
    const image = new Image();
    image.src = apps[stop].icon;
    icons.set(stop, image);
  }

  function rest(stop: number) {
    prepareStop(stop);
    const detail = stop !== HOME;
    const reveal = detail ? 1 : 0;
    paintSky(skyFor(stop));
    if (themeColor) themeColor.content = `rgb(${currentSky.top.join(",")})`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGround(0);
    drawPost(stop, 0, reveal);
    showSign(stop, 0, reveal);
    drawMoon(detail ? 80 : 30, null, false, detail);
  }

  function walk(journey: Journey, heading: number) {
    const { from, to, direction, progress: t, startSky } = journey;
    const end = skyFor(to);
    const blend = ease(t);
    const tint = (a: readonly number[], b: readonly number[]) =>
      a.map((channel, i) => Math.round(mix(channel, b[i], blend)));
    paintSky({
      top: tint(startSky.top, end.top),
      horizon: tint(startSky.horizon, end.horizon),
      lightX: mix(startSky.lightX, end.lightX, blend) - direction * 3 * Math.sin(blend * Math.PI),
    });
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (from === HOME || to === HOME) {
      const approach = from === HOME ? t : 1 - t;
      const center = 30 + 50 * ease((approach - 0.04) / 0.79);
      const moving = approach > 0.04 && approach < 0.83;
      const stop = approach < 0.12 ? HOME : Math.max(from, to);
      const reveal = ease((approach - 0.79) / 0.15);
      const distance = from === HOME ? center - 30 : 80 - center;
      const left = to === HOME ? heading > 0 : heading < 0;
      drawGround(0);
      drawPost(stop, 0, reveal);
      showSign(stop, 0, reveal);
      drawMoon(center, moving ? distance : null, left && moving, approach > 0.94);
      return;
    }

    const travel = ease((t - 0.035) / 0.88);
    // Keep the whole 48-pixel moon on screen; the camera follows the path beneath its feet.
    const center = 80 + direction * 3 * Math.sin(travel * Math.PI);
    const origin = center - 80 - direction * STATION_SPACING * travel;
    const destination = origin + direction * STATION_SPACING;
    const leaving = 1 - ease(t / 0.13);
    const arriving = ease((t - 0.79) / 0.16);
    drawGround(origin);
    drawPost(from, origin, leaving);
    drawPost(to, destination, arriving);
    if (t < 0.5) showSign(from, origin, leaving);
    else showSign(to, destination, arriving);

    const moving = travel > 0 && travel < 1;
    const stride = STATION_SPACING * (heading > 0 ? travel : 1 - travel);
    drawMoon(center, moving ? stride : null, direction * heading < 0 && moving, t < 0.035 || t > 0.965);
  }

  return { prepareStop, rest, walk, getSky: () => currentSky };
}
