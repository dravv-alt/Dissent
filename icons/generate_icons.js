// Dissent Icon Generator — Neon Yellow Edition
// Generates PNG icons matching the #E1FF00 neon UI aesthetic.
// No dependencies — uses raw PNG encoding.
// Run: node generate_icons.js

const fs   = require("fs");
const path = require("path");
const zlib = require("zlib");

// ── PNG encoding helpers ─────────────────────────────────────
function createPNG(size, drawFn) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  drawFn(pixels, size);

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = zlib.deflateSync(raw);
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;

  return Buffer.concat([
    sig,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeChunk(type, data) {
  const len  = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeB, data]);
  const crc  = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeB, data, crc]);
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── Drawing helpers ──────────────────────────────────────────
function setPixel(pixels, size, x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  const sa = a / 255, da = pixels[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa > 0) {
    pixels[i]     = Math.round((r * sa + pixels[i]     * da * (1 - sa)) / oa);
    pixels[i + 1] = Math.round((g * sa + pixels[i + 1] * da * (1 - sa)) / oa);
    pixels[i + 2] = Math.round((b * sa + pixels[i + 2] * da * (1 - sa)) / oa);
    pixels[i + 3] = Math.round(oa * 255);
  }
}

function fillRect(px, sz, x, y, w, h, r, g, b, a = 255) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPixel(px, sz, x + dx, y + dy, r, g, b, a);
}

function fillCircle(px, sz, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      if (dx * dx + dy * dy <= r2)
        setPixel(px, sz, cx + dx, cy + dy, r, g, b, a);
}

function drawLine(px, sz, x1, y1, x2, y2, thick, r, g, b, a = 255) {
  const dist  = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.ceil(dist * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(px, sz, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thick / 2, r, g, b, a);
  }
}

function strokeEllipse(px, sz, cx, cy, rx, ry, thick, r, g, b, a = 255) {
  for (let deg = 0; deg < 360; deg += 0.4) {
    const rad = (deg * Math.PI) / 180;
    fillCircle(px, sz, cx + Math.cos(rad) * rx, cy + Math.sin(rad) * ry, thick / 2, r, g, b, a);
  }
}

// ── Palette ──────────────────────────────────────────────────
// Background: #000000  →  0, 0, 0
// Neon yellow: #E1FF00 → 225, 255, 0
// Dark accent: #111111 →  17, 17, 17
const BG   = [0,   0,   0  ];
const NEON = [225, 255, 0  ];
const DRK  = [17,  17,  17 ];

// ── Icon design ───────────────────────────────────────────────
// Black square background
// Neon yellow filled square (inset border frame)
// Black eye shape centered (ellipse + iris + pupil)
// Two neon underlines (evidence lines)
function drawIcon(pixels, size) {
  const s = size / 128;

  // Full black background
  fillRect(pixels, size, 0, 0, size, size, ...BG);

  // Neon yellow inset frame (2px border)
  const m  = Math.round(6 * s);
  const bw = Math.max(1, Math.round(3 * s));
  const iw = size - m * 2;

  // Yellow border strokes
  fillRect(pixels, size, m,         m,         iw, bw, ...NEON); // top
  fillRect(pixels, size, m,         m+iw-bw,   iw, bw, ...NEON); // bottom
  fillRect(pixels, size, m,         m,         bw, iw, ...NEON); // left
  fillRect(pixels, size, m+iw-bw,   m,         bw, iw, ...NEON); // right

  // Eye — neon yellow ellipse outline
  const cx   = size / 2;
  const cy   = size * 0.44;
  const erx  = Math.round(28 * s);
  const ery  = Math.round(16 * s);
  const etk  = Math.max(2, Math.round(4.5 * s));
  strokeEllipse(pixels, size, cx, cy, erx, ery, etk, ...NEON);

  // Iris — neon yellow filled circle
  fillCircle(pixels, size, cx, cy, Math.round(9 * s), ...NEON);

  // Pupil — black (creates the eye effect)
  fillCircle(pixels, size, cx, cy, Math.round(4 * s), ...BG);

  // Evidence lines — two neon underlines below the eye
  const lw1 = Math.max(1, Math.round(3.5 * s));
  const lw2 = Math.max(1, Math.round(1.5 * s));
  const ly1 = Math.round(82 * s);
  const ly2 = Math.round(91 * s);
  const lx1 = Math.round(28 * s);
  const lx2 = Math.round(100 * s);
  const lx3 = Math.round(44 * s); // shorter second line

  drawLine(pixels, size, lx1, ly1, lx2, ly1, lw1, ...NEON);
  drawLine(pixels, size, lx1, ly2, lx3, ly2, lw2, ...NEON, 180); // dim dashed-look
}

// ── Generate all sizes ───────────────────────────────────────
const outDir = path.join(__dirname);
[16, 48, 128].forEach((size) => {
  const png     = createPNG(size, drawIcon);
  const outPath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✓ ${outPath}  (${png.length} bytes)`);
});

console.log("\nDone — neon yellow icons generated.");
