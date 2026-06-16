// 依赖零外部库地生成一张 1024x1024 的源图标 PNG（src-tauri/app-icon.png）。
// CI 随后用 `tauri icon` 据此产出完整图标集。避免把二进制图标入库。

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import zlib from "node:zlib";

const W = 1024;
const H = 1024;
const OUT = "src-tauri/app-icon.png";

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// 原始 RGBA + 每行一字节 filter(0)。蓝紫对角渐变 + 中心圆点，做个干净的占位图标。
const raw = Buffer.alloc(H * (1 + W * 4));
const cx = W / 2;
const cy = H / 2;
const r = W * 0.28;
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 4);
  raw[rowStart] = 0;
  for (let x = 0; x < W; x++) {
    const i = rowStart + 1 + x * 4;
    const t = (x + y) / (W + H);
    let R = Math.round(34 + 40 * t);
    let G = Math.round(40 + 70 * t);
    let B = Math.round(150 + 90 * t);
    const d = Math.hypot(x - cx, y - cy);
    if (d < r) {
      // 中心圆点提亮，像一个“启动”按钮。
      R = 240;
      G = 244;
      B = 255;
    }
    raw[i] = R;
    raw[i + 1] = G;
    raw[i + 2] = B;
    raw[i + 3] = 255;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${png.length} bytes)`);
