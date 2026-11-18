import { createOrbitScene, HOME, type Journey, type OrbitApp } from "./orbit-scene";

async function initialize(root: HTMLElement) {
  const canvas = root.querySelector("canvas");
  const context = canvas?.getContext("2d");
  if (!context) return;

  const apps: OrbitApp[] = JSON.parse(root.dataset.apps ?? "[]");
  if (!apps.length) return;

  const sign = root.querySelector<HTMLElement>(".sign")!;
  const home = root.querySelector<HTMLAnchorElement>("#home")!;
  const walk = root.querySelector<HTMLButtonElement>("#walk")!;
  const open = root.querySelector<HTMLAnchorElement>("#open")!;
  const openLabel = open.querySelector<HTMLElement>("[data-open-label]")!;
  const openArrow = open.querySelector<HTMLElement>("[aria-hidden]")!;
  const previous = root.querySelector<HTMLButtonElement>("#prev")!;
  const next = root.querySelector<HTMLButtonElement>("#next")!;
  const pager = root.querySelector<HTMLElement>(".pager")!;
  const count = root.querySelector<HTMLElement>(".count")!;
  const status = root.querySelector<HTMLElement>("#status")!;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const siteTitle = document.title;
  const scene = await createOrbitScene(context, sign, apps);

  let current = HOME;
  let frame = 0;
  let journey: Journey | null = null;
  let lastHash = location.hash;

  const route = () => location.hash === "#apps" ? 0 : apps.findIndex(app => app.slug === location.hash.slice(1));
  const wrap = (index: number) => (index + apps.length) % apps.length;

  function settle(target: number, focus?: HTMLElement) {
    cancelAnimationFrame(frame);
    frame = 0;
    journey = null;
    current = target;
    const detail = target !== HOME;
    scene.rest(target);
    root.dataset.screen = detail ? "detail" : "home";
    root.dataset.slug = detail ? apps[target].slug : "";
    sign.setAttribute("aria-hidden", String(!detail));
    walk.hidden = detail;
    open.hidden = pager.hidden = !detail;

    if (detail) {
      const app = apps[target];
      document.title = app.name + " · " + siteTitle;
      open.href = app.url;
      const external = open.origin !== location.origin;
      const label = external ? "Visit website" : "App details";
      openLabel.textContent = label;
      openArrow.textContent = external ? "↗" : "→";
      open.setAttribute("aria-label", label + " for " + app.name);
      previous.setAttribute("aria-label", "Previous app: " + apps[wrap(target - 1)].name);
      next.setAttribute("aria-label", "Next app: " + apps[wrap(target + 1)].name);
      count.textContent = (target + 1) + " / " + apps.length;
      status.textContent = "Arrived at " + app.name + ". Stop " + (target + 1) + " of " + apps.length + ".";
    } else {
      document.title = siteTitle;
      open.removeAttribute("href");
      status.textContent = "";
    }

    if (focus) (detail ? focus : walk).focus({ preventScroll: true });
  }

  function transition(to: number, direction: number, focus: HTMLElement) {
    cancelAnimationFrame(frame);
    if (reducedMotion.matches) {
      settle(to, focus);
      return;
    }
    // Browser back/forward can reverse a walk before its first or last step.
    if (!journey || (to !== journey.from && to !== journey.to)) {
      const from = journey ? (journey.progress < 0.5 ? journey.from : journey.to) : current;
      if (from === to) {
        settle(to, focus);
        return;
      }
      scene.prepareStop(to);
      journey = { from, to, direction, progress: 0, startSky: scene.getSky() };
    }

    const trip = journey;
    const startProgress = trip.progress;
    const endProgress = to === trip.to ? 1 : 0;
    const delta = endProgress - startProgress;
    const fullDuration = trip.from === HOME || trip.to === HOME ? 1350 : 2450;
    const duration = fullDuration * Math.abs(delta);
    if (duration < 16) {
      settle(to, focus);
      return;
    }

    root.dataset.screen = "walking";
    sign.setAttribute("aria-hidden", "true");
    const start = performance.now();
    function step(now: number) {
      const elapsed = Math.min(1, (now - start) / duration);
      if (elapsed === 1) {
        settle(to, focus);
        return;
      }
      trip.progress = startProgress + delta * elapsed;
      scene.walk(trip, Math.sign(delta));
      frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
  }

  function directionFor(to: number) {
    if (current === HOME) return 1;
    if (to === HOME) return -1;
    return wrap(to - current) <= wrap(current - to) ? 1 : -1;
  }

  function visit(to: number, direction: number, focus: HTMLElement = open) {
    const url = new URL(location.href);
    url.hash = to === HOME ? "" : apps[to].slug;
    if (url.hash === location.hash && !journey) return;
    history.pushState(null, "", url);
    lastHash = location.hash;
    transition(to, direction, focus);
  }

  function locationChanged() {
    if (lastHash === location.hash) return;
    lastHash = location.hash;
    if (location.hash === "#main-content") return;
    const to = route();
    transition(to, directionFor(to), to === HOME ? walk : open);
  }

  settle(route());

  home.addEventListener("click", event => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    visit(HOME, -1, walk);
  });
  walk.addEventListener("click", () => visit(0, 1));
  next.addEventListener("click", () => visit(wrap(current + 1), 1, next));
  previous.addEventListener("click", () => visit(wrap(current - 1), -1, previous));
  window.addEventListener("popstate", locationChanged);
  window.addEventListener("hashchange", locationChanged);
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches && journey) settle(route(), open);
  });

  root.dataset.ready = "";
}

function isPlainClick(event: MouseEvent) {
  return event.button === 0 && !(event.metaKey || event.ctrlKey || event.altKey || event.shiftKey);
}

const root = document.querySelector<HTMLElement>("#main-content[data-orbit]");
if (root) {
  // A failed sprite download or unsupported graphics API leaves the SSR app links usable.
  void initialize(root).catch(() => {});
}
