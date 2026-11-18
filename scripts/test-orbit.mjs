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
const context = {
  canvas,
  fillRect() {}, clearRect() {},
  save() { stack.push({ ...transform }); },
  restore() { transform = stack.pop(); },
  translate(x, y) { transform.x += x * transform.sx; transform.y += y * transform.sy; },
  scale(x, y) { transform.sx *= x; transform.sy *= y; },
  drawImage(image, x, y) {
    if (!image.src.startsWith('/assets/images/orbit/')) return;
    const { sx, sy } = transform;
    const left = transform.x + sx * x;
    const top = transform.y + sy * y;
    // Check both ends of the 48px sprite, including mirrored, left-facing strides.
    for (const edge of [left, left + 48 * sx]) assert.ok(edge >= 0 && edge <= canvas.width, 'moon crossed a side of the stage');
    for (const edge of [top, top + 48 * sy]) assert.ok(edge >= 0 && edge <= canvas.height, 'moon crossed the top or bottom of the stage');
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
  for (let frame = 0; frame <= 120; frame++) {
    const before = spriteDraws;
    scene.walk({ from, to, direction, progress: frame / 120, startSky }, 1);
    assert.equal(spriteDraws - before, 1, 'every frame draws one moon');
    const colors = sky();
    topColors.add(colors[0]);
    horizonColors.add(colors[1]);
    if (frame === 0) assert.deepEqual(colors, resting.get(from), 'walk starts in the current sky');
  }
  assert.deepEqual(sky(), resting.get(to), 'walk finishes in the destination sky');
  assert.ok(topColors.size > 2 && horizonColors.size > 2, 'both parts of the sky pass through intermediate colors');
}
console.log('PASS orbit moon bounds, forward and return walks, and sky transitions');
