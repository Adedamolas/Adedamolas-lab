export const screenVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Fullscreen quad — no camera involved
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const asciiFragmentShader = /* glsl */ `
  #define PI 3.14159265359

  uniform sampler2D uMedia;
  uniform sampler2D uAtlas;     // fill glyphs, coverage-ordered dark->bright
  uniform sampler2D uEdgeAtlas; // | - / +bslash, indexed by Sobel angle
  uniform sampler2D uBayer;     // threshold map, tiles with RepeatWrapping
  uniform sampler2D uFloyd;     // CPU error-diffusion result (passthrough)

  uniform vec2 uResolution;   // physical pixels
  uniform float uCell;        // ascii/halftone cell, physical px
  uniform float uPixel;       // dither pixel scale, physical px
  uniform float uCharCount;
  uniform float uBayerSize;
  uniform float uMode;        // 0 ascii, 1 dither, 2 halftone
  uniform float uAlgorithm;   // dither: 0 bayer, 1 noise, 2 floyd
  uniform float uEdges;       // ascii: draw Sobel edge glyphs
  uniform float uExposure;
  uniform float uGamma;
  uniform float uInvert;
  uniform float uColorMode;   // 0 mono, 1 source color
  uniform float uAngle;       // halftone grid rotation, radians

  varying vec2 vUv;

  float lumaOf(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
  }

  // Exposure -> gamma curve -> optional invert (Acerola's exposure/attenuation)
  float tone(float l) {
    l = pow(clamp(l * uExposure, 0.0, 1.0), uGamma);
    return uInvert > 0.5 ? 1.0 - l : l;
  }

  vec3 toneColor(vec3 c) {
    c = pow(clamp(c * uExposure, 0.0, 1.0), vec3(uGamma));
    return uInvert > 0.5 ? 1.0 - c : c;
  }

  // Box-averaged cell sample: 4 taps kill the single-sample noise
  vec3 cellColor(vec2 cellIndex) {
    vec2 base = (cellIndex + 0.5) * uCell / uResolution;
    vec2 o = uCell * 0.25 / uResolution;
    vec3 c = texture2D(uMedia, base + vec2(-o.x, -o.y)).rgb;
    c += texture2D(uMedia, base + vec2(o.x, -o.y)).rgb;
    c += texture2D(uMedia, base + vec2(-o.x, o.y)).rgb;
    c += texture2D(uMedia, base + vec2(o.x, o.y)).rgb;
    return c * 0.25;
  }

  float cellLuma(vec2 cellIndex) {
    return tone(lumaOf(cellColor(cellIndex)));
  }

  // Interleaved gradient noise — cheap blue-noise-ish threshold
  float ign(vec2 p) {
    return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
  }

  vec3 renderAscii() {
    vec2 frag = gl_FragCoord.xy;
    vec2 cellIndex = floor(frag / uCell);
    vec2 inCell = fract(frag / uCell);

    vec3 col = cellColor(cellIndex);
    float luma = tone(lumaOf(col));

    // --- Edge pass: Sobel on the downsampled luma grid ---
    if (uEdges > 0.5) {
      float tl = cellLuma(cellIndex + vec2(-1.0, 1.0));
      float t = cellLuma(cellIndex + vec2(0.0, 1.0));
      float tr = cellLuma(cellIndex + vec2(1.0, 1.0));
      float l = cellLuma(cellIndex + vec2(-1.0, 0.0));
      float r = cellLuma(cellIndex + vec2(1.0, 0.0));
      float bl = cellLuma(cellIndex + vec2(-1.0, -1.0));
      float b = cellLuma(cellIndex + vec2(0.0, -1.0));
      float br = cellLuma(cellIndex + vec2(1.0, -1.0));

      float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
      float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
      float mag = length(vec2(gx, gy));

      if (mag > 0.65) {
        // Quantize gradient angle to 4 edge glyphs (Acerola's mapping)
        float theta = atan(gy, gx);
        float a = abs(theta) / PI;
        float dir;
        if (a < 0.05 || a > 0.95) {
          dir = 0.0; // vertical edge "|"
        } else if (a > 0.45 && a < 0.55) {
          dir = 1.0; // horizontal edge "-"
        } else if (a <= 0.45) {
          dir = theta > 0.0 ? 2.0 : 3.0; // "/" or "\\"
        } else {
          dir = theta > 0.0 ? 3.0 : 2.0;
        }
        float glyph = texture2D(uEdgeAtlas, vec2((dir + inCell.x) / 4.0, inCell.y)).r;
        return uColorMode > 0.5 ? col * glyph * 1.4 : vec3(glyph);
      }
    }

    // --- Fill pass: quantized luminance picks a coverage-ordered glyph ---
    float idx = clamp(floor(luma * uCharCount), 0.0, uCharCount - 1.0);
    float glyph = texture2D(uAtlas, vec2((idx + inCell.x) / uCharCount, inCell.y)).r;
    return uColorMode > 0.5 ? col * glyph * 1.4 : vec3(glyph);
  }

  vec3 renderDither() {
    // Floyd–Steinberg is precomputed on the CPU — straight passthrough
    if (uAlgorithm > 1.5) {
      return texture2D(uFloyd, vUv).rgb;
    }

    vec2 pixelIndex = floor(gl_FragCoord.xy / uPixel);
    vec2 uv = (pixelIndex + 0.5) * uPixel / uResolution;
    vec3 srgb = texture2D(uMedia, uv).rgb;

    // Dither in linear light — thresholding sRGB reads too dark
    vec3 lin = pow(srgb, vec3(2.2));

    float threshold;
    if (uAlgorithm > 0.5) {
      threshold = ign(pixelIndex);
    } else {
      threshold = texture2D(uBayer, (pixelIndex + 0.5) / uBayerSize).r;
    }

    if (uColorMode > 0.5) {
      return step(vec3(threshold), toneColor(lin));
    }
    return vec3(step(threshold, tone(lumaOf(lin))));
  }

  vec3 renderHalftone() {
    vec2 center = uResolution * 0.5;
    float s = sin(uAngle);
    float c = cos(uAngle);
    mat2 rot = mat2(c, -s, s, c);
    mat2 inv = mat2(c, s, -s, c);

    // Work in the rotated grid, sample the source at each dot's true center
    vec2 rp = rot * (gl_FragCoord.xy - center);
    vec2 cellIndex = floor(rp / uCell);
    vec2 cellCenter = (cellIndex + 0.5) * uCell;
    vec2 sampleUv = (inv * cellCenter + center) / uResolution;

    vec3 col = texture2D(uMedia, clamp(sampleUv, 0.0, 1.0)).rgb;
    float luma = tone(lumaOf(col));

    // Dot area tracks brightness; radius overshoots so highlights fuse solid
    float r = length(rp - cellCenter) / (uCell * 0.5);
    float radius = sqrt(luma) * 1.45;
    float aa = 3.0 / uCell;
    float d = 1.0 - smoothstep(radius - aa, radius + aa, r);

    return uColorMode > 0.5 ? col * d * 1.4 : vec3(d);
  }

  void main() {
    vec3 result;
    if (uMode < 0.5) {
      result = renderAscii();
    } else if (uMode < 1.5) {
      result = renderDither();
    } else {
      result = renderHalftone();
    }
    gl_FragColor = vec4(result, 1.0);
  }
`;
