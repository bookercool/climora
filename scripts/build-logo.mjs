import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import opentype from "opentype.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_MARK = path.join(ROOT, "wp-content/uploads/2026/02");
const OUT_WORD = path.join(ROOT, "wp-content/uploads/2026/04");
const ASSETS = path.join(ROOT, "assets/logo");

const GREEN = "#3D5B00";
const LIME = "#ABD468";
const DARK = "#1A1C15";
const CREAM = "#F9FAEE";
const WHITE = "#FFFFFF";

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function cPath(cx, cy, rOut, rIn, gapDeg) {
  const a0 = gapDeg / 2;
  const a1 = 360 - gapDeg / 2;
  const o0 = polar(cx, cy, rOut, a0);
  const o1 = polar(cx, cy, rOut, a1);
  const i0 = polar(cx, cy, rIn, a0);
  const i1 = polar(cx, cy, rIn, a1);
  return [
    `M ${o0.x.toFixed(2)} ${o0.y.toFixed(2)}`,
    `A ${rOut} ${rOut} 0 1 1 ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${rIn} ${rIn} 0 1 0 ${i0.x.toFixed(2)} ${i0.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function diamondPath(cx, cy, size) {
  const h = size / 2;
  return [
    `M ${cx} ${cy - h}`,
    `L ${cx + h} ${cy}`,
    `L ${cx} ${cy + h}`,
    `L ${cx - h} ${cy}`,
    "Z",
  ].join(" ");
}

function markShapes(cx, cy, scale, { c, diamond }) {
  const rOut = 210 * scale;
  const rIn = 118 * scale;
  const gap = 86;
  const thickness = rOut - rIn;
  const midR = (rOut + rIn) / 2;
  const a0 = gap / 2;
  const a1 = 360 - gap / 2;
  const cap0 = polar(cx, cy, midR, a0);
  const cap1 = polar(cx, cy, midR, a1);
  const capR = thickness / 2;
  return `
    <path d="${cPath(cx, cy, rOut, rIn, gap)}" fill="${c}"/>
    <circle cx="${cap0.x.toFixed(2)}" cy="${cap0.y.toFixed(2)}" r="${capR.toFixed(2)}" fill="${c}"/>
    <circle cx="${cap1.x.toFixed(2)}" cy="${cap1.y.toFixed(2)}" r="${capR.toFixed(2)}" fill="${c}"/>
    <path d="${diamondPath(cx - 8 * scale, cy, 92 * scale)}" fill="${diamond}"/>
  `;
}

function colorMarkSvg(size = 512) {
  const pad = 36;
  const cx = size / 2;
  const cy = size / 2;
  const scale = (size - pad * 2) / 512;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="${DARK}"/>
  ${markShapes(cx, cy, scale, { c: LIME, diamond: CREAM })}
</svg>`;
}

function whiteMarkSvg(size = 512) {
  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 512;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${markShapes(cx, cy, scale, { c: WHITE, diamond: WHITE })}
</svg>`;
}

function loadFont() {
  const buf = fs.readFileSync(
    path.join(ROOT, "wp-content/themes/agro-sasha/font/Unbounded-VariableFont_wght.ttf")
  );
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

function textPath(font, text, x, y, size, fill) {
  const p = font.getPath(text, x, y, size);
  return `<path d="${p.toPathData(2)}" fill="${fill}"/>`;
}

function wordmarkSvg(font) {
  const markSize = 300;
  const pad = 24;
  const markX = pad;
  const textX = markX + markSize + 40;
  const titleSize = 118;
  const title = "CLIMORA";
  const titleBox = font.getPath(title, 0, 0, titleSize).getBoundingBox();
  const titleW = titleBox.x2 - titleBox.x1;
  const titleH = titleBox.y2 - titleBox.y1;
  const tag = "Thermal Protection System";
  const tagSize = 36;
  const tagBox = font.getPath(tag, 0, 0, tagSize).getBoundingBox();
  const tagW = tagBox.x2 - tagBox.x1;
  const tagH = tagBox.y2 - tagBox.y1;
  const gap = 16;
  const blockH = titleH + gap + tagH;
  const H = Math.max(markSize, blockH) + pad * 2;
  const W = Math.ceil(textX + Math.max(titleW, tagW) + pad);
  const markY = (H - markSize) / 2;
  const blockTop = (H - blockH) / 2;
  const titleY = blockTop - titleBox.y1;
  const tagY = blockTop + titleH + gap - tagBox.y1;
  const titleX = textX - titleBox.x1;
  const tagX = textX - tagBox.x1;

  const markScale = markSize / 512;
  const markCx = markX + markSize / 2;
  const markCy = markY + markSize / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${markShapes(markCx, markCy, markScale, { c: WHITE, diamond: WHITE })}
  ${textPath(font, title, titleX, titleY, titleSize, WHITE)}
  ${textPath(font, tag, tagX, tagY, tagSize, WHITE)}
</svg>`;
}

async function raster(svg, dest, { width, height, format }) {
  const img = sharp(Buffer.from(svg)).resize(width, height, {
    fit: "fill",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (format === "webp") {
    await img.webp({ quality: 92, alphaQuality: 100 }).toFile(dest);
  } else {
    await img.png().toFile(dest);
  }
}

async function main() {
  fs.mkdirSync(ASSETS, { recursive: true });
  fs.mkdirSync(OUT_MARK, { recursive: true });
  fs.mkdirSync(OUT_WORD, { recursive: true });

  const font = loadFont();
  const colorSvg = colorMarkSvg(512);
  const whiteIconSvg = whiteMarkSvg(512);
  const wordSvg = wordmarkSvg(font);

  fs.writeFileSync(path.join(ASSETS, "climora-mark-color.svg"), colorSvg);
  fs.writeFileSync(path.join(ASSETS, "climora-mark-white.svg"), whiteIconSvg);
  fs.writeFileSync(path.join(ASSETS, "climora-wordmark-white.svg"), wordSvg);

  await raster(colorSvg, path.join(OUT_MARK, "cropped-color_05.png.webp"), {
    width: 512,
    height: 512,
    format: "webp",
  });
  const favicons = [
    ["cropped-color_05-32x32.png", 32],
    ["cropped-color_05-180x180.png", 180],
    ["cropped-color_05-192x192.png", 192],
    ["cropped-color_05-270x270.png", 270],
  ];
  for (const [name, size] of favicons) {
    await raster(colorSvg, path.join(OUT_MARK, name), {
      width: size,
      height: size,
      format: "png",
    });
  }
  const wordMeta = wordSvg.match(/width="(\d+)" height="(\d+)"/);
  await raster(wordSvg, path.join(OUT_WORD, "white_02.png.webp"), {
    width: Number(wordMeta[1]),
    height: Number(wordMeta[2]),
    format: "webp",
  });

  await raster(colorSvg, path.join(ASSETS, "preview-header.png"), {
    width: 512,
    height: 512,
    format: "png",
  });
  await raster(wordSvg, path.join(ASSETS, "preview-footer.png"), {
    width: Number(wordMeta[1]),
    height: Number(wordMeta[2]),
    format: "png",
  });

  console.log("Climora logos written.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
