import { createWriteStream } from "node:fs";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { applyBrand } from "./apply-brand.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://airmix.by";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PAGES = [
  { url: `${ORIGIN}/`, sourceName: "ru.html", pageDir: ".", langHref: { ru: "./", en: "en/" } },
  { url: `${ORIGIN}/en/`, sourceName: "en.html", pageDir: "en", langHref: { ru: "../", en: "./" } },
];

function decodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function stripQuery(value) {
  return value.split("#")[0].split("?")[0];
}

function toAbsAsset(raw) {
  let value = raw.trim();
  value = value.replace(/\\+\//g, "/");
  value = stripQuery(value);
  if (!value) return null;

  if (value.startsWith("//")) value = "https:" + value;
  if (value.startsWith("/wp-content/")) value = ORIGIN + value;
  if (!/^https?:\/\/airmix\.by\/wp-content\//i.test(value)) return null;

  const url = new URL(value);
  const pathname = url.pathname;
  if (pathname.endsWith("/")) return null;
  if (!/\.[a-z0-9]{2,5}$/i.test(pathname)) return null;
  return ORIGIN + pathname;
}

function collectAssetUrls(text) {
  const found = new Set();
  const patterns = [
    /https?:\/\/airmix\.by\/wp-content\/[^"'()\s<>]+/gi,
    /https:\\\/\\\/airmix\.by\\\/wp-content\\\/[^"'()\s<>]+/gi,
    /\/wp-content\/(?:themes|uploads)\/[^"'()\s<>)]+/gi,
  ];

  for (const re of patterns) {
    const matches = text.match(re) || [];
    for (const match of matches) {
      const abs = toAbsAsset(match);
      if (abs) found.add(abs);
    }
  }
  return found;
}

function localFsPath(absUrl) {
  const url = new URL(absUrl);
  const rel = decodePath(url.pathname).replace(/^\/+/, "");
  return {
    relPosix: rel.split(path.sep).join("/"),
    absFs: path.join(ROOT, ...rel.split("/")),
  };
}

function relativeFrom(pageDir, destPosix) {
  return path.posix.relative(pageDir, destPosix).split(path.win32.sep).join("/");
}

async function fetchBuffer(url, attempt = 1) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
      return fetchBuffer(url, attempt + 1);
    }
    throw new Error(`GET ${url} -> ${res.status}`);
  }
  return res;
}

async function fileExists(dest) {
  try {
    await access(dest, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadToFile(url, dest) {
  if (await fileExists(dest)) return;
  await mkdir(path.dirname(dest), { recursive: true });
  const res = await fetchBuffer(url);
  const body = Readable.fromWeb(res.body);
  await pipeline(body, createWriteStream(dest));
}

async function mapLimit(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function toLocalPath(absOrPath, pageDir) {
  const abs = toAbsAsset(absOrPath) || toAbsAsset(ORIGIN + absOrPath);
  if (!abs) return null;
  return relativeFrom(pageDir, localFsPath(abs).relPosix);
}

function rewriteHtml(html, pageDir) {
  let out = html;

  out = out.replace(/https:\\\/\\\/airmix\.by((?:\\\/wp-content\\\/)[^"'<\s]+)/gi, (match) => {
    const local = toLocalPath(match, pageDir);
    return local || match;
  });

  out = out.replace(/https?:\/\/airmix\.by(\/wp-content\/[^"'()\s<>]+)/gi, (match) => {
    const local = toLocalPath(match, pageDir);
    return local || match;
  });

  out = out.replace(/(?<!\.)(\/wp-content\/(?:themes|uploads)\/[^"'()\s<>]+)/g, (match) => {
    const local = toLocalPath(match, pageDir);
    return local || match;
  });

  const home = pageDir === "en" ? "../" : "./";
  const en = pageDir === "en" ? "./" : "en/";
  out = out.replace(/https:\/\/airmix\.by\/en\/?/g, en);
  out = out.replace(/https:\\\/\\\/airmix\.by\\\/en\\\/?/g, en);
  out = out.replace(/https:\/\/airmix\.by\/#/g, "#");
  out = out.replace(/https:\/\/airmix\.by\/?/g, home);
  out = out.replace(/https:\\\/\\\/airmix\.by\\\/?/g, home);

  const themeUri = relativeFrom(pageDir, "wp-content/themes/agro-sasha");
  out = out.replace(
    /window\.AGRO_THEME_URI\s*=\s*["'][^"']*["']/,
    `window.AGRO_THEME_URI = ${JSON.stringify(themeUri)}`
  );
  out = out.replace(
    /window\.AGRO_AJAX_URL\s*=\s*window\.AGRO_AJAX_URL\s*\|\|\s*["'][^"']*["']/,
    `window.AGRO_AJAX_URL = window.AGRO_AJAX_URL || ${JSON.stringify(relativeFrom(pageDir, "api/contact"))}`
  );

  const plus = relativeFrom(pageDir, "wp-content/themes/agro-sasha/img/plus.svg");
  const minus = relativeFrom(pageDir, "wp-content/themes/agro-sasha/img/minus.svg");
  out = out.replace(/const PLUS = ['"][^'"]+['"]/, `const PLUS = ${JSON.stringify(plus)}`);
  out = out.replace(/const MINUS = ['"][^'"]+['"]/, `const MINUS = ${JSON.stringify(minus)}`);

  return out;
}

function rewriteCss(css) {
  return css.replace(
    /url\((['"]?)\/wp-content\/themes\/agro-sasha\/font\/([^)'"]+)\1\)/g,
    "url($1../font/$2$1)"
  );
}

async function main() {
  console.log("Downloading pages...");
  const pageHtml = [];
  const allAssets = new Set();

  for (const page of PAGES) {
    const res = await fetchBuffer(page.url);
    const html = await res.text();
    pageHtml.push({ page, html });
    for (const url of collectAssetUrls(html)) allAssets.add(url);
  }

  const cssUrl = `${ORIGIN}/wp-content/themes/agro-sasha/css/style.css`;
  allAssets.add(cssUrl);

  console.log("Downloading CSS and collecting fonts...");
  const cssRes = await fetchBuffer(cssUrl);
  let css = await cssRes.text();
  for (const url of collectAssetUrls(css)) allAssets.add(url);

  const fontUrls = [
    `${ORIGIN}/wp-content/themes/agro-sasha/font/Roboto-VariableFont_wdth,wght.ttf`,
    `${ORIGIN}/wp-content/themes/agro-sasha/font/Roboto-Italic-VariableFont_wdth,wght.ttf`,
    `${ORIGIN}/wp-content/themes/agro-sasha/font/Unbounded-VariableFont_wght.ttf`,
  ];
  for (const url of fontUrls) allAssets.add(url);

  const assets = [...allAssets];
  console.log(`Downloading ${assets.length} assets...`);
  let done = 0;
  await mapLimit(assets, 6, async (url) => {
    const { absFs } = localFsPath(url);
    await downloadToFile(url, absFs);
    done += 1;
    if (done % 10 === 0 || done === assets.length) {
      console.log(`  ${done}/${assets.length}`);
    }
  });

  css = rewriteCss(css);
  const cssPath = localFsPath(cssUrl).absFs;
  await writeFile(cssPath, css, "utf8");

  await mkdir(path.join(ROOT, "source"), { recursive: true });
  for (const { page, html } of pageHtml) {
    const rewritten = rewriteHtml(html, page.pageDir);
    await writeFile(path.join(ROOT, "source", page.sourceName), rewritten, "utf8");
    console.log(`Wrote source/${page.sourceName}`);
  }

  const brand = await applyBrand();
  const readme = await buildReadme(brand);
  await writeFile(path.join(ROOT, "README.md"), readme, "utf8");
  console.log("Done.");
}

async function buildReadme(brand) {
  const existing = await readFile(path.join(ROOT, "README.md"), "utf8").catch(() => "");
  if (existing.includes("<!-- keep-readme -->")) return existing;
  return `# ${brand.name}

Статическая копия [airmix.by](https://airmix.by) с подставляемым именем бренда.

## Имя бренда

Имя задаётся в \`brand.config.json\`:

\`\`\`json
{
  "name": "${brand.name}"
}
\`\`\`

После правки конфига:

\`\`\`bash
npm run brand
\`\`\`

Скрипт берёт оригинальные HTML из \`source/\` (там ещё AirMixBel) и подставляет текущее имя во все текстовые вхождения: AirMixBel, AirMix, airmix.by, airmix.

В рантайме то же значение доступно как \`window.BRAND.name\` (\`js/brand.js\`).

## Локальный запуск

\`\`\`bash
npm run dev
\`\`\`

Откройте http://localhost:4173

## Обновить копию с оригинального сайта

\`\`\`bash
npm run clone
\`\`\`

## Деплой

Репозиторий готов и к GitHub Pages, и к Vercel: это обычный статический сайт.

- GitHub Pages: workflow \`.github/workflows/pages.yml\`
- Vercel: импортируйте репозиторий, framework preset — Other
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
