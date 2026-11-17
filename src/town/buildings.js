// 城市的建筑：一个函数长出一种房子，全部按材质合并成几十个 mesh 再交给显卡。
// 画法沿用原作：平涂两阶色 + 倒壳墨线 + shader 里长的瓦行和墙渍。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintMaterial, outlineMaterial, signMaterial, signTexture } from './paint.js';
import { heightAt } from './plan.js';

// 吉卜力的配色：奶油墙、赭红瓦、青灰石板、木头的暖褐。
export const PALETTE = {
  wall: [
    [0.94, 0.9, 0.8],
    [0.97, 0.93, 0.85],
    [0.9, 0.86, 0.76],
    [0.95, 0.87, 0.74],
    [0.88, 0.9, 0.86],
    [0.96, 0.91, 0.82],
  ],
  roof: [
    [0.64, 0.24, 0.18],
    [0.72, 0.3, 0.2],
    [0.34, 0.36, 0.44],
    [0.28, 0.3, 0.38],
    [0.46, 0.42, 0.34],
    [0.6, 0.28, 0.22],
  ],
  wood: [
    [0.42, 0.28, 0.17],
    [0.5, 0.34, 0.2],
    [0.34, 0.24, 0.16],
  ],
  stone: [
    [0.66, 0.64, 0.6],
    [0.56, 0.56, 0.56],
    [0.74, 0.7, 0.62],
  ],
  // 窗玻璃：映着天的蓝
  glass: [[0.22, 0.36, 0.5]],
  // 布：棚子、遮阳篷、旗（朱红 / 青 / 芥黄 / 米白 / 靛蓝）
  cloth: [
    [0.82, 0.26, 0.2],
    [0.2, 0.52, 0.5],
    [0.9, 0.68, 0.22],
    [0.96, 0.93, 0.84],
    [0.24, 0.32, 0.56],
  ],
  // 花和叶：窗台花箱、摊上的菜
  leaf: [
    [0.26, 0.52, 0.2],
    [0.4, 0.62, 0.22],
  ],
  flower: [
    [0.95, 0.42, 0.5],
    [0.98, 0.82, 0.3],
    [0.96, 0.95, 0.9],
    [0.9, 0.3, 0.24],
    [0.62, 0.5, 0.9],
  ],
  // 灯罩里的光、铁
  glow: [[1.6, 1.25, 0.7]],
  iron: [[0.16, 0.18, 0.22]],
};

const SHADE = 0.62; // 背光色 = 受光色 × 这个（在冷色环境光下再压）

/**
 * 合并几何体时，索引属性必须一律有或一律没有。Box/Cylinder 是带索引的，Icosahedron/Extrude
 * 不带——所以先统一去掉索引。
 */
export function plain(geo) {
  return geo.index ? geo.toNonIndexed() : geo.clone();
}

/** 一个攒几何体的盒子：先把所有建筑的形体攒起来，最后按材质合并。 */
export class Builder {
  constructor(shared) {
    this.shared = shared;
    this.groups = new Map(); // key -> { kind, lit, shade, rows, stain, geos: [] }
    this.signs = []; // { texture, matrix }
    this.colliders = []; // { x, z, hw, hd, top } 轴对齐的碰撞盒
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
  }

  /** 取/建一个材质桶。 */
  bucket(key, { kind, lit, shade, rows = 12, stain = 0.5 }) {
    let b = this.groups.get(key);
    if (!b) {
      b = { kind, lit, shade, rows, stain, geos: [] };
      this.groups.set(key, b);
    }
    return b;
  }

  /**
   * 加一块几何体。
   * @param geo 已 translate 到局部原点的几何体（会被克隆）
   * @param key 材质名，见 PALETTE
   * @param pos 世界位置 [x,y,z]
   * @param rotY 绕 Y 转多少弧度
   */
  add(geo, key, pos, rotY = 0, tint = 0) {
    const [family, index = 0] = key.split('#');
    const pal = PALETTE[family] ?? PALETTE.stone;
    const lit = pal[Math.abs(Number(index) || 0) % pal.length];
    const kind = family === 'wall' ? 'wall' : family === 'roof' ? 'roof' : family === 'wood' ? 'wood' : family === 'stone' ? 'stone' : family === 'glass' ? 'glass' : family === 'glow' ? 'glow' : 'flat';
    const rows = family === 'roof' ? 14 : family === 'wood' ? 8 : 12;
    const bucket = this.bucket(`${family}#${index}`, { kind, lit, shade: lit.map((c) => c * SHADE), rows, stain: family === 'wall' ? 0.55 : 0.2 });
    const clone = plain(geo);
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    this._m.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), this._q, new THREE.Vector3(1, 1, 1));
    clone.applyMatrix4(this._m);
    bucket.geos.push(clone);
  }

  /** 加一块招牌（分开画，因为每块的文字不同）。 */
  addSign(text, pos, rotY, { w = 3.2, h = 0.8, bg = '#22304a', fg = '#f6f0e2', vertical = false } = {}) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    m.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), q, new THREE.Vector3(w, h, 1));
    this.signs.push({ texture: signTexture(text, vertical ? { bg, fg, vertical, w: 160, h: 400 } : { bg, fg }), matrix: m });
  }

  /** 登记一个碰撞盒（建筑占地）。 */
  collide(x, z, hw, hd, top = 20) {
    this.colliders.push({ x, z, hw, hd, top });
  }

  /** 合并、出 mesh，加进 group。 */
  build(group) {
    const meshes = [];
    for (const [key, b] of this.groups) {
      if (!b.geos.length) continue;
      const geo = mergeGeometries(b.geos, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mat = paintMaterial(this.shared, { lit: b.lit, shade: b.shade, kind: b.kind, rows: b.rows, stain: b.stain });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      meshes.push(mesh);
      // 描边：同一份几何体的倒壳
      const ink = new THREE.Mesh(geo, outlineMaterial(this.shared, [0.04, 0.05, 0.11], b.kind === 'roof' ? 0.07 : 0.05));
      ink.matrixAutoUpdate = false;
      group.add(ink);
      meshes.push(ink);
      for (const g of b.geos) g.dispose();
    }
    // 招牌：同一张字的合成一个 mesh（店招有上百块，一块一个 draw call 太贵）
    const byTexture = new Map();
    for (const s of this.signs) {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.applyMatrix4(s.matrix);
      if (!byTexture.has(s.texture)) byTexture.set(s.texture, []);
      byTexture.get(s.texture).push(geo);
    }
    for (const [texture, geos] of byTexture) {
      const geo = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, signMaterial(this.shared, texture));
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}

// ---- 零件 ------------------------------------------------------------------------------------------------------
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** 人字屋顶：三角截面沿 z 挤出来。 */
function gableRoof(w, d, h) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -d / 2);
  return geo;
}

/** 四坡屋顶：两个截头金字塔叠起来，近看有转折。 */
function hipRoof(w, d, h) {
  const geo = new THREE.CylinderGeometry(0.06, Math.SQRT1_2, h, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.scale(w, 1, d);
  return geo;
}

function cylinder(r, h, seg = 10) {
  return new THREE.CylinderGeometry(r, r, h, seg);
}

// ---- 房子 ------------------------------------------------------------------------------------------------------
/**
 * 一栋普通的房子：一层墙 + 人字瓦顶 + 烟囱 + 窗 + 门。
 * @param b Builder
 * @param o.x o.z 位置，o.rotY 朝向，o.w o.d 占地，o.h 墙高，o.wall/o.roof 调色板序号
 */
export function house(b, o) {
  const { x, z, rotY = 0, w = 8, d = 7, h = 4.2, wall = 0, roof = 0, chimney = true, floors = 1, sign = null } = o;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx, ly, lz) => [x + lx * cos + lz * sin, (o.y ?? heightAt(x, z)) + ly, z - lx * sin + lz * cos];

  const wallKey = `wall#${wall}`;
  const hh = h * floors;
  b.add(box(w, hh, d), wallKey, at(0, hh / 2, 0));
  // 檐口一圈薄板
  b.add(box(w + 0.5, 0.26, d + 0.5), `wood#1`, at(0, hh + 0.1, 0));
  // 屋顶
  const rh = Math.min(w, d) * 0.42;
  b.add(gableRoof(w + 1.1, d + 1.1, rh), `roof#${roof}`, at(0, hh + 0.22, 0), rotY);
  if (chimney) b.add(box(0.8, 1.5, 0.8), `stone#0`, at(w * 0.28, hh + rh * 0.7, -d * 0.22));

  // 门 + 窗（在朝街那一面，局部 +z）
  b.add(box(1.25, 2.15, 0.16), `wood#0`, at(0, 1.08, d / 2 + 0.02));
  b.add(box(1.5, 0.2, 0.5), `stone#1`, at(0, 2.3, d / 2 + 0.2));
  const win = (lx, ly) => {
    b.add(box(1.15, 1.35, 0.12), `glass`, at(lx, ly, d / 2 + 0.03));
    b.add(box(1.35, 1.55, 0.1), `wall#1`, at(lx, ly, d / 2 - 0.02));
  };
  win(-w * 0.3, 2.3);
  win(w * 0.3, 2.3);
  if (floors > 1) {
    win(-w * 0.3, 2.3 + h);
    win(w * 0.3, 2.3 + h);
  }
  // 侧面的窗
  b.add(box(0.12, 1.15, 1.0), `glass`, at(w / 2 + 0.03, 2.5, 0));
  b.add(box(0.12, 1.15, 1.0), `glass`, at(-w / 2 - 0.03, 2.5, 0));

  if (sign) b.addSign(sign, at(0, hh - 0.1, d / 2 + 0.12), rotY, { w: Math.min(w * 0.6, 3.6), h: 0.72 });
  b.collide(x, z, w / 2 + 0.4, d / 2 + 0.4, hh + rh);
  return { x, z, w, d, h: hh + rh, rotY };
}

/**
 * 公共建筑：学校、图书馆、超市、网吧……画法和镇上的房子是一家人——
 * 粉墙、石勒脚、深色木梁、赭红或青灰的大瓦顶、带花箱的窗、木招牌。
 * @param o.floors 层数；o.flat 用缓一点的四坡顶（商铺）；o.awning 遮阳篷的颜色序号（cloth）；o.columns 门廊的柱数
 */
export function hall(b, o) {
  const { x, z, rotY = 0, w = 20, d = 12, h = 7, wall = 1, roof = 2, sign = null, columns = 0, windows = 5, flat = false, signBg = '#3a2a1c', signFg = '#f7e9c6' } = o;
  const awning = o.awning === true ? 0 : o.awning;
  const floors = o.floors ?? (h >= 8.5 ? 2 : 1);
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const base = o.y ?? heightAt(x, z);
  const at = (lx, ly, lz) => [x + lx * cos + lz * sin, base + ly, z - lx * sin + lz * cos];
  const put = (geo, key, lx, ly, lz, turn = 0) => b.add(geo, key, at(lx, ly, lz), rotY + turn);
  // 墙身 + 石勒脚（勒脚往下多埋一截，坡地上不露缝）
  put(box(w, h, d), `wall#${wall}`, 0, h / 2, 0);
  put(box(w + 0.36, 2.2, d + 0.36), `stone#2`, 0, -0.4, 0);
  // 木梁：四角的立柱、层间的横梁、檐下的一道
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(box(0.34, h, 0.34), `wood#2`, sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05));
  if (floors > 1) put(box(w + 0.16, 0.3, d + 0.16), `wood#2`, 0, h / floors, 0);
  put(box(w + 0.5, 0.34, d + 0.5), `wood#2`, 0, h - 0.1, 0);
  // 屋顶：出檐深，瓦是一行行的
  const rh = flat ? Math.min(w, d) * 0.3 : Math.min(w, d) * 0.5;
  if (flat) put(hipRoof(w + 2.2, d + 2.2, rh), `roof#${roof}`, 0, h + rh / 2 + 0.05, 0);
  else {
    put(gableRoof(d + 1.8, w + 1.6, rh), `roof#${roof}`, 0, h + 0.06, 0, Math.PI / 2);
    // 山墙的三角：和墙一个颜色
    for (const sx of [-1, 1]) {
      const tri = gableRoof(d, 0.3, rh * (d / (d + 1.8)));
      put(tri, `wall#${wall}`, sx * (w / 2 - 0.16), h, 0, Math.PI / 2);
    }
    // 烟囱
    put(box(1.0, 2.4, 1.0), `stone#0`, w * 0.3, h + rh * 0.75, -d * 0.12);
    put(box(1.2, 0.24, 1.2), `stone#1`, w * 0.3, h + rh * 0.75 + 1.3, -d * 0.12);
  }
  // 窗：每层一排，带窗框、窗台、花箱
  const colsN = Math.max(2, windows);
  for (let f = 0; f < floors; f++) {
    const cy = (h / floors) * (f + 0.56);
    for (let i = 0; i < colsN; i++) {
      const lx = -w / 2 + (w / colsN) * (i + 0.5);
      if (f === 0 && Math.abs(lx) < 2.0) continue; // 门的位置
      const ww = Math.min(1.5, (w / colsN) * 0.52);
      put(box(ww + 0.3, 1.9, 0.1), `wood#1`, lx, cy, d / 2 + 0.02);
      put(box(ww, 1.6, 0.14), `glass#0`, lx, cy, d / 2 + 0.04);
      put(box(0.07, 1.6, 0.18), `wood#1`, lx, cy, d / 2 + 0.05);
      put(box(ww, 0.07, 0.18), `wood#1`, lx, cy + 0.2, d / 2 + 0.05);
      put(box(ww + 0.5, 0.14, 0.4), `stone#2`, lx, cy - 0.98, d / 2 + 0.16);
      if ((i + f) % 2 === 0) {
        put(box(ww + 0.2, 0.26, 0.3), `wood#0`, lx, cy - 0.8, d / 2 + 0.26);
        put(box(ww + 0.1, 0.22, 0.26), `leaf#${i % 2}`, lx, cy - 0.6, d / 2 + 0.26);
        for (let k = 0; k < 3; k++) put(box(0.2, 0.16, 0.2), `flower#${(i + k + f) % 5}`, lx - ww * 0.32 + k * ww * 0.32, cy - 0.47, d / 2 + 0.28);
      }
    }
    // 侧面也有两扇
    for (const sx of [-1, 1]) for (const lz of [-d * 0.22, d * 0.22]) put(box(0.14, 1.5, 1.2), `glass#0`, sx * (w / 2 + 0.03), cy, lz);
  }
  // 门：双开的木门 + 石门楣 + 两级台阶
  put(box(2.5, 3.0, 0.2), `wood#0`, 0, 1.5, d / 2 + 0.04);
  put(box(0.08, 3.0, 0.26), `wood#2`, 0, 1.5, d / 2 + 0.05);
  put(box(3.1, 0.36, 0.5), `stone#0`, 0, 3.18, d / 2 + 0.14);
  put(box(3.6, 0.22, 1.1), `stone#1`, 0, 0.0, d / 2 + 0.6);
  put(box(4.2, 0.2, 1.7), `stone#1`, 0, -0.2, d / 2 + 0.9);
  if (columns) {
    for (let i = 0; i < columns; i++) {
      const lx = -w * 0.34 + ((w * 0.68) / Math.max(1, columns - 1)) * i;
      put(cylinder(0.36, h * 0.6, 12), `stone#0`, lx, h * 0.3, d / 2 + 2.4);
      put(box(0.95, 0.3, 0.95), `stone#1`, lx, h * 0.6, d / 2 + 2.4);
      put(box(0.95, 0.4, 0.95), `stone#1`, lx, 0.0, d / 2 + 2.4);
    }
    // 门廊的小披檐
    put(box(w * 0.78, 0.3, 3.4), `wood#2`, 0, h * 0.6 + 0.3, d / 2 + 1.5);
    put(box(w * 0.8, 0.22, 3.7), `roof#${roof}`, 0, h * 0.6 + 0.56, d / 2 + 1.55);
  }
  if (awning != null && awning !== false) {
    // 遮阳篷：两色相间的布条，往外斜下去
    const n = Math.max(6, Math.round((w * 0.84) / 0.9));
    const cw = (w * 0.84) / n;
    for (let i = 0; i < n; i++) {
      const lx = -w * 0.42 + cw * (i + 0.5);
      const g = box(cw, 0.07, 2.6);
      g.rotateX(0.32);
      put(g, i % 2 ? `cloth#3` : `cloth#${awning}`, lx, 3.9, d / 2 + 1.3);
      put(box(cw, 0.34, 0.06), i % 2 ? `cloth#3` : `cloth#${awning}`, lx, 3.36, d / 2 + 2.54);
    }
  }
  if (sign) {
    // 木招牌挂在檐下（有遮阳篷就再抬高一点）
    const sy = awning != null && awning !== false ? Math.min(h - 0.9, 5.4) : Math.min(h - 0.9, 4.3);
    const sw = Math.min(w * 0.5, 1.2 + [...sign].length * 1.05);
    put(box(sw + 0.4, 1.34, 0.16), `wood#2`, 0, sy, d / 2 + 0.2);
    b.addSign(sign, at(0, sy, d / 2 + 0.3), rotY, { w: sw, h: 1.06, bg: signBg, fg: signFg });
  }
  b.collide(x, z, w / 2 + 0.5, d / 2 + 0.5, h + 3);
  return { x, z, w, d, h, rotY };
}

/** 教堂：中殿 + 钟塔 + 尖顶 + 玫瑰窗。 */
export function church(b, o) {
  const { x, z, rotY = 0, wall = 5, roof = 3 } = o;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx, ly, lz) => [x + lx * cos + lz * sin, (o.y ?? heightAt(x, z)) + ly, z - lx * sin + lz * cos];
  // 中殿
  b.add(box(12, 9, 22), `wall#${wall}`, at(0, 4.5, 0));
  b.add(gableRoof(13, 23, 5.5), `roof#${roof}`, at(0, 9, 0), rotY + Math.PI / 2);
  // 塔
  b.add(box(6.4, 20, 6.4), `wall#${wall}`, at(0, 10, 12));
  b.add(box(7.2, 0.6, 7.2), `stone#0`, at(0, 20.3, 12));
  b.add(hipRoof(7.4, 7.4, 9), `roof#${roof}`, at(0, 20.6, 12));
  b.add(cylinder(0.12, 2.2, 6), `stone#0`, at(0, 30.6, 12));
  // 玫瑰窗和长窗
  b.add(cylinder(1.7, 0.2, 14), `glass`, at(0, 15.5, 15.22));
  for (const lz of [-7, -2.5, 2, 6.5]) {
    b.add(box(1.3, 4.2, 0.14), `glass`, at(6.05, 4.6, lz));
    b.add(box(1.3, 4.2, 0.14), `glass`, at(-6.05, 4.6, lz));
  }
  // 门
  b.add(box(3.0, 4.4, 0.2), `wood#0`, at(0, 2.2, 21.1));
  b.add(box(4, 0.4, 1.6), `stone#0`, at(0, 4.6, 21.4));
  b.collide(x, z, 7, 15, 26);
  b.collide(x + 12 * sin, z + 12 * cos, 3.6, 3.6, 30);
}

/** 夫子庙：两层石台 + 朱红的墙和柱 + 重檐青瓦（檐角起翘）+ 檐下一道青绿彩画 + 金字匾。 */
export function temple(b, o) {
  const { x, z, rotY = 0 } = o;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const base = o.y ?? heightAt(x, z);
  const at = (lx, ly, lz) => [x + lx * cos + lz * sin, base + ly, z - lx * sin + lz * cos];
  const put = (geo, key, lx, ly, lz, turn = 0) => b.add(geo, key, at(lx, ly, lz), rotY + turn);
  // 石台（往下多埋一截）和台阶
  put(box(23, 2.4, 18), `stone#0`, 0, -0.2, 0);
  put(box(21, 0.5, 16), `stone#2`, 0, 1.2, 0);
  for (let i = 0; i < 5; i++) put(box(8, 0.3, 0.8), `stone#2`, 0, 0.1 + i * 0.28, 9.2 + (4 - i) * 0.8);
  // 栏杆
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) put(box(0.3, 1.0, 0.3), `stone#2`, sx * (4.6 + i * 1.5), 1.9, 7.8);
    put(box(6.4, 0.2, 0.2), `stone#2`, sx * 7.6, 2.3, 7.8);
  }
  const F = 1.45; // 殿内地面
  // 朱红的墙，前面一排格子门
  put(box(15.5, 5.0, 9.5), `cloth#0`, 0, F + 2.5, -0.4);
  for (let i = 0; i < 5; i++) {
    const lx = -5.6 + i * 2.8;
    put(box(2.0, 3.6, 0.14), `wood#2`, lx, F + 1.8, 4.42);
    put(box(1.7, 1.5, 0.16), `flower#1`, lx, F + 2.6, 4.44);
    for (const k of [-0.42, 0, 0.42]) put(box(0.07, 1.5, 0.2), `wood#2`, lx + k, F + 2.6, 4.46);
    put(box(1.7, 0.07, 0.2), `wood#2`, lx, F + 2.6, 4.46);
  }
  // 廊柱：朱红，石础
  for (const lx of [-9, -5.4, -1.8, 1.8, 5.4, 9]) {
    for (const lz of [-6.4, 6.4]) {
      put(cylinder(0.42, 5.2, 12), `roof#1`, lx, F + 2.6, lz);
      put(cylinder(0.58, 0.3, 12), `stone#2`, lx, F + 0.15, lz);
    }
  }
  // 檐下：青绿彩画的额枋 + 斗拱（一排小方块）
  put(box(20.4, 0.7, 14.2), `cloth#1`, 0, F + 5.3, 0);
  put(box(20.8, 0.18, 14.6), `flower#1`, 0, F + 5.74, 0);
  for (let i = 0; i < 14; i++) for (const lz of [-7.3, 7.3]) put(box(0.5, 0.4, 0.5), `cloth#4`, -9.75 + i * 1.5, F + 6.0, lz);
  // 下檐：大屋顶，四角起翘
  const eave = (w, d, h, y, key) => {
    put(hipRoof(w, d, h), key, 0, y + h / 2, 0);
    put(box(w * 1.0, 0.16, d * 1.0), `wood#2`, 0, y - 0.02, 0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tip = box(2.6, 0.26, 0.5);
        tip.rotateZ(0.38 * sx);
        put(tip, key, sx * (w / 2 - 0.5), y + 0.4, sz * (d / 2 - 0.5), -sx * sz * Math.PI / 4);
      }
    }
  };
  eave(25, 19, 2.6, F + 6.2, `roof#3`);
  // 上层：收进去的一圈矮墙 + 上檐
  put(box(13.5, 1.9, 8.2), `cloth#0`, 0, F + 8.6, 0);
  put(box(14.0, 0.5, 8.7), `cloth#1`, 0, F + 9.6, 0);
  eave(18.5, 12.5, 3.2, F + 9.9, `roof#3`);
  // 正脊和两头的鸱吻（金色）
  put(box(7.5, 0.5, 0.5), `flower#1`, 0, F + 13.1, 0);
  for (const sx of [-1, 1]) put(box(0.6, 1.1, 0.6), `flower#1`, sx * 3.9, F + 13.4, 0);
  // 匾额
  put(box(5.0, 1.5, 0.2), `wood#2`, 0, F + 7.5, 7.0);
  b.addSign('夫子庙', at(0, F + 7.5, 7.12), rotY, { w: 4.5, h: 1.2, bg: '#1f3350', fg: '#f3d98a' });
  // 香炉
  put(cylinder(0.7, 0.9, 12), `iron#0`, 0, 0.45, 13.6);
  put(cylinder(0.9, 0.16, 12), `iron#0`, 0, 0.98, 13.6);
  b.collide(x, z, 11.5, 9, 14);
}

/** 牌坊：清镇市的门。 */
export function gate(b, o) {
  const { x, z, rotY = 0, text = '清镇市' } = o;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx, ly, lz) => [x + lx * cos + lz * sin, (o.y ?? heightAt(x, z)) + ly, z - lx * sin + lz * cos];
  for (const lx of [-6.5, 0, 6.5]) b.add(box(1.5, 9.5, 1.5), `wood#0`, at(lx, 4.75, 0));
  b.add(box(16.5, 1.5, 1.9), `wood#1`, at(0, 8.2, 0));
  b.add(box(15.5, 1.1, 1.7), `wood#1`, at(0, 6.4, 0));
  // 小瓦顶
  b.add(gableRoof(18.5, 3.4, 2.2), `roof#3`, at(0, 9.2, 0), rotY + Math.PI / 2);
  b.addSign(text, at(0, 8.15, 1.02), rotY, { w: 5.4, h: 1.2, bg: '#2b3a52', fg: '#f6edd8' });
  b.collide(x - 6.5 * cos, z + 6.5 * sin, 1.1, 1.1, 10);
  b.collide(x + 6.5 * cos, z - 6.5 * sin, 1.1, 1.1, 10);
  b.collide(x, z, 1.0, 1.0, 10);
}

/** 广场中心的喷泉。 */
export function fountain(b, o) {
  const { x, z } = o;
  const gy = o.y ?? heightAt(x, z);
  b.add(cylinder(6.4, 1.0, 22), `stone#1`, [x, gy + 0.5, z]);
  b.add(cylinder(5.4, 1.2, 22), `stone#0`, [x, gy + 0.75, z]);
  b.add(cylinder(5.1, 0.2, 22), `glass#0`, [x, gy + 1.28, z]);
  b.add(cylinder(1.1, 3.2, 12), `stone#0`, [x, gy + 2.4, z]);
  b.add(cylinder(2.4, 0.35, 16), `stone#1`, [x, gy + 4.0, z]);
  b.add(cylinder(0.5, 0.9, 10), `stone#0`, [x, gy + 4.5, z]);
  b.collide(x, z, 6.4, 6.4, 5);
}

/** 体育馆：一个椭圆的大屋顶 + 拱门。 */
export function gym(b, o) {
  const { x, z, rotY = 0 } = o;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx, ly, lz) => [x + lx * cos + lz * sin, (o.y ?? heightAt(x, z)) + ly, z - lx * sin + lz * cos];
  b.add(cylinder(26, 12, 26), `wall#1`, at(0, 6, 0));
  const dome = new THREE.SphereGeometry(26, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.5, 1);
  b.add(dome, `roof#2`, at(0, 12, 0), rotY);
  b.add(cylinder(26.4, 0.8, 26), `stone#0`, at(0, 12.2, 0));
  // 环形窗
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.add(box(1.6, 2.2, 0.14), `glass`, at(Math.cos(a) * 25.9, 7.6, Math.sin(a) * 25.9), -a + Math.PI / 2);
  }
  b.add(box(9, 7, 1.4), `wall#0`, at(0, 3.5, 26.2));
  b.addSign('体育馆', at(0, 8.0, 26.9), rotY, { w: 4.6, h: 1.0 });
  b.collide(x, z, 26.5, 26.5, 24);
}

/** 市场：一片摊位（布棚 + 台面 + 货）。 */
export function stall(b, o) {
  const { x, z, rotY = 0, c1 = 'cloth#3', c2 = 'cloth#0' } = o;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx, ly, lz) => [x + lx * cos + lz * sin, (o.y ?? heightAt(x, z)) + ly, z - lx * sin + lz * cos];
  b.add(box(3.0, 0.9, 1.6), `wood#1`, at(0, 0.45, 0));
  // 四根柱子 + 布棚
  for (const [lx, lz] of [[-1.4, -0.8], [1.4, -0.8], [-1.4, 0.8], [1.4, 0.8]]) b.add(cylinder(0.07, 2.4, 6), `wood#0`, at(lx, 1.2, lz));
  for (let i = 0; i < 4; i++) b.add(box(0.75, 0.1, 2.0), i % 2 ? c1 : c2, at(-1.12 + i * 0.75, 2.45, 0), rotY);
  // 台面上的货
  for (let i = 0; i < 4; i++) b.add(box(0.5, 0.34, 0.5), i % 2 ? `leaf#${i % 2}` : `flower#${Math.abs(i + Math.round(x)) % 5}`, at(-1.0 + i * 0.66, 1.06, (i % 2 ? 0.3 : -0.25)), rotY);
  b.collide(x, z, 1.6, 1.0, 2.6);
}

/** 摊位顶上的一条横幅（挂在小吃街上）。 */
export function banner(b, x, z, text, rotY = 0, w = 6.5) {
  const gy = heightAt(x, z);
  // 两根木杆撑着
  for (const side of [-1, 1]) {
    const px = x + Math.cos(rotY) * side * (w / 2 + 0.12);
    const pz = z - Math.sin(rotY) * side * (w / 2 + 0.12);
    b.add(cylinder(0.09, 5.0, 8), `wood#2`, [px, heightAt(px, pz) + 2.5, pz]);
    b.collide(px, pz, 0.15, 0.15, 5);
  }
  b.addSign(text, [x, gy + 4.3, z], rotY, { w, h: 0.9, bg: '#8c2f22', fg: '#fdf3df' });
}

/** 路灯：细铁杆、一截横臂、挂着的小灯笼。 */
export function lamp(b, x, z, rotY = 0) {
  const gy = heightAt(x, z);
  b.add(cylinder(0.11, 0.5, 8), `iron#0`, [x, gy + 0.25, z]);
  b.add(cylinder(0.05, 3.3, 6), `iron#0`, [x, gy + 1.65, z]);
  const ax = Math.sin(rotY) * 0.3;
  const az = Math.cos(rotY) * 0.3;
  b.add(box(0.05, 0.05, 0.7), `iron#0`, [x + ax, gy + 3.26, z + az], rotY);
  b.add(box(0.26, 0.34, 0.26), `glow#0`, [x + ax * 2, gy + 2.95, z + az * 2], rotY);
  const cap = new THREE.ConeGeometry(0.26, 0.2, 4);
  cap.rotateY(Math.PI / 4);
  b.add(cap, `iron#0`, [x + ax * 2, gy + 3.2, z + az * 2], rotY);
  b.collide(x, z, 0.14, 0.14, 4);
}

/** 长椅。 */
export function bench(b, x, z, rotY = 0) {
  const gy = heightAt(x, z);
  b.add(box(2.2, 0.14, 0.6), `wood#1`, [x, gy + 0.5, z], rotY);
  b.add(box(2.2, 0.5, 0.12), `wood#1`, [x + Math.sin(rotY) * 0.24, gy + 0.82, z + Math.cos(rotY) * 0.24], rotY);
  for (const dx of [-0.85, 0.85]) b.add(box(0.12, 0.5, 0.5), `wood#2`, [x + dx * Math.cos(rotY), gy + 0.25, z - dx * Math.sin(rotY)], rotY);
}

/** 石灯笼（夫子庙、湖边用）。 */
export function stoneLantern(b, x, z) {
  const gy = heightAt(x, z);
  b.add(cylinder(0.42, 0.3, 8), `stone#1`, [x, gy + 0.15, z]);
  b.add(cylinder(0.2, 1.0, 8), `stone#0`, [x, gy + 0.8, z]);
  b.add(box(0.62, 0.5, 0.62), `stone#1`, [x, gy + 1.55, z]);
  b.add(box(0.8, 0.16, 0.8), `stone#0`, [x, gy + 1.86, z]);
}

/** 围墙 / 篱笆：一串矮柱子加两条横杆。 */
export function fence(b, x1, z1, x2, z2, height = 1.1) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.round(len / 1.6));
  const rotY = Math.atan2(x2 - x1, z2 - z1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = x1 + (x2 - x1) * t;
    const pz = z1 + (z2 - z1) * t;
    b.add(cylinder(0.07, height, 5), `wood#2`, [px, heightAt(px, pz) + height / 2, pz]);
  }
  const mx = (x1 + x2) / 2;
  const mz = (z1 + z2) / 2;
  const gy = heightAt(mx, mz);
  b.add(box(0.07, 0.1, len), `wood#1`, [mx, gy + height * 0.75, mz], rotY);
  b.add(box(0.07, 0.1, len), `wood#1`, [mx, gy + height * 0.4, mz], rotY);
}