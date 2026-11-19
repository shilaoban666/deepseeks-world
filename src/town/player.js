// 主角：小鲸鱼（鲸鱼娘）的贴图立牌 + 第三人称相机 + 走路和碰撞。
// 贴图是从两张画好的图裁出来的（正面 / 背面），相机转到她背后就用背面，
// 转到前面就用正面。她写进 alpha 的是一个很小的数，所以：
//   1) frame.js 的笔触收尾不会把她抹成一团（alpha < 0.6 表示"已经是画好的了"）
//   2) 收尾的墨线会沿着她自动描一圈（相邻 alpha 差够大），和原作里那个漫游者是同一个机制
import * as THREE from 'three';
import { COMMON } from '../lib/index.js';
import { heightAt, walkAt, inLake, START, START_YAW, HALF } from './plan.js';

const billboardVertex = /* glsl */ `
out vec2 vUv;
out vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const billboardFragment = /* glsl */ `
${COMMON}
uniform sampler2D tArt;
uniform vec3 uTint;
uniform float uAlpha;
in vec2 vUv;
in vec3 vWorld;
layout(location = 0) out vec4 outC;
void main() {
  vec4 t = texture(tArt, vUv);
  if (t.a < 0.5) discard;
  vec3 col = t.rgb * uTint;
  outC = vec4(applyFog(col, vWorld), uAlpha);
}
`;

const shadowFragment = /* glsl */ `
${COMMON}
in vec2 vUv;
layout(location = 0) out vec4 outC;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, d) * 0.5;
  outC = vec4(mix(vec3(0.05, 0.09, 0.14), uSkyColor * 0.2, 0.25), a);
}
`;

const shadowVertex = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// 动画帧：图集里的一格。uRect = 这一格的 u0, v0, 宽, 高；uFlip = 1 时左右翻转（侧跑的原画朝左）
const clipVertex = /* glsl */ `
uniform vec4 uRect;
uniform float uFlip;
out vec2 vUv;
out vec3 vWorld;
void main() {
  float u = mix(uv.x, 1.0 - uv.x, uFlip);
  vUv = uRect.xy + vec2(u, uv.y) * uRect.zw;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const ART = { w: 512, h: 768 };
const VIEWS = ['front', 'side', 'back'];

/** 读三张画（正面/侧面/背面，都来自 dsh-pet 的官方立绘），各做成一个材质。 */
export async function loadWhalechan(shared, base = './figures/') {
  const loader = new THREE.TextureLoader();
  const load = (f) =>
    new Promise((res, rej) =>
      loader.load(
        base + f,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.magFilter = THREE.LinearFilter;
          t.needsUpdate = true;
          res(t);
        },
        undefined,
        rej,
      ),
    );
  const textures = await Promise.all(VIEWS.map((v) => load(`whalechan-${v}.png`)));
  const make = (tex) =>
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: billboardVertex,
      fragmentShader: billboardFragment,
      uniforms: { ...shared, tArt: { value: tex }, uTint: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 0.16 } },
      side: THREE.DoubleSide,
    });
  const mats = Object.fromEntries(VIEWS.map((v, i) => [v, make(textures[i])]));
  // 动画（从 dsh-pet 的透明动画里抽的帧：侧跑 / 小跑 / 待机 / 抱膝坐）。缺了就退回静态立绘。
  const clips = {};
  try {
    const res = await fetch(`${base}clips.json`);
    if (res.ok) {
      const info = await res.json();
      await Promise.all(
        Object.entries(info).map(async ([name, c]) => {
          const tex = await load(c.file);
          tex.generateMipmaps = false;
          tex.minFilter = THREE.LinearFilter;
          clips[name] = {
            ...c,
            material: new THREE.ShaderMaterial({
              glslVersion: THREE.GLSL3,
              vertexShader: clipVertex,
              fragmentShader: billboardFragment,
              uniforms: { ...shared, tArt: { value: tex }, uTint: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 0.16 }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uFlip: { value: 0 } },
              side: THREE.DoubleSide,
            }),
          };
        }),
      );
    }
  } catch (e) {
    console.warn('主角动画没载入，用静态立绘', e);
  }
  return { ...mats, art: ART, clips };
}

/** 把角度收进 [-π, π]。 */
const wrapPi = (a) => {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
};

/**
 * 选哪张图：相机在她正前方 → 正面；正后方 → 背面；中间 → 侧面。
 * @param yawToCam 从她指向相机的角度
 * @param facing 她的朝向
 */
export function pickView(yawToCam, facing) {
  const d = Math.abs(wrapPi(yawToCam - facing));
  if (d < Math.PI / 3) return 'front';
  if (d > (Math.PI * 2) / 3) return 'back';
  return 'side';
}

/**
 * 主角：一个永远面向相机的立牌（宽高比按 512×768），脚在地面上。
 * @param arts loadWhalechan 的结果
 */
export function createWhalechan(shared, arts) {
  const group = new THREE.Group();
  // 真人高度（1.68 m）。立绘本身是 Q 版比例，所以看起来头偏大——这是画风决定的，不是缩放错了。
  const height = 1.68;
  const width = (height * ART.w) / ART.h;
  const geo = new THREE.PlaneGeometry(width, height);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, arts.back);
  mesh.frustumCulled = false;
  group.add(mesh);
  // 动画用的立牌：一格是视频里 320×280 的一块，人在里面高约 216 像素、脚离下边 21 像素
  const PX = height / 216;
  const clipGeo = new THREE.PlaneGeometry(320 * PX, 280 * PX);
  clipGeo.translate(0, (280 * PX) / 2 - 21 * PX, 0);
  const clips = arts.clips ?? {};
  const anim = new THREE.Mesh(clipGeo, Object.values(clips)[0]?.material ?? arts.back);
  anim.frustumCulled = false;
  anim.visible = false;
  group.add(anim);
  let clipTime = 0;
  let clipName = '';
  /** 播一段：按时间取帧，写进这段材质的 uRect */
  const play = (name, dt, speed = 1, flip = false) => {
    const c = clips[name];
    if (!c) return false;
    if (clipName !== name) {
      clipName = name;
      clipTime = 0;
    }
    clipTime += dt * speed;
    const i = Math.floor((clipTime / c.seconds) * c.frames) % c.frames;
    const col = i % c.cols;
    const row = Math.floor(i / c.cols);
    c.material.uniforms.uRect.value.set(col / c.cols, 1 - (row + 1) / c.rows, 1 / c.cols, 1 / c.rows);
    c.material.uniforms.uFlip.value = flip ? 1 : 0;
    if (anim.material !== c.material) anim.material = c.material;
    return true;
  };

  // 影子：一块跟着地面转的圆
  const shadowGeo = new THREE.PlaneGeometry(width * 0.9, width * 0.55);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(
    shadowGeo,
    new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: shadowVertex, fragmentShader: shadowFragment, uniforms: { ...shared }, transparent: true, depthWrite: false }),
  );
  shadow.renderOrder = 2;
  group.add(shadow);

  const state = {
    x: START[0],
    z: START[1],
    y: heightAt(START[0], START[1]),
    yaw: START_YAW,
    vy: 0,
    onGround: true,
    speed: 0,
    walkPhase: 0,
    facingCamera: 0,
  };

  return {
    group,
    mesh,
    state,
    width,
    height,
    /**
     * 每帧更新立牌朝向和动作。
     * 坐着：抱膝坐。走着：镜头在侧面播侧跑（按往屏幕左还是右翻转）、在正面播小跑、在背后用背面立绘加摆动。
     * 站着：镜头在正面播待机呼吸，其余用静态立绘。
     */
    update(dt, camera, moving, pose = null) {
      const pos = group.position;
      pos.x = state.x;
      pos.y = state.y;
      pos.z = state.z;
      // 立牌绕着 Y 转向相机
      const yawToCam = Math.atan2(camera.position.x - state.x, camera.position.z - state.z);
      mesh.rotation.y = anim.rotation.y = yawToCam;
      const facing = Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw));
      const view = pickView(yawToCam, facing);
      // 她往屏幕右边走：立牌的 +x 就是屏幕右。原画朝左，所以往右走要翻转
      const right = Math.sin(state.yaw) * Math.cos(yawToCam) - Math.cos(state.yaw) * Math.sin(yawToCam);
      const running = pose === 'run';
      const air = pose === 'air';
      const swim = pose === 'swim';
      const dive = pose === 'dive';
      const climb = pose === 'climb';
      const resting = pose === 'sit' || pose === 'lie' || pose === 'fish';
      state.walkPhase += dt * (moving ? (running ? 13 : dive ? 4 : 9) : swim ? 3 : 2.2);
      let animated = false;
      let forceView = null;
      if (resting) animated = play('sit', dt, pose === 'lie' ? 0.55 : 1);
      else if (climb) forceView = 'back';
      else if (dive) animated = play('run', dt, moving ? 0.8 : 0.35, right > 0);
      else if ((moving || air) && view === 'side') animated = play('run', dt, running ? 2.2 : air ? 0.6 : 1.5, right > 0);
      else if ((moving || air) && view === 'front') animated = play('jog', dt, running ? 2 : air ? 0.5 : 1.4);
      else if (!moving && view === 'front') animated = play('idle', dt, 1);
      anim.visible = animated;
      mesh.visible = !animated;
      if (!animated) {
        clipName = '';
        const v = forceView ?? view;
        if (mesh.material !== arts[v]) mesh.material = arts[v];
      }
      // 走动时的小动作：上下颠、左右摆（背面没有动画帧，靠这个）
      const step = moving && !air && !climb && !swim && !dive;
      const bob = step ? Math.abs(Math.sin(state.walkPhase)) * (running ? 0.1 : 0.07) : Math.sin(state.walkPhase) * (swim ? 0.06 : 0.012);
      mesh.position.set(0, bob, 0);
      anim.position.set(0, step ? bob * 0.5 : swim ? bob : 0, 0);
      let tilt = step ? Math.sin(state.walkPhase) * (running ? 0.09 : 0.06) : Math.sin(state.walkPhase * 0.6) * 0.012;
      let sx = 1 + (step ? Math.sin(state.walkPhase * 2) * 0.025 : 0);
      let sy = 1 - (step ? Math.sin(state.walkPhase * 2) * 0.03 : 0);
      if (air) {
        // 跳：往上冲的时候拉长，往下落的时候压扁一点
        const k = Math.max(-0.14, Math.min(0.18, state.vy * 0.035));
        sy = 1 + k;
        sx = 1 - k * 0.6;
        tilt = (right > 0 ? -1 : 1) * 0.08;
      }
      if (climb) {
        // 抱着树干：左右晃，往上爬的时候一耸一耸
        tilt = Math.sin(state.walkPhase * 0.8) * 0.05;
        mesh.position.y = moving ? Math.abs(Math.sin(state.walkPhase * 1.3)) * 0.12 : 0;
      }
      if (dive) {
        // 潜水：整个人横过来（头朝前进的方向），身子一波一波
        tilt = (right > 0 ? -1 : 1) * (1.2 + Math.sin(state.walkPhase) * 0.08);
        anim.position.set(right > 0 ? -0.55 : 0.55, 0.9, 0);
      }
      mesh.rotation.z = tilt;
      anim.rotation.z = dive ? tilt : air ? tilt : 0;
      mesh.scale.set(sx, sy, 1);
      anim.scale.set(air ? sx : 1, air ? sy : 1, 1);
      // 影子贴着地面（跳起来的时候影子留在地上、变小）；水里和树上没有影子
      const groundY = state.groundY ?? state.y;
      shadow.position.set(0, groundY - state.y + 0.03, 0);
      shadow.visible = !swim && !dive && state.y - groundY < 4;
      const s = 1 - Math.min(0.5, (state.y - groundY) * 0.12);
      shadow.scale.setScalar(Math.max(0.4, s) * 1.1);
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
    pitch: 0.22,
    distance: 7.5,
    want: 7.5,
    pivot: new THREE.Vector3(),
    minPitch: -0.35,
    maxPitch: 1.15,
    maxDistance: 26,
    blocked: 1,
    /** 看的方向（给主角走路用） */
    forward: new THREE.Vector2(0, 1),
  };
  // 屋里的限制：天花板 2.9 m，所以镜头不能拉太远、也不能仰太高（仰过头会穿到天花板上）
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
    // 别钻进房子里：从人往镜头方向一步步探，碰到建筑的碰撞盒就停在它前面
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
          if (Math.abs(px - c.x) < c.hw + 0.35 && Math.abs(pz - c.z) < c.hd + 0.35 && py < groundAt(c.x, c.z) + (c.top ?? 20)) {
            k = Math.max(0.16, (i - 1.2) / steps);
            break scan;
          }
        }
      }
    }
    cam.blocked += ((k < 1 ? k : 1) - cam.blocked) * Math.min(1, dt * (k < cam.blocked ? 30 : 4));
    const kk = cam.blocked;
    wanted.set(cam.pivot.x + offX * kk, cam.pivot.y + (offY + 0.6) * kk + (1 - kk) * 0.5, cam.pivot.z + offZ * kk);
    // 别钻到地里
    const gy = groundAt(wanted.x, wanted.z) + 1.1;
    if (wanted.y < gy) wanted.y = gy;
    camera.position.lerp(wanted, Math.min(1, dt * 12));
    camera.lookAt(cam.pivot);
    // 前后左右（沿地面，不看俯仰）
    cam.forward.set(-Math.sin(cam.yaw), -Math.cos(cam.yaw));
  };
  return cam;
}

/**
 * 走路：WASD 相对相机方向，Shift 跑。碰撞是轴对齐盒（建筑）加上"不能下水"和地图边界。
 * @param o.colliders [{x, z, hw, hd, top}]
 */
export function createMover(o) {
  // 碰撞盒可以换（屋里的家具和外面的建筑各一套）
  const list = () => o.colliderList?.() ?? o.colliders ?? [];
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  /** 圆形的人对轴对齐的盒子：把圆推出去。 */
  const pushOut = (p, radius) => {
    for (const c of list()) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      // 快速剔除
      if (Math.abs(dx) > c.hw + radius + 2 || Math.abs(dz) > c.hd + radius + 2) continue;
      const px = Math.min(c.hw, Math.max(-c.hw, dx));
      const pz = Math.min(c.hd, Math.max(-c.hd, dz));
      const ox = dx - px;
      const oz = dz - pz;
      const d = Math.hypot(ox, oz);
      if (d < radius) {
        if (d > 1e-4) {
          p.x += (ox / d) * (radius - d);
          p.z += (oz / d) * (radius - d);
        } else {
          // 圆心在盒子里：往最近的那条边推
          const l = Math.abs(dx) - c.hw;
          const r2 = Math.abs(dz) - c.hd;
          if (l > r2) p.x += Math.sign(dx || 1) * (radius - l);
          else p.z += Math.sign(dz || 1) * (radius - r2);
        }
      }
    }
  };

  const state = { vx: 0, vz: 0, radius: 0.42 };

  return {
    keys,
    /** 返回这一帧走了多远（给小地图和脚步声用）。 */
    step(dt, p, cam, speedScale = 1, allowWater = false) {
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
      const base = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 10.8 : 5.35;
      const wantX = ((f.x * mz + rxp * mx) / len) * base * speedScale;
      const wantZ = ((f.y * mz + rzp * mx) / len) * base * speedScale;
      const grip = 12;
      state.vx += (wantX - state.vx) * Math.min(1, dt * grip);
      state.vz += (wantZ - state.vz) * Math.min(1, dt * grip);
      const ox = p.x;
      const oz = p.z;
      p.x += state.vx * dt;
      p.z += state.vz * dt;
      // 边界
      const lim = HALF - 40;
      if (Math.abs(p.x) > lim) p.x = Math.sign(p.x) * lim;
      if (Math.abs(p.z) > lim) p.z = Math.sign(p.z) * lim;
      pushOut(p, state.radius);
      // 不下水
      if (!allowWater && inLake(p.x, p.z)) {
        p.x = ox;
        p.z = oz;
        state.vx *= 0.4;
        state.vz *= 0.4;
      }
      return { moved: Math.hypot(p.x - ox, p.z - oz), speed: Math.hypot(state.vx, state.vz) };
    },
  };
}
