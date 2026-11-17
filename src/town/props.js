// 地图上的东西：远山、湖、树、田、石头、花、鸽子、小动物、路面。
// 每条都尽量合并/实例化，弱显卡也能跑。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMMON } from '../lib/index.js';
import { paintMaterial, outlineMaterial } from './paint.js';
import { plain } from './buildings.js';
import { HALF, LAKE, SEA, RIVER, RIVER_HALF, riverAt, riverLevel, heightAt, lakeDistance, forestAt, fieldsAt, mountainAt, smooth } from './plan.js';

// ---- 远景地面：场地（草）之外的丘陵、林山、雪山，一直铺到雾里 ------------------------------------
// 做法照原作的 horizon.js：内缘和草地是同一种绿、同一种光，往外按"画"来上色——
// 草甸是大块的黄绿和蓝绿，林子是压深的一团团，陡的地方露岩，高处是雪。
const farVertex = /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
void main() {
  vWorld = position;
  vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

const farFragment = /* glsl */ `
${COMMON}
layout(location = 0) out vec4 outC;
in vec3 vWorld;
in vec3 vNormal;
uniform sampler2D tFar;   // 林（红）、田（绿）
uniform float uFarInv;

void main() {
  vec3 N = normalize(vNormal);
  if (N.y < 0.0) N = -N;
  vec2 xz = vWorld.xz;
  float dist = distance(vWorld, uCamPos);
  float cloud = cloudAt(xz);
  float rel = slopeRel(N);
  float sunny = cloud * slopeSun(rel);

  vec4 a = texture(tNoiseHi, xz / 2300.0);
  vec4 b = texture(tNoiseHi, xz / 810.0 + 0.31);
  vec4 c = texture(tNoiseHi, xz / 230.0 + 0.57);
  vec4 e = texture(tNoiseHi, xz / 47.0 + 0.13);
  vec4 far4 = texture(tFar, xz * uFarInv + 0.5);

  // 草甸：和场地同一套绿，向阳的坡黄一点，背阴的蓝一点
  vec3 col = meadowGreen(0.5 + 0.2 * smoothstep(0.3, 0.7, a.g) + (rel - 0.5) * 0.4);
  float sx = strokeCoord(vWorld);
  float sy = strokeCoord2(xz);
  col = paintGround(col, xz, dist, 0.0);
  col = landStrokes(landStrokes(col, xz, dist, sx, fwidth(sx)), xz, dist, sy, fwidth(sy));

  // 田：一块块不同颜色的拼布
  vec2 fq = vec2(xz.x * 0.82 + xz.y * 0.57, -xz.x * 0.57 + xz.y * 0.82) / vec2(46.0, 30.0);
  vec4 fr = cellRand(floor(fq), 3.0);
  vec3 crop = mix(mix(vec3(0.42, 0.5, 0.12), vec3(0.62, 0.52, 0.16), fr.x), mix(vec3(0.2, 0.42, 0.1), vec3(0.46, 0.3, 0.16), fr.y), step(0.5, fr.z));
  vec2 fe = abs(fract(fq) - 0.5);
  crop *= mix(0.72, 1.0, smoothstep(0.5, 0.44, max(fe.x, fe.y)));
  col = mix(col, crop, smoothstep(0.35, 0.6, far4.g));

  // 林：边缘毛毛的深绿，里面一团亮一团暗（树冠）
  float forest = smoothstep(0.36, 0.6, far4.r + (c.r - 0.5) * 0.34 + (e.g - 0.5) * 0.22);
  vec3 wood = mix(vec3(0.03, 0.13, 0.07), vec3(0.09, 0.27, 0.08), smoothstep(0.35, 0.7, e.b * 0.6 + c.a * 0.4));
  col = mix(col, wood, forest);

  vec3 lit = col * meadowLight(sunny);

  // 岩：陡的地方、高的地方。两阶色，暖灰对冷灰
  float steep = 1.0 - N.y;
  float rock = smoothstep(0.26, 0.44, steep + (c.g - 0.5) * 0.16) * smoothstep(60.0, 150.0, vWorld.y + (b.r - 0.5) * 60.0);
  rock = max(rock, smoothstep(170.0, 260.0, vWorld.y + (b.g - 0.5) * 70.0) * 0.85);
  float ndl = smoothstep(-0.05, 0.25, dot(N, uSunDir));
  vec3 stone = mix(vec3(0.3, 0.33, 0.42) * (uSkyColor * 1.5 + 0.1), vec3(0.62, 0.57, 0.5) * (uSunColor * 0.4 + uSkyColor * 0.3), ndl);
  stone *= mix(0.86, 1.08, e.r);
  lit = mix(lit, stone, rock);

  // 雪：高处，背风的缓坡上多；阴面是蓝的
  float snow = smoothstep(235.0, 300.0, vWorld.y + (c.b - 0.5) * 80.0 + (e.a - 0.5) * 24.0) * smoothstep(0.62, 0.38, steep + (e.g - 0.5) * 0.2);
  vec3 white = mix(vec3(0.62, 0.74, 0.95) * (uSkyColor * 1.6 + 0.12), vec3(1.0, 0.99, 0.96) * (uSunColor * 0.42 + uSkyColor * 0.36), ndl);
  lit = mix(lit, white, snow);

  outC = vec4(applyFog(lit, vWorld), 1.0);
}
`;

/** 远地用的图：林（红）、田（绿），烘一次。 */
function farMap(side, size = 512) {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size - 0.5) * side;
      const z = ((j + 0.5) / size - 0.5) * side;
      const k = (i + j * size) * 4;
      data[k] = 255 * forestAt(x, z);
      data[k + 1] = 255 * fieldsAt(x, z);
      data[k + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 场地之外的地面：从场地的方形边缘一圈圈往外推到 REACH，越远越稀。
 * @param inner 场地（草）覆盖的正方形：{ centre: [x, z], half }
 */
export function createFarGround(shared, inner = { centre: [0, 0], half: HALF }) {
  const REACH = 3200;
  const around = 720;
  const rings = 72;
  const edge = inner.half - 8;
  const reach = REACH / edge;
  const [cx, cz] = inner.centre;
  const positions = new Float32Array(around * (rings + 1) * 3);
  let p = 0;
  for (let k = 0; k <= rings; k++) {
    const scale = Math.pow(reach, k / rings);
    for (let i = 0; i < around; i++) {
      const t = (i / around) * 4;
      const side = Math.floor(t);
      const u = (t - side) * 2 - 1;
      let x = side === 0 ? u : side === 1 ? 1 : side === 2 ? -u : -1;
      let z = side === 0 ? -1 : side === 1 ? u : side === 2 ? 1 : -u;
      // 越往外，正方形越圆
      const round = Math.min(1, k / (rings * 0.4));
      const len = Math.hypot(x, z);
      x = cx + x * edge * scale * (1 + (1 / len - 1) * round);
      z = cz + z * edge * scale * (1 + (1 / len - 1) * round);
      positions[p++] = x;
      positions[p++] = heightAt(x, z) - (k === 0 ? 0.4 : 0);
      positions[p++] = z;
    }
  }
  const indices = new Uint32Array(rings * around * 6);
  let q = 0;
  for (let k = 0; k < rings; k++) {
    for (let i = 0; i < around; i++) {
      const a = k * around + i;
      const b = k * around + ((i + 1) % around);
      indices[q++] = a;
      indices[q++] = a + around;
      indices[q++] = b;
      indices[q++] = b;
      indices[q++] = a + around;
      indices[q++] = b + around;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  const side = REACH * 2 + 400;
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: farVertex,
    fragmentShader: farFragment,
    uniforms: { ...shared, tFar: { value: farMap(side) }, uFarInv: { value: 1 / side } },
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// ---- 湖 --------------------------------------------------------------------------------------------------------
// 画法照原作的 tarn（water.js）：水是一面镜子，映着天穹和云；浅的地方透出湖底，靠岸一道深色的线，
// 太阳在水上是一路碎金。风大的时候皱得厉害。
const lakeVertex = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const lakeFragment = /* glsl */ `
${COMMON}
precision highp samplerCube;
layout(location = 0) out vec4 outC;
in vec3 vWorld;
uniform vec3 uZenith, uMid, uHorizon, uGlow;
uniform samplerCube tClouds;
uniform vec4 uLake;   // 湖心 x, z，半径 x, z

vec3 skyAt(vec3 d) {
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.3, pow(h, 0.8)));
  col = mix(col, uZenith, smoothstep(0.18, 0.85, h));
  vec4 c = texture(tClouds, d);
  return col * (1.0 - c.a) + c.rgb;
}

void main() {
  vec2 xz = vWorld.xz;
  float depth = vWorld.y - groundAt(xz);
  if (depth <= 0.0) discard;
  if (uLake.z > 0.0 && length((xz - uLake.xy) / uLake.zw) > 1.3) discard;
  vec3 V = normalize(uCamPos - vWorld);
  float dist = distance(uCamPos, vWorld);
  float U = uWind.z * (0.35 + 0.65 * gustAt(xz));
  vec2 flow = uWind.xy * uTime;
  vec2 r1 = texture(tNoiseHi, (xz - flow * 0.22) / 7.3).rg - 0.5;
  vec2 r2 = texture(tNoiseHi, (xz.yx + flow * 0.31) / 2.1 + 0.4).ba - 0.5;
  vec2 rip = (r1 + r2 * 0.6) * 0.04 * U * smoothstep(0.0, 0.5, depth) / (1.0 + dist * 0.01);
  vec3 N = normalize(vec3(rip.x, 1.0, rip.y));
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 mirror = mix(skyAt(normalize(R + vec3(0.0, 0.3, 0.0))), uMid * 1.05, 0.45);
  // 对岸低处的东西也映在水里：岸、山
  float shore = 1.0 - smoothstep(0.015, 0.1, R.y + r1.x * 0.03);
  mirror = mix(mirror, vec3(0.04, 0.15, 0.07) * (uSkyColor + uSunColor * 0.25), shore * 0.85);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  float shade = cloudAt(xz);
  // 湖底：浅处是沙的暖色透上来，再深是青绿，最深是蓝黑
  vec3 bed = mix(vec3(0.42, 0.46, 0.3), vec3(0.06, 0.3, 0.3), smoothstep(0.0, 1.1, depth));
  bed = mix(bed, vec3(0.012, 0.07, 0.12), smoothstep(0.8, 5.0, depth)) * (uSkyColor + uSunColor * 0.3 * shade);
  vec3 col = mix(bed, mirror, clamp(fres * 1.15 + 0.12, 0.0, 1.0));
  float glint = pow(max(dot(R, uSunDir), 0.0), 420.0) * shade;
  col += uSunColor * glint * 2.5;
  // 水边一道细细的白沫，随波一明一暗
  float foam = smoothstep(0.16, 0.03, depth) * smoothstep(0.35, 0.6, texture(tNoise, xz / 1.7 + flow * 0.02).r + 0.25 * sin(uTime * 0.9 + xz.x * 0.4));
  col = mix(col, vec3(0.92, 0.96, 0.98) * (uSkyColor * 0.9 + uSunColor * 0.3), foam * 0.7);
  float alpha = smoothstep(0.0, 0.07, depth);
  outC = vec4(applyFog(col, vWorld), alpha);
}
`;

/** 湖面。sky 晚一点才有（云要先画），所以先建好，等天有了再用 setSky 把天穹接上。 */
export function createLake(shared) {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(LAKE.rx * 2.7, LAKE.rz * 2.7, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(LAKE.x, LAKE.level, LAKE.z);
  const blank = new THREE.CubeTexture();
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: lakeVertex,
    fragmentShader: lakeFragment,
    uniforms: {
      ...shared,
      uZenith: { value: new THREE.Color(0.2, 0.4, 0.8) },
      uMid: { value: new THREE.Color(0.4, 0.6, 0.9) },
      uHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
      uGlow: { value: new THREE.Color(1, 1, 1) },
      tClouds: { value: blank },
      uLake: { value: new THREE.Vector4(LAKE.x, LAKE.z, LAKE.rx, LAKE.rz) },
    },
    transparent: true,
    depthWrite: false,
  });
  const water = new THREE.Mesh(geo, mat);
  water.renderOrder = 5;
  group.add(water);

  // 河和海用同一种水，只是不按椭圆裁（水面和地面的高低自己会分出岸来）
  const open = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: lakeVertex,
    fragmentShader: lakeFragment,
    uniforms: { ...mat.uniforms, uLake: { value: new THREE.Vector4(0, 0, 0, 1) } },
    transparent: true,
    depthWrite: false,
  });
  // 清溪河：沿中线每 6 m 一排，比河宽出一截；每一排是平的，沿河一路往下降
  {
    const pos = [];
    const idx = [];
    const half = RIVER_HALF + 9;
    let n = 0;
    for (let i = 0; i + 1 < RIVER.length; i++) {
      const [ax, az] = RIVER[i];
      const [bx, bz] = RIVER[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const rows = Math.ceil(len / 6);
      for (let j = 0; j <= rows; j++) {
        const x = ax + ((bx - ax) * j) / rows;
        const z = az + ((bz - az) * j) / rows;
        const y = riverLevel(riverAt(x, z).t);
        pos.push(x + nx * half, y, z + nz * half, x - nx * half, y, z - nz * half);
        if (j > 0) idx.push(n - 2, n, n - 1, n - 1, n, n + 1);
        n += 2;
      }
      // 拐弯处补一个圆盘
      const y = riverLevel(riverAt(bx, bz).t);
      const c0 = pos.length / 3;
      pos.push(bx, y, bz);
      for (let k = 0; k <= 12; k++) pos.push(bx + Math.cos((k / 12) * Math.PI * 2) * half, y, bz + Math.sin((k / 12) * Math.PI * 2) * half);
      for (let k = 0; k < 12; k++) idx.push(c0, c0 + 2 + k, c0 + 1 + k);
      n = pos.length / 3;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setIndex(idx);
    const river = new THREE.Mesh(rg, open);
    river.material.side = THREE.DoubleSide;
    river.renderOrder = 5;
    river.frustumCulled = false;
    group.add(river);
  }
  // 大海：东边一大片
  {
    const sg = new THREE.PlaneGeometry(5200, 9000, 1, 1);
    sg.rotateX(-Math.PI / 2);
    sg.translate(560 + 2600, SEA.level, 0);
    const sea = new THREE.Mesh(sg, open);
    sea.renderOrder = 5;
    sea.frustumCulled = false;
    group.add(sea);
  }

  // 岸边的芦苇：一丛丛细长的叶子，站在浅水里
  const reedGeo = new THREE.ConeGeometry(0.05, 1.5, 4);
  reedGeo.translate(0, 0.75, 0);
  const reedMat = paintMaterial(shared, { lit: [0.42, 0.56, 0.22], shade: [0.14, 0.28, 0.14], kind: 'flat' });
  const spots = [];
  for (let i = 0; i < 70; i++) {
    const a = i * 2.399;
    const k = 0.9 + ((i * 37) % 11) / 11 * 0.1;
    const cx = LAKE.x + Math.cos(a) * LAKE.rx * k;
    const cz = LAKE.z + Math.sin(a) * LAKE.rz * k;
    if (Math.sin(a * 3.1 + 1) < -0.1) continue;
    for (let j = 0; j < 9; j++) spots.push([cx + Math.sin(j * 2.1 + i) * 0.9, cz + Math.cos(j * 1.7 + i) * 0.9, 0.7 + ((j * 13 + i) % 7) / 7, Math.sin(j + i) * 0.18]);
  }
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  spots.forEach(([x, z, s, lean], i) => {
    e.set(lean, i, lean * 0.7);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, Math.max(heightAt(x, z), LAKE.level - 0.5) - 0.05, z), q, new THREE.Vector3(s, s, s));
    reeds.setMatrixAt(i, m4);
  });
  reeds.instanceMatrix.needsUpdate = true;
  group.add(reeds);

  group.userData.update = () => {};
  group.userData.setSky = (sky) => {
    const u = sky.uniforms;
    for (const k of ['uZenith', 'uMid', 'uHorizon', 'uGlow', 'tClouds']) mat.uniforms[k] = open.uniforms[k] = u[k];
    mat.needsUpdate = open.needsUpdate = true;
  };
  return group;
}

// ---- 树 --------------------------------------------------------------------------------------------------------
/** 一棵树的三档造型：圆冠、高冠、松。都用合并后的低模，实例化摆。 */
function treeGeometries(shared) {
  const make = (trunkH, trunkR, clumps, crownH, crownR, pine) => {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 7);
    trunk.translate(0, trunkH / 2, 0);
    parts.push({ geo: trunk, kind: 'wood' });
    if (pine) {
      for (let i = 0; i < clumps; i++) {
        const t = i / clumps;
        const cone = new THREE.ConeGeometry(crownR * (1 - t * 0.55), crownH * 0.55, 9);
        cone.translate(0, trunkH + crownH * 0.1 + t * crownH * 0.7, 0);
        parts.push({ geo: cone, kind: 'leaf' });
      }
    } else {
      for (let i = 0; i < clumps; i++) {
        const a = (i / clumps) * Math.PI * 2 + 0.7;
        const r = i === 0 ? 0 : crownR * 0.45;
        const ball = new THREE.IcosahedronGeometry(crownR * (i === 0 ? 1 : 0.72), 1);
        ball.scale(1, 0.82, 1);
        ball.translate(Math.cos(a) * r, trunkH + crownH * (0.35 + 0.3 * ((i % 3) / 3)) + crownR * 0.3, Math.sin(a) * r);
        parts.push({ geo: ball, kind: 'leaf' });
      }
    }
    return parts;
  };
  const kinds = [
    make(2.6, 0.34, 5, 4.4, 2.5, false), // 圆冠阔叶
    make(3.4, 0.28, 4, 6.2, 1.9, false), // 高冠
    make(2.2, 0.3, 5, 5.0, 1.5, true), // 松
    make(1.0, 0.14, 4, 1.8, 1.0, false), // 灌木
  ];
  return kinds.map((parts) => {
    const woodGeos = parts.filter((p) => p.kind === 'wood').map((p) => plain(p.geo));
    const leafGeos = parts.filter((p) => p.kind === 'leaf').map((p) => plain(p.geo));
    return {
      wood: mergeGeometries(woodGeos, false),
      leaf: mergeGeometries(leafGeos, false),
    };
  });
}

/**
 * 树：按位置清单实例化。每棵树带随机朝向和缩放，颜色从三档绿里挑。
 * @param places [{x,z,s,tier}] tier 0/1/2/3
 */
export function createTrees(shared, places) {
  const group = new THREE.Group();
  const geos = treeGeometries(shared);
  const mats = {
    wood: paintMaterial(shared, { lit: [0.4, 0.28, 0.18], shade: [0.2, 0.15, 0.12], kind: 'wood', rows: 6 }),
    leafA: paintMaterial(shared, { lit: [0.2, 0.5, 0.16], shade: [0.06, 0.2, 0.12], kind: 'flat' }),
    leafB: paintMaterial(shared, { lit: [0.3, 0.58, 0.2], shade: [0.1, 0.26, 0.14], kind: 'flat' }),
    leafC: paintMaterial(shared, { lit: [0.14, 0.4, 0.2], shade: [0.05, 0.16, 0.13], kind: 'flat' }),
  };
  const ink = outlineMaterial(shared, [0.04, 0.05, 0.1], 0.055);
  const byTier = [[], [], [], []];
  for (const p of places) byTier[p.tier ?? 0].push(p);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  byTier.forEach((list, tier) => {
    if (!list.length) return;
    const geo = geos[tier];
    const wood = new THREE.InstancedMesh(geo.wood, mats.wood, list.length);
    const leafMats = [mats.leafA, mats.leafB, mats.leafC];
    // 三档绿分开摆，靠一点偏移避免重叠
    const leaves = leafMats.map(() => []);
    list.forEach((p, i) => {
      const s = p.s ?? 1;
      q.setFromAxisAngle(up, (p.x * 12.9898 + p.z * 78.233) % (Math.PI * 2));
      m4.compose(new THREE.Vector3(p.x, p.y ?? heightAt(p.x, p.z), p.z), q, new THREE.Vector3(s, s, s));
      wood.setMatrixAt(i, m4);
      leaves[Math.floor(Math.abs(p.x * 7.13 + p.z * 3.7)) % 3].push({ p, s, m: m4.clone() });
    });
    wood.instanceMatrix.needsUpdate = true;
    wood.frustumCulled = true;
    group.add(wood);
    leaves.forEach((arr, li) => {
      if (!arr.length) return;
      const mesh = new THREE.InstancedMesh(geo.leaf, leafMats[li], arr.length);
      arr.forEach((item, i) => mesh.setMatrixAt(i, item.m));
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    });
    // 描边只给近处的大树做（tier 0/1），灌木和松省掉
    if (tier <= 1) {
      const inkMesh = new THREE.InstancedMesh(geo.leaf, ink, list.length);
      list.forEach((p, i) => {
        const s = (p.s ?? 1) * 1.02;
        q.setFromAxisAngle(up, (p.x * 12.9898 + p.z * 78.233) % (Math.PI * 2));
        m4.compose(new THREE.Vector3(p.x, p.y ?? heightAt(p.x, p.z), p.z), q, new THREE.Vector3(s, s, s));
        inkMesh.setMatrixAt(i, m4);
      });
      inkMesh.instanceMatrix.needsUpdate = true;
      inkMesh.renderOrder = -1;
      group.add(inkMesh);
    }
  });
  group.userData.count = places.length;
  return group;
}

// ---- 农田 ------------------------------------------------------------------------------------------------------
/** 田垄：一行行的作物，按地块铺。给一片片矩形，随机作物颜色。 */
export function createCrops(shared, plots) {
  const group = new THREE.Group();
  const geos = [];
  const hash = (i) => {
    const v = Math.sin(i * 127.1) * 43758.5453;
    return v - Math.floor(v);
  };
  const colors = [
    [0.42, 0.62, 0.18],
    [0.62, 0.6, 0.22],
    [0.28, 0.5, 0.24],
    [0.68, 0.46, 0.2],
  ];
  const buckets = colors.map(() => []);
  plots.forEach((plot, pi) => {
    const { x, z, w, d, rotY = 0 } = plot;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const rows = Math.max(2, Math.round(d / 0.9));
    const cols = Math.max(2, Math.round(w / 0.55));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lx = -w / 2 + (c + 0.5) * (w / cols);
        const lz = -d / 2 + (r + 0.5) * (d / rows);
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        const h = heightAt(wx, wz);
        const s = 0.55 + hash(pi * 31 + r * 7 + c) * 0.45;
        const g = new THREE.IcosahedronGeometry(0.17 * s, 0);
        g.scale(1, 1.25, 1);
        g.translate(wx, h + 0.2 * s, wz);
        buckets[Math.floor(hash(pi * 13 + 5) * 4)].push(g);
      }
    }
  });
  geos.length = 0;
  buckets.forEach((arr, i) => {
    if (!arr.length) return;
    const geo = mergeGeometries(arr.map(plain), false);
    arr.forEach((g) => g.dispose());
    const lit = colors[i];
    const mat = paintMaterial(shared, { lit, shade: lit.map((c) => c * 0.6), kind: 'flat' });
    group.add(new THREE.Mesh(geo, mat));
  });
  return group;
}

// ---- 石头 ------------------------------------------------------------------------------------------------------
export function createRocks(shared, places) {
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = paintMaterial(shared, { lit: [0.5, 0.5, 0.5], shade: [0.24, 0.26, 0.3], kind: 'stone' });
  const mesh = new THREE.InstancedMesh(geo, mat, places.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  places.forEach((p, i) => {
    q.setFromAxisAngle(up, p.r ?? 0);
    m4.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z) + 0.15 * (p.s ?? 1), p.z), q, new THREE.Vector3((p.s ?? 1) * 1.3, (p.s ?? 1) * 0.8, (p.s ?? 1)));
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return group;
}

// ---- 花：野外的花丛 --------------------------------------------------------------------------------------------
export function createFlowerClumps(shared, places) {
  const group = new THREE.Group();
  const palettes = [
    [0.95, 0.9, 0.35],
    [0.95, 0.55, 0.6],
    [0.8, 0.6, 0.95],
    [0.98, 0.96, 0.9],
    [0.98, 0.66, 0.3],
  ];
  const stems = [];
  const heads = palettes.map(() => []);
  const hash = (i) => {
    const v = Math.sin(i * 91.7) * 43758.5453;
    return v - Math.floor(v);
  };
  places.forEach((p, i) => {
    const n = 5 + Math.floor(hash(i) * 7);
    for (let k = 0; k < n; k++) {
      const a = hash(i * 17 + k) * Math.PI * 2;
      const r = hash(i * 29 + k * 3) * (p.r ?? 3);
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const h = heightAt(x, z);
      const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.32, 3);
      stem.translate(x, h + 0.16, z);
      stems.push(stem);
      const head = new THREE.IcosahedronGeometry(0.075, 0);
      head.translate(x, h + 0.34, z);
      heads[Math.floor(hash(i * 7 + k) * palettes.length)].push(head);
    }
  });
  if (stems.length) {
    const geo = mergeGeometries(stems.map(plain), false);
    stems.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(geo, paintMaterial(shared, { lit: [0.3, 0.54, 0.22], shade: [0.12, 0.26, 0.14], kind: 'flat' })));
  }
  heads.forEach((arr, i) => {
    if (!arr.length) return;
    const geo = mergeGeometries(arr.map(plain), false);
    arr.forEach((g) => g.dispose());
    const lit = palettes[i];
    group.add(new THREE.Mesh(geo, paintMaterial(shared, { lit, shade: lit.map((c) => c * 0.66), kind: 'flat' })));
  });
  return group;
}

// ---- 鸽子 ------------------------------------------------------------------------------------------------------
/** 广场上的鸽子：会蹦、会换方向、玩家靠近会散开。 */
export function createPigeons(shared, count, centre) {
  const group = new THREE.Group();
  const bodyGeo = new THREE.IcosahedronGeometry(0.14, 0);
  bodyGeo.scale(1.35, 1.0, 1);
  const headGeo = new THREE.IcosahedronGeometry(0.075, 0);
  const tailGeo = new THREE.ConeGeometry(0.07, 0.22, 4);
  tailGeo.rotateX(Math.PI / 2);
  const bodyMat = paintMaterial(shared, { lit: [0.82, 0.84, 0.88], shade: [0.42, 0.46, 0.56], kind: 'flat' });
  const headMat = paintMaterial(shared, { lit: [0.56, 0.66, 0.8], shade: [0.28, 0.34, 0.46], kind: 'flat' });
  const beakMat = paintMaterial(shared, { lit: [0.9, 0.6, 0.2], shade: [0.5, 0.3, 0.1], kind: 'flat' });
  const birds = [];
  const rnd = (i, s) => {
    const v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < count; i++) {
    const a = rnd(i, 1) * Math.PI * 2;
    const r = 3 + rnd(i, 2) * 16;
    const x = centre[0] + Math.cos(a) * r;
    const z = centre[1] + Math.sin(a) * r;
    const b = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.14;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0.16, 0.26, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 4), beakMat);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.24, 0.26, 0);
    const tail = new THREE.Mesh(tailGeo, headMat);
    tail.position.set(-0.19, 0.16, 0);
    b.add(body, head, beak, tail);
    b.position.set(x, heightAt(x, z), z);
    b.rotation.y = rnd(i, 3) * Math.PI * 2;
    group.add(b);
    birds.push({ obj: b, home: [x, z], dir: rnd(i, 4) * Math.PI * 2, phase: rnd(i, 5) * 6.28, speed: 0, fly: 0 });
  }
  group.userData.update = (dt, playerPos) => {
    for (const b of birds) {
      b.phase += dt;
      const dx = b.obj.position.x - playerPos[0];
      const dz = b.obj.position.z - playerPos[1];
      const near = Math.hypot(dx, dz);
      if (near < 7) {
        // 被吓飞：往外跳一下
        b.fly = Math.min(1, b.fly + dt * 3);
        b.dir = Math.atan2(dz, dx) + Math.sin(b.phase * 9) * 0.3;
        b.speed = 3.4;
      } else {
        b.fly = Math.max(0, b.fly - dt * 0.8);
        if (Math.sin(b.phase * 0.7 + b.home[0]) > 0.985) b.dir += (Math.sin(b.phase * 13) > 0 ? 1 : -1) * 1.8;
        b.speed = Math.sin(b.phase * 2.1) > 0.3 ? 1.1 : 0;
      }
      b.obj.position.x += Math.cos(b.dir) * b.speed * dt;
      b.obj.position.z += Math.sin(b.dir) * b.speed * dt;
      // 离家太远就慢慢晃回去
      const hx = b.home[0] - b.obj.position.x;
      const hz = b.home[1] - b.obj.position.z;
      if (Math.hypot(hx, hz) > 26) b.dir = Math.atan2(hz, hx);
      const ground = heightAt(b.obj.position.x, b.obj.position.z);
      b.obj.position.y += (ground - b.obj.position.y) * Math.min(1, dt * 10);
      // 蹦和扇翅：贴着地走是蹦，被吓是飞起来
      const hop = b.fly > 0.05 ? b.fly * 1.4 + Math.abs(Math.sin(b.phase * 16)) * 0.35 : Math.abs(Math.sin(b.phase * 8)) * 0.09 * (b.speed > 0 ? 1 : 0);
      b.obj.position.y += hop;
      if (b.speed > 0) b.obj.rotation.y = -b.dir + Math.PI / 2;
      b.obj.rotation.z = Math.sin(b.phase * 14) * 0.2 * b.fly;
    }
  };
  group.userData.birds = birds;
  return group;
}

// ---- 小动物：兔子／猫 ------------------------------------------------------------------------------------------
export function createCritters(shared, places) {
  const group = new THREE.Group();
  const bodyGeo = new THREE.IcosahedronGeometry(0.22, 0);
  bodyGeo.scale(1.5, 1, 1);
  const earGeo = new THREE.ConeGeometry(0.05, 0.26, 4);
  const furMat = paintMaterial(shared, { lit: [0.94, 0.92, 0.88], shade: [0.6, 0.62, 0.68], kind: 'flat' });
  const catMat = paintMaterial(shared, { lit: [0.86, 0.62, 0.34], shade: [0.44, 0.3, 0.18], kind: 'flat' });
  const critters = [];
  places.forEach((p, i) => {
    const g = new THREE.Group();
    const cat = p.kind === 'cat';
    const body = new THREE.Mesh(bodyGeo, cat ? catMat : furMat);
    body.position.y = 0.22;
    g.add(body);
    if (!cat) {
      for (const dz of [-0.08, 0.08]) {
        const ear = new THREE.Mesh(earGeo, furMat);
        ear.position.set(0.24, 0.44, dz);
        ear.rotation.z = -0.2;
        g.add(ear);
      }
    } else {
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.4, 4), catMat);
      tail.position.set(-0.32, 0.3, 0);
      tail.rotation.z = 0.9;
      g.add(tail);
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), catMat);
      head.position.set(0.26, 0.3, 0);
      g.add(head);
    }
    g.position.set(p.x, heightAt(p.x, p.z), p.z);
    group.add(g);
    critters.push({ obj: g, home: [p.x, p.z], dir: i * 1.7, phase: i * 2.1, speed: 0 });
  });
  group.userData.update = (dt, playerPos) => {
    for (const c of critters) {
      c.phase += dt;
      const dx = c.obj.position.x - playerPos[0];
      const dz = c.obj.position.z - playerPos[1];
      const d = Math.hypot(dx, dz);
      const scared = d < 9;
      if (scared) {
        c.dir = Math.atan2(dz, dx);
        c.speed = 3.2;
      } else {
        c.speed = Math.sin(c.phase * 1.7) > 0.55 ? 1.4 : 0;
        if (Math.sin(c.phase * 0.5 + c.home[0]) > 0.99) c.dir += 1.4;
        const hx = c.home[0] - c.obj.position.x;
        const hz = c.home[1] - c.obj.position.z;
        if (Math.hypot(hx, hz) > 30) c.dir = Math.atan2(hz, hx);
      }
      c.obj.position.x += Math.cos(c.dir) * c.speed * dt;
      c.obj.position.z += Math.sin(c.dir) * c.speed * dt;
      const ground = heightAt(c.obj.position.x, c.obj.position.z);
      c.obj.position.y += (ground - c.obj.position.y) * Math.min(1, dt * 12) + Math.abs(Math.sin(c.phase * 9)) * 0.1 * (c.speed > 0 ? 1 : 0);
      c.obj.rotation.y = -c.dir + Math.PI / 2;
    }
  };
  return group;
}

// ---- 路面 / 广场 -----------------------------------------------------------------------------------------------
/**
 * 石板街：每段沿长度每 3 m、横向 4 格细分，贴着地形走；每个端点补一个圆盘，拐角不露缝。
 * uv：x 是横向 0~1（边缘给 shader 做毛边），y 是世界坐标的米（石板不拉伸）。
 */
export function roadGeometry(segs, width = 8) {
  const pos = [];
  const uv = [];
  const idx = [];
  const hw = width / 2;
  const LIFT = 0.07;
  const ACROSS = 4;
  for (const s of segs) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    const rows = Math.max(1, Math.ceil(len / 3));
    const base = pos.length / 3;
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      for (let i = 0; i <= ACROSS; i++) {
        const a = (i / ACROSS) * 2 - 1;
        const x = s.ax + dx * t + nx * hw * a;
        const z = s.az + dz * t + nz * hw * a;
        pos.push(x, heightAt(x, z) + LIFT, z);
        uv.push(i / ACROSS, 0);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < ACROSS; i++) {
        const a = base + j * (ACROSS + 1) + i;
        const b2 = a + 1;
        const c = a + ACROSS + 1;
        const d = c + 1;
        idx.push(a, b2, c, b2, d, c);
      }
    }
    // 端点的圆盘
    for (const [cx, cz] of [[s.ax, s.az], [s.bx, s.bz]]) {
      const c0 = pos.length / 3;
      pos.push(cx, heightAt(cx, cz) + LIFT + 0.01, cz);
      uv.push(0.5, 0);
      const N = 14;
      for (let k = 0; k <= N; k++) {
        const a = (k / N) * Math.PI * 2;
        const x = cx + Math.cos(a) * hw;
        const z = cz + Math.sin(a) * hw;
        pos.push(x, heightAt(x, z) + LIFT + 0.01, z);
        uv.push(0, 0);
      }
      for (let k = 0; k < N; k++) idx.push(c0, c0 + 2 + k, c0 + 1 + k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** 广场：一块贴着地形的圆石板地。uv.x 在边缘是 0，往里是 1（给毛边用）。 */
export function plazaGeometry(centre, radius) {
  const pos = [];
  const uv = [];
  const idx = [];
  const RINGS = 12;
  const N = 64;
  pos.push(centre[0], heightAt(centre[0], centre[1]) + 0.08, centre[1]);
  uv.push(0.5, 0);
  for (let r = 1; r <= RINGS; r++) {
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const x = centre[0] + Math.cos(a) * radius * (r / RINGS);
      const z = centre[1] + Math.sin(a) * radius * (r / RINGS);
      pos.push(x, heightAt(x, z) + 0.08, z);
      uv.push(r === RINGS ? 0 : 0.5, 0);
    }
  }
  for (let k = 0; k < N; k++) idx.push(0, 1 + ((k + 1) % N), 1 + k);
  for (let r = 1; r < RINGS; r++) {
    for (let k = 0; k < N; k++) {
      const a = 1 + (r - 1) * N + k;
      const b2 = 1 + (r - 1) * N + ((k + 1) % N);
      const c = a + N;
      const d = b2 + N;
      idx.push(a, b2, c, b2, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// 石板路的画法：不规则的石板（Voronoi 格），每块颜色略有不同，缝是深的；
// 边缘按噪声咬掉，草从缝里和边上长进来——不是一条刀切的灰带。
const cobbleFragment = /* glsl */ `
${COMMON}
in vec3 vWorld;
in vec3 vN;
in vec2 vUv;
uniform float uPlaza;
layout(location = 0) out vec4 outC;
void main() {
  vec2 xz = vWorld.xz;
  // 毛边
  float edge = min(vUv.x, 1.0 - vUv.x) * 2.0;
  float n = texture(tNoise, xz / 2.9).r * 0.6 + texture(tNoise, xz / 0.83).g * 0.4;
  if (edge < 0.3 * n + 0.02) discard;
  // 石板：两层 Voronoi，大的是石板，小的是板面上的斑
  vec2 q = xz / mix(0.52, 0.66, uPlaza);
  vec2 ip = floor(q);
  vec2 fp = fract(q);
  float d1 = 9.0;
  float d2 = 9.0;
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec4 r = cellRand(ip + g, 5.0);
      float d = length(g + 0.15 + 0.7 * r.xy - fp);
      if (d < d1) { d2 = d1; d1 = d; id = ip + g; }
      else if (d < d2) d2 = d;
    }
  }
  vec4 r = cellRand(id, 9.0);
  float gap = smoothstep(0.04, 0.14, d2 - d1);
  // 颜色：暖米、灰、偶尔一块偏红偏青
  vec3 stone = mix(vec3(0.6, 0.56, 0.48), vec3(0.5, 0.5, 0.5), r.x);
  stone = mix(stone, vec3(0.62, 0.48, 0.4), step(0.86, r.y) * 0.7);
  stone = mix(stone, vec3(0.44, 0.5, 0.52), step(0.9, r.z) * 0.7);
  stone *= 0.86 + 0.24 * r.w;
  stone *= 0.92 + 0.16 * texture(tNoise, xz / 0.31).b;
  // 缝里是土，靠边的缝里长了草
  vec3 seam = mix(vec3(0.24, 0.2, 0.15), vec3(0.16, 0.3, 0.1), smoothstep(0.75, 0.3, edge) * 0.7 + 0.2 * n);
  vec3 albedo = mix(seam, stone, gap);
  float shade = cloudAt(xz);
  vec3 sun = uSunColor * 0.4 * max(dot(normalize(vN), uSunDir), 0.0) * 1.25;
  vec3 light = mix(uSkyColor * 0.95 + 0.04, sun + uSkyColor * 0.5, smoothstep(0.2, 0.9, shade));
  outC = vec4(applyFog(albedo * light, vWorld), 1.0);
}
`;

/**
 * 贴图版路面：直接复用 paint.js 的 cel 材质 + 三平面贴图。
 * 用于 ?roadtex=1 时替换掉程序化的卵石（program 版本见 roadMaterial）。
 * @param albedo getAlbedo('road1') 之类
 */
export function roadMaterialTextured(shared, albedo, { scale = 0.14, lit = [0.66, 0.64, 0.6], shade = [0.32, 0.33, 0.38] } = {}) {
  const a = albedo ? { ...albedo, scale } : null;
  return paintMaterial(shared, { lit, shade, kind: 'stone', rows: 6, albedo: a });
}

export function roadMaterial(shared, plaza = 0) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: /* glsl */ `
      out vec3 vWorld;
      out vec3 vN;
      out vec2 vUv;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: cobbleFragment,
    uniforms: { ...shared, uPlaza: { value: plaza } },
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
}
