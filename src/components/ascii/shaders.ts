export const screenVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Fullscreen quad — no camera involved
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const asciiFragmentShader = /* glsl */ `
  uniform sampler2D uMedia;
  uniform sampler2D uAtlas;
  uniform sampler2D uBayer;
  uniform vec2 uResolution; // physical pixels
  uniform float uCell;      // physical pixels per cell
  uniform float uCharCount;
  uniform float uMode;      // 0 ascii, 1 dither, 2 halftone
  uniform float uInvert;
  uniform float uColorMode; // 0 mono, 1 source color

  varying vec2 vUv;

  float lumaOf(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 cellIndex = floor(frag / uCell);

    // One sample per cell — the pixelation IS the effect
    vec2 cellUv = (cellIndex + 0.5) * uCell / uResolution;
    vec3 col = texture2D(uMedia, cellUv).rgb;
    float luma = lumaOf(col);
    if (uInvert > 0.5) {
      luma = 1.0 - luma;
      col = 1.0 - col;
    }

    vec3 result;

    if (uMode < 0.5) {
      // ASCII: pick a glyph by brightness, stamp it inside the cell
      float idx = floor(luma * (uCharCount - 1.0) + 0.5);
      vec2 inCell = fract(frag / uCell);
      vec2 atlasUv = vec2((idx + inCell.x) / uCharCount, inCell.y);
      float glyph = texture2D(uAtlas, atlasUv).r;
      result = uColorMode > 0.5 ? col * glyph * 1.35 : vec3(glyph);
    } else if (uMode < 1.5) {
      // Ordered dither against an 8x8 Bayer matrix, at cell resolution.
      // Mono = 1-bit; color = per-channel threshold (8-color palette)
      float threshold = texture2D(uBayer, (cellIndex + 0.5) / 8.0).r;
      if (uColorMode > 0.5) {
        result = step(vec3(threshold), col);
      } else {
        result = vec3(step(threshold, luma));
      }
    } else {
      // Halftone: dot area tracks brightness
      vec2 inCell = fract(frag / uCell) - 0.5;
      float r = length(inCell) * 2.0;
      float radius = sqrt(clamp(luma, 0.0, 1.0)) * 1.1;
      float d = smoothstep(radius + 0.08, radius - 0.08, r);
      result = uColorMode > 0.5 ? col * d * 1.35 : vec3(d);
    }

    gl_FragColor = vec4(result, 1.0);
  }
`;
