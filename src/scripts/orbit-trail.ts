import { createOrbitScene, HOME, type Journey, type OrbitApp } from "./orbit-scene";

async function initialize(root: HTMLElement) {
  const canvas = root.querySelector("canvas");
  const context = canvas?.getContext("2d");
  const mapDialog = root.querySelector<HTMLDialogElement>("#app-map");
  if (!context || !mapDialog || typeof mapDialog.showModal !== "function") return;
  const dialog = mapDialog;

  const apps: OrbitApp[] = JSON.parse(root.dataset.apps ?? "[]");
  const stops = root.querySelector<HTMLOListElement>("#orbit-stops")!;
  const stopLinks = Array.from(stops.querySelectorAll<HTMLAnchorElement>("[data-stop]"));
  if (!apps.length || stopLinks.length !== apps.length) return;

  const sign = root.querySelector<HTMLElement>(".sign")!;
  const home = root.querySelector<HTMLAnchorElement>("#home")!;
  const map = root.querySelector<HTMLButtonElement>("#map-toggle")!;
  const close = dialog.querySelector<HTMLButtonElement>(".map-close")!;
  const walk = root.querySelector<HTMLButtonElement>("#walk")!;
  const open = root.querySelector<HTMLAnchorElement>("#open")!;
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

  const indexFor = (slug: string) => apps.findIndex(app => app.slug === slug);
  const route = () => indexFor(location.hash.slice(1));
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
      document.title = app.name + " · little orbit";
      open.href = app.url;
      open.setAttribute("aria-label", "Open " + app.name);
      previous.setAttribute("aria-label", "Previous app: " + apps[wrap(target - 1)].name);
      next.setAttribute("aria-label", "Next app: " + apps[wrap(target + 1)].name);
      count.textContent = (target + 1) + " / " + apps.length;
      status.textContent = "Arrived at " + app.name + ". Stop " + (target + 1) + " of " + apps.length + ".";
    } else {
      document.title = siteTitle;
      open.removeAttribute("href");
      status.textContent = "";
    }

    for (const link of stopLinks) {
      if (detail && link.dataset.stop === apps[target].slug) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
    // Reading the map always takes priority over an animation finishing in the background.
    if (focus && !dialog.open) (detail ? focus : walk).focus({ preventScroll: true });
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
    const fullDuration = trip.from === HOME || trip.to === HOME ? 1350 : 1900;
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

  function visit(to: number, direction = directionFor(to), focus: HTMLElement = open) {
    const url = new URL(location.href);
    url.hash = to === HOME ? "" : apps[to].slug;
    if (url.hash === location.hash && !journey) return;
    history.pushState(null, "", url);
    lastHash = location.hash;
    transition(to, direction, focus);
  }

  function showMap() {
    if (dialog.open) return;
    dialog.showModal();
    map.setAttribute("aria-expanded", "true");
    dialog.scrollTop = 0;
    close.focus({ preventScroll: true });
  }

  function locationChanged() {
    if (lastHash === location.hash) return;
    lastHash = location.hash;
    if (location.hash === "#apps") {
      showMap();
      return;
    }
    if (dialog.open) dialog.close();
    if (location.hash === "#main-content") return;
    const to = route();
    transition(to, directionFor(to), to === HOME ? walk : open);
  }

  // Promote the server-rendered app directory to a dialog after the first scene draws.
  settle(route());
  dialog.append(stops);
  map.hidden = false;
  map.setAttribute("aria-expanded", "false");
  map.addEventListener("click", showMap);
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    map.setAttribute("aria-expanded", "false");
    if (location.hash === "#apps") {
      const url = new URL(location.href);
      url.hash = current === HOME ? "" : apps[current].slug;
      history.replaceState(null, "", url);
      lastHash = location.hash;
    }
  });
  for (const link of stopLinks) {
    link.addEventListener("click", event => {
      if (!isPlainClick(event)) return;
      const stop = indexFor(link.dataset.stop ?? "");
      if (stop === HOME) return;
      event.preventDefault();
      dialog.close();
      visit(stop);
    });
  }

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
  if (location.hash === "#apps") showMap();
}

function isPlainClick(event: MouseEvent) {
  return event.button === 0 && !(event.metaKey || event.ctrlKey || event.altKey || event.shiftKey);
}

const root = document.querySelector<HTMLElement>("#main-content[data-orbit]");
if (root) {
  // A failed sprite download or unsupported graphics API leaves the SSR app links usable.
  void initialize(root).catch(() => {});
}
