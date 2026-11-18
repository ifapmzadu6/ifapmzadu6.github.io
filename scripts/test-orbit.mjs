import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/scripts/orbit-scene.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { createOrbitScene, HOME } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const css = new Map();
globalThis.document = {
  documentElement: { style: { setProperty: (name, value) => css.set(name, value) } },
  querySelector: () => null,
};
globalThis.Image = class { async decode() {} };

const canvas = { width: 144, height: 134 };
const stack = [];
let transform = { x: 0, y: 0, sx: 1, sy: 1 };
let spriteDraws = 0;
let feet = new Map();
let pebbleX;

function canvasRect(x, y, width, height) {
  const x1 = transform.x + transform.sx * x;
  const y1 = transform.y + transform.sy * y;
  const x2 = x1 + transform.sx * width;
  const y2 = y1 + transform.sy * height;
  return { left: Math.min(x1, x2), right: Math.max(x1, x2), top: Math.min(y1, y2), bottom: Math.max(y1, y2) };
}

const context = {
  canvas,
  clearRect() {
    feet = new Map();
    pebbleX = undefined;
  },
  fillRect(x, y, width, height) {
    // This pebble is on its own scan line and remains identifiable as the camera scrolls.
    if (this.fillStyle === '#76647e' && y === 129) pebbleX = x;
    if (width === 7 && height === 2 && ['#ccabe8', '#a885ca'].includes(this.fillStyle)) {
      feet.set(this.fillStyle, canvasRect(x, y, width, height));
    }
  },
  save() { stack.push({ ...transform }); },
  restore() { transform = stack.pop(); },
  translate(x, y) { transform.x += x * transform.sx; transform.y += y * transform.sy; },
  scale(x, y) { transform.sx *= x; transform.sy *= y; },
  drawImage(image, ...args) {
    if (!image.src.startsWith('/assets/images/orbit/')) return;
    const [x, y, width = 48, height = 48] = args.length === 8 ? args.slice(4) : args;
    const rect = canvasRect(x, y, width, height);
    assert.ok(rect.left >= 0 && rect.right <= canvas.width, 'moon crossed a side of the stage');
    assert.ok(rect.top >= 0 && rect.bottom <= canvas.height, 'moon crossed the top or bottom of the stage');
    spriteDraws++;
  },
};
const apps = ['triple-take', 'otolume'].map(slug => ({ slug, name: slug, icon: '/icons/' + slug, description: '', url: '/' }));
const scene = await createOrbitScene(context, { style: {}, querySelector: () => ({}) }, apps);
const sky = () => [css.get('--sky-top'), css.get('--sky-low')];
const resting = new Map();
for (const stop of [HOME, 0, 1]) {
  scene.rest(stop);
  resting.set(stop, sky());
}

for (const [from, to, direction] of [[HOME, 0, 1], [0, 1, 1], [1, 0, -1], [0, HOME, -1]]) {
  scene.rest(from);
  const startSky = scene.getSky();
  const topColors = new Set();
  const horizonColors = new Set();
  const isStationWalk = from !== HOME && to !== HOME;
  const contacts = [];
  let anchor;
  let trackingSamples = 0;
  for (let frame = 0; frame <= 120; frame++) {
    const before = spriteDraws;
    scene.walk({ from, to, direction, progress: frame / 120, startSky }, 1);
    assert.equal(spriteDraws - before, 1, 'every frame draws one moon');
    const colors = sky();
    topColors.add(colors[0]);
    horizonColors.add(colors[1]);
    if (frame === 0) assert.deepEqual(colors, resting.get(from), 'walk starts in the current sky');
    for (const foot of feet.values()) {
      assert.ok(foot.left >= 0 && foot.right <= canvas.width, 'foot left the stage');
      assert.ok(foot.bottom <= 123, 'foot passed through the ground');
    }
    const planted = [...feet].filter(([, rect]) => rect.bottom === 123);
    if (feet.size > 0) assert.ok(planted.length > 0, 'a walking moon keeps one foot on the ground');
    if (planted.length !== 1) {
      anchor = undefined;
      continue;
    }

    const [foot, rect] = planted[0];
    if (contacts.at(-1) !== foot) contacts.push(foot);
    if (pebbleX === undefined) {
      anchor = undefined;
      continue;
    }
    const offset = rect.left - pebbleX;
    if (anchor?.foot === foot) {
      assert.ok(Math.abs(offset - anchor.offset) <= 2, 'planted foot skated relative to the ground');
      trackingSamples++;
    } else {
      anchor = { foot, offset };
    }
  }
  assert.deepEqual(sky(), resting.get(to), 'walk finishes in the destination sky');
  assert.ok(topColors.size > 2 && horizonColors.size > 2, 'both parts of the sky pass through intermediate colors');
  if (isStationWalk) {
    assert.ok(contacts.length >= 7 && contacts.length <= 9, 'one station walk has about eight alternating footfalls');
    assert.ok(trackingSamples >= 40, 'enough frames track a planted foot through each stride');
  }
}
console.log('PASS orbit moon bounds, grounded alternating steps, forward and return walks, and sky transitions');
