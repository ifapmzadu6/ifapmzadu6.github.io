import {
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * A grounded, walkable-looking little sanctuary. Its water is supplied by the
 * renderer: the clear pool is x ±1.4, z ±1.15, with a surface at y = 0.26.
 * All transforms are final; only the surrounding light and water should move.
 */
export function createStageArchitecture(): { group: Group; dispose(): void } {
  const group = new Group();
  group.name = "Ivory sanctuary architecture";
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshStandardMaterial>();
  const instances: InstancedMesh[] = [];
  const blocks = new Map<string, RoundedBoxGeometry>();

  function surface(color: string, roughness = 0.72) {
    const material = new MeshStandardMaterial({ color, roughness, metalness: 0 });
    materials.add(material);
    return material;
  }

  // Warm faces retain visible tonal separation from the pale page, while the
  // directional light provides the cooler architectural side planes.
  const stone = surface("#e8e5de");
  const chalk = surface("#f0ece3");
  const shadedStone = surface("#dcdedc");
  const poolStone = surface("#c4d9d8", 0.8);
  const distantStone = surface("#c9c2de", 0.64);
  const distantEdge = surface("#d5cee5", 0.64);
  const crystalMaterial = surface("#ffffff", 0.4);
  crystalMaterial.metalness = 0.04;

  function remember<T extends BufferGeometry>(geometry: T): T {
    geometries.add(geometry);
    return geometry;
  }

  function addStone(geometry: BufferGeometry,
    material: MeshStandardMaterial | MeshStandardMaterial[],
    x: number, y: number, z: number, rotationY = 0) {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function block(width: number, height: number, depth: number,
    x: number, top: number, z: number, material = stone, radius = 0.012) {
    const key = [width, height, depth, radius].join(":");
    let geometry = blocks.get(key);
    if (!geometry) {
      geometry = remember(new RoundedBoxGeometry(width, height, depth, 1, radius));
      blocks.set(key, geometry);
    }
    return addStone(geometry, material, x, top - height / 2, z);
  }

  /** Individual fitted stones form restrained masonry seams, not a wire grid. */
  function terrace(xMin: number, xMax: number, zMin: number, zMax: number,
    top: number, columns: number, rows: number, base = 0.035) {
    const width = (xMax - xMin) / columns;
    const depth = (zMax - zMin) / rows;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const variation = (column + row * 2) % 5 === 0 ? chalk : stone;
        block(width - 0.009, top - base, depth - 0.009,
          xMin + width * (column + 0.5), top,
          zMin + depth * (row + 0.5), variation);
      }
    }
  }

  // A shallow basin, surrounded by substantial stone paths. The bed is far
  // enough below the water plane to avoid depth fighting at every camera size.
  block(2.8, 0.14, 2.3, 0, 0.14, 0, poolStone, 0.018);
  terrace(-2.08, -1.4, -1.15, 1.15, 0.4, 1, 5);
  terrace(1.4, 2.08, -1.15, 1.15, 0.4, 1, 5);
  terrace(-2.08, 2.08, 1.15, 1.65, 0.4, 8, 1);

  // Higher rear courts give the distant doorway and main arch their own
  // silhouettes, and remain connected to both side paths by stone stairs.
  terrace(-2.08, 0.25, -2.04, -1.15, 0.75, 5, 2);
  terrace(0.25, 2.08, -2.04, -1.15, 0.85, 4, 2);

  /** Stairs descend toward +z; every tread has a real solid riser beneath it. */
  function stairs(x: number, startZ: number, width: number, run: number,
    high: number, low: number, count: number) {
    const tread = run / count;
    const rise = (high - low) / count;
    for (let step = 0; step < count; step++) {
      const top = high - rise * (step + 1);
      // The existing side path is the last tread; another face at exactly its
      // height would shimmer against it. The front entry ends on bare ground.
      if (step === count - 1 && low > 0.1) continue;
      block(width, top - 0.015, tread + 0.004,
        x, top, startZ + tread * (step + 0.5), chalk, 0.008);
    }
  }

  // Front entry meets the surrounding ground. Side steps keep the pool open,
  // rather than putting a decorative staircase through the water itself.
  stairs(0.2, 1.63, 0.86, 0.45, 0.4, 0.04, 5);
  stairs(1.73, -1.17, 0.62, 0.82, 0.85, 0.4, 6);
  stairs(-1.74, -1.17, 0.62, 0.65, 0.75, 0.4, 5);

  // Thin caps along the water's vertical walls catch a soft, continuous edge
  // of light. They are coplanar with neither the bed nor the water surface.
  block(2.77, 0.045, 0.055, 0, 0.41, 1.178, chalk, 0.006);
  block(0.055, 0.045, 2.29, -1.426, 0.41, 0, chalk, 0.006);
  block(0.055, 0.045, 2.29, 1.426, 0.41, 0, chalk, 0.006);

  function archGeometry(width: number, height: number, depth: number,
    wall: number) {
    const radius = width / 2;
    const inside = radius - wall;
    const spring = height - radius;
    // One U-shaped outline leaves a genuinely open doorway all the way to its
    // threshold, avoiding a touching hole contour or hidden bottom face.
    const shape = new Shape();
    shape.moveTo(-radius, 0);
    shape.lineTo(-radius, spring);
    shape.absarc(0, spring, radius, Math.PI, 0, true);
    shape.lineTo(radius, 0);
    shape.lineTo(inside, 0);
    shape.lineTo(inside, spring);
    shape.absarc(0, spring, inside, 0, Math.PI, false);
    shape.lineTo(-inside, 0);
    shape.closePath();
    const geometry = remember(new ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      curveSegments: 24,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.012,
      bevelSegments: 2,
    }));
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }

  function arch(x: number, z: number, base: number, width: number,
    height: number, depth: number, rotationY = 0, distant = false) {
    const cap = distant ? distantEdge : chalk;
    const edge = distant ? distantStone : stone;
    const mesh = addStone(archGeometry(width, height, depth, width * 0.215),
      [cap, edge], x, base, z, rotationY);
    mesh.name = distant ? "Distant lavender doorway" : "Carved ivory arch";
    // A single slightly inset threshold anchors each opening to its court.
    const threshold = block(width * 0.64, 0.035, depth * 1.55,
      x, base + 0.025, z, cap, 0.008);
    threshold.rotation.y = rotationY;
  }

  arch(0.8, -1.5, 0.85, 0.93, 1.72, 0.28);
  arch(-1.7, 0.5, 0.4, 0.83, 1.7, 0.25, Math.PI / 2);
  arch(-1.7, -1.8, 0.75, 0.62, 1.23, 0.22, 0, true);

  // A few irregular mineral outcrops soften the masonry into the landscape.
  // Their bases touch the same ground as the terraces; there is no floating slab.
  const rockGeometry = remember(new DodecahedronGeometry(1, 0));
  const rocks: [number, number, number, number, number, number][] = [
    [-2.00, 0.10, 0.98, 0.12, 0.17, 0.17],
    [-1.97, 0.10, 1.70, 0.17, 0.19, 0.17],
    [-1.52, 0.11, 1.79, 0.21, 0.17, 0.19],
    [-0.88, 0.10, 1.84, 0.22, 0.19, 0.17],
    [-0.63, 0.06, 1.88, 0.11, 0.10, 0.13],
    [1.13, 0.10, 1.82, 0.18, 0.16, 0.17],
    [1.72, 0.12, 1.74, 0.24, 0.18, 0.19],
    [1.99, 0.09, 0.58, 0.12, 0.19, 0.19],
    [1.98, 0.47, -0.15, 0.10, 0.10, 0.15],
    [-1.99, 0.81, -1.2, 0.10, 0.09, 0.12],
  ];
  rocks.forEach(([x, y, z, sx, sy, sz], index) => {
    const rock = addStone(rockGeometry, index % 3 ? stone : shadedStone, x, y, z);
    rock.scale.set(sx, sy, sz);
    rock.rotation.set(index * 0.37, index * 1.31, index * 0.19);
  });

  // A hexagonal stem with a long mineral tip; the same small geometry also
  // becomes the leaves of the restrained, branching crystalline vegetation.
  const crystalVertices: number[] = [];
  const crystalIndices: number[] = [];
  const crystalSides = 6;
  for (const y of [0, 0.69]) {
    for (let side = 0; side < crystalSides; side++) {
      const angle = side / crystalSides * Math.PI * 2;
      crystalVertices.push(Math.cos(angle), y, Math.sin(angle));
    }
  }
  crystalVertices.push(0, 1, 0);
  for (let side = 0; side < crystalSides; side++) {
    const next = (side + 1) % crystalSides;
    crystalIndices.push(side, side + crystalSides, next,
      next, side + crystalSides, next + crystalSides,
      side + crystalSides, crystalSides * 2, next + crystalSides);
  }
  const indexedCrystal = new BufferGeometry();
  indexedCrystal.setAttribute("position", new Float32BufferAttribute(crystalVertices, 3));
  indexedCrystal.setIndex(crystalIndices);
  const crystalGeometry = remember(indexedCrystal.toNonIndexed());
  indexedCrystal.dispose();
  crystalGeometry.computeVertexNormals();

  type Crystal = {
    x: number; y: number; z: number;
    radius: number; height: number;
    tilt: number; turn: number; color: string;
  };
  const crystals: Crystal[] = [];
  const lilacs = ["#b8acd4", "#c9b9de", "#dccde8", "#a8b2d3"];

  function crystalCluster(x: number, y: number, z: number, scale: number) {
    for (let index = 0; index < 5; index++) {
      const angle = index * 2.4;
      crystals.push({
        x: x + Math.cos(angle) * 0.085 * scale,
        y,
        z: z + Math.sin(angle) * 0.085 * scale,
        radius: (index === 0 ? 0.052 : 0.038) * scale,
        height: (index === 0 ? 0.45 : 0.22 + index * 0.038) * scale,
        tilt: index === 0 ? 0.02 : 0.15,
        turn: angle,
        color: lilacs[index % lilacs.length],
      });
    }
  }

  function crystallinePlant(x: number, y: number, z: number, scale: number) {
    // Three slender stems, with paired tapering leaves. All are batched into
    // one instanced mesh, so the fine botanical detail does not add draw calls.
    for (let stem = 0; stem < 3; stem++) {
      const angle = stem * 2.4;
      const stemX = x + Math.cos(angle) * 0.055 * scale;
      const stemZ = z + Math.sin(angle) * 0.055 * scale;
      const height = (0.30 + stem * 0.065) * scale;
      crystals.push({ x: stemX, y, z: stemZ, radius: 0.012 * scale,
        height, tilt: 0.12, turn: angle, color: "#ada2c3" });
      for (let leaf = 0; leaf < 3; leaf++) {
        const leafAngle = angle + leaf * 2.3;
        crystals.push({
          x: stemX + Math.cos(leafAngle) * 0.02 * scale,
          y: y + height * (0.25 + leaf * 0.2),
          z: stemZ + Math.sin(leafAngle) * 0.02 * scale,
          radius: 0.024 * scale,
          height: 0.13 * scale,
          tilt: 0.67,
          turn: leafAngle,
          color: lilacs[(stem + leaf) % lilacs.length],
        });
      }
    }
  }

  crystalCluster(1.82, 0.85, -1.57, 1.05);
  crystalCluster(-1.91, 0.4, 1.29, 0.65);
  crystalCluster(-1.89, 0.75, -1.93, 0.38);
  crystallinePlant(-0.42, 0.75, -1.67, 0.83);
  crystallinePlant(-1.87, 0.4, 0.94, 0.76);
  crystallinePlant(1.82, 0.4, 0.76, 0.65);

  const mineralPlants = new InstancedMesh(crystalGeometry, crystalMaterial, crystals.length);
  mineralPlants.name = "Sparse lilac crystal vegetation";
  const transform = new Object3D();
  crystals.forEach((crystal, index) => {
    transform.position.set(crystal.x, crystal.y, crystal.z);
    transform.rotation.set(crystal.tilt, crystal.turn, crystal.tilt * 0.35);
    transform.scale.set(crystal.radius, crystal.height, crystal.radius);
    transform.updateMatrix();
    mineralPlants.setMatrixAt(index, transform.matrix);
    mineralPlants.setColorAt(index, new Color(crystal.color));
  });
  mineralPlants.instanceMatrix.needsUpdate = true;
  if (mineralPlants.instanceColor) mineralPlants.instanceColor.needsUpdate = true;
  mineralPlants.computeBoundingSphere();
  mineralPlants.castShadow = true;
  mineralPlants.receiveShadow = true;
  group.add(mineralPlants);
  instances.push(mineralPlants);

  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      instances.forEach((mesh) => mesh.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      group.clear();
    },
  };
}
