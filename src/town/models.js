// 精模：Blender 里重绘过的建筑（public/models3，tools/ghibli3/repaint.py 产出）搬进这座城。
// 模型自己带着颜色——贴图是烘好的手绘笔触，顶点色是檐下、墙根的影子和每片瓦的深浅——
// 这里只做一件事：让它吃这座城的光。画法和 paint.js 一样：两个调子（在光里 / 不在），中间一道干净的转折，
// 背光那一面不是压暗，是偏蓝的另一种颜色；外面一圈倒壳墨线；雾、雨、霜照常。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMMON } from '../lib/index.js';
import { outlineMaterial } from './paint.js';

const vertex = /* glsl */ `
out vec3 vWorld;
out vec3 vN;
out vec2 vUv;
out vec3 vCol;
void main() {
  vUv = uv;
  #ifdef USE_COLOR
  vCol = color.rgb;
  #else
  vCol = vec3(1.0);
  #endif
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragment = /* glsl */ `
${COMMON}
uniform sampler2D tPaint;
uniform float uMapOn;
uniform vec3 uBase;
uniform float uMode;   // 0 涂料，1 玻璃，2 灯
uniform float uNight;
in vec3 vWorld;
in vec3 vN;
in vec2 vUv;
in vec3 vCol;
layout(location = 0) out vec4 outC;

void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 base = (uMapOn > 0.5 ? texture(tPaint, vUv).rgb : uBase) * vCol;
  // 两阶：在光里，或者不在（和 paint.js 同一道转折、同一套光）
  float lit = smoothstep(-0.02, 0.12, dot(N, uSunDir) + 0.1);
  vec3 sun = uSunColor * 0.42 + uSkyColor * 0.32;
  float grey = dot(uSkyColor, vec3(0.333));
  vec3 sky = mix(uSkyColor, vec3(grey), 0.78) * 1.12 + 0.18;
  // 背光色是"调"出来的：偏蓝紫，饱和度留着，不是原色乘个灰
  vec3 shade = base * vec3(0.7, 0.74, 0.9);
  vec3 col = mix(shade * sky, base * sun, lit);
  if (uMode > 1.5) {
    col = base * mix(0.5 + 0.4 * grey, 3.2, uNight);
  } else if (uMode > 0.5) {
    // 玻璃：映着天；夜里屋里亮着灯
    col = mix(base * sky * 0.9, base * (uSkyColor * 2.2 + 0.25), 0.55);
    // （天光很蓝：窗玻璃收一点饱和度，不然一扇扇都是宝蓝色）
    col = mix(col, vec3(dot(col, vec3(0.333))), 0.4) * 0.82;
    col = mix(col, vec3(1.0, 0.78, 0.42) * 1.6, uNight * 0.85);
  }
  // 天气：雨后颜色深一点；霜和雪落在朝上的面上
  col = mix(col, col * vec3(0.76, 0.8, 0.86), uWetness * 0.35);
  float up = smoothstep(0.3, 0.8, N.y) * (0.82 + 0.18 * fract(sin(dot(floor(vWorld.xz * 1.7), vec2(12.9898, 78.233))) * 43758.5));
  vec3 snow = mix(vec3(0.6, 0.68, 0.82) * (uSkyColor * 1.3 + 0.18), vec3(0.97, 0.97, 1.0) * (uSunColor * 0.4 + uSkyColor * 0.36), lit);
  col = mix(col, snow, uFrost * up * 0.9);
  outC = vec4(applyFog(col, vWorld), 1.0);
}
`;

function modelMaterial(shared, source, srgbFix = false) {
  const name = source.name ?? '';
  const map = source.map ?? null;
  if (map) map.anisotropy = 4;
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      ...shared,
      tPaint: { value: map },
      uMapOn: { value: map ? 1 : 0 },
      // （老模型把 sRGB 的颜色当线性值存了，所以发白：srgbFix 把它按本来的意思读回来，再提一点饱和度）
      uBase: { value: srgbFix ? fixed(source.color) : (source.color?.clone() ?? new THREE.Color(1, 1, 1)) },
      uMode: { value: /glow/.test(name) ? 2 : /glass/.test(name) ? 1 : 0 },
      uNight: shared.uNight ?? { value: 0 },
    },
    vertexColors: true,
    side: THREE.DoubleSide,
  });
}

function fixed(c) {
  const out = (c?.clone() ?? new THREE.Color(1, 1, 1)).convertSRGBToLinear();
  const hsl = out.getHSL({});
  return out.setHSL(hsl.h, Math.min(1, hsl.s * 1.25), hsl.l);
}

/** 合并用：只留 position / normal / uv / color（rgb 浮点），别的属性丢掉，索引展开。 */
function plain(geometry, matrix) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const count = g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  out.setAttribute('uv', g.attributes.uv ?? new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  const colour = new Float32Array(count * 3).fill(1);
  const c = g.attributes.color;
  if (c) for (let i = 0; i < count; i++) colour.set([c.getX(i), c.getY(i), c.getZ(i)], i * 3);
  out.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  out.applyMatrix4(matrix);
  return out;
}

/**
 * 把一批精模摆进城里。
 * @param slots [{ glb, x, z, turn, width, depth }]：摆在哪、朝哪（turn：绕 Y，正面是模型的 +Z）、
 *   原来那栋房子占多宽多深（米）。模型缩到差不多宽，正面和原来那栋的正面对齐——门口的石阶、花盆、店招还在原处。
 * @returns 一个 Group：每种材质一个合并好的 mesh，加一层倒壳墨线
 */
export async function loadTownModels(shared, slots, heightAt, { base = './', ink = true, srgbFix = false } = {}) {
  const loader = new GLTFLoader();
  const cache = new Map();
  const load = (url) => {
    if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
    return cache.get(url);
  };
  const buckets = new Map(); // 材质名 → { source, geos }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let tris = 0;
  await Promise.all(
    slots.map(async (slot) => {
      const gltf = await load(base + slot.glb);
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      // （slot.scale：街具这类小件，按给的大小摆在原地）
      const s = slot.scale ?? Math.min(1.1, Math.max(0.82, (slot.width + 1.5) / size.x));
      // 往前挪到正面和原来那栋对齐
      const forward = slot.scale ? 0 : slot.depth / 2 - box.max.z * s;
      const x = slot.x + Math.sin(slot.turn) * forward;
      const z = slot.z + Math.cos(slot.turn) * forward;
      m.compose(new THREE.Vector3(x, heightAt(slot.x, slot.z) - 0.12, z), q.setFromAxisAngle(up, slot.turn), new THREE.Vector3(s, s, s));
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const key = o.material.name || o.material.uuid;
        if (!buckets.has(key)) buckets.set(key, { source: o.material, geos: [] });
        const g = plain(o.geometry, new THREE.Matrix4().multiplyMatrices(m, o.matrixWorld));
        tris += g.attributes.position.count / 3;
        buckets.get(key).geos.push(g);
      });
    }),
  );
  const group = new THREE.Group();
  const all = [];
  for (const { source, geos } of buckets.values()) {
    const geo = mergeGeometries(geos, false);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, modelMaterial(shared, source, srgbFix));
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    // 墨线：玻璃和灯不描（描了窗格就糊成一块黑）
    if (ink && !/glass|glow/.test(source.name ?? '')) all.push(geo);
  }
  if (all.length) {
    const shell = mergeGeometries(all.map((g) => new THREE.BufferGeometry().setAttribute('position', g.attributes.position).setAttribute('normal', g.attributes.normal)), false);
    shell.computeBoundingSphere();
    const ink = new THREE.Mesh(shell, outlineMaterial(shared, [0.05, 0.05, 0.1], 0.028));
    ink.matrixAutoUpdate = false;
    ink.userData.ink = true;
    group.add(ink);
  }
  group.userData.stats = { models: slots.length, tris, meshes: group.children.length };
  return group;
}
