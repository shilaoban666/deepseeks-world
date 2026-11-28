// 地标建筑：宫殿、城门、清真寺、高楼、车站、风车、高架铁路……
// 画法和 buildings.js 一家：简单几何体攒进 Builder，按材质合并，平涂 + 墨线。
// 约定：局部 +z 是正面（门那一面），rotY 绕 Y 轴转；碰撞盒的 top 是离地高度。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt } from './plan.js';
import { gableRoof, hipRoof, lamp } from './buildings.js';
import { paintMaterial, outlineMaterial } from './paint.js';

// ---- 零件 ------------------------------------------------------------------------------------------------------
const PI = Math.PI;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, seg = 10, rTop = r) => new THREE.CylinderGeometry(rTop, r, h, seg);
const ball = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const cone = (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg);

/** 登记一个转过角度的占地的外接轴对齐碰撞盒。 */
export function collideRot(b, x, z, rotY, hw, hd, top = 20, base = null) {
  // （盒子现在可以带朝向：不再取外接的正盒，斜着的房子旁边没有看不见的墙角了）
  b.collide(x, z, hw, hd, top, rotY, base);
  return b.colliders[b.colliders.length - 1];
}

/** 局部坐标系：at 把局部点转到世界，put 加几何体，hit 登记局部位置的碰撞盒。 */
function frame(b, o) {
  const { x, z, rotY = 0 } = o;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const base = o.y ?? heightAt(x, z);
  const at = (lx, ly, lz) => [x + lx * cos + lz * sin, base + ly, z - lx * sin + lz * cos];
  const put = (geo, key, lx, ly, lz, turn = 0) => b.add(geo, key, at(lx, ly, lz), rotY + turn);
  const hit = (lx, lz, hw, hd, top) => {
    const p = at(lx, 0, lz);
    return collideRot(b, p[0], p[2], rotY, hw, hd, top, base);
  };
  return { x, z, rotY, base, at, put, hit };
}

/** 中式屋檐：四坡顶 + 檐板 + 四个起翘的檐角（照夫子庙的画法）。 */
function eave(put, w, d, h, y, key, cx = 0, cz = 0, s = 1) {
  put(hipRoof(w, d, h), key, cx, y + h / 2, cz);
  put(box(w - 0.1, 0.16, d - 0.1), 'wood#2', cx, y - 0.03, cz);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tip = box(2.6 * s, 0.26 * s, 0.5 * s);
      tip.rotateZ(0.38 * sx);
      put(tip, key, cx + sx * (w / 2 - 0.5 * s), y + 0.4 * s, cz + sz * (d / 2 - 0.5 * s), (-sx * sz * PI) / 4);
    }
  }
}

/** 筒拱：半个圆筒，轴沿局部 x，底在 y=0；rz 是 z 向半径，ry 是拱高。 */
function vault(len, rz, ry, seg = 14) {
  const g = new THREE.CylinderGeometry(rz, rz, len, seg, 1, true, 0, PI);
  g.rotateZ(PI / 2);
  g.scale(1, ry / rz, 1);
  return g;
}

/** 筒拱两头的半圆山墙（薄半圆柱）。 */
function halfDisc(rz, ry, t = 0.3, seg = 14) {
  const g = new THREE.CylinderGeometry(rz, rz, t, seg, 1, false, 0, PI);
  g.rotateZ(PI / 2);
  g.scale(1, ry / rz, 1);
  return g;
}

/** 拱肋：立在局部 y–z 平面里的半个圆环。 */
function rib(rz, ry, tube = 0.3, seg = 16) {
  const g = new THREE.TorusGeometry(rz, tube, 5, seg, PI);
  g.rotateY(PI / 2);
  g.scale(1, ry / rz, 1);
  return g;
}

/** 确定性的伪随机数（0..1）。 */
function rnd(i) {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// ---- 1 宫殿 ----------------------------------------------------------------------------------------------------
/** 玉海宫：两层石台 + 朱红大殿 + 三重金瓦庑殿顶 + 两座配亭。 */
export function palace(b, o) {
  const { rotY, at, put, hit } = frame(b, o);
  // 两层石台
  put(box(48, 2.5, 34), 'mason#2', 0, 0.25, 0);
  put(box(42, 1.6, 28), 'mason#2', 0, 2.2, 0);
  put(box(48.4, 0.2, 34.4), 'paint#3', 0, 1.52, 0);
  put(box(42.4, 0.2, 28.4), 'paint#3', 0, 3.02, 0);
  // 正面大台阶：10 级
  for (let i = 0; i < 10; i++) {
    const top = 0.3 * (i + 1) + 0.02;
    put(box(12, top + 0.6, 0.64), 'mason#0', 0, (top - 0.6) / 2, 20 - 0.6 * (i + 0.5));
  }
  // 栏杆：望柱 + 扶手
  const rail = (y, hx, hz, gap) => {
    const zs = [];
    for (let lz = -hz; lz <= hz + 0.01; lz += (hz * 2) / 8) zs.push(lz);
    for (const sx of [-1, 1]) {
      for (const lz of zs) put(box(0.36, 1.2, 0.36), 'paint#3', sx * hx, y + 0.6, lz);
      put(box(0.2, 0.2, hz * 2), 'paint#3', sx * hx, y + 0.95, 0);
      const fl = hx - gap;
      for (let i = 0; i < 5; i++) put(box(0.36, 1.2, 0.36), 'paint#3', sx * (gap + (fl * i) / 5), y + 0.6, hz);
      put(box(fl, 0.2, 0.2), 'paint#3', sx * (gap + fl / 2), y + 0.95, hz);
    }
  };
  rail(1.5, 23.6, 16.6, 6.4);
  rail(3.0, 20.6, 13.6, 6.4);
  const F = 3.0;
  // 大殿：朱墙 + 格子门 + 朱柱
  put(box(26, 6.4, 12), 'paint#7', 0, F + 3.2, 0);
  for (let i = 0; i < 5; i++) {
    const lx = -8 + i * 4;
    put(box(2.6, 4.2, 0.14), 'wood#2', lx, F + 2.1, 6.04);
    put(box(2.2, 1.8, 0.16), 'flower#1', lx, F + 3.0, 6.06);
    for (const k of [-0.55, 0, 0.55]) put(box(0.08, 1.8, 0.2), 'wood#2', lx + k, F + 3.0, 6.08);
  }
  const cols = [];
  for (let lx = -15; lx <= 15; lx += 5) cols.push([lx, -8], [lx, 8]);
  cols.push([-15, 0], [15, 0]);
  for (const [lx, lz] of cols) {
    put(cyl(0.5, 6.6, 12), 'cloth#0', lx, F + 3.3, lz);
    put(cyl(0.7, 0.34, 12), 'mason#2', lx, F + 0.17, lz);
  }
  // 额枋彩画 + 金线
  put(box(31.4, 0.8, 17.4), 'cloth#1', 0, F + 6.9, 0);
  put(box(31.8, 0.18, 17.8), 'paint#4', 0, F + 7.37, 0);
  // 三重檐
  eave(put, 38, 24, 3.2, F + 7.5, 'roof#6', 0, 0, 1.5);
  put(box(24, 2.8, 11), 'paint#7', 0, F + 10.6, 0);
  put(box(24.6, 0.5, 11.6), 'cloth#1', 0, F + 12.0, 0);
  eave(put, 30, 17, 3.0, F + 12.3, 'roof#6', 0, 0, 1.3);
  put(box(17, 2.6, 7), 'paint#7', 0, F + 15.2, 0);
  put(box(17.6, 0.5, 7.6), 'cloth#1', 0, F + 16.5, 0);
  eave(put, 23, 12, 4.2, F + 16.8, 'roof#6', 0, 0, 1.2);
  // 金正脊 + 鸱吻
  put(box(9, 0.6, 0.7), 'paint#4', 0, F + 20.5, 0);
  for (const sx of [-1, 1]) put(box(0.7, 1.3, 0.7), 'paint#4', sx * 4.7, F + 20.9, 0);
  // 匾额
  put(box(6.0, 1.9, 0.2), 'wood#2', 0, F + 10.7, 5.6);
  b.addSign(o.name ?? '玉海宫', at(0, F + 10.7, 5.73), rotY, { w: 5.4, h: 1.5, bg: '#1f3350', fg: '#f3d98a' });
  // 两座配亭（台前左右）
  for (const sx of [-1, 1]) {
    const cx = sx * 19;
    const cz = 23;
    put(box(9, 1.6, 9), 'mason#2', cx, 0.2, cz);
    put(box(3, 0.5, 1.2), 'mason#0', cx, 0.25, cz + 5);
    put(box(5.6, 3.8, 5.6), 'paint#7', cx, 2.9, cz);
    put(box(1.6, 2.6, 0.14), 'wood#2', cx, 2.3, cz + 2.84);
    for (const ax of [-1, 1]) for (const az of [-1, 1]) put(cyl(0.3, 4, 10), 'cloth#0', cx + ax * 3.5, 3.0, cz + az * 3.5);
    put(box(7.8, 0.5, 7.8), 'cloth#1', cx, 5.05, cz);
    eave(put, 10.5, 10.5, 3.0, 5.35, 'roof#6', cx, cz, 0.8);
    put(ball(0.45), 'paint#4', cx, 8.5, cz);
    hit(cx, cz, 4.6, 4.6, 9);
  }
  // 两层石台是能上去的：正面十级台阶（每级 0.3 m）走上第二层，大殿本身才是墙
  hit(0, 0, 24, 17, 1.5);
  hit(0, 0, 21, 14, 3.0);
  hit(0, 0, 16.3, 8.3, 26);
  for (let i = 0; i < 10; i++) hit(0, (13.8 + 20.6 - i * 0.66) / 2, 5, (20.6 - i * 0.66 - 13.8) / 2, (i + 1) * 0.3);
  return { rotY, h: 24 };
}

// ---- 2 城门楼 --------------------------------------------------------------------------------------------------
/** 城门楼：石城台（中间门洞可穿行）+ 垛口 + 朱柱青瓦的门楼。 */
export function gateTower(b, o) {
  const { rotY, at, put, hit } = frame(b, o);
  const text = o.text ?? '城门';
  // 两个墩 + 过梁
  for (const sx of [-1, 1]) put(box(4.5, 7, 8), 'mason#1', sx * 4.75, 2.5, 0);
  put(box(5.1, 1.5, 7.9), 'mason#1', 0, 5.25, 0);
  // 拱的意思：两个抹角 + 两面的拱圈
  for (const sx of [-1, 1]) {
    const g = box(1.4, 1.4, 7.8);
    g.rotateZ(PI / 4);
    put(g, 'mason#1', sx * 2.5, 4.5, 0);
  }
  for (const sz of [-1, 1]) put(new THREE.TorusGeometry(2.5, 0.28, 5, 12, PI), 'mason#2', 0, 2.2, sz * 4.0);
  put(box(14.6, 0.4, 8.6), 'mason#0', 0, 6.1, 0);
  // 垛口
  for (const sz of [-1, 1]) for (let i = 0; i < 7; i++) put(box(1.2, 0.8, 0.6), 'mason#1', -6.6 + i * 2.2, 6.7, sz * 3.95);
  // 门楼
  const T = 6.3;
  put(box(8.4, 3.4, 4.2), 'wood#0', 0, T + 1.7, 0);
  for (const sz of [-1, 1]) put(box(2.0, 2.4, 0.12), 'wood#2', 0, T + 1.3, sz * 2.12);
  for (const lx of [-5, 0, 5]) for (const lz of [-2.8, 2.8]) put(cyl(0.3, 3.6, 10), 'cloth#0', lx, T + 1.8, lz);
  put(box(11.2, 0.5, 6.6), 'cloth#1', 0, T + 3.75, 0);
  eave(put, 15, 10, 2.9, T + 4.05, 'roof#10', 0, 0, 1.0);
  put(box(4.5, 0.45, 0.5), 'mason#1', 0, T + 6.75, 0);
  // 两面的门额
  for (const sz of [-1, 1]) {
    put(box(4.4, 1.2, 0.16), 'wood#2', 0, 5.3, sz * 4.02);
    b.addSign(text, at(0, 5.3, sz * 4.13), rotY + (sz > 0 ? 0 : PI), { w: 4.0, h: 1.0, bg: '#1f3350', fg: '#f3d98a' });
  }
  for (const sx of [-1, 1]) hit(sx * 4.75, 0, 2.3, 4.1, 13);
  return { rotY, h: 13.3 };
}

// ---- 3 清真寺 --------------------------------------------------------------------------------------------------
/** 清真寺：白色礼拜殿 + 绿色大穹顶 + 四个小穹亭 + 两座宣礼塔。 */
export function mosque(b, o) {
  const { rotY, at, put, hit } = frame(b, o);
  put(box(26.4, 2.0, 20.4), 'mason#2', 0, -0.4, 0);
  put(box(26, 8, 20), 'wall#6', 0, 4, 0);
  put(box(26.6, 0.5, 20.6), 'wall#6', 0, 8.1, 0);
  put(box(26.2, 0.4, 20.2), 'roof#7', 0, 7.3, 0);
  // 正面五个尖拱
  for (let i = 0; i < 5; i++) {
    const lx = -9.6 + i * 4.8;
    const door = i === 2;
    put(box(2.6, 4.0, 0.2), door ? 'wood#2' : 'glass#0', lx, 2.2, 10.0);
    const tip = cone(1.3, 1.8, 4);
    tip.scale(1, 1, 0.08);
    put(tip, door ? 'wood#2' : 'glass#0', lx, 5.1, 10.0);
    put(box(3.0, 0.2, 0.4), 'mason#2', lx, 0.2, 10.1);
  }
  // 侧面的尖拱窗
  for (const sx of [-1, 1]) {
    for (const lz of [-5, 0, 5]) {
      put(box(0.2, 3.2, 1.8), 'glass#0', sx * 13.0, 3.4, lz);
      const tip = cone(0.9, 1.3, 4);
      tip.scale(0.08, 1, 1);
      put(tip, 'glass#0', sx * 13.0, 5.65, lz);
    }
  }
  // 大穹顶：鼓座 + 洋葱球 + 尖 + 金顶
  put(cyl(6, 2.4, 18), 'wall#6', 0, 9.4, 0);
  put(cyl(6.3, 0.3, 18), 'roof#7', 0, 10.5, 0);
  const dome = ball(6.4, 18, 12);
  dome.scale(1, 1.12, 1);
  put(dome, 'roof#7', 0, 14.4, 0);
  put(cone(1.7, 2.6, 12), 'roof#7', 0, 22.0, 0);
  put(cyl(0.1, 1.6, 6), 'paint#4', 0, 23.8, 0);
  put(ball(0.42), 'paint#4', 0, 23.6, 0);
  // 四角的小穹亭
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      put(cyl(1.6, 1.2, 10), 'wall#6', sx * 10.6, 8.9, sz * 7.6);
      put(ball(1.75, 10, 8), 'roof#7', sx * 10.6, 10.4, sz * 7.6);
      put(cyl(0.07, 0.9, 5), 'paint#4', sx * 10.6, 12.5, sz * 7.6);
    }
  }
  // 宣礼塔
  for (const sx of [-1, 1]) {
    const lx = sx * 14.8;
    const lz = 11.4;
    put(box(3.2, 2.4, 3.2), 'mason#2', lx, 0.6, lz);
    put(cyl(1.3, 12.6, 12, 1.05), 'wall#6', lx, 8.0, lz);
    put(cyl(1.75, 0.4, 12), 'wall#6', lx, 14.4, lz);
    put(cyl(1.6, 0.9, 12, 1.75), 'roof#7', lx, 13.8, lz);
    put(cyl(0.9, 3.8, 12, 0.8), 'wall#6', lx, 16.5, lz);
    put(cyl(1.15, 0.3, 12), 'wall#6', lx, 18.4, lz);
    put(cone(1.2, 3.4, 12), 'roof#7', lx, 20.2, lz);
    put(cyl(0.06, 1.0, 5), 'paint#4', lx, 22.2, lz);
    hit(lx, lz, 1.7, 1.7, 22);
  }
  put(box(4.4, 1.1, 0.14), 'roof#7', 0, 6.65, 10.06);
  b.addSign(o.sign ?? '清真寺', at(0, 6.65, 10.16), rotY, { w: 3.8, h: 0.9, bg: '#1d5a4a', fg: '#f6edd8' });
  hit(0, 0, 13.4, 10.4, 24);
  return { rotY, h: 24.5 };
}

// ---- 4 霓虹店铺 ------------------------------------------------------------------------------------------------
/** 霓虹店铺：中式青瓦檐 + 通长玻璃底层 + 二层大霓虹招牌（电影院/电玩店/超市）。 */
export function neonShop(b, o) {
  const { w = 18, d = 12, h = 9, sign = '电影院', neon = 1, signBg = '#241a3a', signFg = '#ffe9a8' } = o;
  const { rotY, at, put, hit } = frame(b, o);
  const zf = d / 2;
  put(box(w + 0.36, 2.0, d + 0.36), 'mason#1', 0, -0.5, 0);
  put(box(w, h, d), 'wood#0', 0, h / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(box(0.4, h, 0.4), 'wood#2', sx * (w / 2 - 0.05), h / 2, sz * (zf - 0.05));
  put(box(w + 0.2, 0.3, d + 0.2), 'wood#2', 0, 4.3, 0);
  put(box(w + 0.5, 0.36, d + 0.5), 'wood#2', 0, h - 0.1, 0);
  // 屋顶
  const rh = Math.min(w, d) * 0.3;
  eave(put, w + 2.6, d + 2.6, rh, h + 0.12, 'roof#10', 0, 0, 1.0);
  // 底层：通长暖光玻璃 + 竖梃 + 门
  put(box(w - 1.4, 3.0, 0.14), 'glass#3', 0, 1.9, zf + 0.04);
  const nm = Math.max(4, Math.round((w - 1.4) / 2.2));
  for (let i = 0; i <= nm; i++) put(box(0.14, 3.0, 0.2), 'wood#2', -(w - 1.4) / 2 + ((w - 1.4) * i) / nm, 1.9, zf + 0.06);
  put(box(w - 1.2, 0.2, 0.24), 'wood#2', 0, 3.45, zf + 0.06);
  put(box(2.6, 3.0, 0.2), 'wood#2', 0, 1.5, zf + 0.1);
  put(box(1.0, 2.2, 0.24), 'glass#3', -0.6, 1.5, zf + 0.1);
  put(box(1.0, 2.2, 0.24), 'glass#3', 0.6, 1.5, zf + 0.1);
  put(box(3.4, 0.2, 1.2), 'mason#1', 0, 0.0, zf + 0.6);
  // 二层大招牌：深色底板 + 一圈霓虹边
  const bw = w * 0.7;
  const bh = 3.0;
  const by = Math.min(h - 2.0, 4.6 + bh / 2 + 0.6);
  put(box(bw, bh, 0.3), 'paint#9', 0, by, zf + 0.2);
  const gk = `glow#${neon}`;
  put(box(bw + 0.3, 0.16, 0.4), gk, 0, by + bh / 2 + 0.05, zf + 0.2);
  put(box(bw + 0.3, 0.16, 0.4), gk, 0, by - bh / 2 - 0.05, zf + 0.2);
  for (const sx of [-1, 1]) put(box(0.16, bh + 0.26, 0.4), gk, sx * (bw / 2 + 0.07), by, zf + 0.2);
  b.addSign(sign, at(0, by, zf + 0.37), rotY, { w: w * 0.6, h: 2.2, bg: signBg, fg: signFg });
  // 门上的条纹布篷
  const n = 6;
  const cw = 5.4 / n;
  const ck = `cloth#${o.awning ?? 0}`;
  for (let i = 0; i < n; i++) {
    const g = box(cw, 0.07, 2.0);
    g.rotateX(0.32);
    put(g, i % 2 ? 'cloth#3' : ck, -2.7 + cw * (i + 0.5), 4.0, zf + 1.0);
    put(box(cw, 0.3, 0.06), i % 2 ? 'cloth#3' : ck, -2.7 + cw * (i + 0.5), 3.56, zf + 1.96);
  }
  // 两只纸灯笼
  for (const sx of [-1, 1]) {
    const lx = sx * (w / 2 - 0.9);
    put(box(0.1, 0.1, 1.1), 'wood#2', lx, 6.0, zf + 0.5);
    put(cyl(0.02, 0.5, 4), 'iron#0', lx, 5.75, zf + 0.9);
    put(cyl(0.36, 0.8, 10), 'glow#3', lx, 5.1, zf + 0.9);
    put(cyl(0.24, 0.1, 10), 'wood#2', lx, 5.54, zf + 0.9);
    put(cyl(0.24, 0.1, 10), 'wood#2', lx, 4.66, zf + 0.9);
  }
  // 侧窗
  for (const sx of [-1, 1]) for (const lz of [-d * 0.22, d * 0.22]) put(box(0.14, 1.6, 1.4), 'glass#3', sx * (w / 2 + 0.03), 6.4, lz);
  hit(0, 0, w / 2 + 0.5, zf + 0.5, h + 3);
  return { rotY, w, d, h: h + rh };
}

// ---- 5 写字楼 --------------------------------------------------------------------------------------------------
/** CBD 写字楼：两层裙楼 + 玻璃塔身（每层一道楼板线）+ 楼冠。style 0 平顶 / 1 竖鳍退台 / 2 混凝土竖窗。 */
export function tower(b, o) {
  const { w = 22, d = 22, h = 60, glass = 1, style = 0 } = o;
  const { rotY, at, put, hit } = frame(b, o);
  const gk = `glass#${glass}`;
  const P = 8; // 裙楼高
  const pw = w + 3;
  const pd = d + 3;
  put(box(pw + 0.3, 1.8, pd + 0.3), 'mason#1', 0, -0.6, 0);
  put(box(pw, P, pd), 'wall#7', 0, P / 2, 0);
  // 底层暖光玻璃、二层玻璃：两块十字交叉的盒子，四面都露出一条窗带
  put(box(pw + 0.12, 3.2, pd - 2.4), 'glass#3', 0, 2.0, 0);
  put(box(pw - 2.4, 3.2, pd + 0.12), 'glass#3', 0, 2.0, 0);
  put(box(pw + 0.12, 2.4, pd - 2.4), gk, 0, 5.8, 0);
  put(box(pw - 2.4, 2.4, pd + 0.12), gk, 0, 5.8, 0);
  put(box(pw + 0.5, 0.4, pd + 0.5), 'wall#6', 0, P + 0.1, 0);
  // 入口雨篷
  put(box(7, 0.3, 3.2), 'wall#6', 0, 4.0, pd / 2 + 1.6);
  for (const sx of [-1, 1]) put(cyl(0.2, 4, 8), 'mason#2', sx * 3, 2.0, pd / 2 + 2.8);
  // 塔身
  const H = h - P;
  if (style === 2) {
    put(box(w, H, d), 'wall#7', 0, P + H / 2, 0);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      for (const sz of [-1, 1]) put(box((w / n) * 0.5, H - 2.4, 0.2), gk, t * w, P + H / 2, sz * (d / 2 + 0.02));
      for (const sx of [-1, 1]) put(box(0.2, H - 2.4, (d / n) * 0.5), gk, sx * (w / 2 + 0.02), P + H / 2, t * d);
    }
  } else {
    put(box(w, H, d), gk, 0, P + H / 2, 0);
  }
  // 楼板线：每层一块略大的薄板
  const nf = Math.max(1, Math.floor(H / 3.6));
  for (let i = 1; i <= nf; i++) put(box(w + 0.26, 0.22, d + 0.26), 'wall#6', 0, P + (H * i) / (nf + 1), 0);
  if (style === 1) {
    // 竖鳍
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4 - 0.5;
      for (const sz of [-1, 1]) put(box(0.36, H, 0.5), 'wall#6', t * w, P + H / 2, sz * (d / 2 + 0.2));
      for (const sx of [-1, 1]) put(box(0.5, H, 0.36), 'wall#6', sx * (w / 2 + 0.2), P + H / 2, t * d);
    }
    // 退台楼冠 + 尖
    put(box(w + 0.5, 0.5, d + 0.5), 'wall#6', 0, h + 0.2, 0);
    put(box(w * 0.78, 3.2, d * 0.78), gk, 0, h + 2.0, 0);
    put(box(w * 0.82, 0.3, d * 0.82), 'wall#6', 0, h + 3.7, 0);
    put(box(w * 0.5, 2.8, d * 0.5), gk, 0, h + 5.2, 0);
    put(box(w * 0.54, 0.3, d * 0.54), 'wall#6', 0, h + 6.7, 0);
    put(cyl(0.3, 7, 6, 0.06), 'wall#6', 0, h + 10.3, 0);
  } else {
    // 女儿墙 + 设备间 + 天线
    put(box(w + 0.5, 1.1, d + 0.5), style === 2 ? 'wall#6' : 'wall#7', 0, h + 0.5, 0);
    put(box(w * 0.42, 3.0, d * 0.36), 'wall#7', -w * 0.12, h + 2.5, -d * 0.1);
    put(box(w * 0.46, 0.24, d * 0.4), 'wall#6', -w * 0.12, h + 4.1, -d * 0.1);
    put(box(2.4, 1.4, 2.4), 'mason#1', w * 0.26, h + 1.7, d * 0.2);
    put(cyl(0.08, 5, 5), 'iron#0', w * 0.3, h + 3.5, -d * 0.3);
  }
  if (o.sign) b.addSign(o.sign, at(0, P - 1.4, pd / 2 + 0.1), rotY, { w: Math.min(pw * 0.5, 9), h: 1.5, bg: o.signBg ?? '#1f3350', fg: o.signFg ?? '#ffffff' });
  hit(0, 0, pw / 2 + 0.3, pd / 2 + 0.3, h + 4);
  return { rotY, w: pw, d: pd, h: h + (style === 1 ? 13 : 4) };
}

// ---- 6 住宅楼 --------------------------------------------------------------------------------------------------
/** 海边板式住宅：每层通长窗带 + 壁柱 + 隔跨阳台 + 平屋顶、楼梯间、水箱。 */
export function apartment(b, o) {
  // 海边的公寓：还是镇上那种粉墙红瓦的画法，只是高几层——一扇扇带白框的窗、挂着花箱的小阳台、大坡顶。
  const { w = 26, d = 13, wall = 7 } = o;
  const floors = Math.min(o.floors ?? 5, 6);
  const { rotY, put, hit } = frame(b, o);
  const fh = 3.1;
  const H = floors * fh;
  const wk = `wall#${wall}`;
  const zf = d / 2;
  put(box(w + 0.4, 2.0, d + 0.4), 'mason#2', 0, -0.4, 0);
  put(box(w, H, d), wk, 0, H / 2, 0);
  const n = Math.max(3, Math.round(w / 3.6));
  const bw = w / n;
  const mid = Math.floor(n / 2);
  const RAIL = ['cloth#1', 'cloth#4', 'cloth#0', 'cloth#2'];
  for (let f = 0; f < floors; f++) {
    const cy = f * fh + 1.75;
    for (let i = 0; i < n; i++) {
      const lx = -w / 2 + bw * (i + 0.5);
      if (f === 0 && i === mid) continue;
      for (const sz of [-1, 1]) {
        put(box(1.7, 1.8, 0.1), 'wall#6', lx, cy, sz * (zf + 0.03));
        put(box(1.36, 1.46, 0.14), 'glass#0', lx, cy, sz * (zf + 0.05));
        put(box(0.08, 1.46, 0.18), 'wall#6', lx, cy, sz * (zf + 0.06));
      }
      // 阳台：隔一扇一个，栏板是布色的，上面一排花
      if (f > 0 && (i + f) % 2 === 0) {
        put(box(2.3, 0.14, 1.1), 'wall#6', lx, f * fh + 0.62, zf + 0.58);
        put(box(2.3, 0.8, 0.1), RAIL[(i + f * 3) % RAIL.length], lx, f * fh + 1.05, zf + 1.1);
        put(box(2.0, 0.2, 0.24), 'leaf#' + (i % 2), lx, f * fh + 1.52, zf + 1.1);
        for (let k = 0; k < 3; k++) put(box(0.22, 0.16, 0.22), 'flower#' + ((i + k + f) % 5), lx - 0.7 + k * 0.7, f * fh + 1.68, zf + 1.1);
      }
    }
    for (const sx of [-1, 1]) put(box(0.12, 1.4, 1.3), 'glass#0', sx * (w / 2 + 0.04), cy, 0);
  }
  // 层间一道木色的腰线、檐口，上面一个出檐深的大坡顶和两个烟囱
  put(box(w + 0.2, 0.22, d + 0.2), 'wood#1', 0, fh, 0);
  put(box(w + 0.7, 0.34, d + 0.7), 'wood#2', 0, H - 0.05, 0);
  const rh = d * 0.42;
  put(hipRoof(w + 2.2, d + 2.4, rh), 'roof#' + (wall === 8 ? 5 : wall === 6 ? 1 : 0), 0, H + rh / 2 + 0.1, 0);
  for (const sx of [-1, 1]) {
    put(box(1.0, 2.2, 1.0), 'mason#1', sx * w * 0.26, H + rh * 0.62, -d * 0.1);
    put(box(1.24, 0.22, 1.24), 'mason#2', sx * w * 0.26, H + rh * 0.62 + 1.2, -d * 0.1);
  }
  // 入口：木门、布雨篷、两级台阶
  const ex = -w / 2 + bw * (mid + 0.5);
  put(box(2.0, 2.6, 0.18), 'wood#0', ex, 1.3, zf + 0.08);
  const aw = box(3.4, 0.1, 1.8);
  aw.rotateX(0.3);
  put(aw, 'cloth#' + (wall % 3), ex, 3.0, zf + 0.9);
  put(box(3.4, 0.22, 1.5), 'mason#1', ex, 0.0, zf + 0.8);
  hit(0, 0, w / 2 + 0.4, zf + 0.9, H + rh + 1);
  return { rotY, w, d, h: H + rh };
}

// ---- 7 钟楼 ----------------------------------------------------------------------------------------------------
/** 校园红砖钟楼：石基 + 砖塔身 + 四面钟 + 拱窗钟室 + 陡的红尖顶。o.h 是总高。 */
export function clockTower(b, o) {
  const { h = 36 } = o;
  const { rotY, put, hit } = frame(b, o);
  const S = h - 9.5; // 塔身顶
  put(box(8.2, 4.2, 8.2), 'mason#0', 0, 1.1, 0);
  put(box(8.6, 0.4, 8.6), 'mason#2', 0, 3.3, 0);
  put(box(7, S, 7), 'wall#9', 0, S / 2, 0);
  for (const y of [S - 11.6, S - 5.4, S]) put(box(7.5, 0.45, 7.5), 'mason#2', 0, y, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(box(0.7, S, 0.7), 'mason#2', sx * 3.3, S / 2, sz * 3.3);
  const cy = S - 8.5; // 钟面中心
  const by = S - 3.0; // 钟室
  for (let k = 0; k < 4; k++) {
    const a = (k * PI) / 2;
    const face = (geo, key, lx, ly, off) => put(geo, key, Math.sin(a) * (3.5 + off) + Math.cos(a) * lx, ly, Math.cos(a) * (3.5 + off) - Math.sin(a) * lx, a);
    // 钟面：石圈 + 奶油色表盘 + 两根针
    const ring = cyl(2.5, 0.16, 20);
    ring.rotateX(PI / 2);
    face(ring, 'mason#2', 0, cy, 0.06);
    const dial = cyl(2.2, 0.16, 20);
    dial.rotateX(PI / 2);
    face(dial, 'wall#1', 0, cy, 0.16);
    const minute = box(0.14, 1.8, 0.08);
    minute.translate(0, 0.8, 0);
    minute.rotateZ(-0.35 - k * 0.02);
    face(minute, 'iron#0', 0, cy, 0.28);
    const hour = box(0.2, 1.2, 0.08);
    hour.translate(0, 0.5, 0);
    hour.rotateZ(-2.1);
    face(hour, 'iron#0', 0, cy, 0.3);
    // 钟室的两个拱窗
    for (const lx of [-1.3, 1.3]) {
      face(box(1.5, 2.8, 0.14), 'wood#2', lx, by - 0.4, 0.03);
      const top = cyl(0.75, 0.14, 12);
      top.rotateX(PI / 2);
      face(top, 'wood#2', lx, by + 1.0, 0.03);
    }
    // 塔身的细长窗
    for (const y of [7.5, 12.5]) if (y < cy - 4) face(box(0.9, 2.2, 0.12), 'glass#0', 0, y, 0.03);
  }
  // 门
  put(box(2.2, 3.0, 0.2), 'wood#0', 0, 1.5, 4.14);
  put(box(2.8, 0.36, 0.5), 'mason#2', 0, 3.1, 4.2);
  // 尖顶
  put(box(8.0, 0.3, 8.0), 'wood#2', 0, S + 0.36, 0);
  put(hipRoof(8.4, 8.4, 8.0), 'roof#0', 0, S + 4.5, 0);
  put(cyl(0.1, 1.6, 6), 'paint#4', 0, S + 9.0, 0);
  put(ball(0.32), 'paint#4', 0, S + 8.7, 0);
  hit(0, 0, 4.3, 4.3, h);
  return { rotY, h };
}

// ---- 8 仓库 ----------------------------------------------------------------------------------------------------
/** 港口仓库：白墙 + 蓝铁皮人字顶（屋脊沿局部 x）+ 大推拉门 + 一排高窗 + 几只货箱。 */
export function warehouse(b, o) {
  const { w = 30, d = 16, h = 7 } = o;
  const { rotY, at, put, hit } = frame(b, o);
  const zf = d / 2;
  put(box(w + 0.3, 2.0, d + 0.3), 'mason#1', 0, -0.4, 0);
  put(box(w, h, d), 'wall#6', 0, h / 2, 0);
  const rh = d * 0.22;
  put(gableRoof(d + 1.4, w + 1.2, rh), 'roof#9', 0, h + 0.06, 0, PI / 2);
  for (const sx of [-1, 1]) put(gableRoof(d, 0.3, rh * (d / (d + 1.4))), 'wall#6', sx * (w / 2 - 0.16), h, 0, PI / 2);
  put(box(w + 1.3, 0.3, 0.5), 'roof#9', 0, h + rh + 0.1, 0);
  // 推拉门 + 轨
  const dh = Math.min(5, h - 1.6);
  put(box(6.4, dh, 0.2), 'paint#0', 0, dh / 2, zf + 0.06);
  put(box(0.1, dh, 0.26), 'iron#0', 0, dh / 2, zf + 0.07);
  for (const lx of [-1.6, 1.6]) put(box(0.1, dh, 0.24), 'paint#6', lx, dh / 2, zf + 0.07);
  put(box(13, 0.2, 0.3), 'iron#0', 0, dh + 0.12, zf + 0.12);
  // 高窗
  const n = Math.max(3, Math.floor(w / 4));
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + (w / n) * (i + 0.5);
    for (const sz of [-1, 1]) put(box(1.7, 0.9, 0.12), 'glass#0', lx, h - 0.8, sz * (zf + 0.04));
  }
  if (o.sign) b.addSign(o.sign, at(-w * 0.3, h - 2.4, zf + 0.08), rotY, { w: 4.5, h: 1.0, bg: '#1f4b7a', fg: '#ffffff' });
  // 货箱
  const cx = w / 2 - 3.2;
  const crates = [[cx, 0.6, zf + 1.4, 1.2], [cx + 1.5, 0.5, zf + 1.3, 1.0], [cx + 0.6, 1.65, zf + 1.4, 0.9], [-cx, 0.7, zf + 1.5, 1.4]];
  for (const [lx, ly, lz, s] of crates) {
    put(box(s, s, s), 'wood#1', lx, ly, lz);
    put(box(s + 0.06, 0.12, s + 0.06), 'wood#2', lx, ly + s * 0.3, lz);
    put(box(s + 0.06, 0.12, s + 0.06), 'wood#2', lx, ly - s * 0.3, lz);
  }
  hit(0, 0, w / 2 + 0.4, zf + 0.4, h + rh);
  return { rotY, w, d, h: h + rh };
}

// ---- 9 港口吊车 ------------------------------------------------------------------------------------------------
/** 门座起重机：四条腿的门架（可从下面走过）+ 机房 + 斜伸向局部 +z 的臂 + 配重 + 吊钩。 */
export function crane(b, o) {
  const { rotY, at, put, hit } = frame(b, o);
  const K = 'paint#0';
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      put(box(0.9, 9.4, 0.9), K, sx * 5, 4.7, sz * 4);
      put(box(1.6, 0.8, 2.4), 'iron#0', sx * 5, 0.3, sz * 4);
      hit(sx * 5, sz * 4, 0.85, 1.25, 10);
    }
    put(box(1.0, 1.0, 9.0), K, sx * 5, 9.0, 0);
    put(box(0.5, 0.5, 8.0), K, sx * 5, 4.4, 0);
  }
  for (const sz of [-1, 1]) put(box(11, 1.0, 1.0), K, 0, 9.0, sz * 4);
  put(box(8, 0.6, 7), K, 0, 9.7, 0);
  put(cyl(2.4, 0.9, 14), 'iron#0', 0, 10.4, 0);
  // 机房 + 驾驶室
  put(box(5, 4, 7), K, 0, 12.8, -1);
  put(box(5.3, 0.3, 7.3), 'wall#6', 0, 14.95, -1);
  put(box(2.2, 2.0, 2.2), 'wall#6', 2.0, 11.6, 3.4);
  put(box(2.0, 1.0, 0.12), 'glass#1', 2.0, 11.9, 4.54);
  put(box(0.12, 1.0, 1.8), 'glass#1', 3.14, 11.9, 3.4);
  // 人字架
  put(box(0.6, 9.2, 0.6), K, -1.2, 19.4, -0.6);
  put(box(0.6, 9.2, 0.6), K, 1.2, 19.4, -0.6);
  put(box(3.2, 0.6, 0.8), K, 0, 24.0, -0.6);
  // 臂：从 (y=13.4, z=2.6) 以 35° 伸出 20 m
  const A = (35 * PI) / 180;
  const L = 20;
  const tipY = 13.4 + Math.sin(A) * L;
  const tipZ = 2.6 + Math.cos(A) * L;
  for (const lx of [-0.8, 0.8]) {
    const g = box(0.5, 0.7, L);
    g.rotateX(-A);
    put(g, K, lx, (13.4 + tipY) / 2, (2.6 + tipZ) / 2);
  }
  for (let i = 1; i <= 5; i++) {
    const t = i / 5.5;
    put(box(2.0, 0.3, 0.3), K, 0, 13.4 + Math.sin(A) * L * t, 2.6 + Math.cos(A) * L * t);
  }
  // 拉杆：人字架顶到臂尖
  const dz = tipZ + 0.6;
  const dy = tipY - 24.0;
  const tie = box(0.2, 0.2, Math.hypot(dz, dy));
  tie.rotateX(-Math.atan2(dy, dz));
  put(tie, 'iron#0', 0, (24.0 + tipY) / 2, (tipZ - 0.6) / 2);
  // 配重臂
  put(box(1.4, 1.2, 7), K, 0, 13.4, -7);
  put(box(3.2, 2.6, 2.6), 'mason#1', 0, 12.9, -9.6);
  const back = box(0.2, 0.2, Math.hypot(9, 10.4));
  back.rotateX(Math.atan2(10.4, 9));
  put(back, 'iron#0', 0, 18.8, -5.1);
  // 吊索 + 吊钩
  const cl = tipY - 7.5;
  put(cyl(0.06, cl, 5), 'iron#0', 0, tipY - cl / 2, tipZ - 0.2);
  put(box(0.7, 0.9, 0.7), 'paint#1', 0, tipY - cl - 0.3, tipZ - 0.2);
  put(new THREE.TorusGeometry(0.3, 0.07, 4, 8, PI * 1.4), 'iron#0', 0, tipY - cl - 1.0, tipZ - 0.2);
  return { rotY, h: tipY, tip: at(0, tipY, tipZ) };
}

// ---- 10 集装箱 -------------------------------------------------------------------------------------------------
/** 一小堆集装箱：长边沿局部 x，底层并排，其余叠在上面。 */
export function containers(b, o) {
  const { n = 5 } = o;
  const { rotY, put, hit } = frame(b, o);
  const keys = ['paint#1', 'cloth#0', 'cloth#1', 'cloth#4', 'paint#2'];
  const ground = Math.ceil(n * 0.6);
  for (let i = 0; i < n; i++) {
    const up = i >= ground;
    const k = up ? i - ground : i;
    const lz = (k - (ground - 1) / 2) * 2.7 + (up ? 0.2 : 0);
    const lx = up ? 0.5 : (k % 2) * 0.4 - 0.2;
    const ly = (up ? 2.62 : 0) + 1.32;
    put(box(6, 2.6, 2.5), keys[i % keys.length], lx, ly, lz);
    // 箱门的线
    for (const dzz of [-1.1, 0, 1.1]) put(box(0.08, 2.4, 0.08), 'iron#0', lx + 3.0, ly, lz + dzz);
    put(box(0.06, 0.1, 2.3), 'iron#0', lx + 3.01, ly, lz);
  }
  hit(0, 0, 3.4, (ground * 2.7) / 2 + 0.2, n > ground ? 5.4 : 2.8);
  return { rotY, w: 6.8, d: ground * 2.7 + 0.4 };
}

// ---- 11 高铁站 -------------------------------------------------------------------------------------------------
/** 高铁站：玻璃筒拱大厅 + 两侧平顶配楼 + 正面柱廊雨篷 + 站前石铺地；背面是站台雨棚。 */
export function grandStation(b, o) {
  const { w = 70, d = 30, h = 18, sign = '高铁站' } = o;
  const { rotY, at, put, hit } = frame(b, o);
  const pY = o.platformY ?? 1.0;
  const L = w * 0.6; // 大厅长
  const W = 7; // 墙高
  const zf = d / 2;
  const ry = h - W;
  put(box(w + 0.6, 2.0, d + 0.6), 'mason#2', 0, -0.7, 0);
  put(box(L, W, d), 'wall#6', 0, W / 2, 0);
  put(box(L + 0.5, 0.5, d + 0.5), 'wall#7', 0, W + 0.1, 0);
  // 筒拱 + 白肋 + 脊
  put(vault(L - 0.6, zf - 0.1, ry, 16), 'glass#1', 0, W + 0.3, 0);
  for (let i = 0; i < 9; i++) put(rib(zf, ry + 0.1, 0.36), 'wall#6', -L / 2 + 0.4 + ((L - 0.8) * i) / 8, W + 0.3, 0);
  put(box(L, 0.4, 0.6), 'wall#6', 0, W + 0.3 + ry + 0.1, 0);
  for (const sz of [-1, 1]) put(box(L, 0.3, 0.4), 'wall#6', 0, W + 0.3 + ry * 0.72, sz * zf * 0.7);
  // 两头的半圆玻璃山墙 + 竖梃
  for (const sx of [-1, 1]) {
    put(halfDisc(zf - 0.5, ry - 0.4, 0.3, 16), 'glass#2', sx * (L / 2 - 0.5), W + 0.3, 0);
    for (const t of [-0.5, 0, 0.5]) {
      const mh = (ry - 0.4) * Math.sqrt(1 - t * t);
      put(box(0.3, mh, 0.3), 'wall#6', sx * (L / 2 - 0.3), W + 0.3 + mh / 2, t * (zf - 0.5));
    }
  }
  // 配楼
  const ww = (w - L) / 2;
  const wd = d * 0.8;
  for (const sx of [-1, 1]) {
    const cx = sx * (L / 2 + ww / 2);
    put(box(ww, W, wd), 'wall#7', cx, W / 2, 0);
    put(box(ww + 0.5, 0.5, wd + 0.6), 'wall#6', cx + sx * 0.1, W + 0.1, 0);
    for (const sz of [-1, 1]) {
      put(box(ww - 2, 1.6, 0.14), 'glass#1', cx, 4.8, sz * (wd / 2 + 0.04));
      put(box(ww - 2, 1.8, 0.14), 'glass#1', cx, 1.9, sz * (wd / 2 + 0.04));
    }
    put(box(0.14, 1.6, wd - 4), 'glass#1', sx * (w / 2 + 0.04), 4.8, 0);
  }
  // 正面：暖光玻璃入口 + 竖梃
  const gw = L * 0.72;
  put(box(gw, 5.0, 0.2), 'glass#3', 0, 2.9, zf + 0.05);
  for (let i = 0; i <= 8; i++) put(box(0.2, 5.0, 0.3), 'wall#6', -gw / 2 + (gw * i) / 8, 2.9, zf + 0.07);
  put(box(gw + 0.3, 0.3, 0.34), 'wall#6', 0, 5.5, zf + 0.07);
  // 雨篷 + 8 根圆柱
  const cw = L * 0.9;
  put(box(cw, 0.5, 7.4), 'wall#6', 0, 6.4, zf + 3.6);
  for (let i = 0; i < 8; i++) {
    const lx = -cw / 2 + 1.2 + ((cw - 2.4) * i) / 7;
    put(cyl(0.45, 6.2, 12), 'mason#2', lx, 3.1, zf + 6.4);
    put(cyl(0.62, 0.3, 12), 'mason#0', lx, 0.3, zf + 6.4);
  }
  // 站名
  const sw = Math.min(16, L * 0.4);
  put(box(sw + 0.8, 4.0, 0.4), 'wall#6', 0, 8.65, zf + 6.6);
  b.addSign(sign, at(0, 8.65, zf + 6.83), rotY, { w: sw, h: 3.3, bg: '#1f4b7a', fg: '#ffffff' });
  // 站前铺地（往前 14 m）
  put(box(w, 1.4, 14), 'mason#2', 0, -0.55, zf + 7.2);
  put(box(w * 0.5, 0.06, 0.5), 'mason#1', 0, 0.16, zf + 10.5);
  if (o.y == null) {
    for (const lx of [-w * 0.4, -w * 0.15, w * 0.15, w * 0.4]) {
      const p = at(lx, 0, zf + 12.5);
      lamp(b, p[0], p[2], rotY);
    }
  }
  // 背面：站台 + 雨棚（80 m）+ 候车长椅
  const pz = -(zf + 6);
  const pl = o.platformLen ?? 80;
  put(box(pl, pY + 1.2, 6), 'mason#2', 0, (pY - 1.2) / 2, pz);
  put(box(pl, 0.05, 0.4), 'flower#1', 0, pY + 0.03, pz - 2.4);
  put(box(pl, 0.3, 7.4), 'roof#9', 0, pY + 4.7, pz);
  put(box(pl, 0.4, 0.5), 'wall#6', 0, pY + 4.4, pz + 1.6);
  for (let i = 0; i < 9; i++) put(cyl(0.22, 4.5, 8), 'wall#6', -pl / 2 + 2 + ((pl - 4) * i) / 8, pY + 2.25, pz + 1.6);
  const benches = [];
  for (const bx of [-10, 10]) {
    put(box(4.6, 0.12, 0.7), 'wood#1', bx, pY + 0.5, pz + 1.0);
    for (const lx of [-1.8, 1.8]) put(box(0.12, 0.5, 0.6), 'wood#2', bx + lx, pY + 0.25, pz + 1.0);
    const bp = at(bx, pY + 0.48, pz + 1.0);
    benches.push({ x: bp[0], y: bp[1], z: bp[2], yaw: rotY + PI });
  }
  hit(0, 0, L / 2 + 0.4, zf + 0.4, h + 2);
  for (const sx of [-1, 1]) hit(sx * (L / 2 + ww / 2), 0, ww / 2 + 0.4, wd / 2 + 0.4, W + 2);
  // 站台与站台旁高架轨面都可站立，不会踩空掉下去
  hit(0, pz, pl / 2, 3.1, pY);
  hit(0, pz - 5.5, pl / 2, 4.2, pY - 0.25);
  return { rotY, w, d, h, platform: at(0, pY, pz), benches };
}

// ---- 12 乡村小站 -----------------------------------------------------------------------------------------------
/** 高架旁的乡间小站：轨道沿局部 x（z=0），站台、木雨棚在 +z 侧，地面售票小屋 + 一跑楼梯。 */
export function smallStation(b, o) {
  const { rotY, base, at, put, hit } = frame(b, o);
  const name = o.name ?? '小站';
  const ph = Math.max(0.6, (o.deckY ?? base + 7) - base) + 0.3; // 站台面离地（与车厢地板齐平）
  const pz = o.platZ ?? 6.2; // 紧贴轨道边缘（消除站台与车门间缝隙）
  const run = Math.max(1, Math.ceil((ph - 0.1) / 0.35)) * 0.5;
  const sx0 = -7.5;

  // ---- 双向双侧站台（+pz 主站台 & -pz 对侧站台，两侧列车均可直接登车） ----
  for (const side of [1, -1]) {
    const spz = side * pz;
    put(box(34, 0.5, 4.8), 'mason#2', 0, ph - 0.25, spz);
    // 站台内侧安全黄线
    put(box(34, 0.05, 0.28), 'flower#1', 0, ph + 0.02, spz - side * 2.15);
    put(box(34, 0.6, 0.5), 'mason#1', 0, ph - 0.7, spz);
    for (const lx of [-14, -7, 0, 7, 14]) {
      put(box(1.2, ph + 0.6, 2.4), 'mason#1', lx, (ph - 1.4) / 2, spz);
      hit(lx, spz, 0.7, 1.3, ph);
    }
    // 外侧护栏：+1 侧在楼梯口（lx = -run/2 - 2.6 .. -run/2 + 0.8）留出宽敞无遮挡开口！
    const railZ = spz + side * 2.3;
    if (side === 1) {
      const gapL = -run / 2 - 2.4;
      const gapR = -run / 2 + 0.8;
      const leftLen = Math.max(0.2, gapL - -17);
      const rightLen = Math.max(0.2, 17 - gapR);
      if (leftLen > 0.4) put(box(leftLen, 0.1, 0.1), 'wood#2', -17 + leftLen / 2, ph + 1.0, railZ);
      if (rightLen > 0.4) put(box(rightLen, 0.1, 0.1), 'wood#2', gapR + rightLen / 2, ph + 1.0, railZ);
      for (let lx = -16.8; lx <= 16.81; lx += 2.8) {
        if (lx < gapL || lx > gapR) put(box(0.12, 1.0, 0.12), 'wood#2', lx, ph + 0.5, railZ);
      }
    } else {
      put(box(34, 0.1, 0.1), 'wood#2', 0, ph + 1.0, railZ);
      for (let lx = -16.8; lx <= 16.81; lx += 2.8) put(box(0.12, 1.0, 0.12), 'wood#2', lx, ph + 0.5, railZ);
    }
    // 木雨棚 + 候车长椅 + 站名牌（两侧站台均有）
    for (const lx of [-6.5, 0, 6.5]) for (const dz of [-1.3, 1.3]) put(box(0.26, 3.0, 0.26), 'wood#1', sx0 + lx, ph + 1.5, spz + dz);
    put(box(13.4, 2.0, 0.14), 'wood#0', sx0, ph + 1.9, spz + side * 1.3);
    put(box(13.8, 0.24, 3.3), 'wood#2', sx0, ph + 3.05, spz);
    put(gableRoof(4.8, 15, 1.3), 'roof#10', sx0, ph + 3.15, spz, PI / 2);
    put(box(5, 0.12, 0.7), 'wood#1', sx0, ph + 0.5, spz + side * 0.85);
    for (const lx of [-2, 2]) put(box(0.12, 0.5, 0.6), 'wood#2', sx0 + lx, ph + 0.25, spz + side * 0.85);
    b.addSign(name, at(sx0, ph + 2.0, spz + side * 1.4), rotY + (side < 0 ? PI : 0), { w: 5.0, h: 1.1, bg: '#1f4b7a', fg: '#ffffff' });
    b.addSign(name, at(sx0, ph + 2.0, spz + side * 1.2), rotY + (side < 0 ? 0 : PI), { w: 5.0, h: 1.1, bg: '#1f4b7a', fg: '#ffffff' });
    // 站台可行走碰撞面
    hit(0, spz, 17, 2.5, ph);
  }
  // ---- 昭和木构跨线人行天桥（位于站台 +x 端，净空高过受电弓，完全不切断下方双股钢轨！） ----
  // 站台下方钢轨保持 100% 连续无遮挡，两侧站台通过架空木天桥相连
  const bx = 13.6;
  const overH = 4.75; // 桥面离站台高度（净空 ~4.55m，高出列车受电弓 4.25m）
  const overY = ph + overH;
  const spanZ = pz * 2 + 1.8;
  // 天桥主梁与木质桥面
  put(box(2.4, 0.28, spanZ), 'wood#2', bx, overY - 0.14, 0);
  put(box(2.1, 0.08, spanZ - 0.2), 'bridge#0', bx, overY + 0.02, 0);
  hit(bx, 0, 1.25, spanZ / 2, overY + 0.04);
  // 天桥廊柱、扶手、观景玻璃与人字瓦顶
  for (const dz of [-pz - 0.6, -pz + 1.6, 0, pz - 1.6, pz + 0.6]) {
    for (const dx of [-1.05, 1.05]) {
      put(box(0.16, 2.35, 0.16), 'wood#2', bx + dx, overY + 1.18, dz);
    }
  }
  for (const dx of [-1.05, 1.05]) {
    put(box(0.14, 0.95, spanZ - 0.6), 'wood#1', bx + dx, overY + 0.5, 0);
    put(box(0.08, 1.05, spanZ - 1.0), 'glass#1', bx + dx, overY + 1.55, 0);
  }
  // 支撑落柱（落在两侧站台外沿，不挡轨面）
  for (const side of [-1, 1]) {
    for (const dx of [-1.05, 1.05]) {
      put(box(0.24, overH + 0.3, 0.24), 'wood#2', bx + dx, ph + overH / 2 - 0.1, side * (pz + 0.6));
    }
  }
  // 天桥青瓦人字屋顶
  put(gableRoof(2.9, spanZ + 0.8, 0.95), 'roof#10', bx, overY + 2.35, 0);
  // 天桥两侧楼梯（分别沿 +/-z 站台向 -x 方向自然落地，18 级平稳上下）
  const oRun = 7.2;
  const oSteps = 18;
  const oRise = overH / oSteps;
  for (const side of [-1, 1]) {
    const osz = side * (pz + 0.95);
    for (let i = 0; i < oSteps; i++) {
      const top = ph + oRise * (i + 1);
      const lx = bx - 1.2 - oRun + (oRun / oSteps) * (i + 0.5);
      put(box(oRun / oSteps + 0.08, 0.16, 1.45), 'bridge#0', lx, top - 0.08, osz);
      hit(lx, osz, (oRun / oSteps) * 0.58, 0.78, top);
    }
    const osl = Math.hypot(oRun, overH);
    const oAng = Math.atan2(overH, oRun);
    for (const dz of [-0.68, 0.68]) {
      const str = box(osl, 0.22, 0.10);
      str.rotateZ(oAng);
      put(str, 'wood#2', bx - 1.2 - oRun / 2, ph + overH / 2 - 0.15, osz + dz);
      const hr = box(osl, 0.09, 0.09);
      hr.rotateZ(oAng);
      put(hr, 'wood#2', bx - 1.2 - oRun / 2, ph + overH / 2 + 0.82, osz + dz);
    }
  }
  // 轨道区隐形安全防掉落碰撞层（低于钢轨顶，视觉上四条钢轨 100% 连续无遮挡）
  hit(0, 0, 17.5, pz + 2.2, ph - 0.16);

  // ---- 楼梯：贴着 +z 站台外侧，从 +x 地面往 -x 爬到站台，顶部无栏杆阻挡 ----
  const n = Math.round(run / 0.5);
  const sz = pz + 2.4 + 0.9;
  const rise = ph / n;
  for (let i = 0; i < n; i++) {
    const top = rise * (i + 1);
    put(box(0.56, 0.2, 1.7), 'bridge#0', run / 2 - 0.5 * (i + 0.5), top - 0.1, sz);
  }
  // 楼梯顶部衔接平台（与站台平滑相接，零缝隙）+ 外侧防掉落护栏
  put(box(2.6, 0.26, 1.9), 'bridge#0', -run / 2 - 1.1, ph - 0.13, sz);
  hit(-run / 2 - 1.1, sz, 1.4, 1.0, ph);
  // 顶部平台尽头与外侧护栏（避免走上楼梯后一脚踩空）
  put(box(0.14, 1.05, 1.9), 'wood#2', -run / 2 - 2.35, ph + 0.52, sz);
  put(box(2.6, 0.12, 0.12), 'wood#2', -run / 2 - 1.1, ph + 0.95, sz + 0.88);
  hit(-run / 2 - 2.4, sz, 0.2, 1.0, ph + 1.5);
  hit(-run / 2 - 1.1, sz + 0.95, 1.4, 0.18, ph + 1.5);

  const sl = Math.hypot(run, ph);
  for (const dz of [-0.8, 0.8]) {
    const g = box(sl, 0.34, 0.14);
    g.rotateZ(-Math.atan2(ph, run));
    put(g, 'wood#2', 0.2, ph / 2 - 0.25, sz + dz);
    const hr = box(sl, 0.1, 0.1);
    hr.rotateZ(-Math.atan2(ph, run));
    put(hr, 'wood#2', 0.2, ph / 2 + 0.85, sz + dz);
  }
  const posts = Math.max(1, Math.round(run / 3));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const lx = run / 2 - run * t * 0.96;
    const hh = ph * t * 0.96;
    for (const dz of [-0.8, 0.8]) put(box(0.16, hh + 1.0, 0.16), 'wood#2', lx, (hh + 1.0) / 2 - 0.05, sz + dz);
  }
  for (let i = 0; i < n; i++) hit(run / 2 - 0.5 * (i + 0.5), sz, 0.29, 0.85, rise * (i + 1));

  // ---- 昭和木质检票闸机（位于楼梯入口处：买票后按 E 检票放行！） ----
  const gx = run / 2 + 0.7;
  const gz = sz;
  for (const dz of [-0.95, 0.95]) {
    put(box(0.55, 1.15, 0.32), 'wood#2', gx, 0.58, gz + dz);
    put(box(0.62, 0.12, 0.38), 'paint#4', gx, 1.18, gz + dz);
  }
  // 检票闸机顶梁与标牌
  put(box(0.22, 0.22, 2.2), 'wood#2', gx, 2.35, gz);
  for (const dz of [-0.95, 0.95]) put(box(0.18, 2.35, 0.18), 'wood#2', gx, 1.18, gz + dz);
  b.addSign('检票口', at(gx + 0.14, 2.35, gz), rotY + PI / 2, { w: 1.8, h: 0.45, bg: '#2f6d97', fg: '#fff8e6' });
  // 闸机碰撞体（未检票时挡住楼梯入口；检票通过后 off = true 放行）
  const gateCol = hit(gx, gz, 0.38, 1.05, 2.2);
  const gatePos = at(gx + 0.6, 0, gz);

  // ---- 售票小屋（地面，楼梯脚旁） ----
  const hx = o.houseX ?? run / 2 + 4.8;
  const hz = o.houseZ ?? 14;
  put(box(6.4, 1.6, 5.4), 'mason#0', hx, -0.5, hz);
  put(box(6, 3.2, 5), 'wood#1', hx, 1.9, hz);
  for (const ax of [-1, 1]) for (const az of [-1, 1]) put(box(0.3, 3.2, 0.3), 'wood#2', hx + ax * 2.9, 1.9, hz + az * 2.4);
  put(box(6.5, 0.24, 5.5), 'wood#2', hx, 3.55, hz);
  put(gableRoof(6.6, 7.4, 1.9), 'roof#10', hx, 3.65, hz, PI / 2);
  for (const ax of [-1, 1]) put(gableRoof(5, 0.24, 1.9 * (5 / 6.6)), 'wood#1', hx + ax * 2.86, 3.6, hz, PI / 2);
  put(box(1.2, 2.1, 0.14), 'wood#0', hx - 1.6, 1.35, hz + 2.54);
  put(box(2.0, 1.1, 0.14), 'glass#3', hx + 1.2, 2.0, hz + 2.54);
  put(box(2.3, 0.14, 0.5), 'wood#2', hx + 1.2, 1.38, hz + 2.7);
  put(box(4.0, 0.9, 0.12), 'wood#2', hx, 3.2, hz + 2.6);
  b.addSign(name, at(hx, 3.2, hz + 2.68), rotY, { w: 3.6, h: 0.72, bg: '#1f4b7a', fg: '#ffffff' });
  hit(hx, hz, 3.3, 2.8, 5.6);

  const bp1 = at(sx0, ph + 0.48, pz + 0.85);
  const bp2 = at(sx0, ph + 0.48, -pz - 0.85);
  return {
    rotY,
    platform: at(0, ph, pz),
    platformOpp: at(0, ph, -pz),
    booth: at(hx, 0, hz + 3.6),
    boothCenter: at(hx, 0, hz),
    platformH: ph,
    stairRun: run,
    gate: { x: gatePos[0], y: gatePos[1], z: gatePos[2], col: gateCol },
    benches: [
      { x: bp1[0], y: bp1[1], z: bp1[2], yaw: rotY + PI },
      { x: bp2[0], y: bp2[1], z: bp2[2], yaw: rotY },
    ],
    bench: { x: bp1[0], y: bp1[1], z: bp1[2], yaw: rotY + PI },
  };
}

// ---- 13 风车 / 14 水磨坊 ---------------------------------------------------------------------------------------
/** 风车塔身（不含风叶）：白灰泥圆塔或木八角塔 + 尖帽 + 走廊。返回风叶轴心 { hub, rotY, r }。 */
export function windmill(b, o) {
  const { h = 13, wood = false } = o;
  const { rotY, at, put, hit } = frame(b, o);
  const rb = h * 0.27;
  const rt = h * 0.17;
  const seg = wood ? 8 : 14;
  const rAt = (y) => rb + ((rt - rb) * y) / h;
  put(cyl(rb + 0.35, 1.8, seg), 'mason#0', 0, 0.1, 0);
  put(cyl(rb, h, seg, rt), wood ? 'wood#1' : 'wall#6', 0, h / 2, 0);
  put(cyl(rt + 0.3, 0.4, seg), 'wood#2', 0, h - 0.1, 0);
  // 帽
  const ch = h * 0.24;
  put(cone(rt + 0.6, ch, seg), wood ? 'wood#2' : 'roof#0', 0, h + 0.1 + ch / 2, 0);
  put(ball(0.22), 'paint#4', 0, h + ch + 0.2, 0);
  // 走廊
  if (h >= 9) {
    const gy = h * 0.36;
    const gr = rAt(gy) + 1.1;
    put(cyl(gr, 0.2, seg), 'wood#1', 0, gy, 0);
    const ring = new THREE.TorusGeometry(gr - 0.08, 0.06, 4, seg);
    ring.rotateX(PI / 2);
    put(ring, 'wood#2', 0, gy + 0.95, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + PI / 8;
      put(box(0.1, 0.95, 0.1), 'wood#2', Math.cos(a) * (gr - 0.08), gy + 0.5, Math.sin(a) * (gr - 0.08));
      const br = box(0.1, 0.1, 1.5);
      br.rotateX(0.7);
      put(br, 'wood#2', Math.sin(a) * (gr - 0.6), gy - 0.55, Math.cos(a) * (gr - 0.6), a);
    }
  }
  // 门、窗
  put(box(1.3, 2.2, 0.5), 'wood#0', 0, 1.1, rb - 0.2);
  put(box(1.7, 0.24, 0.6), 'mason#1', 0, 2.3, rb - 0.2);
  for (const [sx, wy] of [[1, h * 0.6], [-1, h * 0.78]]) put(box(0.5, 1.0, 0.8), 'glass#0', sx * (rAt(wy) - 0.12), wy, 0);
  put(box(0.8, 1.0, 0.5), 'glass#0', 0, h * 0.62, -(rAt(h * 0.62) - 0.12));
  // 风叶的轴
  const hubY = h + ch * 0.3;
  const hubZ = rt + 1.4;
  const ax = cyl(0.24, hubZ, 8);
  ax.rotateX(PI / 2);
  put(ax, 'wood#2', 0, hubY, hubZ / 2);
  hit(0, 0, rb + 0.3, rb + 0.3, h + ch);
  return { hub: at(0, hubY, hubZ), rotY, r: h * 0.62 };
}

/** 河边的茅草水磨坊（不含水轮）：轮轴从局部 +x 墙伸出。返回 { hub, rotY, r }。 */
export function waterMill(b, o) {
  const { rotY, at, put, hit } = frame(b, o);
  put(box(10.4, 3.0, 7.4), 'mason#0', 0, -0.5, 0);
  put(box(10, 3.6, 7), 'wood#1', 0, 2.8, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(box(0.36, 3.6, 0.36), 'wood#2', sx * 4.9, 2.8, sz * 3.4);
  put(box(10.3, 0.3, 7.3), 'wood#2', 0, 4.55, 0);
  // 厚茅草顶（屋脊沿 x）+ 苔色的檐边和脊
  put(gableRoof(9.4, 10.8, 3.6), 'paint#8', 0, 4.7, 0, PI / 2);
  put(gableRoof(9.9, 10.5, 1.2), 'roof#4', 0, 4.6, 0, PI / 2);
  put(box(11.0, 0.5, 1.3), 'roof#4', 0, 8.15, 0);
  for (const sx of [-1, 1]) put(gableRoof(7, 0.24, 3.6 * (7 / 9.4)), 'wood#1', sx * 4.86, 4.66, 0, PI / 2);
  put(box(0.9, 2.2, 0.9), 'mason#0', -2.8, 7.4, -1.2);
  // 门窗
  put(box(1.3, 2.2, 0.16), 'wood#0', -1.6, 2.1, 3.54);
  put(box(1.6, 0.2, 0.9), 'mason#1', -1.6, 0.9, 3.9);
  put(box(1.4, 1.1, 0.14), 'glass#3', 2.0, 2.9, 3.54);
  put(box(1.7, 0.14, 0.4), 'wood#2', 2.0, 2.25, 3.66);
  put(box(0.14, 1.1, 1.4), 'glass#3', -5.04, 2.9, 0);
  // 轮轴 + 轴承座
  const ax = cyl(0.22, 2.0, 8);
  ax.rotateZ(PI / 2);
  put(ax, 'wood#2', 5.9, 3.0, 0);
  put(box(0.3, 1.0, 1.0), 'wood#2', 5.1, 3.0, 0);
  hit(0, 0, 5.3, 3.8, 8.4);
  return { hub: at(6.2, 3.0, 0), rotY, r: 3.4 };
}

// ---- 15 温室 ---------------------------------------------------------------------------------------------------
/** 维多利亚式玻璃温室：石勒脚 + 玻璃墙 + 白框 + 玻璃筒拱顶。 */
export function greenhouse(b, o) {
  const { w = 20, d = 12, h = 8 } = o;
  const { rotY, put, hit } = frame(b, o);
  const W = h * 0.5;
  const zf = d / 2;
  const ry = h - W;
  put(box(w + 0.4, 2.0, d + 0.4), 'mason#2', 0, -0.1, 0);
  put(box(w, W - 0.8, d), 'glass#2', 0, 0.8 + (W - 0.8) / 2, 0);
  put(box(w + 0.3, 0.26, d + 0.3), 'wall#6', 0, W, 0);
  put(box(w + 0.16, 0.14, d + 0.16), 'wall#6', 0, W * 0.6, 0);
  const n = Math.max(3, Math.round(w / 2.5));
  for (let i = 0; i <= n; i++) {
    const lx = -w / 2 + (w * i) / n;
    for (const sz of [-1, 1]) put(box(0.2, W - 0.8, 0.2), 'wall#6', lx, 0.8 + (W - 0.8) / 2, sz * zf);
    put(rib(zf, ry, 0.16, 14), 'wall#6', lx, W + 0.1, 0);
  }
  for (const sx of [-1, 1]) for (const lz of [-zf / 2, 0, zf / 2]) put(box(0.2, W - 0.8, 0.2), 'wall#6', sx * (w / 2), 0.8 + (W - 0.8) / 2, lz);
  put(vault(w - 0.2, zf - 0.08, ry - 0.08, 14), 'glass#1', 0, W + 0.1, 0);
  put(box(w + 0.2, 0.26, 0.4), 'wall#6', 0, W + 0.1 + ry, 0);
  for (const sx of [-1, 1]) {
    put(halfDisc(zf - 0.3, ry - 0.3, 0.2, 14), 'glass#2', sx * (w / 2 - 0.2), W + 0.1, 0);
    put(box(0.24, ry - 0.3, 0.2), 'wall#6', sx * (w / 2 - 0.05), W + 0.1 + (ry - 0.3) / 2, 0);
  }
  // 门
  put(box(2.2, 3.0, 0.24), 'wall#6', 0, 1.5, zf + 0.06);
  put(box(1.7, 2.5, 0.3), 'glass#1', 0, 1.45, zf + 0.06);
  put(box(0.1, 2.5, 0.34), 'wall#6', 0, 1.45, zf + 0.06);
  put(box(2.6, 0.2, 1.0), 'mason#1', 0, 0.0, zf + 0.5);
  hit(0, 0, w / 2 + 0.3, zf + 0.3, h);
  return { rotY, w, d, h };
}

// ---- 16 高架铁路 -----------------------------------------------------------------------------------------------
/** 折线的累计弧长采样器：at(s) 给出弧长 s 处的点。 */
function sampler(path) {
  const n = path.length;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
  const total = cum[n - 1];
  const at = (s) => {
    s = Math.min(total, Math.max(0, s));
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= s) lo = m;
      else hi = m;
    }
    const a = path[lo];
    const c = path[hi];
    const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
  };
  return { total, at, cum };
}

/** 石拱高架铁路：桥面 + 护墙 + 道砟 + 两对钢轨，每隔 pierEvery 一个墩，墩间一道拱肋。path 的 y 是桥面顶。 */
export function viaduct(b, path, opts = {}) {
  const { width = 8, pierEvery = 24, groundAt = heightAt, skip = null, stationZones = [] } = opts;
  if (!path || path.length < 2) return { piers: [], total: 0 };
  const T = 1.1; // 桥面厚
  const inStation = (x, z) => stationZones.some(([sx, sz, sr = 24]) => Math.hypot(x - sx, z - sz) < sr);
  // 一段桥面：a → c
  const seg = (a, c) => {
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const dz = c[2] - a[2];
    const lh = Math.hypot(dx, dz);
    if (lh < 0.01) return;
    const len = Math.hypot(lh, dy) + 0.5;
    const rotY = Math.atan2(dx, dz);
    const pitch = Math.atan2(dy, lh);
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const mx = (a[0] + c[0]) / 2;
    const my = (a[1] + c[1]) / 2;
    const mz = (a[2] + c[2]) / 2;
    const place = (geo, key, lx, ly) => {
      geo.rotateX(-pitch);
      b.add(geo, key, [mx + lx * cos, my + ly, mz - lx * sin], rotY);
    };
    place(box(width, T, len), 'mason#4', 0, -T / 2);
    place(box(width + 0.3, 0.22, len), 'mason#3', 0, -T + 0.02);
    // 车站站台区段按 2m 精细步进精准断开高架石墙护栏：与站台端头严丝合缝衔接，绝不留锯齿空隙！
    const subN = Math.max(1, Math.ceil(len / 2.0));
    const subLen = len / subN + 0.06;
    for (let k = 0; k < subN; k++) {
      const t = (k + 0.5) / subN;
      const sxp = a[0] + dx * t;
      const syp = a[1] + dy * t;
      const szp = a[2] + dz * t;
      if (inStation(sxp, szp)) continue;
      for (const sx of [-1, 1]) {
        const g = box(0.4, 0.95, subLen);
        g.rotateX(-pitch);
        b.add(g, 'mason#4', [sxp + sx * (width / 2 - 0.2) * cos, syp + 0.42, szp - sx * (width / 2 - 0.2) * sin], rotY);
      }
    }
    place(box(width - 1.6, 0.12, len), 'mason#1', 0, 0.06);
    for (const tx of [-width * 0.24, width * 0.24]) for (const g of [-0.72, 0.72]) place(box(0.12, 0.16, len), 'iron#0', tx + g, 0.2);
  };
  // 近乎直线的几个点并成一段（最多 4 段路径）
  const straight = (i, j) => {
    const a = path[i];
    const c = path[j];
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const dz = c[2] - a[2];
    const l2 = dx * dx + dy * dy + dz * dz || 1;
    for (let k = i + 1; k < j; k++) {
      const p = path[k];
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / l2;
      if (Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t, p[2] - a[2] - dz * t) > 0.1) return false;
    }
    return true;
  };
  let i = 0;
  while (i < path.length - 1) {
    let j = i + 1;
    while (j + 1 < path.length && j - i < 4 && straight(i, j + 1)) j++;
    seg(path[i], path[j]);
    i = j;
  }
  // 墩 + 拱肋
  const sp = sampler(path);
  const n = Math.max(1, Math.round(sp.total / pierEvery));
  const step = sp.total / n;
  const piers = [];
  let prev = null;
  for (let k = 0; k <= n; k++) {
    const p = sp.at(k * step);
    const q0 = sp.at(k * step - 1);
    const q1 = sp.at(k * step + 1);
    const rotY = Math.atan2(q1[0] - q0[0], q1[2] - q0[2]);
    const g = groundAt(p[0], p[2]);
    const under = p[1] - T;
    if (under - g >= 1.6 && !(skip && skip(p[0], p[2]))) {
      const hgt = under - g + 1.2;
      const geo = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * 1.22, hgt, 4, 1);
      geo.rotateY(PI / 4);
      geo.scale(width * 0.78, 1, 2.6);
      b.add(geo, 'mason#3', [p[0], under - hgt / 2 + 0.05, p[2]], rotY);
      b.add(box(width * 0.86, 0.4, 3.0), 'mason#4', [p[0], under - 0.3, p[2]], rotY);
      collideRot(b, p[0], p[2], rotY, width * 0.48, 1.6, under - g);
      piers.push([p[0], p[1], p[2]]);
    }
    if (prev) {
      const dx = p[0] - prev[0];
      const dz = p[2] - prev[2];
      const R = Math.hypot(dx, dz) / 2;
      const mid = sp.at((k - 0.5) * step);
      const mu = Math.min(mid[1], (p[1] + prev[1]) / 2) - T;
      if (R > 2 && mu - groundAt(mid[0], mid[2]) >= 1.6) {
        const arch = new THREE.TorusGeometry(R, 0.7, 6, 14, PI);
        arch.rotateY(PI / 2);
        arch.scale((width * 0.72) / 1.4, 1, 1);
        b.add(arch, 'mason#3', [(p[0] + prev[0]) / 2, mu - R - 0.55, (p[2] + prev[2]) / 2], Math.atan2(dx, dz));
      }
    }
    prev = p;
  }
  return { piers, total: sp.total };
}

// ---- 17 栈桥 / 18 防波堤 / 19 灯标 -----------------------------------------------------------------------------
/** 木栈桥：从 (x,z) 沿局部 +z 伸出 len，桥面顶在绝对高度 o.top。不登记碰撞。 */
export function pier(b, o) {
  const { x, z, rotY = 0, len = 30, w = 4, top = 1 } = o;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const put = (geo, key, lx, ly, lz) => b.add(geo, key, [x + lx * cos + lz * sin, top + ly, z - lx * sin + lz * cos], rotY);
  put(box(w, 0.25, len), 'bridge#0', 0, -0.125, len / 2);
  for (const sx of [-1, 1]) put(box(0.22, 0.34, len + 0.1), 'wood#2', sx * (w / 2 - 0.05), -0.2, len / 2);
  const n = Math.max(1, Math.round(len / 4));
  for (let i = 0; i <= n; i++) {
    const lz = Math.min(len - 0.3, Math.max(0.3, (len * i) / n));
    for (const sx of [-1, 1]) put(cyl(0.2, 5.4, 7), 'wood#2', sx * (w / 2 - 0.3), -2.6, lz);
    put(box(w + 0.2, 0.24, 0.24), 'wood#2', 0, -0.38, lz);
    put(box(0.12, 1.0, 0.12), 'bridge#1', w / 2 - 0.12, 0.5, lz);
  }
  put(box(0.1, 0.1, len - 0.6), 'bridge#1', w / 2 - 0.12, 0.95, len / 2);
  put(box(0.08, 0.08, len - 0.6), 'bridge#1', w / 2 - 0.12, 0.5, len / 2);
  // 尽头两根系缆桩
  for (const sx of [-1, 1]) {
    put(cyl(0.22, 1.1, 8), 'wood#2', sx * (w / 2 - 0.9), 0.55, len - 0.9);
    put(cyl(0.3, 0.14, 8), 'iron#0', sx * (w / 2 - 0.9), 1.1, len - 0.9);
  }
  return { rotY, end: [x + len * sin, top, z + len * cos] };
}

/** 防波堤：沿折线 pts=[[x,z],...]，中间一条石板走道（顶在 o.top），两侧各两排乱石。不登记碰撞。 */
export function breakwater(b, pts, o = {}) {
  const { top = 1.5 } = o;
  let id = 0;
  const rock = (px, py, pz) => {
    id++;
    const s = 0.8 + rnd(id) * 0.8;
    const g = new THREE.IcosahedronGeometry(1, 0);
    g.scale(s * (0.85 + rnd(id + 0.3) * 0.4), s * (0.6 + rnd(id + 0.6) * 0.3), s * (0.85 + rnd(id + 0.9) * 0.4));
    g.rotateZ((rnd(id + 0.2) - 0.5) * 0.8);
    b.add(g, id % 3 ? 'mason#0' : 'mason#1', [px, py, pz], rnd(id + 0.5) * PI * 2);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.01) continue;
    const rotY = Math.atan2(x2 - x1, z2 - z1);
    const ux = (x2 - x1) / len;
    const uz = (z2 - z1) / len;
    b.add(box(3.4, 1.4, len + 1.2), 'mason#2', [(x1 + x2) / 2, top - 0.7, (z1 + z2) / 2], rotY);
    const n = Math.max(1, Math.round(len / 2.4));
    for (let k = 0; k <= n; k++) {
      const t = (len * k) / n;
      for (const side of [-1, 1]) {
        for (let row = 0; row < 2; row++) {
          const off = side * (2.5 + row * 1.9 + rnd(id + 7) * 0.5);
          const along = t + (row ? 1.2 : 0) + (rnd(id + 3) - 0.5) * 0.8;
          // 右手方向 = (uz, -ux)
          rock(x1 + ux * along + uz * off, top - 0.75 - row * 1.15 - rnd(id + 5) * 0.3, z1 + uz * along - ux * off);
        }
      }
    }
  }
  // 堤头再堆几块
  const [ex, ez] = pts[pts.length - 1];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2;
    rock(ex + Math.cos(a) * 3.2, top - 1.2 - rnd(id + 1) * 0.5, ez + Math.sin(a) * 3.2);
  }
}

/** 港口小灯塔：方石座 + 白塔身 + 发光灯室 + 红帽。返回灯的世界坐标 [x,y,z]。 */
export function beacon(b, o) {
  const { h = 9 } = o;
  const { at, put, hit } = frame(b, o);
  const S = h - 3.0; // 塔身顶
  put(box(3.4, 2.0, 3.4), 'mason#0', 0, -0.1, 0);
  put(cyl(1.25, S - 0.9, 12, 0.9), 'wall#6', 0, 0.9 + (S - 0.9) / 2, 0);
  put(cyl(1.12, 0.9, 12, 1.04), 'cloth#0', 0, 0.9 + (S - 0.9) * 0.5, 0);
  put(box(0.8, 1.7, 0.3), 'wood#0', 0, 1.75, 1.1);
  put(cyl(1.4, 0.2, 12), 'iron#0', 0, S + 0.05, 0);
  const ring = new THREE.TorusGeometry(1.32, 0.05, 4, 12);
  ring.rotateX(PI / 2);
  put(ring, 'iron#0', 0, S + 0.8, 0);
  put(cyl(0.75, 1.4, 10), 'glow#0', 0, S + 0.85, 0);
  put(cone(1.1, 1.2, 10), 'cloth#0', 0, S + 2.15, 0);
  put(ball(0.16), 'iron#0', 0, S + 2.85, 0);
  hit(0, 0, 1.7, 1.7, h);
  const p = at(0, S + 0.85, 0);
  (b.beacons ??= []).push(p);
  return p;
}

// ---- 20 小物件 -------------------------------------------------------------------------------------------------
/** 雪人：三个雪球 + 胡萝卜鼻 + 树枝手 + 小桶帽（脸朝 +z）。 */
export function snowman(b, x, z, s = 1) {
  const gy = heightAt(x, z);
  const P = (geo, key, lx, ly, lz) => b.add(geo, key, [x + lx * s, gy + ly * s, z + lz * s]);
  P(ball(0.62 * s), 'paint#3', 0, 0.5, 0);
  P(ball(0.46 * s), 'paint#3', 0, 1.3, 0);
  P(ball(0.33 * s), 'paint#3', 0, 1.92, 0);
  const nose = cone(0.07 * s, 0.34 * s, 6);
  nose.rotateX(PI / 2);
  P(nose, 'paint#1', 0, 1.9, 0.44);
  for (const sx of [-1, 1]) {
    P(box(0.06 * s, 0.06 * s, 0.05 * s), 'iron#0', sx * 0.12, 2.02, 0.3);
    const arm = cyl(0.03 * s, 0.8 * s, 4);
    arm.rotateZ(sx * 1.1);
    P(arm, 'wood#2', sx * 0.72, 1.5, 0);
  }
  for (const y of [1.2, 1.42]) P(box(0.07 * s, 0.07 * s, 0.05 * s), 'iron#0', 0, y, 0.44);
  P(cyl(0.2 * s, 0.26 * s, 8, 0.24 * s), 'cloth#0', 0, 2.32, 0);
  b.collide(x, z, 0.6 * s, 0.6 * s, 2.4 * s);
}

/** 干草垛：圆顶的草堆 + 深色的顶。 */
export function haystack(b, x, z, s = 1) {
  const gy = heightAt(x, z);
  b.add(cyl(1.45 * s, 1.2 * s, 10, 1.5 * s), 'paint#8', [x, gy + 0.5 * s, z]);
  const dome = new THREE.SphereGeometry(1.5 * s, 10, 6, 0, PI * 2, 0, PI / 2);
  dome.scale(1, 0.95, 1);
  b.add(dome, 'paint#8', [x, gy + 1.08 * s, z]);
  b.add(cone(0.6 * s, 0.5 * s, 8), 'wood#1', [x, gy + 2.55 * s, z]);
  b.collide(x, z, 1.5 * s, 1.5 * s, 2.7 * s);
}

/** 柴垛：六根短圆木码成三角（木头沿 x）。 */
export function logPile(b, x, z, s = 1) {
  const gy = heightAt(x, z);
  const r = 0.28 * s;
  const rows = [3, 2, 1];
  let k = 0;
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const g = cyl(r, 1.8 * s, 8);
      g.rotateZ(PI / 2);
      b.add(g, k++ % 2 ? 'wood#1' : 'wood#0', [x + (rnd(k) - 0.5) * 0.12 * s, gy + r + row * r * 1.74, z + (i - (n - 1) / 2) * r * 2]);
    }
  });
  b.collide(x, z, 0.95 * s, 0.9 * s, 1.5 * s);
}

/** 木货箱。 */
export function crate(b, x, z, s = 1) {
  const gy = heightAt(x, z);
  const a = 1.1 * s;
  b.add(box(a, a, a), 'wood#1', [x, gy + a / 2, z]);
  for (const t of [-0.3, 0.3]) b.add(box(a + 0.06, 0.12 * s, a + 0.06), 'wood#2', [x, gy + a / 2 + t * a, z]);
  b.collide(x, z, a / 2 + 0.05, a / 2 + 0.05, a);
}

/** 冰塘：一片浅色冰面 + 一圈雪埂。 */
export function icePond(b, o) {
  const { x, z, r = 8 } = o;
  const gy = o.y ?? heightAt(x, z);
  b.add(cyl(r, 0.08, 24), 'glass#2', [x, gy + 0.06, z]);
  const rim = new THREE.TorusGeometry(r + 0.1, 0.4, 5, 24);
  rim.rotateX(PI / 2);
  rim.scale(1, 0.6, 1);
  b.add(rim, 'paint#3', [x, gy + 0.04, z]);
}

// ---- 21 积雪 ---------------------------------------------------------------------------------------------------
/** 给人字顶盖一层雪：o.w o.d 占地，o.h 檐口高，o.rh 屋顶高，o.ridge 'x'|'z' 屋脊方向（hall 是 'x'，house 是 'z'）。 */
export function snowCap(b, o) {
  const { w = 8, d = 7, h = 4.2, ridge = 'x', over = 0.7 } = o;
  const { put } = frame(b, o);
  const span = (ridge === 'x' ? d : w) + over * 2;
  const len = (ridge === 'x' ? w : d) + over * 2;
  const rh = o.rh ?? span * 0.42;
  const a = Math.atan2(rh, span / 2);
  const sl = Math.hypot(rh, span / 2) * 0.96;
  for (const s of [-1, 1]) {
    const g = box(len, 0.32, sl);
    g.rotateX(s * a);
    // 沿屋面法线往外抬 0.2
    const nz = Math.sin(a) * 0.2;
    const ny = Math.cos(a) * 0.2;
    if (ridge === 'x') put(g, 'paint#3', 0, h + rh / 2 + ny + 0.05, s * (span / 4 + nz));
    else put(g, 'paint#3', s * (span / 4 + nz), h + rh / 2 + ny + 0.05, 0, PI / 2);
  }
  if (ridge === 'x') put(box(len, 0.34, 0.7), 'paint#3', 0, h + rh + 0.12, 0);
  else put(box(0.7, 0.34, len), 'paint#3', 0, h + rh + 0.12, 0);
}

// ---- 会动的：风叶、水轮、列车 ----------------------------------------------------------------------------------
const INK = [0.04, 0.05, 0.11];
const merged = (parts) => mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);

/** 一组零件 → 一个上色 mesh + 一个墨线壳。 */
function inked(shared, parts, lit, kind = 'flat', thick = 0.05) {
  const geo = merged(parts);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, paintMaterial(shared, { lit, shade: lit.map((c) => c * 0.62), kind }));
  const ink = new THREE.Mesh(geo, outlineMaterial(shared, INK, thick));
  return [mesh, ink];
}

/** 风车的四片格子风叶（在局部 xy 平面里，绕 z 转）。 */
function sailParts(r) {
  const spars = [];
  const lattice = [];
  const hub = cyl(0.34, 0.7, 8);
  hub.rotateX(PI / 2);
  spars.push(hub);
  const fw = r * 0.2;
  for (let k = 0; k < 4; k++) {
    const a = (k * PI) / 2;
    const turn = (g) => {
      g.rotateZ(a);
      return g;
    };
    const spar = box(0.18, r, 0.18);
    spar.translate(0, r / 2, 0);
    spars.push(turn(spar));
    const y0 = r * 0.24;
    const fl = r - y0;
    for (const fx of [fw * 0.5, fw]) {
      const edge = box(0.07, fl, 0.07);
      edge.translate(fx, y0 + fl / 2, 0.02);
      lattice.push(turn(edge));
    }
    for (let i = 0; i <= 6; i++) {
      const slat = box(fw + 0.07, 0.07, 0.05);
      slat.translate(fw / 2, y0 + (fl * i) / 6, 0.02);
      lattice.push(turn(slat));
    }
  }
  return { spars, lattice };
}

/** 下射式木水轮：两道轮辋 + 8 根辐条 + 12 片桨板（绕 z 转）。 */
function wheelParts(r) {
  const parts = [];
  const axle = cyl(0.3, 1.5, 8);
  axle.rotateX(PI / 2);
  parts.push(axle);
  for (const sz of [-0.46, 0.46]) {
    const rim = new THREE.TorusGeometry(r - 0.12, 0.12, 5, 24);
    rim.translate(0, 0, sz);
    parts.push(rim);
    const inner = new THREE.TorusGeometry(r * 0.62, 0.08, 4, 20);
    inner.translate(0, 0, sz);
    parts.push(inner);
    for (let k = 0; k < 4; k++) {
      const spoke = box(0.14, r * 2 - 0.2, 0.12);
      spoke.rotateZ((k * PI) / 4);
      spoke.translate(0, 0, sz);
      parts.push(spoke);
    }
  }
  for (let k = 0; k < 12; k++) {
    const pad = box(0.72, 0.08, 1.06);
    pad.translate(r - 0.3, 0, 0);
    pad.rotateZ((k / 12) * PI * 2);
    parts.push(pad);
  }
  return parts;
}

/**
 * 会转的风叶和水轮。list: [{ kind: 'sails'|'wheel', hub: [x,y,z], rotY, r, speed }]
 * @returns {{ group: THREE.Group, update(dt: number): void }}
 */
export function createSpinners(shared, list = []) {
  const group = new THREE.Group();
  const rotors = [];
  const WOOD = [0.5, 0.34, 0.2];
  const CREAM = [0.93, 0.9, 0.8];
  for (const it of list) {
    if (!it?.hub) continue;
    const wheel = it.kind === 'wheel';
    const r = it.r ?? (wheel ? 3.4 : 8);
    const pivot = new THREE.Object3D();
    pivot.position.set(it.hub[0], it.hub[1], it.hub[2]);
    // 让局部 z 对准转轴：风叶是建筑的局部 z，水轮是建筑的局部 x
    pivot.rotation.y = (it.rotY ?? 0) + (wheel ? PI / 2 : 0);
    const rotor = new THREE.Object3D();
    pivot.add(rotor);
    if (wheel) rotor.add(...inked(shared, wheelParts(r), WOOD, 'wood'));
    else {
      const { spars, lattice } = sailParts(r);
      rotor.add(...inked(shared, spars, WOOD, 'wood'));
      rotor.add(...inked(shared, lattice, CREAM, 'wood', 0.035));
    }
    rotor.rotation.z = rnd(rotors.length + 1) * PI;
    group.add(pivot);
    rotors.push({ rotor, speed: it.speed ?? (wheel ? 0.9 : 0.5) });
  }
  return {
    group,
    update(dt) {
      for (const s of rotors) s.rotor.rotation.z += s.speed * dt;
    },
  };
}

/** 一节车厢的零件。nose: 0 中间车，+1 车头朝 +z，-1 车头朝 -z。 */
function carParts(nose) {
  const white = [];
  const blue = [];
  const dark = [];
  const LEN = 24;
  const straight = nose ? 16 : LEN;
  const zc = nose ? -(LEN - straight) / 2 : 0;
  // 车身：直壁 + 圆顶
  const body = box(3.3, 2.2, straight);
  body.translate(0, 1.6, zc);
  white.push(body);
  const roof = new THREE.CylinderGeometry(1.65, 1.65, straight, 10, 1, false, 0, PI);
  roof.rotateZ(PI / 2);
  roof.rotateY(PI / 2);
  roof.scale(1, 0.9 / 1.65, 1);
  roof.translate(0, 2.7, zc);
  white.push(roof);
  const stripe = box(3.37, 0.26, straight - 0.3);
  stripe.translate(0, 1.2, zc);
  blue.push(stripe);
  const win = box(3.37, 0.72, straight - 2.4);
  win.translate(0, 2.1, zc + (nose ? -0.6 : 0));
  dark.push(win);
  const skirt = box(3.0, 0.5, straight - 1.0);
  skirt.translate(0, 0.3, zc);
  dark.push(skirt);
  for (const dz of [-1, 1]) {
    const door = box(3.38, 1.9, 0.08);
    door.translate(0, 1.55, zc + dz * (straight / 2 - 1.3));
    dark.push(door);
  }
  if (nose) {
    // 长鼻子：拉长的椭球 + 驾驶舱窗
    const n = new THREE.SphereGeometry(1, 14, 10);
    n.scale(1.65, 1.6, 8);
    n.translate(0, 1.95, 4);
    white.push(n);
    const cab = new THREE.SphereGeometry(1, 10, 8);
    cab.scale(1.15, 0.8, 2.6);
    cab.translate(0, 2.78, 6.4);
    dark.push(cab);
    const chin = new THREE.SphereGeometry(1, 10, 6);
    chin.scale(1.5, 0.5, 7.2);
    chin.translate(0, 0.75, 4);
    blue.push(chin);
    if (nose < 0) for (const g of [...white, ...blue, ...dark]) g.rotateY(PI);
  }
  return { white, blue, dark };
}

/**
 * 沿高架跑的白色子弹头列车。path 同 viaduct；stops 是沿线弧长（米），列车中点停在那里。
 * @param opts { cars: 5, speed: 34, stops: [], dwell: 8, loop: false, accel: 1.2, start }
 * @returns {{ group: THREE.Group, update(dt: number): void, position: number[] }}
 */
export function createTrain(shared, path, opts = {}) {
  // side：偏到哪一股道上（米，顺着行驶方向的右手边为正）；dir：一开始往哪头开（1 / -1）；from：一开始停在哪头（0 起点 / 1 终点）；stripe：腰线的颜色
  const { cars = 5, speed = 34, stops = [], dwell = 8, loop = false, accel = 1.2, side = 0, from = 0, stripe = null, assets = null } = opts;
  const group = new THREE.Group();
  const sp = sampler(path);
  const GAP = assets?.hasHsr ? 16.0 : 24.5;
  const WHITE = [0.95, 0.96, 0.97];
  const BLUE = stripe ?? [0.2, 0.4, 0.72];
  const DARK = [0.14, 0.17, 0.24];
  const mats = {
    white: paintMaterial(shared, { lit: WHITE, shade: WHITE.map((c) => c * 0.62), kind: 'flat' }),
    blue: paintMaterial(shared, { lit: BLUE, shade: BLUE.map((c) => c * 0.62), kind: 'flat' }),
    dark: paintMaterial(shared, { lit: DARK, shade: DARK.map((c) => c * 0.62), kind: 'flat' }),
    ink: outlineMaterial(shared, INK, 0.05),
  };
  const geoCache = new Map();
  const geosFor = (nose) => {
    if (!geoCache.has(nose)) {
      const p = carParts(nose);
      const g = { white: merged(p.white), blue: merged(p.blue), dark: merged(p.dark) };
      for (const k of Object.values(g)) k.computeBoundingSphere();
      geoCache.set(nose, g);
    }
    return geoCache.get(nose);
  };
  const list = [];
  const allDoors = [];
  for (let i = 0; i < cars; i++) {
    const nose = cars === 1 ? 1 : i === 0 ? 1 : i === cars - 1 ? -1 : 0;
    const hsrKind = nose > 0 ? 'HSR_Head' : nose < 0 ? 'HSR_Tail' : 'HSR_Mid';
    const custom = assets?.hasHsr ? assets.createHsrCar(hsrKind) : null;
    const car = new THREE.Group();
    car.rotation.order = 'YXZ';
    if (custom) {
      car.add(custom.group);
      allDoors.push(...custom.doors);
    } else {
      const g = geosFor(nose);
      for (const m of [new THREE.Mesh(g.white, mats.white), new THREE.Mesh(g.blue, mats.blue), new THREE.Mesh(g.dark, mats.dark), new THREE.Mesh(g.white, mats.ink)]) {
        m.frustumCulled = false;
        car.add(m);
      }
    }
    group.add(car);
    list.push(car);
  }
  // 头车中心的弧长范围
  const tail = (cars - 1) * GAP;
  const sMin = Math.min(sp.total, tail + 12);
  const sMax = Math.max(sMin, sp.total - 12);
  const halts = stops.map((st) => Math.min(sMax, Math.max(sMin, st + tail / 2))).sort((a, c) => a - c);
  let s = from ? sMax : Math.min(sMax, Math.max(sMin, opts.start != null ? opts.start + tail / 2 : sMin));
  let v = 0;
  let dir = opts.dir ?? (from ? -1 : 1);
  let wait = 0;
  let doorOpen = 0;
  let holdDoors = false;
  const lead = [0, 0, 0];
  const place = () => {
    // 5 点高斯平滑采样轨线位置与切向，彻底消除折线段拐点造成的车内镜头微抖！
    const wb = assets?.hasHsr ? 5.6 : 9;
    for (let i = 0; i < cars; i++) {
      const sc = s - i * GAP;
      const pm2 = sp.at(sc - wb * 1.4);
      const pm1 = sp.at(sc - wb * 0.7);
      const pc = sp.at(sc);
      const pp1 = sp.at(sc + wb * 0.7);
      const pp2 = sp.at(sc + wb * 1.4);
      const cx = (pm2[0] + 2 * pm1[0] + 3 * pc[0] + 2 * pp1[0] + pp2[0]) / 9;
      const cy = (pm2[1] + 2 * pm1[1] + 3 * pc[1] + 2 * pp1[1] + pp2[1]) / 9;
      const cz = (pm2[2] + 2 * pm1[2] + 3 * pc[2] + 2 * pp1[2] + pp2[2]) / 9;
      const dx = (pp2[0] - pm2[0]) * 0.4 + (pp1[0] - pm1[0]) * 0.6;
      const dy = (pp2[1] - pm2[1]) * 0.4 + (pp1[1] - pm1[1]) * 0.6;
      const dz = (pp2[2] - pm2[2]) * 0.4 + (pp1[2] - pm1[2]) * 0.6;
      const car = list[i];
      const hl = Math.hypot(dx, dz) || 1;
      car.position.set(cx - (dz / hl) * side, cy + 0.12, cz + (dx / hl) * side);
      if (dx * dx + dz * dz > 1e-6) {
        car.rotation.y = Math.atan2(dx, dz);
        car.rotation.x = -Math.atan2(dy, hl);
      }
      if (i === 0) {
        lead[0] = car.position.x;
        lead[1] = car.position.y;
        lead[2] = car.position.z;
      }
    }
  };
  const animateDoors = (dt, shouldOpen) => {
    const want = shouldOpen ? 1 : 0;
    doorOpen += (want - doorOpen) * Math.min(1, dt * 4.5);
    for (const d of allDoors) {
      // 车门向车厢两侧顺滑完全滑开 1.65m，彻底敞开门洞可直接走入车厢内部
      d.mesh.position.z = d.baseZ + 1.65 * doorOpen;
      d.mesh.position.x = d.baseX + d.side * 0.10 * doorOpen;
    }
  };
  /** 前方（按行驶方向）最近的停靠点；没有就是线路尽头。 */
  const target = () => {
    let best = dir > 0 ? sMax : sMin;
    for (const h of halts) if ((h - s) * dir > 0.01 && (h - s) * dir < (best - s) * dir) best = h;
    return best;
  };
  place();
  return {
    group,
    cars: list,
    halts,
    get s() { return s; },
    get doorOpen() { return doorOpen; },
    get wait() { return wait; },
    /** 让列车从合适距离进站（候车时不必干等好几分钟） */
    approachStop(stopMidS, leadDist = 72) {
      const targetS = Math.min(sMax, Math.max(sMin, stopMidS + tail / 2));
      if (Math.abs(s - targetS) < 2) {
        wait = Math.max(wait, dwell);
        holdDoors = true;
        return;
      }
      if (Math.abs(s - targetS) > leadDist || (targetS - s) * dir < -1) {
        // 把列车调到距离站台 leadDist 米处，平顺进站减速停靠（约 4~5 秒进站）
        const d = targetS - s >= 0 ? 1 : -1;
        dir = d;
        s = Math.min(sMax, Math.max(sMin, targetS - d * leadDist));
        v = Math.min(speed * 0.9, Math.sqrt(2 * accel * leadDist) + 1.5);
        wait = 0;
        place();
      }
      holdDoors = true;
    },
    /** 乘客已上车：关门发车前往指定站点 */
    departToward(destMidS) {
      holdDoors = false;
      wait = 0;
      const targetS = Math.min(sMax, Math.max(sMin, destMidS + tail / 2));
      dir = targetS >= s ? 1 : -1;
      s += dir * 0.08;
      v = Math.max(v, 3.0);
    },
    setHoldDoors(on) {
      holdDoors = !!on;
    },
    /** 列车是否已停稳在指定站台 */
    isStoppedAt(stopMidS, tol = 4) {
      const targetS = Math.min(sMax, Math.max(sMin, stopMidS + tail / 2));
      return wait > 0 && Math.abs(s - targetS) < tol;
    },
    /** 获取车厢内靠窗座位的世界坐标与朝向（坐在车门过厅后方首排靠窗位，背后开阔无遮挡，可完整看见全身！） */
    seatWorld(carIdx = 1, outPos = new THREE.Vector3(), outYaw = { value: 0 }) {
      const car = list[Math.min(list.length - 1, Math.max(0, carIdx))];
      if (!car) return null;
      car.updateMatrixWorld(true);
      // 首排靠窗座（Blender y=2.2，后方 z∈[-1.5,1.5] 为宽敞车门过厅，零椅背挡全身！）
      outPos.set(0.86, 0.86, 2.24).applyMatrix4(car.matrixWorld);
      outYaw.value = car.rotation.y;
      return outPos;
    },
    /** 获取车厢内部全景随行机位（拉远至对侧过厅，完整拍出小鱼全身 + 车厢座椅 + 窗外开阔风景） */
    cabinView(carIdx = 1, outCamPos = new THREE.Vector3(), outLookAt = new THREE.Vector3(), lookYaw = 0, lookPitch = 0) {
      const car = list[Math.min(list.length - 1, Math.max(0, carIdx))];
      if (!car) return false;
      car.updateMatrixWorld(true);
      const ly = Math.max(-1.05, Math.min(1.05, lookYaw));
      const lp = Math.max(-0.34, Math.min(0.32, lookPitch));
      // 机位设在对侧车门过厅（(-1.02, 1.58, -0.08)），距小鱼 ~2.95m，完整入画头到脚！
      const ox = -1.02;
      const oy = 1.58;
      const oz = -0.08;
      outCamPos.set(ox, oy, oz).applyMatrix4(car.matrixWorld);
      // 视线穿过小鱼全身（(+0.86, 1.24, 2.24)）斜向前方两扇全景大窗外
      const baseAngle = Math.atan2(2.05, 2.38);
      const ang = baseAngle + ly;
      const pitch = -0.07 + lp;
      const dist = 7.5;
      outLookAt.set(ox + Math.sin(ang) * Math.cos(pitch) * dist, oy + Math.sin(pitch) * dist, oz + Math.cos(ang) * Math.cos(pitch) * dist).applyMatrix4(car.matrixWorld);
      return true;
    },
    update(dt) {
      dt = Math.min(dt, 0.1);
      if (sMax - sMin < 1) return;
      if (wait > 0) {
        if (!holdDoors) {
          wait -= dt;
          if (wait <= 0) {
            wait = 0;
            s += dir * 0.08;
          }
        }
        animateDoors(dt, true);
        return;
      }
      animateDoors(dt, false);
      const t = target();
      const dist = (t - s) * dir;
      v = Math.max(0.5, Math.min(v + accel * dt, speed, Math.sqrt(2 * accel * Math.max(0, dist))));
      const stepLen = v * dt;
      if (stepLen >= dist - 0.02) {
        s = t;
        v = 0;
        wait = dwell;
        if (t === (dir > 0 ? sMax : sMin)) {
          if (loop) s = dir > 0 ? sMin : sMax;
          else dir = -dir;
        }
      } else s += stepLen * dir;
      place();
    },
    get position() {
      return [lead[0], lead[1], lead[2]];
    },
    get speed() {
      return v * dir;
    },
    get s() {
      return s;
    },
    get doorOpen() {
      return doorOpen;
    },
  };
}

// ---- 18 37 路复古吉卜力公交（真实 3D 沿环城路行驶、靠站开门、可上车内景乘坐） ----------------------------------
export function createBus37Runner(shared, routePts, opts = {}) {
  const { assets = null, heightAt: groundFn = heightAt, speed = 15.5, stops = [] } = opts;
  const pts3 = routePts.map(([x, z]) => [x, groundFn(x, z), z]);
  const sp = sampler(pts3);
  const group = new THREE.Group();
  const busObj = new THREE.Group();
  busObj.rotation.order = 'YXZ';
  const built = assets?.hasTransit ? assets.createBus37() : null;
  if (built) {
    busObj.add(built.group);
  } else {
    const m = new THREE.Mesh(box(2.4, 2.8, 8.2), paintMaterial(shared, { lit: [0.22, 0.48, 0.35], shade: [0.12, 0.28, 0.2], kind: 'flat' }));
    m.position.y = 1.5;
    busObj.add(m);
  }
  group.add(busObj);

  const nearestS = (x, z) => {
    let bestS = 0;
    let bestD = Infinity;
    for (let t = 0; t <= sp.total; t += 4) {
      const p = sp.at(t);
      const d = Math.hypot(p[0] - x, p[2] - z);
      if (d < bestD) {
        bestD = d;
        bestS = t;
      }
    }
    return bestS;
  };
  const stopSs = stops.map((st) => nearestS(st.x, st.z)).sort((a, b) => a - b);

  let s = 12;
  let dir = 1;
  let v = 0;
  let wait = 0;
  let doorOpen = 0;
  let holdDoor = false;
  let targetStopS = null;
  let wheelAngle = 0;
  const curPos = [pts3[0][0], pts3[0][1], pts3[0][2]];

  const place = () => {
    // 多点平滑道路位置、切向与路面高程，车内窗外景致丝滑不抖动
    const pm = sp.at(Math.max(0, s - 3.6));
    const pc = sp.at(s);
    const pp = sp.at(Math.min(sp.total, s + 3.6));
    const dx = pp[0] - pm[0];
    const dz = pp[2] - pm[2];
    const hl = Math.hypot(dx, dz) || 1;
    const off = 1.65 * dir;
    const cx = (pm[0] + 2 * pc[0] + pp[0]) * 0.25;
    const cz = (pm[2] + 2 * pc[2] + pp[2]) * 0.25;
    const x = cx - (dz / hl) * off;
    const z = cz + (dx / hl) * off;
    const y0 = groundFn(pm[0] - (dz / hl) * off, pm[2] + (dx / hl) * off);
    const y1 = groundFn(x, z);
    const y2 = groundFn(pp[0] - (dz / hl) * off, pp[2] + (dx / hl) * off);
    const y = (y0 + 2 * y1 + y2) * 0.25;
    curPos[0] = x;
    curPos[1] = y;
    curPos[2] = z;
    busObj.position.set(x, y, z);
    const fx = dx * dir;
    const fz = dz * dir;
    if (fx * fx + fz * fz > 1e-6) {
      busObj.rotation.y = Math.atan2(fx, fz);
      busObj.rotation.x = -Math.atan2((y2 - y0) * dir, hl) * 0.5;
    }
  };

  const animateBus = (dt, shouldOpen) => {
    const want = shouldOpen ? 1 : 0;
    doorOpen += (want - doorOpen) * Math.min(1, dt * 5.0);
    if (built?.door) {
      built.door.mesh.position.z = built.door.baseZ + 1.02 * doorOpen;
      built.door.mesh.position.x = built.door.baseX + 0.14 * doorOpen;
    }
    if (built?.wheels?.length && v > 0.05) {
      wheelAngle += (v * dt) / 0.45;
      for (const w of built.wheels) w.rotation.x = -wheelAngle;
    }
  };

  place();
  return {
    group,
    mesh: busObj,
    nearestS,
    get s() { return s; },
    get x() { return curPos[0]; },
    get y() { return curPos[1]; },
    get z() { return curPos[2]; },
    get doorOpen() { return doorOpen; },
    approachStop(stopS, leadDist = 26) {
      const ts = Math.min(sp.total - 4, Math.max(4, stopS));
      targetStopS = ts;
      holdDoor = true;
      if (Math.abs(s - ts) < 3.5) {
        s = ts;
        v = 0;
        wait = 14;
        place();
        return;
      }
      const d = ts >= s ? 1 : -1;
      dir = d;
      if (Math.abs(s - ts) > leadDist) s = Math.min(sp.total - 2, Math.max(2, ts - d * leadDist));
      v = Math.min(speed, Math.sqrt(2 * 3.0 * Math.abs(ts - s)) + 1.5);
      wait = 0;
      place();
    },
    departToward(destS) {
      holdDoor = false;
      wait = 0;
      const ts = Math.min(sp.total - 4, Math.max(4, destS));
      targetStopS = ts;
      dir = ts >= s ? 1 : -1;
      s += dir * 0.15;
      v = Math.max(v, 4.5);
    },
    fastForwardTo(destS) {
      const ts = Math.min(sp.total - 4, Math.max(4, destS));
      targetStopS = ts;
      dir = ts >= s ? 1 : -1;
      if (Math.abs(ts - s) > 22) s = Math.min(sp.total - 2, Math.max(2, ts - dir * 22));
      v = Math.min(speed, 11);
      wait = 0;
      place();
    },
    isStoppedAt(stopS, tol = 5.0) {
      const ts = Math.min(sp.total - 4, Math.max(4, stopS));
      return wait > 0 && Math.abs(s - ts) < tol;
    },
    seatWorld(outPos = new THREE.Vector3(), outYaw = { value: 0 }) {
      busObj.updateMatrixWorld(true);
      // 37 路靠窗座位（坐实绿绒坐垫，背靠椅背自然前望）
      outPos.set(0.72, 0.96, 0.76).applyMatrix4(busObj.matrixWorld);
      outYaw.value = busObj.rotation.y;
      return outPos;
    },
    cabinView(outCamPos = new THREE.Vector3(), outLookAt = new THREE.Vector3(), lookYaw = 0, lookPitch = 0) {
      busObj.updateMatrixWorld(true);
      const ly = Math.max(-1.05, Math.min(1.05, lookYaw));
      const lp = Math.max(-0.30, Math.min(0.28, lookPitch));
      // 退至后排斜对角（距小鱼 ~2.9m），透过中央宽过道完整展现小鱼全身 + 车厢与全景街景！
      const ox = -0.78;
      const oy = 1.68;
      const oz = -1.75;
      outCamPos.set(ox, oy, oz).applyMatrix4(busObj.matrixWorld);
      const baseAngle = Math.atan2(1.42, 2.55);
      const ang = baseAngle + ly;
      const pitch = -0.10 + lp;
      const dist = 7.5;
      outLookAt.set(ox + Math.sin(ang) * Math.cos(pitch) * dist, oy + Math.sin(pitch) * dist, oz + Math.cos(ang) * Math.cos(pitch) * dist).applyMatrix4(busObj.matrixWorld);
      return true;
    },
    update(dt) {
      dt = Math.min(dt, 0.1);
      if (wait > 0) {
        if (!holdDoor) {
          wait -= dt;
          if (wait <= 0) {
            wait = 0;
            targetStopS = null;
            s += dir * 0.2;
          }
        }
        animateBus(dt, true);
        return;
      }
      animateBus(dt, false);
      let t = targetStopS != null ? targetStopS : (dir > 0 ? sp.total - 4 : 4);
      if (targetStopS == null) {
        for (const h of stopSs) {
          if ((h - s) * dir > 0.5 && (h - s) * dir < (t - s) * dir) t = h;
        }
      }
      const dist = (t - s) * dir;
      if (dist <= 0.15) {
        s = t;
        v = 0;
        wait = targetStopS != null ? 14 : 6;
        if (targetStopS == null && (s >= sp.total - 5 || s <= 5)) dir = -dir;
        place();
        return;
      }
      const accel = 3.2;
      v = Math.max(1.2, Math.min(v + accel * dt, speed, Math.sqrt(2 * accel * dist)));
      const step = v * dt;
      if (step >= dist - 0.05) {
        s = t;
        v = 0;
        wait = targetStopS != null ? 14 : 6;
        if (targetStopS == null && (s >= sp.total - 5 || s <= 5)) dir = -dir;
      } else {
        s += step * dir;
      }
      place();
    },
  };
}

// ---- 19 地铁 1 号线（吉卜力地下拱顶瓷砖车站 + 暖灯隧道 + 3 节无缝联挂 1 号线列车） ---------------------------
export function createMetroLine1(shared, assets) {
  const group = new THREE.Group();
  const CX = 160;
  const CY = -54;
  const CZ = 0;
  const TUNNEL_LEN = 380;
  const DEP_Z = -132;
  const ARR_Z = 132;

  const tileCream = paintMaterial(shared, { lit: [0.92, 0.89, 0.82], shade: [0.68, 0.65, 0.60], kind: 'flat' });
  const tileViolet = paintMaterial(shared, { lit: [0.46, 0.30, 0.72], shade: [0.28, 0.18, 0.48], kind: 'flat' });
  const tileDark = paintMaterial(shared, { lit: [0.24, 0.26, 0.32], shade: [0.14, 0.16, 0.22], kind: 'flat' });
  const tileGold = paintMaterial(shared, { lit: [0.92, 0.74, 0.28], shade: [0.68, 0.52, 0.18], kind: 'flat' });
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });

  const addM = (geo, mat, x, y, z, rx = 0, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(CX + x, CY + y, CZ + z);
    m.rotation.set(rx, ry, 0);
    m.frustumCulled = false;
    group.add(m);
    return m;
  };
  addM(box(14, 0.4, TUNNEL_LEN), tileDark, 0, -0.2, 0);
  for (const rx of [-0.74, 0.74]) addM(box(0.14, 0.16, TUNNEL_LEN), tileGold, rx, 0.08, 0);
  for (const sx of [-1, 1]) {
    addM(box(0.5, 6.2, TUNNEL_LEN), tileCream, sx * 5.6, 3.1, 0);
    addM(box(0.58, 0.55, TUNNEL_LEN), tileViolet, sx * 5.56, 2.3, 0);
  }
  addM(box(12.2, 0.5, TUNNEL_LEN), tileCream, 0, 6.2, 0);
  for (let z = -170; z <= 170; z += 14) {
    for (const sx of [-1, 1]) {
      addM(box(0.45, 6.0, 0.48), tileDark, sx * 5.2, 3.0, z);
      addM(box(0.16, 0.28, 1.4), lampGlow, sx * 5.22, 3.85, z);
    }
    addM(box(10.8, 0.36, 0.46), tileDark, 0, 5.85, z);
    addM(box(1.4, 0.14, 0.9), lampGlow, 0, 5.62, z);
  }
  for (const pz of [DEP_Z, ARR_Z]) {
    addM(box(3.6, 0.95, 58), tileCream, -3.55, 0.47, pz);
    addM(box(0.28, 0.05, 58), tileGold, -1.85, 0.96, pz);
    addM(box(0.18, 0.65, 52), tileViolet, -5.25, 2.95, pz);
  }

  const trainGroup = new THREE.Group();
  const GAP = 14.0;
  const cars = [];
  const allDoors = [];
  for (const [idx, kind] of ['Metro1_Head', 'Metro1_Mid', 'Metro1_Tail'].entries()) {
    const car = new THREE.Group();
    const built = assets?.hasTransit ? assets.createMetroCar(kind) : null;
    if (built) {
      car.add(built.group);
      allDoors.push(...built.doors);
    } else {
      const m = new THREE.Mesh(box(2.8, 3.1, 13.4), tileViolet);
      m.position.y = 1.8;
      car.add(m);
    }
    car.position.set(0, 0.12, (1 - idx) * GAP);
    trainGroup.add(car);
    cars.push(car);
  }
  trainGroup.position.set(CX, CY, CZ + DEP_Z);
  group.add(trainGroup);
  group.visible = false;

  let phase = 'idle';
  let zPos = DEP_Z;
  let speed = 0;
  let timer = 0;
  let doorOpen = 1;

  const setDoors = (dt, shouldOpen) => {
    const want = shouldOpen ? 1 : 0;
    doorOpen += (want - doorOpen) * Math.min(1, dt * 4.8);
    for (const d of allDoors) {
      d.mesh.position.z = d.baseZ + 1.55 * doorOpen;
      d.mesh.position.x = d.baseX + d.side * 0.09 * doorOpen;
    }
  };

  return {
    group,
    cars,
    get phase() { return phase; },
    get doorOpen() { return doorOpen; },
    startTrip() {
      group.visible = true;
      phase = 'boarding';
      zPos = DEP_Z;
      speed = 0;
      timer = 0;
      doorOpen = 1;
      trainGroup.position.set(CX, CY, CZ + zPos);
      setDoors(0.016, true);
    },
    endTrip() {
      phase = 'idle';
      group.visible = false;
    },
    fastForward() {
      if (phase === 'boarding' || phase === 'running') {
        phase = 'running';
        zPos = Math.max(zPos, ARR_Z - 34);
        speed = Math.min(speed || 18, 18);
        trainGroup.position.z = CZ + zPos;
      }
    },
    seatWorld(outPos = new THREE.Vector3(), outYaw = { value: 0 }) {
      const car = cars[1];
      car.updateMatrixWorld(true);
      // 坐在梅子紫纵排软座上，背靠靠背稳稳落座
      outPos.set(-1.04, 0.94, 2.2).applyMatrix4(car.matrixWorld);
      outYaw.value = Math.PI / 2;
      return outPos;
    },
    cabinView(outCamPos = new THREE.Vector3(), outLookAt = new THREE.Vector3(), lookYaw = 0, lookPitch = 0) {
      const car = cars[1];
      car.updateMatrixWorld(true);
      const ly = Math.max(-1.05, Math.min(1.05, lookYaw));
      const lp = Math.max(-0.28, Math.min(0.28, lookPitch));
      // 退至对侧长椅前（距小鱼 ~3.3m），完整拍下小鱼全身、摇曳吊环与窗外暖灯隧道！
      const ox = 0.98;
      const oy = 1.60;
      const oz = -0.45;
      outCamPos.set(ox, oy, oz).applyMatrix4(car.matrixWorld);
      const baseAngle = Math.atan2(-2.05, 2.65);
      const ang = baseAngle + ly;
      const pitch = -0.09 + lp;
      const dist = 6.5;
      outLookAt.set(ox + Math.sin(ang) * Math.cos(pitch) * dist, oy + Math.sin(pitch) * dist, oz + Math.cos(ang) * Math.cos(pitch) * dist).applyMatrix4(car.matrixWorld);
      return true;
    },
    update(dt) {
      if (phase === 'idle') return;
      dt = Math.min(dt, 0.1);
      if (phase === 'boarding') {
        timer += dt;
        setDoors(dt, timer < 0.75);
        if (timer > 1.35) {
          phase = 'running';
          timer = 0;
        }
      } else if (phase === 'running') {
        setDoors(dt, false);
        const rem = ARR_Z - zPos;
        const maxV = 36;
        const accel = 7.5;
        speed = Math.max(1.5, Math.min(speed + accel * dt, maxV, Math.sqrt(2 * accel * Math.max(0, rem))));
        const step = speed * dt;
        if (step >= rem - 0.05) {
          zPos = ARR_Z;
          speed = 0;
          phase = 'arrived';
          timer = 0;
        } else {
          zPos += step;
        }
        trainGroup.position.z = CZ + zPos;
      } else if (phase === 'arrived') {
        timer += dt;
        setDoors(dt, true);
      }
    },
  };
}
