import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { createStageArchitecture } from "./ethereal-stage-geometry";
import { createTraveler } from "./ethereal-traveler";

export interface StageScene {
  resize(width: number, height: number, pixelRatio: number): void;
  render(timeSeconds: number, pointerX: number, pointerY: number): void;
  dispose(): void;
}

/** A fixed orthographic water garden with a quiet poolside traveler. */
export async function createStageScene(canvas: HTMLCanvasElement): Promise<StageScene> {
  const renderer = new WebGLRenderer({
    canvas, alpha: true, antialias: true, powerPreference: "low-power",
    premultipliedAlpha: false, depth: true, stencil: false,
  });
  try {
    return await initializeStage(renderer, canvas);
  } catch (error) {
    // Setup can fail before scene resources reach the compilation cleanup path.
    renderer.dispose();
    throw error;
  }
}

async function initializeStage(renderer: WebGLRenderer, canvas: HTMLCanvasElement): Promise<StageScene> {
  renderer.setClearColor(0xffffff, 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // The architecture and sun are fixed. Reuse this map on every water frame.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new Scene();
  const camera = new OrthographicCamera(-3.5, 3.5, 3.5, -3.5, 0.1, 30);
  camera.position.set(6, 5.5, 7);
  camera.lookAt(0, 0.65, 0);
  const architecture = createStageArchitecture();
  scene.add(architecture.group);
  const traveler = createTraveler();
  scene.add(traveler.group);

  const sky = new HemisphereLight("#e5ecff", "#b7acd3", 2.1);
  const sun = new DirectionalLight("#fff3df", 2.1);
  sun.position.set(-3, 7, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -4;
  sun.shadow.camera.right = 4;
  sun.shadow.camera.top = 4;
  sun.shadow.camera.bottom = -4;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 18;
  sun.shadow.radius = 3;
  sun.shadow.normalBias = 0.02;
  sun.shadow.bias = -0.0002;
  const lavender = new DirectionalLight("#dfc9ff", 0.65);
  lavender.position.set(4, 3, -4);
  scene.add(sky, sun, lavender);

  const floorGeometry = new PlaneGeometry(14, 14);
  const floorMaterial = new ShadowMaterial({ color: "#8292b6", opacity: 0.12 });
  const floor = new Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  const waterGeometry = new PlaneGeometry(2.8, 2.3);
  const waterTime = { value: 0 };
  const gateTime = { value: 0 };
  const waterMaterial = new MeshStandardMaterial({
    color: "#92d9df", roughness: 0.3, metalness: 0.05,
    emissive: "#c4f6f4", emissiveIntensity: 0.13,
  });
  // Broad, derivative-antialiased caustic cells; no textures, extra render
  // targets, vertex displacement, or per-frame geometry allocation.
  waterMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.stageTime = waterTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 stageUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nstageUv = uv;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      uniform float stageTime;
      varying vec2 stageUv;
      vec2 cellSeed(vec2 p) {
        return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
          dot(p, vec2(269.5, 183.3)))) * 43758.5453);
      }
      float waterLight(vec2 p, float t) {
        p += .42 * vec2(sin(p.y * 1.7 + t), cos(p.x * 1.4 - t));
        vec2 cell = floor(p), local = fract(p);
        float first = 8.0, second = 8.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 seed = cellSeed(cell + neighbor);
            vec2 point = .5 + .28 * sin(6.283185 * seed + vec2(t, -t));
            float d = length(neighbor + point - local);
            if (d < first) { second = first; first = d; }
            else { second = min(second, d); }
          }
        }
        float edge = second - first;
        float softness = max(fwidth(edge) * 1.4, .024);
        return 1.0 - smoothstep(.025, .025 + softness, edge);
      }
    `).replace("#include <color_fragment>", `
      #include <color_fragment>
      float light = waterLight(stageUv * vec2(7.0, 5.7), stageTime);
      float broad = .5 + .5 * sin(stageUv.x * 5.0 + stageUv.y * 4.0 + stageTime);
      // Crossing wave fronts travel across the pool, independent of input.
      vec2 pool = stageUv * vec2(1.22, 1.0);
      float wave = sin(length(pool - vec2(.28, .64)) * 34.0 - stageTime * 2.0);
      float crossing = sin(length(pool - vec2(.98, .22)) * 27.0 - stageTime * 2.0);
      float ripple = pow(.5 + .5 * wave, 8.0) * .18
        + pow(.5 + .5 * crossing, 8.0) * .10;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.78, .97, .98), min(.9, light * .72 + ripple));
      diffuseColor.rgb *= .80 + .24 * broad;
    `).replace("#include <normal_fragment_begin>", `
      #include <normal_fragment_begin>
      normal.x += .085 * sin(stageUv.x * 24.0 + stageTime) * cos(stageUv.y * 21.0 - stageTime);
      normal.y += .06 * cos(stageUv.y * 28.0 + stageTime);
      normal = normalize(normal);
    `);
  };
  const water = new Mesh(waterGeometry, waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.26;
  water.receiveShadow = true;
  scene.add(water);

  // Recessed light in two doorways gives the quiet architecture a sense of
  // somewhere beyond. These panes remain anchored inside the arch openings.
  const portals: Mesh<ShapeGeometry, ShaderMaterial>[] = [];
  function portal(x: number, y: number, z: number, width: number, height: number, color: string) {
    const outerRadius = width / 2;
    const inside = outerRadius - width * .215;
    const spring = height - outerRadius;
    const shape = new Shape();
    shape.moveTo(-inside, 0);
    shape.lineTo(-inside, spring);
    shape.absarc(0, spring, inside, Math.PI, 0, true);
    shape.lineTo(inside, 0);
    shape.closePath();
    const geometry = new ShapeGeometry(shape, 24);
    const material = new ShaderMaterial({
      transparent: true, depthWrite: false, side: DoubleSide,
      uniforms: { tint: { value: new Color(color) }, gateTime },
      vertexShader: `varying vec2 gateUv;
        void main() {
          gateUv = vec2(position.x / ${inside * 2} + .5, position.y / ${spring + inside});
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform vec3 tint; uniform float gateTime; varying vec2 gateUv;
        void main() {
          float edge = smoothstep(0., .17, gateUv.x) * smoothstep(0., .17, 1. - gateUv.x);
          float veil = .5 + .5 * sin(gateUv.y * 9.0 - gateTime + sin(gateUv.x * 5.0));
          float light = .22 + .2 * pow(1. - gateUv.y, 2.) + .25 * pow(veil, 3.0);
          vec3 glow = mix(tint, vec3(1.0), .35 * veil);
          gl_FragColor = vec4(glow, edge * light);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    portals.push(mesh);
  }
  portal(.8, .85, -1.5, .93, 1.72, "#ffebd2");
  portal(-1.7, .75, -1.8, .62, 1.23, "#d7c2ff");

  let disposed = false;
  let atmosphere: CanvasTexture | null = null;
  let shaderFailed = false;
  renderer.debug.onShaderError = () => { shaderFailed = true; };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    architecture.dispose();
    traveler.dispose();
    portals.forEach(({ geometry, material }) => { geometry.dispose(); material.dispose(); });
    waterGeometry.dispose();
    waterMaterial.dispose();
    floorGeometry.dispose();
    floorMaterial.dispose();
    sun.shadow.dispose();
    atmosphere?.dispose();
    scene.background = null;
    scene.clear();
    renderer.dispose();
  };

  let compileTimer: ReturnType<typeof setTimeout> | undefined;
  let onCompileContextLoss: (() => void) | undefined;
  try {
    renderer.setSize(1, 1, false);
    const interrupted = new Promise<never>((_, reject) => {
      onCompileContextLoss = () => {
        dispose();
        reject(new Error("Stage context lost during initialization"));
      };
      canvas.addEventListener("webglcontextlost", onCompileContextLoss, { once: true });
      compileTimer = setTimeout(() => {
        dispose();
        reject(new Error("Stage shader initialization timed out"));
      }, 15_000);
    });
    const prepare = async () => {
      // Paint the same sky inside WebGL: an opaque/composited canvas must not
      // hide the atmosphere when the live scene replaces the static artwork.
      const image = canvas.parentElement?.querySelector<HTMLImageElement>(".ethereal-backdrop-sky");
      if (!image) throw new Error("Stage sky image unavailable");
      await image.decode();
      if (disposed) throw new Error("Stage disposed while loading sky");
      const surface = document.createElement("canvas");
      surface.width = surface.height = 512;
      const context = surface.getContext("2d");
      if (!context) throw new Error("Stage sky drawing unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 512, 512);
      context.drawImage(image, 0, 0, 512, 512);
      atmosphere = new CanvasTexture(surface);
      atmosphere.colorSpace = SRGBColorSpace;
      scene.background = atmosphere;
      await renderer.compileAsync(scene, camera);
    };
    await Promise.race([prepare(), interrupted]);
    if (shaderFailed || disposed) throw new Error("Stage shader unavailable");
  } catch (error) {
    dispose();
    throw error;
  } finally {
    clearTimeout(compileTimer);
    if (onCompileContextLoss) canvas.removeEventListener("webglcontextlost", onCompileContextLoss);
  }

  return {
    resize(width, height, pixelRatio) {
      if (disposed) return;
      const aspect = width / height;
      const halfHeight = 3.55;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
    },
    render(timeSeconds, pointerX, pointerY) {
      if (disposed) return;
      // Integer periods meet seamlessly when the lifecycle clock wraps at 120s.
      const phase = timeSeconds * Math.PI * 2 / 8;
      waterTime.value = phase;
      gateTime.value = timeSeconds * Math.PI * 2 / 12;
      lavender.intensity = 0.65 + 0.22 * Math.sin(timeSeconds * Math.PI * 2 / 24) + pointerX * .05;
      sky.intensity = 2.1 + pointerY * .025;
      traveler.update(timeSeconds);
      renderer.render(scene, camera);
      if (shaderFailed) throw new Error("Stage shader unavailable");
    },
    dispose,
  };
}
