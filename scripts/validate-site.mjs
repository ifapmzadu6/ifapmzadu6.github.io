import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(projectRoot, "dist");
const publicPages = [
  "index.html",
  "apps/triple-take/index.html",
  "apps/triple-take/privacy.html",
  "apps/otolume/index.html",
  "apps/otolume/privacy.html",
  "apps/shortcuts-browser/index.html",
  "apps/shortcuts-browser/privacy.html",
  "apps/tax-calculator/index.html",
  "apps/tax-calculator/privacy.html",
];
const privacyPages = [
  "apps/triple-take/privacy.html",
  "apps/otolume/privacy.html",
  "apps/shortcuts-browser/privacy.html",
  "apps/tax-calculator/privacy.html",
];
const allPages = [
  ...publicPages,
  "apps/sake-rhythm/index.html",
  "apps/sake-rhythm/privacy.html",
  "404.html",
];
const footerPages = [
  ...publicPages.filter((relativePath) => relativePath !== "index.html"),
  "404.html",
];
const staticFiles = [
  "ads.txt",
  "app-ads.txt",
  "favicon.svg",
  "google72183cdf8f2714c0.html",
  "robots.txt",
  "sitemap.xml",
  "assets/images/apps/otolume.png",
  "assets/images/apps/tttt.svg",
  "assets/images/apps/shortcuts-browser.jpg",
  "assets/images/apps/tax-calculator.jpg",
  "assets/images/apps/sake-rhythm.jpg",
  "assets/images/apps/triple-take.png",
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

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const filePath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(filePath) : [filePath];
    }),
  );
  return files.flat();
}

for (const relativePath of [...allPages, ...staticFiles]) {
  assert(
    await fileExists(path.join(root, relativePath)),
    relativePath + ": missing from Astro build output",
  );
}

for (const relativePath of publicPages) {
  const html = await read(relativePath);
  assert(/<main(?:\s[^>]*)?>/.test(html), `${relativePath}: missing <main>`);
  assert(html.includes('rel="canonical"'), `${relativePath}: missing canonical URL`);
  assert(html.includes('property="og:title"'), `${relativePath}: missing Open Graph title`);
  assert(html.includes('rel="icon"'), `${relativePath}: missing favicon`);
}

for (const relativePath of allPages) {
  const html = await read(relativePath);
  assert(html.includes('<html lang="en">'), `${relativePath}: page language must be English`);
  assert(!/[ぁ-んァ-ヶ一-龯]/u.test(html), `${relativePath}: non-English Japanese text found`);
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

for (const relativePath of footerPages) {
  const html = await read(relativePath);
  const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0];
  assert(footer, `${relativePath}: missing footer`);
  assert(!footer.includes("<a"), `${relativePath}: footer contact link must be removed`);
}

for (const relativePath of privacyPages) {
  const html = await read(relativePath);
  assert(html.includes("mailto:Keisuke.Karijuku@gmail.com"), `${relativePath}: privacy contact email is missing`);
}

const home = await read("index.html");
assert(home.includes('href="/apps/triple-take/"') && home.includes("Triple Take"), "index.html: Triple Take introduction is missing");
assert(!/sake-rhythm|SakeRhythm/.test(home), "index.html: hidden SakeRhythm entry is still public");
assert(
  home.includes('href="https://tootiredtotype.com/en/"'),
  "index.html: tttt.. must link to its English landing page",
);
assert(
  home.indexOf("tttt..") < home.indexOf("OtoLume"),
  "index.html: tttt.. must be the first app",
);
assert(
  (home.match(/class="app-signal"/g) ?? []).length === 5,
  "index.html: expected five public app links",
);

const shortcutsIndex = await read("apps/shortcuts-browser/index.html");
const tripleTakeIndex = await read("apps/triple-take/index.html");
assert(tripleTakeIndex.includes("App Store release planned"), "Triple Take release status is missing");
assert(tripleTakeIndex.includes('content="index,follow"'), "Triple Take introduction must be publicly indexed");
const tripleTakePrivacy = await read("apps/triple-take/privacy.html");
assert(tripleTakePrivacy.includes("September 30, 2026"), "Triple Take policy revision date is missing");
assert(tripleTakePrivacy.includes("does not upload your photos"), "Triple Take local-processing disclosure is missing");
assert(tripleTakePrivacy.includes("remain in your photo"), "Triple Take saved-image retention is missing");
assert(!tripleTakePrivacy.includes("AdMob"), "Triple Take must not inherit another app's advertising disclosure");
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
  "https://ifapmzadu6.github.io/apps/triple-take/",
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

const generatedCssFiles = (await listFiles(root)).filter((filePath) =>
  filePath.endsWith(".css"),
);
assert(generatedCssFiles.length > 0, "Astro build: generated stylesheet is missing");
const generatedCss = (
  await Promise.all(generatedCssFiles.map((filePath) => readFile(filePath, "utf8")))
).join("\n");
assert(!/#007aff/i.test(generatedCss), "generated CSS: old low-contrast blue remains");

console.log(
  `Validated the Astro build: ${allPages.length} HTML pages, ${staticFiles.length} static files, metadata, privacy disclosures, ratings, and internal links.`,
);
