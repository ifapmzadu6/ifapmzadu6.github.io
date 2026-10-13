import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/scripts/ethereal-traveler.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace('from "three"', `from ${JSON.stringify(import.meta.resolve('three'))}`);
const { travelerPose, createTraveler } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

for (let t = 0; t <= 120; t += .025) {
  const pose = travelerPose(t);
  const onFront = pose.z >= 1.25 && pose.z <= 1.53 && pose.x >= -1.8 && pose.x <= 1.85;
  const onRight = pose.x >= 1.53 && pose.x <= 1.85 && pose.z >= -.2 && pose.z <= 1.53;
  assert.ok(onFront || onRight, `traveler leaves the safe stone path at ${t}`);
  const next = travelerPose(t + .025);
  assert.ok(Math.hypot(next.x - pose.x, next.z - pose.z) < .01, `position jumps at ${t}`);
  assert.ok(Math.hypot(Math.sin(next.heading) - Math.sin(pose.heading), Math.cos(next.heading) - Math.cos(pose.heading)) < .065, `heading jumps at ${t}`);
}
assert.deepEqual(travelerPose(0), travelerPose(120), 'controller clock wrap must not teleport the traveler');
for (const [start, end] of [[16, 17], [25, 30], [38, 39], [55, 60]]) {
  const first = travelerPose(start);
  const last = travelerPose(end);
  assert.ok(Math.hypot(first.x - last.x, first.z - last.z) < 1e-10, 'rests and turns must stay planted');
  assert.equal(travelerPose((start + end) / 2).walking, 0);
}
assert.ok(travelerPose(.5).x > travelerPose(0).x, 'walk from the start without an opening pause');
for (const t of [0, .5, 1, 2, 3]) {
  assert.equal(travelerPose(t).heading, Math.PI / 2, 'start facing the path without an opening turn');
}
const traveler = createTraveler();
const geometries = new Set();
const materials = new Set();
traveler.group.traverse(object => {
  if (object.geometry) geometries.add(object.geometry);
  if (object.material) materials.add(object.material);
});
for (let t = 0; t < 60; t += .05) {
  traveler.update(t);
  traveler.group.traverse(object => {
    assert.ok([...object.position, ...object.scale].every(Number.isFinite), 'animation transforms must stay finite');
  });
  assert.equal(traveler.group.position.y, .4, 'body must remain grounded on the level terrace');
}
let disposals = 0;
for (const resource of [...geometries, ...materials]) resource.addEventListener('dispose', () => disposals++);
traveler.dispose();
traveler.dispose();
assert.equal(disposals, geometries.size + materials.size, 'release shared resources exactly once');
assert.equal(traveler.group.children.length, 0);
console.log('PASS traveler route, turns, rests, clock wrap, finite poses, grounding, and resource cleanup');
