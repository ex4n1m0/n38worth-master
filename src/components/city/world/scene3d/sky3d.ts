/**
 * Mainframe City 3D — SKY DOME + STARS + ATMOSPHERE (client-only three.js).
 *
 * AAA pass (2026-09-30): replaces the flat scene.background with a gradient
 * sky dome (custom shader, BackSide) carrying a sun glow that tracks the
 * sun's screen direction, a dawn/dusk warm horizon band, a moon disc at
 * night, and a seeded star field that fades in after dusk. The dome follows
 * the camera target so the orthographic panning camera never leaves it.
 *
 * SUN_DIR is the shared light azimuth: the directional sun in ThreeScene
 * uses the same vector, so the sky's glow, the buildings' lit faces and the
 * shadow direction all agree (SC4's "one consistent sun").
 */

import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";

/**
 * Sun direction (unit). Chosen so the lit pipeline reproduces the authored
 * face read: +x walls (screen right) brightest, roofs lightest, +z walls
 * (screen left) receive a clear FILL (SC4's sunny side feel — the second
 * face must read, not mush) — the same hierarchy drawIsoBox baked in the
 * unlit era.
 */
export const SUN_DIR = new Vector3(0.55, 0.72, 0.42).normalize();

/** Dome radius — comfortably inside CAM_FAR, far outside the ground plate. */
const DOME_R = 6800;
const STAR_R = 6600;

/** Authored sky palette anchors (day ↔ dusk ↔ night). */
const DAY_TOP = new Color("#5f9fe0");
const DAY_HORIZON = new Color("#c9e2f6");
const DUSK_TOP = new Color("#31355e");
const DUSK_HORIZON = new Color("#e0793f");
const NIGHT_TOP = new Color("#040611");
const NIGHT_HORIZON = new Color("#0d1830");

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunI;
uniform float uMoonI;
uniform float uNight;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float t = pow(clamp(d.y, 0.0, 1.0), 0.55);
  vec3 col = mix(uHorizon, uTop, t);
  // Below the horizon: darken toward the ground plate edge.
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-d.y * 3.0, 0.0, 1.0));
  // Sun glow (disc + soft halo).
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * uSunI * pow(sd, 220.0) * 1.6;
  col += uSunColor * uSunI * pow(sd, 9.0) * 0.16;
  // Moon: small pale disc opposite-ish the sun, nights only.
  vec3 moonDir = normalize(vec3(-uSunDir.x, uSunDir.y * 0.75, -uSunDir.z));
  float md = max(dot(d, moonDir), 0.0);
  col += vec3(0.82, 0.86, 0.95) * uMoonI * pow(md, 520.0) * 1.4;
  col += vec3(0.35, 0.4, 0.55) * uMoonI * pow(md, 40.0) * 0.05;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Deterministic star seed (fixed sky every session). */
function starGeometry(): BufferGeometry {
  const N = 900;
  const pos = new Float32Array(N * 3);
  let state = 0x1234abcd;
  const rnd = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 0; i < N; i++) {
    // Upper hemisphere, slight clustering near the horizon band.
    const az = rnd() * Math.PI * 2;
    const y = 0.06 + Math.pow(rnd(), 0.75) * 0.94;
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(az) * r * STAR_R;
    pos[i * 3 + 1] = y * STAR_R;
    pos[i * 3 + 2] = Math.sin(az) * r * STAR_R;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
}

export class SkyDome {
  readonly mesh: Mesh;
  private readonly stars: Points;
  private readonly material: ShaderMaterial;
  private readonly starMaterial: PointsMaterial;

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: NIGHT_TOP.clone() },
        uHorizon: { value: NIGHT_HORIZON.clone() },
        uSunDir: { value: SUN_DIR.clone() },
        uSunColor: { value: new Color("#fff2cc") },
        uSunI: { value: 0 },
        uMoonI: { value: 0 },
        uNight: { value: 1 },
      },
    });
    this.mesh = new Mesh(new SphereGeometry(DOME_R, 32, 20), this.material);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;

    this.starMaterial = new PointsMaterial({
      color: new Color("#cfd8ea"),
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    this.stars = new Points(starGeometry(), this.starMaterial);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
  }

  /** All scene objects owned by the dome (add to the scene together). */
  get objects(): Array<Mesh | Points> {
    return [this.mesh, this.stars];
  }

  /** Keep the dome centered on the camera target (ortho pan safety). */
  followTarget(x: number, z: number): void {
    this.mesh.position.set(x, 0, z);
    this.stars.position.set(x, 0, z);
  }

  /**
   * Drive the sky from the daylight factor (0 night .. 1 day): palette
   * blend through a warm dusk/dawn midpoint, sun/moon disc intensities and
   * star opacity. Cheap — called on daylight updates only.
   */
  update(daylight: number): void {
    const d = Math.max(0, Math.min(1, daylight));
    // Warm factor peaks mid-ramp (dawn/dusk), zero at full day/night.
    const warm = Math.max(0, 1 - Math.abs(d * 2 - 1));
    const warmShaped = warm * warm * (3 - 2 * warm);
    const top = NIGHT_TOP.clone().lerp(DAY_TOP, d);
    const horizon = NIGHT_HORIZON.clone().lerp(DAY_HORIZON, d);
    top.lerp(DUSK_TOP, warmShaped * 0.6);
    horizon.lerp(DUSK_HORIZON, warmShaped * 0.85);
    this.material.uniforms.uTop.value.copy(top);
    this.material.uniforms.uHorizon.value.copy(horizon);
    this.material.uniforms.uSunI.value = Math.pow(d, 0.7);
    this.material.uniforms.uMoonI.value = Math.pow(1 - d, 1.4);
    this.material.uniforms.uNight.value = 1 - d;
    // Sun tint: warm orange near the ramps, pale yellow at noon.
    const sunColor = new Color("#ffb45e").lerp(new Color("#fff3d0"), d);
    this.material.uniforms.uSunColor.value.copy(sunColor);
    this.starMaterial.opacity = Math.pow(1 - d, 1.6) * 0.9;
  }

  /** The current horizon color — the scene fog should match it. */
  horizonColor(out: Color): Color {
    return out.copy(this.material.uniforms.uHorizon.value as Color);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.stars.geometry.dispose();
    this.starMaterial.dispose();
  }
}
