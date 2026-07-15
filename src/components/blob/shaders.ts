// Ashima / Ian McEwan simplex noise (public domain), trimmed to 3D snoise
const simplex = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

export const blobVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPressure; // spring value — overshoots negative on release
  uniform vec3 uPoke;      // unit vector toward the pointer contact point

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDent;

  ${simplex}

  vec3 deform(vec3 p) {
    vec3 dir = normalize(p);

    // Idle breathing — two octaves of drifting noise along the normal
    float n = snoise(dir * 1.8 + uTime * 0.25) * 0.6
            + snoise(dir * 4.0 - uTime * 0.15) * 0.2;
    vec3 pos = p + dir * n * (0.09 + max(uPressure, 0.0) * 0.06);

    // Squash under pressure: down in y, out in xz (rough volume preservation).
    // Negative overshoot from the spring stretches it — the release wobble.
    float squash = 1.0 - uPressure * 0.32;
    pos.y *= squash;
    pos.xz *= 1.0 + uPressure * 0.18;

    // Local dent toward the poke point
    float d = distance(dir, uPoke);
    float dent = smoothstep(0.9, 0.0, d) * max(uPressure, 0.0);
    pos -= dir * dent * 0.45;

    return pos;
  }

  void main() {
    // Recompute normals from the deformed surface via tangent-plane sampling
    vec3 up = abs(normal.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(normal, up));
    vec3 bitangent = normalize(cross(normal, tangent));
    float eps = 0.01;

    vec3 p0 = deform(position);
    vec3 p1 = deform(position + tangent * eps);
    vec3 p2 = deform(position + bitangent * eps);
    vNormal = normalize(normalMatrix * normalize(cross(p1 - p0, p2 - p0)));

    float d = distance(normalize(position), uPoke);
    vDent = smoothstep(0.9, 0.0, d) * max(uPressure, 0.0);

    vec4 mvPosition = modelViewMatrix * vec4(p0, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const blobFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDent;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewDir);

    // Monochrome studio lighting: one key light, one fill, a fresnel rim
    vec3 keyDir = normalize(vec3(0.6, 0.8, 0.5));
    vec3 fillDir = normalize(vec3(-0.6, -0.2, 0.4));

    float key = max(dot(normal, keyDir), 0.0);
    float fill = max(dot(normal, fillDir), 0.0) * 0.25;
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.5);

    float spec = pow(max(dot(reflect(-keyDir, normal), viewDir), 0.0), 48.0) * 0.35;

    float shade = 0.04 + key * 0.55 + fill + fresnel * 0.5 + spec;

    // The dent glows slightly hotter — pressure reads as heat
    shade += vDent * 0.25;

    gl_FragColor = vec4(vec3(shade), 1.0);
  }
`;
