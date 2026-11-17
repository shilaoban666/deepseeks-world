// 粒子：水花、涟漪、气泡、尘土、落叶、萤火、火星。
//
// 一个池子画完所有种类：每颗粒子是一块面向镜头的小方片（涟漪是平躺在水面上的环），
// CPU 上推位置（几百到两千颗，核显也不在乎），每帧把属性写回实例缓冲。
//
// 混合方式要特别：画面的 alpha 通道在本项目里是"墨线编号"（见 frame.js），
// 粒子如果按普通透明混合写 alpha，会把下面那块的编号冲掉，墨线和笔触就乱了。
// 所以颜色按透明度混合，alpha 通道保持目标原样（blendSrcAlpha = 0, blendDstAlpha = 1）。
import * as THREE from 'three';
import { COMMON } from '../lib/index.js';

const vertex = /* glsl */ `
${COMMON}
in vec3 aPos;
in vec4 aColor;   // rgb + 不透明度
in vec2 aSize;    // 宽、高（米）
in float aShape;  // 0 圆点、1 平躺的环（涟漪）、2 竖条（溅起的水）、3 叶子、4 气泡
in float aSpin;
out vec2 vUv;
out vec4 vColor;
out float vShape;
out vec3 vWorld;
void main() {
  vec2 c = position.xy;
  vec3 world;
  if (aShape > 0.5 && aShape < 1.5) {
    // 涟漪：平躺
    world = aPos + vec3(c.x * aSize.x, 0.0, c.y * aSize.x);
  } else {
    vec3 toCam = normalize(uCamPos - aPos);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1e-5, 0.0, 0.0));
    vec3 up = normalize(cross(toCam, right));
    float cs = cos(aSpin), sn = sin(aSpin);
    vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
    world = aPos + right * r.x * aSize.x + up * r.y * aSize.y;
  }
  vUv = c + 0.5;
  vColor = aColor;
  vShape = aShape;
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const fragment = /* glsl */ `
${COMMON}
in vec2 vUv;
in vec4 vColor;
in float vShape;
in vec3 vWorld;
layout(location = 0) out vec4 outC;
void main() {
  vec2 p = vUv - 0.5;
  float d = length(p) * 2.0;
  float a;
  if (vShape < 0.5) a = 1.0 - smoothstep(0.55, 1.0, d);
  else if (vShape < 1.5) a = smoothstep(0.72, 0.84, d) * (1.0 - smoothstep(0.88, 1.0, d));
  else if (vShape < 2.5) a = (1.0 - smoothstep(0.3, 0.5, abs(p.x) * 2.0)) * (1.0 - smoothstep(0.7, 1.0, abs(p.y) * 2.0));
  else if (vShape < 3.5) {
    // 叶子：两头尖的椭圆，中间一道叶脉
    float leaf = 1.0 - smoothstep(0.85, 1.0, length(vec2(p.x * 2.2, p.y * 1.15)) * 2.0);
    a = leaf * (1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.05, abs(p.x))));
  } else {
    // 气泡：一圈亮边 + 一个高光点
    a = smoothstep(0.62, 0.8, d) * (1.0 - smoothstep(0.9, 1.0, d)) + (1.0 - smoothstep(0.0, 0.18, length(p - vec2(-0.14, 0.16)))) ;
  }
  a *= vColor.a;
  if (a < 0.01) discard;
  // 亮的（火星、萤火）不吃环境光；其余跟着天光走
  vec3 col = vColor.rgb;
  if (max(col.r, max(col.g, col.b)) < 1.01) col *= uSunColor * 0.32 + uSkyColor * 0.55 + 0.1;
  outC = vec4(applyFog(col, vWorld), a);
}
`;

/**
 * @param shared 场地的 uniforms
 * @param max 最多同时多少颗
 */
export function createParticles(shared, max = 2400) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.attributes.position = quad.attributes.position;
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 4);
  const size = new Float32Array(max * 2);
  const shape = new Float32Array(max);
  const spin = new Float32Array(max);
  const attr = {
    pos: new THREE.InstancedBufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage),
    col: new THREE.InstancedBufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage),
    size: new THREE.InstancedBufferAttribute(size, 2).setUsage(THREE.DynamicDrawUsage),
    shape: new THREE.InstancedBufferAttribute(shape, 1).setUsage(THREE.DynamicDrawUsage),
    spin: new THREE.InstancedBufferAttribute(spin, 1).setUsage(THREE.DynamicDrawUsage),
  };
  geo.setAttribute('aPos', attr.pos);
  geo.setAttribute('aColor', attr.col);
  geo.setAttribute('aSize', attr.size);
  geo.setAttribute('aShape', attr.shape);
  geo.setAttribute('aSpin', attr.spin);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { ...shared },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;

  /** 活着的粒子 */
  const live = [];
  const SHAPES = { dot: 0, ring: 1, streak: 2, leaf: 3, bubble: 4 };

  const api = {
    mesh,
    get count() {
      return live.length;
    },
    /**
     * 放一颗。
     * @param o.x,y,z 位置；o.vx,vy,vz 速度（米/秒）；o.life 秒；o.size 米（或 [宽, 高]）；o.grow 每秒长大多少倍
     * @param o.color [r,g,b]（>1 表示自己发光）；o.alpha；o.shape 'dot'|'ring'|'streak'|'leaf'|'bubble'
     * @param o.gravity 向下的加速度；o.drag 空气阻力；o.float 浮力（气泡往上）；o.wind 1 = 跟着风飘
     * @param o.floor 落到这个高度就停（或消失）；o.spin 转速
     */
    emit(o) {
      if (live.length >= max) live.shift();
      const sz = Array.isArray(o.size) ? o.size : [o.size ?? 0.2, o.size ?? 0.2];
      live.push({
        x: o.x,
        y: o.y,
        z: o.z,
        vx: o.vx ?? 0,
        vy: o.vy ?? 0,
        vz: o.vz ?? 0,
        age: 0,
        life: o.life ?? 1,
        w: sz[0],
        h: sz[1],
        grow: o.grow ?? 0,
        r: o.color?.[0] ?? 1,
        g: o.color?.[1] ?? 1,
        b: o.color?.[2] ?? 1,
        alpha: o.alpha ?? 0.8,
        fade: o.fade ?? 1,
        shape: SHAPES[o.shape ?? 'dot'] ?? 0,
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 0,
        float: o.float ?? 0,
        wind: o.wind ?? 0,
        floor: o.floor ?? -1e9,
        spin: o.spin ?? 0,
        angle: o.angle ?? Math.random() * 6.28,
        wobble: o.wobble ?? 0,
        phase: Math.random() * 6.28,
      });
    },
    /** 一圈向外溅的水花 + 一个涟漪 */
    splash(x, y, z, strength = 1) {
      for (let i = 0; i < 10 * strength; i++) {
        const a = Math.random() * 6.28;
        const s = 1 + Math.random() * 2.2 * strength;
        api.emit({ x, y: y + 0.05, z, vx: Math.cos(a) * s * 0.6, vy: 2.2 + Math.random() * 2.6 * strength, vz: Math.sin(a) * s * 0.6, life: 0.7, size: [0.05, 0.16], shape: 'streak', color: [0.85, 0.93, 1.0], alpha: 0.85, gravity: 11, floor: y - 0.1 });
      }
      api.emit({ x, y: y + 0.03, z, life: 1.4, size: 0.3, grow: 2.6, shape: 'ring', color: [0.92, 0.97, 1.0], alpha: 0.7 });
    },
    ripple(x, y, z, size = 0.25, life = 1.6) {
      api.emit({ x, y: y + 0.03, z, life, size, grow: 1.8, shape: 'ring', color: [0.9, 0.96, 1.0], alpha: 0.55 });
    },
    dust(x, y, z, n = 4, color = [0.82, 0.76, 0.62]) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28;
        api.emit({ x: x + Math.cos(a) * 0.2, y: y + 0.08, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * 0.6, vy: 0.4 + Math.random() * 0.5, vz: Math.sin(a) * 0.6, life: 0.9, size: 0.22, grow: 1.4, color, alpha: 0.45, drag: 2.2 });
      }
    },
    update(dt, wind = [1, 0, 0]) {
      const [wx, wz, ws] = wind;
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i];
        p.age += dt;
        if (p.age >= p.life) {
          live.splice(i, 1);
          continue;
        }
        p.vy += (p.float - p.gravity) * dt;
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
        if (p.wind) {
          p.vx += (wx * ws * p.wind - p.vx) * Math.min(1, dt * 1.2);
          p.vz += (wz * ws * p.wind - p.vz) * Math.min(1, dt * 1.2);
        }
        const wob = p.wobble ? Math.sin(p.age * 3.1 + p.phase) * p.wobble : 0;
        p.x += (p.vx + wob) * dt;
        p.y += p.vy * dt;
        p.z += (p.vz + wob * 0.7) * dt;
        p.angle += p.spin * dt;
        if (p.y < p.floor) {
          p.y = p.floor;
          p.vy = 0;
          p.vx *= 0.3;
          p.vz *= 0.3;
          p.spin *= 0.2;
        }
      }
      const n = live.length;
      for (let i = 0; i < n; i++) {
        const p = live[i];
        const t = p.age / p.life;
        const g = 1 + p.grow * p.age;
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        col[i * 4] = p.r;
        col[i * 4 + 1] = p.g;
        col[i * 4 + 2] = p.b;
        // 先淡入一点，最后三成淡出
        col[i * 4 + 3] = p.alpha * Math.min(1, t * 8) * (p.fade ? 1 - Math.max(0, (t - 0.7) / 0.3) : 1);
        size[i * 2] = p.w * g;
        size[i * 2 + 1] = p.h * g;
        shape[i] = p.shape;
        spin[i] = p.angle;
      }
      geo.instanceCount = n;
      for (const a of Object.values(attr)) {
        a.needsUpdate = true;
        a.clearUpdateRanges?.();
        a.addUpdateRange?.(0, n * a.itemSize);
      }
    },
  };
  return api;
}
