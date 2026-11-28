// 吉卜力风载具与高铁精模载入器（public/vehicles/hsr_train.glb & vehicles.glb）。
// 用与城里建筑一致的双阶赛璐璐颜料着色 + 玻璃半透 + 夜间自发光车灯 + 倒壳暖墨线。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { COMMON } from '../lib/index.js';
import { outlineMaterial } from './paint.js';

const celVert = /* glsl */ `
out vec3 vWorld;
out vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const celFrag = /* glsl */ `
${COMMON}
uniform vec3 uLit;
uniform vec3 uShade;
uniform float uKind;   // 0 漆面/木, 1 玻璃, 2 发光车灯
uniform float uNight;
in vec3 vWorld;
in vec3 vN;
layout(location = 0) out vec4 outC;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float ndl = dot(N, uSunDir);
  float lit = smoothstep(-0.02, 0.14, ndl + 0.1);
  vec3 sun = uSunColor * 0.44 + uSkyColor * 0.34;
  float grey = dot(uSkyColor, vec3(0.333));
  vec3 sky = mix(uSkyColor, vec3(grey), 0.74) * 1.16 + 0.20;
  vec3 col = mix(uShade * sky, uLit * sun, lit);

  if (uKind > 1.5) {
    // 车灯与车厢顶灯：白天暖白，夜里明亮柔光
    col = uLit * mix(1.0, 2.8, uNight);
  } else if (uKind > 0.5) {
    // 车窗玻璃：映着天光，半透可见车厢内部座椅与人物
    vec3 skyRef = mix(uLit * sky * 0.85, uLit * (uSkyColor * 1.9 + 0.32), 0.55);
    col = mix(skyRef, vec3(1.0, 0.84, 0.52) * 1.3, uNight * 0.45);
  }
  // 实心部件写 alpha = 1.0：融入 frame.js 吉卜力手绘笔触（Kuwahara），且不与倒壳墨线冲突闪烁；
  // 玻璃写 alpha = 0.38（>= 0.23）：保持通透且不误触发角色屏幕空间墨线。
  outC = vec4(applyFog(col, vWorld), uKind > 0.5 && uKind < 1.5 ? 0.38 : 1.0);
}
`;

function makeCelMat(shared, sourceMat, accent = null) {
  const name = (sourceMat?.name ?? '').toLowerCase();
  const isGlass = /glass/.test(name);
  const isGlow = /glow/.test(name);
  const c = sourceMat?.color ? sourceMat.color.clone() : new THREE.Color(0.9, 0.88, 0.82);
  // 若传入载具涂装色，替换主车身漆面 (veh_body)
  if (accent && /veh_body/.test(name)) {
    c.setRGB(accent[0], accent[1], accent[2]);
  }
  const lit = [c.r, c.g, c.b];
  const shade = [c.r * 0.68, c.g * 0.72, Math.min(1, c.b * 0.86)];
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: celVert,
    fragmentShader: celFrag,
    uniforms: {
      ...shared,
      uLit: { value: new THREE.Color(...lit) },
      uShade: { value: new THREE.Color(...shade) },
      uKind: { value: isGlow ? 2 : isGlass ? 1 : 0 },
      uNight: shared.uNight ?? { value: 0 },
    },
    transparent: isGlass,
    depthWrite: !isGlass,
    side: isGlass ? THREE.DoubleSide : THREE.FrontSide,
  });
}

function buildStylizedGroup(template, shared, { accent = null, inkThick = 0.014 } = {}) {
  const root = template.clone(true);
  const inkMat = outlineMaterial(shared, [0.16, 0.12, 0.13], inkThick);
  inkMat.polygonOffset = true;
  inkMat.polygonOffsetFactor = 1.5;
  inkMat.polygonOffsetUnits = 1.5;
  const matCache = new Map();
  const getMat = (m) => {
    const key = m?.name || m?.uuid || 'def';
    if (!matCache.has(key)) matCache.set(key, makeCelMat(shared, m, accent));
    return matCache.get(key);
  };

  const toOutline = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    if (Array.isArray(o.material)) {
      o.material = o.material.map(getMat);
    } else {
      o.material = getMat(o.material);
    }
    // 玻璃与自发光不描黑壳；其余部件加一层细暖墨线（先收集，遍历后再挂载，避免递归）
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const hasSolid = mats.some((m) => m.uniforms?.uKind?.value === 0);
    if (hasSolid && inkThick > 0) toOutline.push(o);
  });
  for (const o of toOutline) {
    const ink = new THREE.Mesh(o.geometry, inkMat);
    ink.frustumCulled = false;
    ink.userData.ink = true;
    o.add(ink);
  }
  return root;
}

/** 预载入吉卜力高铁精模与全套载具精模。 */
export async function loadVehicleAssets(shared, base = './vehicles/') {
  const loader = new GLTFLoader();
  const [hsrGltf, vehGltf] = await Promise.all([
    loader.loadAsync(`${base}hsr_train.glb`).catch((e) => {
      console.warn('hsr_train.glb 载入失败，退回程序化高铁', e);
      return null;
    }),
    loader.loadAsync(`${base}vehicles.glb`).catch((e) => {
      console.warn('vehicles.glb 载入失败', e);
      return null;
    }),
  ]);

  const hsrParts = {};
  if (hsrGltf) {
    for (const child of hsrGltf.scene.children) {
      hsrParts[child.name] = child;
    }
  }

  const vehParts = {};
  if (vehGltf) {
    for (const child of vehGltf.scene.children) {
      vehParts[child.name] = child;
    }
  }

  return {
    hasHsr: !!hsrGltf && !!hsrParts.HSR_Head && !!hsrParts.HSR_Mid && !!hsrParts.HSR_Tail,
    /** 创建一节高铁车厢（含可开关左右滑门和完整内饰） */
    createHsrCar(kind = 'HSR_Mid') {
      const tpl = hsrParts[kind];
      if (!tpl) return null;
      const g = buildStylizedGroup(tpl, shared, { inkThick: 0.020 });
      const doors = [];
      g.traverse((o) => {
        if (o.name.includes('_Door_L')) doors.push({ mesh: o, side: -1, baseX: o.position.x, baseZ: o.position.z });
        if (o.name.includes('_Door_R')) doors.push({ mesh: o, side: 1, baseX: o.position.x, baseZ: o.position.z });
      });
      return { group: g, doors };
    },
    /** 创建吉卜力 3D 竹骨燕子/小鲸鱼风筝 */
    createKite() {
      const tpl = vehParts.kite;
      if (!tpl) return null;
      return buildStylizedGroup(tpl, shared, { inkThick: 0.015 });
    },
    /** 创建一辆可驾驶/骑乘的 Blender 精模载具 */
    createVehicle(id, accent = null) {
      // 将游戏内的载具名映射到 Blender 模型名
      const map = {
        'transport-city-bicycle': 'bicycle',
        'transport-cargo-bike': 'cargobike',
        'transport-scooter': 'scooter',
        'transport-ox-cart': 'oxcart',
        'transport-wheelbarrow': 'veh_wheelbarrow',
        'transport-handcart': 'prop_handcart',
        'transport-rowboat': 'rowboat',
        'transport-kayak': 'kayak',
        'transport-canoe': 'canoe',
      };
      const key = map[id] ?? id;
      const tpl = vehParts[key];
      if (!tpl) return null;
      // Blender +Y 前向在 glTF 导出后对应 Three.js -Z；旋转 180° 使车头朝向 +Z，与主角朝向完全一致
      const wrap = new THREE.Group();
      const inner = buildStylizedGroup(tpl, shared, { accent, inkThick: 0.012 });
      inner.rotation.y = Math.PI;
      wrap.add(inner);
      return wrap;
    },
  };
}
