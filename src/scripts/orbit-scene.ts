/** All positions are in the 144 × 134 logical pixels of the stage. */
export interface OrbitApp {
  slug: string;
  name: string;
  description: string;
  icon: string;
  url: string;
}

export const HOME = -1;
const STATION_SPACING = 144;
const HOME_DISTANCE = 50;
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

export function stationSky(slug?: string): Sky {
  return (slug && skies[slug]) || homeSky;
}

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

// Ease into and out of a walk, with a steady pace between the two ramps.
function walkProgress(value: number) {
  const t = Math.max(0, Math.min(1, value));
  const ramp = 0.12;
  if (t < ramp) return t * t / (2 * ramp * (1 - ramp));
  if (t > 1 - ramp) return 1 - (1 - t) ** 2 / (2 * ramp * (1 - ramp));
  return (t - ramp / 2) / (1 - ramp);
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
  const [moon, readingMoon] = await Promise.all(
    ["walk-1", "look"].map(name =>
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
    return stationSky(stop === HOME ? undefined : apps[stop].slug);
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

  function drawFoot(phase: number, stepLength: number, near: boolean, bob: number) {
    const swinging = phase > 0.5;
    const swing = (phase - 0.5) * 2;
    // A planted foot travels back exactly as far as the ground beneath it.
    const offset = swinging ? (ease(swing) - 0.5) * stepLength : (0.5 - 2 * phase) * stepLength;
    // Match the generated resting pose at both ends of a whole gait cycle.
    const hip = near ? 17 + stepLength / 2 : 29 - stepLength / 2;
    const toe = Math.round(hip + offset);
    const sole = 46 - (swinging ? Math.round(4 * Math.sin(swing * Math.PI)) : 0);
    const top = 38 + bob;
    const color = near ? "#ccabe8" : "#a885ca";
    for (let y = top; y < sole - 1; y++) {
      const ankle = mix(hip, toe, (y - top) / (sole - 1 - top));
      box(ankle - 2, y, 5, 1, near ? color : "#8862b1");
    }
    box(toe - 2, sole - 1, 7, 2, color);
  }

  function drawMoon(center: number, distance: number | null, left: boolean, looking: boolean, stepLength = STATION_SPACING / 8) {
    box(center - 13, 122, 27, 1, "#51416e");
    ctx.save();
    ctx.translate(Math.round(center) + (left ? 24 : -24), 76);
    if (left) ctx.scale(-1, 1);
    let bob = 0;
    if (distance === null) {
      ctx.drawImage(looking ? readingMoon : moon, 0, 0);
    } else {
      const cycles = distance / (2 * stepLength);
      const phase = cycles - Math.floor(cycles);
      bob = -Math.round(Math.sin(phase * 2 * Math.PI) ** 2);
      drawFoot(phase, stepLength, false, bob);
      drawFoot((phase + 0.5) % 1, stepLength, true, bob);
      ctx.drawImage(moon, 0, 0, 48, 41, 0, bob, 48, 41);
    }
    STAR.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === "*") box(25 + x, y + bob, 1, 1, y < 4 ? "#ffdd58" : "#eda348");
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
      const travel = walkProgress((approach - 0.04) / 0.82);
      const center = 30 + HOME_DISTANCE * travel;
      const moving = travel > 0 && travel < 1;
      const stop = approach < 0.12 ? HOME : Math.max(from, to);
      const reveal = ease((approach - 0.79) / 0.15);
      const left = to === HOME ? heading > 0 : heading < 0;
      drawGround(0);
      drawPost(stop, 0, reveal);
      showSign(stop, 0, reveal);
      const distance = (left ? -1 : 1) * HOME_DISTANCE * travel;
      drawMoon(center, moving ? distance : null, left && moving, travel === 1, HOME_DISTANCE / 4);
      return;
    }

    const travel = walkProgress((t - 0.035) / 0.89);
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
    const distance = heading * STATION_SPACING * travel;
    drawMoon(center, moving ? distance : null, direction * heading < 0 && moving, !moving);
  }

  return { prepareStop, rest, walk, getSky: () => currentSky };
}
