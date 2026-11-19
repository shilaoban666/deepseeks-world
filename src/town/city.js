// 把城里城外拼起来：每个街区放什么、长什么样、能做什么，都在这个文件里。
// 出来三样东西：一个 group（场景）、一堆碰撞盒（走路别穿墙）、一串交互点（小地图和 E 键都读它）。
import * as THREE from 'three';
import { Builder, PALETTE, house, hall, church, temple, gate, fountain, gym, stall, banner, lamp, bench, stoneLantern, fence } from './buildings.js';
import { addBuildings, createBuildingMaterial, SHAPES, WALLS, ROOFS, SLATE } from '../valley/village.js';
import { createGrove } from '../valley/trees.js';
import { createLake, createTrees, createCrops, createRocks, createFlowerClumps, createPigeons, createCritters, roadGeometry, plazaGeometry, roadMaterial, roadMaterialTextured } from './props.js';
import { createPlantBatch } from './billboard.js';
import { paintMaterial, getAlbedo } from './paint.js';
import { DISTRICTS, ROADS, SEGS, STREET_HALF, PLAZA, HOME, LAKE, SEA, GATE, CITY_R, RIVER, BRIDGES, BUS_ROUTE, BUS_STOPS, RIVER_HALF, GARDENS, riverAt, riverLevel, coastX, plotAt, heightAt, forestAt, fieldsAt, mountainAt, lakeDistance, roadDistance, roadEdge, plazaDistance, cityDistance, fbm, HALF } from './plan.js';

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

/** 让一栋房子面朝最近的那条路（取线段上的最近点，不是折点）。 */
function faceRoad(x, z, fallback = 0) {
  let best = null;
  let bestD = 1e9;
  for (const g of SEGS) {
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

/** 沿河 t（0~1）处的点和法线：[x, z, nx, nz] */
function RSEGSample(t) {
  let lo = [0, 0];
  let best = 1e9;
  // 河不长，直接在折线上按弧长找
  let total = 0;
  const lens = [];
  for (let i = 0; i + 1 < RIVER.length; i++) {
    lens.push(Math.hypot(RIVER[i + 1][0] - RIVER[i][0], RIVER[i + 1][1] - RIVER[i][1]));
    total += lens[i];
  }
  let s = t * total;
  for (let i = 0; i < lens.length; i++) {
    if (s <= lens[i] || i === lens.length - 1) {
      const k = Math.min(1, s / lens[i]);
      const dx = (RIVER[i + 1][0] - RIVER[i][0]) / lens[i];
      const dz = (RIVER[i + 1][1] - RIVER[i][1]) / lens[i];
      return [RIVER[i][0] + dx * lens[i] * k, RIVER[i][1] + dz * lens[i] * k, -dz, dx];
    }
    s -= lens[i];
  }
  return [lo[0], lo[1], 1, 0, best];
}

export function createCity(shared, field, { cards = 1, treeNear = 120, treeFar = 560, density = 1, plants = null, roadTex = false } = {}) {
  const group = new THREE.Group();
  const b = new Builder(shared);
  const random = rng(20261116);
  const interactables = [];
  const add = (o) => {
    interactables.push(o);
    return o;
  };

  // 房子用原作 village.js 那一套：每种形状真的不一样（小屋/长屋/高屋/带厢房/教堂/圆楼），
  // 墙色和瓦色按实例给，一栋和另一栋都不同——吉卜力那个味道就在这儿。我们只负责摆位置。
  const painted = [];
  /** 已经占了的地方（圆）：房子、地标、摊位。新东西先问一声。 */
  const taken = [];
  const free = (x, z, r) => !taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < t[2] + r);
  const claim = (x, z, r) => taken.push([x, z, r]);
  for (const d of DISTRICTS) {
    if (['farm', 'fields', 'forest', 'mountain', 'lake', 'residential', 'food', 'plaza', 'snowtown', 'seaside', 'newtown', 'beach'].includes(d.kind)) continue;
    claim(d.x, d.z, d.kind === 'school' ? 0 : d.kind === 'gym' ? 34 : d.kind === 'home' ? 20 : d.kind === 'market' || d.kind === 'flowermarket' ? 24 : 20);
  }
  // 镇上的墙和瓦：比原作多几种，暖色为主，偶尔一栋青灰瓦
  const TOWN_ROOFS = [...ROOFS, ...ROOFS, SLATE, [0.42, 0.46, 0.5]];
  const paintedHouse = (x, z, opts = {}) => {
    const { shape = 'house', scale = 1.1, turn = null, wall = null, roof = null } = opts;
    const t = turn ?? faceRoad(x, z);
    painted.push({ x, z, turn: t, scale, shape, wall: wall ?? pick(random, WALLS), roof: roof ?? pick(random, TOWN_ROOFS) });
    // 碰撞盒要轴对齐：取房子占地转过去之后的包围
    const fp = { cottage: [7, 10], house: [7.5, 11], wing: [10.5, 11], tall: [7, 8.5], long: [8, 19], church: [9, 22], round: [7.4, 7.4], slim: [3.8, 3.8] }[shape] ?? [8, 10];
    const hw = (fp[0] * scale) / 2;
    const hd = (fp[1] * scale) / 2;
    const c = Math.abs(Math.cos(t));
    const s2 = Math.abs(Math.sin(t));
    b.collide(x, z, hw * c + hd * s2 + 0.2, hw * s2 + hd * c + 0.2, 16);
    claim(x, z, Math.max(hw, hd) * 0.92);
    // 门口的生活气：石门阶、两盆花；有的挂店招、有的摆长凳或木桶
    if (shape === 'church' || shape === 'round' || shape === 'slim') return;
    const gy = heightAt(x, z);
    const fx = Math.sin(t);
    const fz = Math.cos(t);
    const front = (lx, ly, lz) => [x + fx * (hd + lz) + fz * lx, gy + ly, z + fz * (hd + lz) - fx * lx];
    b.add(new THREE.BoxGeometry(1.7, 0.5, 0.8), 'stone#2', front(0, 0.0, 0.4), t);
    for (const sx of [-1, 1]) {
      if (random() < 0.3) continue;
      b.add(new THREE.CylinderGeometry(0.2, 0.15, 0.36, 8), 'roof#1', front(sx * 1.25, 0.18, 0.5));
      b.add(new THREE.IcosahedronGeometry(0.26, 0), `leaf#${random() < 0.5 ? 0 : 1}`, front(sx * 1.25, 0.5, 0.5));
      b.add(new THREE.IcosahedronGeometry(0.12, 0), `flower#${Math.floor(random() * 5)}`, front(sx * 1.25 + 0.1, 0.7, 0.55));
      b.add(new THREE.IcosahedronGeometry(0.1, 0), `flower#${Math.floor(random() * 5)}`, front(sx * 1.25 - 0.12, 0.66, 0.42));
    }
    const roll = random();
    if (opts.shop || (roll < 0.22 && cityDistance(x, z) < 400)) {
      // 店招：一根铁杆挑出来，下面挂块木牌
      const name = opts.shop ?? pick(random, SHOPS);
      b.add(new THREE.BoxGeometry(0.06, 0.06, 1.3), 'iron#0', front(1.9, 3.3, 0.6), t);
      b.add(new THREE.BoxGeometry(0.08, 1.5, 0.74), 'wood#2', front(1.9, 2.5, 0.9), t);
      const text = [...name].slice(0, 3).join('');
      for (const side of [-1, 1]) b.addSign(text, front(1.9 + side * 0.05, 2.5, 0.9), t + (side * Math.PI) / 2, { w: 0.62, h: 1.36, bg: pick(random, ['#3a2a1c', '#22304a', '#7a1f1f', '#2f5a3a']), fg: '#f7e9c6', vertical: true });
      // 门上一条小布帘
      b.add(new THREE.BoxGeometry(1.5, 0.5, 0.05), `cloth#${Math.floor(random() * 5)}`, front(0, 2.45, 0.08), t);
    } else if (roll < 0.4) {
      b.add(new THREE.BoxGeometry(1.5, 0.1, 0.42), 'wood#1', front(-2.4, 0.45, 0.5), t);
      for (const sx of [-0.6, 0.6]) b.add(new THREE.BoxGeometry(0.1, 0.45, 0.4), 'wood#2', front(-2.4 + sx, 0.22, 0.5), t);
    } else if (roll < 0.52) {
      b.add(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 10), 'wood#0', front(2.3, 0.4, 0.5));
      b.add(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 10), 'iron#0', front(2.3, 0.6, 0.5));
    }
  };
  let lighthouseLamp = null;
  // 菜地（种植系统）：家门口、田园小镇各一片
  const gardenPlots = [];
  // 地图上写着的那些铺子
  const SHOPS = ['面馆', '蔬菜铺', '茶铺', '书店', '裁缝', '杂货', '豆腐', '酱菜', '糕点', '药铺', '花店', '米铺'];

  // ===== 小鲸鱼的家 ============================================================
  {
    const [hx, hz] = HOME;
    const z = hz - 16;
    paintedHouse(hx, z, { shape: 'wing', scale: 1.25, turn: 0, wall: [0.97, 0.95, 0.9], roof: [0.24, 0.44, 0.66] });
    {
      // 门楣上的木牌、门两边的花坛、一条踏脚石小路通到院门
      const gy = heightAt(hx, z);
      const fz = z + (11 * 1.25) / 2;
      b.add(new THREE.BoxGeometry(2.6, 0.9, 0.14), 'wood#2', [hx, gy + 3.5, fz + 0.12]);
      b.addSign('鱼的家', [hx, gy + 3.5, fz + 0.22], 0, { w: 2.3, h: 0.72, bg: '#22507a', fg: '#fdf6e3' });
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
    // 院子里的小菜园：西半边（东半边是出门那条石板路）两列四排，八块地（种植系统，见 farming.js）
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) gardenPlots.push({ x: GARDENS[0].x + 1.3 - col * 2.6, z: GARDENS[0].z - 2.4 + row * 1.6, where: '门前的菜地' });
    }
    add({ id: 'home-door', name: '小鲸鱼的家', kind: 'door', x: hx, z: z + 10.5, r: 2.8, hint: 'E 进屋' });
    add({ id: 'home-mailbox', name: '信箱', kind: 'mail', x: hx - 3, z: hz + 4.4, r: 1.8, hint: 'E 看看信箱' });
  }

  // ===== 中央广场 ==============================================================
  {
    const [px, pz] = PLAZA;
    fountain(b, { x: px, z: pz });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      bench(b, px + Math.cos(a) * 17, pz + Math.sin(a) * 17, -a);
      lamp(b, px + Math.cos(a + 0.4) * 24, pz + Math.sin(a + 0.4) * 24);
    }
    add({ id: 'plaza-fountain', name: '广场喷泉', kind: 'wish', x: px, z: pz, r: 7.5, hint: 'E 许个愿' });
    add({ id: 'plaza-board', name: '公告板', kind: 'board', x: px - 12, z: pz - 14, r: 3, hint: 'E 看公告' });
  }

  // ===== 小吃街 ================================================================
  {
    const line = ROADS[5]; // 广场 → 小吃街
    const from = line[0];
    const to = line[line.length - 1];
    const n = 9;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const x = from[0] + (to[0] - from[0]) * t;
      const z = from[1] + (to[1] - from[1]) * t;
      const side = i % 2 ? 1 : -1;
      const nx = -(to[1] - from[1]);
      const nz = to[0] - from[0];
      const len = Math.hypot(nx, nz);
      const ox = x + (nx / len) * 6.5 * side;
      const oz = z + (nz / len) * 6.5 * side;
      stall(b, { x: ox, z: oz, rotY: Math.atan2(-(nx / len) * side, -(nz / len) * side), c1: 'cloth#3', c2: pick(random, ['cloth#0', 'cloth#1', 'cloth#2', 'cloth#4']) });
      if (i % 3 === 0) banner(b, ox, oz, pick(random, ['烤鱼', '白米饭', '糖油粑粑', '酸辣粉', '炸鸡', '奶茶']), Math.atan2(-(nx / len) * side, -(nz / len) * side), 5.0);
    }
    add({ id: 'food-street', name: '小吃街', kind: 'eat', x: (from[0] + to[0]) / 2, z: (from[1] + to[1]) / 2, r: 40, hint: 'E 吃点什么' });
  }

  // ===== 网吧 ==================================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'netcafe');
    hall(b, { x: d.x, z: d.z, rotY: faceRoad(d.x, d.z), w: 16, d: 11, h: 7.4, floors: 2, wall: 4, roof: 2, sign: '网吧', windows: 5, awning: 4, signBg: '#22304a' });
    add({ id: 'netcafe', name: '网吧', kind: 'net', x: d.x, z: d.z, r: 12, hint: 'E 上网' });
  }

  // ===== 超市 ==================================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'supermarket');
    hall(b, { x: d.x, z: d.z, rotY: faceRoad(d.x, d.z), w: 24, d: 14, h: 7.6, floors: 2, wall: 1, roof: 0, sign: '超市', windows: 7, awning: 0 });
    add({ id: 'supermarket', name: '超市', kind: 'shop', x: d.x, z: d.z, r: 14, hint: 'E 逛超市' });
  }

  // ===== 菜市场 ================================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'market');
    for (let i = 0; i < 12; i++) {
      const gx = (i % 4) - 1.5;
      const gz = Math.floor(i / 4) - 1;
      stall(b, { x: d.x + gx * 5.5, z: d.z + gz * 6, rotY: 0, c1: 'cloth#3', c2: `cloth#${i % 5 === 3 ? 4 : i % 3}` });
    }
    banner(b, d.x, d.z - 9, '菜市场', 0, 7);
    add({ id: 'market', name: '菜市场', kind: 'market', x: d.x, z: d.z, r: 20, hint: 'E 买菜' });
  }

  // ===== 花鸟市场 ==============================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'flowermarket');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      stall(b, { x: d.x + Math.cos(a) * 15, z: d.z + Math.sin(a) * 15, rotY: -a + Math.PI / 2, c1: 'cloth#3', c2: `cloth#${i % 2 ? 1 : 2}` });
    }
    banner(b, d.x, d.z - 20, '花鸟市场', 0, 8);
    add({ id: 'flowermarket', name: '花鸟市场', kind: 'seed', x: d.x, z: d.z, r: 22, hint: 'E 买花苗和种子' });
  }

  // ===== 图书馆 ================================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'library');
    hall(b, { x: d.x, z: d.z, rotY: faceRoad(d.x, d.z), w: 22, d: 13, h: 9, floors: 2, wall: 5, roof: 3, sign: '图书馆', columns: 6, windows: 7 });
    add({ id: 'library', name: '图书馆', kind: 'read', x: d.x, z: d.z, r: 14, hint: 'E 看书' });
  }

  // ===== 学校：小学 / 中学 / 大学 ===============================================
  {
    const d = DISTRICTS.find((x) => x.id === 'school');
    const three = [
      { name: '清镇市第一小学', x: d.x - 40, z: d.z - 62, w: 22, d: 11, h: 7.2 },
      { name: '清镇市中学', x: d.x + 22, z: d.z - 24, w: 28, d: 12, h: 9.6 },
      { name: '清镇大学', x: d.x - 10, z: d.z + 52, w: 34, d: 13, h: 10.8 },
    ];
    for (const s of three) {
      hall(b, { x: s.x, z: s.z, rotY: faceRoad(s.x, s.z), w: s.w, d: s.d, h: s.h, floors: s.h > 8 ? 3 : 2, wall: 0, roof: 5, sign: s.name, windows: 8, columns: 4 });
      claim(s.x, s.z, s.w * 0.62);
      add({ id: `school-${s.name}`, name: s.name, kind: 'study', x: s.x, z: s.z, r: 12, hint: 'E 上课' });
    }
    // 操场
    for (let i = 0; i < 6; i++) b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 6), `wood#2`, [d.x + 70, heightAt(d.x + 70, d.z) + 0.25, d.z - 40 + i * 16]);
  }

  // ===== 教堂 ==================================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'church');
    paintedHouse(d.x, d.z, { shape: 'church', scale: 1.35, turn: faceRoad(d.x, d.z), wall: WALLS[0], roof: SLATE });
    add({ id: 'church', name: '教堂', kind: 'pray', x: d.x, z: d.z, r: 16, hint: 'E 祈祷' });
  }

  // ===== 夫子庙 ================================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'temple');
    temple(b, { x: d.x, z: d.z, rotY: faceRoad(d.x, d.z) });
    for (const [dx, dz] of [[-13, 11], [13, 11], [-13, -11], [13, -11]]) stoneLantern(b, d.x + dx, d.z + dz);
    add({ id: 'temple', name: '夫子庙', kind: 'pray', x: d.x, z: d.z + 12, r: 14, hint: 'E 上香' });
  }

  // ===== 电玩厅 ================================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'arcade');
    hall(b, { x: d.x, z: d.z, rotY: faceRoad(d.x, d.z), w: 14, d: 10, h: 7, floors: 2, wall: 2, roof: 1, sign: '电玩厅', windows: 5, awning: 2, signBg: '#7a2a5a' });
    add({ id: 'arcade', name: '电玩厅', kind: 'arcade', x: d.x, z: d.z, r: 11, hint: 'E 打电玩' });
  }

  // ===== 体育馆 ================================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'gym');
    gym(b, { x: d.x, z: d.z, rotY: 0 });
    add({ id: 'gym', name: '体育馆', kind: 'sport', x: d.x, z: d.z + 26, r: 12, hint: 'E 锻炼' });
  }

  // ===== 冒险者协会 ============================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'guild');
    hall(b, { x: d.x, z: d.z, rotY: faceRoad(d.x, d.z), w: 18, d: 12, h: 8, floors: 2, wall: 3, roof: 0, sign: '冒险者协会', windows: 6, awning: 1 });
    add({ id: 'guild', name: '冒险者协会', kind: 'guild', x: d.x, z: d.z, r: 12, hint: 'E 接委托' });
  }

  // ===== 居民区 ================================================================
  {
    const rings = [
      { d: DISTRICTS.find((x) => x.id === 'resA'), n: 16 },
      { d: DISTRICTS.find((x) => x.id === 'resB'), n: 16 },
      { d: DISTRICTS.find((x) => x.id === 'resC'), n: 14 },
    ];
    for (const { d, n } of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + random() * 0.5;
        const r = d.r * (0.2 + random() * 0.8);
        const x = d.x + Math.cos(a) * r;
        const z = d.z + Math.sin(a) * r;
        if (roadDistance(x, z) < 12 || plazaDistance(x, z) < 34) continue;
        if (!free(x, z, 9)) continue;
        paintedHouse(x, z, { shape: pick(random, ['house', 'cottage', 'tall', 'wing']), scale: 1.0 + random() * 0.3, turn: faceRoad(x, z) + (random() < 0.5 ? Math.PI / 2 : 0) });
      }
      add({ id: `res-${d.id}`, name: d.name, kind: 'home', x: d.x, z: d.z, r: d.r * 0.5, hint: null });
    }
  }

  // ===== 城门：清镇市 ==========================================================
  {
    const [gx, gz] = GATE;
    gate(b, { x: gx, z: gz, rotY: 0, text: '清镇市' });
    // 城墙往两边延一段
    for (const side of [-1, 1]) {
      for (let i = 1; i <= 5; i++) {
        const x = gx + side * (8 + i * 3.2);
        b.add(new THREE.BoxGeometry(3.2, 5 + i * 0.3, 2.2), `stone#0`, [x, heightAt(x, gz) + (5 + i * 0.3) / 2, gz]);
      }
    }
    add({ id: 'gate', name: '清镇市城门', kind: 'gate', x: gx, z: gz + 12, r: 12, hint: 'E 看看城门' });
  }

  // ===== 农村 ==================================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'farm');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 30 + random() * 60;
      const x = d.x + Math.cos(a) * r;
      const z = d.z + Math.sin(a) * r;
      if (roadDistance(x, z) < 10) continue;
      paintedHouse(x, z, { shape: pick(random, ['house', 'cottage', 'long']), scale: 1.05 + random() * 0.3, turn: random() * Math.PI });
      fence(b, x - 7, z + 6, x + 7, z + 6, 0.9);
      if (random() < 0.6) fence(b, x - 7, z + 6, x - 7, z - 6, 0.9);
    }
    // 谷仓
    hall(b, { x: d.x + 18, z: d.z - 26, rotY: 0.4, w: 14, d: 9, h: 6, floors: 1, wall: 3, roof: 4, windows: 4, sign: '种子铺' });
    add({ id: 'farm', name: '农村', kind: 'farm', x: d.x, z: d.z + 30, r: 26, hint: 'E 找农夫聊天' });
    add({ id: 'farm-seeds', name: '种子铺', kind: 'seed', x: d.x + 18, z: d.z - 20, r: 9, hint: 'E 买种子' });
    // 租的菜地：plan.GARDENS 里定好的那块（那里不长草），三排四列，一圈矮篱笆，插块牌子
    {
      const { x: cx, z: cz } = GARDENS[1];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) gardenPlots.push({ x: cx - 3.9 + col * 2.6, z: cz - 2 + row * 2, where: '租的菜地' });
      }
      fence(b, cx - 6, cz - 3.6, cx + 6, cz - 3.6, 0.8);
      fence(b, cx - 6, cz + 3.6, cx + 6, cz + 3.6, 0.8);
      fence(b, cx - 6, cz - 3.6, cx - 6, cz + 3.6, 0.8);
      banner(b, cx + 7.5, cz, '租的菜地', Math.PI / 2, 3);
      claim(cx, cz, 9);
    }
  }

  // ===== 河鲜集市：一圈摊位，摊上摆着鱼、虾、鱼干 =================================
  const stallGoods = []; // 摊位上立着的货（物件图集）
  {
    const d = DISTRICTS.find((x) => x.id === 'fishmarket');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const x = d.x + Math.cos(a) * 11;
      const z = d.z + Math.sin(a) * 11;
      stall(b, { x, z, rotY: -a + Math.PI / 2, c1: 'cloth#3', c2: `cloth#${[4, 1, 0][i % 3]}` });
      stallGoods.push({ x, z, y: heightAt(x, z) + 1.0, h: 0.5, name: ['fish', 'shrimp', 'dried-fish'][i % 3] });
    }
    // 晒鱼干的架子
    for (let i = 0; i < 2; i++) {
      const x = d.x - 3 + i * 6;
      const gy = heightAt(x, d.z);
      for (const sx of [-1.6, 1.6]) b.add(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), 'wood#2', [x + sx, gy + 1.2, d.z]);
      b.add(new THREE.BoxGeometry(3.4, 0.07, 0.07), 'wood#2', [x, gy + 2.3, d.z]);
      for (let k = 0; k < 5; k++) stallGoods.push({ x: x - 1.2 + k * 0.6, z: d.z, y: gy + 1.5, h: 0.42, name: 'dried-fish' });
    }
    banner(b, d.x, d.z + 16, '河鲜集市', 0, 7);
    add({ id: 'fishmarket', name: '河鲜集市', kind: 'fishmarket', x: d.x, z: d.z, r: 15, hint: 'E 逛河鲜集市' });
  }

  // ===== 雪山小镇：青灰瓦的木屋，挤在山脚 ==========================================
  {
    const d = DISTRICTS.find((x) => x.id === 'snowtown');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + random() * 0.4;
      const r = 14 + random() * 46;
      const x = d.x + Math.cos(a) * r;
      const z = d.z + Math.sin(a) * r;
      if (roadEdge(x, z) < 6 || !free(x, z, 8) || riverAt(x, z).d < 30) continue;
      paintedHouse(x, z, { shape: pick(random, ['cottage', 'house', 'long']), scale: 0.95 + random() * 0.25, turn: random() * Math.PI, wall: pick(random, [WALLS[3], WALLS[5], [0.62, 0.5, 0.4]]), roof: pick(random, [SLATE, [0.36, 0.4, 0.46], [0.5, 0.52, 0.56]]) });
    }
    add({ id: 'snowtown', name: '雪山小镇', kind: 'village', x: d.x, z: d.z, r: 22, hint: 'E 和镇上的人聊聊', text: '木屋的烟囱冒着白烟。再往北，就是雪山了。' });
  }

  // ===== 海滨小镇：白墙蓝瓦，沿着海岸排开；一座灯塔 ================================
  {
    const d = DISTRICTS.find((x) => x.id === 'seaside');
    const BLUE = [[0.26, 0.42, 0.62], [0.32, 0.5, 0.68], [0.2, 0.36, 0.56]];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + random() * 0.4;
      const r = 16 + random() * 62;
      const x = d.x + Math.cos(a) * r;
      const z = d.z + Math.sin(a) * r;
      if (roadEdge(x, z) < 6 || !free(x, z, 8) || x > coastX(z) - 85) continue;
      paintedHouse(x, z, { shape: pick(random, ['cottage', 'house', 'tall', 'wing']), scale: 0.95 + random() * 0.25, turn: faceRoad(x, z) + (random() < 0.5 ? Math.PI / 2 : 0), wall: [0.97, 0.97, 0.95], roof: pick(random, BLUE) });
    }
    add({ id: 'seaside', name: '海滨小镇', kind: 'village', x: d.x, z: d.z, r: 22, hint: 'E 和镇上的人聊聊', text: '白墙蓝瓦，晾着渔网。海风里有一点咸味。' });
    // 灯塔：红白相间的塔身、一圈平台、玻璃灯室、红顶
    const L = DISTRICTS.find((x) => x.id === 'lighthouse');
    const gy = heightAt(L.x, L.z);
    b.add(new THREE.CylinderGeometry(4.2, 4.8, 2.4, 20), 'stone#2', [L.x, gy + 0.6, L.z]);
    for (let i = 0; i < 6; i++) {
      const r0 = 3.4 - i * 0.28;
      b.add(new THREE.CylinderGeometry(r0 - 0.28, r0, 3.4, 20), i % 2 ? 'cloth#0' : 'wall#1', [L.x, gy + 3.5 + i * 3.4, L.z]);
    }
    const top = gy + 1.8 + 6 * 3.4;
    b.add(new THREE.CylinderGeometry(2.7, 2.7, 0.3, 20), 'iron#0', [L.x, top + 0.15, L.z]);
    for (let k = 0; k < 10; k++) b.add(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), 'iron#0', [L.x + Math.cos((k / 10) * 6.283) * 2.6, top + 0.8, L.z + Math.sin((k / 10) * 6.283) * 2.6]);
    b.add(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 12), 'glow#0', [L.x, top + 1.4, L.z]);
    lighthouseLamp = [L.x, top + 1.4, L.z];
    b.add(new THREE.ConeGeometry(2.0, 1.8, 12), 'cloth#0', [L.x, top + 3.4, L.z]);
    b.add(new THREE.BoxGeometry(1.2, 2.2, 0.2), 'wood#0', [L.x, gy + 2.2, L.z + 4.3]);
    b.collide(L.x, L.z, 4.6, 4.6, 26);
    claim(L.x, L.z, 8);
    add({ id: 'lighthouse', name: '灯塔', kind: 'village', x: L.x, z: L.z + 7, r: 8, hint: 'E 看海', text: '海一直铺到天边。远处有两三点白帆。' });
  }

  // ===== 高铁站：玻璃和白墙的大厅 + 站台 + 一列车 ==================================
  const trainSpots = [];
  {
    const d = DISTRICTS.find((x) => x.id === 'station');
    const gy = heightAt(d.x, d.z);
    const rotY = Math.PI / 2; // 正面朝西（朝镇子）
    const at = (lx, ly, lz) => [d.x + lx * Math.cos(rotY) + lz * Math.sin(rotY), gy + ly, d.z - lx * Math.sin(rotY) + lz * Math.cos(rotY)];
    const put = (geo, key, lx, ly, lz) => b.add(geo, key, at(lx, ly, lz), rotY);
    put(new THREE.BoxGeometry(46, 1.0, 22), 'stone#2', 0, -0.2, 0);
    put(new THREE.BoxGeometry(40, 9, 16), 'wall#1', 0, 4.8, 0);
    // 一整面玻璃幕墙，白色的竖框
    put(new THREE.BoxGeometry(36, 6.4, 0.2), 'glass#0', 0, 5.0, 8.06);
    for (let i = 0; i <= 12; i++) put(new THREE.BoxGeometry(0.3, 6.6, 0.3), 'wall#1', -18 + i * 3, 5.0, 8.16);
    put(new THREE.BoxGeometry(36.4, 0.3, 0.34), 'wall#1', 0, 5.0, 8.16);
    // 弧形的大屋顶：三段叠起来
    for (let i = 0; i < 3; i++) put(new THREE.BoxGeometry(44 - i * 9, 0.7, 20 - i * 2), i === 0 ? 'iron#0' : 'wall#4', 0, 9.6 + i * 0.7, 0);
    put(new THREE.BoxGeometry(48, 0.4, 5), 'iron#0', 0, 7.4, 10.4);
    for (const lx of [-20, -10, 0, 10, 20]) put(new THREE.CylinderGeometry(0.3, 0.3, 7.4, 10), 'wall#1', lx, 3.7, 12.4);
    put(new THREE.BoxGeometry(8, 3.4, 0.24), 'glass#0', 0, 2.0, 8.2);
    // 背面（朝站台）和两侧：一排高窗、一条蓝色腰线
    put(new THREE.BoxGeometry(36, 3.2, 0.2), 'glass#0', 0, 6.2, -8.06);
    for (let i = 0; i <= 12; i++) put(new THREE.BoxGeometry(0.3, 3.4, 0.3), 'wall#1', -18 + i * 3, 6.2, -8.14);
    put(new THREE.BoxGeometry(40.2, 0.5, 16.2), 'cloth#4', 0, 3.6, 0);
    for (const sx of [-1, 1]) put(new THREE.BoxGeometry(0.2, 3.2, 12), 'glass#0', sx * 20.06, 6.2, 0);
    // 站台上的长椅和站名牌
    for (let i = 0; i < 5; i++) put(new THREE.BoxGeometry(2.4, 0.12, 0.5), 'wood#1', -24 + i * 12, 1.2, -12.4);
    b.addSign('AI 小镇', at(0, 3.6, -11.2), rotY + Math.PI, { w: 4, h: 0.8, bg: '#ffffff', fg: '#1f4b7a' });
    b.addSign('高铁站', at(0, 8.4, 8.3), rotY, { w: 8, h: 1.6, bg: '#1f4b7a', fg: '#ffffff' });
    b.collide(d.x, d.z, 8.5, 20.5, 12);
    // 站台和铁轨（在大厅东边，南北向）
    put(new THREE.BoxGeometry(70, 0.9, 5), 'stone#0', 0, 0.25, -13);
    put(new THREE.BoxGeometry(70, 0.3, 6), 'iron#0', 0, 5.2, -13);
    for (let i = 0; i < 8; i++) put(new THREE.CylinderGeometry(0.16, 0.16, 5, 8), 'wall#1', -31 + i * 9, 2.7, -13);
    for (const lz of [-18.2, -19.7]) put(new THREE.BoxGeometry(220, 0.16, 0.14), 'iron#0', 0, 0.2, lz);
    for (let i = 0; i < 74; i++) put(new THREE.BoxGeometry(0.3, 0.12, 2.6), 'wood#2', -109 + i * 3, 0.08, -18.95);
    b.collide(at(0, 0, -19)[0], at(0, 0, -19)[2], 1.6, 60, 4);
    trainSpots.push({ x: at(4, 0, -19)[0], z: at(4, 0, -19)[2], y: gy + 0.2, h: 4.6, name: 'train' });
    claim(d.x, d.z, 34);
    add({ id: 'station', name: '高铁站', kind: 'station', x: at(0, 0, 14)[0], z: at(0, 0, 14)[2], r: 12, hint: 'E 看车次' });
  }

  // ===== 高铁新城：几栋新盖的楼 ====================================================
  {
    const d = DISTRICTS.find((x) => x.id === 'newtown');
    const spots = [[-30, -20, 24, 12, 13], [10, -34, 20, 12, 16], [36, 6, 22, 12, 12], [-12, 22, 26, 12, 10], [-50, 30, 18, 11, 9]];
    for (const [dx, dz, w, dd, h] of spots) {
      const x = d.x + dx;
      const z = d.z + dz;
      if (!free(x, z, w * 0.55)) continue;
      hall(b, { x, z, rotY: faceRoad(x, z), w, d: dd, h, floors: Math.round(h / 3.2), wall: [1, 4, 5][Math.abs(dx) % 3], roof: 3, windows: Math.round(w / 2.6), flat: true });
      claim(x, z, w * 0.6);
    }
    add({ id: 'newtown', name: '高铁新城', kind: 'village', x: d.x, z: d.z, r: 24, hint: 'E 看看', text: '楼是新的，街上人还不多。工地的围挡上写着：明年通车。' });
  }

  // ===== 石桥：路跨过清溪河的地方 ==================================================
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
    add({ id: `bridge-${br.name}`, name: br.name, kind: 'village', x: br.x, z: br.z, r: 5, hint: 'E 看河', text: '河水清得能看见卵石。有小鱼逆着水往上游。' });
  }

  // ===== 公交站牌 ==================================================================
  for (const st of BUS_STOPS) {
    const gy = heightAt(st.x, st.z - 5);
    b.add(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6), 'iron#0', [st.x, gy + 1.4, st.z - 5]);
    b.add(new THREE.BoxGeometry(3.4, 0.12, 1.4), 'cloth#1', [st.x + 1.4, gy + 2.5, st.z - 5]);
    b.add(new THREE.BoxGeometry(2.6, 0.12, 0.5), 'wood#1', [st.x + 1.4, gy + 0.5, st.z - 5.3]);
    for (const dx of [0.2, 2.6]) b.add(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), 'iron#0', [st.x + dx, gy + 1.25, st.z - 5.5]);
    b.addSign(`1路 ${st.name}`, [st.x, gy + 2.2, st.z - 4.9], 0, { w: 2.2, h: 0.5, bg: '#e8a13a', fg: '#3a2a1c' });
    add({ id: `bus-${st.name}`, name: `公交站 · ${st.name}`, kind: 'bus', x: st.x + 1, z: st.z - 4, r: 5, hint: 'E 坐 1 路公交', stop: st.name });
  }

  // ===== 沿街的房子：每条石板街两边各一排，山墙和屋檐交替着朝街 =====================
  const lampSpots = [];
  const treeSpots = []; // 行道树
  {
    const shapes = ['house', 'house', 'tall', 'cottage', 'wing', 'house', 'tall', 'cottage'];
    for (const line of ROADS) {
      let carry = 4;
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, az] = line[i];
        const [bx, bz] = line[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const ux = (bx - ax) / len;
        const uz = (bz - az) / len;
        const nx = -uz;
        const nz = ux;
        if (cityDistance((ax + bx) / 2, (az + bz) / 2) > 380) continue;
        for (const side of [-1, 1]) {
          let t = carry + (side > 0 ? 3 : 0);
          while (t < len - 3) {
            const shape = pick(random, shapes);
            const scale = 0.95 + random() * 0.22;
            const eaves = random() < 0.55; // 屋檐朝街（长边贴街），否则山墙朝街
            const fp = { cottage: [7, 10], house: [7.5, 11], wing: [10.5, 11], tall: [7, 8.5] }[shape];
            const along = (eaves ? fp[1] : fp[0]) * scale;
            const deep = (eaves ? fp[0] : fp[1]) * scale;
            const setback = STREET_HALF + 1.6 + random() * 1.6;
            const px = ax + ux * (t + along / 2) + nx * side * (setback + deep / 2);
            const pz = az + uz * (t + along / 2) + nz * side * (setback + deep / 2);
            const r = Math.max(along, deep) * 0.5;
            const ok = plazaDistance(px, pz) > 36 + r && roadEdge(px, pz) > deep / 2 + 0.6 && free(px, pz, r * 0.95) && cityDistance(px, pz) < 400 && lakeDistance(px, pz) > 1.3 && Math.hypot(px - HOME[0], pz - (HOME[1] - 8)) > 30;
            if (ok && random() < 0.84) {
              // 局部 +z 指向街
              const face = Math.atan2(-nx * side, -nz * side);
              paintedHouse(px, pz, { shape, scale, turn: face + (eaves ? Math.PI / 2 : 0) });
              t += along + 1.2 + random() * 2.8;
            } else {
              // 空出来的地方种一棵行道树
              if (ok === false && free(px, pz, 3) && roadEdge(px, pz) > 2 && plazaDistance(px, pz) > 33) treeSpots.push([ax + ux * t + nx * side * (STREET_HALF + 2.4), az + uz * t + nz * side * (STREET_HALF + 2.4)]);
              else if (ok) treeSpots.push([ax + ux * (t + 4) + nx * side * (STREET_HALF + 3.5), az + uz * (t + 4) + nz * side * (STREET_HALF + 3.5)]);
              t += 9 + random() * 5;
            }
          }
        }
        // 路灯：每 26 m 一盏，左右交替
        for (let t = 8; t < len; t += 26) {
          const side = Math.round(t / 26) % 2 ? 1 : -1;
          const lx = ax + ux * t + nx * side * (STREET_HALF + 0.5);
          const lz = az + uz * t + nz * side * (STREET_HALF + 0.5);
          if (plazaDistance(lx, lz) < 32) continue;
          lampSpots.push([lx, lz, Math.atan2(-nx * side, -nz * side)]);
        }
        carry = 2;
      }
    }
    for (const [lx, lz, r] of lampSpots) lamp(b, lx, lz, r);
  }

  // 广场一圈：高一点的房子把广场围起来，街口留着
  {
    const [px, pz] = PLAZA;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + 0.07;
      const x = px + Math.cos(a) * 40.5;
      const z = pz + Math.sin(a) * 40.5;
      if (roadEdge(x, z) < 5.2 || !free(x, z, 4.4)) continue;
      paintedHouse(x, z, { shape: i % 3 ? 'tall' : 'house', scale: 1.02 + random() * 0.14, turn: Math.atan2(px - x, pz - z) + (i % 3 ? 0 : Math.PI / 2) });
    }
  }

  // ===== 收尾：合并建筑 + 把画出来的那片房子实例化 ==================================
  const buildingMeshes = b.build(group);
  if (painted.length) {
    addBuildings(group, createBuildingMaterial({ uniforms: shared }), painted, heightAt);
  }
  buildingMeshes.painted = painted.length;

  // ===== 路面和广场 ============================================================
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
  }

  // ===== 树 ====================================================================
  // 用原作那一套会"长"的树：城里是行道树和院子里的树，城外成丛成片，林子里连成一体。
  const grove = [];
  const pines = [];
  {
    const TAU = Math.PI * 2;
    const tree = (x, z, kind, scale) => {
      if (lakeDistance(x, z) < 1.16 || Math.abs(x) > HALF - 30 || Math.abs(z) > HALF - 30) return false;
      if (riverAt(x, z).d < RIVER_HALF + 5 || x > coastX(z) - 70 || !free(x, z, 1.5)) return false;
      if (roadEdge(x, z) < (kind === 0 ? 4 : 1.6)) return false;
      grove.push([x, z, kind, scale, random() * TAU]);
      return true;
    };
    const mid = () => 1 + Math.floor(random() * 3);
    // 镇上的大树：广场边、家的院子、庙前、教堂边、学校操场、村口——眼睛想看到一棵的地方
    for (const [x, z, s] of [[PLAZA[0] - 22, PLAZA[1] + 20, 0.82], [HOME[0] - 15, HOME[1] - 3, 0.9], [-246, -196, 0.9], [-186, -120, 0.8], [-296, -6, 0.95], [-612, 500, 1.0], [214, 204, 0.8], [GATE[0] + 26, GATE[1] + 30, 0.9], [300, 126, 0.85]]) {
      if (tree(x, z, 0, s)) claim(x, z, 5);
    }
    // 行道树
    for (const [x, z] of treeSpots) {
      if (!free(x, z, 2.2) || random() > 0.8) continue;
      if (tree(x, z, mid(), 0.5 + random() * 0.22)) claim(x, z, 3);
    }
    // 院子里、屋后：每栋房子背后有一半的机会长一棵
    for (const h of painted.slice()) {
      if (random() > 0.5) continue;
      const a = random() * TAU;
      const d = 9 + random() * 5;
      const x = h.x + Math.cos(a) * d;
      const z = h.z + Math.sin(a) * d;
      if (!free(x, z, 3.4) || plazaDistance(x, z) < 34) continue;
      if (random() < 0.4) tree(x, z, 7 + (random() < 0.5 ? 0 : 1), 0.8 + random() * 0.8);
      else if (tree(x, z, mid(), 0.5 + random() * 0.3)) claim(x, z, 3);
    }
    // 城外：按噪声成丛（copse），丛里中间的树大、边上的小，脚下有灌木
    const step = 30;
    for (let gx = -HALF + 40; gx < HALF - 40; gx += step) {
      for (let gz = -HALF + 40; gz < HALF - 40; gz += step) {
        const x = gx + (random() - 0.5) * step;
        const z = gz + (random() - 0.5) * step;
        const h = heightAt(x, z);
        const forest = forestAt(x, z);
        const cd = cityDistance(x, z);
        if (fieldsAt(x, z) > 0.3) continue;
        if (h > 120) {
          // 山上是松
          if (h < 250 && random() < 0.75 * density) for (let k = 0; k < 4; k++) pines.push({ x: x + (random() - 0.5) * 26, z: z + (random() - 0.5) * 26, s: 0.9 + random() * 0.9, tier: 2 });
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
        if (cd < CITY_R - 40) {
          // 城里的空地：小公园（不占街和房子）
          if (wild > 0.6 && free(x, z, 7) && random() < 0.55) {
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
    // 湖边一圈灌木和几棵柳一样垂着的树
    for (let i = 0; i < 46; i++) {
      const a = random() * TAU;
      const k = 1.2 + random() * 0.22;
      const x = LAKE.x + Math.cos(a) * LAKE.rx * k;
      const z = LAKE.z + Math.sin(a) * LAKE.rz * k;
      if (lakeDistance(x, z) < 1.17) continue;
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
    treeCards.push({ x, z, y: heightAt(x, z) - 0.15, h, sprite: i });
    return true;
  };
  if (treeIndex.size) {
    // 山上：针叶树
    for (const p of pines) card(p.x, p.z, 13 + Math.floor(random() * 12), 7 + p.s * 4.5);
  } else if (pines.length) group.add(createTrees(shared, pines));

  // 菜地：每块一个交互点（地和作物的样子交给 farming.js）
  gardenPlots.forEach((p, i) => {
    p.id = i;
    p.y = heightAt(p.x, p.z);
    claim(p.x, p.z, 1.1);
    add({ id: `plot-${i}`, name: p.where, kind: 'plot', plot: i, x: p.x, z: p.z, r: 1.15, hint: 'E 看看菜地' });
  });

  // 石头：山上和湖边
  const rockPlaces = [];
  for (let i = 0; i < 240; i++) {
    const a = random() * Math.PI * 2;
    const r = 560 + random() * (HALF - 580);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (mountainAt(x, z) < 0.15) continue;
    rockPlaces.push({ x, z, s: 1.2 + random() * 3.4, r: random() * 6 });
  }
  for (let i = 0; i < 40; i++) {
    const a = random() * Math.PI * 2;
    const x = LAKE.x + Math.cos(a) * LAKE.rx * (1.02 + random() * 0.12);
    const z = LAKE.z + Math.sin(a) * LAKE.rz * (1.02 + random() * 0.12);
    rockPlaces.push({ x, z, s: 0.7 + random() * 1.1, r: random() * 6 });
  }
  group.add(createRocks(shared, rockPlaces));

  // 野花：城外多
  const flowerPlaces = [];
  for (let i = 0; i < 260; i++) {
    const a = random() * Math.PI * 2;
    const r = 300 + random() * (HALF - 340);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (lakeDistance(x, z) < 1.2 || heightAt(x, z) > 260) continue;
    if (fieldsAt(x, z) > 0.4) continue;
    flowerPlaces.push({ x, z, r: 3 + random() * 5 });
  }
  // 野花：有图集就用 139 张手绘立牌（会摇、会跟着光变），否则退回程序化的低模花丛
  if (plants?.flower?.length) {
    const spots = [];
    for (const p of flowerPlaces) {
      const n = 10 + Math.floor(random() * 9);
      for (let i = 0; i < n; i++) {
        const a = random() * Math.PI * 2;
        const r = random() * (p.r ?? 3);
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
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
  for (let i = 0; i < 30; i++) {
    const a = random() * Math.PI * 2;
    const r = 340 + random() * 500;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (lakeDistance(x, z) < 1.2) continue;
    critterPlaces.push({ x, z, kind: random() < 0.35 ? 'cat' : 'rabbit' });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    critterPlaces.push({ x: PLAZA[0] + Math.cos(a) * 26, z: PLAZA[1] + Math.sin(a) * 26, kind: 'cat' });
  }
  const critters = createCritters(shared, critterPlaces);
  group.add(critters);

  // 湖
  const lake = createLake(shared);
  group.add(lake);
  add({ id: 'lake-shore', name: '月亮湖边', kind: 'fish', x: LAKE.x - LAKE.rx * 0.95, z: LAKE.z, r: 14, hint: 'E 钓鱼' });
  add({ id: 'lake-boat', name: '小码头', kind: 'fish', x: LAKE.x - LAKE.rx * 0.72, z: LAKE.z + LAKE.rz * 0.65, r: 12, hint: 'E 钓鱼' });

  // ===== 手绘立牌：花果树、柳树、棕榈；摊上的货、田里的菜；公交、高铁、蜻蜓 ============
  let bus = null;
  let flies = null;
  if (plants?.tree?.length && treeIndex.size) {
    // 镇上：会开花、结果的树（樱、梅、苹果、橘……）种在广场边和各家院子里
    for (const h of painted) {
      if (random() > 0.16 || cityDistance(h.x, h.z) > 420) continue;
      const a = random() * Math.PI * 2;
      const x = h.x + Math.cos(a) * 9.5;
      const z = h.z + Math.sin(a) * 9.5;
      if (!free(x, z, 2.6) || roadEdge(x, z) < 1.5) continue;
      if (card(x, z, 25 + Math.floor(random() * 12), 4.6 + random() * 1.6)) claim(x, z, 2.5);
    }
    // 月亮湖和河边：柳树、芦竹
    for (let i = 0; i < 26; i++) {
      const a = random() * Math.PI * 2;
      card(LAKE.x + Math.cos(a) * LAKE.rx * 1.12, LAKE.z + Math.sin(a) * LAKE.rz * 1.12, 49 + (i % 2), 7 + random() * 2.5);
    }
    for (let t = 0.04; t < 0.9; t += 0.02) {
      if (random() < 0.45) continue;
      // 沿河找岸：从中线往两侧各退十几米
      const s0 = RSEGSample(t);
      const side = random() < 0.5 ? 1 : -1;
      card(s0[0] + s0[2] * side * (RIVER_HALF + 7 + random() * 6), s0[1] + s0[3] * side * (RIVER_HALF + 7 + random() * 6), random() < 0.6 ? 49 + Math.floor(random() * 2) : 57 + Math.floor(random() * 3), 6 + random() * 3);
    }
    // 沙滩：棕榈
    for (let z = -780; z < -170; z += 22 + random() * 26) {
      const x = coastX(z) - 62 - random() * 26;
      if (free(x, z, 3)) card(x, z, 37 + Math.floor(random() * 3), 7.5 + random() * 2.5);
    }
    // 树的立牌交给笔触收尾去"刷"（alpha 0.9），不描墨线、边缘收紧——这样和会长的树是一种画法，不像贴纸
    group.add(createPlantBatch(shared, plants.tree, treeCards, { alpha: 0.9, cutoff: 0.82 }));
  }
  if (plants?.critter?.length) {
    const names = new Map(plants.critter[0].sprites.map((sp, i) => [sp.name, i]));
    const goods = [];
    for (const g of stallGoods) goods.push({ ...g, sprite: names.get(g.name) });
    // 蔬菜田园：每块菜地种一种菜（白菜、萝卜、番茄、辣椒……），沿着地块的方向一行行排；
    // 手绘的作物在 farm 图集里（tools/pack-extra.py），没有就退回大头菜
    const farmIdx = new Map((plants.farm?.[0]?.sprites ?? []).map((sp, i) => [sp.name, i]));
    const farmCards = [];
    {
      const d = DISTRICTS.find((x) => x.id === 'fields');
      const VEG = [['napa-cabbage', 0.7], ['radish', 0.62], ['tomato', 0.9], ['chilli', 0.75], ['potato', 0.7], ['peanut', 0.55], ['soybean', 0.8], ['sweet-potato', 0.6], ['taro', 0.95], ['garlic', 0.55], ['sugar-beet', 0.6], ['pea', 0.85], ['broad-bean', 0.85], ['tobacco', 1.1]];
      const TALL = [['sunflower', 1.9], ['rapeseed', 1.0], ['maize', 2.0], ['sorghum', 1.9], ['cotton', 1.1], ['sugarcane', 2.2]];
      const U = [0.82, 0.57];
      const V = [-0.57, 0.82];
      for (let x = d.x - 160; x < d.x + 160; x += 1.0) {
        for (let z = d.z - 160; z < d.z + 160; z += 1.0) {
          // 只在行上种：沿地块方向每 1.6 m 一行、行里每 1.2 m 一棵
          const u = x * U[0] + z * U[1];
          const v = x * V[0] + z * V[1];
          if (Math.abs(v / 1.6 - Math.round(v / 1.6)) > 0.32 || Math.abs(u / 1.2 - Math.round(u / 1.2)) > 0.42) continue;
          if (fieldsAt(x, z) < 0.5 || riverAt(x, z).d < RIVER_HALF + 8) continue;
          const p = plotAt(x, z);
          if (p.edge < 0.95) continue;
          let pick = null;
          if (p.kind === 1) pick = VEG[Math.floor(p.id * 9973) % VEG.length];
          else if (p.kind === 0 && p.id < 0.2) pick = TALL[Math.floor(p.id * 7919) % TALL.length];
          if (!pick) continue;
          const name = `plant-${pick[0]}`;
          const idx = farmIdx.get(name);
          const y = heightAt(x, z) - 0.04;
          if (idx != null) farmCards.push({ x: x + (random() - 0.5) * 0.25, z: z + (random() - 0.5) * 0.25, y, h: pick[1] * (0.85 + random() * 0.3), sprite: idx });
          else if (p.kind === 1 && random() < 0.5) goods.push({ x, z, y, h: 0.55, sprite: names.get('turnip') });
        }
      }
      add({ id: 'pick-fields', name: '菜地', kind: 'pick', x: d.x, z: d.z, r: 40, hint: 'E 摘点菜' });
    }
    // 果园：田园小镇北边，一排排结果的树；树下掉了几个果子
    {
      const d = DISTRICTS.find((x) => x.id === 'orchard');
      const KINDS = [['apple', '苹果'], ['pear', '梨'], ['peach', '桃'], ['persimmon', '柿子'], ['mandarin', '橘子'], ['cherry', '樱桃'], ['loquat', '枇杷'], ['pomegranate', '石榴'], ['plum', '李子'], ['jujube', '枣']];
      for (let r = 0; r < 7; r++) {
        const kind = KINDS[(r * 3) % KINDS.length];
        const idx = farmIdx.get(`orchard-${kind[0]}`);
        for (let c = 0; c < 10; c++) {
          const x = d.x - 36 + c * 8 + (r % 2) * 4;
          const z = d.z - 27 + r * 9;
          if (idx == null || riverAt(x, z).d < RIVER_HALF + 6) continue;
          farmCards.push({ x, z, y: heightAt(x, z) - 0.1, h: 4.6 + random() * 1.2, sprite: idx, tree: true });
          claim(x, z, 2.5);
        }
        add({ id: `orchard-${r}`, name: `${kind[1]}树`, kind: 'orchard', fruit: kind[1], x: d.x - 36 + 40, z: d.z - 27 + r * 9, r: 7, hint: `E 摘${kind[1]}` });
      }
      fence(b, d.x - 44, d.z - 34, d.x + 48, d.z - 34, 1.0);
      fence(b, d.x - 44, d.z + 34, d.x + 48, d.z + 34, 1.0);
      banner(b, d.x - 46, d.z, '果园', Math.PI / 2, 4);
    }
    // 作物矮，保留手绘线条和墨线；果树和别的树一样交给笔触去"刷"，不像贴纸
    const crops = farmCards.filter((c) => !c.tree);
    const fruitTrees = farmCards.filter((c) => c.tree);
    if (crops.length) group.add(createPlantBatch(shared, plants.farm, crops, { alpha: 0.16 }));
    if (fruitTrees.length) group.add(createPlantBatch(shared, plants.farm, fruitTrees, { alpha: 0.9, cutoff: 0.82 }));
    group.userData.farmCards = farmCards.length;
    for (const t of trainSpots) goods.push({ ...t, sprite: names.get('train') });
    const still = createPlantBatch(shared, plants.critter, goods, { alpha: 0.16, sway: 0 });
    // （货和车不该随风摆：把相位以外的摆幅关掉——立牌着色器按高度摆，这里把它们的随机角清零即可）
    group.add(still);
    group.userData.goods = goods.length;

    // 1 路公交：一块沿着路线来回开的立牌
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
      const t = 0.03 + random() * 0.9;
      const s0 = RSEGSample(t);
      const off = (random() - 0.5) * 22;
      homes.push({ x: s0[0] + s0[2] * off, z: s0[1] + s0[3] * off, y: riverLevel(t) + 1.0 + random() * 1.6, r: 2 + random() * 5, w: 0.5 + random() * 0.9, p: random() * 6.28 });
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
    const put = (name, x, z, h, { force = false, r = 0.8, y = null } = {}) => {
      const sprite = lifeNames.get(name);
      if (sprite == null) return false;
      if (!force && (!free(x, z, r) || roadEdge(x, z) < 0.4)) return false;
      decor.push({ x, z, y: y ?? heightAt(x, z), h, sprite });
      // 交通工具同时作为可交互的乘坐点：素材仍由 life 图集绘制，交互数据独立于装饰批次。
      if (name.startsWith('transport-')) {
        const labels = {
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
        add({ id: `vehicle-${name}-${Math.round(x)}-${Math.round(z)}`, name: labels[name] ?? '交通工具', kind: 'vehicle', vehicle: name, x, z, r: Math.max(1.8, r + 0.8), hint: 'E 乘坐' });
      }
      if (name === 'infra-stone-lantern') (b.lanterns ??= []).push([x, (y ?? heightAt(x, z)) + h * 0.62, z]);
      claim(x, z, r);
      return true;
    };
    // 家门口
    {
      const [hx, hz] = HOME;
      put('infra-mailbox', hx - 3, hz + 4.4, 1.35, { force: true });
      put('infra-flower-bed', hx + 3.2, hz + 5.0, 0.8, { force: true });
      put('infra-planter-box', hx - 6.6, hz + 4.4, 0.9, { force: true });
      put('transport-city-bicycle', hx + 6.6, hz - 5.5, 1.1, { force: true });
    }
    // 中央广场：一圈花坛、钟、告示板、电话亭、信箱、串灯杆、自行车
    {
      const [px, pz] = PLAZA;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2 + Math.PI / 8;
        put(i % 2 ? 'infra-flower-bed' : 'infra-urn-planter', px + Math.cos(a) * 20.5, pz + Math.sin(a) * 20.5, i % 2 ? 0.85 : 1.3, { force: true });
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.6;
        const x = px + Math.cos(a) * 29;
        const z = pz + Math.sin(a) * 29;
        if (put('infra-festoon-pole', x, z, 4.6, { force: true, r: 0.4 })) festoons.push([x, heightAt(x, z) + 4.3, z]);
      }
      put('infra-street-clock', px + 25, pz - 9, 3.4, { force: true });
      put('infra-notice-board', px - 25, pz + 9, 2.2, { force: true });
      put('infra-phone-booth', px + 14, pz + 25, 2.7, { force: true });
      put('infra-mailbox', px - 16, pz - 24, 1.35, { force: true });
      put('infra-fire-hydrant', px + 31, pz + 3, 0.85, { force: true });
      put('infra-litter-bin', px - 31, pz - 3, 1.0, { force: true });
      put('infra-bike-rack', px + 4, pz - 31, 0.8, { force: true });
      for (let i = 0; i < 3; i++) put('transport-city-bicycle', px + 1.5 + i * 2.4, pz - 32.5, 1.1, { force: true, r: 0.3 });
      put('transport-scooter', px + 10, pz - 32, 1.1, { force: true });
    }
    // 小吃街：两边串灯杆，夜里一路亮着
    {
      const line = [[110, 60], [40, 120], [-30, 160]];
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, az] = line[i];
        const [bx, bz] = line[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / len;
        const nz = (bx - ax) / len;
        for (let d = 36; d < len; d += 16) {
          for (const side of [-1, 1]) {
            const x = ax + ((bx - ax) * d) / len + nx * side * 5.2;
            const z = az + ((bz - az) * d) / len + nz * side * 5.2;
            if (put('infra-festoon-pole', x, z, 4.6, { r: 0.4 })) festoons.push([x, heightAt(x, z) + 4.3, z]);
          }
        }
      }
      const fd = DISTRICTS.find((d) => d.id === 'food');
      put('infra-market-stall', fd.x + 12, fd.z - 8, 2.4);
      put('infra-parasol', fd.x - 10, fd.z + 10, 2.4);
      put('infra-picnic-table', fd.x - 10, fd.z + 10.2, 0.9, { force: true, r: 0.2 });
      put('infra-kiosk', fd.x + 4, fd.z + 16, 2.6);
    }
    // 游乐场：居民区·东边上找一块空地
    for (const [cx, cz] of [[178, 262], [250, 160], [160, 300], [280, 260]]) {
      if (!free(cx, cz, 14) || roadEdge(cx, cz) < 10) continue;
      const pieces = [['infra-swing-set', -6, -4, 2.4], ['infra-slide', 5, -5, 2.4], ['infra-seesaw', -6, 5, 1.0], ['infra-merry-go-round', 4, 4, 1.4], ['infra-sandbox', 0, 9, 0.7], ['infra-rocking-horse', -1, -1, 1.0], ['infra-picnic-table', 10, 2, 0.9], ['infra-gazebo', -11, 2, 4.0]];
      for (const [n, dx, dz, h] of pieces) put(n, cx + dx, cz + dz, h, { force: true, r: 1.2 });
      claim(cx, cz, 14);
      add({ id: 'playground', name: '游乐场', kind: 'play', x: cx, z: cz, r: 10, hint: 'E 荡一会儿秋千' });
      break;
    }
    // 夫子庙：一圈石灯笼
    {
      const t = DISTRICTS.find((d) => d.id === 'temple');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        put('infra-stone-lantern', t.x + Math.cos(a) * 21, t.z + Math.sin(a) * 21, 1.8, { r: 0.6 });
      }
    }
    // 沙滩：一排阳伞，沙上倒扣着小船
    {
      for (let z = -380; z < -200; z += 22) {
        const x = coastX(z) - 34 + Math.sin(z) * 4;
        put('infra-parasol', x, z, 2.5, { r: 1.5 });
      }
      put('transport-rowboat', coastX(-300) - 22, -306, 1.0, { r: 2 });
      put('transport-kayak', coastX(-250) - 24, -246, 0.6, { r: 2 });
      put('transport-canoe', coastX(-340) - 22, -334, 0.7, { r: 2 });
    }
    // 田园小镇：独轮车、板车、牛车、压水井、石井
    {
      const f = DISTRICTS.find((d) => d.id === 'farm');
      put('transport-ox-cart', f.x - 22, f.z + 44, 2.0, { r: 2.5 });
      put('transport-wheelbarrow', f.x + 26, f.z - 14, 0.8);
      put('transport-handcart', f.x - 8, f.z - 30, 1.0);
      put('infra-water-pump', f.x + 6, f.z + 18, 1.3);
      put('infra-stone-well', f.x - 30, f.z - 4, 2.0, { r: 1.4 });
      put('infra-weather-vane', f.x + 18, f.z - 26, 1.4, { force: true, y: heightAt(f.x + 18, f.z - 26) + 7.6 });
      const o = DISTRICTS.find((d) => d.id === 'orchard');
      put('transport-wheelbarrow', o.x + 44, o.z + 6, 0.8);
      put('transport-handcart', o.x + 46, o.z - 12, 1.0);
      const sn = DISTRICTS.find((d) => d.id === 'snowtown');
      put('infra-stone-well', sn.x + 6, sn.z + 4, 2.0, { r: 1.4 });
    }
    // 高铁站前：车棚、售货亭
    {
      const st = interactables.find((i) => i.id === 'station');
      if (st) {
        put('infra-kiosk', st.x + 6, st.z + 14, 2.6);
        put('infra-bike-rack', st.x - 2, st.z + 16, 0.8);
        for (let i = 0; i < 4; i++) put('transport-city-bicycle', st.x - 4 + i * 2.2, st.z + 17.5, 1.1, { force: true, r: 0.3 });
        put('transport-cargo-bike', st.x + 12, st.z + 17, 1.1);
      }
    }
    // 街上：店门口零星的花箱、吊篮
    for (let i = 0; i < 70; i++) {
      const s0 = SEGS[Math.floor(random() * SEGS.length)];
      if (s0.lane) continue;
      const t = random();
      const len = Math.hypot(s0.bx - s0.ax, s0.bz - s0.az) || 1;
      const side = random() < 0.5 ? -1 : 1;
      const x = s0.ax + (s0.bx - s0.ax) * t - ((s0.bz - s0.az) / len) * side * 5.4;
      const z = s0.az + (s0.bz - s0.az) * t + ((s0.bx - s0.ax) / len) * side * 5.4;
      if (cityDistance(x, z) > 360) continue;
      put(pick(random, ['infra-planter-box', 'infra-flower-bed', 'infra-urn-planter', 'infra-litter-bin', 'infra-topiary']), x, z, 0.9 + random() * 0.4, { r: 1.2 });
    }
    group.add(createPlantBatch(shared, plants.life, decor, { alpha: 0.16, sway: 0 }));
    group.userData.decor = decor.length;
  }
  group.userData.festoons = festoons;
  // 灯串：每根串灯杆和最近的一两根相连（广场一圈、小吃街两排）
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

  // 树丛里的小径旁：采花点
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const r = 520 + (i % 3) * 90;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    add({ id: `wild-${i}`, name: '野花丛', kind: 'gather', x, z, r: 9, hint: 'E 采一把野花' });
  }

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
    /** 菜地 [{ id, x, z, y, where }] */
    gardenPlots,
    /** 会亮的东西（glow.js） */
    lights: { lamps: b.lamps ?? [], lanterns: b.lanterns ?? [], festoons, strings, lighthouse: lighthouseLamp },
    stats: { buildings: buildingMeshes.length, houses: painted.length, trees: treePlaces.length, pines: pines.length, rocks: rockPlaces.length, flowers: flowerPlaces.length, crops: gardenPlots.length },
    update(dt, playerPos, camera) {
      if (camera) woods.update(camera);
      pigeons.userData.update(dt, playerPos);
      critters.userData.update(dt, playerPos);
      lake.userData.update(dt);
      bus?.update(dt);
      flies?.update(dt);
    },
  };
}
