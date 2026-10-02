import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadBrand() {
  const raw = await readFile(path.join(ROOT, "brand.config.json"), "utf8");
  return JSON.parse(raw);
}

function applyReplacements(html, brand) {
  const name = brand.name || "Climora";
  const email = brand.email || "info@climora";
  const instagram = brand.instagram || "https://www.instagram.com/airmix.by/";
  const protectedValues = [];
  const protect = (value) => {
    const token = `__BRAND_KEEP_${protectedValues.length}__`;
    protectedValues.push([token, value]);
    return token;
  };

  let out = html;
  out = out.split("https://www.instagram.com/airmix.by/").join(protect(instagram));
  out = out.split("mailto:info@airmix.by").join(protect(`mailto:${email}`));
  out = out.split("info@airmix.by").join(protect(email));

  const pairs = [
    ["AirMixBel", name],
    ["AirMix", name],
    ["AIRMIX", name.toUpperCase()],
    ["airmix.by", brand.domain || name.toLowerCase()],
    ["Airmix", name],
    ["airmix", name.toLowerCase()],
  ];
  for (const [from, to] of pairs) {
    out = out.split(from).join(to);
  }
  for (const [token, value] of protectedValues) {
    out = out.split(token).join(value);
  }
  return out;
}

function stripWpJunk(html) {
  return html
    .replace(/\s*<meta name="yandex-verification"[^>]*>/i, "")
    .replace(/\s*<meta name="generator" content="WordPress[^"]*"\s*\/?>/i, "")
    .replace(/\s*<link rel="https:\/\/api\.w\.org\/"[^>]*>/gi, "")
    .replace(/\s*<link rel="alternate" title="JSON"[^>]*>/gi, "")
    .replace(/\s*<link rel="EditURI"[^>]*>/gi, "")
    .replace(/\s*<link rel='shortlink'[^>]*>/gi, "")
    .replace(/\s*<link rel="alternate" title="oEmbed[^>]*>/gi, "")
    .replace(/\s*<script type="speculationrules">[\s\S]*?<\/script>/i, "")
    .replace(/\s*<script id="wp-emoji-settings"[\s\S]*?<\/script>/i, "")
    .replace(/\s*<script type="module">[\s\S]*?wp-emoji[\s\S]*?<\/script>/i, "");
}

function injectRuntime(html, prefix) {
  const tags = [
    `<script src="${prefix}js/brand.js"></script>`,
    `<script src="${prefix}js/local-forms.js"></script>`,
  ].join("\n");

  if (html.includes("</head>")) {
    return html.replace("</head>", `${tags}\n</head>`);
  }
  return tags + html;
}

export async function applyBrand() {
  const brand = await loadBrand();
  const pages = [
    { src: path.join(ROOT, "source", "ru.html"), dest: path.join(ROOT, "index.html"), prefix: "" },
    { src: path.join(ROOT, "source", "en.html"), dest: path.join(ROOT, "en", "index.html"), prefix: "../" },
  ];

  for (const page of pages) {
    const original = await readFile(page.src, "utf8");
    let html = stripWpJunk(original);
    html = applyReplacements(html, brand);
    html = injectRuntime(html, page.prefix);
    await mkdir(path.dirname(page.dest), { recursive: true });
    await writeFile(page.dest, html, "utf8");
  }

  const brandJs = `window.BRAND = ${JSON.stringify(brand, null, 2)};\n`;
  await mkdir(path.join(ROOT, "js"), { recursive: true });
  await writeFile(path.join(ROOT, "js", "brand.js"), brandJs, "utf8");

  return brand;
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  applyBrand()
    .then((brand) => {
      console.log(`Brand applied: ${brand.name}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
