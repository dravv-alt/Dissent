// Generates minimal valid PNG icon files from scratch.
// No dependencies required — uses raw PNG encoding.
// Run: node generate_icons.js

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function createPNG(size, drawFn) {
  // Create RGBA pixel buffer
  const pixels = Buffer.alloc(size * size * 4, 0);
  drawFn(pixels, size);

  // Build raw scanlines (filter byte 0 = None for each row)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: None
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = zlib.deflateSync(raw);

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const chunks = [
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ];

  return Buffer.concat([sig, ...chunks]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeB, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeB, data, crc]);
}

// CRC-32 (PNG spec)
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

// ── Drawing helpers ──
function setPixel(pixels, size, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  x = Math.floor(x);
  y = Math.floor(y);
  const idx = (y * size + x) * 4;
  // Alpha blend
  const srcA = a / 255;
  const dstA = pixels[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA > 0) {
    pixels[idx]     = Math.round((r * srcA + pixels[idx]     * dstA * (1 - srcA)) / outA);
    pixels[idx + 1] = Math.round((g * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA);
    pixels[idx + 2] = Math.round((b * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA);
    pixels[idx + 3] = Math.round(outA * 255);
  }
}

function fillRect(pixels, size, x, y, w, h, r, g, b, a = 255) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPixel(pixels, size, x + dx, y + dy, r, g, b, a);
}

function fillCircle(pixels, size, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      if (dx * dx + dy * dy <= r2)
        setPixel(pixels, size, Math.round(cx + dx), Math.round(cy + dy), r, g, b, a);
}

function strokeCircle(pixels, size, cx, cy, radius, thickness, r, g, b, a = 255) {
  const outer = radius + thickness / 2;
  const inner = radius - thickness / 2;
  for (let dy = -outer; dy <= outer; dy++) {
    for (let dx = -outer; dx <= outer; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= outer && dist >= inner) {
        setPixel(pixels, size, Math.round(cx + dx), Math.round(cy + dy), r, g, b, a);
      }
    }
  }
}

function strokeEllipse(pixels, size, cx, cy, rx, ry, thickness, r, g, b, a = 255) {
  for (let angle = 0; angle < 360; angle += 0.3) {
    const rad = (angle * Math.PI) / 180;
    const x = cx + Math.cos(rad) * rx;
    const y = cy + Math.sin(rad) * ry;
    fillCircle(pixels, size, x, y, thickness / 2, r, g, b, a);
  }
}

function drawLine(pixels, size, x1, y1, x2, y2, thickness, r, g, b, a = 255) {
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.ceil(dist * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    fillCircle(pixels, size, x, y, thickness / 2, r, g, b, a);
  }
}

// ── Main icon drawing function (scales to any size) ──
function drawIcon(pixels, size) {
  const s = size / 128; // scale factor

  // Background
  fillRect(pixels, size, 0, 0, size, size, 8, 8, 8, 255);

  // Inner rect with red border
  const m = Math.round(8 * s);
  const iw = size - m * 2;
  fillRect(pixels, size, m, m, iw, iw, 15, 15, 15, 255);

  // Red border (top, bottom, left, right)
  const bw = Math.max(1, Math.round(2 * s));
  fillRect(pixels, size, m, m, iw, bw, 255, 51, 51); // top
  fillRect(pixels, size, m, m + iw - bw, iw, bw, 255, 51, 51); // bottom
  fillRect(pixels, size, m, m, bw, iw, 255, 51, 51); // left
  fillRect(pixels, size, m + iw - bw, m, bw, iw, 255, 51, 51); // right

  // Eye — ellipse outline
  const cx = size / 2;
  const cy = size * 0.45;
  const erx = 32 * s;
  const ery = 20 * s;
  const ethick = Math.max(2, 5 * s);
  strokeEllipse(pixels, size, cx, cy, erx, ery, ethick, 255, 51, 51);

  // Eye — iris (filled circle)
  fillCircle(pixels, size, cx, cy, Math.round(10 * s), 255, 51, 51);

  // Eye — pupil
  fillCircle(pixels, size, cx, cy, Math.round(5 * s), 8, 8, 8);

  // Slash lines
  const lw = Math.max(1, 4 * s);
  drawLine(pixels, size, 36 * s, 86 * s, 92 * s, 100 * s, lw, 255, 51, 51);
  drawLine(pixels, size, 36 * s, 92 * s, 92 * s, 106 * s, Math.max(1, 2 * s), 255, 51, 51, 100);
}

// ── Generate all sizes ──
const outDir = path.join(__dirname);
[16, 48, 128].forEach((size) => {
  const png = createPNG(size, drawIcon);
  const outPath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✓ Generated ${outPath} (${png.length} bytes)`);
});

console.log("\nDone! All icons generated.");
