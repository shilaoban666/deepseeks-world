// 植物/物件的立牌批渲染器。
//
// 图集里的每个精灵是一块小图；这里用一个 InstancedBufferGeometry 把成百上千块立牌一次画完。
// 关键设计（和本项目其它部分一致）：
//   · 立牌绕 Y 轴转，永远面向相机（圆柱 billboard），所以从任何方向看都是一张画
//   · 顶点着色器里按 uTime 加一点风摆（越高摆得越多），和草地的风是同一个节奏
//   · 片元里按 uSunColor/uSkyColor/uNight 染色，所以会跟着一天的光变
//   · 片元写 alpha = 0.16：让 frame.js 的 Kuwahara 跳过它们（保住手绘线条），
//     同时墨线检测会把它们和背景的差当成轮廓，自动描一圈——和主角用的是同一套机制
import * as THREE from 'three';
import { COMMON } from '../lib/index.js';

const vertex = /* glsl */ `
${COMMON}
in vec4 aRect;    // u0, v0, u1, v1（图集里的位置）
in vec3 aOffset;  // 世界坐标
in vec2 aScale;   // 宽、高（米）
in float aRot;    // 绕 Y 的随机角（只是为了让每株朝向略不同）
in float aPhase;  // 摆动相位
uniform float uSway;   // 0 = 不随风摆（车、摊上的货）

out vec2 vUv;
out vec3 vWorld;
out vec3 vN;
out float vSway;

void main() {
  // 单位面片：position.xy 在 -0.5..0.5
  vec2 c = position.xy;
  // 圆柱 billboard：右向量 = 世界 Y 与"到相机的方向"叉乘
  vec3 toCam = uCamPos - aOffset;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(vec3(toCam.x, 0.0, toCam.z) + vec3(1e-5, 0.0, 0.0))));
  // 先绕 Y 转一个随机角，让整丛看起来不是一张图复制很多次
  float cs = cos(aRot), sn = sin(aRot);
  vec2 cr = vec2(c.x * cs - 0.0 * sn, c.x * sn + 0.0 * cs);
  float sway = (sin(uTime * 1.6 + aPhase + aOffset.x * 0.15) * 0.06 + sin(uTime * 3.1 + aPhase * 1.7) * 0.03) * uSway;
  float h = c.y + 0.5;                       // 0 在根部，1 在顶部
  vec3 world = aOffset
    + right * (c.x * aScale.x + sway * h * aScale.x * 0.9)
    + vec3(0.0, 1.0, 0.0) * (h * aScale.y)
    + normalize(vec3(toCam.x, 0.0, toCam.z) + vec3(1e-5, 0.0, 0.0)) * sway * h * aScale.y * 0.25;

  vUv = mix(aRect.xy, aRect.zw, vec2(c.x + 0.5, c.y + 0.5));
  vWorld = world;
  vN = vec3(0.0, 1.0, 0.0);
  vSway = h;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const fragment = /* glsl */ `
${COMMON}
uniform sampler2D tAtlas;
uniform float uAlpha;
uniform float uCutoff;
uniform float uNight;
in vec2 vUv;
in vec3 vWorld;
in vec3 vN;
in float vSway;
layout(location = 0) out vec4 outC;

void main() {
  vec4 t = texture(tAtlas, vUv);
  if (t.a < uCutoff) discard;
  // 跟着一天的光：受光面用太阳色，整体再压一点天空色；夜里压暗
  float lit = 0.55 + 0.45 * clamp(dot(normalize(vN), uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  vec3 tint = uSunColor * (0.30 + 0.18 * lit) + uSkyColor * 0.34;
  tint = mix(tint, tint * vec3(0.42, 0.46, 0.62), uNight);
  vec3 col = t.rgb * tint * 1.9;
  // 少数几个像素的 alpha：让笔触收尾跳过、并且自动描墨线
  col = mix(col, vec3(0.84, 0.88, 0.94) * (uSunColor * 0.36 + uSkyColor * 0.5), uFrost * 0.55 * vSway);
  outC = vec4(applyFog(col, vWorld), uAlpha);
}
`;

const NO_ATLAS = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
NO_ATLAS.needsUpdate = true;

/**
 * 载入图集清单和贴图。
 * @param base 例如 './textures/plants/'
 * @returns { flower: [{texture, sprites}], tree: [...], critter: [...] }
 */
export async function loadPlantAtlases(base = './textures/plants/', { maxSize = 0, anisotropy = 4 } = {}) {
  const res = await fetch(`${base}plants.json`);
  if (!res.ok) throw new Error('plants.json 缺失');
  const groups = await res.json();
  const loader = new THREE.TextureLoader();
  const out = {};
  for (const [kind, pages] of Object.entries(groups)) {
    out[kind] = await Promise.all(
      pages.map(async (page) => {
        const texture = await new Promise((ok, no) => loader.load(base + page.atlas, ok, undefined, no));
        // 低配档：图集缩小了再送进显卡（2048² 带 mip 是 21 MB 一张，七张；缩到 1024² 是 5 MB 一张）。
        // 精灵的位置记的是 0~1 的 uv，所以缩了图也还对得上。
        const img = texture.image;
        if (maxSize > 0 && img && Math.max(img.width, img.height) > maxSize) {
          const k = maxSize / Math.max(img.width, img.height);
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k));
          c.height = Math.max(1, Math.round(img.height * k));
          // （willReadFrequently：让这张画布留在 CPU 上缩图，不去和正忙着编 shader 的显卡进程排队）
          const g = c.getContext('2d', { willReadFrequently: true });
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, 0, c.width, c.height);
          texture.image = c;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
        return { texture, sprites: page.sprites, page: page.atlas };
      }),
    );
  }
  return out;
}

/**
 * 把一批立牌画出来。
 * @param shared 场地的 uniforms
 * @param pages loadPlantAtlases() 里的一类（数组，每张图集一个）
 * @param places [{ x, z, y, h, sprite, sway }]，sprite 是图集里的序号（会自动分配页）
 */
export function createPlantBatch(shared, pages, places, { alpha = 0.16, scale = 1, sway = 1, cutoff = 0.5 } = {}) {
  const group = new THREE.Group();
  const rnd = (i, s) => {
    const v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  // 按页分组
  const byPage = new Map();
  places.forEach((p, i) => {
    const total = pages.reduce((n, pg) => n + pg.sprites.length, 0);
    const idx = p.sprite ?? Math.floor(rnd(i, 3) * total);
    // 找到这个序号落在哪一页
    let acc = 0;
    for (let k = 0; k < pages.length; k++) {
      const n = pages[k].sprites.length;
      if (idx < acc + n) {
        const sp = pages[k].sprites[idx - acc];
        if (!byPage.has(k)) byPage.set(k, []);
        byPage.get(k).push({ p, sp, i: i + k * 1000 });
        break;
      }
      acc += n;
    }
  });

  const quad = new THREE.PlaneGeometry(1, 1);

  for (const [pageIdx, list] of byPage) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;
    geo.instanceCount = list.length;

    const rect = new Float32Array(list.length * 4);
    const offset = new Float32Array(list.length * 3);
    const scaleArr = new Float32Array(list.length * 2);
    const rot = new Float32Array(list.length);
    const phase = new Float32Array(list.length);
    list.forEach((it, n) => {
      rect.set([it.sp.u0, it.sp.v0, it.sp.u1, it.sp.v1], n * 4);
      const h = (it.p.h ?? 0.5) * scale;
      offset.set([it.p.x, it.p.y ?? 0, it.p.z], n * 3);
      // 宽度按精灵长宽比算，别把花拉变形
      const w = (h * it.sp.w) / Math.max(1, it.sp.h);
      scaleArr.set([w, h], n * 2);
      rot[n] = rnd(it.i, 7) * Math.PI * 2;
      phase[n] = rnd(it.i, 11) * Math.PI * 2;
    });
    geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4));
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 3));
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scaleArr, 2));
    geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(rot, 1));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));

    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { ...shared, tAtlas: { value: pages[pageIdx].texture }, uAlpha: { value: alpha }, uSway: { value: sway }, uCutoff: { value: cutoff }, uNight: shared.uNight ?? { value: 0 } },
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  return group;
}