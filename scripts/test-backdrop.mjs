// Run with node scripts/test-backdrop.mjs, or as part of npm test.
// This executes the actual controller after TypeScript transpilation. The only
// replaced dependency is its dynamic GPU scene import, so races can be controlled.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getEventListeners } from 'node:events';
import ts from 'typescript';
import vm from 'node:vm';

const source = await readFile(new URL('../src/scripts/ethereal-backdrop.ts', import.meta.url), 'utf8');
assert.ok(source.includes('await import("./ethereal-stage-scene")'), 'test must intercept the actual lazy scene import');
const compiled = ts.transpileModule(
  source.replace('import("./ethereal-stage-scene")', '__loadScene()'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText.replace(/^export\s*\{\s*\};?\s*$/m, '');

const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mockScene() {
  return {
    renders: [], sizes: [], disposals: 0, throwOnRender: false,
    resize(...values) { this.sizes.push(values); },
    render(...values) {
      if (this.throwOnRender) throw new Error('simulated render failure');
      this.renders.push(values);
    },
    dispose() { this.disposals += 1; },
  };
}
function emit(target, name, values = {}) {
  const event = new Event(name, { cancelable: true });
  Object.assign(event, values);
  target.dispatchEvent(event);
  return event;
}
function harness({ reduced = false, fine = false, width = 351, height = 351, dpr = 3 } = {}) {
  const canvas = new EventTarget();
  const pointerArea = new EventTarget();
  const root = Object.assign(new EventTarget(), {
    dataset: { state: 'static' }, clientWidth: width, clientHeight: height,
    isConnected: true, parentElement: pointerArea,
    querySelector: (selector) => selector === 'canvas' ? canvas : null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: root.clientWidth, height: root.clientHeight }),
  });
  const document = Object.assign(new EventTarget(), {
    hidden: false, body: {}, querySelectorAll: () => [root],
  });
  const intersections = [];
  const resizes = [];
  const mutations = [];
  function observerClass(list) {
    return class {
      constructor(callback) { this.callback = callback; this.disconnected = false; list.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    };
  }
  const IntersectionObserver = observerClass(intersections);
  const ResizeObserver = observerClass(resizes);
  const MutationObserver = observerClass(mutations);
  const queries = new Map();
  const matchMedia = (query) => {
    if (!queries.has(query)) queries.set(query, Object.assign(new EventTarget(), {
      matches: query.includes('reduced-motion') ? reduced : query.includes('pointer: fine') ? fine : true,
      media: query,
    }));
    return queries.get(query);
  };
  const window = Object.assign(new EventTarget(), {
    devicePixelRatio: dpr, IntersectionObserver, ResizeObserver, AbortController,
  });
  const raf = new Map();
  let nextFrame = 0;
  let imports = 0;
  let factories = 0;
  const created = [];
  let factory = () => { const scene = mockScene(); created.push(scene); return Promise.resolve(scene); };
  const module = { createStageScene: async (target) => {
    assert.equal(target, canvas);
    factories += 1;
    return factory();
  } };
  let load = () => Promise.resolve(module);
  vm.runInNewContext(compiled, {
    document, window, AbortController, IntersectionObserver, ResizeObserver, MutationObserver,
    matchMedia, requestAnimationFrame: (callback) => { const id = ++nextFrame; raf.set(id, callback); return id; },
    cancelAnimationFrame: (id) => raf.delete(id),
    __loadScene: () => { imports += 1; return load(); },
  }, { filename: 'ethereal-backdrop.actual-controller.js' });
  const notify = (list, entries = []) => list.forEach((observer) => {
    if (!observer.disconnected) observer.callback(entries);
  });
  return {
    root, canvas, pointerArea, document, window, raf, created, module, queries,
    get imports() { return imports; }, get factories() { return factories; },
    setFactory(value) { factory = value; }, setLoader(value) { load = value; },
    visible(value) { notify(intersections, [{ isIntersecting: value }]); },
    hidden(value) { document.hidden = value; emit(document, 'visibilitychange'); },
    reduced(value) { const query = matchMedia('(prefers-reduced-motion: reduce)'); query.matches = value; emit(query, 'change'); },
    fine(value) { const query = matchMedia('(hover: hover) and (pointer: fine)'); query.matches = value; emit(query, 'change'); },
    resize(newWidth, newHeight) { root.clientWidth = newWidth; root.clientHeight = newHeight; notify(resizes); },
    pixelRatio(value) {
      const oldQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      window.devicePixelRatio = value;
      emit(oldQuery, 'change');
    },
    tick(now) { const pending = [...raf.values()]; raf.clear(); pending.forEach((callback) => callback(now)); },
    remove() { root.isConnected = false; notify(mutations); },
    assertDisconnected() {
      for (const observer of [...intersections, ...resizes, ...mutations]) assert.equal(observer.disconnected, true);
      for (const [target, names] of [
        [document, ['visibilitychange']], [window, ['pagehide', 'pageshow']],
        [canvas, ['webglcontextlost', 'webglcontextrestored']],
        [pointerArea, ['pointermove', 'pointerleave']],
        ...[...queries.values()].map((query) => [query, ['change']]),
      ]) {
        for (const name of names) assert.equal(getEventListeners(target, name).length, 0, `${name} listener must be released`);
      }
    },
  };
}

let passed = 0;
async function check(name, run) {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
}

await check('initial reduced motion and offscreen hero never import or allocate GPU resources', async () => {
  const h = harness({ reduced: true });
  h.visible(true);
  h.resize(390, 390);
  await flush();
  assert.equal(h.imports, 0);
  assert.equal(h.factories, 0);
  h.visible(false);
  h.reduced(false);
  await flush();
  assert.equal(h.imports, 0);
  h.visible(true);
  await flush();
  assert.equal(h.factories, 1);
  h.tick(100);
  assert.equal(h.root.dataset.state, 'running');
});

await check('hiding while the module loads prevents renderer creation', async () => {
  const h = harness();
  const loading = deferred();
  h.setLoader(() => loading.promise);
  h.visible(true);
  assert.equal(h.imports, 1);
  h.hidden(true);
  loading.resolve(h.module);
  await flush();
  assert.equal(h.factories, 0);
  assert.equal(h.raf.size, 0);
  assert.equal(h.root.dataset.state, 'static');
  h.hidden(false);
  await flush();
  assert.equal(h.factories, 1);
});

await check('reduced motion during async compilation disposes the completed result', async () => {
  const h = harness();
  const compiling = deferred();
  const candidate = mockScene();
  h.setFactory(() => compiling.promise);
  h.visible(true);
  await flush();
  assert.equal(h.factories, 1);
  h.reduced(true);
  compiling.resolve(candidate);
  await flush();
  assert.equal(candidate.disposals, 1);
  assert.equal(candidate.renders.length, 0);
  assert.equal(h.raf.size, 0);
  assert.equal(h.root.dataset.state, 'static');
});

await check('hide/show during compilation serializes creation and rejects the obsolete scene', async () => {
  const h = harness();
  const compiling = deferred();
  const obsolete = mockScene();
  const current = mockScene();
  h.setFactory(() => h.factories === 1 ? compiling.promise : Promise.resolve(current));
  h.visible(true);
  await flush();
  h.hidden(true);
  h.hidden(false);
  await flush();
  assert.equal(h.factories, 1, 'must not create overlapping renderers');
  compiling.resolve(obsolete);
  await flush();
  assert.equal(h.factories, 2);
  assert.equal(obsolete.disposals, 1);
  assert.equal(obsolete.renders.length, 0);
  h.tick(100);
  assert.equal(current.renders.length, 1);
});

await check('DOM removal during compilation releases its eventual result and all observers/listeners', async () => {
  const h = harness();
  const compiling = deferred();
  const candidate = mockScene();
  h.setFactory(() => compiling.promise);
  h.visible(true);
  await flush();
  h.remove();
  h.assertDisconnected();
  compiling.resolve(candidate);
  await flush();
  assert.equal(candidate.disposals, 1);
  assert.equal(h.raf.size, 0);
  h.hidden(false);
  h.reduced(false);
  emit(h.window, 'pageshow');
  emit(h.canvas, 'webglcontextrestored');
  await flush();
  assert.equal(h.factories, 1);
});

await check('module/setup failure remains a static fallback without observer-driven retry loops', async () => {
  for (const phase of ['import', 'factory']) {
    const h = harness();
    if (phase === 'import') h.setLoader(() => Promise.reject(new Error('network failure')));
    else h.setFactory(() => Promise.reject(new Error('WebGL unsupported')));
    h.visible(true);
    await flush();
    const attempts = [h.imports, h.factories];
    h.visible(false); h.visible(true);
    h.hidden(true); h.hidden(false);
    h.reduced(true); h.reduced(false);
    h.resize(400, 400);
    await flush();
    assert.deepEqual([h.imports, h.factories], attempts);
    assert.equal(h.root.dataset.state, 'static');
    assert.equal(h.raf.size, 0);
  }
});

await check('context loss disposes the live scene and restoration builds fresh GPU resources', async () => {
  const h = harness();
  h.visible(true);
  await flush();
  h.tick(100);
  const old = h.created[0];
  const event = emit(h.canvas, 'webglcontextlost');
  assert.equal(event.defaultPrevented, true);
  assert.equal(old.disposals, 1);
  assert.equal(h.raf.size, 0);
  assert.equal(h.root.dataset.state, 'static');
  emit(h.canvas, 'webglcontextrestored');
  await flush();
  assert.equal(h.factories, 2);
  h.tick(200);
  assert.equal(h.created[1].renders.length, 1);
  assert.equal(old.renders.length, 1);
});

await check('context restore during failed compilation waits for old setup before recreating', async () => {
  const h = harness();
  const compiling = deferred();
  const restored = mockScene();
  h.setFactory(() => h.factories === 1 ? compiling.promise : Promise.resolve(restored));
  h.visible(true);
  await flush();
  emit(h.canvas, 'webglcontextlost');
  emit(h.canvas, 'webglcontextrestored');
  await flush();
  assert.equal(h.factories, 1);
  compiling.reject(new Error('compilation interrupted by context loss'));
  await flush();
  assert.equal(h.factories, 2);
  h.tick(100);
  assert.equal(restored.renders.length, 1);
});

await check('coarse-pointer phones animate continuously without touch and obey the frame cap', async () => {
  const h = harness({ fine: false });
  h.visible(true);
  await flush();
  const scene = h.created[0];
  emit(h.pointerArea, 'pointermove', { pointerType: 'touch', clientX: 351, clientY: 0 });
  const renderTimes = [];
  for (let now = 100; now <= 2_100; now += 10) {
    const count = scene.renders.length;
    h.tick(now);
    if (count !== scene.renders.length) renderTimes.push(now);
  }
  assert.ok(scene.renders.length > 30, 'must continue rendering without pointer input');
  for (let i = 1; i < renderTimes.length; i += 1) assert.ok(renderTimes[i] - renderTimes[i - 1] >= 1_000 / 24);
  assert.ok(scene.renders.at(-1)[0] > 1.5, 'lighting time advances');
  assert.ok(scene.renders.every(([, x, y]) => x === 0 && y === 0));
});

await check('resize and DPR changes enforce both DPR and drawing-pixel limits', async () => {
  const h = harness({ width: 900, height: 900, dpr: 3 });
  h.visible(true);
  await flush();
  h.tick(100);
  const scene = h.created[0];
  function assertCap() {
    const [width, height, ratio] = scene.sizes.at(-1);
    assert.ok(ratio <= 1.5);
    assert.ok(width * height * ratio * ratio <= 450_000.0001);
  }
  assertCap();
  h.resize(351, 351);
  h.tick(110);
  assertCap();
  assert.equal(scene.sizes.at(-1)[2], 1.5);
  h.pixelRatio(1);
  h.tick(120);
  assertCap();
  assert.equal(scene.sizes.at(-1)[2], 1);
});

await check('pagehide and offscreen pause reveal fallback, and BFCache resumes without a time jump', async () => {
  const h = harness();
  h.visible(true);
  await flush();
  h.tick(100); h.tick(200);
  const scene = h.created[0];
  const time = scene.renders.at(-1)[0];
  emit(h.window, 'pagehide');
  assert.equal(h.raf.size, 0);
  assert.equal(h.root.dataset.state, 'static');
  emit(h.window, 'pageshow');
  h.tick(100_000);
  assert.equal(scene.renders.at(-1)[0], time);
  assert.equal(h.factories, 1);
  assert.equal(h.root.dataset.state, 'running');
  h.visible(false);
  assert.equal(h.raf.size, 0);
  assert.equal(h.root.dataset.state, 'static');
  h.visible(true);
  h.tick(200_000);
  assert.equal(scene.renders.at(-1)[0], time);
});

await check('fine pointers only influence eligible scenes and pointer mode changes reset them', async () => {
  const h = harness({ fine: true });
  h.visible(true);
  await flush();
  const scene = h.created[0];
  emit(h.pointerArea, 'pointermove', { pointerType: 'mouse', clientX: 351, clientY: 0 });
  h.tick(100);
  assert.deepEqual(scene.renders.at(-1).slice(1), [1, 1]);
  h.fine(false);
  h.tick(200);
  assert.deepEqual(scene.renders.at(-1).slice(1), [0, 0]);
});

await check('render errors stop animation, release GPU resources and retain fallback', async () => {
  const h = harness();
  h.visible(true);
  await flush();
  const scene = h.created[0];
  scene.throwOnRender = true;
  h.tick(100);
  assert.equal(scene.disposals, 1);
  assert.equal(h.raf.size, 0);
  assert.equal(h.root.dataset.state, 'static');
  h.resize(400, 400);
  await flush();
  assert.equal(h.factories, 1);
});

console.log(`PASS ${passed} lifecycle scenarios against the actual controller`);
