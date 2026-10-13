// Move light through the glass while the artwork's position and silhouette stay
// fixed. Touch screens need no pointer input; hidden/reduced-motion pages stop.
const LIGHT_CYCLE = 12_000;
const FRAME_INTERVAL = 1_000 / 24;
const MAX_DRAWING_PIXELS = 700_000;

const vertexSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentSource = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform vec2 u_fit;
  uniform vec2 u_pointer;
  uniform float u_time;
  varying vec2 v_uv;

  void main() {
    vec2 uv = (v_uv - 0.5) / u_fit + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec4 color = texture2D(u_image, uv);
    float phase = u_time * 0.5235987756 + dot(u_pointer, vec2(0.35, -0.2));
    float wave = sin(uv.x * 8.0 + uv.y * 5.0 - phase);
    float crossLight = sin(uv.x * 4.0 - uv.y * 7.0 + phase);
    float light = 0.96 + 0.10 * wave;
    float highlight = 0.04 * (0.5 + 0.5 * crossLight);
    vec3 tint = mix(vec3(0.65, 0.84, 1.0), vec3(1.0, 0.72, 0.92),
      0.5 + 0.5 * sin(phase + uv.y * 3.0));
    // Both the uploaded texture and drawing buffer use premultiplied alpha.
    // Keep transparent edges transparent when compositing over the light page.
    // Sampling coordinates and alpha never animate: only reflected light does.
    gl_FragColor = vec4(min(color.rgb * light + tint * highlight * color.a,
      vec3(color.a)), color.a);
  }
`;

interface Graphics {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  texture: WebGLTexture;
  fit: WebGLUniformLocation | null;
  pointer: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
}

function createGraphics(canvas: HTMLCanvasElement, image: HTMLImageElement): Graphics | null {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const release = () => {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    gl.deleteTexture(texture);
  };
  if (!vertex || !fragment || !program || !buffer || !texture) {
    release();
    return null;
  }

  gl.shaderSource(vertex, vertexSource);
  gl.shaderSource(fragment, fragmentSource);
  gl.compileShader(vertex);
  gl.compileShader(fragment);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "a_position");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    release();
    return null;
  }

  try {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
    // Allocation failures are GL errors, not necessarily JavaScript exceptions.
    // Check once at setup; never synchronize the GPU in the animation loop.
    if (gl.getError() !== gl.NO_ERROR) {
      release();
      return null;
    }
  } catch {
    release();
    return null;
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return {
    gl, program, buffer, texture,
    fit: gl.getUniformLocation(program, "u_fit"),
    pointer: gl.getUniformLocation(program, "u_pointer"),
    time: gl.getUniformLocation(program, "u_time"),
  };
}

function enhanceBackdrop(
  root: HTMLElement,
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
): () => void {
  if (!("IntersectionObserver" in window) || !("ResizeObserver" in window)
    || !("AbortController" in window) || typeof matchMedia !== "function") {
    return () => {};
  }

  const events = new AbortController();
  const eventOptions = { signal: events.signal };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  let graphics: Graphics | null = null;
  let frame = 0;
  let visible = false;
  let pageShown = true;
  let disposed = false;
  let failed = false;
  let contextLost = false;
  let elapsed = 0;
  let previousTime = 0;
  let lastDraw = 0;
  let needsResize = true;
  let pointerX = 0;
  let pointerY = 0;

  const canRender = () => !disposed && !failed && !contextLost && visible
    && pageShown && !document.hidden && !reducedMotion.matches
    && image.complete && image.naturalWidth > 0;

  function pause() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    // A non-preserved drawing buffer may be cleared when rendering pauses.
    // Always expose the original image until a fresh frame has been drawn.
    root.dataset.state = "static";
  }

  function schedule() {
    if (canRender() && !frame) frame = requestAnimationFrame(draw);
  }

  function draw(now: number) {
    frame = 0;
    if (!canRender()) return;
    if (!graphics) {
      try {
        graphics = createGraphics(canvas, image);
      } catch {
        graphics = null;
      }
      if (!graphics) {
        failed = true;
        root.dataset.state = "static";
        return;
      }
      needsResize = true;
    }

    if (previousTime) elapsed = (elapsed + now - previousTime) % LIGHT_CYCLE;
    previousTime = now;
    if (needsResize || now - lastDraw >= FRAME_INTERVAL) {
      const { gl } = graphics;
      if (needsResize) {
        const width = Math.max(1, root.clientWidth);
        const height = Math.max(1, root.clientHeight);
        const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(MAX_DRAWING_PIXELS / (width * height)));
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        gl.viewport(0, 0, canvas.width, canvas.height);
        const imageAspect = image.naturalWidth / image.naturalHeight;
        const canvasAspect = width / height;
        gl.uniform2f(graphics.fit,
          Math.min(1, imageAspect / canvasAspect),
          Math.min(1, canvasAspect / imageAspect));
        needsResize = false;
      }
      gl.uniform2f(graphics.pointer, pointerX, pointerY);
      gl.uniform1f(graphics.time, elapsed / 1_000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      root.dataset.state = "running";
      lastDraw = now;
    }
    schedule();
  }

  function updateActivity() {
    if (!canRender()) pause();
    else schedule();
  }

  const intersection = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    updateActivity();
  });
  intersection.observe(root);

  const resize = new ResizeObserver(() => {
    needsResize = true;
    schedule();
  });
  resize.observe(root);

  let resolution: MediaQueryList;
  function watchResolution() {
    resolution?.removeEventListener("change", updateResolution);
    resolution = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
    resolution.addEventListener("change", updateResolution);
  }
  function updateResolution() {
    watchResolution();
    needsResize = true;
    schedule();
  }
  watchResolution();

  image.addEventListener("load", updateActivity, eventOptions);
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
    schedule();
  }, { ...eventOptions, passive: true });
  pointerArea?.addEventListener("pointerleave", () => {
    pointerX = pointerY = 0;
    schedule();
  }, eventOptions);

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
    graphics = null;
    pause();
  }, eventOptions);
  canvas.addEventListener("webglcontextrestored", () => {
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
    disposed = true;
    pause();
    events.abort();
    intersection.disconnect();
    resize.disconnect();
    resolution.removeEventListener("change", updateResolution);
    if (graphics) {
      const { gl, program, buffer, texture } = graphics;
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      graphics = null;
    }
    root.dataset.state = "static";
  };
}

const backdrops = new Map<HTMLElement, () => void>();
document.querySelectorAll<HTMLElement>("[data-ethereal-backdrop]").forEach((root) => {
  const image = root.querySelector("img");
  const canvas = root.querySelector("canvas");
  if (image && canvas) backdrops.set(root, enhanceBackdrop(root, image, canvas));
});

// A removed hero must release its listeners, observer callbacks and GPU objects.
// Normal navigation uses pagehide/pageshow so the back/forward cache stays usable.
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
