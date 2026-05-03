'use strict';
const fs   = require('fs');
const path = require('path');

function buildStarICO(size) {
  const W = size, H = size;
  const s = W / 22; // scale from 22x22 SVG viewBox

  // Exact points from the Polaris SVG logo: M11 1L12.8 9.2L21 11L12.8 12.8L11 21L9.2 12.8L1 11L9.2 9.2Z
  const pts = [
    [11*s, 1*s], [12.8*s, 9.2*s], [21*s, 11*s], [12.8*s, 12.8*s],
    [11*s, 21*s], [9.2*s, 12.8*s], [1*s, 11*s], [9.2*s, 9.2*s],
  ];

  function inStar(x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }

  // BGRA pixel buffer (bottom-up for BMP)
  const pixels = Buffer.alloc(W * H * 4, 0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (inStar(x + 0.5, y + 0.5)) {
        const idx = ((H - 1 - y) * W + x) * 4;
        pixels[idx]   = 250; // B
        pixels[idx+1] = 165; // G
        pixels[idx+2] = 96;  // R  (#60a5fa)
        pixels[idx+3] = 255; // A
      }
    }
  }

  // BITMAPINFOHEADER
  const hdr = Buffer.alloc(40);
  hdr.writeUInt32LE(40, 0);
  hdr.writeInt32LE(W, 4);
  hdr.writeInt32LE(H * 2, 8); // doubled height = XOR + AND masks
  hdr.writeUInt16LE(1, 12);
  hdr.writeUInt16LE(32, 14);

  // AND mask — all zeros (alpha channel handles transparency)
  const rowBytes = Math.ceil(W / 8) * 4;
  const andMask  = Buffer.alloc(H * rowBytes, 0);

  return Buffer.concat([hdr, pixels, andMask]);
}

const sizes = [16, 32, 48, 256];
const images = sizes.map(s => buildStarICO(s));

// ICONDIR (6 bytes)
const iconDir = Buffer.alloc(6);
iconDir.writeUInt16LE(0, 0);
iconDir.writeUInt16LE(1, 2);
iconDir.writeUInt16LE(sizes.length, 4);

// ICONDIRENTRY (16 bytes each)
const headerSize = 6 + 16 * sizes.length;
let offset = headerSize;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s === 256 ? 0 : s, 0);
  e.writeUInt8(s === 256 ? 0 : s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8);

  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});

const ico = Buffer.concat([iconDir, ...entries, ...images]);
const out = path.join(__dirname, 'assets', 'icon.ico');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ico);
console.log(`Written: ${out} (${ico.length} bytes, ${sizes.length} sizes)`);
