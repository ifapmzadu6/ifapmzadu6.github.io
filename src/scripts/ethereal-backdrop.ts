// Load the orthographic garden scene only for an eligible, visible hero. A static image
// remains available before setup, while paused, and when WebGL is unavailable.
import type { StageScene } from "./ethereal-stage-scene";

const FRAME_INTERVAL = 1_000 / 24;
const LIGHT_CYCLE = 120_000;
const MAX_DRAWING_PIXELS = 450_000;

function enhanceBackdrop(root: HTMLElement, canvas: HTMLCanvasElement): () => void {
  if (!("IntersectionObserver" in window) || !("ResizeObserver" in window)
    || !("AbortController" in window) || typeof matchMedia !== "function") {
    return () => {};
  }

  const events = new AbortController();
  const eventOptions = { signal: events.signal };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  let scene: StageScene | null = null;
  let initialization: Promise<void> | null = null;
  let generation = 0;
  let contextGeneration = 0;
  let frame = 0;
  let visible = false;
  let pageShown = true;
  let disposed = false;
  let failed = false;
  let contextLost = false;
  let elapsed = 0;
  let previousTime = 0;
  let lastDraw = -Infinity;
  let needsResize = true;
  let pointerX = 0;
  let pointerY = 0;

  const canRender = () => !disposed && !failed && !contextLost && visible
    && pageShown && !document.hidden && !reducedMotion.matches;

  function releaseScene(value: StageScene | null) {
    // Cleanup must not prevent the fallback or listener cleanup if the browser
    // has already invalidated the graphics context.
    try { value?.dispose(); } catch { /* The static artwork stays available. */ }
  }

  function pause() {
    generation += 1;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    lastDraw = -Infinity;
    // A non-preserved canvas can clear while paused. Do not expose a stale or
    // empty buffer; switch back only after a successful new render.
    root.dataset.state = "static";
  }

  function fail() {
    failed = true;
    pause();
    const previousScene = scene;
    scene = null;
    releaseScene(previousScene);
  }

  function schedule() {
    if (canRender() && scene && !frame) frame = requestAnimationFrame(draw);
  }

  function initialize() {
    if (!canRender() || scene || initialization) return;
    const attempt = generation;
    const attemptContext = contextGeneration;
    const isCurrent = () => generation === attempt && canRender();
    initialization = (async () => {
      let candidate: StageScene | null = null;
      try {
        // The large Three.js chunk is never fetched for an initially reduced-
        // motion or offscreen hero, and no renderer exists until this recheck.
        const { createStageScene } = await import("./ethereal-stage-scene");
        if (!isCurrent()) return;
        candidate = await createStageScene(canvas);
        if (!isCurrent()) return;
        scene = candidate;
        candidate = null;
        needsResize = true;
        previousTime = 0;
        lastDraw = -Infinity;
      } catch {
        // An unsupported renderer or setup failure is terminal for this
        // context. Observer callbacks must not create an automatic retry loop.
        if (!disposed && !contextLost && contextGeneration === attemptContext) fail();
      } finally {
        // Async compilation may complete after hiding, reduced-motion changes,
        // context loss, or DOM removal. Such a result must never be displayed.
        releaseScene(candidate);
        initialization = null;
        if (canRender()) {
          if (scene) schedule();
          else initialize();
        }
      }
    })();
  }

  function draw(now: number) {
    frame = 0;
    if (!canRender() || !scene) {
      pause();
      return;
    }
    if (previousTime) elapsed = (elapsed + Math.min(now - previousTime, 250)) % LIGHT_CYCLE;
    previousTime = now;
    if (needsResize || now - lastDraw >= FRAME_INTERVAL) {
      try {
        if (needsResize) {
          const width = Math.max(1, root.clientWidth);
          const height = Math.max(1, root.clientHeight);
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5,
            Math.sqrt(MAX_DRAWING_PIXELS / (width * height)));
          scene.resize(width, height, pixelRatio);
          needsResize = false;
        }
        scene.render(elapsed / 1_000, pointerX, pointerY);
        root.dataset.state = "running";
        lastDraw = now;
      } catch {
        fail();
        return;
      }
    }
    schedule();
  }

  function updateActivity() {
    if (!canRender()) pause();
    else if (scene) schedule();
    else initialize();
  }

  const intersection = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    updateActivity();
  });
  intersection.observe(root);

  const resize = new ResizeObserver(() => {
    needsResize = true;
    updateActivity();
  });
  resize.observe(root);

  let resolution: MediaQueryList;
  function watchResolution() {
    resolution?.removeEventListener("change", updateResolution);
    resolution = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    resolution.addEventListener("change", updateResolution);
  }
  function updateResolution() {
    watchResolution();
    needsResize = true;
    updateActivity();
  }
  watchResolution();

  document.addEventListener("visibilitychange", updateActivity, eventOptions);
  reducedMotion.addEventListener("change", () => {
    pointerX = pointerY = 0;
    updateActivity();
  }, eventOptions);
  finePointer.addEventListener("change", () => {
    pointerX = pointerY = 0;
    schedule();
  }, eventOptions);

  const pointerArea = root.parentElement;
  pointerArea?.addEventListener("pointermove", (event) => {
    if (!finePointer.matches || event.pointerType === "touch" || !canRender()) return;
    const bounds = root.getBoundingClientRect();
    pointerX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1));
    pointerY = Math.max(-1, Math.min(1, 1 - (event.clientY - bounds.top) / Math.max(1, bounds.height) * 2));
  }, { ...eventOptions, passive: true });
  pointerArea?.addEventListener("pointerleave", () => {
    pointerX = pointerY = 0;
  }, eventOptions);

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
    contextGeneration += 1;
    pause();
    const previousScene = scene;
    scene = null;
    releaseScene(previousScene);
  }, eventOptions);
  canvas.addEventListener("webglcontextrestored", () => {
    // Recreate the entire scene, including its shadow map;
    // GPU render targets cannot survive context loss.
    contextLost = false;
    failed = false;
    needsResize = true;
    updateActivity();
  }, eventOptions);
  window.addEventListener("pagehide", () => {
    pageShown = false;
    pause();
  }, eventOptions);
  window.addEventListener("pageshow", () => {
    pageShown = true;
    needsResize = true;
    updateActivity();
  }, eventOptions);

  return () => {
    if (disposed) return;
    disposed = true;
    pause();
    events.abort();
    intersection.disconnect();
    resize.disconnect();
    resolution.removeEventListener("change", updateResolution);
    const previousScene = scene;
    scene = null;
    releaseScene(previousScene);
  };
}

const backdrops = new Map<HTMLElement, () => void>();
document.querySelectorAll<HTMLElement>("[data-ethereal-backdrop]").forEach((root) => {
  const canvas = root.querySelector("canvas");
  if (canvas) backdrops.set(root, enhanceBackdrop(root, canvas));
});

// Pagehide preserves the scene for back/forward navigation. Removing a hero
// permanently releases its listeners, observers, and graphics resources.
if (backdrops.size) {
  const removals = new MutationObserver(() => {
    for (const [root, dispose] of backdrops) {
      if (!root.isConnected) {
        dispose();
        backdrops.delete(root);
      }
    }
    if (!backdrops.size) removals.disconnect();
  });
  removals.observe(document.body, { childList: true, subtree: true });
}

export {};
