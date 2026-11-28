// 主角：小鲸鱼（鲸鱼娘）的 3D 骨骼模型（宫崎骏/吉卜力手绘赛璐璐着色 + 倒壳墨线 + 完整动作系统）+ 第三人称相机 + 走路/快走/奔跑碰撞。
// 她写进 alpha 的是 0.16（< 0.23）：
//   1) frame.js 的 Kuwahara 笔触收尾不会把她的脸和眼睛抹糊（alpha < 0.6 表示"已经是画好的了"）
//   2) frame.js 收尾的暖色墨线会沿着她的 3D 轮廓自动描一圈，和原作里的漫游者（valley/wanderer.js）同一套机制
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { COMMON } from '../lib/index.js';
import { heightAt, walkAt, inLake, START, START_YAW, HALF } from './plan.js';
import { createWhaleAnimator } from './whale_anim.js';

// ---- 宫崎骏 / 吉卜力风格 3D 蒙皮赛璐璐着色器 ----
const skinnedCelVertex = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
out vec2 vUv;
out vec3 vWorld;
out vec3 vN;
out vec3 vCol;
void main() {
  vUv = uv;
  #ifdef USE_COLOR_ALPHA
  vCol = color.rgb;
  #elif defined(USE_COLOR)
  vCol = color.rgb;
  #else
  vCol = vec3(0.0, 0.0, 1.0);
  #endif
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * objectNormal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const skinnedCelFragment = /* glsl */ `
${COMMON}
uniform sampler2D tArt;
uniform vec3 uTint;
uniform float uAlpha;
uniform float uIndoor;
in vec2 vUv;
in vec3 vWorld;
in vec3 vN;
in vec3 vCol;
layout(location = 0) out vec4 outC;

void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;

  // 采样手绘感底色，轻微提亮过暗的缝隙并保持吉卜力水彩的清透饱和度
  vec3 tex = texture(tArt, vUv).rgb * uTint;
  vec3 base = mix(tex, pow(max(tex, vec3(0.001)), vec3(0.92)), 0.32);
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  base = max(mix(vec3(lum), base, 1.08), vec3(0.0));

  float faceMask = clamp(vCol.r, 0.0, 1.0);
  float softAo = clamp(vCol.b, 0.72, 1.0);

  // 两阶吉卜力赛璐璐受光：身体/头发有干净的明暗转折；脸部柔化转折，保证五官清透可爱
  float ndl = dot(N, uSunDir);
  float bodyLit = smoothstep(-0.02, 0.14, ndl + 0.12);
  float faceLit = smoothstep(-0.42, 0.35, ndl + 0.42);
  float lit = mix(bodyLit, max(bodyLit, faceLit * 0.92), faceMask);

  // 室外吃云影与树影（保留底亮，避免钻进树荫变黑）
  if (uIndoor < 0.5) {
    float open = smoothstep(0.32, 0.62, openAt(vWorld.xz));
    lit *= mix(0.42, 1.0, open);
  }

  vec3 sun = uSunColor * 0.44 + uSkyColor * 0.34;
  float grey = dot(uSkyColor, vec3(0.333));
  vec3 sky = mix(uSkyColor, vec3(grey), 0.76) * 1.18 + 0.21;

  // 背光面按颜料调出偏蓝紫的透明阴影色（和 models.js / wanderer.js 一致）
  vec3 shade = base * vec3(0.76, 0.79, 0.94) * mix(softAo, 1.0, faceMask * 0.7);
  vec3 litPaint = base * mix(0.92 + 0.08 * softAo, 1.0, faceMask);
  vec3 col = mix(shade * sky, litPaint * sun, lit);

  // 柔和的阳光轮廓高光（背光/侧光时发梢与衣缘泛出温暖的吉卜力日照边）
  vec3 V = normalize(uCamPos - vWorld);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * smoothstep(-0.18, 0.55, ndl) * (1.0 - faceMask * 0.85);
  col += (uSunColor * 0.15 + uSkyColor * 0.08) * rim * (uIndoor > 0.5 ? 0.35 : 0.9);

  // 天气：雨天微润，雪天肩头/发顶落一点轻霜
  if (uIndoor < 0.5) {
    col = mix(col, col * vec3(0.84, 0.87, 0.92), uWetness * 0.25);
    float up = smoothstep(0.55, 0.92, N.y) * (1.0 - faceMask);
    vec3 snow = vec3(0.92, 0.95, 1.0) * (uSunColor * 0.36 + uSkyColor * 0.42);
    col = mix(col, snow, uFrost * up * 0.38);
    col = applyFog(col, vWorld);
  }

  outC = vec4(col, uAlpha);
}
`;

// ---- 蒙皮倒壳内墨线（增强发丝、袖口、鲸鱼耳、鲸鱼尾等 3D 叠层边界；脸部自动收细为零） ----
const skinnedOutlineVertex = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uThick;
out vec3 vWorld;
void main() {
  #ifdef USE_COLOR_ALPHA
  float detail = color.g;
  #elif defined(USE_COLOR)
  float detail = color.g;
  #else
  float detail = 0.0;
  #endif
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  // 脸部区域把挤出厚度压到几乎为 0，绝不糊住眼睛和嘴
  float thick = uThick * (1.0 - detail * 0.92);
  transformed += normalize(objectNormal) * thick;
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const skinnedOutlineFragment = /* glsl */ `
${COMMON}
uniform vec3 uInk;
uniform float uAlpha;
uniform float uIndoor;
in vec3 vWorld;
layout(location = 0) out vec4 outC;
void main() {
  vec3 col = uIndoor > 0.5 ? uInk : applyFog(uInk, vWorld);
  outC = vec4(col, uAlpha);
}
`;

const shadowVertex = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const shadowFragment = /* glsl */ `
${COMMON}
in vec2 vUv;
layout(location = 0) out vec4 outC;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, d) * 0.48;
  outC = vec4(mix(vec3(0.05, 0.09, 0.14), uSkyColor * 0.2, 0.25), a);
}
`;

/** 把角度收进 [-π, π]。 */
const wrapPi = (a) => {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
};

/** 保留旧接口导出，供测试脚本或外部调用兼容。 */
export function pickView(yawToCam, facing) {
  const d = Math.abs(wrapPi(yawToCam - facing));
  if (d < Math.PI / 3) return 'front';
  if (d > (Math.PI * 2) / 3) return 'back';
  return 'side';
}

/** 载入 3D 骨骼小鲸鱼模型（public/figures/whalechan.glb）。 */
export async function loadWhalechan(shared, base = './figures/') {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(`${base}whalechan.glb`);
  let baseTexture = null;
  gltf.scene.traverse((o) => {
    if (o.isMesh && o.material?.map) {
      baseTexture = o.material.map;
      baseTexture.colorSpace = THREE.SRGBColorSpace;
      baseTexture.anisotropy = 4;
      baseTexture.minFilter = THREE.LinearMipmapLinearFilter;
      baseTexture.magFilter = THREE.LinearFilter;
      baseTexture.needsUpdate = true;
    }
  });
  return { gltf, texture: baseTexture, is3D: true };
}

/**
 * 创建 3D 骨骼主角小鲸鱼（吉卜力赛璐璐着色 + 倒壳墨线 + 完整动作系统与二级物理）。
 * @param shared 场景共享 uniforms（阳光、天光、雾、风、天气）
 * @param arts loadWhalechan 的结果
 */
export function createWhalechan(shared, arts) {
  const group = new THREE.Group();
  const modelRoot = new THREE.Group();
  const model = arts.gltf.scene;
  modelRoot.add(model);
  group.add(modelRoot);

  const height = 1.60;
  const width = 1.05;

  const uIndoor = { value: 0 };
  const celMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: skinnedCelVertex,
    fragmentShader: skinnedCelFragment,
    uniforms: {
      ...shared,
      tArt: { value: arts.texture },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uAlpha: { value: 0.16 },
      uIndoor,
    },
    vertexColors: true,
    side: THREE.DoubleSide,
  });

  const outlineMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: skinnedOutlineVertex,
    fragmentShader: skinnedOutlineFragment,
    uniforms: {
      ...shared,
      uThick: { value: 0.0048 },
      uInk: { value: new THREE.Color(0.08, 0.07, 0.14) },
      uAlpha: { value: 0.16 },
      uIndoor,
    },
    vertexColors: true,
    side: THREE.BackSide,
  });

  let mainMesh = null;
  const toAddOutlines = [];
  model.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.material = celMat;
      o.frustumCulled = false;
      mainMesh = o;
      toAddOutlines.push(o);
    } else if (o.isMesh) {
      o.material = celMat;
      o.frustumCulled = false;
      if (!mainMesh) mainMesh = o;
    }
  });

  // 人物主体写 uAlpha = 0.16，交给 frame.js 原生屏幕空间暖墨线（inkAt）自动勾勒干净无闪烁的吉卜力轮廓，
  // 不再叠加会与双面发丝/裙边 Z-fighting 闪烁的 BackSide 倒壳。

  const animator = createWhaleAnimator(model, arts.gltf.animations ?? []);

  // 脚下接地投影圆
  const shadowGeo = new THREE.PlaneGeometry(0.95, 0.95);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(
    shadowGeo,
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: shadowVertex,
      fragmentShader: shadowFragment,
      uniforms: { ...shared },
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.renderOrder = 2;
  group.add(shadow);

  const state = {
    x: START[0],
    z: START[1],
    y: heightAt(START[0], START[1]),
    yaw: START_YAW,
    visualYaw: START_YAW,
    vy: 0,
    onGround: true,
    speed: 0,
    walkPhase: 0,
    facingCamera: 0,
    lift: 0,
  };

  return {
    group,
    mesh: mainMesh,
    model,
    animator,
    mixer: animator.mixer,
    clips: animator.clips,
    bones: animator.bones,
    state,
    width,
    height,
    /** 触发一个一次性交互动作（种植、浇水、采摘、做饭、吃饭、祈祷、挥手、欢呼、甩竿、点火等） */
    trigger(name, duration) {
      animator.trigger(name, duration);
    },
    /** 切换室内/室外光照模式 */
    setIndoor(on) {
      uIndoor.value = on ? 1 : 0;
    },
    /** 获取左手/右手骨骼的实时 3D 世界坐标 */
    getHandWorldPos(side = 'right', out = new THREE.Vector3()) {
      group.updateMatrixWorld(true);
      return animator.getHandWorldPos(side, out);
    },
    /**
     * 每帧更新 3D 主角位置、平滑朝向、完整骨骼动作与二级物理。
     */
    update(dt, camera, moving, pose = null, ctx = {}) {
      const safeDt = Math.min(0.05, Math.max(0.0001, dt));
      group.position.set(state.x, state.y + (state.lift ?? 0), state.z);

      // 3D 朝向平滑插值（转弯丝滑，不瞬间 180° 跳变）
      const turnRate = pose === 'ski' || pose === 'surf' || pose === 'boat' || pose === 'climb' ? 18 : 13;
      state.visualYaw += wrapPi(state.yaw - state.visualYaw) * Math.min(1, safeDt * turnRate);
      modelRoot.rotation.set(0, state.visualYaw, 0);

      // 推进骨骼动作与风场二级物理
      const activePose = animator.update(safeDt, {
        pose,
        moving,
        speed: ctx.speed ?? state.speed ?? 0,
        vy: state.vy,
        yaw: state.visualYaw,
        air: ctx.air ?? (pose === 'air' || pose === 'jump' || pose === 'doubleJump' || pose === 'fall'),
        wind: shared?.uWind?.value ?? null,
        steer: ctx.steer ?? 0,
        brake: ctx.brake ?? false,
        trick: ctx.trick ?? false,
      });
      state.pose = activePose;
      state.walkPhase += safeDt * (moving ? (activePose === 'run' ? 12 : activePose === 'fastWalk' ? 9.5 : 7.5) : 2.2);

      // 脚下影子贴地；水中、高空隐藏
      const groundY = state.groundY ?? state.y;
      const inWater = pose === 'swim' || pose === 'dive' || pose === 'boat' || pose === 'surf';
      shadow.position.set(0, groundY - state.y - (state.lift ?? 0) + 0.03, 0);
      shadow.visible = !inWater && state.y - groundY < 4.5;
      const s = 1 - Math.min(0.55, Math.max(0, state.y - groundY) * 0.12);
      shadow.scale.setScalar(Math.max(0.35, s) * 1.05);
    },
    setPos(x, z) {
      state.x = x;
      state.z = z;
      state.y = walkAt(x, z);
    },
  };
}

/** 简单的地形感知相机：绕着人转，鼠标拖/指针锁，滚轮拉近拉远。 */
export function createCamera(camera, canvas, dom) {
  const cam = {
    yaw: START_YAW + Math.PI,
    pitch: 0.07,
    distance: 7.5,
    want: 7.5,
    pivot: new THREE.Vector3(),
    minPitch: -0.35,
    maxPitch: 1.15,
    maxDistance: 26,
    blocked: 1,
    forward: new THREE.Vector2(0, 1),
  };
  cam.setIndoor = (on) => {
    cam.maxDistance = on ? 15 : 26;
    cam.minDistance = on ? 5 : 2.2;
    cam.minPitch = on ? 0.55 : -0.35;
    cam.maxPitch = on ? 1.25 : 1.15;
    cam.want = Math.max(cam.minDistance, cam.want);
    cam.want = Math.min(cam.want, cam.maxDistance);
    cam.pitch = Math.min(cam.maxPitch, Math.max(cam.minPitch, cam.pitch));
  };
  let locked = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onMove = (dx, dy) => {
    cam.yaw -= dx * 0.0026;
    cam.pitch = Math.min(cam.maxPitch, Math.max(cam.minPitch, cam.pitch + dy * 0.0022));
  };
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    dom?.classList.toggle('locked', locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (locked) onMove(e.movementX, e.movementY);
    else if (dragging) {
      onMove(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }
    if (e.button === 2) cam.distance = cam.want = Math.max(2.6, cam.distance - 1);
  });
  window.addEventListener('mouseup', () => (dragging = false));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      cam.want = Math.min(cam.maxDistance, Math.max(cam.minDistance ?? 2.2, cam.want + Math.sign(e.deltaY) * 1.1));
    },
    { passive: false },
  );

  cam.lock = () => canvas.requestPointerLock?.();
  cam.unlock = () => document.exitPointerLock?.();
  cam.isLocked = () => locked;

  const target = new THREE.Vector3();
  const wanted = new THREE.Vector3();
  cam.update = (dt, pos, groundAt, eye = 1.35) => {
    target.set(pos.x, pos.y + eye, pos.z);
    cam.pivot.lerp(target, Math.min(1, dt * 9));
    cam.want = Math.min(cam.maxDistance, cam.want);
    cam.pitch = Math.min(cam.maxPitch, Math.max(cam.minPitch, cam.pitch));
    cam.distance += (cam.want - cam.distance) * Math.min(1, dt * 8);
    const cp = Math.cos(cam.pitch);
    const offX = Math.sin(cam.yaw) * cp * cam.distance;
    const offZ = Math.cos(cam.yaw) * cp * cam.distance;
    const offY = Math.sin(cam.pitch) * cam.distance;
    let k = 1;
    const boxes = cam.obstacles?.();
    if (boxes && boxes.length) {
      const steps = Math.ceil(cam.distance / 0.5);
      scan: for (let i = 2; i <= steps; i++) {
        const t = i / steps;
        const px = cam.pivot.x + offX * t;
        const pz = cam.pivot.z + offZ * t;
        const py = cam.pivot.y + (offY + 0.6) * t;
        for (const c of boxes) {
          const ddx = px - c.x;
          const ddz = pz - c.z;
          const cc = c.c ?? 1;
          const cs = c.s ?? 0;
          if (Math.abs(ddx * cc - ddz * cs) < c.hw + 0.35 && Math.abs(ddx * cs + ddz * cc) < c.hd + 0.35 && py < (c.base ?? groundAt(c.x, c.z)) + (c.top ?? 20)) {
            k = Math.max(0.16, (i - 1.2) / steps);
            break scan;
          }
        }
      }
    }
    cam.blocked += ((k < 1 ? k : 1) - cam.blocked) * Math.min(1, dt * (k < cam.blocked ? 30 : 4));
    const kk = cam.blocked;
    wanted.set(cam.pivot.x + offX * kk, cam.pivot.y + (offY + 0.6) * kk + (1 - kk) * 0.5, cam.pivot.z + offZ * kk);
    const gy = groundAt(wanted.x, wanted.z) + 1.1;
    if (wanted.y < gy) wanted.y = gy;
    camera.position.lerp(wanted, Math.min(1, dt * 12));
    camera.lookAt(cam.pivot);
    cam.forward.set(-Math.sin(cam.yaw), -Math.cos(cam.yaw));
  };
  return cam;
}

/**
 * 走路：WASD 相对相机方向，Z 切换快速行走，Shift 奔跑。碰撞是轴对齐/旋转盒（建筑）加上地图边界。
 * @param o.colliders [{x, z, hw, hd, top}]
 */
export function createMover(o) {
  const list = () => o.colliderList?.() ?? o.colliders ?? [];
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const STEP = 0.5;
  const groundOf = (x, z) => (o.groundAt ? o.groundAt(x, z) : 0);
  const topOf = (c) => (c.ty ??= (c.base ?? groundOf(c.x, c.z)) + (c.top ?? 20));
  const CELL = 16;
  let gridOf = null;
  let grid = null;
  let gridN = -1;
  const near = (x, z) => {
    const all = list();
    if (all !== gridOf || all.length !== gridN) {
      gridOf = all;
      gridN = all.length;
      grid = new Map();
      for (const c of all) {
        const r = Math.hypot(c.hw, c.hd);
        for (let i = Math.floor((c.x - r) / CELL); i <= Math.floor((c.x + r) / CELL); i++) {
          for (let j = Math.floor((c.z - r) / CELL); j <= Math.floor((c.z + r) / CELL); j++) {
            const k = i * 4096 + j;
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(c);
          }
        }
      }
    }
    return grid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)) ?? EMPTY;
  };
  const EMPTY = [];
  const floorAt = (x, z, y, pad = 0.12) => {
    let best = -Infinity;
    for (const c of near(x, z)) {
      if (c.off) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const cc = c.c ?? 1;
      const cs = c.s ?? 0;
      if (Math.abs(dx * cc - dz * cs) > c.hw + pad || Math.abs(dx * cs + dz * cc) > c.hd + pad) continue;
      const t = topOf(c);
      if (t <= y + STEP && t > best) best = t;
    }
    return best;
  };
  const pushOut = (p, radius) => {
    let nx = 0;
    let nz = 0;
    let hit = false;
    const feet = p.y ?? 0;
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (const c of near(p.x, p.z)) {
        if (c.off) continue;
        const wx = p.x - c.x;
        const wz = p.z - c.z;
        const cc = c.c ?? 1;
        const cs = c.s ?? 0;
        const dx = wx * cc - wz * cs;
        const dz = wx * cs + wz * cc;
        if (Math.abs(dx) > c.hw + radius || Math.abs(dz) > c.hd + radius) continue;
        if (topOf(c) <= feet + STEP) continue;
        const px = Math.min(c.hw, Math.max(-c.hw, dx));
        const pz = Math.min(c.hd, Math.max(-c.hd, dz));
        const ox = dx - px;
        const oz = dz - pz;
        const d = Math.hypot(ox, oz);
        if (d < radius) {
          let ax;
          let az;
          let depth;
          if (d > 1e-4) {
            ax = ox / d;
            az = oz / d;
            depth = radius - d;
          } else {
            const edgeX = c.hw - Math.abs(dx);
            const edgeZ = c.hd - Math.abs(dz);
            if (edgeX < edgeZ) {
              ax = Math.sign(dx || 1);
              az = 0;
              depth = radius + edgeX;
            } else {
              ax = 0;
              az = Math.sign(dz || 1);
              depth = radius + edgeZ;
            }
          }
          const gx = ax * cc + az * cs;
          const gz = -ax * cs + az * cc;
          p.x += gx * depth;
          p.z += gz * depth;
          nx += gx;
          nz += gz;
          hit = changed = true;
        }
      }
      if (!changed) break;
    }
    const n = Math.hypot(nx, nz);
    return hit ? { x: nx / Math.max(n, 1e-5), z: nz / Math.max(n, 1e-5) } : null;
  };

  const state = { vx: 0, vz: 0, radius: 0.42, fastWalk: false };

  return {
    keys,
    floorAt,
    STEP,
    get fastWalk() {
      return state.fastWalk;
    },
    set fastWalk(v) {
      state.fastWalk = !!v;
    },
    toggleFastWalk() {
      state.fastWalk = !state.fastWalk;
      return state.fastWalk;
    },
    dirty() {
      gridN = -1;
    },
    /** 返回这一帧走了多远、当前速度和步态（walk / fastWalk / run）。 */
    step(dt, p, cam, speedScale = 1, allowWater = false, canSprint = true) {
      const f = cam.forward;
      const rxp = -f.y;
      const rzp = f.x;
      let mx = 0;
      let mz = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
      const len = Math.hypot(mx, mz) || 1;
      const sprint = canSprint && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
      const brisk = !sprint && (state.fastWalk || keys.has('ControlRight'));
      const base = sprint ? 11.0 : brisk ? 7.4 : 4.8;
      const wantX = ((f.x * mz + rxp * mx) / len) * base * speedScale;
      const wantZ = ((f.y * mz + rzp * mx) / len) * base * speedScale;
      const grip = 12;
      state.vx += (wantX - state.vx) * Math.min(1, dt * grip);
      state.vz += (wantZ - state.vz) * Math.min(1, dt * grip);
      const ox = p.x;
      const oz = p.z;
      p.x += state.vx * dt;
      p.z += state.vz * dt;
      const lim = HALF - 40;
      if (Math.abs(p.x) > lim) p.x = Math.sign(p.x) * lim;
      if (Math.abs(p.z) > lim) p.z = Math.sign(p.z) * lim;
      const contact = pushOut(p, state.radius);
      if (contact) {
        const into = state.vx * contact.x + state.vz * contact.z;
        if (into < 0) {
          state.vx -= contact.x * into;
          state.vz -= contact.z * into;
          state.vx *= 0.86;
          state.vz *= 0.86;
        }
      }
      if (!allowWater && inLake(p.x, p.z)) {
        p.x = ox;
        p.z = oz;
        state.vx *= 0.4;
        state.vz *= 0.4;
      }
      const speed = Math.hypot(state.vx, state.vz);
      p.speed = speed;
      const gait = sprint ? 'run' : brisk ? 'fastWalk' : 'walk';
      return { moved: Math.hypot(p.x - ox, p.z - oz), speed, gait };
    },
  };
}
