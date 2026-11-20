// 会动的小生命：天上的鸟群、海上的海鸥、湖里的鸭子和天鹅、河滩上的鹭、田里蹦跶的乌鸦喜鹊、海上和湖上漂着的船。
// 图是素材库的手绘精灵（life 图集，tools/pack-extra.py 打的），全部侧视朝左——往右走的时候翻个面。
// 一百多块立牌，每帧在 CPU 上算位置（很便宜），画的时候和其它立牌一样：alpha 0.16（笔触不刷，墨线自动描一圈），
// 跟着一天的光染色；飞着的鸟上下压一压当扇翅膀。夜里鸟都回窝了。
import * as THREE from 'three';
import { COMMON } from '../lib/index.js';
import { LAKE, SEA, PLAZA, coastX, heightAt, waterAt, riverAt, riverLevel, RIVER, RIVER_HALF, fieldsAt, DISTRICTS } from './plan.js';

const vertex = /* glsl */ `
${COMMON}
in vec4 aRect;
in vec3 aOffset;
in vec3 aLook; // 宽、高、翻面（±1）
in float aFlap; // 0 不扇；>0 扇翅的快慢
out vec2 vUv;
out vec3 vWorld;
void main() {
  vec2 c = position.xy;
  vec3 toCam = uCamPos - aOffset;
  vec3 flat_ = normalize(vec3(toCam.x, 0.0, toCam.z) + vec3(1e-5, 0.0, 0.0));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), flat_));
  float h = c.y + 0.5;
  float flap = aFlap > 0.0 ? abs(sin(uTime * aFlap + aOffset.x * 0.37)) : 1.0;
  float sy = aFlap > 0.0 ? 0.62 + 0.38 * flap : 1.0;
  vec3 world = aOffset + right * (c.x * aLook.x) + vec3(0.0, 1.0, 0.0) * ((h - (aFlap > 0.0 ? 0.5 : 0.0)) * aLook.y * sy);
  float u = aLook.z > 0.0 ? c.x + 0.5 : 0.5 - c.x;
  vUv = mix(aRect.xy, aRect.zw, vec2(u, c.y + 0.5));
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const fragment = /* glsl */ `
${COMMON}
uniform sampler2D tAtlas;
uniform float uNight;
in vec2 vUv;
in vec3 vWorld;
layout(location = 0) out vec4 outC;
void main() {
  vec4 t = texture(tAtlas, vUv);
  if (t.a < 0.5) discard;
  vec3 tint = uSunColor * 0.4 + uSkyColor * 0.34;
  tint = mix(tint, tint * vec3(0.42, 0.46, 0.62), uNight);
  outC = vec4(applyFog(t.rgb * tint * 1.9, vWorld), 0.16);
}
`;

/**
 * @param shared 场地的 uniforms
 * @param plants loadPlantAtlases() 的结果（要有 life）
 * @param random 一个确定的随机数（每次开局都一样）
 */
export function createLife(shared, plants, { random = Math.random } = {}) {
  const page = plants?.life?.[0];
  if (!page) return null;
  const byName = new Map(page.sprites.map((sp) => [sp.name, sp]));
  const things = [];
  const R = (a, b) => a + random() * (b - a);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const thing = (name, h, o) => {
    const sp = byName.get(name);
    if (!sp) return;
    things.push({ sp, h, w: (h * sp.w) / Math.max(1, sp.h), x: 0, y: 0, z: 0, vx: -1, flip: 1, flap: 0, ...o });
  };

  // ---- 天上的鸟群：镇子上空、田野上空，一群群绕着圈飞 ----------------------------------------------------------
  const flockSpots = [
    [PLAZA[0], PLAZA[1], 70, ['birds-barn-swallow', 'birds-common-swift']],
    [-60, 140, 60, ['birds-rock-pigeon', 'birds-collared-dove']],
    [-740, 180, 120, ['birds-barn-swallow', 'birds-house-sparrow']],
    [-330, 560, 80, ['birds-tree-sparrow', 'birds-house-sparrow', 'birds-great-tit']],
    [-640, -120, 60, ['birds-robin', 'birds-great-tit']],
    [200, -200, 90, ['birds-carrion-crow', 'birds-magpie']],
    [-560, -440, 70, ['birds-common-swift']],
  ];
  for (const [cx, cz, rad, kinds] of flockSpots) {
    const n = 5 + Math.floor(random() * 5);
    const base = { cx, cz, rad: rad * R(0.6, 1.1), alt: R(16, 34), speed: R(0.12, 0.22) * (random() < 0.5 ? -1 : 1), a0: R(0, 6.28) };
    for (let i = 0; i < n; i++) {
      thing(pick(kinds), R(0.55, 0.75), { kind: 'fly', f: base, da: R(-0.12, 0.12), dr: R(-6, 6), dy: R(-3, 3), flap: R(9, 14), turn: R(0.004, 0.012), phase: R(0, 6.28) });
    }
  }
  // ---- 海鸥：海面上空，绕着海滨小镇和沙滩 -----------------------------------------------------------------------
  for (let i = 0; i < 12; i++) {
    const z = R(-620, -240);
    const f = { cx: coastX(z) + R(-20, 120), cz: z, rad: R(30, 70), alt: R(10, 24) - SEA.level - 6, speed: R(0.08, 0.16) * (random() < 0.5 ? -1 : 1), a0: R(0, 6.28) };
    thing(pick(['birds-herring-gull', 'birds-black-headed-gull']), R(0.9, 1.1), { kind: 'fly', f, da: 0, dr: 0, dy: 0, flap: R(4, 6), sea: true, turn: R(0.003, 0.008), phase: R(0, 6.28) });
  }
  // ---- 湖上：鸭子、鸳鸯、大雁、天鹅，慢慢漂 ---------------------------------------------------------------------
  for (let i = 0; i < 16; i++) {
    const name = pick(['birds-mallard', 'birds-mallard', 'birds-mandarin-duck', 'birds-mute-swan', 'birds-greylag-goose']);
    const h = name === 'birds-mute-swan' ? 1.2 : name === 'birds-greylag-goose' ? 0.9 : 0.62;
    const a = R(0, 6.28);
    const k = R(0.2, 0.75);
    thing(name, h, { kind: 'swim', cx: LAKE.x + Math.cos(a) * LAKE.rx * k, cz: LAKE.z + Math.sin(a) * LAKE.rz * k, rad: R(4, 14), speed: R(0.03, 0.08) * (random() < 0.5 ? -1 : 1), a0: R(0, 6.28), turn: R(0.006, 0.016), phase: R(0, 6.28) });
  }
  // ---- 河滩上的苍鹭、白鹭：站着不动，偶尔挪一步 -------------------------------------------------------------------
  for (let i = 0; i < 9; i++) {
    const seg = Math.floor(R(1, RIVER.length - 4));
    const [ax, az] = RIVER[seg];
    const [bx, bz] = RIVER[seg + 1];
    const t = random();
    const len = Math.hypot(bx - ax, bz - az);
    const side = random() < 0.5 ? -1 : 1;
    const x = ax + (bx - ax) * t + (-(bz - az) / len) * side * (RIVER_HALF - 1.5);
    const z = az + (bz - az) * t + ((bx - ax) / len) * side * (RIVER_HALF - 1.5);
    const rv = riverAt(x, z);
    thing(pick(['birds-grey-heron', 'birds-little-egret']), R(1.1, 1.4), { kind: 'stand', x, z, y: riverLevel(rv.t) - 0.25, flip: random() < 0.5 ? 1 : -1 });
  }
  // ---- 田里：乌鸦、喜鹊、麻雀，蹦跶着啄食 ------------------------------------------------------------------------
  const fields = DISTRICTS.find((d) => d.id === 'fields');
  for (let i = 0; i < 14; i++) {
    const a = R(0, 6.28);
    const r = R(0, fields.r * 0.8);
    const x = fields.x + Math.cos(a) * r;
    const z = fields.z + Math.sin(a) * r;
    if (fieldsAt(x, z) < 0.5) continue;
    thing(pick(['birds-carrion-crow', 'birds-magpie', 'birds-house-sparrow']), R(0.45, 0.6), { kind: 'hop', cx: x, cz: z, rad: R(1, 3), speed: R(0.2, 0.5), a0: R(0, 6.28), phase: R(0, 6.28) });
  }
  // ---- 船：海上远远地漂、海滨小镇岸边系着几条，湖上一条小帆船和码头边的小木船 -------------------------------------
  const boats = [
    ['transport-fishing-boat', 4.2], ['transport-sailboat', 6.5], ['transport-junk-boat', 8], ['transport-small-ferry', 6], ['transport-fishing-boat', 4.2], ['transport-sailboat', 6],
  ];
  for (const [name, h] of boats) {
    for (let tries = 0; tries < 20; tries++) {
      const z = R(-900, -260);
      const x = coastX(z) + R(90, 420);
      if (waterAt(x, z) == null) continue;
      thing(name, h, { kind: 'boat', cx: x, cz: z, rad: R(40, 160), speed: R(0.004, 0.012) * (random() < 0.5 ? -1 : 1), a0: R(0, 6.28), level: SEA.level, sink: 0.12 });
      break;
    }
  }
  const sea = DISTRICTS.find((d) => d.id === 'seaside');
  for (const [name, h, dz] of [['transport-sampan', 2.2, -40], ['transport-fishing-boat', 3.6, 0], ['transport-rowboat', 1.2, 30]]) {
    const z = sea.z + dz;
    const x = coastX(z) + 12;
    thing(name, h, { kind: 'boat', cx: x, cz: z, rad: 0.6, speed: 0.2, a0: R(0, 6.28), level: SEA.level, sink: 0.15 });
  }
  thing('transport-sailboat', 4.2, { kind: 'boat', cx: LAKE.x + 30, cz: LAKE.z - 10, rad: 60, speed: 0.012, a0: 1, level: LAKE.level, sink: 0.1 });
  thing('transport-rowboat', 1.3, { kind: 'boat', cx: LAKE.x - LAKE.rx * 0.72 + 3, cz: LAKE.z + LAKE.rz * 0.65 - 2, rad: 0.4, speed: 0.25, a0: 0, level: LAKE.level, sink: 0.12 });

  // ---- 画 ------------------------------------------------------------------------------------------------------
  const n = things.length;
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.attributes.position = quad.attributes.position;
  geo.instanceCount = n;
  const rect = new Float32Array(n * 4);
  const offset = new Float32Array(n * 3);
  const look = new Float32Array(n * 3);
  const flap = new Float32Array(n);
  things.forEach((t, i) => {
    rect.set([t.sp.u0, t.sp.v0, t.sp.u1, t.sp.v1], i * 4);
    look.set([t.w, t.h, 1], i * 3);
    flap[i] = t.flap;
  });
  const aOffset = new THREE.InstancedBufferAttribute(offset, 3);
  const aLook = new THREE.InstancedBufferAttribute(look, 3);
  aOffset.setUsage(THREE.DynamicDrawUsage);
  aLook.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4));
  geo.setAttribute('aOffset', aOffset);
  geo.setAttribute('aLook', aLook);
  geo.setAttribute('aFlap', new THREE.InstancedBufferAttribute(flap, 1));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { ...shared, tAtlas: { value: page.texture }, uNight: shared.uNight ?? { value: 0 } },
      side: THREE.DoubleSide,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  const right = new THREE.Vector3();
  let clock = 0;
  return {
    mesh,
    count: n,
    things,
    /** @param night 0 白天 … 1 深夜：夜里鸟回窝（飞的、田里的藏起来），水上的缩在岸边不动 */
    update(dt, camera, night = 0) {
      clock += dt;
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      const roost = night > 0.55;
      things.forEach((t, i) => {
        let x;
        let y;
        let z;
        let vx = 0;
        let vz = 0;
        if (t.kind === 'fly') {
          const f = t.f;
          const a = f.a0 + clock * f.speed + t.da + Math.sin(clock * t.turn + t.phase) * 0.22;
          const r = f.rad + t.dr + Math.sin(clock * 0.3 + t.da * 20) * 6;
          x = f.cx + Math.cos(a) * r;
          z = f.cz + Math.sin(a) * r;
          const ground = t.sea ? SEA.level : heightAt(x, z);
          y = ground + f.alt + t.dy + Math.sin(clock * 0.7 + t.da * 30) * 2;
          vx = -Math.sin(a) * f.speed - Math.cos(clock * t.turn + t.phase) * 0.02;
          vz = Math.cos(a) * f.speed - Math.sin(clock * t.turn + t.phase) * 0.02;
          if (roost) y = -500;
        } else if (t.kind === 'swim' || t.kind === 'hop' || t.kind === 'boat') {
          const wander = t.turn ? Math.sin(clock * t.turn + t.phase) * (t.kind === 'swim' ? 0.24 : 0.12) : 0;
          const a = t.a0 + clock * t.speed + wander;
          x = t.cx + Math.cos(a) * t.rad;
          z = t.cz + Math.sin(a) * t.rad;
          vx = -Math.sin(a) * t.speed;
          vz = Math.cos(a) * t.speed;
          if (t.kind === 'swim') y = LAKE.level - t.h * 0.3 + Math.sin(clock * 1.7 + t.a0) * 0.03;
          else if (t.kind === 'boat') y = t.level - t.h * t.sink + Math.sin(clock * 0.9 + t.a0) * 0.08;
          else {
            const hopping = Math.sin(clock * 3.2 + t.phase) > 0.55;
            y = heightAt(x, z) + (hopping ? Math.sin(clock * 18 + t.phase) * 0.1 + 0.12 : 0);
            if (roost) y = -500;
          }
        } else {
          x = t.x;
          z = t.z;
          y = t.y;
          vx = t.flip;
        }
        offset[i * 3] = x;
        offset[i * 3 + 1] = y;
        offset[i * 3 + 2] = z;
        // 图都朝左：往屏幕右边走就翻过来
        if (vx || vz) look[i * 3 + 2] = vx * right.x + vz * right.z > 0 ? -1 : 1;
      });
      aOffset.needsUpdate = true;
      aLook.needsUpdate = true;
    },
  };
}
