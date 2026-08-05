import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicPages = [
  "index.html",
  "apps/otolume/index.html",
  "apps/otolume/privacy.html",
  "apps/shortcuts-browser/index.html",
  "apps/shortcuts-browser/privacy.html",
  "apps/tax-calculator/index.html",
  "apps/tax-calculator/privacy.html",
];
const allPages = [
  ...publicPages,
  "apps/sake-rhythm/index.html",
  "apps/sake-rhythm/privacy.html",
  "404.html",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

for (const relativePath of publicPages) {
  const html = await read(relativePath);
  assert(html.includes("<main>"), `${relativePath}: missing <main>`);
  assert(html.includes("<footer"), `${relativePath}: missing footer`);
  assert(html.includes('rel="canonical"'), `${relativePath}: missing canonical URL`);
  assert(html.includes('property="og:title"'), `${relativePath}: missing Open Graph title`);
  assert(html.includes('rel="icon"'), `${relativePath}: missing favicon`);
  assert(html.includes("mailto:Keisuke.Karijuku@gmail.com"), `${relativePath}: missing contact email`);
}

for (const relativePath of allPages) {
  const html = await read(relativePath);
  assert(!html.includes('href="#"'), `${relativePath}: placeholder href found`);

  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|tel:|#)/.test(href)) continue;

    const cleanHref = href.split(/[?#]/, 1)[0];
    let target = cleanHref.startsWith("/")
      ? path.join(root, cleanHref.slice(1))
      : path.resolve(path.dirname(path.join(root, relativePath)), cleanHref);
    if (cleanHref.endsWith("/")) target = path.join(target, "index.html");

    assert(await fileExists(target), `${relativePath}: broken internal link ${href}`);
  }
}

const home = await read("index.html");
assert(!/sake-rhythm|SakeRhythm|サケリズム/.test(home), "index.html: hidden SakeRhythm entry is still public");
for (const tag of home.match(/<img\b[^>]*class="app-icon-small"[^>]*>/g) ?? []) {
  assert(tag.includes('alt=""'), "index.html: app card icons must have empty alt text beside visible app names");
}
for (const tag of home.match(/<span\b[^>]*class="app-card-arrow"[^>]*>/g) ?? []) {
  assert(tag.includes('aria-hidden="true"'), "index.html: card arrows must be hidden from assistive technology");
}

const shortcutsIndex = await read("apps/shortcuts-browser/index.html");
const shortcutsPrivacy = await read("apps/shortcuts-browser/privacy.html");
assert(shortcutsIndex.includes("16+") && shortcutsPrivacy.includes("16+"), "Shortcuts Browser age rating is inconsistent");
assert(shortcutsPrivacy.includes("Google Mobile Ads (AdMob)"), "Shortcuts Browser advertising disclosure is missing");

const taxIndex = await read("apps/tax-calculator/index.html");
const taxPrivacy = await read("apps/tax-calculator/privacy.html");
for (const rating of ["18+", "3+"]) {
  assert(taxIndex.includes(rating) && taxPrivacy.includes(rating), `Tax Calculator age rating ${rating} is inconsistent`);
}
assert(taxIndex.includes("contains advertising"), "Tax Calculator advertising label is missing");
assert(taxPrivacy.includes("The app uses Google Mobile Ads (AdMob)"), "Tax Calculator AdMob disclosure must be definitive");

const sitemap = await read("sitemap.xml");
assert(!sitemap.includes("sake-rhythm"), "sitemap.xml: hidden SakeRhythm page is still listed");
for (const url of [
  "https://ifapmzadu6.github.io/",
  "https://ifapmzadu6.github.io/apps/otolume/",
  "https://ifapmzadu6.github.io/apps/shortcuts-browser/",
  "https://ifapmzadu6.github.io/apps/tax-calculator/",
]) {
  assert(sitemap.includes(`<loc>${url}</loc>`), `sitemap.xml: missing ${url}`);
}

const robots = await read("robots.txt");
assert(!robots.includes("Disallow: /apps/sake-rhythm/"), "robots.txt: noindex pages must remain crawlable so crawlers can read the directive");
assert(robots.includes("Sitemap: https://ifapmzadu6.github.io/sitemap.xml"), "robots.txt: sitemap declaration is missing");

for (const relativePath of ["apps/sake-rhythm/index.html", "apps/sake-rhythm/privacy.html"]) {
  const html = await read(relativePath);
  assert(html.includes('content="noindex,nofollow,noarchive"'), `${relativePath}: hidden page must be noindex`);
}

const css = await read("assets/css/app.css");
assert(!/#007aff/i.test(css), "app.css: old low-contrast blue remains");

console.log(`Validated ${allPages.length} HTML pages, public metadata, privacy disclosures, ratings, and internal links.`);
