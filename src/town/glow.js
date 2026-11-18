// 发光：天一暗，灯一盏盏亮起来。
//   · 路灯、石灯笼、灯塔：一团柔和的光晕（面向镜头的软圆片，叠加混合），地上再铺一圈暖色的光斑
//   · 广场和小吃街：串灯杆之间拉起一串串小灯泡，垂成弧线，暖黄、浅粉、奶白交替，轻轻闪
//   · 灯塔：一道慢慢转的光柱扫过海面
//   · 河边、湖边、田边：萤火虫，飘着、一明一灭（位置在顶点着色器里算，CPU 不用管）
//   · 熟了的菜：地里亮晶晶的一颗小星（白天也看得见，提醒该收了）
//
// 叠加混合只加颜色、不动 alpha（blendSrcAlpha = Zero, blendDstAlpha = One），所以收尾的笔触和墨线不受影响。
// 光晕的颜色是 HDR 的（>1），亮的地方 frame.js 的泛光会再晕开一圈。
import * as THREE from 'three';
import { COMMON } from '../lib/index.js';

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};

// ---- 光晕、灯泡、萤火虫、小星：一种面向镜头的软圆片 ---------------------------------------------------------------
const haloVertex = /* glsl */ `
${COMMON}
in vec4 aPos;    // xyz, 大小（米）
in vec4 aColor;  // rgb, 种类：0 稳定 1 闪（灯泡） 2 萤火虫 3 小星（熟了的菜） 4 灯塔
in float aSeed;
uniform float uNight;
uniform vec3 uGradeInv; // 夜里整幅画会被压蓝压暗（frame 的 uGrade）：光先除回去，压完还是暖的
out vec2 vC;
out vec3 vCol;
out float vKind;
void main() {
  vec3 p = aPos.xyz;
  float size = aPos.w;
  float k = aColor.w;
  float on = smoothstep(0.08, 0.55, uNight);
  float bright = on;
  if (k > 0.5 && k < 1.5) bright *= 0.75 + 0.25 * sin(uTime * (1.3 + fract(aSeed * 7.0) * 2.0) + aSeed * 40.0);
  if (k > 1.5 && k < 2.5) {
    // 萤火虫：绕着自己的点慢慢飘，一明一灭
    float t = uTime * (0.25 + fract(aSeed * 3.7) * 0.3) + aSeed * 50.0;
    p += vec3(sin(t) * 2.4 + sin(t * 2.3) * 0.8, sin(t * 1.7) * 0.6 + 0.4, cos(t * 0.8) * 2.4 + cos(t * 1.9) * 0.8);
    float blink = pow(max(0.0, sin(uTime * (0.9 + fract(aSeed * 11.0)) + aSeed * 23.0)), 5.0);
    bright = smoothstep(0.35, 0.8, uNight) * blink;
  }
  if (k > 2.5 && k < 3.5) bright = 0.55 + 0.45 * on;
  if (k > 3.5) bright = on;
  vec3 toCam = normalize(uCamPos - p);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);
  // 小星：转着闪
  float rot = k > 2.5 && k < 3.5 ? uTime * 0.8 + aSeed * 6.0 : 0.0;
  vec2 c = position.xy;
  vec2 cr = vec2(c.x * cos(rot) - c.y * sin(rot), c.x * sin(rot) + c.y * cos(rot));
  float s = size * (k > 2.5 && k < 3.5 ? 0.8 + 0.35 * sin(uTime * 3.0 + aSeed * 9.0) : 1.0);
  vec3 world = p + (right * cr.x + up * cr.y) * s + toCam * 0.3;
  vC = c * 2.0;
  float dist = length(uCamPos - p);
  vCol = aColor.rgb * bright * exp(-dist * uFogDensity * 0.8) * uGradeInv;
  vKind = k;
  gl_Position = bright < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;
const haloFragment = /* glsl */ `
precision highp float;
in vec2 vC;
in vec3 vCol;
in float vKind;
layout(location = 0) out vec4 outC;
void main() {
  float r2 = dot(vC, vC);
  if (r2 > 1.0) discard;
  // 一颗亮芯加一圈慢慢散开的晕
  float core = exp(-r2 * 34.0);
  float halo = exp(-r2 * 3.0) * 0.13 + exp(-r2 * 11.0) * 0.22;
  float a = core * 1.2 + halo;
  if (vKind > 2.5 && vKind < 3.5) {
    // 四角的小星
    float star = max(exp(-abs(vC.x) * 18.0) * exp(-abs(vC.y) * 2.2), exp(-abs(vC.y) * 18.0) * exp(-abs(vC.x) * 2.2));
    a = star * 1.4 + core * 1.2 + exp(-r2 * 8.0) * 0.12;
  }
  outC = vec4(vCol * a, 0.0);
}
`;

// ---- 地上的光斑 --------------------------------------------------------------------------------------------------
const poolVertex = /* glsl */ `
${COMMON}
in vec4 aPos; // xyz（地面），半径
in vec3 aColor;
uniform float uNight;
uniform vec3 uGradeInv;
out vec2 vC;
out vec3 vCol;
void main() {
  vC = position.xy * 2.0;
  vec3 world = aPos.xyz + vec3(position.x, 0.0, position.y) * aPos.w * 2.0;
  float dist = length(uCamPos - world);
  vCol = aColor * smoothstep(0.1, 0.6, uNight) * exp(-dist * uFogDensity) * uGradeInv;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;
const poolFragment = /* glsl */ `
precision highp float;
in vec2 vC;
in vec3 vCol;
layout(location = 0) out vec4 outC;
void main() {
  float r2 = dot(vC, vC);
  if (r2 > 1.0) discard;
  outC = vec4(vCol * (1.0 - r2) * (1.0 - r2) * 0.55, 0.0);
}
`;

// ---- 灯塔的光柱 --------------------------------------------------------------------------------------------------
const beamVertex = /* glsl */ `
${COMMON}
out float vAlong;
out float vEdge;
out vec3 vWorld;
void main() {
  vAlong = uv.y;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vEdge = abs(dot(n, normalize(uCamPos - w.xyz)));
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const beamFragment = /* glsl */ `
${COMMON}
uniform float uNight;
uniform vec3 uGradeInv;
in float vAlong;
in float vEdge;
in vec3 vWorld;
layout(location = 0) out vec4 outC;
void main() {
  // 越远越淡，边缘柔
  float a = pow(vAlong, 1.6) * smoothstep(0.0, 0.6, vEdge) * smoothstep(0.3, 0.7, uNight);
  float dist = length(uCamPos - vWorld);
  outC = vec4(vec3(1.0, 0.9, 0.62) * a * 0.55 * exp(-dist * uFogDensity * 0.35) * uGradeInv, 0.0);
}
`;

/**
 * @param shared 场地的 uniforms（要有 uNight）
 * @param o.lamps [[x, y, z]] 路灯灯头
 * @param o.lanterns [[x, y, z]] 石灯笼的灯室
 * @param o.festoons [[x, y, z]] 串灯杆的杆顶（相邻的杆之间拉灯串）
 * @param o.lighthouse [x, y, z] 灯塔的灯室（没有就不画光柱）
 * @param o.fireflies [[x, y, z]] 萤火虫的点
 * @param o.ground (x, z) => 地面高度
 */
export function createGlow(shared, { lamps = [], lanterns = [], festoons = [], strings = [], lighthouse = null, fireflies = [], ground = () => 0, sparkles = 24 } = {}) {
  const group = new THREE.Group();
  const night = shared.uNight ?? { value: 0 };
  const items = []; // [x, y, z, size, r, g, b, kind, seed]
  const WARM = [2.3, 1.35, 0.5];
  const gradeInv = { value: new THREE.Vector3(1, 1, 1) };
  let seed = 0.137;
  const nextSeed = () => (seed = (seed * 9301 + 0.49297) % 1);
  for (const [x, y, z] of lamps) items.push([x, y, z, 0.85, ...WARM, 1, nextSeed()]);
  for (const [x, y, z] of lanterns) items.push([x, y, z, 1.2, 2.4, 1.2, 0.4, 1, nextSeed()]);
  // 灯串：相邻两根杆之间垂一道弧，十几颗小灯泡
  const BULBS = [[2.6, 1.6, 0.55], [2.4, 1.1, 0.9], [2.5, 2.0, 1.2]];
  const pairs = [...strings];
  for (const [a, b] of pairs) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(4, Math.round(len / 1.6));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const sag = Math.sin(t * Math.PI) * Math.min(1.6, len * 0.07);
      items.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag, a[2] + (b[2] - a[2]) * t, 0.62, ...BULBS[i % 3], 1, nextSeed()]);
    }
  }
  for (const [x, y, z] of festoons) items.push([x, y + 0.1, z, 0.7, ...BULBS[0], 1, nextSeed()]);
  if (lighthouse) items.push([...lighthouse, 7, 3.4, 2.9, 1.8, 4, 0.5]);
  for (const [x, y, z] of fireflies) items.push([x, y, z, 0.5, 1.5, 2.3, 0.45, 2, nextSeed()]);
  const sparkleStart = items.length;
  for (let i = 0; i < sparkles; i++) items.push([0, -500, 0, 0.55, 3.0, 2.6, 1.3, 3, nextSeed()]);

  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.attributes.position = quad.attributes.position;
  geo.instanceCount = items.length;
  const pos = new Float32Array(items.length * 4);
  const col = new Float32Array(items.length * 4);
  const sd = new Float32Array(items.length);
  items.forEach((it, i) => {
    pos.set([it[0], it[1], it[2], it[3]], i * 4);
    col.set([it[4], it[5], it[6], it[7]], i * 4);
    sd[i] = it[8];
  });
  const aPos = new THREE.InstancedBufferAttribute(pos, 4);
  aPos.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos);
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 4));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 1));
  const halos = new THREE.Mesh(geo, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: haloVertex, fragmentShader: haloFragment, uniforms: { ...shared, uNight: night, uGradeInv: gradeInv }, ...additive }));
  halos.frustumCulled = false;
  halos.renderOrder = 8;
  group.add(halos);

  // 光斑：路灯和石灯笼脚下
  const pools = [...lamps.map(([x, , z]) => [x, z, 5.5, WARM]), ...lanterns.map(([x, , z]) => [x, z, 3, [2.4, 1.2, 0.4]])];
  if (lighthouse) pools.push([lighthouse[0], lighthouse[2], 9, [2.6, 2.3, 1.6]]);
  if (pools.length) {
    const pq = new THREE.PlaneGeometry(1, 1);
    const pg = new THREE.InstancedBufferGeometry();
    pg.index = pq.index;
    pg.attributes.position = pq.attributes.position;
    pg.instanceCount = pools.length;
    const pp = new Float32Array(pools.length * 4);
    const pc = new Float32Array(pools.length * 3);
    pools.forEach(([x, z, r, c], i) => {
      pp.set([x, ground(x, z) + 0.12, z, r], i * 4);
      pc.set(c.map((v) => v * 0.5), i * 3);
    });
    pg.setAttribute('aPos', new THREE.InstancedBufferAttribute(pp, 4));
    pg.setAttribute('aColor', new THREE.InstancedBufferAttribute(pc, 3));
    const pm = new THREE.Mesh(pg, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: poolVertex, fragmentShader: poolFragment, uniforms: { ...shared, uNight: night, uGradeInv: gradeInv }, ...additive, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    pm.frustumCulled = false;
    pm.renderOrder = 7;
    group.add(pm);
  }

  // 灯塔光柱：从灯室水平射出去的一个长锥，慢慢转
  let beam = null;
  if (lighthouse) {
    const cg = new THREE.ConeGeometry(16, 240, 72, 1, true);
    // 锥尖在灯室，往 +z 射出去；uv.y：0 在远端、1 在锥尖
    cg.rotateX(-Math.PI / 2);
    cg.translate(0, 0, 120);
    beam = new THREE.Mesh(cg, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: beamVertex, fragmentShader: beamFragment, uniforms: { ...shared, uNight: night, uGradeInv: gradeInv }, ...additive, side: THREE.DoubleSide }));
    beam.position.set(...lighthouse);
    beam.frustumCulled = false;
    beam.renderOrder = 9;
    group.add(beam);
  }

  let clock = 0;
  return {
    group,
    count: items.length,
    /** frame.grade 变了就调：光先除以它 */
    setGrade(g) {
      gradeInv.value.set(1 / Math.max(0.25, g.x), 1 / Math.max(0.25, g.y), 1 / Math.max(0.25, g.z));
    },
    /** @param ripe [{ x, y, z }] 熟了的菜（最多 sparkles 个，多的不画） */
    update(dt, ripe = []) {
      clock += dt;
      if (beam) beam.rotation.y = clock * 0.35;
      for (let i = 0; i < sparkles; i++) {
        const p = ripe[i];
        const o = (sparkleStart + i) * 4;
        pos[o] = p ? p.x : 0;
        pos[o + 1] = p ? p.y + 1.0 : -500;
        pos[o + 2] = p ? p.z : 0;
      }
      aPos.needsUpdate = true;
    },
  };
}
