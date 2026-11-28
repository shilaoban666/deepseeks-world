// 房屋套件：Blender 里建的那二十几种吉卜力风的房子（public/models4，tools/ghibli4），在城里实例化成几千栋。
// 模型里每个面记着它是哪种部件（墙 / 瓦 / 木 / 石 / 玻璃 / 点缀色 / 植物 / 原色 / 布），顶点色是颜料的深浅和檐下的影子；
// 这里按每一栋自己的墙色、瓦色、点缀色来调，瓦的行、木纹、砖缝按表面上的米数画出来，再吃这座城的光。
// 轮廓线不另外画壳：近处每种部件往画面的 alpha 里写一个不同的小数，收尾那一遍（frame.js）在两种部件相接的地方自己描线；
// 远了都写成同一个数，就只剩颜色，不会描成一团黑。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { COMMON } from '../lib/index.js';

const vertex = /* glsl */ `
in vec4 aPaint;
in vec2 aAux;
in vec3 aWall;
in vec3 aRoof;
in vec4 aAccent;
out vec3 vWorld;
out vec3 vN;
out vec2 vUv;
out vec3 vPaint;
out vec3 vWall;
out vec3 vRoof;
out vec4 vAccent;
flat out float vPart;
flat out float vWin;
void main() {
  vUv = uv;
  vPaint = aPaint.rgb;
  vPart = floor(aAux.x * 255.0 / 16.0 + 0.5);
  vWin = aAux.y;
  vWall = aWall;
  vRoof = aRoof;
  vAccent = aAccent;
  mat4 mm = modelMatrix * instanceMatrix;
  vec4 w = mm * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(mm) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragment = /* glsl */ `
${COMMON}
uniform float uNight;
in vec3 vWorld;
in vec3 vN;
in vec2 vUv;
in vec3 vPaint;
in vec3 vWall;
in vec3 vRoof;
in vec4 vAccent;
flat in float vPart;
flat in float vWin;
layout(location = 0) out vec4 outC;

void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float seed = vAccent.a;
  float dist = distance(vWorld, uCamPos);
  // 一个像素有多少米：比它细的花纹不画（远处的瓦不会闪）
  float px = max(fwidth(vUv.x), fwidth(vUv.y));
  float dabs = texture(tStrokes, vUv / 6.0 + seed * 3.7).r - 0.5;
  float wash = texture(tNoise, vUv * vec2(0.13, 0.19) + seed * 5.0).r - 0.5;
  vec3 paint = vPaint;
  float glow = 0.0;
  float soft = 0.0;
  float lampOn = 0.0;
  if (vPart < 0.5) {
    // 墙：刷得不匀的灰泥
    paint *= vWall * (1.0 + dabs * 0.14 + wash * 0.14);
  } else if (vPart < 1.5) {
    // 瓦：一行一行，每片深浅略不同，上一行压着下一行
    float rows = 3.1;
    float fine = 1.0 - smoothstep(0.2, 0.5, px * rows);
    float cy = vUv.y * rows;
    float course = floor(cy);
    float tile = hash12(vec2(floor(vUv.x * 2.7 + mod(course, 2.0) * 0.5), course) + seed * 91.0);
    paint *= vRoof * mix(1.0, (0.78 + 0.44 * tile) * (0.76 + 0.24 * smoothstep(0.0, 0.3, fract(cy))), fine);
    paint *= 1.0 + dabs * 0.18 + wash * 0.3;
    // 老瓦上的苔
    paint = mix(paint, vec3(0.2, 0.26, 0.1), smoothstep(0.16, 0.34, wash) * 0.3 * step(dot(vRoof, vec3(0.333)), 0.6));
  } else if (vPart < 2.5) {
    // 木：顺着长的方向有纹
    float grain = texture(tNoise, vUv * vec2(0.7, 7.0) + seed).g + texture(tNoise, vUv.yx * vec2(0.7, 7.0) + seed).g;
    paint *= 0.86 + 0.16 * grain + dabs * 0.2;
  } else if (vPart < 3.5) {
    // 石：一块块砌的，每块一个调子
    vec2 g = vUv / vec2(0.62, 0.3);
    g.x += mod(floor(g.y), 2.0) * 0.5;
    float fine = 1.0 - smoothstep(0.05, 0.14, px);
    float tone = hash12(floor(g) + seed * 17.0);
    vec2 e = abs(fract(g) - 0.5);
    float joint = smoothstep(0.42, 0.48, max(e.x, e.y * 0.94));
    paint *= mix(1.0, (0.84 + 0.3 * tone) * (1.0 - 0.3 * joint), fine) * (1.0 + dabs * 0.16);
  } else if (vPart < 4.5) {
    // 玻璃：映着天，上半亮一点；夜里一多半的窗亮着灯
    paint = mix(vec3(0.07, 0.1, 0.17), vec3(0.3, 0.44, 0.6), smoothstep(-0.2, 0.8, fract(vUv.y * 0.8))) * vPaint;
    glow = step(0.42, fract(vWin * 7.31 + seed * 3.17));
  } else if (vPart > 8.5) {
    // 灯：白天是一块暖色的玻璃，夜里自己亮
    lampOn = 1.0;
  } else if (vPart < 5.5 || vPart > 7.5) {
    // 点缀色：门、百叶、雨棚、招牌、暖帘
    paint *= vAccent.rgb * (1.0 + dabs * 0.12);
    if (vPart < 5.5) paint *= 0.9 + 0.2 * step(0.5, fract(vUv.y * 5.0));
  } else if (vPart < 6.5) {
    soft = 1.0;
    paint *= 1.0 + dabs * 0.3;
  }
  // 两阶：在光里，或者不在；叶子的转折软一点。用 skyOpenAt（云影+树影）免得建筑底面投影误伤自己向阳面
  float ndl = dot(N, uSunDir);
  float lit = mix(smoothstep(-0.02, 0.12, ndl + 0.1), smoothstep(-0.6, 0.7, ndl), soft) * smoothstep(0.35, 0.75, skyOpenAt(vWorld.xz));
  vec3 sun = uSunColor * 0.42 + uSkyColor * 0.32;
  float grey = dot(uSkyColor, vec3(0.333));
  vec3 sky = mix(uSkyColor, vec3(grey), 0.72) * 1.1 + 0.16;
  // 背光那一面是调出来的蓝紫，不是压灰；瓦在背光里留着它的红
  vec3 shade = paint * mix(vec3(0.72, 0.76, 0.92), vec3(0.86, 0.74, 0.8), step(0.5, vPart) * step(vPart, 1.5));
  vec3 col = mix(shade * sky, paint * sun, lit);
  // 墙根接触暗部：贴近地面 1.4 m 内自然沉一点蓝紫调，让房子与街道咬合落地
  float hag = vWorld.y - groundAt(vWorld.xz);
  float footAO = (1.0 - smoothstep(-0.1, 1.45, hag)) * (1.0 - smoothstep(0.65, 0.95, abs(N.y)));
  col = mix(col, col * vec3(0.78, 0.8, 0.88), footAO * 0.42);
  // 天气：雨后深一点；霜和雪落在朝上的面上
  col = mix(col, col * vec3(0.76, 0.8, 0.86), uWetness * 0.35);
  float up = smoothstep(0.3, 0.8, N.y);
  vec3 snow = mix(vec3(0.6, 0.68, 0.82) * (uSkyColor * 1.3 + 0.18), vec3(0.97, 0.97, 1.0) * (uSunColor * 0.4 + uSkyColor * 0.36), lit);
  col = mix(col, snow, uFrost * up * 0.9);
  col = mix(col, vec3(3.2, 2.2, 0.95) * (0.8 + 0.4 * fract(vWin * 3.7)), glow * uNight);
  col = mix(col, vPaint * mix(0.9, 3.4, uNight), lampOn);
  // 近处（<58m）：每种部件一个稳定 alpha，配合 frame.js 部件+深度描线；远处收拢到 0.4 干净退场，避免过渡带闪烁
  float a = mix(0.21 - vPart * 0.02, 0.4, smoothstep(56.0, 68.0, dist));
  outC = vec4(applyFog(col, vWorld), a);
}
`;

/** 清单（每种房子的类别、风格、占地）。摆房子之前就要有；模型本身可以晚点再载。 */
export async function loadKitManifest(base = './models4/') {
  const res = await fetch(`${base}kit.json`);
  if (!res.ok) throw new Error('kit.json 缺失');
  const manifest = await res.json();
  for (const it of manifest.items) it.pack = 'kit.glb';
  // 模型库转过来的那一包（tools/ghibli4/import_lib.py）：街具、农具、车船、鸟和鱼，还有一批房子和店；没有就算了
  try {
    const more = await fetch(`${base}lib.json`);
    if (more.ok) for (const it of (await more.json()).items) manifest.items.push({ pack: 'lib.glb', ...it });
  } catch (e) {
    console.warn('lib.json 读不到：只用套件', e);
  }
  const byId = new Map(manifest.items.map((it) => [it.id, it]));
  const packs = [...new Set(manifest.items.map((it) => it.pack))];
  return {
    base,
    packs,
    items: manifest.items,
    byId,
    /** 挑一栋：自己建的套件为主，库里转过来的房子掺三成 */
    choose(random, shape, style) {
      const list = this.variants(shape, style);
      const lib = list.filter((it) => it.lib);
      const own = list.filter((it) => !it.lib);
      const from = lib.length && own.length ? (random() < 0.3 ? lib : own) : list;
      return from[Math.floor(random() * from.length)];
    },
    /** 这种类别、这种风格的房子有哪些；没有就退到欧式的同类，再没有就随便一种 */
    variants(shape, style) {
      const houses = manifest.items.filter((it) => it.style !== 'prop' && it.style !== 'lm' && it.style !== 'lib');
      const of = (st) => houses.filter((it) => it.shape === shape && it.style === st);
      let list = of(style);
      if (!list.length && style === 'farm') list = of('euro');
      if (!list.length) list = houses.filter((it) => it.shape === shape && it.style !== 'jp');
      if (!list.length) list = houses.filter((it) => it.style === style);
      return list.length ? list : houses;
    },
  };
}

/**
 * 把房子画出来。
 * @param houses [{ kit, x, z, turn, scale, wall, roof, accent, seed }]（kit 是清单里的 id）
 * @returns Group（每 400 m 一格、每种房子一个 InstancedMesh），userData.stats 是数量
 */
export async function createKitHouses(shared, kit, houses, heightAt, { cell = 400 } = {}) {
  const loader = new GLTFLoader();
  const need = new Set(houses.map((h) => kit.byId.get(h.kit)?.pack ?? 'kit.glb'));
  const gltfs = await Promise.all((kit.packs ?? ['kit.glb']).filter((f) => need.has(f)).map((f) => loader.loadAsync(`${kit.base}${f}`)));
  const source = new Map();
  for (const gltf of gltfs) gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', g.attributes.position);
    geo.setAttribute('normal', g.attributes.normal);
    geo.setAttribute('uv', g.attributes.uv);
    geo.setAttribute('aPaint', g.attributes.color);
    geo.setAttribute('aAux', g.attributes.uv1);
    if (g.index) geo.setIndex(g.index);
    geo.boundingBox = g.boundingBox;
    geo.boundingSphere = g.boundingSphere;
    source.set(o.name, geo);
  });
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { ...shared, uNight: shared.uNight ?? { value: 0 } },
    side: THREE.DoubleSide,
  });
  const buckets = new Map();
  for (const h of houses) {
    if (!source.has(h.kit)) continue;
    const key = `${h.kit}|${Math.floor(h.x / cell)},${Math.floor(h.z / cell)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(h);
  }
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  let tris = 0;
  for (const [key, list] of buckets) {
    const src = source.get(key.split('|')[0]);
    const geo = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(src.attributes)) geo.setAttribute(name, attr);
    if (src.index) geo.setIndex(src.index);
    const wall = new Float32Array(list.length * 3);
    const roof = new Float32Array(list.length * 3);
    const accent = new Float32Array(list.length * 4);
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((h, i) => {
      q.setFromAxisAngle(up, h.turn);
      if (Array.isArray(h.scale)) s.set(h.scale[0], h.scale[1], h.scale[2]);
      else s.setScalar(h.scale);
      m.compose(p.set(h.x, h.y ?? heightAt(h.x, h.z), h.z), q, s);
      mesh.setMatrixAt(i, m);
      h.slot = { mesh, i };
      wall.set(h.wall, i * 3);
      roof.set(h.roof, i * 3);
      accent.set([...h.accent, h.seed], i * 4);
    });
    geo.setAttribute('aWall', new THREE.InstancedBufferAttribute(wall, 3));
    geo.setAttribute('aRoof', new THREE.InstancedBufferAttribute(roof, 3));
    geo.setAttribute('aAccent', new THREE.InstancedBufferAttribute(accent, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    tris += ((src.index ? src.index.count : src.attributes.position.count) / 3) * list.length;
  }
  // ---- 会动的那几件（骑走的车、划走的船）：改它那一个实例的矩阵 ----
  const place = (h, x, y, z, turn) => {
    const { mesh, i } = h.slot;
    q.setFromAxisAngle(up, turn);
    if (Array.isArray(h.scale)) s.set(h.scale[0], h.scale[1], h.scale[2]);
    else s.setScalar(h.scale ?? 1);
    m.compose(p.set(x, y, z), q, s);
    mesh.setMatrixAt(i, m);
    mesh.instanceMatrix.needsUpdate = true;
    // （它可能走出自己那一格很远：这一格不再按包围球裁）
    mesh.frustumCulled = false;
    Object.assign(h, { x, y, z, turn });
  };
  group.userData.rig = {
    move: (h, x, y, z, turn) => h?.slot && place(h, x, y, z, turn),
    /** 凭空要一件（租来的船）：单独一个实例，先放在看不见的地方 */
    spawn(id, accent = [0.2, 0.42, 0.56]) {
      const src = source.get(id);
      if (!src) return null;
      const geo = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(src.attributes)) geo.setAttribute(name, attr);
      if (src.index) geo.setIndex(src.index);
      geo.setAttribute('aWall', new THREE.InstancedBufferAttribute(new Float32Array([0.95, 0.93, 0.86]), 3));
      geo.setAttribute('aRoof', new THREE.InstancedBufferAttribute(new Float32Array([0.3, 0.33, 0.4]), 3));
      geo.setAttribute('aAccent', new THREE.InstancedBufferAttribute(new Float32Array([...accent, 0.5]), 4));
      const mesh = new THREE.InstancedMesh(geo, material, 1);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      const h = { kit: id, scale: 1, slot: { mesh, i: 0 } };
      place(h, 0, -999, 0, 0);
      return h;
    },
  };
  group.userData.stats = { houses: houses.length, meshes: group.children.length, tris };
  return group;
}
