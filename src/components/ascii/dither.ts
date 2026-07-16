import * as THREE from "three";

/**
 * Threshold maps + CPU error diffusion.
 *
 * Ordered dithering runs on the GPU against these Bayer textures, tiled 1:1
 * with (scaled) pixels. Floyd–Steinberg can't run in a fragment shader (it's
 * sequential), so it runs here on the CPU with serpentine scanning and gets
 * uploaded as a texture — cheap enough to do per-frame for video.
 */

const BAYER2 = [0, 2, 3, 1];

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
];

function bayerTexture(matrix: number[], size: number): THREE.DataTexture {
  const n = size * size;
  const data = new Uint8Array(matrix.map((v) => ((v + 0.5) / n) * 255));
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function makeBayerTextures(): Record<"bayer2" | "bayer4" | "bayer8", { texture: THREE.DataTexture; size: number }> {
  return {
    bayer2: { texture: bayerTexture(BAYER2, 2), size: 2 },
    bayer4: { texture: bayerTexture(BAYER4, 4), size: 4 },
    bayer8: { texture: bayerTexture(BAYER8, 8), size: 8 },
  };
}

export interface ToneOptions {
  exposure: number;
  gamma: number;
  invert: boolean;
  color: boolean;
}

const srgbToLinear = (v: number) => Math.pow(v / 255, 2.2);

function tone(linear: number, opts: ToneOptions): number {
  let v = Math.pow(Math.min(linear * opts.exposure, 1), opts.gamma);
  if (opts.invert) v = 1 - v;
  return v;
}

/**
 * Floyd–Steinberg error diffusion in linear light, serpentine scan.
 * Writes RGBA bytes bottom-up so the GL texture (uv origin bottom-left)
 * displays upright. Reuses `out` when the size matches.
 */
export function floydSteinberg(
  source: CanvasImageSource,
  cols: number,
  rows: number,
  opts: ToneOptions,
  scratch: { canvas: HTMLCanvasElement | null },
  out?: Uint8Array,
): Uint8Array {
  if (!scratch.canvas) scratch.canvas = document.createElement("canvas");
  const canvas = scratch.canvas;
  if (canvas.width !== cols || canvas.height !== rows) {
    canvas.width = cols;
    canvas.height = rows;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, cols, rows);
  const { data } = ctx.getImageData(0, 0, cols, rows);

  const channels = opts.color ? 3 : 1;
  const n = cols * rows;
  const buf = new Float32Array(n * channels);
  for (let i = 0; i < n; i++) {
    if (opts.color) {
      buf[i * 3] = tone(srgbToLinear(data[i * 4]), opts);
      buf[i * 3 + 1] = tone(srgbToLinear(data[i * 4 + 1]), opts);
      buf[i * 3 + 2] = tone(srgbToLinear(data[i * 4 + 2]), opts);
    } else {
      const luma =
        0.2126 * srgbToLinear(data[i * 4]) +
        0.7152 * srgbToLinear(data[i * 4 + 1]) +
        0.0722 * srgbToLinear(data[i * 4 + 2]);
      buf[i] = tone(luma, opts);
    }
  }

  // Serpentine error diffusion: 7/16 →, 3/16 ↙, 5/16 ↓, 1/16 ↘
  for (let c = 0; c < channels; c++) {
    for (let y = 0; y < rows; y++) {
      const ltr = y % 2 === 0;
      for (let i = 0; i < cols; i++) {
        const x = ltr ? i : cols - 1 - i;
        const idx = (y * cols + x) * channels + c;
        const old = buf[idx];
        const next = old > 0.5 ? 1 : 0;
        buf[idx] = next;
        const err = old - next;
        const dir = ltr ? 1 : -1;

        const xf = x + dir;
        const xb = x - dir;
        if (xf >= 0 && xf < cols) {
          buf[(y * cols + xf) * channels + c] += (err * 7) / 16;
        }
        if (y + 1 < rows) {
          if (xb >= 0 && xb < cols) {
            buf[((y + 1) * cols + xb) * channels + c] += (err * 3) / 16;
          }
          buf[((y + 1) * cols + x) * channels + c] += (err * 5) / 16;
          if (xf >= 0 && xf < cols) {
            buf[((y + 1) * cols + xf) * channels + c] += (err * 1) / 16;
          }
        }
      }
    }
  }

  const result =
    out && out.length === n * 4 ? out : new Uint8Array(n * 4);
  for (let y = 0; y < rows; y++) {
    const srcRow = y;
    const dstRow = rows - 1 - y; // flip for GL
    for (let x = 0; x < cols; x++) {
      const s = (srcRow * cols + x) * channels;
      const d = (dstRow * cols + x) * 4;
      if (opts.color) {
        result[d] = buf[s] * 255;
        result[d + 1] = buf[s + 1] * 255;
        result[d + 2] = buf[s + 2] * 255;
      } else {
        const v = buf[s] * 255;
        result[d] = v;
        result[d + 1] = v;
        result[d + 2] = v;
      }
      result[d + 3] = 255;
    }
  }
  return result;
}
