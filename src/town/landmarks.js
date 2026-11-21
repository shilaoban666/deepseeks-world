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
    collideRot(b, p[0], p[2], rotY, hw, hd, top, base);
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
  // 背面：站台 + 雨棚（80 m）
  const pz = -(zf + 6);
  const pl = o.platformLen ?? 80;
  put(box(pl, pY + 1.2, 6), 'mason#2', 0, (pY - 1.2) / 2, pz);
  put(box(pl, 0.05, 0.4), 'flower#1', 0, pY + 0.03, pz - 2.4);
  put(box(pl, 0.3, 7.4), 'roof#9', 0, pY + 4.7, pz);
  put(box(pl, 0.4, 0.5), 'wall#6', 0, pY + 4.4, pz + 1.6);
  for (let i = 0; i < 9; i++) put(cyl(0.22, 4.5, 8), 'wall#6', -pl / 2 + 2 + ((pl - 4) * i) / 8, pY + 2.25, pz + 1.6);
  hit(0, 0, L / 2 + 0.4, zf + 0.4, h + 2);
  for (const sx of [-1, 1]) hit(sx * (L / 2 + ww / 2), 0, ww / 2 + 0.4, wd / 2 + 0.4, W + 2);
  return { rotY, w, d, h, platform: at(0, pY, pz) };
}

// ---- 12 乡村小站 -----------------------------------------------------------------------------------------------
/** 高架旁的乡间小站：轨道沿局部 x（z=0），站台、木雨棚在 +z 侧，地面售票小屋 + 一跑楼梯。 */
export function smallStation(b, o) {
  const { rotY, base, at, put, hit } = frame(b, o);
  const name = o.name ?? '小站';
  const ph = Math.max(0.6, (o.deckY ?? base + 7) - base) + 0.3; // 站台面离地（比桥面高 0.3，免得共面）
  const pz = o.platZ ?? 6.6;
  // 站台板 + 石墩
  put(box(34, 0.5, 5), 'mason#2', 0, ph - 0.25, pz);
  put(box(34, 0.06, 0.3), 'flower#1', 0, ph + 0.02, pz - 2.2);
  put(box(34, 0.6, 0.5), 'mason#1', 0, ph - 0.7, pz);
  for (const lx of [-14, -7, 0, 7, 14]) {
    put(box(1.2, ph + 0.6, 2.6), 'mason#1', lx, (ph - 1.4) / 2, pz);
    hit(lx, pz, 0.7, 1.4, ph);
  }
  // +z 边的栏杆（楼梯口留空）
  const run = Math.max(1, Math.ceil((ph - 0.1) / 0.35)) * 0.5;
  put(box(17 - run / 2, 0.1, 0.1), 'wood#2', -(17 + run / 2) / 2, ph + 1.0, pz + 2.4);
  put(box(17 - run / 2 - 1.8, 0.1, 0.1), 'wood#2', (17 + run / 2 + 1.8) / 2, ph + 1.0, pz + 2.4);
  for (let lx = -16.8; lx <= 16.81; lx += 2.8) if (lx < -run / 2 || lx > run / 2 + 1.8) put(box(0.12, 1.0, 0.12), 'wood#2', lx, ph + 0.5, pz + 2.4);
  // 木雨棚：柱 + 背板 + 青瓦人字顶
  const sx0 = -8;
  for (const lx of [-6.5, 0, 6.5]) for (const dz of [-1.4, 1.4]) put(box(0.26, 3.0, 0.26), 'wood#1', sx0 + lx, ph + 1.5, pz + dz);
  put(box(13.4, 2.0, 0.14), 'wood#0', sx0, ph + 1.9, pz + 1.4);
  put(box(13.8, 0.24, 3.4), 'wood#2', sx0, ph + 3.05, pz);
  put(gableRoof(4.8, 15, 1.3), 'roof#10', sx0, ph + 3.15, pz, PI / 2);
  put(box(5, 0.12, 0.7), 'wood#1', sx0, ph + 0.5, pz + 0.9);
  for (const lx of [-2, 2]) put(box(0.12, 0.5, 0.6), 'wood#2', sx0 + lx, ph + 0.25, pz + 0.9);
  b.addSign(name, at(sx0, ph + 2.0, pz + 1.5), rotY, { w: 5.0, h: 1.1, bg: '#1f4b7a', fg: '#ffffff' });
  b.addSign(name, at(sx0, ph + 2.0, pz + 1.32), rotY + PI, { w: 5.0, h: 1.1, bg: '#1f4b7a', fg: '#ffffff' });
  // 楼梯：贴着站台 +z 边，从 +x 端的地面往 -x 爬到站台
  const n = Math.round(run / 0.5);
  const sz = pz + 2.5 + 0.9;
  const rise = ph / n;
  for (let i = 0; i < n; i++) {
    const top = rise * (i + 1);
    put(box(0.56, 0.2, 1.7), 'bridge#0', run / 2 - 0.5 * (i + 0.5), top - 0.1, sz);
  }
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
  // 楼梯一级一级都踩得住，上到站台；站台是一整块能站的板
  for (let i = 0; i < n; i++) hit(run / 2 - 0.5 * (i + 0.5), sz, 0.29, 0.85, rise * (i + 1));
  hit(0, pz, 17, 2.5, ph);
  // 售票小屋（地面，楼梯脚旁）
  const hx = o.houseX ?? run / 2 + 4.2;
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
  return { rotY, platform: at(0, ph, pz), platformH: ph, stairRun: run };
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
  const { width = 8, pierEvery = 24, groundAt = heightAt, skip = null } = opts;
  if (!path || path.length < 2) return { piers: [], total: 0 };
  const T = 1.1; // 桥面厚
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
    for (const sx of [-1, 1]) place(box(0.4, 0.95, len), 'mason#4', sx * (width / 2 - 0.2), 0.42);
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
  const { cars = 5, speed = 34, stops = [], dwell = 8, loop = false, accel = 1.2, side = 0, from = 0, stripe = null } = opts;
  const group = new THREE.Group();
  const sp = sampler(path);
  const GAP = 25;
  const WHITE = [0.95, 0.96, 0.97];
  const BLUE = stripe ?? [0.2, 0.4, 0.72];
  const DARK = [0.14, 0.17, 0.24];
  // 几何体：车头 / 中间 / 车尾 三种，材质共用一套
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
  for (let i = 0; i < cars; i++) {
    const nose = cars === 1 ? 1 : i === 0 ? 1 : i === cars - 1 ? -1 : 0;
    const g = geosFor(nose);
    const car = new THREE.Group();
    car.rotation.order = 'YXZ';
    for (const m of [new THREE.Mesh(g.white, mats.white), new THREE.Mesh(g.blue, mats.blue), new THREE.Mesh(g.dark, mats.dark), new THREE.Mesh(g.white, mats.ink)]) {
      m.frustumCulled = false;
      car.add(m);
    }
    group.add(car);
    list.push(car);
  }
  // 头车中心的弧长范围
  const tail = (cars - 1) * GAP;
  const sMin = Math.min(sp.total, tail + 12);
  const sMax = Math.max(sMin, sp.total - 12);
  const halts = stops.map((s) => Math.min(sMax, Math.max(sMin, s + tail / 2))).sort((a, c) => a - c);
  let s = from ? sMax : Math.min(sMax, Math.max(sMin, opts.start != null ? opts.start + tail / 2 : sMin));
  let v = 0;
  let dir = opts.dir ?? (from ? -1 : 1);
  let wait = 0;
  const lead = [0, 0, 0];
  const place = () => {
    for (let i = 0; i < cars; i++) {
      const sc = s - i * GAP;
      const p0 = sp.at(sc - 9);
      const p1 = sp.at(sc + 9);
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const dz = p1[2] - p0[2];
      const car = list[i];
      // （两股道：往线路方向的右手边偏 side 米）
      const hl = Math.hypot(dx, dz) || 1;
      car.position.set((p0[0] + p1[0]) / 2 - (dz / hl) * side, (p0[1] + p1[1]) / 2 + 0.25, (p0[2] + p1[2]) / 2 + (dx / hl) * side);
      if (dx * dx + dz * dz > 1e-6) {
        car.rotation.y = Math.atan2(dx, dz);
        car.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
      }
      if (i === 0) {
        lead[0] = car.position.x;
        lead[1] = car.position.y;
        lead[2] = car.position.z;
      }
    }
  };
  /** 前方（按行驶方向）最近的停靠点；没有就是线路尽头。 */
  const target = () => {
    let best = dir > 0 ? sMax : sMin;
    for (const h of halts) if ((h - s) * dir > 0.5 && (h - s) * dir < (best - s) * dir) best = h;
    return best;
  };
  place();
  return {
    group,
    update(dt) {
      dt = Math.min(dt, 0.1);
      if (sMax - sMin < 1) return;
      if (wait > 0) {
        wait -= dt;
        return;
      }
      const t = target();
      const dist = (t - s) * dir;
      // 加速有限，离停靠点近了按 v² = 2·a·d 减速
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
  };
}
