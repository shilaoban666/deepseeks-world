// 城市的画法：和原作的 vally 一样，颜色是"颜料"，不是物理。
// 每种材质只用两三个色（受光 / 背光），中间一道干净的转折；轮廓线用倒壳（inverted hull）画，
// 和 frame.js 里那套墨线是同一个意思，只是建筑的数量太多，逐个走 alpha 通道太贵。
// 墙上的水渍、瓦片的行、木头的横纹都在 shader 里按自身坐标画出来，没有贴图文件。
import * as THREE from 'three';
import { COMMON } from '../lib/index.js';

const vertex = /* glsl */ `
out vec3 vWorld;
out vec3 vN;
out vec2 vUv;
out vec3 vLocal;
void main() {
  vUv = uv;
  vLocal = position;
  // （实例化的网格：小松树、芦苇——每个实例有自己的位置）
  #ifdef USE_INSTANCING
  mat4 mm = modelMatrix * instanceMatrix;
  #else
  mat4 mm = modelMatrix;
  #endif
  vec4 w = mm * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(mm) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragment = /* glsl */ `
${COMMON}
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uLit2;
uniform vec3 uShade2;
uniform float uKind;   // 0 墙, 1 瓦, 2 木, 3 石, 4 玻璃, 5 平色, 6 灯, 7 雪
uniform float uStain;  // 墙上水渍的浓度
uniform float uRows;   // 瓦的行数 / 木的横纹数
uniform float uNight;
uniform float uCutOn;   // 1：这种材质参与剖面
uniform vec4 uCut;      // 人站的地方 xz，人→镜头的方向 xz（单位向量；全 0 = 不剖）
uniform float uIndoor;  // 1：屋里的光（不吃雾，暖一点的环境光）
// ---- 贴图（albedo）----
// 声明了但默认 uAlbedoOn = 0，等于没有；开启后按世界坐标三平面采样，
// 只借贴图的"亮度/色相变化"，受光/背光两阶色仍由 uLit/uShade 决定 —— 这样不会双重打光。
uniform sampler2D tAlbedo;
uniform float uAlbedoOn;
uniform float uAlbedoScale;   // 每米几个循环
uniform vec3 uAlbedoMean;     // 贴图平均色（归一化用）
uniform float uAlbedoMix;     // 0..1 贴图强度
uniform float uAlbedoGain;    // 对比度补偿：贴图本身越平，这个越大
in vec3 vWorld;
in vec3 vN;
in vec2 vUv;
in vec3 vLocal;
layout(location = 0) out vec4 outC;

float line(float v, float n) {
  float f = fract(v * n);
  float w = fwidth(v * n) * 1.2;
  return smoothstep(0.5 - w, 0.5, f) * (1.0 - smoothstep(0.94, 0.94 + w, f));
}

/** 三平面采样：朝上的面用 xz，朝左右的面用 zy，朝前后的面用 xy。 */
vec2 triUV(vec3 N, vec3 p) {
  vec3 an = abs(N);
  if (an.y >= an.x && an.y >= an.z) return p.xz;
  if (an.x >= an.z) return vec2(p.z, p.y);
  return vec2(p.x, p.y);
}

void main() {
  if (uCutOn > 0.5 && vWorld.y > 1.02 && dot(vWorld.xz - uCut.xy, uCut.zw) > 0.9) discard;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  // 两阶：在光里，或者不在。转折给一点宽度，免得锯齿
  float lit = smoothstep(-0.02, 0.12, dot(N, uSunDir) + 0.1);
  vec3 sun = uSunColor * 0.42 + uSkyColor * 0.32;
  float grey = dot(uSkyColor, vec3(0.333));
  vec3 sky = mix(uSkyColor, vec3(grey), 0.78) * 1.12 + 0.18;
  vec3 litc = uLit * sun;
  vec3 shadec = uShade * sky;
  vec3 col = mix(shadec, litc, lit);

  if (uKind < 0.5) {
    // ---- 粉墙：上亮下暗的一道渐变，檐下的水渍，墙根更深 ----
    float up = clamp(vUv.y, 0.0, 1.0);
    col *= mix(0.9, 1.06, up);
    float band = smoothstep(0.62, 0.66, up) * (1.0 - smoothstep(0.70, 0.74, up));
    col = mix(col, col * vec3(0.86, 0.84, 0.9), band * 0.8);
    float stain = smoothstep(0.55, 0.95, 1.0 - up) * (0.35 + 0.65 * fract(vLocal.x * 0.7 + vLocal.z * 0.9));
    col = mix(col, col * vec3(0.8, 0.8, 0.85), stain * uStain);
    col = mix(col, col * vec3(0.78, 0.78, 0.84), smoothstep(0.12, 0.02, up) * 0.9);
  } else if (uKind < 1.5) {
    // ---- 瓦：一行行的瓦，每行错开半块 ----
    float r = vUv.y * uRows + (mod(floor(vUv.x * 6.0), 2.0) * 0.5);
    float rows = line(r, 1.0);
    float cols = line(vUv.x * 6.0, 1.0) * 0.5;
    col = mix(col, col * vec3(0.74, 0.72, 0.80), max(rows, cols) * 0.55);
    col = mix(col, col * vec3(1.08, 1.04, 1.02), smoothstep(0.6, 0.95, vUv.y) * 0.35);
    col = mix(col, uLit2 * sun, smoothstep(0.02, 0.0, vUv.y) * 0.6);
  } else if (uKind < 2.5) {
    // ---- 木：竖着的板缝 + 横纹 ----
    float planks = line(vUv.x, 5.0);
    col = mix(col, col * vec3(0.72, 0.66, 0.62), planks * 0.7);
    float grain = smoothstep(0.35, 0.65, fract(vUv.y * uRows + 0.3 * sin(vUv.x * 9.0)));
    col *= mix(0.94, 1.05, grain);
  } else if (uKind < 3.5) {
    // ---- 石：一块块的砌缝 ----
    vec2 g = vec2(vUv.x * 6.0, vUv.y * 5.0);
    float row = floor(g.y);
    g.x += mod(row, 2.0) * 0.5;
    float sx = line(g.x, 1.0);
    float sy = line(g.y, 1.0);
    col = mix(col, col * vec3(0.8, 0.79, 0.82), max(sx, sy) * 0.6);
    col *= mix(0.96, 1.04, fract(vLocal.x * 3.7 + vLocal.z * 2.3));
  } else if (uKind < 4.5) {
    // ---- 玻璃：深蓝，一道斜的亮光 ----
    // ---- 玻璃：映着天，一道斜的亮光；背光面更深 ----
    col = mix(uShade * sky * 0.9, uLit * (uSkyColor * 2.2 + 0.25), 0.55);
    float streak = smoothstep(0.16, 0.0, abs(fract((vUv.x + vUv.y) * 0.9) - 0.35));
    col += (uSkyColor + 0.2) * streak * 0.5;
  } else if (uKind > 6.5) {
    // ---- 雪：背景画里的雪地——三个平涂的调子：阳光里的暖白、半明的淡蓝白、影子里的蓝 ----
    vec2 sxz = vWorld.xz;
    // （云影、树影、人影：落在雪上都是蓝的）
    float open = cloudAt(sxz);
    // 这片坡大的走向（和草地读的是同一张坡向图），和雪堆自己朝哪边
    vec3 Nb = landNormal(sxz);
    vec3 toSun = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(1e-4, 0.0, 0.0));
    float brush = texture(tNoise, sxz / 23.0).r - 0.5;
    float lee = smoothstep(-0.05, -0.02, dot(N - Nb, toSun) + brush * 0.03);
    // （大的坡向只算它本来的斜度，不像草地那样放大三倍：一整面雪坡不该因为略微背着太阳就全进了影子）
    vec3 Ls = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.3), uSunDir.z));
    float rel = clamp(0.5 + (dot(Nb, Ls) - Ls.y) * 1.2, 0.0, 1.0);
    float sunny = open * slopeSun(rel) * mix(0.42, 1.0, lee) + brush * 0.04;
    vec3 white = vec3(0.97, 0.955, 0.925) * (uSunColor * 0.4 + uSkyColor * 0.34);
    vec3 pale = vec3(0.8, 0.87, 0.98) * (uSunColor * 0.28 + uSkyColor * 0.5);
    vec3 blue = vec3(0.5, 0.61, 0.84) * (uSkyColor * 1.05 + 0.24);
    col = mix(blue, pale, smoothstep(0.3, 0.38, sunny));
    col = mix(col, white, smoothstep(0.62, 0.7, sunny));
  } else if (uKind > 5.5) {
    // ---- 灯：自己亮 ----
    col = uLit * mix(0.5 + 0.4 * dot(uSkyColor, vec3(0.333)), 3.2, uNight);
  }
  // 剖开的墙顶：一道深色的截面
  if (uCutOn > 0.5 && vWorld.y > 0.99 && vWorld.y < 1.03 && dot(vWorld.xz - uCut.xy, uCut.zw) > 0.9) col *= 0.55;

  // ---- 贴图叠加 ----
  // 取贴图相对平均色的偏差（1.0 = 平均值），压成灰阶为主 + 少量色相，
  // 再乘到两阶色上。所以：墙面还是那个奶油色，只是多了笔触、水渍、砖缝。
  if (uAlbedoOn > 0.5) {
    vec3 t = texture(tAlbedo, triUV(N, vWorld) * uAlbedoScale).rgb;
    vec3 d = t / max(uAlbedoMean, vec3(0.06));
    // 把偏差放大到统一的目标对比度（贴图太平就多放一点）
    d = (d - 1.0) * uAlbedoGain + 1.0;
    float lum = dot(d, vec3(0.299, 0.587, 0.114));
    vec3 detail = mix(vec3(lum), d, 0.35);         // 65% 明暗变化 + 35% 色相变化
    detail = clamp(detail, vec3(0.45), vec3(1.9));  // 别把 cel 色压坏
    col *= mix(vec3(1.0), detail, uAlbedoMix);
  }

  // 天气：雨后墙面颜色深一点；霜和雪落在朝上的面（屋顶、窗台、石阶）上
  if (uIndoor < 0.5) {
    col = mix(col, col * vec3(0.76, 0.8, 0.86), uWetness * 0.35);
    float up = smoothstep(0.3, 0.8, N.y) * (0.82 + 0.18 * fract(sin(dot(floor(vWorld.xz * 1.7), vec2(12.9898, 78.233))) * 43758.5));
    vec3 snow = mix(vec3(0.6, 0.68, 0.82) * (uSkyColor * 1.3 + 0.18), vec3(0.97, 0.97, 1.0) * (uSunColor * 0.4 + uSkyColor * 0.36), lit);
    col = mix(col, snow, uFrost * up * 0.9);
  }
  outC = vec4(uIndoor > 0.5 ? col : applyFog(col, vWorld), 1.0);
}
`;

const outlineVert = /* glsl */ `
uniform float uThick;
uniform vec3 uCamPos;
out vec3 vWorld;
void main() {
  #ifdef USE_INSTANCING
  mat4 mm = modelMatrix * instanceMatrix;
  #else
  mat4 mm = modelMatrix;
  #endif
  vec4 w0 = mm * vec4(position, 1.0);
  float dist = distance(w0.xyz, uCamPos);
  // 近处收细免得贴脸变黑框，中远距保持和 kit.js 后处理墨线协调的纤细手绘感
  float thick = uThick * clamp(dist * 0.065, 0.42, 1.25);
  vec3 p = position + normal * thick;
  vec4 w = mm * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const outlineFrag = /* glsl */ `
${COMMON}
uniform vec3 uInk;
uniform float uCutOn;
uniform vec4 uCut;
uniform float uIndoor;
in vec3 vWorld;
layout(location = 0) out vec4 outC;
void main() {
  if (uCutOn > 0.5 && vWorld.y > 1.0 && dot(vWorld.xz - uCut.xy, uCut.zw) > 0.9) discard;
  if (uIndoor > 0.5) { outC = vec4(uInk, 1.0); return; }
  // 墨线不是黑的：是本体颜色压暗加一点点暖，和原作 frame.js 的 inkAt 一个做法
  outC = vec4(applyFog(uInk, vWorld), 1.0);
}
`;

const KINDS = { wall: 0, roof: 1, wood: 2, stone: 3, glass: 4, flat: 5, glow: 6, snow: 7 };

// ---- 贴图登记表 ------------------------------------------------------------------------------------------------
// 按材质类型登记一张 albedo 贴图和它的世界尺寸。main.js 载入后调 configureAlbedo()。
// 没登记 = uAlbedoOn 0 = 完全不影响现在的观感（所以这是纯粹的增量功能）。
const ALBEDO = {}; // kind -> { texture, mean: Vector3, scale, mix }
let ALBEDO_ENABLED = true;
const NO_TEX = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
NO_TEX.needsUpdate = true;

/**
 * @param map { wall?, roof?, wood?, stone?, paddy?, snow? } 每项 { texture, mean }
 * @param scales 每米几个循环，默认按材质给一套合理的
 */
export function configureAlbedo(map = {}, { scales = {}, mix = 0.85 } = {}) {
  const defaults = {
    wall: 0.34, roof: 0.55, wood: 0.7, stone: 0.2, paddy: 0.05, snow: 0.12,
    // 街道设施：小物件用大一些的 scale（每米一个循环左右）
    bridge: 0.55, road: 0.14, lamp: 1.1, bench: 0.9, fence: 0.8, bin: 1.0, sign: 1.0,
  };
  for (const [kind, entry] of Object.entries(map)) {
    if (!entry?.texture) continue;
    ALBEDO[kind] = {
      texture: entry.texture,
      mean: entry.mean ?? new THREE.Vector3(0.5, 0.5, 0.5),
      scale: scales[kind] ?? defaults[kind] ?? 0.3,
      mix,
      // 贴图越平（标准差越小），放大越多，让每种材质看起来同样"有笔触"（目标对比度 0.26）
      gain: Math.min(12, Math.max(1, 0.26 / Math.max(entry.std ?? 0.05, 0.012))),
    };
  }
  // 每一类的第 0 号当默认（室内、道具这类没指定变体的地方就用它）
  for (const family of ['wall', 'roof', 'wood', 'stone']) {
    if (!ALBEDO[family] && ALBEDO[`${family}0`]) ALBEDO[family] = ALBEDO[`${family}0`];
  }
  // 街道设施的各组也登记一个"组名"默认值，方便按类别直接取
  for (const family of ['bridge', 'road', 'lamp', 'bench', 'fence', 'bin', 'sign']) {
    if (!ALBEDO[family] && ALBEDO[`${family}0`]) ALBEDO[family] = ALBEDO[`${family}0`];
  }
  return Object.keys(ALBEDO);
}

/** 取一个变体的贴图登记（没有就返回 null）。供 Builder 按调色板序号挑。 */
export function getAlbedo(key) {
  return ALBEDO_ENABLED ? (ALBEDO[key] ?? null) : null;
}

/** 关掉所有贴图（调试用） */
export function setAlbedoEnabled(on) {
  ALBEDO_ENABLED = !!on;
}

/**
 * 载入一张 albedo 贴图，并算出它的平均色（shader 里要拿它做归一化）。
 * 平均色在 sRGB 空间量，再转成线性，和贴图采样后的空间一致。
 */
export async function loadAlbedo(url) {
  const texture = await new Promise((res, rej) => new THREE.TextureLoader().load(url, res, undefined, rej));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  // 画到小画布上量平均色
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.drawImage(texture.image, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  let r = 0;
  let gg = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    gg += d[i + 1];
    b += d[i + 2];
  }
  const n = d.length / 4;
  const srgb = [r / n / 255, gg / n / 255, b / n / 255];
  const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  // 亮度标准差：贴图"有多平"。shader 里拿它算对比度补偿。
  const lums = new Float32Array(n);
  for (let i = 0, k = 0; i < d.length; i += 4, k++) lums[k] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  let m = 0;
  for (let i = 0; i < n; i++) m += lums[i];
  m /= n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (lums[i] - m) * (lums[i] - m);
  const std = Math.sqrt(v / n);
  return { texture, mean: new THREE.Vector3(...srgb.map(toLinear)), std };
}

/**
 * @param shared 场地的 uniforms（光、雾、相机）
 * @param o.lit 受光色（0~1 的线性光，按颜料调，不是 sRGB）
 * @param o.shade 背光色
 * @param o.kind wall / roof / wood / stone / glass / flat / glow / snow（雪地：三个平涂的调子，吃云影和树影）
 */
export function paintMaterial(shared, { lit, shade, lit2 = null, shade2 = null, kind = 'flat', stain = 0.5, rows = 12, cut = false, indoor = false, side = THREE.FrontSide, albedo = null } = {}) {
  // 贴图：优先用调用方指定的，否则按材质类型查登记表
  const tex = albedo ?? (ALBEDO_ENABLED ? ALBEDO[kind] : null);
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      ...shared,
      uLit: { value: new THREE.Color(...lit) },
      uShade: { value: new THREE.Color(...shade) },
      uLit2: { value: new THREE.Color(...(lit2 ?? lit)) },
      uShade2: { value: new THREE.Color(...(shade2 ?? shade)) },
      uKind: { value: KINDS[kind] ?? 5 },
      uStain: { value: stain },
      uRows: { value: rows },
      uCutOn: { value: cut ? 1 : 0 },
      uCut: shared.uCut ?? { value: new THREE.Vector4() },
      uIndoor: { value: indoor ? 1 : 0 },
      tAlbedo: { value: tex?.texture ?? NO_TEX },
      uAlbedoOn: { value: tex ? 1 : 0 },
      uAlbedoScale: { value: tex?.scale ?? 0.3 },
      uAlbedoMean: { value: tex?.mean ?? new THREE.Vector3(0.5, 0.5, 0.5) },
      // 屋里东西小、离得近，贴图只留三成，不然地板和墙太花
      uAlbedoMix: { value: (tex?.mix ?? 0.85) * (indoor ? 0.3 : 1) },
      uAlbedoGain: { value: tex?.gain ?? 1 },
    },
    side,
  });
}

/** 倒壳描边。thick 是往法线外推的米数。 */
export function outlineMaterial(shared, ink = [0.05, 0.06, 0.12], thick = 0.06, { cut = false, indoor = false } = {}) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: outlineVert,
    fragmentShader: outlineFrag,
    uniforms: { ...shared, uInk: { value: new THREE.Color(...ink) }, uThick: { value: thick }, uCutOn: { value: cut ? 1 : 0 }, uCut: shared.uCut ?? { value: new THREE.Vector4() }, uIndoor: { value: indoor ? 1 : 0 } },
    side: THREE.BackSide,
  });
}

/** 把一批 mesh 的描边加进去：同一个几何体 + 描边材质，稍微放大一点。 */
export function addOutline(group, material, shared, thick = 0.06) {
  const ink = outlineMaterial(shared, [0.04, 0.05, 0.11], thick);
  const out = [];
  group.traverse((o) => {
    if (o.isMesh && o.material === material) {
      const m = new THREE.Mesh(o.geometry, ink);
      m.position.copy(o.position);
      m.rotation.copy(o.rotation);
      m.scale.copy(o.scale);
      m.renderOrder = -1;
      out.push(m);
    }
  });
  for (const m of out) group.add(m);
  return out;
}

// ---- 招牌 / 文字 -----------------------------------------------------------------------------------------------
const signCache = new Map();

/**
 * 一块写着字的招牌贴图（Canvas 画的，不用字体文件）。
 * @param text 中文店名
 * @param o.fg 字色 o.bg 底色 o.w 画布宽 o.h 画布高 o.vertical 竖排
 */
export function signTexture(text, { fg = '#f6f0e2', bg = '#22304a', w = 512, h = 128, vertical = false, border = true, font = 'bold' } = {}) {
  const key = `${text}|${fg}|${bg}|${w}|${h}|${vertical}|${border}|${font}`;
  const hit = signCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  if (border) {
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = Math.max(3, w * 0.012);
    g.strokeRect(g.lineWidth * 1.6, g.lineWidth * 1.6, w - g.lineWidth * 3.2, h - g.lineWidth * 3.2);
  } else {
    g.clearRect(0, 0, w, h);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...text];
  if (vertical) {
    const size = Math.min(w * 0.72, (h / chars.length) * 0.82);
    g.font = `${font} ${Math.round(size)}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif`;
    chars.forEach((c, i) => g.fillText(c, w / 2, (h / chars.length) * (i + 0.5)));
  } else {
    let size = h * 0.62;
    g.font = `${font} ${Math.round(size)}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif`;
    const max = w * 0.86;
    const width = g.measureText(text).width;
    if (width > max) {
      size *= max / width;
      g.font = `${font} ${Math.round(size)}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif`;
    }
    g.fillText(text, w / 2, h * 0.54);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  signCache.set(key, tex);
  return tex;
}

/** 招牌材质：自发光一点（招牌自己亮），但仍跟着雾走。 */
export function signMaterial(shared, texture) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: /* glsl */ `
      out vec2 vUv;
      out vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform sampler2D tSign;
      uniform float uGlow;
      in vec2 vUv;
      in vec3 vWorld;
      layout(location = 0) out vec4 outC;
      void main() {
        vec4 t = texture(tSign, vUv);
        if (t.a < 0.35) discard;
        vec3 c = t.rgb * (0.55 + 0.75 * uGlow) + uSunColor * 0.06;
        outC = vec4(applyFog(c, vWorld), 1.0);
      }`,
    uniforms: { ...shared, tSign: { value: texture }, uGlow: { value: 0.8 } },
    side: THREE.DoubleSide,
  });
}