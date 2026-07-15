export const vertexShader = /* glsl */ `
  uniform float uVelocity;
  uniform float uHover;

  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Curtain bend: the plane bows vertically with scroll velocity.
    // Local units are normalized (plane is 1x1, scaled to pixels by the mesh),
    // so 0.06 = 6% of the plane height at full velocity.
    float bend = sin(uv.x * 3.141592) * uVelocity * 0.06;
    pos.y += bend;

    // Slight lift toward the viewer on hover (visible as scale in ortho via bulge)
    pos.xy *= 1.0 + uHover * 0.015;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uHover;
  uniform float uVelocity;
  uniform vec2 uMouse;
  uniform float uPlaneAspect;
  uniform float uImageAspect;

  varying vec2 vUv;

  // Object-fit: cover
  vec2 coverUv(vec2 uv) {
    if (uPlaneAspect > uImageAspect) {
      uv.y = 0.5 + (uv.y - 0.5) * (uImageAspect / uPlaneAspect);
    } else {
      uv.x = 0.5 + (uv.x - 0.5) * (uPlaneAspect / uImageAspect);
    }
    return uv;
  }

  void main() {
    vec2 uv = coverUv(vUv);

    // Radial ripple emanating from the pointer while hovered
    float dist = distance(vUv, uMouse);
    float ripple = sin(dist * 24.0 - uTime * 5.0)
      * 0.012
      * uHover
      * smoothstep(0.45, 0.0, dist);
    uv += normalize(vUv - uMouse + 0.0001) * ripple;

    // Chromatic aberration: scroll velocity shifts vertically, hover radially
    float shift = uVelocity * 0.012 + uHover * 0.004;
    float r = texture2D(uTexture, uv + vec2(0.0, shift)).r;
    float g = texture2D(uTexture, uv).g;
    float b = texture2D(uTexture, uv - vec2(0.0, shift)).b;
    vec3 color = vec3(r, g, b);

    // Monochrome at rest, full color under the pointer
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float reveal = uHover * smoothstep(0.6, 0.1, dist);
    color = mix(vec3(luma), color, clamp(reveal + abs(uVelocity) * 0.35, 0.0, 1.0));

    // Vignette the edges very slightly so planes sit into the black page
    float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x)
      * smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
    color *= 0.92 + 0.08 * edge;

    gl_FragColor = vec4(color, 1.0);
  }
`;
