import * as THREE from "three";

/**
 * Glyph atlases in the Acerola style: crisp 1-bit bitmap glyphs at a fixed
 * tile size, sampled with NearestFilter so scaled-up cells stay chunky
 * instead of going blurry. Fill glyphs are sorted by actual ink coverage so
 * the luminance ramp is perceptually even regardless of charset order.
 */

const TILE = 16;
const RENDER = 128;

interface Glyph {
  char: string;
  bitmap: Uint8ClampedArray; // TILE*TILE, 0 or 255
  coverage: number; // 0..1 fraction of lit pixels
}

function renderGlyph(char: string): Glyph {
  const big = document.createElement("canvas");
  big.width = RENDER;
  big.height = RENDER;
  const bctx = big.getContext("2d")!;
  bctx.fillStyle = "#000";
  bctx.fillRect(0, 0, RENDER, RENDER);
  bctx.fillStyle = "#fff";
  bctx.font = `bold ${RENDER * 0.85}px "DejaVu Sans Mono", "Courier New", monospace`;
  bctx.textAlign = "center";
  bctx.textBaseline = "middle";
  bctx.fillText(char, RENDER / 2, RENDER / 2 + RENDER * 0.04);

  const small = document.createElement("canvas");
  small.width = TILE;
  small.height = TILE;
  const sctx = small.getContext("2d")!;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(big, 0, 0, TILE, TILE);

  const data = sctx.getImageData(0, 0, TILE, TILE).data;
  const bitmap = new Uint8ClampedArray(TILE * TILE);
  let lit = 0;
  for (let i = 0; i < TILE * TILE; i++) {
    // Threshold the antialiased downsample into a 1-bit pixel glyph
    const on = data[i * 4] > 96;
    bitmap[i] = on ? 255 : 0;
    if (on) lit++;
  }
  return { char, bitmap, coverage: lit / (TILE * TILE) };
}

function composeAtlas(glyphs: Glyph[]): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TILE * glyphs.length;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(canvas.width, TILE);
  glyphs.forEach((glyph, g) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const v = glyph.bitmap[y * TILE + x];
        const i = (y * canvas.width + g * TILE + x) * 4;
        image.data[i] = v;
        image.data[i + 1] = v;
        image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
    }
  });
  ctx.putImageData(image, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

export interface FillAtlas {
  texture: THREE.CanvasTexture;
  /** Charset re-ordered dark→bright by real ink coverage; use for text export too */
  orderedCharset: string;
}

export function makeFillAtlas(charset: string): FillAtlas {
  const glyphs = [...charset].map(renderGlyph);
  glyphs.sort((a, b) => a.coverage - b.coverage);
  return {
    texture: composeAtlas(glyphs),
    orderedCharset: glyphs.map((g) => g.char).join(""),
  };
}

/** Fixed order: 0 "|", 1 "-", 2 "/", 3 "\" — indexed by quantized Sobel angle */
export function makeEdgeAtlas(): THREE.CanvasTexture {
  return composeAtlas(["|", "-", "/", "\\"].map(renderGlyph));
}
