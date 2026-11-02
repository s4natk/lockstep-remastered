// Renders the Lockstep mark into the favicon, Apple touch icon, and manifest icons.
// Run with `pnpm --filter @lockstep/web icons` after changing src/components/brand/mark.ts.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

import { MARK_BOUNDS, MARK_PATHS, MARK_PIECES, pieceOutline } from "../src/components/brand/mark.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TILE = "#0D1014";
const DARK = { base: "#E8EAED", lock: "#4CBDB2" };
const LIGHT = { base: "#161A20", lock: "#0E7C72" };

function hex(color) {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function roundedRect(x, y, size, radius, segments = 16) {
  const points = [];
  const arcs = [
    [x + size - radius, y + radius, -Math.PI / 2],
    [x + size - radius, y + size - radius, 0],
    [x + radius, y + size - radius, Math.PI / 2],
    [x + radius, y + radius, Math.PI],
  ];
  for (const [cx, cy, from] of arcs) {
    for (let step = 0; step <= segments; step += 1) {
      const angle = from + (Math.PI / 2) * (step / segments);
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
  }
  return points;
}

function markPolygons(size, span) {
  const scale = span / (MARK_BOUNDS.max - MARK_BOUNDS.min);
  const offset = (size - span) / 2;
  const place = ([x, y]) => [(x - MARK_BOUNDS.min) * scale + offset, (y - MARK_BOUNDS.min) * scale + offset];
  return Object.fromEntries(MARK_PIECES.map((piece) => [piece.id, pieceOutline(piece, 24).map(place)]));
}

function coverage(size, polygon, samples = 16) {
  const cover = new Float32Array(size * size);
  const edges = polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]]);
  for (let row = 0; row < size; row += 1) {
    for (let sub = 0; sub < samples; sub += 1) {
      const y = row + (sub + 0.5) / samples;
      const crossings = [];
      for (const [[x0, y0], [x1, y1]] of edges) {
        if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) {
          crossings.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let index = 0; index + 1 < crossings.length; index += 2) {
        const from = Math.max(0, crossings[index]);
        const to = Math.min(size, crossings[index + 1]);
        for (let column = Math.floor(from); column < Math.ceil(to); column += 1) {
          const overlap = Math.min(to, column + 1) - Math.max(from, column);
          if (overlap > 0) {
            cover[row * size + column] += overlap / samples;
          }
        }
      }
    }
  }
  return cover;
}

function render(size, layers) {
  const premultiplied = new Float32Array(size * size * 4);
  for (const { polygon, color } of layers) {
    const [r, g, b] = hex(color);
    const cover = coverage(size, polygon);
    for (let pixel = 0; pixel < size * size; pixel += 1) {
      const alpha = Math.min(1, cover[pixel]);
      if (alpha === 0) {
        continue;
      }
      const at = pixel * 4;
      premultiplied[at] = r * alpha + premultiplied[at] * (1 - alpha);
      premultiplied[at + 1] = g * alpha + premultiplied[at + 1] * (1 - alpha);
      premultiplied[at + 2] = b * alpha + premultiplied[at + 2] * (1 - alpha);
      premultiplied[at + 3] = alpha + premultiplied[at + 3] * (1 - alpha);
    }
  }
  const rgba = new Uint8Array(size * size * 4);
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    const at = pixel * 4;
    const alpha = premultiplied[at + 3];
    if (alpha > 0) {
      rgba[at] = Math.round(premultiplied[at] / alpha);
      rgba[at + 1] = Math.round(premultiplied[at + 1] / alpha);
      rgba[at + 2] = Math.round(premultiplied[at + 2] / alpha);
      rgba[at + 3] = Math.round(alpha * 255);
    }
  }
  return rgba;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let row = 0; row < size; row += 1) {
    raw[row * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, row * size * 4, size * 4).copy(raw, row * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size >= 256 ? 0 : size;
    header[entry + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

function tileIcon(size, { rounded, markShare }) {
  const radius = rounded ? size * 0.22 : 0;
  const pieces = markPolygons(size, size * markShare);
  return encodePng(
    size,
    render(size, [
      { polygon: roundedRect(0, 0, size, Math.max(radius, 0.0001)), color: TILE },
      { polygon: pieces.base, color: DARK.base },
      { polygon: pieces.lock, color: DARK.lock },
    ]),
  );
}

function write(relative, contents) {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
  console.log(`wrote ${relative}`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_BOUNDS.min} ${MARK_BOUNDS.min} ${
  MARK_BOUNDS.max - MARK_BOUNDS.min
} ${MARK_BOUNDS.max - MARK_BOUNDS.min}">
  <style>
    .base { fill: ${LIGHT.base}; }
    .lock { fill: ${LIGHT.lock}; }
    @media (prefers-color-scheme: dark) {
      .base { fill: ${DARK.base}; }
      .lock { fill: ${DARK.lock}; }
    }
  </style>
  <path class="base" d="${MARK_PATHS.base}"/>
  <path class="lock" d="${MARK_PATHS.lock}"/>
</svg>
`;

write("src/app/icon.svg", svg);
write(
  "src/app/favicon.ico",
  encodeIco([16, 32, 48].map((size) => ({ size, png: tileIcon(size, { rounded: true, markShare: 0.7 }) }))),
);
write("src/app/apple-icon.png", tileIcon(180, { rounded: false, markShare: 0.6 }));
write("public/icons/icon-192.png", tileIcon(192, { rounded: true, markShare: 0.64 }));
write("public/icons/icon-512.png", tileIcon(512, { rounded: true, markShare: 0.64 }));
write("public/icons/icon-maskable-512.png", tileIcon(512, { rounded: false, markShare: 0.5 }));
