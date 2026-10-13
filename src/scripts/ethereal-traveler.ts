import { CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from "three";

const TAU = Math.PI * 2;
const ease = (t: number) => t * t * (3 - 2 * t);

/** A 60-second out-and-back route confined to the level poolside paths. */
export function travelerPose(time: number) {
  const t = ((time % 60) + 60) % 60;
  let x = -1.64, z = 1.37, heading = Math.PI, stride = 0, walking = 0;
  const move = (start: number, duration: number, cycles: number) => {
    const u = (t - start) / duration;
    const progress = ease(u);
    stride = progress * cycles * TAU;
    walking = Math.min(1, u * 10, (1 - u) * 10);
    return progress;
  };
  if (t < 3) heading = Math.PI - ease(t / 3) * Math.PI / 2;
  else if (t < 19) { x += 3.32 * move(3, 16, 12); heading = Math.PI / 2; }
  else if (t < 20) { x = 1.68; heading = Math.PI / 2 + ease(t - 19) * Math.PI / 2; }
  else if (t < 28) { x = 1.68; z -= 1.47 * move(20, 8, 5); heading = Math.PI; }
  else if (t < 33) { x = 1.68; z = -0.10; heading = Math.PI + ease((t - 28) / 5) * Math.PI; }
  else if (t < 41) { x = 1.68; z = -0.10 + 1.47 * move(33, 8, 5); heading = TAU; }
  else if (t < 42) { x = 1.68; heading = TAU - ease(t - 41) * Math.PI / 2; }
  else if (t < 58) { x = 1.68 - 3.32 * move(42, 16, 12); heading = Math.PI * 1.5; }
  else heading = Math.PI * 1.5 - ease((t - 58) / 2) * Math.PI / 2;
  return { x, z, heading, stride, walking };
}

export function createTraveler() {
  const group = new Group();
  group.name = "Poolside traveler";
  const figure = new Group();
  group.add(figure);
  const sphere = new SphereGeometry(1, 12, 8);
  const cylinder = new CylinderGeometry(1, 1, 1, 10);
  const coatShape = new CylinderGeometry(.054, .081, .14, 10);
  const shadowShape = new CircleGeometry(.105, 20);
  const hood = new MeshStandardMaterial({ color: "#514875", roughness: .9 });
  const coat = new MeshStandardMaterial({ color: "#8584b9", roughness: .9 });
  const face = new MeshStandardMaterial({ color: "#ffe6c7", roughness: .85 });
  const scarf = new MeshStandardMaterial({ color: "#e9a887", roughness: .85 });
  const shadowMaterial = new MeshBasicMaterial({ color: "#515477", transparent: true, opacity: .14, depthWrite: false });
  const shadow = new Mesh(shadowShape, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .002;
  group.add(shadow);

  function ball(parent: Group, material: MeshStandardMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const mesh = new Mesh(sphere, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }
  const robe = new Mesh(coatShape, coat);
  robe.position.y = .22;
  figure.add(robe);
  ball(figure, hood, 0, .343, 0, .068, .075, .064);
  ball(figure, face, 0, .34, .049, .043, .047, .021);
  ball(figure, scarf, 0, .282, .033, .059, .018, .035);
  ball(figure, hood, 0, .221, -.068, .042, .052, .025);
  const arms = [-1, 1].map(side => {
    const pivot = new Group();
    pivot.position.set(side * .065, .265, 0);
    figure.add(pivot);
    ball(pivot, coat, 0, -.043, 0, .021, .057, .022);
    ball(pivot, face, 0, -.096, 0, .018, .019, .019);
    return pivot;
  });
  const legs = [-1, 1].map(side => {
    const upper = new Mesh(cylinder, hood);
    const lower = new Mesh(cylinder, hood);
    figure.add(upper, lower);
    const foot = ball(figure, hood, side * .031, .012, .01, .025, .014, .037);
    return { upper, lower, foot, x: side * .031 };
  });
  function bone(mesh: Mesh, x: number, y1: number, z1: number, y2: number, z2: number) {
    mesh.position.set(x, (y1 + y2) / 2, (z1 + z2) / 2);
    mesh.scale.set(.018, Math.hypot(y2 - y1, z2 - z1), .018);
    mesh.rotation.x = Math.atan2(z2 - z1, y2 - y1);
  }
  let disposed = false;
  function update(time: number) {
    if (disposed) return;
    const pose = travelerPose(time);
    group.position.set(pose.x, .4, pose.z);
    figure.rotation.y = pose.heading;
    legs.forEach(({ upper, lower, foot, x }, index) => {
      const phase = ((pose.stride / TAU + index * .5) % 1 + 1) % 1;
      // The stance foot stays on the stone; only the returning foot lifts.
      const stance = phase < .6;
      const swing = (phase - .6) / .4;
      const z = (stance ? .07 - phase / .6 * .14 : -.07 + ease(swing) * .14) * pose.walking;
      const y = .015 + (stance ? 0 : Math.sin(swing * Math.PI) * .042 * pose.walking);
      foot.position.set(x, y, z + .01);
      const dy = y - .15;
      const distance = Math.hypot(dy, z);
      const bend = Math.sqrt(Math.max(0, .09 ** 2 - (distance / 2) ** 2));
      const kneeY = (.15 + y) / 2 + z / distance * bend;
      const kneeZ = z / 2 - dy / distance * bend;
      bone(upper, x, .15, 0, kneeY, kneeZ);
      bone(lower, x, kneeY, kneeZ, y, z);
      arms[index].rotation.x = Math.sin(pose.stride + index * Math.PI) * .36 * pose.walking;
    });
  }
  update(0);
  return {
    group, update,
    dispose() {
      if (disposed) return;
      disposed = true;
      [sphere, cylinder, coatShape, shadowShape].forEach(value => value.dispose());
      [hood, coat, face, scarf, shadowMaterial].forEach(value => value.dispose());
      group.clear();
    },
  };
}
