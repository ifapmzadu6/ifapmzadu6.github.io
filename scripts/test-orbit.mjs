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
let lastSprite;

function canvasRect(x, y, width, height) {
  const x1 = transform.x + transform.sx * x;
  const y1 = transform.y + transform.sy * y;
  const x2 = x1 + transform.sx * width;
  const y2 = y1 + transform.sy * height;
  return { left: Math.min(x1, x2), right: Math.max(x1, x2), top: Math.min(y1, y2), bottom: Math.max(y1, y2) };
}

const context = {
  canvas,
  clearRect() {}, fillRect() {},
  save() { stack.push({ ...transform }); },
  restore() { transform = stack.pop(); },
  translate(x, y) { transform.x += x * transform.sx; transform.y += y * transform.sy; },
  scale(x, y) { transform.sx *= x; transform.sy *= y; },
  drawImage(image, ...args) {
    if (!image.src.startsWith('/assets/images/orbit/')) return;
    if (args.length === 8) assert.deepEqual(args.slice(0, 4), [0, 0, 48, 48], 'the original moon pose is drawn in full');
    const [x, y, width = 48, height = 48] = args.length === 8 ? args.slice(4) : args;
    const rect = canvasRect(x, y, width, height);
    assert.ok(rect.left >= 0 && rect.right <= canvas.width, 'moon crossed a side of the stage');
    assert.ok(rect.top >= 0 && rect.bottom <= canvas.height, 'moon crossed the top or bottom of the stage');
    spriteDraws++;
    lastSprite = image.src.split('/').at(-1);
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
  const poses = [];
  for (let frame = 0; frame <= 120; frame++) {
    const before = spriteDraws;
    scene.walk({ from, to, direction, progress: frame / 120, startSky }, 1);
    assert.equal(spriteDraws - before, 1, 'every frame draws one moon');
    const colors = sky();
    topColors.add(colors[0]);
    horizonColors.add(colors[1]);
    if (frame === 0) assert.deepEqual(colors, resting.get(from), 'walk starts in the current sky');
    if (lastSprite.startsWith('walk-') && poses.at(-1) !== lastSprite) poses.push(lastSprite);
  }
  assert.deepEqual(sky(), resting.get(to), 'walk finishes in the destination sky');
  assert.ok(topColors.size > 2 && horizonColors.size > 2, 'both parts of the sky pass through intermediate colors');
  assert.deepEqual([...new Set(poses)].sort(), ['walk-0.png', 'walk-1.png', 'walk-2.png', 'walk-3.png']);
  // Allow for the standing pose at either end of the short approach or the longer walk between signs.
  const minPoses = isStationWalk ? 9 : 4;
  const maxPoses = isStationWalk ? 18 : 8;
  assert.ok(poses.length >= minPoses && poses.length <= maxPoses,
    `route ${from} to ${to} showed ${poses.length} successive poses, expected ${minPoses}–${maxPoses}`);
}
console.log('PASS orbit moon bounds, full four-pose walks at a relaxed cadence, forward and return walks, and sky transitions');
