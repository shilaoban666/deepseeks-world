// 小鲸鱼的家：四室两厅，按真实尺寸做的。
// 墙高 2.6 m，门洞 0.95 × 2.1 m；没有天花板，从斜上方看进去——
// 靠镜头这一侧的墙只砌到腰（paint.js 的剖面），远处的墙是完整的，窗、画、窗帘都在上面。
// 沙发坐高 0.45、餐桌高 0.75、床垫面高 0.55、灶台高 0.9 —— 全是现实里的数字。
//
// 平面（x 向东，z 向南，米；整间 16 × 12）：
//
//   z=-6 ┌────────┬───────┬──────┬──────┬──────┐
//        │  主卧   │ 次卧   │ 小卧室│ 客房  │ 书房  │
//   z=-1 ├────────┴───────┴──────┴──────┴──────┤
//        │            客厅            │ 厨房 │ 卫生间│
//   z= 2 │                            ├──────┼──────┤
//        │                            │ 餐厅  │ 玄关  │
//   z= 6 └────────────────────────────┴──────┴──────┘
//        x=-8      -3.5     0    3   5.5    8
//
// 大门在东墙上（x=8, z=4），进门站在玄关，不是站在客厅中间。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintMaterial, outlineMaterial } from './paint.js';
import { plain } from './buildings.js';

export const WALL_H = 2.6;
const T = 0.14; // 墙厚
const DOOR_W = 0.95;
const DOOR_H = 2.1;

/** 房间：id、名字、矩形、地板材质 */
const ROOMS = [
  { id: 'living', name: '客厅', x0: -8, z0: -1, x1: -0.5, z1: 6, floor: 'wood#1' },
  { id: 'kitchen', name: '厨房', x0: -0.5, z0: -1, x1: 4, z1: 2, floor: 'stone' },
  { id: 'dining', name: '餐厅', x0: -0.5, z0: 2, x1: 4, z1: 6, floor: 'wood#0' },
  { id: 'bath', name: '卫生间', x0: 4, z0: -1, x1: 8, z1: 2, floor: 'stone' },
  { id: 'entry', name: '玄关', x0: 4, z0: 2, x1: 8, z1: 6, floor: 'stone' },
  { id: 'master', name: '主卧', x0: -8, z0: -6, x1: -3.5, z1: -1, floor: 'wood#0' },
  { id: 'bed2', name: '次卧', x0: -3.5, z0: -6, x1: 0, z1: -1, floor: 'wood#1' },
  { id: 'bed3', name: '小卧室', x0: 0, z0: -6, x1: 3, z1: -1, floor: 'wood#0' },
  { id: 'bed4', name: '客房', x0: 3, z0: -6, x1: 5.5, z1: -1, floor: 'wood#1' },
  { id: 'study', name: '书房', x0: 5.5, z0: -6, x1: 8, z1: -1, floor: 'wood#0' },
];

/** 大门位置（在东墙上），进门站在它里面一点 */
export const FRONT_DOOR = { x: 8, z: 4 };
export const SPAWN = { x: 7.0, z: 4, yaw: -Math.PI / 2 }; // 面朝西（屋里）

const INK = [0.05, 0.06, 0.12];

export function createInterior(shared) {
  const group = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const buckets = new Map();

  const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const CYL = (r, h, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg);

  const put = (geo, key, x, y, z, rotY = 0) => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { geos: [] };
      buckets.set(key, bucket);
    }
    const g = plain(geo);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1)));
    bucket.geos.push(g);
  };

  /** 一件家具的碰撞盒 */
  const block = (x, z, w, d) => colliders.push({ x, z, hw: w / 2, hd: d / 2 });

  // ---- 地板和天花板 ---------------------------------------------------------------------------------------------
  for (const r of ROOMS) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const floor = new THREE.PlaneGeometry(w, d);
    floor.rotateX(-Math.PI / 2);
    put(floor, r.floor, (r.x0 + r.x1) / 2, 0.01, (r.z0 + r.z1) / 2);
  }

  // ---- 墙：一段一段砌，门洞留出来 -------------------------------------------------------------------------------
  /**
   * @param doors [[沿墙起点距离, 门宽], ...]
   */
  const wall = (x1, z1, x2, z2, doors = []) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const dirX = (x2 - x1) / len;
    const dirZ = (z2 - z1) / len;
    const rotY = Math.atan2(x2 - x1, z2 - z1);
    const segs = [];
    let cur = 0;
    for (const [at, w] of doors.slice().sort((a, b) => a[0] - b[0])) {
      if (at > cur) segs.push([cur, at]);
      // 门洞上方过梁
      const midA = at + w / 2;
      put(BOX(T, WALL_H - DOOR_H, w), 'wall', x1 + dirX * midA, DOOR_H + (WALL_H - DOOR_H) / 2, z1 + dirZ * midA, rotY);
      cur = at + w;
    }
    if (cur < len) segs.push([cur, len]);
    for (const [a, b] of segs) {
      if (b - a < 0.02) continue;
      const mid = (a + b) / 2;
      put(BOX(T, WALL_H, b - a), 'wall', x1 + dirX * mid, WALL_H / 2, z1 + dirZ * mid, rotY);
      // 踢脚线
      put(BOX(T + 0.02, 0.1, b - a), 'wood#2', x1 + dirX * mid, 0.05, z1 + dirZ * mid, rotY);
      // 碰撞
      const vertical = Math.abs(x2 - x1) < 0.01;
      colliders.push(vertical ? { x: x1 + dirX * mid, z: z1 + dirZ * mid, hw: T / 2 + 0.02, hd: (b - a) / 2 } : { x: x1 + dirX * mid, z: z1 + dirZ * mid, hw: (b - a) / 2, hd: T / 2 + 0.02 });
    }
  };

  // 外墙
  wall(-8, -6, 8, -6); // 北
  wall(-8, 6, 8, 6); // 南
  wall(-8, -6, -8, 6); // 西
  wall(8, -6, 8, 6, [[4 - 0.475 - -6, DOOR_W]]); // 东（大门在 z=4）
  // 南北向分隔（z=-1 那条，北排房间和南边的墙）
  wall(-8, -1, 8, -1, [
    [-6 - -8 - 0.475, DOOR_W], // 主卧门
    [-2 - -8 - 0.475, DOOR_W], // 次卧门
    [3.8 - -8 - 0.475, DOOR_W], // 客房/玄关门
    [6.6 - -8 - 0.475, DOOR_W], // 书房门
  ]);
  // 北排房间之间
  wall(-3.5, -6, -3.5, -1, [[-3.5 - -6, DOOR_W]]);
  wall(0, -6, 0, -1, [[-3 - -6 - 0.475, DOOR_W]]);
  wall(3, -6, 3, -1, [[-3 - -6 - 0.475, DOOR_W]]);
  wall(5.5, -6, 5.5, -1, [[-3 - -6 - 0.475, DOOR_W]]);
  // 客厅与厨房/餐厅之间（x=-0.5）
  wall(-0.5, -1, -0.5, 6, [[0.7 - -1 - 0.475, DOOR_W], [4 - -1 - 0.475, DOOR_W]]);
  // 厨房与餐厅之间（z=2）
  wall(-0.5, 2, 4, 2, [[1.6 - -0.5 - 0.475, DOOR_W]]);
  // 卫生间与玄关之间（z=2）
  wall(4, 2, 8, 2, [[5.6 - 4 - 0.475, DOOR_W]]);
  // 厨房/餐厅 与 卫生间/玄关 之间（x=4）
  wall(4, -1, 4, 6, [[4 - -1 - 0.475, DOOR_W]]);

  // ---- 客厅：沙发（坐高 0.45）+ 茶几 + 电视（55 寸） + 地毯 + 落地灯 --------------------------------
  {
    const cx = -4.6;
    const cz = 3.2;
    put(BOX(4.2, 0.04, 3.2), 'rug', cx, 0.03, cz);
    // 三人沙发：靠背 + 坐垫 + 两个扶手
    const sofaZ = cz + 1.35;
    put(BOX(2.5, 0.45, 0.95), 'sofa', cx, 0.225, sofaZ);
    put(BOX(2.5, 0.55, 0.22), 'sofa', cx, 0.72, sofaZ + 0.36);
    for (const dx of [-1.36, 1.36]) put(BOX(0.24, 0.62, 0.95), 'sofa', cx + dx, 0.31, sofaZ);
    for (const dx of [-0.62, 0.62]) put(BOX(0.55, 0.12, 0.12), 'cushion', cx + dx, 0.86, sofaZ + 0.22);
    block(cx, sofaZ, 2.75, 1.0);
    // 茶几（高 0.42）
    put(BOX(1.5, 0.06, 0.85), 'table', cx, 0.42, cz);
    for (const [dx, dz] of [[-0.65, -0.34], [0.65, -0.34], [-0.65, 0.34], [0.65, 0.34]]) put(BOX(0.06, 0.42, 0.06), 'table', cx + dx, 0.21, cz + dz);
    block(cx, cz, 1.55, 0.9);
    // 电视柜 + 电视（屏幕 1.24 × 0.72，中心高 1.05）
    const tvZ = cz - 1.9;
    put(BOX(2.0, 0.42, 0.42), 'table', cx, 0.21, tvZ);
    put(BOX(1.32, 0.8, 0.06), 'tvFrame', cx, 1.05, tvZ);
    block(cx, tvZ, 2.05, 0.5);
    // 落地灯、盆栽
    put(CYL(0.03, 1.65, 6), 'metal', cx + 2.6, 0.82, sofaZ);
    put(new THREE.ConeGeometry(0.26, 0.3, 12), 'lampShade', cx + 2.6, 1.78, sofaZ);
    put(CYL(0.22, 0.36, 10), 'pot', cx - 2.9, 0.18, tvZ + 0.4);
    put(new THREE.IcosahedronGeometry(0.34, 0), 'plant', cx - 2.9, 0.72, tvZ + 0.4);
    // 边几
    put(BOX(0.6, 0.5, 0.6), 'table', cx + 2.6, 0.25, cz + 0.2);
    block(cx + 2.6, cz + 0.2, 0.6, 0.6);

    interactables.push({ id: 'i-sofa', name: '沙发', kind: 'sofa', x: cx, z: sofaZ - 0.9, r: 1.9, hint: 'E 坐下', seat: { x: cx, z: sofaZ + 0.05, yaw: Math.PI } });
    interactables.push({ id: 'i-tv', name: '电视', kind: 'tv', x: cx, z: tvZ + 0.9, r: 1.9, hint: 'E 开/关电视' });
  }

  // ---- 餐厅：餐桌（高 0.75）+ 4 把椅子 ------------------------------------------------------------------
  {
    const cx = 1.6;
    const cz = 4.0;
    put(BOX(1.7, 0.06, 0.95), 'table', cx, 0.75, cz);
    for (const [dx, dz] of [[-0.75, -0.38], [0.75, -0.38], [-0.75, 0.38], [0.75, 0.38]]) put(BOX(0.08, 0.75, 0.08), 'table', cx + dx, 0.375, cz + dz);
    block(cx, cz, 1.75, 1.0);
    for (const [dx, dz] of [[-0.45, -0.75], [0.45, -0.75], [-0.45, 0.75], [0.45, 0.75]]) {
      put(BOX(0.44, 0.04, 0.44), 'chair', cx + dx, 0.45, cz + dz);
      put(BOX(0.44, 0.42, 0.04), 'chair', cx + dx, 0.67, cz + dz + (dz > 0 ? 0.2 : -0.2));
      for (const [ox, oz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) put(BOX(0.04, 0.45, 0.04), 'chair', cx + dx + ox, 0.225, cz + dz + oz);
    }
    // 桌上：一碗白米饭 + 筷子
    put(CYL(0.055, 0.06, 12), 'porcelain', cx - 0.3, 0.81, cz);
    put(CYL(0.012, 0.2, 6), 'wood#0', cx + 0.15, 0.78, cz + 0.1, 1.2);
    interactables.push({ id: 'i-dining', name: '餐桌', kind: 'dining', x: cx, z: cz + 1.2, r: 1.7, hint: 'E 坐下吃饭', seat: { x: cx, z: cz + 0.95, yaw: Math.PI } });
  }

  // ---- 厨房：台面高 0.9 的 L 形 + 灶 + 水槽 + 冰箱（1.9 高） ------------------------------------------
  {
    // 北墙一排
    put(BOX(4.2, 0.9, 0.62), 'counter', 1.9, 0.45, -0.65);
    put(BOX(4.25, 0.05, 0.66), 'counterTop', 1.9, 0.925, -0.65);
    block(1.9, -0.65, 4.25, 0.66);
    // 东墙一排
    put(BOX(0.62, 0.9, 2.0), 'counter', 3.65, 0.45, 0.4);
    put(BOX(0.66, 0.05, 2.05), 'counterTop', 3.65, 0.925, 0.4);
    block(3.65, 0.4, 0.66, 2.05);
    // 灶眼（台面上）
    for (const dx of [-0.6, 0, 0.6]) {
      put(CYL(0.11, 0.015, 12), 'stove', 1.0 + dx, 0.955, -0.65);
    }
    // 水槽
    put(BOX(0.6, 0.14, 0.4), 'sink', 2.9, 0.94, -0.65);
    put(CYL(0.016, 0.26, 6), 'metal', 2.9, 1.05, -0.85);
    // 冰箱：1.9 高
    put(BOX(0.7, 1.9, 0.68), 'fridge', 0.35, 0.95, -0.6);
    block(0.35, -0.6, 0.7, 0.68);
    // 吊柜
    put(BOX(1.6, 0.7, 0.34), 'cabinet', 1.9, 1.95, -0.72);
    put(BOX(0.34, 0.7, 1.2), 'cabinet', 3.72, 1.95, 0.2);
    interactables.push({ id: 'i-kitchen', name: '灶台', kind: 'cook', x: 1.6, z: 0.5, r: 1.9, hint: 'E 做饭' });
    interactables.push({ id: 'i-fridge', name: '冰箱', kind: 'fridge', x: 0.6, z: 0.4, r: 1.5, hint: 'E 开冰箱' });
  }

  // ---- 主卧：2.0 × 1.8 的床（垫面 0.55）+ 床头柜 + 衣柜 -------------------------------------------------
  {
    const cx = -5.6;
    const cz = -3.6;
    put(BOX(2.0, 0.32, 1.8), 'bedFrame', cx, 0.16, cz);
    put(BOX(1.94, 0.22, 1.74), 'mattress', cx, 0.43, cz);
    put(BOX(1.9, 0.06, 1.15), 'blanket', cx, 0.57, cz + 0.28);
    put(BOX(0.62, 0.14, 0.36), 'pillow', cx - 0.45, 0.6, cz - 0.66);
    put(BOX(0.62, 0.14, 0.36), 'pillow', cx + 0.45, 0.6, cz - 0.66);
    // 床头背板
    put(BOX(2.05, 0.85, 0.08), 'bedFrame', cx, 0.42, cz - 0.94);
    block(cx, cz, 2.1, 1.9);
    for (const dx of [-1.25, 1.25]) {
      put(BOX(0.42, 0.5, 0.42), 'table', cx + dx, 0.25, cz - 0.62);
      block(cx + dx, cz - 0.62, 0.42, 0.42);
      put(CYL(0.09, 0.22, 8), 'lampShade', cx + dx, 0.61, cz - 0.62);
    }
    // 衣柜 2.0 高
    put(BOX(0.6, 2.0, 1.9), 'wardrobe', -7.6, 1.0, -4.0);
    block(-7.6, -4.0, 0.6, 1.9);
    // 窗（西墙上一块亮色）
    put(BOX(0.06, 1.3, 1.8), 'window', -7.94, 1.65, -3.4);
    interactables.push({ id: 'i-bed', name: '床', kind: 'bed', x: cx + 1.7, z: cz, r: 1.7, hint: 'E 睡觉' });
  }

  // ---- 次卧 / 小卧室 / 客房：各自一张床 -----------------------------------------------------------------
  {
    const beds = [
      { x: -1.75, z: -3.6, w: 1.5, l: 1.95, key: 'bed2' },
      { x: 1.5, z: -3.8, w: 1.2, l: 1.9, key: 'bed3' },
      { x: 4.25, z: -3.8, w: 1.2, l: 1.9, key: 'bed4' },
    ];
    for (const b of beds) {
      put(BOX(b.w, 0.3, b.l), 'bedFrame', b.x, 0.15, b.z);
      put(BOX(b.w - 0.06, 0.2, b.l - 0.06), 'mattress', b.x, 0.4, b.z);
      put(BOX(b.w - 0.1, 0.05, b.l * 0.62), 'blanket', b.x, 0.53, b.z + b.l * 0.16);
      put(BOX(Math.min(0.5, b.w - 0.3), 0.12, 0.32), 'pillow', b.x, 0.55, b.z - b.l / 2 + 0.26);
      block(b.x, b.z, b.w, b.l);
    }
    // 次卧衣柜
    put(BOX(0.55, 1.9, 1.4), 'wardrobe', -3.2, 0.95, -5.0);
    block(-3.2, -5.0, 0.55, 1.4);
    interactables.push({ id: 'i-bed2', name: '次卧的床', kind: 'bed', x: -1.75, z: -2.4, r: 1.5, hint: 'E 睡觉' });
    interactables.push({ id: 'i-bed3', name: '小卧室的床', kind: 'bed', x: 1.5, z: -2.6, r: 1.4, hint: 'E 睡觉' });
    interactables.push({ id: 'i-bed4', name: '客房的床', kind: 'bed', x: 4.25, z: -2.6, r: 1.4, hint: 'E 睡觉' });
  }

  // ---- 书房：书桌 1.6 × 0.8（高 0.75）+ 书架 ------------------------------------------------------------
  {
    const cx = 6.8;
    const cz = -3.2;
    put(BOX(0.8, 0.05, 1.6), 'table', cx, 0.75, cz);
    for (const [dx, dz] of [[-0.34, -0.72], [0.34, -0.72], [-0.34, 0.72], [0.34, 0.72]]) put(BOX(0.06, 0.75, 0.06), 'table', cx + dx, 0.375, cz + dz);
    block(cx, cz, 0.85, 1.65);
    // 椅子
    put(BOX(0.44, 0.04, 0.44), 'chair', cx - 0.68, 0.45, cz);
    put(BOX(0.04, 0.42, 0.44), 'chair', cx - 0.88, 0.67, cz);
    block(cx - 0.68, cz, 0.5, 0.5);
    // 书架 2.0 高
    put(BOX(0.38, 2.0, 1.6), 'shelf', 7.75, 1.0, cz);
    block(7.75, cz, 0.38, 1.6);
    for (let i = 0; i < 4; i++) put(BOX(0.3, 0.04, 1.5), 'shelf', 7.75, 0.42 + i * 0.48, cz);
    for (let i = 0; i < 9; i++) put(BOX(0.2, 0.3, 0.05), ['book1', 'book2', 'book3'][i % 3], 7.7, 0.6 + Math.floor(i / 5) * 0.48, cz - 0.62 + (i % 5) * 0.28);
    // 台灯 + 纸
    put(CYL(0.07, 0.02, 8), 'metal', cx, 0.78, cz - 0.5);
    put(CYL(0.012, 0.3, 6), 'metal', cx, 0.93, cz - 0.5);
    put(BOX(0.18, 0.14, 0.24), 'lampShade', cx, 1.06, cz - 0.5);
    put(BOX(0.3, 0.005, 0.4), 'paper', cx + 0.1, 0.78, cz + 0.3);
    interactables.push({ id: 'i-desk', name: '书桌', kind: 'desk', x: cx - 1.2, z: cz, r: 1.6, hint: 'E 坐下看书', seat: { x: cx - 0.72, z: cz, yaw: Math.PI / 2 } });
  }

  // ---- 卫生间：马桶 + 洗手台 + 浴缸（1.7 × 0.8）-------------------------------------------------------
  {
    put(BOX(0.4, 0.4, 0.6), 'porcelain', 7.2, 0.2, 0.2);
    put(BOX(0.42, 0.5, 0.2), 'porcelain', 7.2, 0.65, -0.2);
    block(7.2, 0.2, 0.42, 0.62);
    put(BOX(0.9, 0.08, 0.5), 'porcelain', 5.2, 0.85, -0.4);
    put(BOX(0.86, 0.8, 0.46), 'counter', 5.2, 0.4, -0.4);
    block(5.2, -0.4, 0.9, 0.5);
    put(BOX(0.7, 0.9, 0.05), 'mirror', 5.2, 1.55, -0.69);
    // 浴缸
    put(BOX(0.8, 0.55, 1.7), 'porcelain', 7.4, 0.275, 1.2);
    put(BOX(0.66, 0.44, 1.56), 'water', 7.4, 0.4, 1.2);
    block(7.4, 1.2, 0.8, 1.7);
    interactables.push({ id: 'i-bath', name: '浴缸', kind: 'bath', x: 6.4, z: 1.2, r: 1.5, hint: 'E 泡个澡' });
  }

  // ---- 玄关：鞋柜 + 挂衣钩 ------------------------------------------------------------------------------
  {
    put(BOX(1.2, 0.9, 0.34), 'cabinet', 7.3, 0.45, 2.6);
    block(7.3, 2.6, 1.2, 0.34);
    put(BOX(0.05, 1.1, 0.4), 'wood#2', 7.9, 1.55, 4.9);
    put(BOX(1.6, 0.02, 0.9), 'rug', 6.6, 0.02, 4.1);
    interactables.push({ id: 'i-exit', name: '大门', kind: 'exit', x: 7.6, z: 4, r: 1.0, hint: 'E 出门' });
  }

  // ---- 屋外：房子坐在一块深色的底上（看起来像摆在桌上的模型） ----------------------------------------
  {
    const out = new THREE.PlaneGeometry(60, 60);
    out.rotateX(-Math.PI / 2);
    put(out, 'outside', 0, -0.03, 0);
    // 外墙脚下一圈石基
    put(BOX(16.5, 0.2, 12.5), 'stone', 0, -0.12, 0);
  }

  // ---- 窗、窗帘、画：让墙有话说 -------------------------------------------------------------------------
  {
    /** 一扇窗：玻璃 + 木框 + 窗台 + 两片窗帘。axis 'x'：墙沿 x 方向（北/南墙）；'z'：沿 z（东/西墙） */
    const windowAt = (x, z, axis, w = 1.4, curtain = 'curtainA', inward = 1) => {
      const onX = axis === 'x';
      const sx = onX ? w : 0.06;
      const sz = onX ? 0.06 : w;
      const ox = onX ? 0 : inward * 0.08;
      const oz = onX ? inward * 0.08 : 0;
      put(BOX(sx, 1.15, sz), 'window', x + ox, 1.6, z + oz);
      put(BOX(onX ? w + 0.16 : 0.07, 0.08, onX ? 0.07 : w + 0.16), 'frame', x + ox * 1.2, 2.2, z + oz * 1.2);
      put(BOX(onX ? w + 0.16 : 0.07, 0.08, onX ? 0.07 : w + 0.16), 'frame', x + ox * 1.2, 1.0, z + oz * 1.2);
      put(BOX(onX ? 0.06 : 0.07, 1.2, onX ? 0.07 : 0.06), 'frame', x + ox * 1.2, 1.6, z + oz * 1.2);
      put(BOX(onX ? w + 0.3 : 0.2, 0.05, onX ? 0.2 : w + 0.3), 'frame', x + ox * 2.2, 0.98, z + oz * 2.2);
      for (const side of [-1, 1]) {
        const cx = onX ? x + side * (w / 2 + 0.06) : x + ox * 2;
        const cz = onX ? z + oz * 2 : z + side * (w / 2 + 0.06);
        put(BOX(onX ? 0.34 : 0.07, 1.42, onX ? 0.07 : 0.34), curtain, cx, 1.58, cz);
      }
      put(BOX(onX ? w + 0.9 : 0.05, 0.05, onX ? 0.05 : w + 0.9), 'metal', x + ox * 2.4, 2.32, z + oz * 2.4);
    };
    // 北墙：五间卧室/书房各一扇
    windowAt(-5.75, -6, 'x', 1.6, 'curtainA');
    windowAt(-1.75, -6, 'x', 1.4, 'curtainB');
    windowAt(1.5, -6, 'x', 1.2, 'curtainC');
    windowAt(4.25, -6, 'x', 1.2, 'curtainB');
    windowAt(6.75, -6, 'x', 1.2, 'curtainA');
    // 西墙：客厅的大窗；东墙：卫生间的小窗
    windowAt(-8, 2.6, 'z', 2.2, 'curtainC');
    windowAt(8, 0.4, 'z', 0.8, 'curtainB', -1);
    // 南墙：客厅和餐厅（镜头在南边的时候这面墙是剖开的，转过去才看得到）
    windowAt(-4.6, 6, 'x', 2.0, 'curtainA', -1);
    windowAt(1.6, 6, 'x', 1.4, 'curtainC', -1);

    /** 一幅画：木框 + 画心（三种颜色的小风景） */
    const picture = (x, z, axis, key, w = 0.7, h = 0.5, y = 1.7) => {
      const onX = axis === 'x';
      put(BOX(onX ? w + 0.1 : 0.04, h + 0.1, onX ? 0.04 : w + 0.1), 'frame', x, y, z);
      put(BOX(onX ? w : 0.05, h, onX ? 0.05 : w), key, x + (onX ? 0 : Math.sign(-x) * 0.01), y, z + (onX ? Math.sign(-z || 1) * 0.01 : 0));
    };
    picture(-2.6, -0.9, 'x', 'art1', 0.9, 0.6); // 客厅北墙（电视边）
    picture(-6.6, -0.9, 'x', 'art2', 0.6, 0.8);
    picture(-7.9, -2.0, 'z', 'art3', 0.7, 0.5); // 主卧
    picture(2.2, -5.9, 'x', 'art2', 0.4, 0.5, 1.9);
    picture(3.9, 4.0, 'z', 'art1', 0.8, 0.55); // 餐厅东墙
    picture(6.0, 5.9, 'x', 'art3', 0.6, 0.45); // 玄关

    // 地毯：卧室床边、书房、餐桌下
    put(BOX(1.3, 0.03, 2.0), 'rugB', -4.1, 0.025, -3.4);
    put(BOX(1.0, 0.03, 1.5), 'rugC', -0.6, 0.025, -3.3);
    put(BOX(1.4, 0.03, 0.9), 'rugB', 1.5, 0.025, -2.0);
    put(BOX(1.4, 0.03, 0.9), 'rugC', 4.25, 0.025, -2.0);
    put(BOX(1.3, 0.03, 2.2), 'rug', 6.2, 0.025, -3.2);
    put(BOX(2.6, 0.03, 1.9), 'rugB', 1.6, 0.025, 4.0);
    put(CYL(0.5, 0.03, 20), 'rugC', 5.6, 0.025, 0.9);

    // 绿植：大叶的一盆、小的几盆
    const plantAt = (x, z, s = 1) => {
      put(CYL(0.2 * s, 0.34 * s, 10), 'pot', x, 0.17 * s, z);
      put(new THREE.IcosahedronGeometry(0.3 * s, 0), 'plant', x, 0.62 * s, z);
      put(new THREE.IcosahedronGeometry(0.22 * s, 0), 'plant2', x + 0.14 * s, 0.86 * s, z - 0.08 * s);
      put(new THREE.IcosahedronGeometry(0.18 * s, 0), 'plant', x - 0.16 * s, 0.9 * s, z + 0.1 * s);
    };
    plantAt(-7.4, 5.4, 1.3);
    plantAt(-1.1, 5.4, 1.0);
    plantAt(3.5, 5.5, 0.9);
    plantAt(-0.4 + 0.5, -5.5, 0.8);
    plantAt(7.5, 5.4, 1.0);
    plantAt(-7.5, -1.5, 0.8);

    // 客厅：靠北墙一排矮书柜，上面摆着小东西
    put(BOX(2.2, 0.8, 0.36), 'shelf', -6.3, 0.4, -0.72);
    block(-6.3, -0.72, 2.2, 0.36);
    for (let i = 0; i < 7; i++) put(BOX(0.07, 0.26, 0.2), ['book1', 'book2', 'book3'][i % 3], -7.2 + i * 0.1, 0.94, -0.72);
    put(CYL(0.09, 0.2, 10), 'porcelain', -5.6, 0.9, -0.72);
    put(new THREE.IcosahedronGeometry(0.12, 0), 'plant2', -5.6, 1.08, -0.72);
    // 沙发上的毯子、茶几上的茶杯
    put(BOX(0.7, 0.05, 0.8), 'curtainC', -5.3, 0.48, 4.55);
    put(CYL(0.04, 0.07, 10), 'porcelain', -4.3, 0.49, 3.1);
    put(CYL(0.04, 0.07, 10), 'porcelain', -4.8, 0.49, 3.35);
    put(BOX(0.3, 0.03, 0.22), 'book2', -4.9, 0.47, 3.0);

    // 厨房：抽油烟机、锅、案板上的菜
    put(BOX(0.9, 0.3, 0.5), 'metal', 1.0, 1.75, -0.7);
    put(CYL(0.13, 0.1, 12), 'stove', 1.0, 1.0, -0.65);
    put(CYL(0.1, 0.12, 12), 'pot', 0.4, 1.02, -0.65);
    put(BOX(0.36, 0.03, 0.24), 'table', 2.1, 0.965, -0.62);
    put(new THREE.IcosahedronGeometry(0.06, 0), 'book1', 2.05, 1.02, -0.62);
    put(new THREE.IcosahedronGeometry(0.07, 0), 'plant2', 2.2, 1.03, -0.6);
    // 餐桌：四只碗、一盘菜、桌旗
    put(BOX(1.3, 0.01, 0.3), 'curtainA', 1.6, 0.785, 4.0);
    for (const [dx, dz] of [[-0.45, -0.28], [0.45, -0.28], [-0.45, 0.28], [0.45, 0.28]]) put(CYL(0.06, 0.05, 12), 'porcelain', 1.6 + dx, 0.81, 4.0 + dz);
    put(CYL(0.13, 0.03, 14), 'porcelain', 1.6, 0.8, 4.0);
    put(new THREE.IcosahedronGeometry(0.08, 0), 'plant2', 1.6, 0.86, 4.0);

    // 卫生间：墙上一条瓷砖腰线、浴帘杆、毛巾
    put(BOX(3.9, 0.9, 0.03), 'tile', 6.0, 0.45, -0.91);
    put(BOX(0.03, 0.9, 2.9), 'tile', 7.91, 0.45, 0.5);
    put(BOX(0.5, 0.6, 0.04), 'curtainB', 6.3, 1.2, -0.9);
    // 书房：桌上一台屏幕（小鲸鱼上网的地方）、一摞书
    put(BOX(0.05, 0.36, 0.6), 'tvFrame', 7.05, 1.0, -3.2);
    put(BOX(0.02, 0.3, 0.52), 'screen', 7.02, 1.0, -3.2);
    put(BOX(0.2, 0.03, 0.4), 'tvFrame', 6.72, 0.78, -3.2);
    put(BOX(0.22, 0.12, 0.3), 'book3', 6.75, 0.83, -2.6);
    // 玄关：鞋、伞桶
    put(BOX(0.24, 0.1, 0.1), 'book1', 6.3, 0.05, 3.3);
    put(BOX(0.24, 0.1, 0.1), 'book2', 6.3, 0.05, 3.5);
    put(CYL(0.14, 0.5, 10), 'pot', 7.6, 0.25, 5.5);
    // 每间卧室一盏床头的暖光
    for (const [x, z] of [[-1.0, -5.4], [2.3, -5.5], [5.0, -5.5]]) {
      put(BOX(0.36, 0.45, 0.36), 'table', x, 0.225, z);
      put(CYL(0.08, 0.2, 8), 'lampShade', x, 0.56, z);
    }
  }

  // ---- 电视屏幕（单独一块，画面是 Canvas 画的） ---------------------------------------------------------
  const tv = createTvScreen(shared);
  tv.mesh.position.set(-4.6, 1.05, 3.2 - 1.9 + 0.05);
  group.add(tv.mesh);

  // ---- 合并 -------------------------------------------------------------------------------------------
  const PAL = {
    wall: { lit: [0.97, 0.93, 0.84], shade: [0.78, 0.72, 0.68], kind: 'wall', stain: 0.12 },
    ceiling: { lit: [0.97, 0.96, 0.94], shade: [0.62, 0.66, 0.74], kind: 'flat' },
    'wood#0': { lit: [0.7, 0.52, 0.34], shade: [0.44, 0.33, 0.24], kind: 'wood', rows: 8 },
    'wood#1': { lit: [0.78, 0.6, 0.4], shade: [0.5, 0.38, 0.28], kind: 'wood', rows: 8 },
    'wood#2': { lit: [0.4, 0.29, 0.19], shade: [0.2, 0.15, 0.13], kind: 'wood', rows: 5 },
    stone: { lit: [0.84, 0.82, 0.76], shade: [0.56, 0.56, 0.56], kind: 'stone' },
    rug: { lit: [0.66, 0.34, 0.3], shade: [0.32, 0.18, 0.2], kind: 'flat' },
    sofa: { lit: [0.38, 0.56, 0.6], shade: [0.22, 0.34, 0.42], kind: 'flat' },
    cushion: { lit: [0.88, 0.76, 0.5], shade: [0.46, 0.4, 0.28], kind: 'flat' },
    table: { lit: [0.66, 0.47, 0.3], shade: [0.3, 0.22, 0.17], kind: 'flat' },
    chair: { lit: [0.55, 0.4, 0.26], shade: [0.28, 0.21, 0.17], kind: 'flat' },
    tvFrame: { lit: [0.12, 0.12, 0.14], shade: [0.06, 0.06, 0.08], kind: 'flat' },
    cabinet: { lit: [0.72, 0.56, 0.38], shade: [0.34, 0.26, 0.2], kind: 'flat' },
    counter: { lit: [0.8, 0.77, 0.7], shade: [0.4, 0.43, 0.48], kind: 'wall', stain: 0.18 },
    counterTop: { lit: [0.28, 0.3, 0.34], shade: [0.14, 0.15, 0.18], kind: 'stone' },
    stove: { lit: [0.16, 0.16, 0.18], shade: [0.08, 0.08, 0.1], kind: 'flat' },
    sink: { lit: [0.8, 0.82, 0.84], shade: [0.42, 0.45, 0.5], kind: 'glass' },
    fridge: { lit: [0.87, 0.89, 0.9], shade: [0.45, 0.49, 0.55], kind: 'flat' },
    metal: { lit: [0.5, 0.5, 0.52], shade: [0.24, 0.25, 0.28], kind: 'flat' },
    lampShade: { lit: [0.95, 0.85, 0.6], shade: [0.5, 0.44, 0.34], kind: 'flat' },
    pot: { lit: [0.66, 0.4, 0.28], shade: [0.32, 0.2, 0.16], kind: 'flat' },
    plant: { lit: [0.28, 0.52, 0.24], shade: [0.11, 0.26, 0.15], kind: 'flat' },
    bedFrame: { lit: [0.48, 0.34, 0.22], shade: [0.24, 0.18, 0.14], kind: 'flat' },
    mattress: { lit: [0.93, 0.92, 0.9], shade: [0.54, 0.57, 0.63], kind: 'flat' },
    blanket: { lit: [0.52, 0.68, 0.84], shade: [0.3, 0.42, 0.6], kind: 'flat' },
    pillow: { lit: [0.97, 0.96, 0.94], shade: [0.58, 0.6, 0.66], kind: 'flat' },
    wardrobe: { lit: [0.6, 0.45, 0.3], shade: [0.3, 0.23, 0.17], kind: 'flat' },
    shelf: { lit: [0.52, 0.38, 0.26], shade: [0.26, 0.2, 0.16], kind: 'flat' },
    book1: { lit: [0.78, 0.3, 0.26], shade: [0.4, 0.15, 0.15], kind: 'flat' },
    book2: { lit: [0.28, 0.48, 0.68], shade: [0.14, 0.26, 0.38], kind: 'flat' },
    book3: { lit: [0.84, 0.74, 0.44], shade: [0.44, 0.38, 0.22], kind: 'flat' },
    paper: { lit: [0.96, 0.95, 0.9], shade: [0.6, 0.62, 0.68], kind: 'flat' },
    porcelain: { lit: [0.96, 0.97, 0.97], shade: [0.55, 0.6, 0.68], kind: 'flat' },
    water: { lit: [0.42, 0.66, 0.78], shade: [0.2, 0.34, 0.46], kind: 'glass' },
    mirror: { lit: [0.8, 0.86, 0.9], shade: [0.44, 0.5, 0.58], kind: 'glass' },
    window: { lit: [0.62, 0.84, 1.0], shade: [0.5, 0.7, 0.9], kind: 'flat' },
    outside: { lit: [0.13, 0.15, 0.17], shade: [0.13, 0.15, 0.17], kind: 'flat' },
    frame: { lit: [0.36, 0.25, 0.17], shade: [0.2, 0.15, 0.12], kind: 'flat' },
    curtainA: { lit: [0.86, 0.5, 0.44], shade: [0.56, 0.3, 0.3], kind: 'flat' },
    curtainB: { lit: [0.5, 0.68, 0.74], shade: [0.3, 0.42, 0.52], kind: 'flat' },
    curtainC: { lit: [0.92, 0.8, 0.5], shade: [0.62, 0.52, 0.34], kind: 'flat' },
    rugB: { lit: [0.4, 0.56, 0.6], shade: [0.24, 0.34, 0.42], kind: 'flat' },
    rugC: { lit: [0.9, 0.78, 0.56], shade: [0.6, 0.5, 0.38], kind: 'flat' },
    plant2: { lit: [0.44, 0.66, 0.26], shade: [0.2, 0.36, 0.16], kind: 'flat' },
    art1: { lit: [0.5, 0.7, 0.86], shade: [0.34, 0.5, 0.66], kind: 'flat' },
    art2: { lit: [0.92, 0.72, 0.4], shade: [0.66, 0.5, 0.3], kind: 'flat' },
    art3: { lit: [0.5, 0.72, 0.46], shade: [0.34, 0.5, 0.34], kind: 'flat' },
    tile: { lit: [0.74, 0.86, 0.88], shade: [0.46, 0.58, 0.64], kind: 'stone' },
    screen: { lit: [0.5, 0.8, 1.0], shade: [0.5, 0.8, 1.0], kind: 'flat' },
  };
  // 挂在墙上的东西跟着墙一起剖
  const CUT = new Set(['wall', 'window', 'frame', 'curtainA', 'curtainB', 'curtainC', 'art1', 'art2', 'art3', 'metal', 'cabinet', 'mirror', 'tile']);
  const meshes = [];
  for (const [key, bucket] of buckets) {
    const geo = mergeGeometries(bucket.geos, false);
    if (!geo) continue;
    geo.computeBoundingSphere();
    const pal = PAL[key] ?? { lit: [0.8, 0.8, 0.8], shade: [0.4, 0.4, 0.4], kind: 'flat' };
    const cut = CUT.has(key);
    group.add(new THREE.Mesh(geo, paintMaterial(shared, { ...pal, indoor: true, cut, side: key === 'wall' ? THREE.DoubleSide : THREE.FrontSide })));
    if (key === 'outside') continue;
    const ink = new THREE.Mesh(geo, outlineMaterial(shared, INK, 0.018, { cut, indoor: true }));
    ink.renderOrder = -1;
    group.add(ink);
    meshes.push(geo);
    for (const g of bucket.geos) g.dispose();
  }

  return {
    group,
    colliders,
    interactables,
    rooms: ROOMS,
    spawn: SPAWN,
    frontDoor: FRONT_DOOR,
    tv,
    groundAt: () => 0,
    ceiling: WALL_H,
    update(dt) {
      tv.update(dt);
    },
  };
}

// ---- 电视：一块自己会动的画 --------------------------------------------------------------------------------------
function createTvScreen(shared) {
  const W = 256;
  const H = 148;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  let on = false;
  let t = 0;
  let acc = 0;

  const paint = () => {
    if (!on) {
      g.fillStyle = '#0a0f16';
      g.fillRect(0, 0, W, H);
      return;
    }
    // 一幅很小的手绘风景：远山、云、草地，云会飘
    const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
    sky.addColorStop(0, '#8fc4e6');
    sky.addColorStop(1, '#dcecf2');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // 山
    g.fillStyle = '#7f93a8';
    g.beginPath();
    g.moveTo(0, H * 0.62);
    for (let x = 0; x <= W; x += 16) g.lineTo(x, H * 0.62 - 18 - Math.sin(x * 0.03 + 1.3) * 14 - Math.sin(x * 0.011) * 8);
    g.lineTo(W, H * 0.62);
    g.fill();
    // 草
    g.fillStyle = '#6fa85a';
    g.fillRect(0, H * 0.62, W, H * 0.38);
    g.fillStyle = '#7ab863';
    for (let i = 0; i < 24; i++) {
      const x = (i * 37 + t * 2) % W;
      g.fillRect(x, H * 0.64 + (i % 3) * 8, 3, H * 0.3);
    }
    // 云
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 90 + t * 6) % (W + 60)) - 30;
      const cy = 26 + i * 18;
      g.fillStyle = 'rgba(255,255,255,0.95)';
      for (const [dx, dy, r] of [[0, 0, 13], [11, 3, 10], [-11, 3, 9], [4, -6, 8]]) {
        g.beginPath();
        g.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
    // 字幕条
    g.fillStyle = 'rgba(20,30,40,0.55)';
    g.fillRect(0, H - 18, W, 18);
    g.fillStyle = '#f6efdf';
    g.font = '11px "Microsoft YaHei",sans-serif';
    g.fillText('《山谷的四季》 第 3 集 · 云的画法', 6, H - 5);
  };
  paint();

  const material = new THREE.MeshBasicMaterial({ map: tex });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.72), material);

  return {
    mesh,
    get on() {
      return on;
    },
    set(onOff) {
      on = onOff;
      paint();
      tex.needsUpdate = true;
    },
    update(dt) {
      if (!on) return;
      t += dt;
      acc += dt;
      if (acc > 0.1) {
        acc = 0;
        paint();
        tex.needsUpdate = true;
      }
    },
  };
}