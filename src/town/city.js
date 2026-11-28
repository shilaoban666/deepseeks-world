// 把城里城外拼起来：每个街区放什么、长什么样、能做什么，都在这个文件里。
// 出来三样东西：一个 group（场景）、一堆碰撞盒（走路别穿墙）、一串交互点（小地图和 E 键都读它）。
//
// 这一版照《幻想世界地图》重摆：玉海城（玉海宫、清真寺、老街、南市街）居中，西边 AI 小镇和鱼鱼家，
// 河西田园小镇，西北雪山小镇，北边月亮湖和湖边小镇，东北大学城，东边 CBD、海滨小镇、港口，
// 南边高铁站、海鲜排档、沙滩，西南海边新城和码头；一条高架高铁把它们串起来。
// 画法一点没变：房子还是原作 village.js 那一套手绘的，地标用 buildings.js / landmarks.js 的平涂 + 墨线。
import * as THREE from 'three';
import { Builder, PALETTE, hall as hall0, temple as temple0, gate as gate0, fountain as fountain0, gym as gym0, stall as stall0, banner, lamp as lamp0, bench as bench0, stoneLantern as stoneLantern0, fence as fence0, hipRoof, gableRoof } from './buildings.js';
import * as LM0 from './landmarks.js';
import { placeActivities } from './activities.js';
import { dress } from './dressing.js';
import { addBuildings, createBuildingMaterial, WALLS, ROOFS, SLATE } from '../valley/village.js';
import { createGrove } from '../valley/trees.js';
import { createLake, createTrees, createRocks, createFlowerClumps, createPigeons, createCritters, roadGeometry, plazaGeometry, roadMaterial, roadMaterialTextured } from './props.js';
import { createPlantBatch } from './billboard.js';
import { paintMaterial, getAlbedo } from './paint.js';
import {
  DISTRICTS, district, ROADS, SEGS, STREET_HALF, PLAZA, HOME, YUHAI, RING_R, CITY_R, LAKE, SEA, BRIDGES, PIERS, BUS_ROUTE, BUS_STOPS, METRO_STOPS, RAIL_STATIONS, RIVER_HALF, GARDENS,
  pavedAt, riverAt, riverLevel, riverPoint, railCurve, coastD, beachAt, snowAt, skiAt, builtAt, plotAt, heightAt, waterAt, bridgeAt, forestAt, fieldsAt, mountainAt, lakeDistance, roadEdge, plazaDistance, cityDistance, fbm, smooth, HALF,
} from './plan.js';

/** 一个固定的随机数发生器：地图每次都长一样。 */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (random, arr) => arr[Math.floor(random() * arr.length) % arr.length];
const TAU = Math.PI * 2;

/** 让一栋房子面朝最近的那条路（取线段上的最近点，不是折点）。 */
function faceRoad(x, z, fallback = 0) {
  let best = null;
  let bestD = 1e9;
  for (const g of SEGS) {
    if (x < g.minx - 200 || x > g.maxx + 200 || z < g.minz - 200 || z > g.maxz + 200) continue;
    const dx = g.bx - g.ax;
    const dz = g.bz - g.az;
    const t = Math.min(1, Math.max(0, ((x - g.ax) * dx + (z - g.az) * dz) / (dx * dx + dz * dz || 1)));
    const px = g.ax + dx * t;
    const pz = g.az + dz * t;
    const d = Math.hypot(px - x, pz - z);
    if (d < bestD) {
      bestD = d;
      best = [px, pz];
    }
  }
  if (!best || bestD > 220) return fallback;
  // 局部 +z 指向路
  return Math.atan2(best[0] - x, best[1] - z);
}

// 各处房子的"口音"：墙色、瓦色、常见的形状。形状都是原作那几种，只是配色不同。
const TOWN_ROOFS = [...ROOFS, ...ROOFS, SLATE, [0.42, 0.46, 0.5]];
const STYLE = {
  // 镇上：粉墙、赭红瓦，偶尔一栋青灰瓦
  euro: { kit: 'euro', shapes: ['house', 'house', 'tall', 'cottage', 'wing', 'house', 'tall', 'cottage'], walls: WALLS, roofs: TOWN_ROOFS },
  // 玉海城：木色和米色的墙，青灰的瓦
  // 玉海城：还是原作那套粉墙暖瓦（这是整个画面的底色），只是多掺几栋青瓦的
  china: { kit: 'jp', shapes: ['house', 'house', 'tall', 'cottage', 'wing', 'house', 'cottage', 'house', 'tall', 'long', 'wing'], walls: WALLS, roofs: [...ROOFS, ...ROOFS, ...ROOFS, SLATE, [0.3, 0.36, 0.46], [0.42, 0.46, 0.5]] },
  // 海滨小镇：石头墙、橘红瓦
  coast: { kit: 'euro', shapes: ['house', 'cottage', 'tall', 'wing', 'house'], walls: [[0.97, 0.96, 0.92], [0.95, 0.92, 0.84], [0.97, 0.95, 0.9], [0.93, 0.9, 0.82]], roofs: [[0.82, 0.42, 0.22], [0.78, 0.36, 0.2], [0.86, 0.5, 0.28]] },
  // 雪山小镇：原木屋，屋顶盖着雪
  snow: { kit: 'euro', shapes: ['cottage', 'house', 'long', 'wing', 'cottage'], walls: [[0.78, 0.58, 0.4], [0.7, 0.5, 0.34], [0.94, 0.9, 0.82], [0.84, 0.66, 0.46]], roofs: [[0.93, 0.95, 0.98], [0.9, 0.93, 0.97]] },
  // 田园小镇：农舍，红瓦，偶尔一栋木头的
  farm: { kit: 'farm', shapes: ['house', 'cottage', 'long', 'wing', 'cottage'], walls: [...WALLS, [0.7, 0.54, 0.38]], roofs: [[0.74, 0.3, 0.2], [0.68, 0.26, 0.18], [0.8, 0.36, 0.22]] },
};
const FOOT = { cottage: [7, 10], house: [7.5, 11], wing: [10.5, 11], tall: [7, 8.5], long: [8, 19], church: [9, 22], round: [7.4, 7.4], slim: [3.8, 3.8] };

export function createCity(shared, field, { cards = 1, treeNear = 120, treeFar = 560, density = 1, plants = null, roadTex = false, models = [], kit = null, vehicleAssets = null } = {}) {
  const group = new THREE.Group();
  const b = new Builder(shared);
  // ---- 街具和地标换成套件里的模型 ----
  // 原来那些程序化的函数照常调用（碰撞盒、灯位、返回值都还要），只是不让它们放几何体（b.mute），
  // 同一个位置、同一个朝向摆一个模型；尺寸按参数和模型设计尺寸的比例缩放，招牌挂到模型上留好的位置。
  const kitExtras = [];
  const has = (id) => !!kit?.byId.has(id);
  const WHITE = [0.95, 0.93, 0.86];
  const GREY = [0.3, 0.33, 0.4];
  const hex = (h) => [1, 3, 5].map((i) => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2));
  const fit = (id, w, h, d, lim = [0.8, 1.3]) => {
    const f = kit.byId.get(id).fit ?? [null, null, null];
    const k = (v, base, clampY) => (v == null || base == null ? 1 : clampY ? Math.min(lim[1], Math.max(lim[0], v / base)) : v / base);
    return [k(w, f[0]), k(h, f[1], true), k(d, f[2])];
  };
  const ONE = [1, 1, 1];
  let fenceRuns = 0;
  const inst = (id, x, z, turn = 0, o = {}) => {
    // （库里转过来的小件带着自己的颜色：墙、瓦、布都不再调）
    const self = kit.byId.get(id).tint === 'self';
    const { scale = 1, y, wall = self ? ONE : WHITE, roof = self ? ONE : GREY, accent = self ? ONE : [0.5, 0.17, 0.14] } = o;
    const e = { kit: id, x, z, y, turn, scale, wall, roof, accent, seed: random() };
    if (!o.norect) e.rect = addRect(x, z, turn, kit.byId.get(id).bounds, scale, SMALL.has(id) ? 'small' : 'big', e);
    kitExtras.push(e);
    return e;
  };
  /** 包一层：spec(...args) 说这次调用换成什么模型（返回 null = 不换，照旧画）。 */
  const swap = (fn, spec) => (bb, ...args) => {
    const what = kit ? spec(...args) : null;
    if (!what) return fn(bb, ...args);
    b.mute = (b.mute ?? 0) + 1;
    b.mutedSigns = [];
    let out;
    try {
      out = fn(bb, ...args);
    } finally {
      b.mute--;
    }
    const sign = b.mutedSigns[0];
    b.mutedSigns = [];
    for (const it of Array.isArray(what) ? what : [what]) {
      const anchor = kit.byId.get(it.kit).sign;
      if (!sign || !anchor || sign.vertical) continue;
      const sc = Array.isArray(it.scale) ? it.scale : [it.scale, it.scale, it.scale];
      const gy = it.y ?? heightAt(it.x, it.z);
      const f = anchor[1] * sc[2] + 0.05;
      b.addSign(sign.text, [it.x + Math.sin(it.turn) * f, gy + anchor[0] * sc[1], it.z + Math.cos(it.turn) * f], it.turn, { w: anchor[2] * Math.min(sc[0], 1.3), h: anchor[3] * Math.min(sc[1], 1.2), bg: sign.bg, fg: sign.fg });
    }
    return out;
  };
  const clothOf = (key) => PALETTE.cloth[Number(String(key).split('#')[1] ?? 0) % PALETTE.cloth.length];
  const hall = swap(hall0, (o) => {
    const id = o.flat ? 'hall_flat' : (o.floors ?? 2) >= 3 ? 'hall_b' : (o.floors ?? 2) === 1 ? 'hall_small' : 'hall_a';
    return has(id) && inst(id, o.x, o.z, o.rotY ?? 0, { y: o.y, scale: fit(id, o.w, o.h, o.d), wall: PALETTE.wall[o.wall ?? 0], roof: PALETTE.roof[o.roof ?? 0], accent: pick(random, ACCENTS) });
  });
  const temple = swap(temple0, (o) => has('temple') && inst('temple', o.x, o.z, o.rotY ?? 0, { y: o.y, roof: PALETTE.roof[10] }));
  const gate = swap(gate0, (o) => has('gate') && inst('gate', o.x, o.z, o.rotY ?? 0, { y: o.y, roof: PALETTE.roof[3] }));
  const fountain = swap(fountain0, (o) => has('fountain') && inst('fountain', o.x, o.z, 0, { y: o.y }));
  const gym = swap(gym0, (o) => has('gym') && inst('gym', o.x, o.z, o.rotY ?? 0, { y: o.y, wall: PALETTE.wall[1], roof: [0.2, 0.46, 0.44] }));
  const stall = swap(stall0, (o) => has('stall') && inst('stall', o.x, o.z, o.rotY ?? 0, { y: o.y, accent: clothOf(o.c2 ?? 'cloth#0') }));
  const lamp = swap(lamp0, (x, z, rot = 0) => has('lamp') && inst('lamp', x, z, rot));
  const benchRaw = swap(bench0, (x, z, rot = 0) => has('bench') && inst('bench', x, z, rot));
  let benchSeq = 0;
  const bench = (b2, x, z, rot = 0) => {
    const res = benchRaw(b2, x, z, rot);
    add({ id: `bench-city-${++benchSeq}`, name: '长椅', kind: 'chair', x, z, r: 2.5, hint: 'E 坐下', seat: { x, y: heightAt(x, z) + 0.44, z, yaw: rot }, map: false });
    return res;
  };
  const stoneLantern = swap(stoneLantern0, (x, z) => has('stonelantern') && inst('stonelantern', x, z, 0));
  const fence = swap(fence0, (x1, z1, x2, z2, height = 1.1) => {
    if (!has('fence')) return null;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.round(len / 1.6));
    const turn = Math.atan2(-(z2 - z1), x2 - x1);
    const list = [];
    const chain = ++fenceRuns;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      // 顺着坡走：每一段落在自己两头较低的那一头，高出来的坡用栏杆自己的高度补上（不然一头悬空、一头埋进土里）
      const ha = heightAt(x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n);
      const hb = heightAt(x1 + ((x2 - x1) * (i + 1)) / n, z1 + ((z2 - z1) * (i + 1)) / n);
      list.push(inst('fence', x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, turn, { y: Math.min(ha, hb) - 0.04, scale: [len / n / 1.6, (height + Math.abs(ha - hb)) / 1.1, 1] }));
      // （同一道篱笆里相邻的两段本来就是接着的，不算互相穿）
      if (list[i].rect) list[i].rect.chain = chain;
    }
    return list;
  });
  const uni = (id, base, v) => (v ?? base) / base;
  const LM = kit
    ? {
        ...LM0,
        palace: swap(LM0.palace, (o) => has('palace') && inst('palace', o.x, o.z, o.rotY ?? 0, { y: o.y, roof: PALETTE.roof[6] })),
        gateTower: swap(LM0.gateTower, (o) => has('gatetower') && inst('gatetower', o.x, o.z, o.rotY ?? 0, { y: o.y, roof: PALETTE.roof[10] })),
        mosque: swap(LM0.mosque, (o) => has('mosque') && inst('mosque', o.x, o.z, o.rotY ?? 0, { y: o.y, wall: PALETTE.wall[6], roof: PALETTE.roof[7] })),
        neonShop: swap(LM0.neonShop, (o) => has('neonshop') && inst('neonshop', o.x, o.z, o.rotY ?? 0, { y: o.y, scale: fit('neonshop', o.w, o.h, o.d), wall: [0.93, 0.88, 0.78], accent: hex(o.signBg ?? '#7a1f1f') })),
        tower: swap(LM0.tower, (o) => has('tower') && inst('tower', o.x, o.z, o.rotY ?? 0, { y: o.y, scale: fit('tower', o.w, o.h, o.d, [0.3, 1.6]), wall: [[0.9, 0.88, 0.82], [0.86, 0.8, 0.7], [0.8, 0.84, 0.88]][(o.style ?? 0) % 3], roof: [0.2, 0.5, 0.45], accent: pick(random, ACCENTS) })),
        apartment: swap(LM0.apartment, (o) => has('apartment') && inst('apartment', o.x, o.z, o.rotY ?? 0, { y: o.y, scale: [(o.w ?? 26) / 26, Math.min(o.floors ?? 5, 6) / 5, (o.d ?? 13) / 13], wall: PALETTE.wall[o.wall ?? 7], roof: PALETTE.roof[1], accent: pick(random, ACCENTS) })),
        clockTower: swap(LM0.clockTower, (o) => has('clocktower') && inst('clocktower', o.x, o.z, o.rotY ?? 0, { y: o.y, scale: uni('clocktower', 36, o.h), wall: [0.72, 0.4, 0.3], roof: [0.24, 0.4, 0.42] })),
        warehouse: swap(LM0.warehouse, (o) => has('warehouse') && inst('warehouse', o.x, o.z, o.rotY ?? 0, { y: o.y, scale: fit('warehouse', o.w, o.h, o.d), roof: [0.34, 0.4, 0.48], accent: pick(random, ACCENTS) })),
        crane: swap(LM0.crane, (o) => has('crane') && inst('crane', o.x, o.z, o.rotY ?? 0, { y: o.y, scale: uni('crane', 24, o.h) })),
        containers: swap(LM0.containers, (o) => has('containers') && inst('containers', o.x, o.z, o.rotY ?? 0, { y: o.y })),
        windmill: swap(LM0.windmill, (o) => {
          const id = o.wood ? 'windmill_b' : 'windmill_a';
          return has(id) && inst(id, o.x, o.z, o.rotY ?? 0, { y: o.y, scale: uni(id, 13, o.h), roof: PALETTE.roof[0], accent: pick(random, ACCENTS) });
        }),
        waterMill: swap(LM0.waterMill, (o) => has('watermill') && inst('watermill', o.x, o.z, o.rotY ?? 0, { y: o.y, roof: [0.78, 0.64, 0.3], accent: [0.2, 0.4, 0.22] })),
        greenhouse: swap(LM0.greenhouse, (o) => has('greenhouse') && inst('greenhouse', o.x, o.z, o.rotY ?? 0, { y: o.y, scale: fit('greenhouse', o.w, o.h, o.d) })),
        beacon: swap(LM0.beacon, (o) => has('beacon') && inst('beacon', o.x, o.z, o.rotY ?? 0, { y: o.y, scale: uni('beacon', 9, o.h), norect: true })),
        haystack: swap(LM0.haystack, (x, z, s = 1) => has('haystack') && inst('haystack', x, z, random() * 6, { scale: s })),
        logPile: swap(LM0.logPile, (x, z, s = 1) => has('logpile') && inst('logpile', x, z, 0, { scale: s })),
        crate: swap(LM0.crate, (x, z, s = 1) => has('crate') && inst('crate', x, z, 0, { scale: s })),
        snowman: swap(LM0.snowman, (x, z, s = 1) => has('snowman') && inst('snowman', x, z, 0, { scale: s })),
      }
    : LM0;
  const random = rng(20261120);
  const interactables = [];
  const add = (o) => {
    interactables.push(o);
    return o;
  };
  const D = (id) => district(id);

  // ---- 高铁线：先算出来，后面盖房子、种树都要让开它 -------------------------------------------------------------
  const railXZ = railCurve(6);
  const railNear = (x, z, r) => {
    for (const p of railXZ) {
      const dx = p[0] - x;
      const dz = p[1] - z;
      if (dx > r || dx < -r || dz > r || dz < -r) continue;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  };

  const painted = [];
  /** 已经占了的地方（圆）：房子、地标、摊位。新东西先问一声。 */
  const taken = [];
  const free0 = (x, z, r) => {
    for (const t of taken) {
      const dx = t[0] - x;
      const dz = t[1] - z;
      const rr = t[2] + r;
      if (dx < rr && dx > -rr && dz < rr && dz > -rr && dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  };
  const claim = (x, z, r) => taken.push([x, z, r]);
  // ---- 精确占地：朝向矩形 ------------------------------------------------------------------------------------
  // 房子原来只占一个偏小的圆，树只离它 1.5 m——树冠、篱笆、街具就这么穿进了屋里。现在每栋房子、每件套件模型、
  // 每块程序化的几何体都登记自己真实的占地矩形（kind：house / big / small / proc），后来的东西按它让开。
  const RC = 24;
  const rectGrid = new Map();
  const rectCells = (x, z, r, fn) => {
    for (let i = Math.floor((x - r) / RC); i <= Math.floor((x + r) / RC); i++) for (let j = Math.floor((z - r) / RC); j <= Math.floor((z + r) / RC); j++) if (fn(i + ',' + j) === true) return true;
    return false;
  };
  /** b4 = 模型局部的 [x0, x1, z0, z1]；turn 绕 Y（和 kit.js 摆模型同一个转法）。 */
  const makeRect = (x, z, turn, b4, scale, kind, ref = null) => {
    const sx = Array.isArray(scale) ? scale[0] : scale;
    const sz = Array.isArray(scale) ? scale[2] : scale;
    const lx = ((b4[0] + b4[1]) / 2) * sx;
    // （清单里的 bounds 是 Blender 的 y：到了游戏里 z = -y，正面在 +z）
    const lz = -((b4[2] + b4[3]) / 2) * sz;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const hw = ((b4[1] - b4[0]) / 2) * sx;
    const hd = ((b4[3] - b4[2]) / 2) * sz;
    return { x: x + lx * c + lz * s, z: z - lx * s + lz * c, hw, hd, c, s, rad: Math.hypot(hw, hd), kind, ref, dead: false };
  };
  const addRect = (...a) => {
    const r = makeRect(...a);
    rectCells(r.x, r.z, r.rad, (k) => {
      if (!rectGrid.has(k)) rectGrid.set(k, []);
      rectGrid.get(k).push(r);
    });
    return r;
  };
  /** 点 (x, z) 到矩形的距离（在里面是 0）。 */
  const rectDist = (r, x, z) => {
    const dx = x - r.x;
    const dz = z - r.z;
    const ex = Math.abs(dx * r.c - dz * r.s) - r.hw;
    const ez = Math.abs(dx * r.s + dz * r.c) - r.hd;
    return Math.hypot(Math.max(ex, 0), Math.max(ez, 0));
  };
  /** 离 (x, z) 不到 d 的矩形（kinds 省略 = 都算）；没有就返回 null。 */
  const rectNear = (x, z, d, kinds = null) => {
    let hit = null;
    rectCells(x, z, d, (k) => {
      const list = rectGrid.get(k);
      if (!list) return false;
      for (const r of list) {
        if (r.dead || (kinds && !kinds.includes(r.kind))) continue;
        if (rectDist(r, x, z) < d) {
          hit = r;
          return true;
        }
      }
      return false;
    });
    return hit;
  };
  /** 两个矩形是不是叠着（分离轴；m = 还要留的缝）。 */
  const rectsOverlap = (a, q, m = 0) => {
    const dx = q.x - a.x;
    const dz = q.z - a.z;
    if (Math.hypot(dx, dz) > a.rad + q.rad + m) return false;
    const axes = [[a.c, -a.s], [a.s, a.c], [q.c, -q.s], [q.s, q.c]];
    for (const [ex, ez] of axes) {
      const d = Math.abs(dx * ex + dz * ez);
      const ra = a.hw * Math.abs(a.c * ex - a.s * ez) + a.hd * Math.abs(a.s * ex + a.c * ez);
      const rb = q.hw * Math.abs(q.c * ex - q.s * ez) + q.hd * Math.abs(q.s * ex + q.c * ez);
      if (d > ra + rb + m) return false;
    }
    return true;
  };
  /** 和这个矩形叠着的别的矩形。 */
  const rectHit = (a, m = 0, kinds = null) => {
    let hit = null;
    rectCells(a.x, a.z, a.rad + m, (k) => {
      const list = rectGrid.get(k);
      if (!list) return false;
      for (const r of list) {
        if (r === a || r.dead || (kinds && !kinds.includes(r.kind))) continue;
        if (rectsOverlap(a, r, m)) {
          hit = r;
          return true;
        }
      }
      return false;
    });
    return hit;
  };
  const SMALL = new Set(['lamp', 'bench', 'fence', 'stonelantern', 'crate', 'logpile', 'snowman', 'haystack']);
  // 程序化的几何体（桥、站、码头、游乐设施……）：每块记一个占地
  let recording = true;
  b.onAdd = (pos, rotY, bb) => {
    if (!recording) return;
    if (bb.max.y - bb.min.y < 0.5 || bb.max.x - bb.min.x > 80 || bb.max.z - bb.min.z > 80) return;
    if (pos[1] + bb.min.y - heightAt(pos[0], pos[2]) > 3.5) return;
    addRect(pos[0], pos[2], rotY, [bb.min.x, bb.max.x, bb.min.z, bb.max.z], 1, 'proc');
  };
  /** 一栋套件房子摆在这儿行不行：不叠别的房子和东西、四角不压路、脚下够平。 */
  const houseFits = (x, z, turn, item, scale, gap = 0.3) => {
    const r = makeRect(x, z, turn, item.bounds, scale, 'house');
    if (rectHit(r, gap, ['house']) || rectHit(r, 0.2, ['big', 'small', 'proc'])) return false;
    let lo = 1e9;
    let hi = -1e9;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = r.x + u * r.hw * r.c + v * r.hd * r.s;
      const pz = r.z - u * r.hw * r.s + v * r.hd * r.c;
      if (roadEdge(px, pz) < 0.25) return false;
      const y = heightAt(px, pz);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    return hi - lo < 0.85;
  };
  /** 圆和房子都问（原来的 free 只问圆，现在留作 freeC）。 */
  const freeC = free0;
  const free = (x, z, r) => freeC(x, z, r) && !rectNear(x, z, r, ['house']);
  /** 树、立牌、街具用：圆、房子、套件模型、程序化几何都让开。 */
  const clear = (x, z, r) => freeC(x, z, Math.min(r, 3)) && !rectNear(x, z, r);
  /** 能不能盖房子：不在水里、不贴着河海、不在铁路底下。 */
  const dry = (x, z, r = 0) => riverAt(x, z).d > RIVER_HALF + 14 + r && lakeDistance(x, z) > 1.22 && coastD(x, z) > 34 + r && !railNear(x, z, 9 + r) && Math.abs(x) < HALF - 20 && Math.abs(z) < HALF - 20;

  // 地图上写着的那些铺子
  const SHOPS = ['面馆', '蔬菜铺', '茶铺', '书店', '裁缝', '杂货', '豆腐', '酱菜', '糕点', '药铺', '花店', '米铺'];
  // 点缀色（门、百叶、雨棚、招牌）：每栋自己挑一个
  const ACCENTS = [[0.14, 0.34, 0.3], [0.16, 0.3, 0.52], [0.5, 0.17, 0.14], [0.76, 0.56, 0.2], [0.2, 0.4, 0.22], [0.42, 0.24, 0.14], [0.72, 0.3, 0.16], [0.24, 0.42, 0.56]];
  const JP_ACCENTS = [[0.1, 0.2, 0.42], [0.5, 0.14, 0.12], [0.12, 0.3, 0.24], [0.82, 0.78, 0.66]];
  /** 这种类别、这种口音的房子，从套件里挑一种（没有套件就返回 null，还用原来画出来的房子）。 */
  const kitFor = (shape, style) => (kit ? kit.choose(random, shape, style?.kit ?? 'euro') : null);
  /** 占地（米）：宽 × 深 */
  const footOf = (shape, item, scale) => (item ? [item.w * scale, item.d * scale] : [(FOOT[shape] ?? [8, 10])[0] * scale, (FOOT[shape] ?? [8, 10])[1] * scale]);
  const paintedHouse = (x, z, opts = {}) => {
    const { shape = 'house', turn = null, wall = null, roof = null, bare = false, auto = false } = opts;
    const item = opts.item ?? kitFor(shape, opts.style);
    // （套件里的房子本来就是真实大小：只让它们略有大小之别）
    const scale = item ? (opts.kitScale ?? 0.94 + random() * 0.14) : (opts.scale ?? 1.1);
    const t = turn ?? faceRoad(x, z);
    const jp = item?.style === 'jp';
    painted.push({ x, z, turn: t, scale, shape, shop: opts.shop ?? null, wall: wall ?? pick(random, WALLS), roof: roof ?? pick(random, TOWN_ROOFS),
      kit: item?.id ?? null, styleKit: opts.style?.kit ?? 'euro', accent: pick(random, jp ? JP_ACCENTS : ACCENTS), seed: random(), auto: auto && !!item });
    const me = painted[painted.length - 1];
    if (jp) {
      // 和式的房子：白墙或米墙，青灰的瓦
      const h = painted[painted.length - 1];
      h.wall = pick(random, [[0.94, 0.92, 0.86], [0.9, 0.86, 0.76], [0.95, 0.94, 0.9]]);
      h.roof = pick(random, [[0.2, 0.25, 0.32], [0.17, 0.22, 0.3], [0.24, 0.27, 0.3], [0.2, 0.28, 0.3]]);
    }
    // 碰撞盒要轴对齐：取房子占地转过去之后的包围
    const fp = footOf(shape, item, 1);
    const hw = (fp[0] * scale) / 2;
    const hd = (fp[1] * scale) / 2;
    const c = Math.abs(Math.cos(t));
    const s2 = Math.abs(Math.sin(t));
    if (item) me.rect = addRect(x, z, t, item.bounds, scale, 'house', me);
    else claim(x, z, Math.max(hw, hd) * 0.92);
    // （自动撒的套件房子：碰撞盒和店招等到收尾时再放——那时才知道它有没有和后来摆的东西撞上、要不要拆）
    const finish = () => finishHouse(me, { x, z, t, hw, hd, c, s2, fp, scale, item, shape, bare, opts });
    if (me.auto) me.finish = finish;
    else finish();
  };
  const finishHouse = (me, { x, z, t, hw, hd, c, s2, fp, scale, item, shape, bare, opts }) => {
    // 套件的房子：盒子跟着房子的朝向（占地去掉屋檐挑出来的那一圈），顶是屋脊
    if (me.rect) me.col = b.collide(me.rect.x, me.rect.z, Math.max(1, me.rect.hw - 0.4), Math.max(1, me.rect.hd - 0.4), item.h * scale, t);
    else b.collide(x, z, hw * c + hd * s2 + 0.2, hw * s2 + hd * c + 0.2, 16);
    // 门口的生活气：石门阶、两盆花；有的挂店招、有的摆长凳或木桶
    if (bare || shape === 'church' || shape === 'round' || shape === 'slim') return;
    const gy = heightAt(x, z);
    const fx = Math.sin(t);
    const fz = Math.cos(t);
    const front = (lx, ly, lz) => [x + fx * (hd + lz) + fz * lx, gy + ly, z + fz * (hd + lz) - fx * lx];
    if (!item) {
      b.add(new THREE.BoxGeometry(1.7, 0.5, 0.8), 'stone#2', front(0, 0.0, 0.4), t);
      for (const sx of [-1, 1]) {
        if (random() < 0.3) continue;
        b.add(new THREE.CylinderGeometry(0.2, 0.15, 0.36, 8), 'roof#1', front(sx * 1.25, 0.18, 0.5));
        b.add(new THREE.IcosahedronGeometry(0.26, 0), 'leaf#' + (random() < 0.5 ? 0 : 1), front(sx * 1.25, 0.5, 0.5));
        b.add(new THREE.IcosahedronGeometry(0.12, 0), 'flower#' + Math.floor(random() * 5), front(sx * 1.25 + 0.1, 0.7, 0.55));
      }
    }
    const roll = random();
    // （房子多了五倍：随手挂的店招相应少挂，不然满街都是；套件的房子门口自己带着台阶、盆栽、木桶）
    if (opts.shop || (roll < (opts.shops ?? 0.2) * (item ? 0.45 : 1) && builtAt(x, z) > 0.5)) {
      // 店招：一根铁杆挑出来，下面挂块木牌
      const name = opts.shop ?? pick(random, SHOPS);
      me.shop = name;
      const sx = item ? fp[0] * scale * 0.5 - 0.5 : 1.9;
      b.add(new THREE.BoxGeometry(0.06, 0.06, 1.3), 'iron#0', front(sx, 3.3, 0.6), t);
      b.add(new THREE.BoxGeometry(0.08, 1.5, 0.74), 'wood#2', front(sx, 2.5, 0.9), t);
      const text = [...name].slice(0, 3).join('');
      for (const side of [-1, 1]) b.addSign(text, front(sx + side * 0.05, 2.5, 0.9), t + (side * Math.PI) / 2, { w: 0.62, h: 1.36, bg: pick(random, ['#3a2a1c', '#22304a', '#7a1f1f', '#2f5a3a']), fg: '#f7e9c6', vertical: true });
      if (!item) b.add(new THREE.BoxGeometry(1.5, 0.5, 0.05), 'cloth#' + Math.floor(random() * 5), front(0, 2.45, 0.08), t);
    } else if (!item && roll < 0.4) {
      b.add(new THREE.BoxGeometry(1.5, 0.1, 0.42), 'wood#1', front(-2.4, 0.45, 0.5), t);
      for (const sx of [-0.6, 0.6]) b.add(new THREE.BoxGeometry(0.1, 0.45, 0.4), 'wood#2', front(-2.4 + sx, 0.22, 0.5), t);
    } else if (!item && roll < 0.52) {
      b.add(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 10), 'wood#0', front(2.3, 0.4, 0.5));
      b.add(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 10), 'iron#0', front(2.3, 0.6, 0.5));
    }
  };
  /** 在一个圆里散着盖一片房子。 */
  /** 在一个圆里散着盖一片房子。 */
  // 套件上了之后房子多五倍：每处多撒、撒得开一点、挨得近一点（套件的房子是真实大小，比原来画的那种小一圈）
  const MORE = kit ? 10 : 1;
  /** 地够不够平（房子底下的落差，米）。 */
  const flat = (x, z, r) => Math.abs(heightAt(x + r, z) - heightAt(x - r, z)) < 1.6 && Math.abs(heightAt(x, z + r) - heightAt(x, z - r)) < 1.6;
  const scatter = (cx, cz, r, n, style, { minR = 0, gap = 8, scale = [0.95, 0.28], road = 7, shops = 0.12, turn = 'road', more = MORE } = {}) => {
    let made = 0;
    if (kit) {
      n = Math.round(n * more);
      r *= more > 1 ? 1.45 : 1;
    }
    for (let tries = 0; tries < n * 10 && made < n; tries++) {
      const a = random() * TAU;
      const rr = minR + (r - minR) * Math.sqrt(random());
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const shape = pick(random, style.shapes);
      const item = kitFor(shape, style);
      const need = item ? Math.max(item.w, item.d) * 0.5 : gap;
      if (roadEdge(x, z) < (item ? item.d * 0.5 + 1.2 : road) || !(item ? freeC : free)(x, z, need) || !dry(x, z) || plazaDistance(x, z) < 40) continue;
      // （不盖在铺地上：广场、集市的场子、宫前）
      if (item && pavedAt(x, z) > 0.25) continue;
      if (item && (!flat(x, z, 4) || fieldsAt(x, z) > 0.3 || (snowAt(x, z) > 0.02 && style !== STYLE.snow))) continue;
      const t = turn === 'road' ? faceRoad(x, z) + (!item && random() < 0.5 ? Math.PI / 2 : 0) : random() * Math.PI;
      const ks = 0.94 + random() * 0.14;
      if (item && !houseFits(x, z, t, item, ks, 2.2)) continue;
      paintedHouse(x, z, { shape, item, style, auto: true, kitScale: ks, scale: scale[0] + random() * scale[1], turn: t, wall: pick(random, style.walls), roof: pick(random, style.roofs), shops });
      made++;
    }
    return made;
  };
  /** 这条街两边盖什么样的房子（null = 不盖，那里有自己的楼）。 */
  const styleAt = (x, z) => {
    if (cityDistance(x, z) < RING_R - 26) return STYLE.china;
    if (Math.hypot(x + 470, z + 100) < 165 || Math.hypot(x - HOME[0], z - HOME[1]) < 60) return STYLE.euro;
    if (Math.hypot(x - 285, z + 515) < 120) return STYLE.euro;
    if (Math.hypot(x - 762, z + 182) < 130) return STYLE.coast;
    return null;
  };

  let lighthouseLamp = null;
  const lanterns = [];
  const gardenPlots = [];
  const spinners = [];
  const stallGoods = []; // 摊位上立着的货（物件图集）
  const sakura = []; // 樱花树的位置（立牌）
  const activityDecorLater = []; // 打磨时放的立牌，等玩法那批一起画
  const parasols = []; // 阳伞
  const snowPines = [];

  // ===== 小鲸鱼的家（鱼鱼家）：河湾边的小院，旁边一座水车磨坊 =====================================
  {
    const [hx, hz] = HOME;
    const z = hz - 16;
    paintedHouse(hx, z, { shape: 'wing', scale: 1.25, kitScale: 1.2, turn: 0, wall: [0.97, 0.95, 0.9], roof: [0.24, 0.44, 0.66], bare: true });
    {
      // 门楣上的木牌、门两边的花坛、一条踏脚石小路通到院门
      const gy = heightAt(hx, z);
      const fz = z + (11 * 1.25) / 2;
      b.add(new THREE.BoxGeometry(2.6, 0.9, 0.14), 'wood#2', [hx, gy + 3.5, fz + 0.12]);
      b.addSign('鱼鱼家', [hx, gy + 3.5, fz + 0.22], 0, { w: 2.3, h: 0.72, bg: '#22507a', fg: '#fdf6e3' });
      b.add(new THREE.BoxGeometry(3.4, 0.14, 1.5), 'cloth#4', [hx, gy + 2.9, fz + 0.8]);
      for (const sx of [-1, 1]) {
        b.add(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 6), 'wood#2', [hx + sx * 1.6, gy + 1.45, fz + 1.5]);
        b.add(new THREE.BoxGeometry(2.6, 0.4, 0.8), 'stone#2', [hx + sx * 3.4, gy + 0.2, fz + 0.7]);
        b.add(new THREE.BoxGeometry(2.4, 0.3, 0.6), 'leaf#0', [hx + sx * 3.4, gy + 0.5, fz + 0.7]);
        for (let k = 0; k < 6; k++) b.add(new THREE.IcosahedronGeometry(0.16, 0), `flower#${(k + (sx > 0 ? 2 : 0)) % 5}`, [hx + sx * 3.4 - 1 + k * 0.4, gy + 0.72, fz + 0.7 + (k % 2 ? 0.12 : -0.12)]);
      }
      for (let k = 0; k < 9; k++) b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 9), 'stone#0', [hx + (k % 2 ? 0.25 : -0.25), heightAt(hx, fz + 2 + k * 1.1) + 0.05, fz + 2 + k * 1.1]);
      // 屋顶的小鲸鱼风向标
      b.add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), 'iron#0', [hx, gy + 13.2, z]);
      const whaleV = new THREE.SphereGeometry(0.42, 10, 8);
      whaleV.scale(1.5, 0.8, 0.5);
      b.add(whaleV, 'cloth#4', [hx, gy + 14.1, z]);
      const tail = new THREE.ConeGeometry(0.3, 0.5, 4);
      tail.rotateZ(Math.PI / 2);
      b.add(tail, 'cloth#4', [hx - 0.8, gy + 14.15, z]);
    }
    // 院子的栅栏留一个口
    fence(b, hx - 8, hz + 6, hx - 8, hz - 16);
    fence(b, hx + 8, hz + 6, hx + 8, hz - 16);
    fence(b, hx - 8, hz + 6, hx - 2.2, hz + 6);
    fence(b, hx + 2.2, hz + 6, hx + 8, hz + 6);
    lamp(b, hx - 5, hz + 5);
    claim(hx, hz - 6, 16);
    // 院子里的小菜园：西半边两列四排，八块地（种植系统，见 farming.js）
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) gardenPlots.push({ x: GARDENS[0].x + 1.3 - col * 2.6, z: GARDENS[0].z - 2.4 + row * 1.6, where: '门前的菜地' });
    }
    add({ id: 'home-door', name: '鱼鱼家', kind: 'door', x: hx, z: z + 10.5, r: 2.8, hint: 'E 进屋' });
    add({ id: 'home-mailbox', name: '信箱', kind: 'mail', x: hx - 3, z: hz + 4.4, r: 1.8, hint: 'E 看看信箱' });
    // 水车磨坊：贴着清溪河，轮子在水里慢慢转
    const mx = hx - 48;
    const mz = hz - 22;
    const mill = LM.waterMill(b, { x: mx, z: mz, rotY: Math.PI });
    if (mill) spinners.push({ kind: 'wheel', ...mill, speed: 0.8 });
    claim(mx, mz, 9);
    add({ id: 'watermill', name: '水车磨坊', kind: 'village', x: mx + 2, z: mz + 6, r: 6, hint: 'E 看水车', text: '水车吱呀吱呀地转，磨盘上的麦子变成了面粉。屋檐下挂着两条鲤鱼旗。' });
    add({ id: 'home-river', name: '家门口的河湾', kind: 'fish', x: hx - 52, z: hz + 12, r: 9, hint: 'E 钓鱼' });
  }

  // ===== 玉海城 ================================================================================================
  {
    // 玉海宫：金瓦朱墙，站在高台上，正对着宫前广场和中轴大街
    const P = D('palace');
    LM.palace(b, { x: P.x, z: P.z - 4, rotY: 0, name: '玉海宫' });
    // （宫前留一片空场，一路空到广场：别在正门口盖房子）
    for (let dz = 22; dz < 70; dz += 12) claim(P.x, P.z + dz, 16);
    claim(P.x, P.z - 4, 36);
    claim(P.x, P.z + 20, 14);
    for (const sx of [-1, 1]) claim(P.x + sx * 19, P.z + 19, 8);
    for (const sx of [-1, 1]) for (const dz of [34, 46]) stoneLantern(b, P.x + sx * 9, P.z + dz);
    add({ id: 'palace', name: '玉海宫', kind: 'gate', x: P.x, z: P.z + 26, r: 12, hint: 'E 看看玉海宫', text: '金瓦在太阳底下亮得晃眼。台阶很高，一级一级数上去，一共三十六级。' });
    // 宫前广场
    const [px, pz] = PLAZA;
    fountain(b, { x: px, z: pz });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      bench(b, px + Math.cos(a) * 17, pz + Math.sin(a) * 17, -a);
      lamp(b, px + Math.cos(a + 0.4) * 24, pz + Math.sin(a + 0.4) * 24);
    }
    add({ id: 'plaza-fountain', name: '广场喷泉', kind: 'wish', x: px, z: pz, r: 7.5, hint: 'E 许个愿' });
    add({ id: 'plaza-board', name: '公告板', kind: 'board', x: px - 12, z: pz - 14, r: 3, hint: 'E 看公告' });

    // 三座城门楼：南门、西门、东门（路从门洞里穿过去）
    for (const [gx, gz, rot, text] of [[40, 190, 0, '玉海城'], [-206, -58, Math.PI / 2, '西门'], [288, -58, Math.PI / 2, '东门']]) {
      LM.gateTower(b, { x: gx, z: gz, rotY: rot, text });
      claim(gx, gz, 12);
      add({ id: `gate-${text}`, name: text === '玉海城' ? '玉海城南门' : `玉海城${text}`, kind: 'gate', x: gx + (rot ? 0 : 9), z: gz + (rot ? 9 : 0), r: 7, hint: 'E 看看城门' });
    }

    // 清真寺：白墙绿顶，两座宣礼塔
    const M = D('mosque');
    LM.mosque(b, { x: M.x, z: M.z - 4, rotY: 0 });
    claim(M.x, M.z - 4, 21);
    add({ id: 'mosque', name: '清真寺', kind: 'pray', x: M.x, z: M.z + 14, r: 10, hint: 'E 祈祷' });

    // 夫子庙
    const T = D('temple');
    const tr = faceRoad(T.x, T.z);
    temple(b, { x: T.x, z: T.z, rotY: tr });
    claim(T.x, T.z, 19);
    add({ id: 'temple', name: '夫子庙', kind: 'pray', x: T.x + Math.sin(tr) * 14, z: T.z + Math.cos(tr) * 14, r: 12, hint: 'E 上香' });

    // 书店（看书）、冒险者协会
    const L = D('library');
    hall(b, { x: L.x, z: L.z, rotY: faceRoad(L.x, L.z), w: 18, d: 11, h: 8.6, floors: 2, wall: 5, roof: 3, sign: '书店', windows: 6, awning: 1, signBg: '#3a2a1c' });
    claim(L.x, L.z, 12);
    add({ id: 'library', name: '书店', kind: 'read', x: L.x, z: L.z, r: 13, hint: 'E 看书' });
    const G = D('guild');
    hall(b, { x: G.x, z: G.z, rotY: faceRoad(G.x, G.z), w: 18, d: 12, h: 8, floors: 2, wall: 3, roof: 2, sign: '冒险者协会', windows: 6, awning: 0 });
    claim(G.x, G.z, 12);
    add({ id: 'guild', name: '冒险者协会', kind: 'guild', x: G.x, z: G.z, r: 12, hint: 'E 接委托' });

    // 南市街：电影院、电玩店、网吧、超市——老房子的屋檐，亮着霓虹的招牌
    const C = D('cinema');
    LM.neonShop(b, { x: C.x, z: C.z, rotY: 0, w: 24, d: 14, h: 10, sign: '玉海电影院', neon: 1, signBg: '#5a2f86', signFg: '#ffe9a8' });
    claim(C.x, C.z, 15);
    add({ id: 'cinema', name: '电影院', kind: 'village', x: C.x, z: C.z + 9, r: 9, hint: 'E 看看排片', text: '今天放的是《河湾上的小鲸鱼》。海报上画着一条蓝色的鱼，售票窗口排着三四个人。' });
    const A = D('arcade');
    LM.neonShop(b, { x: A.x, z: A.z, rotY: 0, w: 18, d: 12, h: 9, sign: '电玩店', neon: 2, signBg: '#2a3a8a', signFg: '#ffffff' });
    claim(A.x, A.z, 12);
    add({ id: 'arcade', name: '电玩店', kind: 'arcade', x: A.x, z: A.z + 8, r: 9, hint: 'E 打电玩' });
    const N = D('netcafe');
    hall(b, { x: N.x, z: N.z, rotY: 0, w: 14, d: 11, h: 7.6, floors: 2, wall: 4, roof: 3, sign: '网吧', windows: 5, awning: 4, signBg: '#22304a', flat: true });
    claim(N.x, N.z, 10);
    add({ id: 'netcafe', name: '网吧', kind: 'net', x: N.x, z: N.z + 7, r: 9, hint: 'E 上网' });
    const S = D('supermarket');
    LM.neonShop(b, { x: S.x, z: S.z, rotY: 0, w: 24, d: 13, h: 9.4, sign: '玉海超市', neon: 3, signBg: '#d8641e', signFg: '#fff6dc' });
    claim(S.x, S.z, 15);
    add({ id: 'supermarket', name: '超市', kind: 'shop', x: S.x, z: S.z + 9, r: 10, hint: 'E 逛超市' });

    // 集市：一片布棚
    const K = D('market');
    for (let i = 0; i < 12; i++) {
      const gx = (i % 4) - 1.5;
      const gz = Math.floor(i / 4) - 1;
      stall(b, { x: K.x + gx * 5.5, z: K.z + gz * 6, rotY: 0, c1: 'cloth#3', c2: `cloth#${i % 5 === 3 ? 4 : i % 3}` });
    }
    banner(b, K.x, K.z - 9.5, '集市', 0, 7);
    claim(K.x, K.z, 19);
    add({ id: 'market', name: '集市', kind: 'market', x: K.x, z: K.z, r: 20, hint: 'E 买菜' });

    // 花鸟市场：一圈摊位
    const F = D('flowermarket');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      stall(b, { x: F.x + Math.cos(a) * 14, z: F.z + Math.sin(a) * 14, rotY: -a + Math.PI / 2, c1: 'cloth#3', c2: `cloth#${i % 2 ? 1 : 2}` });
    }
    banner(b, F.x, F.z - 19, '花鸟市场', 0, 8);
    claim(F.x, F.z, 19);
    add({ id: 'flowermarket', name: '花鸟市场', kind: 'seed', x: F.x, z: F.z, r: 20, hint: 'E 买花苗和种子' });

    // 老街：沿街两排小吃摊，夜里一路灯串
    {
      const line = [[130, -40], [125, 40]];
      const [from, to] = line;
      const n = 9;
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const nx = -(to[1] - from[1]) / len;
      const nz = (to[0] - from[0]) / len;
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const side = i % 2 ? 1 : -1;
        const ox = from[0] + (to[0] - from[0]) * t + nx * 6.6 * side;
        const oz = from[1] + (to[1] - from[1]) * t + nz * 6.6 * side;
        const rot = Math.atan2(-nx * side, -nz * side);
        stall(b, { x: ox, z: oz, rotY: rot, c1: 'cloth#3', c2: pick(random, ['cloth#0', 'cloth#1', 'cloth#2', 'cloth#4']) });
        claim(ox, oz, 3);
        if (i % 3 === 0) banner(b, ox, oz, pick(random, ['烤鱼', '白米饭', '糖油粑粑', '酸辣粉', '炸鸡', '奶茶']), rot, 5.0);
      }
      add({ id: 'food-street', name: '老街小吃', kind: 'eat', x: 128, z: 0, r: 36, hint: 'E 吃点什么' });
    }
  }

  // ===== AI 小镇 ===============================================================================================
  {
    const d = D('aitown');
    // 那栋写着 AI 的白楼
    hall(b, { x: d.x + 8, z: d.z - 20, rotY: 0, w: 17, d: 11, h: 11.4, floors: 3, wall: 1, roof: 3, sign: 'AI', windows: 6, flat: true, signBg: '#f4f7fb', signFg: '#2a5fd0' });
    claim(d.x + 8, d.z - 20, 12);
    add({ id: 'ailab', name: 'AI 实验室', kind: 'study', x: d.x + 8, z: d.z - 12, r: 9, hint: 'E 上课' });
    // 玻璃花房
    const gx = d.x + 78;
    const gz = d.z - 26;
    LM.greenhouse(b, { x: gx, z: gz, rotY: 0, w: 20, d: 12, h: 8 });
    claim(gx, gz, 13);
    add({ id: 'greenhouse', name: '玻璃花房', kind: 'seed', x: gx, z: gz + 9, r: 8, hint: 'E 买花苗和种子' });
    // 小广场：长椅、路灯
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.6;
      bench(b, d.x + Math.cos(a) * 11, d.z + Math.sin(a) * 11, -a);
    }
    claim(d.x, d.z, 9);
  }

  // ===== 丰收田园：种子铺、租的菜地 =============================================================================
  {
    const d = D('farm');
    hall(b, { x: d.x + 22, z: d.z - 30, rotY: faceRoad(d.x + 22, d.z - 30), w: 14, d: 9, h: 6, floors: 1, wall: 3, roof: 4, windows: 4, sign: '种子铺' });
    claim(d.x + 22, d.z - 30, 10);
    add({ id: 'farm', name: '丰收田园', kind: 'farm', x: d.x + 6, z: d.z - 6, r: 14, hint: 'E 找农夫聊天' });
    add({ id: 'farm-seeds', name: '种子铺', kind: 'seed', x: d.x + 22, z: d.z - 24, r: 9, hint: 'E 买种子' });
    const { x: cx, z: cz } = GARDENS[1];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) gardenPlots.push({ x: cx - 3.9 + col * 2.6, z: cz - 2 + row * 2, where: '租的菜地' });
    }
    fence(b, cx - 6, cz - 3.6, cx + 6, cz - 3.6, 0.8);
    fence(b, cx - 6, cz + 3.6, cx + 6, cz + 3.6, 0.8);
    fence(b, cx - 6, cz - 3.6, cx - 6, cz + 3.6, 0.8);
    banner(b, cx + 7.5, cz, '租的菜地', Math.PI / 2, 3);
    claim(cx, cz, 9);
    for (const [dx, dz] of [[30, 44], [44, 30], [16, 52]]) LM.haystack(b, d.x + dx, d.z + dz, 0.9 + random() * 0.3);
  }

  // ===== 河鲜集市：河边一条木栈台，摊上摆着鱼、虾、鱼干 ===========================================================
  {
    const d = D('fishmarket');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.3;
      const x = d.x + Math.cos(a) * 11;
      const z = d.z + Math.sin(a) * 11;
      stall(b, { x, z, rotY: -a + Math.PI / 2, c1: 'cloth#3', c2: `cloth#${[4, 1, 0][i % 3]}` });
      stallGoods.push({ x, z, y: heightAt(x, z) + 1.0, h: 0.5, name: ['fish', 'shrimp', 'dried-fish'][i % 3] });
    }
    for (let i = 0; i < 2; i++) {
      const x = d.x - 3 + i * 6;
      const gy = heightAt(x, d.z);
      for (const sx of [-1.6, 1.6]) b.add(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), 'wood#2', [x + sx, gy + 1.2, d.z]);
      b.add(new THREE.BoxGeometry(3.4, 0.07, 0.07), 'wood#2', [x, gy + 2.3, d.z]);
      for (let k = 0; k < 5; k++) stallGoods.push({ x: x - 1.2 + k * 0.6, z: d.z, y: gy + 1.5, h: 0.42, name: 'dried-fish' });
    }
    banner(b, d.x, d.z - 17, '河鲜集市', Math.PI, 7);
    claim(d.x, d.z, 17);
    add({ id: 'fishmarket', name: '河鲜集市', kind: 'fishmarket', x: d.x, z: d.z, r: 15, hint: 'E 逛河鲜集市' });
    add({ id: 'fishmarket-pier', name: '集市栈台', kind: 'fish', x: -397, z: 190, r: 8, hint: 'E 钓鱼' });
  }

  // ===== 新新区 CBD：一片玻璃幕墙的高楼，中间是市民广场 ===========================================================
  {
    const TOWERS = [
      [405, -152, 22, 22, 70, 1, 0], [408, -205, 20, 20, 46, 2, 1], [490, -172, 24, 22, 86, 1, 1], [494, -228, 20, 18, 52, 0, 0], [578, -202, 22, 22, 62, 2, 0],
      [400, -48, 22, 20, 42, 2, 2], [562, -100, 20, 20, 54, 1, 2], [628, -108, 18, 18, 38, 2, 0], [418, 8, 26, 16, 28, 2, 2], [540, -18, 20, 20, 58, 1, 1], [470, -292, 18, 18, 34, 2, 2],
    ];
    for (const [x, z, w, dd, h, glass, style] of TOWERS) {
      if (!free(x, z, w * 0.6) || roadEdge(x, z) < Math.max(w, dd) / 2 + 1) continue;
      LM.tower(b, { x, z, rotY: 0, w, d: dd, h, glass, style });
      claim(x, z, Math.max(w, dd) * 0.72);
    }
    const c = D('civic');
    fountain(b, { x: c.x, z: c.z });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4;
      bench(b, c.x + Math.cos(a) * 13, c.z + Math.sin(a) * 13, -a);
      lamp(b, c.x + Math.cos(a + 0.5) * 19, c.z + Math.sin(a + 0.5) * 19);
      sakura.push([c.x + Math.cos(a + 0.25) * 27, c.z + Math.sin(a + 0.25) * 27]);
    }
    claim(c.x, c.z, 22);
    add({ id: 'civic', name: '市民广场', kind: 'wish', x: c.x, z: c.z, r: 7.5, hint: 'E 许个愿' });
    add({ id: 'cbd', name: '新新区 CBD', kind: 'village', x: 446, z: -100, r: 10, hint: 'E 看看', text: '楼一栋比一栋高，玻璃上映着云。午休的人端着咖啡，在市民广场的喷泉边坐成一排。' });
    // 体育馆
    const g = D('gym');
    gym(b, { x: g.x, z: g.z, rotY: 0 });
    claim(g.x, g.z, 30);
    add({ id: 'gym', name: '体育馆', kind: 'sport', x: g.x, z: g.z + 26, r: 12, hint: 'E 锻炼' });
  }

  // ===== 海滨小镇：崖上的石头房子，橘红的瓦；尽头一座红白灯塔 =====================================================
  {
    const d = D('seaside');
    add({ id: 'seaside', name: '海滨小镇', kind: 'village', x: d.x - 14, z: d.z + 6, r: 12, hint: 'E 和镇上的人聊聊', text: '石头墙，橘红瓦，晾着渔网。海风里有一点咸味，崖下的浪一下一下拍着礁石。' });
    const L = D('lighthouse');
    const gy = heightAt(L.x, L.z);
    b.add(new THREE.CylinderGeometry(4.2, 4.8, 2.4, 20), 'stone#2', [L.x, gy + 0.6, L.z]);
    for (let i = 0; i < 6; i++) {
      const r0 = 3.4 - i * 0.28;
      b.add(new THREE.CylinderGeometry(r0 - 0.28, r0, 3.4, 20), i % 2 ? 'cloth#0' : 'wall#1', [L.x, gy + 3.5 + i * 3.4, L.z]);
    }
    const top = gy + 1.8 + 6 * 3.4;
    b.add(new THREE.CylinderGeometry(2.7, 2.7, 0.3, 20), 'iron#0', [L.x, top + 0.15, L.z]);
    for (let k = 0; k < 10; k++) b.add(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), 'iron#0', [L.x + Math.cos((k / 10) * TAU) * 2.6, top + 0.8, L.z + Math.sin((k / 10) * TAU) * 2.6]);
    b.add(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 12), 'glow#0', [L.x, top + 1.4, L.z]);
    lighthouseLamp = [L.x, top + 1.4, L.z];
    b.add(new THREE.ConeGeometry(2.0, 1.8, 12), 'cloth#0', [L.x, top + 3.4, L.z]);
    b.add(new THREE.BoxGeometry(1.2, 2.2, 0.2), 'wood#0', [L.x - 4.3, gy + 2.2, L.z], Math.PI / 2);
    b.collide(L.x, L.z, 4.6, 4.6, 26);
    claim(L.x, L.z, 8);
    add({ id: 'lighthouse', name: '灯塔', kind: 'village', x: L.x - 8, z: L.z, r: 8, hint: 'E 看海', text: '海一直铺到天边。远处有两三点白帆，港口的吊机像几只长脚的鸟。' });
  }

  // ===== 港口：仓库、吊机、集装箱，两条伸进海里的石码头 ===========================================================
  {
    for (const [x, z] of [[737, 8], [737, 182]]) {
      LM.warehouse(b, { x, z, rotY: Math.PI / 2, w: 30, d: 16, h: 7 });
      claim(x, z, 18);
    }
    LM.warehouse(b, { x: 668, z: 196, rotY: Math.PI / 2, w: 26, d: 14, h: 6.4 });
    claim(668, 196, 16);
    for (const [x, z] of [[762, 26], [762, 116]]) {
      LM.crane(b, { x, z, rotY: Math.PI / 2, h: 24 });
      claim(x, z, 7);
    }
    for (const [x, z, rot, n] of [[742, 62, 0, 5], [748, 82, Math.PI / 2, 4], [738, 128, 0, 6], [752, 156, Math.PI / 2, 4], [716, 150, 0.2, 3]]) {
      LM.containers(b, { x, z, rotY: rot, n });
      claim(x, z, 6);
    }
    add({ id: 'port', name: '港口', kind: 'village', x: 722, z: 96, r: 10, hint: 'E 看看码头', text: '吊机把箱子一只只吊上船。工人说，下一班去大学城的货船傍晚才开。' });
    add({ id: 'port-pier', name: '港口码头', kind: 'fish', x: 846, z: 48, r: 9, hint: 'E 钓鱼' });
  }

  // ===== 大学城：红砖楼、钟楼、樱花草坪，东边是观海台 =============================================================
  {
    const d = D('university');
    const halls = [
      { name: '玉海大学', x: d.x, z: d.z - 44, rot: 0, w: 40, d: 15, h: 11.4, columns: 6 },
      { name: '玉海中学', x: d.x - 62, z: d.z - 30, rot: Math.PI / 2, w: 30, d: 13, h: 9.6, columns: 4 },
      { name: '玉海第一小学', x: d.x + 70, z: d.z + 14, rot: -Math.PI / 2, w: 30, d: 13, h: 8.4, columns: 4 },
      { name: '图书馆', x: d.x - 34, z: d.z + 52, rot: Math.PI, w: 26, d: 13, h: 9, columns: 4 },
    ];
    for (const s of halls) {
      hall(b, { x: s.x, z: s.z, rotY: s.rot, w: s.w, d: s.d, h: s.h, floors: s.h > 9.4 ? 3 : 2, wall: 9, roof: 0, sign: s.name, windows: Math.round(s.w / 3.6), columns: s.columns });
      claim(s.x, s.z, s.w * 0.6);
      const fx = Math.sin(s.rot);
      const fz = Math.cos(s.rot);
      add({ id: `school-${s.name}`, name: s.name, kind: s.name === '图书馆' ? 'read' : 'study', x: s.x + fx * 10, z: s.z + fz * 10, r: 10, hint: s.name === '图书馆' ? 'E 看书' : 'E 上课' });
    }
    LM.clockTower(b, { x: d.x + 30, z: d.z - 46, rotY: 0, h: 36 });
    claim(d.x + 30, d.z - 46, 6);
    for (const [dx, dz] of [[-16, -14], [16, -14], [-28, 10], [28, 12], [0, 22], [-44, 24], [46, -8]]) sakura.push([d.x + dx, d.z + dz]);
    for (let i = 0; i < 4; i++) bench(b, d.x - 9 + i * 6, d.z + 8, 0);
    // 观海台：崖边一圈栏杆、两条长椅
    const vx = 808;
    const vz = -512;
    for (let i = 0; i < 9; i++) {
      const a0 = -1.3 + (i / 9) * 2.6;
      const a1 = -1.3 + ((i + 1) / 9) * 2.6;
      fence(b, vx + Math.cos(a0) * 12, vz + Math.sin(a0) * 12, vx + Math.cos(a1) * 12, vz + Math.sin(a1) * 12, 1.1);
    }
    bench(b, vx + 5, vz - 4, -Math.PI / 2);
    bench(b, vx + 5, vz + 4, -Math.PI / 2);
    add({ id: 'viewpoint', name: '观海台', kind: 'village', x: vx, z: vz, r: 9, hint: 'E 看海', text: '崖下是海，海上是云。风很大，把校服的衣角吹得哗啦哗啦响。' });
  }

  // ===== 湖边小镇：红瓦小镇，尖顶教堂，两条木栈桥伸进月亮湖 =======================================================
  {
    const d = D('lakeside');
    paintedHouse(d.x + 22, d.z + 44, { shape: 'church', scale: 1.2, kitScale: 1.05, turn: faceRoad(d.x + 22, d.z + 44), wall: WALLS[0], roof: [0.72, 0.3, 0.2] });
    add({ id: 'church', name: '教堂', kind: 'pray', x: d.x + 22, z: d.z + 44, r: 15, hint: 'E 祈祷' });
    add({ id: 'lakeside', name: '湖边小镇', kind: 'village', x: d.x + 4, z: d.z + 12, r: 10, hint: 'E 和镇上的人聊聊', text: '红瓦的小房子挤在湖边。咖啡店把桌子摆到了水边，阳伞下有人在画湖。' });
    for (const [x, z] of [[176, -520], [182, -496], [172, -470]]) parasols.push([x, z]);
  }

  // ===== 高铁站：玻璃拱顶的大厅，铁路从背后的高架上过 =============================================================
  const stationHall = { x: 20, z: 398 };

  // ===== 海鲜排档：沙滩边一圈棚子和桌子 ===========================================================================
  {
    const d = D('seafood');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.2;
      const x = d.x + Math.cos(a) * 15;
      const z = d.z + Math.sin(a) * 15;
      stall(b, { x, z, rotY: -a + Math.PI / 2, c1: i % 2 ? 'cloth#3' : 'cloth#2', c2: `cloth#${[0, 4, 1][i % 3]}` });
      stallGoods.push({ x, z, y: heightAt(x, z) + 1.0, h: 0.5, name: ['shrimp', 'fish', 'dried-fish'][i % 3] });
      claim(x, z, 2.6);
    }
    banner(b, d.x, d.z - 21, '海鲜排档', 0, 8);
    for (const [dx, dz] of [[-5, -4], [5, -3], [0, 5], [-7, 6], [8, 6]]) parasols.push([d.x + dx, d.z + dz]);
    claim(d.x, d.z, 10);
    add({ id: 'seafood', name: '海鲜排档', kind: 'eat', x: d.x, z: d.z, r: 16, hint: 'E 吃海鲜' });
    add({ id: 'beach-pier', name: '观海栈桥', kind: 'fish', x: 574, z: 534, r: 9, hint: 'E 钓鱼' });
  }

  // ===== 海边新城：一排排米色的公寓楼；码头、海堤、小灯塔 =========================================================
  {
    const BLOCKS = [
      [-842, 298, 0, 7, 7], [-806, 296, 0, 9, 8], [-770, 300, 0, 6, 6], [-704, 298, 0, 8, 7], [-668, 300, 0, 6, 8],
      [-842, 366, Math.PI, 6, 8], [-800, 364, Math.PI, 8, 6], [-700, 364, Math.PI, 7, 7], [-660, 366, Math.PI, 5, 6],
      [-842, 432, 0, 8, 6], [-800, 434, 0, 6, 7], [-696, 432, 0, 9, 8], [-656, 434, 0, 6, 7],
    ];
    for (const [x, z, rot, floors, wall] of BLOCKS) {
      if (!free(x, z, 13) || !dry(x, z, 6)) continue;
      LM.apartment(b, { x, z, rotY: rot, w: 26, d: 13, floors, wall });
      claim(x, z, 16);
    }
    for (const [x, z] of [[-770, 404], [-762, 392], [-778, 414], [-722, 300], [-756, 366], [-640, 400], [-720, 436]]) sakura.push([x, z]);
    for (let i = 0; i < 3; i++) bench(b, -774 + i * 5, 398, 0);
    add({ id: 'newtown', name: '海边新城', kind: 'village', x: -744, z: 344, r: 10, hint: 'E 看看', text: '楼是新的，阳台上晾着被子。楼下的樱花开了，老人在树下下棋。' });
    // 码头
    const lampAt = LM.beacon(b, { x: -836, z: 632, rotY: 0, h: 9, y: SEA.level + 2.3 });
    if (lampAt) lanterns.push(lampAt);
    add({ id: 'harbor', name: '码头', kind: 'village', x: -734, z: 496, r: 9, hint: 'E 看看码头', text: '小渔船挤在港湾里，桅杆轻轻碰着。海堤外面浪大，里面的水平得像一面镜子。' });
    add({ id: 'harbor-pier', name: '码头栈桥', kind: 'fish', x: -705, z: 554, r: 8, hint: 'E 钓鱼' });
  }

  // ===== 田园小镇：红瓦农舍、两座风车、谷仓和草垛 =================================================================
  {
    const d = D('pastoral');
    const w1 = LM.windmill(b, { x: d.x - 42, z: d.z - 36, rotY: 0.5, h: 13, wood: false });
    if (w1) spinners.push({ kind: 'sails', ...w1, speed: 0.5 });
    claim(d.x - 42, d.z - 36, 9);
    const w2 = LM.windmill(b, { x: -962, z: -30, rotY: 1.2, h: 14, wood: true });
    if (w2) spinners.push({ kind: 'sails', ...w2, speed: 0.42 });
    claim(-962, -30, 9);
    hall(b, { x: d.x + 44, z: d.z - 34, rotY: faceRoad(d.x + 44, d.z - 34), w: 18, d: 10, h: 6.4, floors: 1, wall: 3, roof: 0, windows: 4, sign: '谷仓' });
    claim(d.x + 44, d.z - 34, 12);
    for (const [x, z] of [[-905, -40], [-880, 10], [-930, 80], [-840, 120], [-800, 30], [-790, -50], [-900, 150], [-950, 20]]) LM.haystack(b, x, z, 0.9 + random() * 0.4);
    add({ id: 'pastoral', name: '田园小镇', kind: 'village', x: d.x + 4, z: d.z + 8, r: 10, hint: 'E 和镇上的人聊聊', text: '风车慢慢地转。麦子黄了，拖拉机在田里来来回回，晒谷场上铺着一地金子。' });
    add({ id: 'windmill', name: '老风车', kind: 'village', x: -956, z: -24, r: 8, hint: 'E 看风车', text: '木头风车有一百岁了，叶片上的帆布补了又补。转起来的时候，整座塔都在轻轻地哼。' });
  }

  // ===== 雪山小镇：原木屋、冰塘、雪人 =============================================================================
  {
    const d = D('snowtown');
    LM.icePond(b, { x: d.x - 14, z: d.z + 18, r: 10 });
    claim(d.x - 14, d.z + 18, 12);
    for (const [dx, dz] of [[2, 12], [-28, 8], [10, 28], [-30, 34]]) LM.snowman(b, d.x + dx, d.z + dz, 0.9 + random() * 0.3);
    for (const [dx, dz] of [[26, -10], [-40, -12], [34, 30]]) LM.logPile(b, d.x + dx, d.z + dz, 1);
    add({ id: 'snowtown', name: '雪山小镇', kind: 'village', x: d.x + 6, z: d.z + 4, r: 10, hint: 'E 和镇上的人聊聊', text: '木屋的烟囱冒着白烟，孩子们在冰塘上滑冰。再往北，就是雪山了。' });
    add({ id: 'icepond', name: '冰塘', kind: 'play', x: d.x - 14, z: d.z + 18, r: 9, hint: 'E 滑一会儿冰' });
  }

  // ===== 镇上的房子：先散着盖各个镇，再沿石板街排两排 =============================================================
  scatter(-460, -112, 120, 34, STYLE.euro, { minR: 16, shops: 0.18 });
  scatter(D('lakeside').x, D('lakeside').z, 92, 26, STYLE.euro, { minR: 10, shops: 0.2 });
  scatter(D('seaside').x, D('seaside').z, 96, 34, STYLE.coast, { minR: 8, shops: 0.14, gap: 7.5 });
  scatter(D('pastoral').x, D('pastoral').z, 82, 16, STYLE.farm, { minR: 10, shops: 0.05, gap: 10, turn: 'any' });
  scatter(D('snowtown').x, D('snowtown').z, 84, 22, STYLE.snow, { minR: 16, shops: 0.06, gap: 10, turn: 'any' });
  scatter(-452, 62, 56, 4, STYLE.farm, { minR: 20, shops: 0, gap: 10, turn: 'any' });

  const lampSpots = [];
  const treeSpots = []; // 行道树
  {
    for (const line of ROADS) {
      if (line.kind !== 'street') continue;
      let carry = 4;
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, az] = line[i];
        const [bx, bz] = line[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const ux = (bx - ax) / len;
        const uz = (bz - az) / len;
        const nx = -uz;
        const nz = ux;
        const style = styleAt((ax + bx) / 2, (az + bz) / 2);
        for (const side of [-1, 1]) {
          if (!style) break;
          let t = carry + (side > 0 ? 3 : 0);
          while (t < len - 3) {
            const shape = pick(random, style.shapes);
            const item = kitFor(shape, style);
            const scale = item ? 0.94 + random() * 0.14 : 0.95 + random() * 0.22;
            // 屋檐朝街（长边贴街），否则山墙朝街。套件的房子正面是做好的：一律正面朝街
            const eaves = item ? false : random() < 0.55 || shape === 'long';
            const fp = footOf(shape, item, scale);
            const along = eaves ? fp[1] : fp[0];
            const deep = eaves ? fp[0] : fp[1];
            const setback = STREET_HALF + (item ? -0.5 + random() * 0.7 : 1.6 + random() * 1.6);
            const px = ax + ux * (t + along / 2) + nx * side * (setback + deep / 2);
            const pz = az + uz * (t + along / 2) + nz * side * (setback + deep / 2);
            const r = Math.max(along, deep) * 0.5;
            // 局部 +z 指向街
            const face = Math.atan2(-nx * side, -nz * side);
            const ok = plazaDistance(px, pz) > 36 + r && roadEdge(px, pz) > deep / 2 + 0.6 && (item ? freeC(px, pz, r * 0.8) && houseFits(px, pz, face, item, scale, 0.9) : free(px, pz, r * 0.95)) && dry(px, pz) && cityDistance(px, pz) < CITY_R + 10 + (style === STYLE.china ? 0 : 1e4);
            if (ok && random() < (item ? 0.95 : 0.86)) {
              paintedHouse(px, pz, { shape, item, style, auto: true, kitScale: scale, scale, turn: face + (eaves ? Math.PI / 2 : 0), wall: pick(random, style.walls), roof: pick(random, style.roofs), shops: style === STYLE.china ? 0.34 : 0.2 });
              t += along + (item ? 0.25 + random() * 0.9 : 1.2 + random() * 2.8);
            } else {
              // 空出来的地方种一棵行道树
              if (free(px, pz, 3) && roadEdge(px, pz) > 2 && plazaDistance(px, pz) > 33) treeSpots.push([ax + ux * (t + 3) + nx * side * (STREET_HALF + 2.8), az + uz * (t + 3) + nz * side * (STREET_HALF + 2.8)]);
              t += 9 + random() * 5;
            }
          }
        }
        // 路灯：每 26 m 一盏，左右交替
        for (let t = 8; t < len; t += 26) {
          const side = Math.round(t / 26) % 2 ? 1 : -1;
          const lx = ax + ux * t + nx * side * (STREET_HALF + 0.5);
          const lz = az + uz * t + nz * side * (STREET_HALF + 0.5);
          if (plazaDistance(lx, lz) < 32 || !free(lx, lz, 0.4)) continue;
          lampSpots.push([lx, lz, Math.atan2(-nx * side, -nz * side)]);
        }
        carry = 2;
      }
    }
    // 城与城之间的公路：隔得远一点也立一盏灯
    for (const g of SEGS) {
      if (g.kind !== 'road') continue;
      const len = Math.hypot(g.bx - g.ax, g.bz - g.az);
      for (let t = 20; t < len; t += 58) {
        const side = Math.round(t / 58) % 2 ? 1 : -1;
        const lx = g.ax + ((g.bx - g.ax) * t) / len - ((g.bz - g.az) / len) * side * (STREET_HALF + 0.9);
        const lz = g.az + ((g.bz - g.az) * t) / len + ((g.bx - g.ax) / len) * side * (STREET_HALF + 0.9);
        if (!free(lx, lz, 0.6) || riverAt(lx, lz).d < RIVER_HALF + 6) continue;
        lampSpots.push([lx, lz, Math.atan2((g.bz - g.az) * side, -(g.bx - g.ax) * side)]);
      }
    }
    for (const [lx, lz, r] of lampSpots) lamp(b, lx, lz, r);
  }
  // 广场一圈：高一点的房子把广场围起来，街口留着
  {
    const [px, pz] = PLAZA;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + 0.07;
      const x = px + Math.cos(a) * 41;
      const z = pz + Math.sin(a) * 41;
      // 北边留空：从广场要能一眼看到玉海宫
      if (roadEdge(x, z) < 5.2 || !free(x, z, 4.4) || (z < pz - 22 && Math.abs(x - px) < 34)) continue;
      paintedHouse(x, z, { style: STYLE.china, shape: i % 3 ? 'tall' : 'house', scale: 1.02 + random() * 0.14, turn: Math.atan2(px - x, pz - z) + (kit || i % 3 ? 0 : Math.PI / 2), wall: pick(random, STYLE.china.walls), roof: pick(random, STYLE.china.roofs), shops: 0.4 });
    }
  }
  // 玉海城的巷子里：把空地填上，老城才挤挤挨挨的
  scatter(YUHAI[0], YUHAI[1], CITY_R - 8, 150, STYLE.china, { gap: 7.2, road: 6.5, shops: 0.16, scale: [0.9, 0.3], more: kit ? 8 : 1 });
  if (kit) {
    // 城和镇之间不再是空的：公路边每隔一段有个小聚落——三五户人家、一座谷仓；镇子外圈再散开一圈人家
    for (const g of SEGS) {
      if (g.kind !== 'road') continue;
      const len = Math.hypot(g.bx - g.ax, g.bz - g.az);
      for (let t = 70 + random() * 60; t < len - 50; t += 110 + random() * 90) {
        const side = random() < 0.5 ? -1 : 1;
        const cx = g.ax + ((g.bx - g.ax) * t) / len - ((g.bz - g.az) / len) * side * 26;
        const cz = g.az + ((g.bz - g.az) * t) / len + ((g.bx - g.ax) / len) * side * 26;
        if (builtAt(cx, cz) > 0.3 || forestAt(cx, cz) > 0.5) continue;
        scatter(cx, cz, 30, 4 + Math.floor(random() * 4), cityDistance(cx, cz) < CITY_R + 160 ? STYLE.euro : STYLE.farm, { shops: 0.04, more: 1 });
      }
    }
    for (const [x, z, r, n, style] of [[-460, -112, 250, 60, STYLE.euro], [D('lakeside').x, D('lakeside').z, 200, 40, STYLE.euro], [D('seaside').x, D('seaside').z, 190, 40, STYLE.coast], [D('pastoral').x, D('pastoral').z, 210, 40, STYLE.farm], [-740, 350, 170, 60, STYLE.coast], [640, -480, 190, 60, STYLE.euro], [445, -120, 190, 50, STYLE.euro], [20, 410, 150, 40, STYLE.coast], [HOME[0], HOME[1], 150, 24, STYLE.euro], [YUHAI[0], YUHAI[1], CITY_R + 120, 160, STYLE.euro]]) scatter(x, z, r, n, style, { minR: 30, shops: 0.05, more: 1 });
  }

  // ===== 石桥：路跨过清溪河的地方 ================================================================================
  for (const br of BRIDGES) {
    const cos = Math.cos(br.rot);
    const sin = Math.sin(br.rot);
    const at = (lx, ly, lz) => [br.x + lx * cos + lz * sin, br.deck + ly, br.z - lx * sin + lz * cos];
    const put = (geo, key, lx, ly, lz) => b.add(geo, key, at(lx, ly, lz), br.rot);
    put(new THREE.BoxGeometry(br.w, 0.6, br.len), 'stone#1', 0, -0.3, 0);
    // 两头的引桥（斜下去接到岸上）
    for (const s2 of [-1, 1]) {
      const ramp = new THREE.BoxGeometry(br.w, 0.6, 9);
      ramp.rotateX(s2 * 0.12);
      put(ramp, 'stone#1', 0, -0.85, s2 * (br.len / 2 + 4.2));
    }
    // 桥墩和拱
    for (const lz of [-br.len * 0.28, br.len * 0.28]) put(new THREE.BoxGeometry(br.w - 0.6, 6, 2.2), 'stone#0', 0, -3.4, lz);
    for (const lz of [-br.len * 0.42, 0, br.len * 0.42]) {
      const arch = new THREE.CylinderGeometry(3.6, 3.6, br.w - 0.2, 14, 1, false, 0, Math.PI);
      arch.rotateZ(Math.PI / 2);
      arch.rotateY(Math.PI / 2);
      put(arch, 'stone#0', 0, -3.9, lz);
    }
    // 栏杆
    for (const sx of [-1, 1]) {
      put(new THREE.BoxGeometry(0.34, 0.9, br.len), 'stone#2', sx * (br.w / 2 - 0.17), 0.45, 0);
      for (let i = 0; i <= 6; i++) put(new THREE.BoxGeometry(0.5, 1.25, 0.5), 'stone#0', sx * (br.w / 2 - 0.17), 0.62, -br.len / 2 + (i * br.len) / 6);
    }
    claim(br.x, br.z, br.len / 2 + 6);
    add({ id: `bridge-${br.name}`, name: br.name, kind: 'village', x: br.x, z: br.z, r: 5, hint: 'E 看河', text: '河水清得能看见卵石。有小鱼逆着水往上游。' });
  }

  // ===== 栈桥、木栈台、海堤、石码头 ==============================================================================
  {
    const moles = [];
    for (const p of PIERS) {
      const sin = Math.sin(p.rot);
      const cos = Math.cos(p.rot);
      const a = [p.x - sin * (p.len / 2), p.z - cos * (p.len / 2)];
      const e = [p.x + sin * (p.len / 2), p.z + cos * (p.len / 2)];
      if (p.kind === 'mole') moles.push({ a, e, top: p.deck });
      else if (p.kind === 'quay') {
        b.add(new THREE.BoxGeometry(p.w, 9, p.len), 'stone#2', [p.x, p.deck - 4.5, p.z], p.rot);
        b.add(new THREE.BoxGeometry(p.w + 0.5, 0.3, p.len + 0.5), 'stone#1', [p.x, p.deck - 0.1, p.z], p.rot);
        for (let k = 0; k <= 5; k++) for (const sx of [-1, 1]) b.add(new THREE.CylinderGeometry(0.26, 0.32, 0.7, 8), 'iron#0', [p.x + sin * (-p.len / 2 + 6 + k * ((p.len - 12) / 5)) + cos * sx * (p.w / 2 - 0.8), p.deck + 0.35, p.z + cos * (-p.len / 2 + 6 + k * ((p.len - 12) / 5)) - sin * sx * (p.w / 2 - 0.8)]);
      } else LM.pier(b, { x: a[0], z: a[1], rotY: p.rot, len: p.len, w: p.w, top: p.deck });
      claim(p.x, p.z, Math.min(p.len, 30) / 2);
    }
    // 海堤：把三段连成一条，两边堆着大石头
    if (moles.length) LM.breakwater(b, [moles[0].a, moles[0].e, moles[1].e, moles[2].e], { top: moles[0].top });
  }

  // ===== 公交站牌（37 路）和地铁口（1 号线）======================================================================
  for (const st of BUS_STOPS) {
    const gy = heightAt(st.x, st.z - 5);
    b.add(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6), 'iron#0', [st.x, gy + 1.4, st.z - 5]);
    b.add(new THREE.BoxGeometry(3.4, 0.12, 1.4), 'cloth#2', [st.x + 1.4, gy + 2.5, st.z - 5]);
    b.add(new THREE.BoxGeometry(2.6, 0.12, 0.5), 'wood#1', [st.x + 1.4, gy + 0.5, st.z - 5.3]);
    for (const dx of [0.2, 2.6]) b.add(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), 'iron#0', [st.x + dx, gy + 1.25, st.z - 5.5]);
    b.addSign(`37路 ${st.name}`, [st.x, gy + 2.2, st.z - 4.9], 0, { w: 2.6, h: 0.5, bg: '#e8a13a', fg: '#3a2a1c' });
    claim(st.x + 1.2, st.z - 5, 2.6);
    add({ id: `bus-${st.name}`, name: `公交站 · ${st.name}`, kind: 'bus', line: '37 路公交', x: st.x + 1, z: st.z - 4, r: 5, hint: 'E 坐 37 路公交', stop: st.name });
  }
  for (const st of METRO_STOPS) {
    const gy = heightAt(st.x, st.z);
    b.add(new THREE.BoxGeometry(4.2, 0.3, 5.2), 'stone#2', [st.x, gy + 0.05, st.z]);
    for (const [dx, dz] of [[-1.8, -2.3], [1.8, -2.3], [-1.8, 2.3], [1.8, 2.3]]) b.add(new THREE.CylinderGeometry(0.09, 0.09, 2.8, 6), 'iron#0', [st.x + dx, gy + 1.5, st.z + dz]);
    b.add(new THREE.BoxGeometry(4.6, 0.2, 5.6), 'paint#9', [st.x, gy + 2.95, st.z]);
    b.add(new THREE.BoxGeometry(3.6, 1.0, 0.12), 'glass#2', [st.x, gy + 0.9, st.z - 2.3]);
    b.addSign(`Ⓜ ${st.name}`, [st.x, gy + 2.5, st.z + 2.86], 0, { w: 3.6, h: 0.6, bg: '#6a48b0', fg: '#ffffff' });
    b.collide(st.x, st.z - 2.3, 1.9, 0.2, 3);
    claim(st.x, st.z, 4);
    add({ id: `metro-${st.name}`, name: `地铁 · ${st.name}`, kind: 'bus', line: '地铁 1 号线', x: st.x, z: st.z + 1, r: 4.5, hint: 'E 坐地铁 1 号线', stop: st.name });
  }

  // ===== 高铁：站房、小站、高架、会跑的车 ========================================================================
  let train = null;
  let train2 = null;
  const rail = (() => {
    const ground = railXZ.map(([x, z]) => Math.max(heightAt(x, z), waterAt(x, z) ?? -99));
    const blur = (arr, r) => {
      const out = new Array(arr.length);
      let sum = 0;
      const n = arr.length;
      for (let i = -r; i <= r; i++) sum += arr[Math.min(n - 1, Math.max(0, i))];
      for (let i = 0; i < n; i++) {
        out[i] = sum / (2 * r + 1);
        sum += arr[Math.min(n - 1, i + r + 1)] - arr[Math.max(0, i - r)];
      }
      return out;
    };
    let y = ground.map((g) => g + 7.5);
    for (let pass = 0; pass < 4; pass++) y = blur(y, 24).map((v, i) => Math.max(v, ground[i] + 3.4));
    y = blur(y, 5).map((v, i) => Math.max(v, ground[i] + 2.6));
    const path = railXZ.map(([x, z], i) => [x, y[i], z]);
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]));
    const nearest = (x, z) => {
      let best = 0;
      let bd = 1e9;
      railXZ.forEach((p, i) => {
        const d2 = (p[0] - x) ** 2 + (p[1] - z) ** 2;
        if (d2 < bd) {
          bd = d2;
          best = i;
        }
      });
      return best;
    };
    return { path, cum, nearest };
  })();
  {
    // 总站
    const si = rail.nearest(20, 372);
    const gy = heightAt(stationHall.x, stationHall.z);
    const gs = LM.grandStation(b, { x: stationHall.x, z: stationHall.z, rotY: 0, w: 70, d: 30, h: 18, sign: '高铁站', y: gy, platformY: rail.path[si][1] - gy - 0.2 });
    claim(stationHall.x, stationHall.z, 40);
    claim(stationHall.x, stationHall.z + 30, 16);
    const mainSt = RAIL_STATIONS.find((s) => s.main);
    mainSt.exit = [stationHall.x, stationHall.z + 30];
    mainSt.platform = gs.platform;
    mainSt.stopMidS = rail.cum[si] - rail.cum[6];
    add({ id: 'station', name: '高铁站', kind: 'station', stop: '高铁站', x: stationHall.x, z: stationHall.z + 26, r: 12, hint: 'E 购票候车' });
    add({ id: 'station-plat-main', name: '高铁站 · 站台乘车点', kind: 'station', stop: '高铁站', x: gs.platform[0], z: gs.platform[2], r: 12, hint: 'E 购票 / 乘车', map: false });
    gs.benches?.forEach((sb, bi) => {
      add({ id: `bench-station-main-${bi}`, name: '站台长椅', kind: 'chair', x: sb.x, z: sb.z, r: 2.8, hint: 'E 坐下候车', seat: sb, map: false });
    });
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) lamp(b, stationHall.x + sx * (14 + k * 12), stationHall.z + 34, 0);
    for (const sx of [-1, 1]) bench(b, stationHall.x + sx * 8, stationHall.z + 40, 0);
    // 四个小站：站房朝着镇子那一边
    const toward = { 雪山高铁站: 'snowtown', 田园高铁站: 'pastoral', 大学城站: 'university', 湖边小镇站: 'lakeside' };
    for (const st of RAIL_STATIONS) {
      if (st.main) continue;
      const i = rail.nearest(st.x, st.z);
      const p = rail.path[i];
      const q = rail.path[Math.min(rail.path.length - 1, i + 1)];
      const o = rail.path[Math.max(0, i - 1)];
      const tl = Math.hypot(q[0] - o[0], q[2] - o[2]) || 1;
      const tx = (q[0] - o[0]) / tl;
      const tz = (q[2] - o[2]) / tl;
      let rot = Math.atan2(-tz, tx); // 局部 x 沿着铁轨
      const town = D(toward[st.name]);
      if (Math.sin(rot) * (town.x - p[0]) + Math.cos(rot) * (town.z - p[2]) < 0) rot += Math.PI;
      const ss = LM.smallStation(b, { x: p[0], z: p[2], rotY: rot, name: st.name, deckY: p[1] });
      const ex = p[0] + Math.sin(rot) * 20;
      const ez = p[2] + Math.cos(rot) * 20;
      st.exit = [ex, ez];
      st.platform = ss.platform;
      st.stopMidS = rail.cum[i] - rail.cum[6];
      claim(p[0] + Math.sin(rot) * 10, p[2] + Math.cos(rot) * 10, 13);
      add({ id: `station-${st.name}`, name: st.name, kind: 'station', stop: st.name, x: ex, z: ez, r: 7, hint: 'E 购票候车' });
      add({ id: `station-plat-${st.name}`, name: `${st.name} · 站台`, kind: 'station', stop: st.name, x: ss.platform[0], z: ss.platform[2], r: 10, hint: 'E 购票 / 乘车', map: false });
      if (ss.bench) {
        add({ id: `bench-station-${st.name}`, name: '站台长椅', kind: 'chair', x: ss.bench.x, z: ss.bench.z, r: 2.8, hint: 'E 坐下候车', seat: ss.bench, map: false });
      }
    }
    // 高架：有路、有河、有房子的地方不立桥墩
    LM.viaduct(b, rail.path, { width: 8, pierEvery: 24, groundAt: heightAt, skip: (x, z) => roadEdge(x, z) < 4 || riverAt(x, z).d < RIVER_HALF + 3 || lakeDistance(x, z) < 1.06 || !free(x, z, 1.6) || heightAt(x, z) < SEA.level + 0.3 });
    // 两头钻进山里：一座石头的隧道口
    for (const end of [0, rail.path.length - 1]) {
      const p = rail.path[end];
      const q = rail.path[end ? end - 1 : 1];
      const rot = Math.atan2(q[0] - p[0], q[2] - p[2]);
      b.add(new THREE.BoxGeometry(15, 13, 5), 'stone#0', [p[0] - Math.sin(rot) * 1.5, p[1] + 2, p[2] - Math.cos(rot) * 1.5], rot);
      b.add(new THREE.BoxGeometry(8.6, 6.4, 5.4), 'iron#0', [p[0] - Math.sin(rot) * 1.4, p[1] + 3.3, p[2] - Math.cos(rot) * 1.4], rot);
      b.add(new THREE.BoxGeometry(16, 1, 6), 'stone#1', [p[0] - Math.sin(rot) * 1.5, p[1] + 8.8, p[2] - Math.cos(rot) * 1.5], rot);
    }
    const stops = RAIL_STATIONS.map((s) => rail.cum[rail.nearest(s.x, s.z)]).sort((p, q) => p - q);
    // 两列车，一股道一列，对着开：一列从这头出发、一列从那头出发，各自到头停一会儿再折回来，路上总会交会
    const line = rail.path.slice(6, rail.path.length - 6);
    const halts = stops.map((s) => s - rail.cum[6]).filter((s) => s > 30);
    train = LM.createTrain(shared, line, { cars: 5, speed: 34, stops: halts, dwell: 8, loop: false, accel: 2.2, side: 1.8, assets: vehicleAssets });
    train2 = LM.createTrain(shared, line, { cars: 5, speed: 34, stops: halts, dwell: 8, loop: false, accel: 2.2, side: -1.8, from: 1, stripe: [0.78, 0.3, 0.22], assets: vehicleAssets });
    for (const t of [train, train2]) if (t?.group) group.add(t.group);
  }

  // ===== 打磨：亭子、牌坊、海滩小屋、货轮、CBD 的裙楼和街心花园 ==================================================
  const paved = []; // 铺石板的小广场：[x, z, 半径]
  {
    /** 一座小亭子：四根朱红柱子、青灰的攒尖顶、四角起翘 */
    const pavilion = (x, z, s = 1) => {
      const gy = heightAt(x, z);
      b.add(new THREE.CylinderGeometry(3.6 * s, 3.9 * s, 0.5, 8), 'stone#2', [x, gy + 0.2, z]);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 3.2 * s, 8), 'paint#7', [x + dx * 2.2 * s, gy + 0.45 + 1.6 * s, z + dz * 2.2 * s]);
      b.add(new THREE.BoxGeometry(5.2 * s, 0.3 * s, 5.2 * s), 'cloth#1', [x, gy + 0.45 + 3.3 * s, z]);
      b.add(hipRoof(7 * s, 7 * s, 2.4 * s), 'roof#10', [x, gy + 0.45 + 3.45 * s + 1.2 * s, z]);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const tip = new THREE.BoxGeometry(1.6 * s, 0.2 * s, 0.4 * s);
        tip.rotateZ(0.4 * dx);
        b.add(tip, 'roof#10', [x + dx * 3.2 * s, gy + 0.45 + 3.75 * s, z + dz * 3.2 * s], -dx * dz * Math.PI / 4);
      }
      b.add(new THREE.SphereGeometry(0.32 * s, 8, 6), 'paint#4', [x, gy + 0.45 + 6.1 * s, z]);
      for (const sx of [-1, 1]) b.add(new THREE.BoxGeometry(0.4, 0.45, 3.2 * s), 'wood#1', [x + sx * 2.2 * s, gy + 0.9, z]);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.collide(x + dx * 2.2 * s, z + dz * 2.2 * s, 0.3, 0.3, 4);
      claim(x, z, 5 * s);
    };
    // 环城绿带上四座亭子，月亮湖南岸、大学城观海台边、家门口的河湾各一座
    for (const [x, z, name, text] of [
      [40 - 258, -60 + 70, '听风亭', '风从河那边吹过来，带着一点麦子的味道。'],
      [40 + 250, -60 + 96, '望海亭', '天气好的时候，能看见东边港口的吊机。'],
      [40 + 120, -60 - 232, '松月亭', '北边就是月亮湖。夜里月亮会掉进湖里。'],
      [40 - 110, -60 + 242, '樱雪亭', '春天的时候，樱花瓣会落满亭子的台阶。'],
      [-20, -428, '湖心亭', '湖面很静，偶尔有鱼跳起来，啪的一声。'],
      [778, -534, '观潮亭', '潮水一下一下拍着崖脚。'],
      [-632, 26, '河湾亭', '清溪河在这里拐了个弯，水声很轻。'],
    ]) {
      if (!free(x, z, 5) || roadEdge(x, z) < 5 || !dry(x, z, 2)) continue;
      pavilion(x, z, 1);
      add({ id: `pavilion-${name}`, name, kind: 'village', x: x + 4.6, z, r: 5, hint: 'E 坐一会儿', text });
      sakura.push([x - 7, z + 5], [x + 6, z - 7]);
    }
    // 牌坊：老街、南市街的街口
    for (const [x, z, rot, text] of [[130, -96, 0, '老街'], [-168, 126, Math.PI / 2, '南市街'], [40, 20, 0, '玉海城'], [-470, -176, 0, 'AI 小镇']]) {
      gate(b, { x, z, rotY: rot, text });
      claim(x, z, 9);
    }
    // 中轴大街两边一路石灯笼
    for (let z = -8; z < 150; z += 22) for (const sx of [-1, 1]) if (free(40 + sx * 5.4, z, 0.6)) stoneLantern(b, 40 + sx * 5.4, z);

    // CBD：几栋矮一点的裙楼把空地围起来，街心花园种一圈樱花
    for (const [x, z, w, dd, h, glass, style] of [[470, 22, 24, 16, 22, 1, 0], [520, 60, 20, 18, 30, 2, 1], [392, 70, 22, 16, 18, 2, 2], [330, 40, 20, 16, 24, 1, 2], [600, -30, 22, 18, 26, 2, 0], [452, 92, 26, 14, 14, 1, 2]]) {
      if (!free(x, z, w * 0.62) || roadEdge(x, z) < Math.max(w, dd) / 2 + 1 || !dry(x, z, 6)) continue;
      LM.tower(b, { x, z, rotY: 0, w, d: dd, h, glass, style });
      claim(x, z, Math.max(w, dd) * 0.72);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const x = 430 + Math.cos(a) * 30;
      const z = 44 + Math.sin(a) * 22;
      if (free(x, z, 2.4) && roadEdge(x, z) > 3) {
        sakura.push([x, z]);
        claim(x, z, 2.2);
      }
    }
    for (let i = 0; i < 4; i++) bench(b, 422 + i * 5.5, 44, 0);
    for (let z = -190; z < 10; z += 19) for (const sx of [-1, 1]) if (free(449 + sx * 7.5, z, 2) && roadEdge(449 + sx * 7.5, z) > 2.5) sakura.push([449 + sx * 7.5, z]);

    // 沙滩后面一排彩色的更衣小屋，一座救生员的瞭望台
    {
      const HUT = ['cloth#0', 'cloth#1', 'cloth#2', 'cloth#4', 'paint#1', 'paint#2'];
      let n = 0;
      for (let x = 236; x < 372 && n < 9; x += 7.2) {
        let z = 400;
        while (z < 640 && coastD(x, z) > 118) z += 2;
        if (z >= 640 || !free(x, z, 3) || roadEdge(x, z) < 6) continue;
        const gy = heightAt(x, z);
        b.add(new THREE.BoxGeometry(3.4, 3, 3.6), n % 2 ? 'wall#6' : HUT[n % HUT.length], [x, gy + 1.5, z]);
        b.add(gableRoof(4.2, 4.4, 1.5), HUT[(n + 2) % HUT.length], [x, gy + 3, z]);
        b.add(new THREE.BoxGeometry(1.1, 2, 0.12), 'wood#0', [x, gy + 1, z + 1.84]);
        b.add(new THREE.BoxGeometry(3.8, 0.24, 1.4), 'wood#1', [x, gy + 0.1, z + 2.4]);
        b.collide(x, z, 1.8, 1.9, 5);
        claim(x, z, 3);
        n++;
      }
      let lx = 470;
      let lz = 400;
      while (lz < 640 && coastD(lx, lz) > 62) lz += 2;
      const gy = heightAt(lx, lz);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(new THREE.CylinderGeometry(0.12, 0.14, 4.4, 6), 'wood#1', [lx + dx * 1.2, gy + 2.2, lz + dz * 1.2]);
      b.add(new THREE.BoxGeometry(3.2, 0.2, 3.2), 'wood#1', [lx, gy + 4.4, lz]);
      b.add(new THREE.BoxGeometry(2.6, 1.8, 2.6), 'wall#6', [lx, gy + 5.4, lz]);
      b.add(hipRoof(3.8, 3.8, 1.2), 'cloth#0', [lx, gy + 6.9, lz]);
      b.add(new THREE.BoxGeometry(0.3, 4.6, 1), 'wood#2', [lx, gy + 2.2, lz + 2.1]);
      b.collide(lx, lz, 1.5, 1.5, 7);
      claim(lx, lz, 3.5);
      add({ id: 'lifeguard', name: '救生员瞭望台', kind: 'village', x: lx + 3, z: lz, r: 4, hint: 'E 看看', text: '救生员在台上打瞌睡，红白相间的救生圈挂在栏杆上。今天浪不大，适合冲浪。' });
    }

    // 港口：一艘靠在码头上的货轮
    {
      const sx = 836;
      const sz = 93;
      const y0 = SEA.level;
      const hull = new THREE.BoxGeometry(64, 6.4, 13);
      b.add(hull, 'paint#7', [sx, y0 + 0.2, sz]);
      b.add(new THREE.BoxGeometry(64.4, 3.4, 13.4), 'cloth#4', [sx, y0 + 4.2, sz]);
      const bow = new THREE.CylinderGeometry(6.7, 6.7, 9.6, 3);
      bow.rotateY(Math.PI / 2 + Math.PI / 6);
      b.add(bow, 'cloth#4', [sx + 35.2, y0 + 1.1, sz], Math.PI);
      b.add(new THREE.BoxGeometry(62, 0.3, 12.4), 'wood#1', [sx, y0 + 6, sz]);
      b.add(new THREE.BoxGeometry(10, 9, 11), 'paint#5', [sx - 24, y0 + 10.6, sz]);
      b.add(new THREE.BoxGeometry(10.4, 1.2, 11.4), 'glass#0', [sx - 24, y0 + 12.6, sz]);
      b.add(new THREE.BoxGeometry(11.4, 0.4, 12.4), 'paint#5', [sx - 24, y0 + 15.2, sz]);
      b.add(new THREE.CylinderGeometry(1.5, 1.8, 5, 12), 'paint#7', [sx - 27, y0 + 17.6, sz]);
      b.add(new THREE.CylinderGeometry(1.56, 1.56, 1, 12), 'iron#0', [sx - 27, y0 + 19.2, sz]);
      const BOX = ['paint#1', 'cloth#1', 'cloth#0', 'paint#2', 'cloth#2', 'wall#6'];
      for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < (i + j) % 3 + 1; k++) b.add(new THREE.BoxGeometry(6, 2.5, 4.6), BOX[(i * 3 + j + k) % BOX.length], [sx - 12 + i * 6.3, y0 + 7.4 + k * 2.55, sz - 2.6 + j * 5.2]);
      add({ id: 'cargo-ship', name: '货轮「玉海号」', kind: 'village', x: 812, z: 60, r: 9, hint: 'E 看看货轮', text: '船身上刷着「玉海号」三个字。水手说，装满了就走，去很远的地方。' });
    }

    // 湖边小镇：水边的咖啡座，一排矮栏杆
    for (let z = -536; z < -456; z += 9) if (free(188, z, 1)) fence(b, 188, z, 188, z + 9, 0.9);
    for (const [x, z] of [[196, -508], [200, -488], [194, -470]]) activityDecorLater.push({ name: 'infra-picnic-table', x, z, h: 0.9, r: 0.6 });
    // 田园小镇：晒谷场、沿着土路的木栅栏
    fence(b, -900, -118, -930, -108, 1);
    fence(b, -930, -108, -958, -64, 1);
    for (const [x, z] of [[-838, -172], [-830, -180], [-846, -182]]) LM.haystack(b, x, z, 0.8);
    // 铺石板的小广场：高铁站前、市民广场、AI 小镇、大学城、集市、清真寺、夫子庙、码头
    paved.push([722, 72, 30], [738, 130, 26], [20, 434, 30], [492, -62, 24], [-460, -112, 18], [640, -470, 16], [170, 62, 17], [-118, -132, 13], [196, -196, 15], [-735, 492, 20], [-165, -8, 17], [804, -512, 12]);
  }

  // ===== 各区的特色玩法（滑雪、开船、冲浪、采摘……）：道具和交互点都在 activities.js 里 =====
  /** 玩法要的手绘立牌（life 图集）：[{ name, x, z, h, y? }]，后面和街景小物一起画 */
  const activityDecor = [];
  const activities = placeActivities({ THREE, b, LM, fence, add, claim, free, dry, district, random, gardenPlots, parasols, sakura, lanterns, decor: activityDecor, shared, group });

  // ===== 收尾：合并建筑 + 把画出来的那片房子实例化 ================================================================
  // ---- 拆掉和别的东西撞上的房子（只拆自动撒的；写死位置的那些留着），留下的才放碰撞盒、挂店招 ----
  const cullStats = { houses: 0, culled: 0, by: {}, extras: 0 };
  if (kit) {
    for (const h of painted) {
      if (!h.auto) continue;
      const hit = rectHit(h.rect, 0.15, ['big', 'small', 'proc']) ?? rectHit(h.rect, 0.05, ['house']);
      if (hit) {
        h.dead = h.rect.dead = true;
        cullStats.culled++;
        const why = hit.kind === 'house' ? 'house' : hit.kind === 'proc' ? 'proc' : hit.ref.kit;
        cullStats.by[why] = (cullStats.by[why] ?? 0) + 1;
      }
    }
    for (let i = painted.length - 1; i >= 0; i--) if (painted[i].dead) painted.splice(i, 1);
    recording = false; // （店招杆是房子自己的，不算占地）
    for (const h of painted) h.finish?.();
    // 还卡在（写死位置的）房子里的小件：拿掉
    for (let i = kitExtras.length - 1; i >= 0; i--) {
      const e = kitExtras[i];
      if (e.rect?.kind !== 'small' || !rectNear(e.x, e.z, 0.1, ['house'])) continue;
      e.rect.dead = true;
      kitExtras.splice(i, 1);
      cullStats.extras++;
    }
    cullStats.houses = painted.length;
  }
  /** 彻底的一遍：地图上每一个占地（房子、模型、程序化构件）两两比，叠进去超过 3 cm 的都算。 */
  const nameOf = (r) => (r.kind === 'proc' ? 'proc' : r.kind === 'house' ? 'house' : r.ref?.kit ?? r.kind);
  const pairAudit = () => {
    const all = new Set();
    for (const list of rectGrid.values()) for (const r of list) if (!r.dead) all.add(r);
    const seen = new Set();
    const ids = new Map();
    const idOf = (r) => ids.get(r) ?? (ids.set(r, ids.size), ids.size - 1);
    const by = {};
    const ex = [];
    let pairs = 0;
    for (const a of all) {
      rectCells(a.x, a.z, a.rad, (k) => {
        for (const q of rectGrid.get(k) ?? []) {
          if (q === a || q.dead || !rectsOverlap(a, q, -0.03)) continue;
          if (a.kind === 'proc' && q.kind === 'proc') continue;
          if (a.chain != null && a.chain === q.chain) continue;
          const key = idOf(a) < idOf(q) ? idOf(a) + '_' + idOf(q) : idOf(q) + '_' + idOf(a);
          if (seen.has(key)) continue;
          seen.add(key);
          pairs++;
          const n = [nameOf(a), nameOf(q)].sort().join(' × ');
          by[n] = (by[n] ?? 0) + 1;
          if (ex.length < 30 && !/fence × fence/.test(n)) ex.push(`${n} @ ${Math.round(a.x)},${Math.round(a.z)}`);
        }
        return false;
      });
    }
    // 坡上：四角里有悬空的（脚离地）或者埋进土里的
    let floating = 0;
    let sunk = 0;
    const fl = {};
    for (const a of all) {
      const e = a.ref;
      if (!e || a.kind === 'proc' || !e.kit) continue;
      const it = kit.byId.get(e.kit);
      if (it?.afloat) continue;
      const y = e.y ?? heightAt(e.x, e.z);
      let lo = 1e9;
      let hi = -1e9;
      const inset = a.kind === 'house' || it.h > 4 ? Math.min(0.45, a.hw * 0.2) : 0;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const h = heightAt(a.x + u * (a.hw - inset) * a.c + v * (a.hd - inset) * a.s, a.z - u * (a.hw - inset) * a.s + v * (a.hd - inset) * a.c);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      const house = a.kind === 'house';
      if (a.kind === 'small' || (e.y != null && (waterAt(a.x, a.z) != null || bridgeAt(a.x, a.z)))) continue;
      const tall = house || it.h > 4;
      const sy = Array.isArray(e.scale) ? e.scale[1] : e.scale ?? 1;
      // 悬空：模型自己的底（地基往下埋的那一截也算）够不着最低的那只脚，又没补地基；下陷：最高的那只脚埋得比门槛还深
      const bad = !e.founded && y + (it.zmin ?? 0) * sy > lo + 0.3 ? 'float' : hi - y > (tall ? 0.75 : 0.5) ? 'sunk' : null;
      if (!bad || e.kit === 'fence') continue;
      bad === 'float' ? floating++ : sunk++;
      fl[e.kit] = (fl[e.kit] ?? 0) + 1;
      if (ex.length < 60) ex.push(`${bad} ${e.kit} @ ${Math.round(e.x)},${Math.round(e.z)} y=${y.toFixed(1)} lo=${lo.toFixed(1)} hi=${hi.toFixed(1)}`);
    }
    // 没登记占地的（鸟、船）：落在地上的鸟别站进别的东西里
    let loose = 0;
    for (const e of kitExtras) {
      if (e.rect || e.y != null || !/^bird_/.test(e.kit)) continue;
      if (rectNear(e.x, e.z, 0.05)) (loose++, ex.length < 60 && ex.push(`loose ${e.kit} @ ${Math.round(e.x)},${Math.round(e.z)}`));
    }
    return { rects: all.size, pairs, floating, sunk, loose, slopeBy: Object.fromEntries(Object.entries(fl).sort((p, q) => q[1] - p[1]).slice(0, 25)), pairBy: Object.fromEntries(Object.entries(by).sort((p, q) => q[1] - p[1]).slice(0, 40)), pairExamples: ex };
  };
  const buildingMeshes = b.build(group);
  // 试点：家门口最近的四栋、AI 小镇中心最近的几栋，换成 Blender 里重绘过的精模（public/models3，src/town/models.js）。
  // 被换掉的那栋不再画；碰撞盒、门口的石阶花盆、E 交互都还是原来那栋的。
  const modelSlots = [];
  if (models.length) {
    const swappable = painted.map((h, i) => ({ h, i })).filter(({ h, i }) => i > 0 && ['house', 'cottage', 'tall', 'wing'].includes(h.shape));
    const nearest = ([cx, cz]) => swappable.filter(({ h }) => !h.model).sort((p, q) => Math.hypot(p.h.x - cx, p.h.z - cz) - Math.hypot(q.h.x - cx, q.h.z - cz))[0]?.h;
    models.forEach((glb, k) => {
      const h = nearest(k < 4 ? HOME : [-460, -112]);
      if (!h) return;
      h.model = glb;
      const fp = FOOT[h.shape] ?? [8, 10];
      modelSlots.push({ glb, x: h.x, z: h.z, turn: h.turn, width: fp[0] * h.scale, depth: fp[1] * h.scale });
    });
  }
  if (painted.length && !kit) {
    // 按 400 m 的格子分批实例化：看不见的那几格显卡直接跳过（原来一整城的房子每帧都要过一遍顶点）
    const material = createBuildingMaterial({ uniforms: shared });
    const cells = new Map();
    for (const h of painted) {
      if (h.model) continue;
      const key = `${Math.floor((h.x + HALF) / 400)},${Math.floor((h.z + HALF) / 400)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(h);
    }
    for (const list of cells.values()) {
      const before = group.children.length;
      addBuildings(group, material, list, heightAt);
      for (let i = before; i < group.children.length; i++) {
        const mesh = group.children[i];
        mesh.computeBoundingSphere?.();
        if (mesh.boundingSphere) {
          mesh.boundingSphere.radius += 6;
          mesh.frustumCulled = true;
        }
      }
    }
  }
  buildingMeshes.painted = painted.length;
  // 街具和农具：老模型库（public/models）里造型过得去的那些小件，摆在房前屋侧——长凳、木桶、板车、晾衣架、水果摊；
  // 农家旁边是草垛、稻草人、蜂箱、农具架；和式的房子旁边是石灯笼、水缸、竹篱。
  const propSlots = []; // （老办法：一件一个 GLB、各用各的材质。现在都走套件那一个着色器了，这里空着）
  // 模型库里转过来的三百多种模型：房侧的杂物、街具、公交站、集市、车站、农家、船、地标、鸟和鱼（dressing.js）
  const dressStats = kit ? dress({ kit, random, painted, inst, makeRect, rectHit, rectNear, freeC, collide: (...a) => b.collide(...a), railNear, faceRoad, extras: kitExtras, add }) : null;

  // ===== 路面和广场 ============================================================================================
  {
    const geo = roadGeometry(SEGS.filter((g) => !g.lane), STREET_HALF * 2 + 1.2);
    // ?roadtex=1 时用手绘贴图版（鹅卵石路 + 石板广场），否则仍是程序化画的那条
    const roadAlb = roadTex ? getAlbedo('road1') : null;
    const plazaAlb = roadTex ? getAlbedo('stone0') : null;
    const mesh = new THREE.Mesh(geo, roadAlb ? roadMaterialTextured(shared, roadAlb, { scale: 0.16 }) : roadMaterial(shared));
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    const plaza = new THREE.Mesh(plazaGeometry(PLAZA, 31.5), plazaAlb ? roadMaterialTextured(shared, plazaAlb, { scale: 0.2, lit: [0.68, 0.64, 0.58] }) : roadMaterial(shared, 1));
    plaza.matrixAutoUpdate = false;
    group.add(plaza);
    // 各处的小广场：同一种石板地
    for (const [x, z, r] of paved) {
      const m = new THREE.Mesh(plazaGeometry([x, z], r), plaza.material);
      m.matrixAutoUpdate = false;
      group.add(m);
    }
  }

  // ===== 雪：雪山小镇那一片，地上盖一层贴着地形的雪 ===============================================================
  {
    const STEP = 4;
    // （镇子坐的平地、滑雪道，加上背后那道山肩，一直到地图的北缘）
    const x0 = -1024;
    const z0 = -1024;
    const nx = Math.round(720 / STEP);
    const nz = Math.round(700 / STEP);
    const pos = [];
    const uv = [];
    const keep = [];
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + i * STEP;
        const z = z0 + j * STEP;
        const s = snowAt(x, z);
        const k = smooth(0.12, 0.6, s);
        const h = heightAt(x, z);
        // 边上往地里沉：雪和草地的交界就成了一条参差的线；路上踩实了，薄一点
        const trodden = 1 - smooth(-0.5, 1.6, roadEdge(x, z));
        // 一点点雪堆的起伏：平涂的明暗两色才有地方落
        const drift = (fbm(x / 13 + 1.7, z / 13 - 4.2, 2, 131) - 0.5) * 2.6 * k * (1 - trodden);
        pos.push(x, h - 0.9 + 1.25 * k - 0.36 * trodden + Math.max(-0.12, drift), z);
        uv.push(x / 9, z / 9);
        keep.push(s > 0.02 && waterAt(x, z) == null);
      }
    }
    const idx = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const c = a + nx + 1;
        if (!(keep[a] || keep[a + 1] || keep[c] || keep[c + 1])) continue;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    if (idx.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const snow = new THREE.Mesh(geo, paintMaterial(shared, { lit: [0.96, 0.97, 1.0], shade: [0.76, 0.84, 0.97], kind: 'snow', albedo: false }));
      snow.matrixAutoUpdate = false;
      group.add(snow);
    }
  }

  // ===== 树 ====================================================================================================
  // 用原作那一套会"长"的树：城里是行道树和院子里的树，城外成丛成片，林子里连成一体。
  const grove = [];
  const pines = [];
  {
    const tree = (x, z, kind, scale) => {
      if (lakeDistance(x, z) < 1.16 || Math.abs(x) > HALF - 30 || Math.abs(z) > HALF - 30) return false;
      if (riverAt(x, z).d < RIVER_HALF + 5 || coastD(x, z) < 52 || !free(x, z, 1.5) || railNear(x, z, 6)) return false;
      // 树冠不进屋：离房子、模型、设施至少大半个树冠
      const crown = (kind === 0 ? 11.5 : kind <= 3 ? [5.6, 4.6, 6.6][kind - 1] : 1.9) * scale;
      if (rectNear(x, z, kind >= 7 ? crown * 0.8 + 0.3 : Math.max(2.6, crown * 0.92 + 0.3))) return false;
      if (roadEdge(x, z) < (kind === 0 ? 4 : 1.6)) return false;
      if (skiAt(x, z).k > 0.8) return false;
      if (snowAt(x, z) > 0.3) {
        // 雪地里是松
        snowPines.push([x, z, scale]);
        return true;
      }
      grove.push([x, z, kind, scale, random() * TAU]);
      return true;
    };
    const mid = () => 1 + Math.floor(random() * 3);
    // 眼睛想看到一棵大树的地方：宫前、家的院子、庙前、小镇广场、校园、村口
    for (const [x, z, s] of [[PLAZA[0] - 23, PLAZA[1] + 19, 0.82], [HOME[0] - 15, HOME[1] - 3, 0.9], [HOME[0] + 22, HOME[1] + 16, 0.85], [-448, -100, 0.9], [176, -178, 0.85], [-140, -150, 0.85], [640, -452, 0.95], [-880, -128, 1.0], [270, -486, 0.85], [-436, 40, 0.9], [70, 258, 0.9], [-300, -90, 0.9], [760, -150, 0.8]]) {
      if (tree(x, z, 0, s)) claim(x, z, 5);
    }
    // 行道树
    for (const [x, z] of treeSpots) {
      if (!free(x, z, 2.2) || random() > 0.8) continue;
      if (cityDistance(x, z) < RING_R && random() < 0.45) sakura.push([x, z]);
      else if (tree(x, z, mid(), 0.5 + random() * 0.22)) claim(x, z, 3);
    }
    // 院子里、屋后：每栋房子背后有一半的机会长一棵
    for (const h of painted.slice()) {
      if (random() > (kit ? 0.16 : 0.5)) continue;
      const a = random() * TAU;
      const d = 9 + random() * 5;
      const x = h.x + Math.cos(a) * d;
      const z = h.z + Math.sin(a) * d;
      if (!free(x, z, 3.4) || plazaDistance(x, z) < 34) continue;
      if (random() < 0.4) tree(x, z, 7 + (random() < 0.5 ? 0 : 1), 0.8 + random() * 0.8);
      else if (tree(x, z, mid(), 0.5 + random() * 0.3)) claim(x, z, 3);
    }
    // 环城绿带：老城和环城路之间一圈树，樱花一团一团的
    for (let i = 0; i < 150; i++) {
      const a = (i / 150) * TAU + random() * 0.03;
      const r = CITY_R + 8 + random() * (RING_R - CITY_R - 22);
      const x = YUHAI[0] + Math.cos(a) * r;
      const z = YUHAI[1] + Math.sin(a) * r;
      if (!free(x, z, 3) || roadEdge(x, z) < 4) continue;
      if (random() < 0.42) {
        sakura.push([x, z]);
        claim(x, z, 2.6);
      } else if (tree(x, z, random() < 0.2 ? 0 : mid(), 0.6 + random() * 0.4)) claim(x, z, 3.4);
    }
    // 公路两边：隔一段一棵
    for (const g of SEGS) {
      if (g.kind !== 'road') continue;
      const len = Math.hypot(g.bx - g.ax, g.bz - g.az);
      for (let t = 12; t < len; t += 24 + random() * 16) {
        const side = random() < 0.5 ? 1 : -1;
        const x = g.ax + ((g.bx - g.ax) * t) / len - ((g.bz - g.az) / len) * side * (STREET_HALF + 4 + random() * 3);
        const z = g.az + ((g.bz - g.az) * t) / len + ((g.bx - g.ax) / len) * side * (STREET_HALF + 4 + random() * 3);
        if (!free(x, z, 3) || fieldsAt(x, z) > 0.3 || builtAt(x, z) > 0.6) continue;
        if (tree(x, z, mid(), 0.55 + random() * 0.3)) claim(x, z, 3);
      }
    }
    // 城外：按噪声成丛（copse），丛里中间的树大、边上的小，脚下有灌木
    const step = 30;
    for (let gx = -HALF + 40; gx < HALF - 40; gx += step) {
      for (let gz = -HALF + 40; gz < HALF - 40; gz += step) {
        const x = gx + (random() - 0.5) * step;
        const z = gz + (random() - 0.5) * step;
        if (coastD(x, z) < 52) continue;
        const h = heightAt(x, z);
        const forest = forestAt(x, z);
        if (fieldsAt(x, z) > 0.3) continue;
        if (h > 120) {
          // 山上是松
          if (h < 165 && random() < 0.75 * density) for (let k = 0; k < 4; k++) pines.push({ x: x + (random() - 0.5) * 26, z: z + (random() - 0.5) * 26, s: 0.9 + random() * 0.9, tier: 2 });
          continue;
        }
        if (forest > 0.3) {
          // 林子：密
          const n = Math.round((2 + forest * 3) * density);
          for (let k = 0; k < n; k++) tree(x + (random() - 0.5) * step, z + (random() - 0.5) * step, mid(), 0.85 + random() * 0.75);
          if (random() < 0.5) tree(x + (random() - 0.5) * step, z + (random() - 0.5) * step, 7, 0.9 + random());
          continue;
        }
        const wild = fbm(x / 150 + 12.3, z / 150 - 4.1, 3, 83);
        if (builtAt(x, z) > 0.5) {
          // 城镇里的空地：小公园（不占街和房子）
          if (wild > 0.56 && free(x, z, 7) && random() < 0.6) {
            tree(x, z, mid(), 0.6 + random() * 0.3);
            tree(x + 5 + random() * 3, z + random() * 6 - 3, 7, 0.8 + random() * 0.6);
            claim(x, z, 4);
          }
          continue;
        }
        if (wild > 0.57 && random() < 0.8 * density) {
          const n = 2 + Math.floor(random() * 5 * (wild - 0.4) * 3);
          const spread = 5 + n * 1.5;
          for (let k = 0; k < n; k++) {
            const a = random() * TAU;
            const d = spread * random() ** 0.7;
            tree(x + Math.cos(a) * d, z + Math.sin(a) * d, mid(), (1.25 - 0.5 * (d / spread)) * (0.75 + random() * 0.4));
          }
          for (let k = 0; k < 2; k++) tree(x + (random() - 0.5) * spread * 2.4, z + (random() - 0.5) * spread * 2.4, 7 + (random() < 0.5 ? 0 : 1), 0.7 + random() * 0.8);
        } else if (random() < 0.07 * density) {
          // 旷野上孤零零的一棵
          tree(x, z, random() < 0.25 ? 0 : mid(), 0.75 + random() * 0.4);
        } else if (random() < 0.12 * density) {
          tree(x, z, 7 + (random() < 0.5 ? 0 : 1), 0.7 + random() * 0.9);
        }
      }
    }
    // 雪山小镇四周：一圈落了雪的松
    for (let i = 0; i < 900; i++) {
      const a = random() * TAU;
      const r = 20 + random() * 200;
      const x = -752 + Math.cos(a) * r;
      const z = -556 + Math.sin(a) * r;
      const s = snowAt(x, z);
      if (s < 0.05 || (s > 0.9 && random() < 0.25) || skiAt(x, z).k > 0.8 || !clear(x, z, 3.2) || roadEdge(x, z) < 3.5 || railNear(x, z, 7)) continue;
      snowPines.push([x, z, 0.7 + random() * 0.9]);
      claim(x, z, 2.2);
    }
    // 湖边一圈灌木和几棵柳一样垂着的树
    for (let i = 0; i < 46; i++) {
      const a = random() * TAU;
      const k = 1.2 + random() * 0.22;
      const x = LAKE.x + Math.cos(a) * LAKE.rx * k;
      const z = LAKE.z + Math.sin(a) * LAKE.rz * k;
      if (lakeDistance(x, z) < 1.17 || builtAt(x, z) > 0.5) continue;
      if (random() < 0.3) tree(x, z, mid(), 0.7 + random() * 0.4);
      else tree(x, z, 7 + (random() < 0.5 ? 0 : 1), 0.8 + random() * 0.9);
    }
  }
  const woods = createGrove(field, grove, { cards, heightAt, near: treeNear, far: treeFar });
  group.add(woods.group);
  const treePlaces = grove;
  // 手绘树的立牌（图集里按页排：001~012 阔叶、013~024 针叶、025~036 花果木、037~048 热带、049~060 河岸……）
  const treeIndex = new Map((plants?.tree?.[0]?.sprites ?? []).map((sp, i) => [sp.name, i]));
  const sprite = (n) => treeIndex.get(`tree-${String(n).padStart(3, '0')}`);
  const treeCards = []; // { x, z, y, h, sprite }
  const card = (x, z, n, h) => {
    const i = sprite(n);
    if (i == null || riverAt(x, z).d < RIVER_HALF + 2 || lakeDistance(x, z) < 1.0) return false;
    if (rectNear(x, z, Math.max(1.6, h * 0.27))) return false;
    treeCards.push({ x, z, y: heightAt(x, z) - 0.15, h, sprite: i });
    return true;
  };
  if (treeIndex.size) {
    // 山上、雪地里：针叶树
    const FIRS = [13, 15, 16, 17, 20];
    for (const p of pines) card(p.x, p.z, pick(random, FIRS), 7 + p.s * 4.5);
    for (const [x, z, sc] of snowPines) card(x, z, pick(random, [13, 15, 16, 17]), 6.5 + sc * 4);
  } else {
    for (const [x, z, sc] of snowPines) pines.push({ x, z, s: 0.8 + sc * 0.4, tier: 2 });
    if (pines.length) group.add(createTrees(shared, pines));
  }

  // 菜地：每块一个交互点（地和作物的样子交给 farming.js）
  // 果园种植区：树下保留观赏树，南侧增加可播种的手绘果树地块。
  {
    const d = D('orchard');
    for (let i = 0; i < 6; i++) gardenPlots.push({ x: d.x - 20 + (i % 3) * 8, z: d.z + 45 + Math.floor(i / 3) * 4, where: '果园种植区' });
  }
  gardenPlots.forEach((p, i) => {
    p.id = i;
    p.y = heightAt(p.x, p.z);
    claim(p.x, p.z, 1.1);
    add({ id: `plot-${i}`, name: p.where, kind: 'plot', plot: i, x: p.x, z: p.z, r: 1.15, hint: 'E 看看菜地' });
  });

  // 石头：山上、湖边、海崖下
  const rockPlaces = [];
  for (let i = 0; i < 260; i++) {
    const x = -HALF + random() * HALF * 2;
    const z = -HALF + random() * HALF * 1.2;
    if (mountainAt(x, z) < 0.15) continue;
    rockPlaces.push({ x, z, s: 1.2 + random() * 3.4, r: random() * 6 });
  }
  for (let i = 0; i < 40; i++) {
    const a = random() * TAU;
    const x = LAKE.x + Math.cos(a) * LAKE.rx * (1.02 + random() * 0.12);
    const z = LAKE.z + Math.sin(a) * LAKE.rz * (1.02 + random() * 0.12);
    if (builtAt(x, z) > 0.5) continue;
    rockPlaces.push({ x, z, s: 0.7 + random() * 1.1, r: random() * 6 });
  }
  for (let i = 0; i < 70; i++) {
    // 海滨小镇和大学城的崖脚：一堆礁石
    const x = 780 + random() * 180;
    const z = -600 + random() * 520;
    const cd = coastD(x, z);
    if (cd > 14 || cd < -22) continue;
    rockPlaces.push({ x, z, s: 1.4 + random() * 2.6, r: random() * 6 });
  }
  group.add(createRocks(shared, rockPlaces));

  // 野花：城外多
  const flowerPlaces = [];
  for (let i = 0; i < 420; i++) {
    const x = -HALF + 30 + random() * (HALF * 2 - 60);
    const z = -HALF + 30 + random() * (HALF * 2 - 60);
    if (lakeDistance(x, z) < 1.2 || heightAt(x, z) > 200 || coastD(x, z) < 40 || snowAt(x, z) > 0.2) continue;
    if (fieldsAt(x, z) > 0.4 || builtAt(x, z) > 0.7 || riverAt(x, z).d < RIVER_HALF + 3) continue;
    flowerPlaces.push({ x, z, r: 3 + random() * 5 });
  }
  // 野花：有图集就用 139 张手绘立牌（会摇、会跟着光变），否则退回程序化的低模花丛
  if (plants?.flower?.length) {
    const spots = [];
    for (const p of flowerPlaces) {
      const n = 10 + Math.floor(random() * 9);
      for (let i = 0; i < n; i++) {
        const a = random() * TAU;
        const r = random() * (p.r ?? 3);
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        if (rectNear(x, z, 0.35)) continue;
        spots.push({ x, z, y: heightAt(x, z), h: 0.38 + random() * 0.34, sprite: Math.floor(random() * 139) });
      }
    }
    const batch = createPlantBatch(shared, plants.flower, spots, { alpha: 0.16 });
    group.add(batch);
    group.userData.flowerSprites = spots.length;
    group.userData.flowerSpots = spots; // 给调试/截图用：知道花在哪
    group.userData.flowerBatch = batch; // 给 A/B 对比用
  } else {
    group.add(createFlowerClumps(shared, flowerPlaces));
  }

  // 活的东西
  const pigeons = createPigeons(shared, 26, PLAZA);
  group.add(pigeons);
  const critterPlaces = [];
  for (let i = 0; i < 60; i++) {
    const x = -HALF + 60 + random() * (HALF * 2 - 120);
    const z = -HALF + 60 + random() * (HALF * 2 - 120);
    if (critterPlaces.length >= 30 || waterAt(x, z) != null || coastD(x, z) < 40 || heightAt(x, z) > 120 || builtAt(x, z) > 0.8) continue;
    critterPlaces.push({ x, z, kind: random() < 0.35 ? 'cat' : 'rabbit' });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    critterPlaces.push({ x: PLAZA[0] + Math.cos(a) * 26, z: PLAZA[1] + Math.sin(a) * 26, kind: 'cat' });
  }
  for (const [x, z] of [[HOME[0] + 5, HOME[1] + 2], [-452, -104], [128, 12], [290, -492], [-852, -140]]) critterPlaces.push({ x, z, kind: 'cat' });
  const critters = createCritters(shared, critterPlaces);
  group.add(critters);

  // 湖、河、海
  const lake = createLake(shared);
  group.add(lake);
  add({ id: 'lake-shore', name: '月亮湖边', kind: 'fish', x: 138, z: -512, r: 10, hint: 'E 钓鱼' });
  add({ id: 'lake-boat', name: '湖边栈桥', kind: 'fish', x: 130, z: -470, r: 10, hint: 'E 钓鱼' });
  add({ id: 'lake-south', name: '月亮湖南岸', kind: 'fish', x: 36, z: -432, r: 12, hint: 'E 钓鱼' });

  // ===== 手绘立牌：樱花、柳树、棕榈；摊上的货、田里的菜；公交、蜻蜓 ================================================
  let bus = null;
  let flies = null;
  if (plants?.tree?.length && treeIndex.size) {
    // 樱花和别的花果树：玉海城的绿带、街口，各镇的院子里
    for (const [x, z] of sakura) card(x, z, pick(random, [29, 28, 36, 29, 26]), 5.2 + random() * 2.2);
    for (const h of painted) {
      if (random() > (kit ? 0.04 : 0.14)) continue;
      const a = random() * TAU;
      const x = h.x + Math.cos(a) * 9.5;
      const z = h.z + Math.sin(a) * 9.5;
      if (!free(x, z, 2.6) || roadEdge(x, z) < 1.5 || snowAt(x, z) > 0.2) continue;
      if (card(x, z, 25 + Math.floor(random() * 12), 4.6 + random() * 1.6)) claim(x, z, 2.5);
    }
    // 月亮湖和河边：柳树、芦竹
    for (let i = 0; i < 30; i++) {
      const a = random() * TAU;
      card(LAKE.x + Math.cos(a) * LAKE.rx * 1.12, LAKE.z + Math.sin(a) * LAKE.rz * 1.12, 49 + (i % 2), 7 + random() * 2.5);
    }
    for (let t = 0.03; t < 0.9; t += 0.014) {
      if (random() < 0.4) continue;
      // 沿河找岸：从中线往两侧各退十几米
      const s0 = riverPoint(t);
      const side = random() < 0.5 ? 1 : -1;
      const off = RIVER_HALF + 7 + random() * 6;
      const x = s0[0] - s0[3] * side * off;
      const z = s0[1] + s0[2] * side * off;
      if (!free(x, z, 2) || roadEdge(x, z) < 2) continue;
      card(x, z, random() < 0.6 ? 49 + Math.floor(random() * 2) : 57 + Math.floor(random() * 3), 6 + random() * 3);
    }
    // 沙滩：一排排棕榈
    for (let x = 150; x < 660; x += 13 + random() * 16) {
      for (let z = 400; z < 640; z += 6) {
        if (coastD(x, z) > 104 + random() * 26) continue;
        if (beachAt(x, z) > 0.5 && free(x, z, 3) && roadEdge(x, z) > 3) card(x, z, 37 + Math.floor(random() * 3), 7.5 + random() * 2.5);
        break;
      }
    }
    // 树的立牌交给笔触收尾去"刷"（alpha 0.9），不描墨线、边缘收紧——这样和会长的树是一种画法，不像贴纸
    group.add(createPlantBatch(shared, plants.tree, treeCards, { alpha: 0.9, cutoff: 0.82 }));
  }
  if (plants?.critter?.length) {
    const names = new Map(plants.critter[0].sprites.map((sp, i) => [sp.name, i]));
    const goods = [];
    for (const g of stallGoods) goods.push({ ...g, sprite: names.get(g.name) });
    // 麦田和菜地：每块菜地种一种菜（白菜、萝卜、番茄、辣椒……），沿着地块的方向一行行排；
    // 手绘的作物在 farm 图集里（tools/pack-extra.py），没有就退回大头菜
    const farmIdx = new Map((plants.farm?.[0]?.sprites ?? []).map((sp, i) => [sp.name, i]));
    const farmCards = [];
    {
      const VEG = [['napa-cabbage', 0.7], ['radish', 0.62], ['tomato', 0.9], ['chilli', 0.75], ['potato', 0.7], ['peanut', 0.55], ['soybean', 0.8], ['sweet-potato', 0.6], ['taro', 0.95], ['garlic', 0.55], ['sugar-beet', 0.6], ['pea', 0.85], ['broad-bean', 0.85], ['tobacco', 1.1]];
      const TALL = [['sunflower', 1.9], ['rapeseed', 1.0], ['maize', 2.0], ['sorghum', 1.9], ['cotton', 1.1], ['sugarcane', 2.2]];
      const U = [0.82, 0.57];
      const V = [-0.57, 0.82];
      for (const [fx, fz, fr] of [[D('fields').x, D('fields').z, 150], [-415, 92, 46]]) {
        for (let x = fx - fr; x < fx + fr; x += 1.0) {
          for (let z = fz - fr; z < fz + fr; z += 1.0) {
            // 只在行上种：沿地块方向每 1.6 m 一行、行里每 1.2 m 一棵
            const u = x * U[0] + z * U[1];
            const v = x * V[0] + z * V[1];
            if (Math.abs(v / 1.6 - Math.round(v / 1.6)) > 0.32 || Math.abs(u / 1.2 - Math.round(u / 1.2)) > 0.42) continue;
            if (fieldsAt(x, z) < 0.5 || riverAt(x, z).d < RIVER_HALF + 8) continue;
            const p = plotAt(x, z);
            if (p.edge < 0.95) continue;
            let crop = null;
            if (p.kind === 1) crop = VEG[Math.floor(p.id * 9973) % VEG.length];
            else if (p.kind === 0 && p.id < 0.14) crop = TALL[Math.floor(p.id * 7919) % TALL.length];
            if (!crop) continue;
            const idx = farmIdx.get(`plant-${crop[0]}`);
            const y = heightAt(x, z) - 0.04;
            if (idx != null) farmCards.push({ x: x + (random() - 0.5) * 0.25, z: z + (random() - 0.5) * 0.25, y, h: crop[1] * (0.85 + random() * 0.3), sprite: idx });
            else if (p.kind === 1 && random() < 0.5) goods.push({ x, z, y, h: 0.55, sprite: names.get('turnip') });
          }
        }
      }
      add({ id: 'pick-fields', name: '菜地', kind: 'pick', x: D('fields').x + 40, z: D('fields').z - 20, r: 40, hint: 'E 摘点菜' });
    }
    // 果园：一排排结果的树
    {
      const d = D('orchard');
      const KINDS = [['apple', '苹果'], ['pear', '梨'], ['peach', '桃'], ['persimmon', '柿子'], ['mandarin', '橘子'], ['cherry', '樱桃'], ['loquat', '枇杷'], ['pomegranate', '石榴'], ['plum', '李子'], ['jujube', '枣']];
      for (let r = 0; r < 7; r++) {
        const kind = KINDS[(r * 3) % KINDS.length];
        const idx = farmIdx.get(`orchard-${kind[0]}`);
        for (let c = 0; c < 10; c++) {
          const x = d.x - 36 + c * 8 + (r % 2) * 4;
          const z = d.z - 27 + r * 9;
          if (idx == null || riverAt(x, z).d < RIVER_HALF + 6 || roadEdge(x, z) < 2.5 || rectNear(x, z, 2.2)) continue;
          farmCards.push({ x, z, y: heightAt(x, z) - 0.1, h: 4.6 + random() * 1.2, sprite: idx, tree: true });
          claim(x, z, 2.5);
        }
        add({ id: `orchard-${r}`, name: `${kind[1]}树`, kind: 'orchard', fruit: kind[1], x: d.x - 36 + 40, z: d.z - 27 + r * 9, r: 7, hint: `E 摘${kind[1]}` });
      }
    }
    // 作物矮，保留手绘线条和墨线；果树和别的树一样交给笔触去"刷"，不像贴纸
    const crops = farmCards.filter((c) => !c.tree);
    const fruitTrees = farmCards.filter((c) => c.tree);
    if (crops.length) group.add(createPlantBatch(shared, plants.farm, crops, { alpha: 0.16 }));
    if (fruitTrees.length) group.add(createPlantBatch(shared, plants.farm, fruitTrees, { alpha: 0.9, cutoff: 0.82 }));
    group.userData.farmCards = farmCards.length;
    const still = createPlantBatch(shared, plants.critter, goods, { alpha: 0.16, sway: 0 });
    group.add(still);
    group.userData.goods = goods.length;

    // 37 路公交：一块沿着路线来回开的立牌
    const busBatch = createPlantBatch(shared, plants.critter, [{ x: BUS_ROUTE[0][0], z: BUS_ROUTE[0][1], y: 0, h: 3.1, sprite: names.get('bus') }], { alpha: 0.16, sway: 0 });
    group.add(busBatch);
    const route = [];
    let total = 0;
    for (let i = 0; i + 1 < BUS_ROUTE.length; i++) {
      const len = Math.hypot(BUS_ROUTE[i + 1][0] - BUS_ROUTE[i][0], BUS_ROUTE[i + 1][1] - BUS_ROUTE[i][1]);
      route.push({ a: BUS_ROUTE[i], b: BUS_ROUTE[i + 1], from: total, len });
      total += len;
    }
    const busAttr = busBatch.children[0].geometry.attributes.aOffset;
    bus = {
      s: 0,
      dir: 1,
      wait: 0,
      x: BUS_ROUTE[0][0],
      z: BUS_ROUTE[0][1],
      update(dt) {
        if (this.wait > 0) this.wait -= dt;
        else {
          this.s += this.dir * 11 * dt;
          if (this.s >= total || this.s <= 0) {
            this.s = Math.min(total, Math.max(0, this.s));
            this.dir *= -1;
            this.wait = 6;
          }
        }
        const seg = route.find((r) => this.s <= r.from + r.len) ?? route[route.length - 1];
        const k = (this.s - seg.from) / seg.len;
        // 靠右行驶：往路的一侧偏一点
        const nx = -(seg.b[1] - seg.a[1]) / seg.len;
        const nz = (seg.b[0] - seg.a[0]) / seg.len;
        this.x = seg.a[0] + (seg.b[0] - seg.a[0]) * k + nx * 1.6 * this.dir;
        this.z = seg.a[1] + (seg.b[1] - seg.a[1]) * k + nz * 1.6 * this.dir;
        busAttr.setXYZ(0, this.x, heightAt(this.x, this.z) + 0.05, this.z);
        busAttr.needsUpdate = true;
      },
    };

    // 蜻蜓：河面和湖面上一群，绕着各自的点打转
    const homes = [];
    for (let i = 0; i < 46; i++) {
      const t = 0.03 + random() * 0.85;
      const s0 = riverPoint(t);
      const off = (random() - 0.5) * 22;
      homes.push({ x: s0[0] - s0[3] * off, z: s0[1] + s0[2] * off, y: riverLevel(t) + 1.0 + random() * 1.6, r: 2 + random() * 5, w: 0.5 + random() * 0.9, p: random() * 6.28 });
    }
    const flyBatch = createPlantBatch(shared, plants.critter, homes.map((h) => ({ x: h.x, z: h.z, y: h.y, h: 0.34, sprite: names.get('dragonfly') })), { alpha: 0.16, sway: 0 });
    group.add(flyBatch);
    const flyAttr = flyBatch.children[0].geometry.attributes.aOffset;
    let clock = 0;
    flies = {
      update(dt) {
        clock += dt;
        homes.forEach((h, i) => flyAttr.setXYZ(i, h.x + Math.cos(clock * h.w + h.p) * h.r, h.y + Math.sin(clock * 2.3 + h.p) * 0.3, h.z + Math.sin(clock * h.w * 1.3 + h.p) * h.r));
        flyAttr.needsUpdate = true;
      },
    };
  }

  // ===== 街景小物（素材库 life 图集）：花坛、信箱、电话亭、串灯杆、石灯笼、游乐场、阳伞、车 =====
  // 都是手绘的透明立牌，alpha 0.16（笔触不刷、墨线自动描一圈），不随风摆。
  const festoons = []; // 串灯杆的位置：发光特效在杆顶挂一串小灯泡
  if (plants?.life?.length) {
    const lifeNames = new Map(plants.life[0].sprites.map((sp, i) => [sp.name, i]));
    const decor = [];
    const VEHICLES = {
      'transport-city-bicycle': '城市自行车',
      'transport-cargo-bike': '货运自行车',
      'transport-scooter': '小电驴',
      'transport-rowboat': '小木船',
      'transport-kayak': '皮划艇',
      'transport-canoe': '独木舟',
      'transport-ox-cart': '牛车',
      'transport-wheelbarrow': '独轮车',
      'transport-handcart': '手推车',
    };
    // 有套件的时候，这些都不再是立牌：换成立体的模型（tools/ghibli4/play_kit.py 和库里转来的），和别的东西一样登记占地。
    // 写死的位置要是压着篱笆、墙、别的街具，就在旁边一圈圈找最近的空地；找不到就不放。
    const KIT3 = {
      'infra-mailbox': ['prop_mailbox'], 'infra-flower-bed': ['st_station-flower-bed', 'prop_planter_wood'], 'infra-planter-box': ['prop_planter_wood'], 'infra-urn-planter': ['inf_urn-planter'],
      'infra-litter-bin': ['prop_bin_barrel'], 'infra-topiary': ['inf_planter-box'], 'infra-bike-rack': ['inf_bike-rack'], 'infra-phone-booth': ['prop_phonebooth'], 'infra-kiosk': ['prop_kiosk'],
      'infra-market-stall': ['stall'], 'infra-parasol': ['prop_umbrella'], 'infra-picnic-table': ['picnic'], 'infra-festoon-pole': ['prop_lamp_string'], 'infra-street-clock': ['streetclock'],
      'infra-notice-board': ['noticeboard'], 'infra-stone-lantern': ['stonelantern'], 'infra-stone-well': ['farm_well'], 'infra-water-pump': ['pump'], 'infra-swing-set': ['swing'], 'infra-slide': ['slide'],
      'infra-seesaw': ['seesaw'], 'infra-merry-go-round': ['merrygo'], 'infra-sandbox': ['sandbox'], 'infra-rocking-horse': ['rockhorse'], 'infra-gazebo': ['prop_pergola'],
      'transport-city-bicycle': ['bicycle'], 'transport-cargo-bike': ['cargobike'], 'transport-scooter': ['scooter'], 'transport-rowboat': ['rowboat'], 'transport-kayak': ['kayak'], 'transport-canoe': ['canoe'],
      'transport-ox-cart': ['oxcart'], 'transport-wheelbarrow': ['veh_wheelbarrow'], 'transport-handcart': ['prop_handcart'],
    };
    const POLE = [-0.15, 0.15, -0.15, 0.15];
    /** 这块占地里有没有树干、花牌（它们先种下的：新摆的东西让开）。 */
    const plantNear = (rc) => {
      for (const g of grove) if (Math.abs(g[0] - rc.x) < rc.rad + 1 && Math.abs(g[1] - rc.z) < rc.rad + 1 && rectDist(rc, g[0], g[1]) < 0.9) return true;
      for (const c of treeCards) if (Math.abs(c.x - rc.x) < rc.rad + 1.2 && Math.abs(c.z - rc.z) < rc.rad + 1.2 && rectDist(rc, c.x, c.z) < 1.05) return true;
      return false;
    };
    const put3 = (name, x0, z0, { force, r, y, turn }) => {
      const id = (KIT3[name] ?? []).find(has);
      if (!id) return false;
      const it = kit.byId.get(id);
      const boat = /rowboat|kayak|canoe/.test(id);
      const thin = id === 'prop_umbrella' || id === 'prop_lamp_string';
      const t = turn ?? (boat ? random() * TAU : faceRoad(x0, z0, random() * TAU) + (random() - 0.5) * 0.3);
      let spot = null;
      for (let i = 0; i < (force ? 18 : 1) && !spot; i++) {
        const d = i === 0 ? 0 : 0.5 + i * 0.25;
        const x = x0 + Math.cos(i * 2.4) * d;
        const z = z0 + Math.sin(i * 2.4) * d;
        const rc = makeRect(x, z, t, thin ? POLE : it.bounds, 1, 'big');
        if (rectHit(rc, 0.12) || waterAt(x, z) != null || plantNear(rc)) continue;
        if (!force && (!freeC(x, z, Math.min(r, 3)) || roadEdge(x, z) < 0.4)) continue;
        spot = [x, z];
      }
      if (!spot) return false;
      const [x, z] = spot;
      const gy = y ?? heightAt(x, z);
      const o = { y: boat ? gy + 0.17 : y ?? undefined, norect: thin };
      if (it.tint !== 'self') o.accent = pick(random, ACCENTS);
      const e = inst(id, x, z, t, o);
      e.auto = true;
      if (thin) e.rect = addRect(x, z, t, POLE, 1, 'small', e);
      if (it.h > 0.3) {
        const rc = makeRect(x, z, t, thin ? POLE : it.bounds, 1, 'big');
        e.col = b.collide(rc.x, rc.z, rc.hw, rc.hd, boat ? 0.4 : it.h, t, boat ? gy : null);
      }
      // （交互点带着模型和它的碰撞盒：骑走、划走的时候是这一件在动）
      if (name.startsWith('transport-')) add({ id: `vehicle-${name}-${Math.round(x)}-${Math.round(z)}`, name: VEHICLES[name] ?? '交通工具', kind: 'vehicle', vehicle: name, x, z, r: Math.max(1.8, r + 0.8), hint: boat ? 'E 推下水去划' : 'E 骑上去', model: e });
      if (name === 'infra-stone-lantern') lanterns.push([x, gy + it.h * 0.62, z]);
      claim(x, z, Math.min(r, 1.2));
      return [x, z, it.h];
    };
    const put = (name, x, z, h, { force = false, r = 0.8, y = null, turn = null } = {}) => {
      if (kit) return put3(name, x, z, { force, r, y, turn });
      const sp = lifeNames.get(name);
      if (sp == null) return false;
      if (!force && (!clear(x, z, r) || roadEdge(x, z) < 0.4)) return false;
      if (force && rectNear(x, z, 0.3, ['house'])) return false;
      decor.push({ x, z, y: y ?? heightAt(x, z), h, sprite: sp });
      // 交通工具同时作为可交互的乘坐点：素材仍由 life 图集绘制，交互数据独立于装饰批次。
      if (name.startsWith('transport-')) add({ id: `vehicle-${name}-${Math.round(x)}-${Math.round(z)}`, name: VEHICLES[name] ?? '交通工具', kind: 'vehicle', vehicle: name, x, z, r: Math.max(1.8, r + 0.8), hint: 'E 乘坐' });
      if (name === 'infra-stone-lantern') lanterns.push([x, (y ?? heightAt(x, z)) + h * 0.62, z]);
      claim(x, z, r);
      return true;
    };
    const festoon = (x, z, o) => {
      const p = put('infra-festoon-pole', x, z, 4.6, { r: 0.4, ...o });
      if (p) festoons.push(kit ? [p[0], heightAt(p[0], p[1]) + p[2] * 0.93, p[1]] : [x, heightAt(x, z) + 4.3, z]);
    };
    for (const d of [...activityDecorLater, ...activityDecor]) put(d.name, d.x, d.z, d.h, { force: true, r: d.r ?? 0.8, y: d.y ?? null });
    // 家门口
    {
      const [hx, hz] = HOME;
      put('infra-mailbox', hx - 3, hz + 4.4, 1.35, { force: true });
      put('infra-flower-bed', hx + 3.2, hz + 5.0, 0.8, { force: true });
      put('infra-planter-box', hx - 6.6, hz + 4.4, 0.9, { force: true });
      put('transport-city-bicycle', hx + 6.6, hz - 5.5, 1.1, { force: true });
      put('transport-rowboat', hx - 50, hz + 20, 1.0, { r: 2 });
    }
    // 宫前广场：一圈花坛、钟、告示板、电话亭、信箱、串灯杆、自行车
    {
      const [px, pz] = PLAZA;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2 + Math.PI / 8;
        put(i % 2 ? 'infra-flower-bed' : 'infra-urn-planter', px + Math.cos(a) * 20.5, pz + Math.sin(a) * 20.5, i % 2 ? 0.85 : 1.3, { force: true });
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.6;
        festoon(px + Math.cos(a) * 29, pz + Math.sin(a) * 29, { force: true });
      }
      put('infra-street-clock', px + 25, pz - 9, 3.4, { force: true });
      put('infra-notice-board', px - 12, pz - 14, 2.2, { force: true });
      put('infra-phone-booth', px + 14, pz + 25, 2.7, { force: true });
      put('infra-mailbox', px - 16, pz - 24, 1.35, { force: true });
      put('infra-litter-bin', px - 31, pz - 3, 1.0, { force: true });
      put('infra-bike-rack', px + 22, pz + 20, 0.8, { force: true });
      for (let i = 0; i < 3; i++) put('transport-city-bicycle', px + 20.5 + i * 2.4, pz + 21.5, 1.1, { force: true, r: 0.3 });
      put('transport-scooter', px - 24, pz + 18, 1.1, { force: true });
    }
    // 老街和南市街：两边串灯杆，夜里一路亮着
    for (const [[ax, az], [bx, bz]] of [[[130, -44], [125, 40]], [[-175, 126], [-40, 128]], [[46, 126], [176, 114]], [[40, 60], [40, 150]]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      for (let d = 6; d < len; d += 17) for (const side of [-1, 1]) festoon(ax + ((bx - ax) * d) / len + nx * side * 5.0, az + ((bz - az) * d) / len + nz * side * 5.0, { force: true });
    }
    put('infra-market-stall', 142, -12, 2.4);
    put('infra-kiosk', 114, 22, 2.6);
    put('infra-parasol', 140, 18, 2.4);
    put('infra-picnic-table', 140, 18.2, 0.9, { force: true, r: 0.2 });
    // 游乐场：AI 小镇边上找一块空地
    for (const [cx, cz] of [[-398, -160], [-520, -160], [-400, -40], [-530, -20], [-380, -200]]) {
      if (!free(cx, cz, 14) || roadEdge(cx, cz) < 10 || !dry(cx, cz, 8)) continue;
      const pieces = [['infra-swing-set', -6, -4, 2.4], ['infra-slide', 5, -5, 2.4], ['infra-seesaw', -6, 5, 1.0], ['infra-merry-go-round', 4, 4, 1.4], ['infra-sandbox', 0, 9, 0.7], ['infra-rocking-horse', -1, -1, 1.0], ['infra-picnic-table', 10, 2, 0.9], ['infra-gazebo', -11, 2, 4.0]];
      for (const [n, dx, dz, h] of pieces) put(n, cx + dx, cz + dz, h, { force: true, r: 1.2 });
      claim(cx, cz, 14);
      add({ id: 'playground', name: '游乐场', kind: 'play', x: cx, z: cz, r: 10, hint: 'E 荡一会儿秋千' });
      break;
    }
    // 夫子庙、清真寺、玉海宫前：石灯笼
    for (const id of ['temple', 'mosque']) {
      const t = D(id);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        put('infra-stone-lantern', t.x + Math.cos(a) * 23, t.z + Math.sin(a) * 23, 1.8, { r: 0.6 });
      }
    }
    // 阳伞：沙滩上一片，海鲜排档和湖边咖啡座几把
    for (const [x, z] of parasols) put('infra-parasol', x, z, 2.5, { force: true, r: 1.2 });
    for (let x = 170; x < 640; x += 15 + random() * 12) {
      for (let z = 400; z < 640; z += 5) {
        if (coastD(x, z) > 52 + random() * 34) continue;
        if (beachAt(x, z) > 0.5 && heightAt(x, z) > SEA.level + 0.5) put('infra-parasol', x, z, 2.5, { r: 1.5 });
        break;
      }
    }
    for (const [name, x, h] of [['transport-rowboat', 300, 1.0], ['transport-kayak', 352, 0.6], ['transport-canoe', 452, 0.7], ['transport-kayak', 520, 0.6]]) {
      for (let z = 440; z < 640; z += 4) {
        if (coastD(x, z) > 40) continue;
        if (heightAt(x, z) > SEA.level + 0.4) put(name, x, z, h, { r: 2 });
        break;
      }
    }
    // 丰收田园、田园小镇、果园、雪山小镇：独轮车、板车、牛车、压水井、石井
    {
      const f = D('farm');
      put('transport-ox-cart', f.x + 30, f.z + 20, 2.0, { r: 2.5 });
      put('transport-wheelbarrow', f.x + 10, f.z - 20, 0.8);
      put('infra-water-pump', f.x - 12, f.z - 26, 1.3);
      const p = D('pastoral');
      put('transport-handcart', p.x + 30, p.z - 22, 1.0);
      put('transport-ox-cart', p.x - 20, p.z + 40, 2.0, { r: 2.5 });
      put('infra-stone-well', p.x + 2, p.z - 6, 2.0, { r: 1.4 });
      put('transport-wheelbarrow', p.x + 40, p.z + 26, 0.8);
      const o = D('orchard');
      put('transport-wheelbarrow', o.x + 46, o.z + 6, 0.8);
      put('transport-handcart', o.x + 48, o.z - 12, 1.0);
      const sn = D('snowtown');
      put('infra-stone-well', sn.x + 16, sn.z - 2, 2.0, { r: 1.4 });
    }
    // 高铁站前：售货亭、车棚
    {
      const sx = stationHall.x;
      const sz = stationHall.z + 34;
      put('infra-kiosk', sx + 26, sz + 4, 2.6);
      put('infra-kiosk', sx - 28, sz + 4, 2.6);
      put('infra-bike-rack', sx - 14, sz + 12, 0.8);
      for (let i = 0; i < 4; i++) put('transport-city-bicycle', sx - 16 + i * 2.2, sz + 13.5, 1.1, { force: true, r: 0.3 });
      put('transport-cargo-bike', sx + 16, sz + 13, 1.1);
      put('infra-street-clock', sx, sz + 14, 3.4);
    }
    // 各镇的小广场和码头：电话亭、信箱、长椅边的花箱
    for (const [x, z] of [[-452, -104], [296, -500], [752, -170], [-742, 318], [640, -452], [492, -40], [-852, -138], [-734, 488], [722, 110]]) {
      put('infra-phone-booth', x + 4, z + 3, 2.7);
      put('infra-mailbox', x - 4, z + 3, 1.35);
      put('infra-flower-bed', x, z + 6, 0.85);
      put('transport-city-bicycle', x + 7, z + 6, 1.1, { r: 0.6 });
    }
    // 街上：店门口零星的花箱、吊篮
    const streets = SEGS.filter((g) => g.kind === 'street');
    for (let i = 0; i < 150; i++) {
      const s0 = streets[Math.floor(random() * streets.length)];
      const t = random();
      const len = Math.hypot(s0.bx - s0.ax, s0.bz - s0.az) || 1;
      const side = random() < 0.5 ? -1 : 1;
      const x = s0.ax + (s0.bx - s0.ax) * t - ((s0.bz - s0.az) / len) * side * 5.4;
      const z = s0.az + (s0.bz - s0.az) * t + ((s0.bx - s0.ax) / len) * side * 5.4;
      put(pick(random, ['infra-planter-box', 'infra-flower-bed', 'infra-urn-planter', 'infra-litter-bin', 'infra-topiary']), x, z, 0.9 + random() * 0.4, { r: 1.2 });
    }
    if (decor.length) group.add(createPlantBatch(shared, plants.life, decor, { alpha: 0.16, sway: 0 }));
    group.userData.decor = decor.length;
    group.userData.decorList = decor;
  }
  group.userData.festoons = festoons;
  // 灯串：每根串灯杆和最近的一两根相连（广场一圈、老街两排）
  const strings = [];
  {
    const used = new Map();
    festoons.forEach((a, i) => {
      const near = festoons
        .map((b2, j) => [j, Math.hypot(b2[0] - a[0], b2[2] - a[2])])
        .filter(([j, d]) => j !== i && d < 26)
        .sort((p, q) => p[1] - q[1])
        .slice(0, 2);
      for (const [j] of near) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (used.has(key) || (used.get(i) ?? 0) > 2) continue;
        used.set(key, 1);
        strings.push([a, festoons[j]]);
      }
    });
  }

  // 风车的叶片、水车的轮子：单独的网格，慢慢转
  const spin = spinners.length ? LM.createSpinners(shared, spinners) : null;
  if (spin?.group) group.add(spin.group);

  // 野外的小径旁：采花点
  {
    let n = 0;
    for (let i = 0; i < 400 && n < 10; i++) {
      const p = flowerPlaces[Math.floor(random() * flowerPlaces.length)];
      if (!p || builtAt(p.x, p.z) > 0.2 || interactables.some((it) => it.kind === 'gather' && Math.hypot(it.x - p.x, it.z - p.z) < 220)) continue;
      add({ id: `wild-${n++}`, name: '野花丛', kind: 'gather', x: p.x, z: p.z, r: 9, hint: 'E 采一把野花' });
    }
  }

  // ===== 最后一遍：每一件都落地 ====================================================================================
  // ① 还互相叠着的：能拿掉的拿掉（自动摆的、小件），连它的碰撞盒一起；
  // ② 坡上的：往下放到最低的那只脚着地；埋得太深的就不往下放，在悬空的那一侧补一块石头地基。
  const settle = { removed: 0, by: {}, lowered: 0, founded: 0, left: 0 };
  if (kit) {
    const b2 = new Builder(shared);
    const dropCols = (x, z, rad, big) => {
      for (let i = b.colliders.length - 1; i >= 0; i--) {
        const c = b.colliders[i];
        if (Math.hypot(c.x - x, c.z - z) < rad && (big ? c.hw > 3 : c.hw < 1.2)) b.colliders.splice(i, 1);
      }
    };
    const remove = (e) => {
      e.dead = true;
      if (e.rect) e.rect.dead = true;
      if (e.col) b.colliders.splice(b.colliders.indexOf(e.col), 1);
      else if (painted.includes(e)) dropCols(e.x, e.z, 2.5, true);
      else dropCols(e.x, e.z, e.rect && e.rect.rad > 6 ? 4 : 0.5, e.rect && e.rect.rad > 6);
      settle.removed++;
      settle.by[e.kit] = (settle.by[e.kit] ?? 0) + 1;
    };
    const canGo = (e) => e && !e.dead && (e.auto || SMALL.has(e.kit) || e.kit === 'tower' || (painted.includes(e) && e !== painted[0]));
    const hitOf = (a) => {
      let hit = null;
      rectCells(a.x, a.z, a.rad, (k) => {
        for (const q of rectGrid.get(k) ?? []) {
          if (q === a || q.dead || (a.chain != null && a.chain === q.chain) || !rectsOverlap(a, q, -0.03)) continue;
          hit = q;
          return true;
        }
        return false;
      });
      return hit;
    };
    for (const e of [...kitExtras, ...painted]) {
      for (let n = 0; n < 4 && e.rect && !e.dead; n++) {
        const q = hitOf(e.rect);
        if (!q) break;
        // 小的让大的；都拿不掉的留着（体检里会报出来）
        const mine = canGo(e);
        const theirs = canGo(q.ref);
        if (mine && (!theirs || e.rect.rad <= q.rad)) remove(e);
        else if (theirs) remove(q.ref);
        else break;
      }
    }
    // 落在地上的鸟：后来摆的东西压到它了就飞走
    for (const e of kitExtras) if (!e.rect && e.y == null && /^bird_/.test(e.kit) && rectNear(e.x, e.z, 0.08)) remove(e);
    for (const list of [kitExtras, painted]) for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
    for (const e of [...kitExtras, ...painted]) {
      const a = e.rect;
      const it = kit.byId.get(e.kit);
      if (!a || !it || it.afloat || e.kit === 'fence' || a.kind === 'small') continue;
      // 架在水上、桥上的（码头的吊车、堤头的灯）：它脚下是台子，不是地
      if (e.y != null && (waterAt(a.x, a.z) != null || bridgeAt(a.x, a.z))) continue;
      const house = a.kind === 'house';
      const tall = house || it.h > 4;
      const inset = tall ? Math.min(0.45, a.hw * 0.2) : 0;
      let lo = 1e9;
      let hi = -1e9;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
        const hh = heightAt(a.x + u * (a.hw - inset) * a.c + v * (a.hd - inset) * a.s, a.z - u * (a.hw - inset) * a.s + v * (a.hd - inset) * a.c);
        lo = Math.min(lo, hh);
        hi = Math.max(hi, hh);
      }
      const sy = Array.isArray(e.scale) ? e.scale[1] : e.scale ?? 1;
      const zmin = (it.zmin ?? 0) * sy;
      let y = e.y ?? heightAt(e.x, e.z);
      const sink = house ? 0.55 : tall ? 0.6 : it.h > 2 ? 0.5 : 0.22;
      // 大楼盖在坡上：上坡那一侧埋得太深（门都进土了）就整栋抬起来，下坡那一侧用地基垫
      if (tall && hi - y > 0.75) {
        y = hi - sink;
        settle.raised = (settle.raised ?? 0) + 1;
      }
      e.y = y;
      if (y + zmin <= lo + 0.02) continue;
      const want = lo - zmin - 0.04;
      if (hi - want <= sink) {
        e.y = Math.min(y, want);
        settle.lowered++;
        continue;
      }
      e.y = Math.min(y, Math.max(want, hi - sink));
      // 补地基：从最低处往下埋一截，到模型自己的底
      const top = e.y + zmin + 0.06;
      const bot = lo - 0.5;
      if (top - bot < 0.1) continue;
      if (!tall && e.y + zmin - lo <= 0.3) {
        // （小件、缝不到一拃：草盖得住）
        settle.left++;
        continue;
      }
      b2.add(new THREE.BoxGeometry((a.hw - inset) * 2 + 0.16, top - bot, (a.hd - inset) * 2 + 0.16), 'stone#2', [a.x, (top + bot) / 2, a.z], Math.atan2(a.s, a.c));
      e.founded = true;
      settle.founded++;
    }
    b2.build(group);
    // （拿掉的车、船：它的交互点也拿掉）
    for (let i = interactables.length - 1; i >= 0; i--) if (interactables[i].model?.dead) interactables.splice(i, 1);
  }

  // 每栋房子都有一个轻量级 E 交互点；店铺优先打开商店，其余建筑提供参观提示。
  for (let i = 0; i < painted.length; i++) {
    const h = painted[i];
    if (h.shape === 'church' || (i === 0 && !h.shop)) continue;
    add({ id: `building-${i}`, name: h.shop ? `${h.shop}店` : '居民小屋', kind: h.shop ? 'shop' : 'building', x: h.x, z: h.z, r: h.shop ? 7 : 4.5, hint: h.shop ? `E 进入${h.shop}` : 'E 查看建筑', shop: h.shop, map: false });
  }

  // 远处的墨线壳收起来：离得远了描边本来就看不见，省一半的顶点
  const inkMeshes = buildingMeshes.filter((m) => m.userData.ink);
  let inkTick = 0;
  const colliders = b.colliders;
  return {
    group,
    colliders,
    interactables,
    woods,
    lake,
    get bus() {
      return bus;
    },
    get train2() {
      return train2;
    },
    get train() {
      return train;
    },
    /** 高铁线（世界坐标的折线 [x, y, z]）和各站 */
    rail: rail.path,
    /** 菜地 [{ id, x, z, y, where }] */
    gardenPlots,
    /** 换成精模的那几栋：[{ glb, x, z, turn, width, depth }]（main.js 拿去交给 models.js） */
    modelSlots,
    /** 套件房子的清单（main.js 拿去交给 kit.js 实例化）；没有套件时是空的 */
    kitHouses: kit ? [...painted, ...kitExtras] : [],
    /** 街具、农具（老模型库里的小件）：[{ glb, x, z, turn, scale }] */
    propSlots,
    /** 会亮的东西（glow.js） */
    lights: { lamps: b.lamps ?? [], lanterns: [...(b.lanterns ?? []), ...lanterns], festoons, strings, lighthouse: lighthouseLamp },
    cull: cullStats,
    dress: dressStats,
    settle,
    /** 穿模体检：数一数还有多少东西站在别的东西里（tools/town-audit.mjs）。 */
    audit() {
      const out = { treeTrunk: 0, treeCrown: 0, cards: 0, decor: 0, props: 0, houseHouse: 0, houseOther: 0, extraInHouse: 0, examples: [] };
      const note = (what, x, z) => out.examples.length < 40 && out.examples.push(`${what} @ ${Math.round(x)},${Math.round(z)}`);
      for (const [x, z, kind, scale] of grove) {
        const crown = (kind === 0 ? 11.5 : kind <= 3 ? [5.6, 4.6, 6.6][kind - 1] : 1.9) * scale;
        if (rectNear(x, z, 0.8)) (out.treeTrunk++, note('tree-trunk', x, z));
        else if (kind < 7) {
          // （树冠底下摆个信箱、长椅不算穿：只和高过树冠底的大件比）
          const q = rectNear(x, z, crown * 0.7, ['house', 'big']);
          if (q && (q.kind === 'house' || (kit?.byId.get(q.ref?.kit)?.h ?? 0) > 3.2)) (out.treeCrown++, note('tree-crown', x, z));
        }
      }
      for (const c of treeCards) if (rectNear(c.x, c.z, 1.0)) (out.cards++, note('card', c.x, c.z));
      for (const c of group.userData.decorList ?? []) if (rectNear(c.x, c.z, 0.2, ['house'])) (out.decor++, note('decor', c.x, c.z));
      for (const c of propSlots) if (rectNear(c.x, c.z, 0.5)) (out.props++, note('prop', c.x, c.z));
      for (const h of painted) {
        if (!h.rect) continue;
        if (rectHit(h.rect, 0, ['house'])) (out.houseHouse++, note('house-house', h.x, h.z));
        const o = rectHit(h.rect, 0, ['big', 'small', 'proc']);
        if (o) (out.houseOther++, note(`house-${o.kind}:${o.ref?.kit ?? ''}${h.auto ? '' : '(fixed)'}`, h.x, h.z));
      }
      for (const e of kitExtras) if (e.rect?.kind === 'small' && rectNear(e.x, e.z, 0.05, ['house', 'big'])) (out.extraInHouse++, note('extra-' + e.kit, e.x, e.z));
      Object.assign(out, pairAudit());
      return out;
    },
    stats: { buildings: buildingMeshes.length, houses: painted.length, trees: treePlaces.length, pines: pines.length + snowPines.length, rocks: rockPlaces.length, flowers: flowerPlaces.length, crops: gardenPlots.length },
    update(dt, playerPos, camera) {
      if (camera) woods.update(camera);
      pigeons.userData.update(dt, playerPos);
      critters.userData.update(dt, playerPos);
      lake.userData.update(dt);
      bus?.update(dt);
      flies?.update(dt);
      train?.update(dt);
      train2?.update(dt);
      spin?.update(dt);
      activities?.update?.(dt, playerPos, camera);
      if (camera && inkMeshes.length && (inkTick = (inkTick + 1) % 12) === 0) {
        const c = camera.position;
        for (const m of inkMeshes) {
          const s = m.geometry.boundingSphere;
          m.visible = Math.hypot(s.center.x - c.x, s.center.z - c.z) - s.radius < 420;
        }
      }
    },
  };
}
