// 天气：晴、大太阳、多云、大风、下雨、雷雨、冰霜。
//
// 做法：天上的光每小时由 sky.setHour 算一遍（"基准光"），天气每帧在基准光上调——
// 阴天把太阳压暗、把天和雾往灰里推；下雨再加一层雨丝和地上的涟漪；雷雨隔几秒一道闪电，
// 闪电劈在草上会点着草（火怎么烧、怎么顺风扩散，是 src/lib/state.js 那套草地的模拟）；
// 冰霜让草地和屋顶变白、天上飘雪。风是真的风：草、树、落叶、火都跟着它走。
//
// 所有数值都是"往目标慢慢靠"，所以换天气是一个过程，不是一下子跳过去：
// 云先压过来，风再起，然后才下雨；雨停了，地还要湿一阵才干。
import * as THREE from 'three';
import { COMMON } from '../lib/index.js';

/** 每种天气的目标值。overcast 阴的程度；rain/snow 降水；wind 风速 m/s；sun 太阳强度；temp 气温 */
export const WEATHERS = {
  sunny: { name: '大太阳', icon: '☀️', overcast: 0, rain: 0, snow: 0, wind: 1.6, sun: 1.3, exposure: 1.07, temp: 32, leaves: 0, lightning: 0, frost: 0 },
  clear: { name: '晴', icon: '🌤️', overcast: 0.08, rain: 0, snow: 0, wind: 3, sun: 1, exposure: 1, temp: 24, leaves: 0, lightning: 0, frost: 0 },
  cloudy: { name: '多云', icon: '☁️', overcast: 0.5, rain: 0, snow: 0, wind: 4, sun: 1, exposure: 0.97, temp: 20, leaves: 0.15, lightning: 0, frost: 0 },
  windy: { name: '大风', icon: '🌬️', overcast: 0.32, rain: 0, snow: 0, wind: 10.5, sun: 1, exposure: 1, temp: 17, leaves: 1, lightning: 0, frost: 0 },
  rain: { name: '下雨', icon: '🌧️', overcast: 0.86, rain: 0.75, snow: 0, wind: 5, sun: 1, exposure: 0.84, temp: 15, leaves: 0.2, lightning: 0, frost: 0 },
  storm: { name: '雷雨', icon: '⛈️', overcast: 1, rain: 1, snow: 0, wind: 9, sun: 1, exposure: 0.7, temp: 13, leaves: 0.7, lightning: 1, frost: 0 },
  frost: { name: '冰霜', icon: '❄️', overcast: 0.55, rain: 0, snow: 0.85, wind: 2.6, sun: 1, exposure: 1.02, temp: -3, leaves: 0, lightning: 0, frost: 1 },
};
const ORDER = ['sunny', 'clear', 'cloudy', 'windy', 'rain', 'storm', 'frost'];
/** 自动模式下，下一个天气往哪儿走（权重）。冰霜很少，雷雨总在下雨之后。 */
const NEXT = {
  sunny: { sunny: 2, clear: 4, cloudy: 2 },
  clear: { sunny: 3, clear: 3, cloudy: 3, windy: 1 },
  cloudy: { clear: 3, cloudy: 1, windy: 2, rain: 3, frost: 0.5 },
  windy: { cloudy: 3, clear: 2, rain: 2, storm: 1 },
  rain: { cloudy: 3, rain: 2, storm: 2, clear: 1 },
  storm: { rain: 4, cloudy: 2 },
  frost: { frost: 2, cloudy: 3, clear: 2 },
};

// ---- 雨和雪：一盒跟着镜头走的粒子，位置全在显卡里算 ----------------------------------------------------------
const fallVertex = /* glsl */ `
${COMMON}
in vec4 aSeed;
uniform float uFallTime;
uniform float uRainAmt;
uniform float uSnowAmt;
uniform vec3 uFall;     // 雨落下的速度（带着风）
uniform float uBox;
uniform float uTall;
out float vSnow;
out float vFade;
out vec2 vUv;
out vec3 vWorld;
void main() {
  // 一半的粒子当雨、一半当雪；各自按量多少决定画不画
  float snow = step(0.5, fract(aSeed.w * 7.31));
  float amt = mix(uRainAmt, uSnowAmt, snow);
  if (fract(aSeed.w * 13.7) > amt) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 fall = snow > 0.5 ? vec3(uFall.x * 0.35, -1.3, uFall.z * 0.35) : uFall;
  vec3 p = vec3(aSeed.x * uBox, aSeed.y * uTall, aSeed.z * uBox) + fall * uFallTime * (0.85 + 0.3 * aSeed.w);
  vec3 origin = uCamPos - vec3(uBox * 0.5, uTall * 0.45, uBox * 0.5);
  p = origin + mod(p - origin, vec3(uBox, uTall, uBox));
  if (snow > 0.5) {
    p.x += sin(uFallTime * 1.1 + aSeed.x * 40.0) * 0.5;
    p.z += cos(uFallTime * 0.9 + aSeed.z * 40.0) * 0.5;
  }
  // 落到地面以下的不画（城里地面就是这张高度图）
  if (p.y < groundAt(p.xz) - 0.2) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 toCam = uCamPos - p;
  float dist = length(toCam);
  toCam /= max(dist, 1e-3);
  vec3 world;
  if (snow < 0.5) {
    vec3 dir = normalize(uFall);
    vec3 side = normalize(cross(dir, toCam) + vec3(1e-5));
    world = p + side * position.x * (0.022 + dist * 0.0018) + dir * position.y * 0.8;
  } else {
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1e-5, 0.0, 0.0));
    vec3 up = cross(toCam, right);
    float s = 0.07 + 0.06 * aSeed.y + dist * 0.002;
    world = p + (right * position.x + up * position.y) * s;
  }
  vSnow = snow;
  // 太近的（贴着镜头）和太远的都淡掉
  vFade = smoothstep(0.6, 2.5, dist) * (1.0 - smoothstep(uBox * 0.32, uBox * 0.5, dist));
  vUv = position.xy + 0.5;
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const fallFragment = /* glsl */ `
${COMMON}
in float vSnow;
in float vFade;
in vec2 vUv;
in vec3 vWorld;
layout(location = 0) out vec4 outC;
void main() {
  vec2 p = vUv - 0.5;
  float a;
  vec3 col;
  if (vSnow < 0.5) {
    a = (1.0 - smoothstep(0.2, 0.5, abs(p.x))) * (1.0 - smoothstep(0.3, 0.5, abs(p.y))) * 0.6;
    col = vec3(0.78, 0.86, 0.96) * (uSkyColor * 0.9 + 0.35);
  } else {
    a = 1.0 - smoothstep(0.3, 0.5, length(p));
    col = vec3(0.96, 0.97, 1.0) * (uSkyColor * 0.6 + uSunColor * 0.12 + 0.45);
  }
  a *= vFade;
  if (a < 0.01) discard;
  outC = vec4(applyFog(col, vWorld), a);
}
`;

// ---- 闪电：一条歪歪扭扭的折线，画成永远面向镜头的带子 --------------------------------------------------------
const boltVertex = /* glsl */ `
${COMMON}
in vec3 aDir;
in float aSide;
in float aWidth;
void main() {
  vec3 toCam = normalize(uCamPos - position);
  vec3 side = normalize(cross(aDir, toCam) + vec3(1e-5));
  vec3 world = position + side * aSide * aWidth;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;
const boltFragment = /* glsl */ `
uniform float uBolt;
layout(location = 0) out vec4 outC;
void main() {
  if (uBolt < 0.02) discard;
  // 很亮（让 bloom 把它晕开）；alpha 0.4：不被笔触抹掉，也不描墨线
  outC = vec4(vec3(7.0, 7.4, 9.0) * uBolt, 0.4);
}
`;

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param o.field createField 的结果；o.frame createFrame 的结果；o.particles createParticles 的结果
 * @param o.lite 弱显卡：雨雪粒子少一半
 */
export function createWeather({ field, frame, particles, lite = false, ignite = null }) {
  const u = field.uniforms;
  const group = new THREE.Group();

  // ---- 雨雪 ----
  const N = lite ? 4200 : 9000;
  const quad = new THREE.PlaneGeometry(1, 1);
  const fallGeo = new THREE.InstancedBufferGeometry();
  fallGeo.index = quad.index;
  fallGeo.attributes.position = quad.attributes.position;
  const seeds = new Float32Array(N * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  fallGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  fallGeo.instanceCount = N;
  const fallUniforms = { ...u, uFallTime: { value: 0 }, uRainAmt: { value: 0 }, uSnowAmt: { value: 0 }, uFall: { value: new THREE.Vector3(0, -14, 0) }, uBox: { value: 46 }, uTall: { value: 26 } };
  const fallMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: fallVertex,
    fragmentShader: fallFragment,
    uniforms: fallUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const fall = new THREE.Mesh(fallGeo, fallMat);
  fall.frustumCulled = false;
  fall.renderOrder = 9;
  group.add(fall);

  // ---- 闪电 ----
  const boltUniforms = { ...u, uBolt: { value: 0 } };
  const boltMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: boltVertex, fragmentShader: boltFragment, uniforms: boltUniforms, side: THREE.DoubleSide, depthWrite: false });
  const bolt = new THREE.Mesh(new THREE.BufferGeometry(), boltMat);
  bolt.frustumCulled = false;
  bolt.renderOrder = 10;
  group.add(bolt);
  const buildBolt = (x, y, z, top) => {
    const pos = [];
    const dir = [];
    const side = [];
    const width = [];
    const idx = [];
    const line = (pts, w) => {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const d = new THREE.Vector3().subVectors(b, a).normalize();
        const base = pos.length / 3;
        for (const s of [-1, 1]) {
          pos.push(pts[i].x, pts[i].y, pts[i].z);
          dir.push(d.x, d.y, d.z);
          side.push(s);
          width.push(w * (1 - (0.6 * i) / pts.length));
        }
        if (i > 0) idx.push(base - 2, base - 1, base, base - 1, base + 1, base);
      }
    };
    const main = [];
    const n = 26;
    let px = x + (Math.random() - 0.5) * 60;
    let pz = z + (Math.random() - 0.5) * 60;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      px = lerp(px, x, 0.18 + t * 0.4) + (Math.random() - 0.5) * 14 * (1 - t);
      pz = lerp(pz, z, 0.18 + t * 0.4) + (Math.random() - 0.5) * 14 * (1 - t);
      main.push(new THREE.Vector3(i === n ? x : px, lerp(top, y, t), i === n ? z : pz));
    }
    line(main, 1.1);
    // 两三根分叉
    for (let b = 0; b < 3; b++) {
      const from = main[4 + Math.floor(Math.random() * 12)];
      const pts = [from.clone()];
      const ang = Math.random() * 6.28;
      for (let i = 1; i < 8; i++) pts.push(pts[i - 1].clone().add(new THREE.Vector3(Math.cos(ang) * 9 + (Math.random() - 0.5) * 8, -14 - Math.random() * 8, Math.sin(ang) * 9 + (Math.random() - 0.5) * 8)));
      line(pts, 0.5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setAttribute('aWidth', new THREE.Float32BufferAttribute(width, 1));
    g.setIndex(idx);
    bolt.geometry.dispose();
    bolt.geometry = g;
  };

  // ---- 声音：全部现场合成（雨声、风声、雷声），不用录音文件 ----
  let audio = null;
  const startAudio = () => {
    if (audio || typeof AudioContext === 'undefined' || new URLSearchParams(location.search).has('mute')) return;
    const ctx = new AudioContext();
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const brown = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < b.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
    const loop = (filterType, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(ctx.destination);
      src.start();
      return g;
    };
    audio = { ctx, brown, rain: loop('highpass', 900, 0.4), wind: loop('bandpass', 380, 0.8) };
  };
  window.addEventListener('keydown', startAudio, { once: false });
  window.addEventListener('pointerdown', startAudio, { once: false });
  const thunder = (delay, loud) => {
    if (!audio) return;
    const { ctx, brown } = audio;
    const src = ctx.createBufferSource();
    src.buffer = brown;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 160 + loud * 260;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.9 * loud, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.25 * loud, t0 + 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 3.6);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + 4);
  };

  // ---- 状态 ----
  const cur = { ...WEATHERS.clear, wet: 0, frostNow: 0 };
  let kind = 'clear';
  let auto = true;
  let nextChange = 3 * 60; // 游戏分钟
  let windAngle = 0.6;
  let flash = 0;
  let boltLife = 0;
  let nextBolt = 6;
  let leafAcc = 0;
  let rippleAcc = 0;
  let flyAcc = 0;
  let fallTime = 0;
  const base = {};
  const C = (c) => c.clone();
  const grey = (c, k) => {
    const l = (c.r + c.g + c.b) / 3;
    return c.clone().lerp(new THREE.Color(l, l, l), k);
  };
  let sky = null;

  const weather = {
    group,
    get kind() {
      return kind;
    },
    get auto() {
      return auto;
    },
    get info() {
      const w = WEATHERS[kind];
      return { kind, name: w.name, icon: w.icon, temp: Math.round(cur.temp), wind: cur.wind, windAngle, rain: cur.rain, snow: cur.snow, wet: cur.wet, auto };
    },
    list: ORDER.map((k) => ({ kind: k, ...WEATHERS[k] })),
    /** 天上的光算好以后调一下：记住基准光 */
    capture(s) {
      if (s) sky = s;
      base.sun = C(u.uSunColor.value);
      base.sky = C(u.uSkyColor.value);
      base.fog = C(u.uFogColor.value);
      base.fogSun = C(u.uFogSunColor.value);
      base.density = u.uFogDensity.value;
      if (sky) {
        const su = sky.uniforms;
        base.zenith = C(su.uZenith.value);
        base.mid = C(su.uMid.value);
        base.horizon = C(su.uHorizon.value);
        base.bankLit = C(su.uBankLit.value);
        base.bankShade = C(su.uBankShade.value);
      }
    },
    /** 换天气。immediate：不要过渡（截图用） */
    set(k, { immediate = false, manual = true } = {}) {
      if (k === 'auto') {
        auto = true;
        return;
      }
      if (!WEATHERS[k]) return;
      kind = k;
      if (manual) auto = false;
      windAngle += (Math.random() - 0.5) * 1.2;
      if (immediate) {
        Object.assign(cur, WEATHERS[k]);
        cur.wet = WEATHERS[k].rain > 0 ? 1 : 0;
        cur.frostNow = WEATHERS[k].frost;
      }
    },
    /** 闪电劈一下（不传位置就劈在镜头附近随便哪儿） */
    strike(camera, at = null) {
      const a = Math.random() * 6.28;
      const r = 60 + Math.random() * 260;
      const x = at?.x ?? camera.position.x + Math.cos(a) * r;
      const z = at?.z ?? camera.position.z + Math.sin(a) * r;
      const y = field.heightAt(x, z);
      buildBolt(x, y, z, y + 260 + Math.random() * 80);
      boltLife = 0.42;
      flash = 1;
      const dist = Math.hypot(x - camera.position.x, z - camera.position.z);
      thunder(dist / 340, Math.max(0.25, 1 - dist / 600));
      // 劈在草上：点着（有雨的话烧不了多久就会被浇灭）
      if (Math.random() < 0.6 || at) {
        ignite?.(x, z, 1.6);
        for (let i = 0; i < 24; i++) particles.emit({ x, y: y + 0.4, z, vx: (Math.random() - 0.5) * 9, vy: 3 + Math.random() * 7, vz: (Math.random() - 0.5) * 9, life: 0.9, size: 0.08, color: [4, 2.6, 1.2], alpha: 1, gravity: 9 });
      }
      return { x, z, dist };
    },
    /**
     * 每帧。
     * @param minutes 游戏时间（分钟），给自动换天气用；outdoor false 时只推进状态、不改画面
     * @param night 0~1，夜里萤火虫出来
     */
    update(dt, camera, { minutes = 0, outdoor = true, night = 0 } = {}) {
      // 自动换天气
      if (auto && minutes > nextChange) {
        const w = NEXT[kind];
        let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
        for (const [k, p] of Object.entries(w)) {
          r -= p;
          if (r <= 0) {
            weather.set(k, { manual: false });
            break;
          }
        }
        nextChange = minutes + (2 + Math.random() * 3) * 60;
      }
      if (minutes < nextChange - 600) nextChange = minutes + 3 * 60; // 跨天了
      // 往目标靠：云来得快、雨来得慢；地慢慢湿、慢慢干；霜慢慢结
      const t = WEATHERS[kind];
      const k = (rate) => Math.min(1, dt * rate);
      cur.overcast = lerp(cur.overcast, t.overcast, k(0.35));
      cur.rain = lerp(cur.rain, cur.overcast > 0.6 ? t.rain : 0, k(0.25));
      cur.snow = lerp(cur.snow, t.snow, k(0.25));
      cur.wind = lerp(cur.wind, t.wind, k(0.3));
      cur.sun = lerp(cur.sun, t.sun, k(0.4));
      cur.exposure = lerp(cur.exposure, t.exposure, k(0.4));
      cur.temp = lerp(cur.temp, t.temp, k(0.2));
      cur.leaves = lerp(cur.leaves, t.leaves, k(0.5));
      cur.wet = cur.rain > 0.05 ? Math.min(1, cur.wet + dt * 0.2 * cur.rain) : Math.max(0, cur.wet - dt * 0.012);
      cur.frostNow = lerp(cur.frostNow, t.frost, k(0.12));

      // 风：草和火都读它；阵风大的时候风向也会摆
      windAngle += Math.sin(fallTime * 0.05) * dt * 0.02;
      field.setWind(windAngle, cur.wind, Math.min(1, 0.4 + cur.wind / 12));
      field.setDamp(Math.max(cur.wet, cur.frostNow * 0.8, cur.rain));
      u.uWetness.value = cur.wet;
      u.uFrost.value = cur.frostNow;

      fallTime += dt;
      fallUniforms.uFallTime.value = fallTime;
      fallUniforms.uRainAmt.value = outdoor ? cur.rain : 0;
      fallUniforms.uSnowAmt.value = outdoor ? cur.snow : 0;
      fallUniforms.uFall.value.set(Math.cos(windAngle) * cur.wind * 0.7, -15, Math.sin(windAngle) * cur.wind * 0.7);
      fall.visible = outdoor && (cur.rain > 0.01 || cur.snow > 0.01);

      // 闪电
      if (t.lightning && cur.overcast > 0.8 && outdoor) {
        nextBolt -= dt;
        if (nextBolt <= 0) {
          weather.strike(camera);
          nextBolt = 5 + Math.random() * 10;
        }
      }
      boltLife -= dt;
      boltUniforms.uBolt.value = boltLife > 0 ? (Math.sin(boltLife * 70) > -0.2 ? 1 : 0.3) * Math.min(1, boltLife * 5) : 0;
      flash = Math.max(0, flash - dt * 3.2);

      if (outdoor) {
        const cx = camera.position.x;
        const cz = camera.position.z;
        // 落叶：大风天从镜头上风处吹过来
        leafAcc += dt * cur.leaves * 22;
        while (leafAcc > 1) {
          leafAcc--;
          const a = Math.random() * 6.28;
          const r = 4 + Math.random() * 18;
          const x = cx + Math.cos(a) * r - Math.cos(windAngle) * 8;
          const z = cz + Math.sin(a) * r - Math.sin(windAngle) * 8;
          const y = field.heightAt(x, z) + 0.5 + Math.random() * 5;
          const green = Math.random() < 0.55;
          particles.emit({ x, y, z, vy: -0.3, life: 4 + Math.random() * 2, size: [0.11, 0.07], shape: 'leaf', color: green ? [0.42, 0.62, 0.22] : [0.86, 0.62, 0.22], alpha: 0.95, wind: 0.9, gravity: 0.5, drag: 0.3, spin: (Math.random() - 0.5) * 8, wobble: 1.2, floor: field.heightAt(x, z) + 0.05 });
        }
        // 雨点打在地上的小涟漪
        rippleAcc += dt * cur.rain * 60;
        while (rippleAcc > 1) {
          rippleAcc--;
          const x = cx + (Math.random() - 0.5) * 22;
          const z = cz + (Math.random() - 0.5) * 22;
          particles.ripple(x, field.heightAt(x, z) + 0.06, z, 0.08, 0.5);
        }
        // 晴天的夜里：草上一点点萤火
        flyAcc += dt * night * (1 - cur.overcast) * (1 - cur.frostNow) * 3;
        while (flyAcc > 1) {
          flyAcc--;
          const x = cx + (Math.random() - 0.5) * 30;
          const z = cz + (Math.random() - 0.5) * 30;
          particles.emit({ x, y: field.heightAt(x, z) + 0.3 + Math.random() * 1.2, z, vy: 0.1, life: 5, size: 0.06, color: [2.6, 3.2, 1.2], alpha: 0.9, wobble: 0.5, drag: 0.5 });
        }
      }

      // 声音
      if (audio) {
        audio.rain.gain.value = outdoor ? cur.rain * 0.22 : cur.rain * 0.05;
        audio.wind.gain.value = (outdoor ? 1 : 0.2) * Math.max(0, cur.wind - 3) * 0.018 * (0.7 + 0.3 * Math.sin(fallTime * 0.7));
      }
    },
    /** 在基准光上调这一帧的光（室外才调） */
    apply() {
      if (!base.sun) return;
      const o = cur.overcast;
      const sunK = (1 - 0.86 * o) * cur.sun;
      u.uSunColor.value.copy(base.sun).multiplyScalar(sunK);
      u.uSkyColor.value.copy(grey(base.sky, 0.6 * o)).multiplyScalar(1 - 0.22 * o + 0.15 * cur.frostNow);
      u.uFogColor.value.copy(grey(base.fog, 0.6 * o)).multiplyScalar(1 - 0.18 * o + 0.1 * cur.frostNow);
      u.uFogSunColor.value.copy(grey(base.fogSun, 0.7 * o)).multiplyScalar(1 - 0.3 * o);
      u.uFogDensity.value = base.density * (1 + 2.2 * o * o + 1.6 * cur.rain + 1.2 * cur.snow);
      u.uCloudShade.value = 0.15 + 0.4 * o;
      if (sky && base.zenith) {
        const su = sky.uniforms;
        const fogC = u.uFogColor.value;
        su.uZenith.value.copy(grey(base.zenith, 0.75 * o)).lerp(fogC, 0.35 * o).multiplyScalar(1 - 0.25 * o);
        su.uMid.value.copy(grey(base.mid, 0.75 * o)).lerp(fogC, 0.45 * o);
        su.uHorizon.value.copy(grey(base.horizon, 0.7 * o)).lerp(fogC, 0.5 * o);
        su.uBankLit.value.copy(grey(base.bankLit, 0.6 * o)).multiplyScalar(1 - 0.35 * o);
        su.uBankShade.value.copy(grey(base.bankShade, 0.6 * o)).multiplyScalar(1 - 0.3 * o);
      }
      frame.exposure *= cur.exposure * (1 + flash * 1.6);
      // 冷暖：大太阳偏暖，雨天偏冷，霜天偏蓝白
      const warm = (cur.sun - 1) * 0.8;
      frame.grade.x *= 1 + warm * 0.12 - o * 0.06 - cur.frostNow * 0.04;
      frame.grade.y *= 1 + warm * 0.04 - o * 0.03;
      frame.grade.z *= 1 - warm * 0.08 + o * 0.03 + cur.frostNow * 0.05;
    },
  };
  return weather;
}
