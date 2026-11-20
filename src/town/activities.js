// 各个区域的特色玩法：滑雪、开船钓鱼、冲浪、晒太阳、采摘、种地……
// city.js 在合并建筑之前调用 placeActivities，把道具和交互点放进世界。
// 这里只管"世界里摆什么、哪儿能按 E"；怎么滑、怎么划、怎么冲浪在 actions.js，按 E 之后的面板在 interactions.js。
import * as THREE from 'three';
import { gableRoof, fence } from './buildings.js';
import { heightAt, roadEdge, fieldsAt, beachAt, SKI, SEA } from './plan.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg);
const ball = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);

/** 雪道上雪面比地面高多少（city.js 的雪盖在地面上面一层）：滑雪的人和旗门都站在雪面上。 */
export const SNOW_LIFT = 0.4;

/** 雪道局部坐标 → 世界：along 从坡底往坡顶（米），across 离中线（米，正的在西边）。 */
const skiPoint = (along, across = 0) => [SKI.bottom[0] + SKI.ux * along + SKI.uz * across, SKI.bottom[1] + SKI.uz * along - SKI.ux * across];

/** 回转赛道：八道旗门左右交错。actions.js 用同一份数据判过门。 */
export const SKI_COURSE = (() => {
  const gates = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const along = SKI.len * (0.86 - (i * 0.72) / (N - 1));
    const across = (i % 2 ? -1 : 1) * (6 + ((i * 37) % 5));
    const [x, z] = skiPoint(along, across);
    gates.push({ along, across, x, z, half: 4.2 });
  }
  return { gates, startAlong: SKI.len * 0.95, finishAlong: SKI.len * 0.05, point: skiPoint };
})();

export function placeActivities(ctx) {
  const { b, LM, add, claim, free, dry, district, gardenPlots, parasols, decor } = ctx;
  const safe = (name, fn) => {
    try {
      fn();
    } catch (e) {
      console.warn('activities:', name, e);
    }
  };
  /** 局部坐标系（和 stall 一样：局部 +z 是正面） */
  const frame = (x, z, rotY = 0, y = heightAt(x, z)) => {
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const at = (lx, ly, lz) => [x + lx * cos + lz * sin, y + ly, z - lx * sin + lz * cos];
    return { at, put: (geo, key, lx, ly, lz, turn = 0) => b.add(geo, key, at(lx, ly, lz), rotY + turn) };
  };
  /** 一块立着的木牌：一根杆 + 一块板，两面都写字 */
  const signpost = (x, z, text, rotY = 0, { w = 2.6, h = 0.62, bg = '#f3e6c4', fg = '#4a3320', up = 0 } = {}) => {
    const f = frame(x, z, rotY, heightAt(x, z) + up);
    for (const sx of [-1, 1]) f.put(cyl(0.06, 2.3, 6), 'wood#2', sx * (w / 2 - 0.1), 1.15, 0);
    f.put(box(w + 0.16, h + 0.16, 0.08), 'wood#1', 0, 1.95, 0);
    b.addSign(text, f.at(0, 1.95, 0.05), rotY, { w, h, bg, fg });
    b.addSign(text, f.at(0, 1.95, -0.05), rotY + Math.PI, { w, h, bg, fg });
  };
  /** 横幅门：两根高杆撑一条布，两面都写字（雪道的起点和终点） */
  const arch = (x, z, text, rotY, w, up = 0) => {
    const f = frame(x, z, rotY, heightAt(x, z) + up);
    for (const sx of [-1, 1]) f.put(cyl(0.09, 4.8, 8), 'wood#2', sx * (w / 2 + 0.12), 2.4, 0);
    f.put(box(w, 1.0, 0.06), 'cloth#0', 0, 4.1, 0);
    b.addSign(text, f.at(0, 4.1, 0.05), rotY, { w: w - 0.3, h: 0.86, bg: '#8c2f22', fg: '#fdf3df' });
    b.addSign(text, f.at(0, 4.1, -0.05), rotY + Math.PI, { w: w - 0.3, h: 0.86, bg: '#8c2f22', fg: '#fdf3df' });
  };
  /** 小木屋：木墙、人字顶、门、一扇亮着的窗、门楣上的招牌（正面朝局部 +z） */
  const cabin = (x, z, rotY, { w = 5, d = 4, h = 2.7, wall = 'wood#1', roof = 'roof#0', sign = '', bg = '#22304a', fg = '#f6f0e2', up = 0 } = {}) => {
    const f = frame(x, z, rotY, heightAt(x, z) + up);
    f.put(box(w, h, d), wall, 0, h / 2, 0);
    f.put(gableRoof(w + 0.9, d + 1.0, 1.5), roof, 0, h, 0);
    f.put(box(0.95, 1.85, 0.1), 'wood#2', -w * 0.22, 0.93, d / 2 + 0.03);
    f.put(box(1.3, 0.9, 0.1), 'glass#3', w * 0.2, 1.5, d / 2 + 0.03);
    f.put(box(1.5, 0.12, 0.3), 'wood#2', w * 0.2, 0.98, d / 2 + 0.12);
    if (sign) {
      // 招牌挂在屋檐外面一点，底下两根小吊杆
      f.put(box(Math.min(w - 0.2, 3.8), 0.78, 0.08), 'wood#2', 0, h - 0.1, d / 2 + 0.62);
      b.addSign(sign, f.at(0, h - 0.1, d / 2 + 0.67), rotY, { w: Math.min(w - 0.4, 3.6), h: 0.62, bg, fg });
    }
    LM.collideRot(b, x, z, rotY, w / 2, d / 2, h + 1.5);
    return f;
  };
  /** 从候选里挑第一个没被占的 */
  /** 这一圈里没有别人占着、也没压着哪栋房子的碰撞盒 */
  const clear = (x, z, r) => free(x, z, r) && !b.colliders.some((c) => Math.abs(c.x - x) < c.hw + r && Math.abs(c.z - z) < c.hd + r);
  const pickFree = (list, r) => list.find(([x, z]) => clear(x, z, r)) ?? list.find(([x, z]) => free(x, z, r)) ?? list[0];

  // ===== 雪山小镇：滑雪场 ======================================================================================
  safe('ski', () => {
    const rot = Math.atan2(SKI.ux, SKI.uz); // 局部 +z 朝坡顶，局部 x 横在雪道上
    const snowY = (x, z) => heightAt(x, z) + SNOW_LIFT;
    // 旗门：左红右蓝
    for (const g of SKI_COURSE.gates) {
      for (const side of [-1, 1]) {
        const [x, z] = skiPoint(g.along, g.across + side * g.half);
        const y = snowY(x, z);
        b.add(cyl(0.06, 2.5, 6), 'wood#2', [x, y + 1.05, z]);
        b.add(box(0.95, 0.62, 0.05), side > 0 ? 'cloth#0' : 'cloth#4', [x - SKI.uz * side * 0.48, y + 1.9, z + SKI.ux * side * 0.48], rot);
        claim(x, z, 1.2);
      }
    }
    // 魔毯：雪道东边一条慢慢往上走的传送带
    const side = -(SKI.half - 5);
    for (let a = 8, i = 0; a < SKI.len - 6; a += 5, i++) {
      const [x0, z0] = skiPoint(a - 2.5, side);
      const [x1, z1] = skiPoint(a + 2.5, side);
      const h0 = snowY(x0, z0);
      const h1 = snowY(x1, z1);
      const belt = box(1.25, 0.1, Math.hypot(5, h1 - h0) + 0.06);
      belt.rotateX(-Math.atan2(h1 - h0, 5));
      const [x, z] = skiPoint(a, side);
      b.add(belt, 'iron#0', [x, (h0 + h1) / 2 + 0.1, z], rot);
      if (i % 3 === 0) {
        for (const sx of [-1, 1]) {
          const [px, pz] = skiPoint(a, side + sx * 0.85);
          b.add(cyl(0.045, 1.0, 5), 'paint#1', [px, (h0 + h1) / 2 + 0.5, pz]);
          b.add(box(0.14, 0.14, 0.14), 'cloth#2', [px, (h0 + h1) / 2 + 1.05, pz]);
        }
      }
      if (i % 4 === 0) claim(x, z, 3);
    }
    // 起点和终点的横幅
    {
      const [sx, sz] = skiPoint(SKI.len * 0.975);
      arch(sx, sz, '出发 START', rot, 9, SNOW_LIFT);
      const [fx, fz] = skiPoint(SKI_COURSE.finishAlong - 1);
      arch(fx, fz, '终点 GOAL', rot, 12, SNOW_LIFT);
    }
    // 坡底的滑雪小屋：屋檐下靠着一排雪板
    const [hx, hz] = skiPoint(-22, 19);
    const f = cabin(hx, hz, 0, { w: 6, d: 4.4, h: 2.8, wall: 'wood#1', roof: 'roof#8', sign: '雪场小屋', bg: '#2a4a6a', up: 0.1 });
    f.put(box(3.4, 0.1, 0.1), 'wood#2', 5.2, 1.25, 1.2);
    for (const sx of [-1, 1]) f.put(cyl(0.06, 1.3, 6), 'wood#2', 5.2 + sx * 1.6, 0.65, 1.2);
    ['paint#1', 'cloth#1', 'cloth#2', 'paint#6', 'cloth#0', 'flower#4'].forEach((key, i) => {
      const ski = box(0.13, 1.75, 0.035);
      ski.rotateX(-0.2);
      f.put(ski, key, 3.9 + i * 0.52, 0.9, 1.42);
    });
    claim(hx, hz, 6.5);
    signpost(hx - 5.4, hz + 4.6, '魔毯上山 · 回转雪道', 0, { w: 3.2, up: 0.2 });
    add({ id: 'ski-hut', name: '滑雪场', kind: 'ski', x: hx + 1, z: hz + 5, r: 6.5, hint: 'E 滑雪' });
    const [tx, tz] = skiPoint(SKI_COURSE.startAlong + 3);
    add({ id: 'ski-top', name: '雪道坡顶', kind: 'ski', top: true, x: tx, z: tz, r: 9, hint: 'E 出发滑雪', map: false });
    const [lx, lz] = skiPoint(4, side);
    add({ id: 'ski-lift', name: '魔毯', kind: 'ski', lift: true, x: lx, z: lz, r: 4.5, hint: 'E 坐魔毯上山', map: false });
    // 一个等人打扮的雪人
    const [mx, mz] = skiPoint(-18, -14);
    LM.snowman(b, mx, mz, 1.15);
    claim(mx, mz, 2);
    add({ id: 'ski-snowman', name: '雪人', kind: 'snowman', x: mx, z: mz, r: 3, hint: 'E 给雪人拍拍雪', map: false });
    // 雪道上别长树
    for (let a = -30; a <= SKI.len + 10; a += 14) claim(...skiPoint(a), SKI.half - 4);
  });

  // ===== 湖边小镇：栈桥头租船，划到湖心去钓鱼 ==================================================================
  safe('boat', () => {
    decor.push({ name: 'infra-kiosk', x: 172, z: -505.5, h: 3.0, r: 1.4 });
    signpost(166.5, -508.6, '租船 · 湖上钓鱼', Math.PI / 2, { w: 2.8, bg: '#2f5d6e', fg: '#fdf6e0' });
    // 栈桥头的桨和救生圈
    const y = heightAt(170.5, -508.2);
    for (const [i, key] of ['wood#1', 'wood#0', 'paint#1'].entries()) {
      const oar = cyl(0.04, 2.2, 5);
      oar.rotateX(0.24);
      b.add(oar, key, [169.6 + i * 0.35, y + 1.05, -503.4]);
    }
    const ring = new THREE.TorusGeometry(0.34, 0.1, 6, 12);
    b.add(ring, 'cloth#0', [171, y + 1.5, -503.6]);
    add({ id: 'boat-lake', name: '月亮湖租船', kind: 'boat', vehicle: 'transport-rowboat', fee: 8, x: 143, z: -512, r: 11, launch: [128, -512], land: [140, -512], hint: 'E 租船' });
    // 海边新城的码头也能租一条出海
    signpost(-702, 511.5, '租船 · 出海钓鱼', 0, { w: 2.8, bg: '#2f5d6e', fg: '#fdf6e0' });
    add({ id: 'boat-harbor', name: '码头租船', kind: 'boat', vehicle: 'transport-rowboat', fee: 10, x: -705, z: 542, r: 6, launch: [-698.5, 546], land: [-705, 542], hint: 'E 租船出海' });
  });

  // ===== 沙滩：冲浪小屋、躺椅、贝壳 ============================================================================
  safe('beach', () => {
    const [sx, sz] = pickFree([[372, 535], [364, 533], [352, 536], [416, 533], [382, 528]], 4.5);
    const f = cabin(sx, sz, 0, { w: 4.6, d: 3.4, h: 2.5, wall: 'wood#0', roof: 'cloth#1', sign: '冲浪板出租', bg: '#f3e6c4', fg: '#8c2f22' });
    // 条纹遮阳篷
    for (let i = 0; i < 6; i++) {
      const strip = box(0.78, 0.07, 1.5);
      strip.rotateX(0.22);
      f.put(strip, i % 2 ? 'cloth#3' : 'cloth#0', -1.95 + i * 0.78, 1.98, 2.5);
    }
    for (const lx of [-2.2, 2.2]) f.put(cyl(0.05, 1.84, 6), 'wood#2', lx, 0.92, 3.15);
    // 一排冲浪板：斜靠在横杆上
    f.put(box(4.4, 0.09, 0.09), 'wood#2', 5.0, 1.35, 0.4);
    for (const lx of [2.9, 7.1]) f.put(cyl(0.06, 1.4, 6), 'wood#2', lx, 0.7, 0.4);
    ['cloth#0', 'cloth#2', 'paint#0', 'flower#0', 'cloth#1', 'flower#2'].forEach((key, i) => {
      const board = ball(1, 12, 8);
      board.scale(0.27, 1.08, 0.045);
      board.rotateX(-0.2);
      f.put(board, key, 3.3 + i * 0.68, 1.08, 0.66);
      const stripe = box(0.07, 1.5, 0.02);
      stripe.rotateX(-0.2);
      f.put(stripe, i % 2 ? 'cloth#3' : 'cloth#4', 3.3 + i * 0.68, 1.08, 0.72);
    });
    claim(sx, sz, 5);
    claim(sx + 5, sz + 0.5, 3);
    add({ id: 'surf-shack', name: '冲浪小屋', kind: 'surf', fee: 6, x: sx + 1.5, z: sz + 3.6, r: 5.5, hint: 'E 租冲浪板' });

    // 躺椅：三张，头朝岸、脚朝海，旁边撑着阳伞
    const [lx0, lz0] = pickFree([[398, 538.5], [404, 534], [430, 531], [388, 541]], 6);
    for (let i = 0; i < 3; i++) {
      const x = lx0 + i * 4.4;
      const z = lz0 + (i % 2) * 0.5;
      const l = frame(x, z, 0);
      const K = 1.35; // 她是个大头娃娃，躺椅也得大一号
      const part = (w, h, d, key, lx, ly, lz, tilt = 0) => {
        const g = box(w * K, h * K, d * K);
        if (tilt) g.rotateX(tilt);
        l.put(g, key, lx * K, ly * K, lz * K);
      };
      part(0.74, 0.07, 1.25, 'wood#1', 0, 0.33, 0.35);
      for (const [px, pz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.9], [0.3, 0.9]]) l.put(cyl(0.045, 0.33 * K, 5), 'wood#2', px * K, 0.165 * K, pz * K);
      part(0.74, 0.07, 0.82, 'wood#1', 0, 0.56, -0.6, 0.62);
      const stripes = ['cloth#0', 'cloth#3', 'cloth#1', 'cloth#3'];
      for (let k = 0; k < 4; k++) part(0.68, 0.05, 0.3, stripes[(k + i) % 4], 0, 0.39, -0.1 + k * 0.31);
      part(0.6, 0.07, 0.72, stripes[(i * 2) % 4], 0, 0.62, -0.58, 0.62);
      parasols.push([x + 1.5, z - 1.1]);
      claim(x, z, 1.8);
      add({ id: `lounger-${i}`, name: '沙滩躺椅', kind: 'lounger', x, z: z + 0.3, r: 1.9, yaw: 0, seatY: 0.56, hint: 'E 躺下晒太阳', map: i === 1 ? undefined : false });
    }

    // 赶海：潮线上的贝壳
    let n = 0;
    for (const x of [318, 348, 432, 466, 502, 540]) {
      for (let z = 480; z < 650; z += 1) {
        const h = heightAt(x, z);
        if (h > SEA.level + 0.5) continue;
        if (h > SEA.level + 0.12 && beachAt(x, z) > 0.5 && free(x, z, 1)) {
          const shell = new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
          shell.scale(1, 0.55, 1.25);
          b.add(shell, 'flower#0', [x, h, z], n * 1.3);
          const small = shell.clone();
          small.scale(0.6, 0.6, 0.6);
          b.add(small, 'paint#2', [x + 0.55, h, z - 0.25], n * 2.1 + 1);
          b.add(small, 'flower#2', [x - 0.4, h, z + 0.45], n * 0.7);
          claim(x, z, 1);
          add({ id: `shell-${n}`, name: '贝壳滩', kind: 'shell', x, z, r: 2.4, hint: 'E 捡贝壳', map: n === 0 ? undefined : false });
          n++;
        }
        break;
      }
    }
  });

  // ===== 田园小镇：自摘果园 + 十二块田 ==========================================================================
  safe('pastoral', () => {
    const d = district('pastoral');
    const HW = 13;
    const HD = 10;
    const ok = (x, z) => {
      if (!free(x, z, 15) || !dry(x, z, 4)) return false;
      let lo = 1e9;
      let hi = -1e9;
      for (const [dx, dz] of [[0, 0], [-HW, -HD], [HW, -HD], [-HW, HD], [HW, HD], [0, -HD], [0, HD], [-HW, 0], [HW, 0]]) {
        if (roadEdge(x + dx, z + dz) < 4 || fieldsAt(x + dx, z + dz) > 0.3) return false;
        const h = heightAt(x + dx, z + dz);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      return hi - lo < 1.2;
    };
    const tries = [[36, -6], [-34, -18], [34, 40], [-38, 44], [44, -58], [-44, -62], [62, 14], [-64, 10]];
    for (let r = 24; r <= 120; r += 8) for (let a = 0; a < 12; a++) tries.push([Math.cos(a * 0.5236 + r) * r, Math.sin(a * 0.5236 + r) * r]);
    const spot = tries.find(([dx, dz]) => ok(d.x + dx, d.z + dz)) ?? tries[0];
    const cx = d.x + spot[0];
    const cz = d.z + spot[1];
    const P = (lx, lz) => [cx + lx, cz + lz];
    const put = (geo, key, lx, ly, lz, rot = 0) => b.add(geo, key, [cx + lx, heightAt(cx + lx, cz + lz) + ly, cz + lz], rot);

    // 莓子：两垄矮矮的
    const bush = (lx, lz, r, berry, seed) => {
      const g = ball(r, 8, 6);
      g.scale(1, 0.72, 1);
      put(g, seed % 2 ? 'leaf#1' : 'leaf#0', lx, 0.45 + r * 0.55, lz);
      for (let k = 0; k < 4; k++) {
        const a = seed * 1.7 + k * 1.57;
        put(ball(r * 0.19, 6, 4), berry, lx + Math.cos(a) * r * 0.72, 0.45 + r * (0.5 + 0.28 * ((k + seed) % 3)), lz + Math.sin(a) * r * 0.72);
      }
    };
    // （垄是木框围起来的高畦：草长得高，莓子得垫起来才看得见）
    for (const lz of [-7.6, -4.4]) {
      put(box(9.6, 0.5, 1.5), 'wood#1', -7.25, 0.2, lz);
      put(box(9.3, 0.5, 1.2), 'road#0', -7.25, 0.24, lz);
    }
    const bush0 = bush;
    for (let i = 0; i < 6; i++) {
      bush0(-11 + i * 1.5, -7.6, 0.5, 'flower#3', i);
      bush0(-11 + i * 1.5, -4.4, 0.66, 'flower#4', i + 3);
    }
    // 果树：两棵苹果、两棵橘子
    const tree = (lx, lz, fruit, seed) => {
      put(cyl(0.15, 1.7, 6), 'wood#0', lx, 0.85, lz);
      const crown = new THREE.IcosahedronGeometry(1.35, 1);
      crown.scale(1, 0.86, 1);
      put(crown, seed % 2 ? 'leaf#0' : 'leaf#1', lx, 2.45, lz);
      for (let k = 0; k < 7; k++) {
        const a = seed * 2.3 + k * 0.9;
        const up = -0.35 + ((k * 5 + seed) % 4) * 0.28;
        const rr = Math.sqrt(Math.max(0.1, 1.35 * 1.35 - (up / 0.86) * (up / 0.86)));
        put(ball(0.14, 6, 5), fruit, lx + Math.cos(a) * rr, 2.45 + up, lz + Math.sin(a) * rr);
      }
      b.collide(cx + lx, cz + lz, 0.22, 0.22, 3);
    };
    tree(3.2, -7.2, 'flower#3', 1);
    tree(7.6, -7.2, 'flower#3', 2);
    tree(3.2, -2.8, 'paint#1', 3);
    tree(7.6, -2.8, 'paint#1', 4);
    for (const [id, fruit, lx, lz, r] of [['strawberry', '草莓', -7.2, -7.6, 2.6], ['blueberry', '蓝莓', -7.2, -4.4, 2.6], ['apple', '苹果', 5.4, -7.2, 3.3], ['orange', '橘子', 5.4, -2.8, 3.3]]) {
      const [x, z] = P(lx, lz);
      add({ id: `pyo-${id}`, name: `自摘${fruit}`, kind: 'orchard', fruit, x, z, r, hint: `E 摘${fruit}`, map: id === 'strawberry' ? undefined : false });
    }
    // 十二块能种的田
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) gardenPlots.push({ x: cx - 9.6 + col * 2.6, z: cz + 2.6 + row * 2, where: '田园小镇的田' });
    // 收购摊：自己种的、摘的都收
    {
      const [x, z] = P(7.4, 5.2);
      decor.push({ name: 'infra-market-stall', x, z, h: 2.7, r: 1.6 });
      for (const [lx, lz, key] of [[4.9, 6.6, 'flower#3'], [5.5, 6.9, 'paint#1'], [9.9, 6.4, 'leaf#1']]) {
        put(box(0.7, 0.42, 0.52), 'wood#1', lx, 0.21, lz, lx);
        for (let k = 0; k < 3; k++) put(ball(0.13, 6, 4), key, lx - 0.2 + k * 0.2, 0.5, lz);
      }
      add({ id: 'farmstand', name: '田园收购摊', kind: 'farmstand', x, z: z + 1.2, r: 3.6, hint: 'E 卖菜卖水果' });
    }
    // 矮篱笆（南边留一个门）和木牌
    const c = [P(-HW, -HD), P(HW, -HD), P(HW, HD), P(-HW, HD)];
    fence(b, ...c[0], ...c[1], 0.9);
    fence(b, ...c[1], ...c[2], 0.9);
    fence(b, ...c[3], ...c[0], 0.9);
    fence(b, ...c[3], ...P(-2.2, HD), 0.9);
    fence(b, ...P(2.2, HD), ...c[2], 0.9);
    signpost(...P(-4.6, HD + 0.9), '开心农场 · 自摘果园', 0, { w: 3.6, bg: '#5d7a3a', fg: '#fdf6e0' });
    claim(cx, cz, 16);
    add({ id: 'pyo', name: '开心农场', kind: 'village', x: cx, z: cz + HD + 1.5, r: 3, hint: 'E 看看木牌', text: '莓子和果子随便摘，每天每样一小篮。里面十二块田是给客人种的：种子在种子铺买，熟了拿到摊子上卖。', map: false });
  });

  // ===== 别的区：一处一个小乐子 ================================================================================
  safe('port', () => {
    // 港口：码头工人缺人手，帮忙搬几箱货
    const d = district('port');
    const list = [];
    for (let r = 14; r <= 62; r += 8) for (let a = 0; a < 10; a++) list.push([d.x + Math.cos(a * 0.628 + r) * r, d.z + Math.sin(a * 0.628 + r) * r]);
    const [x, z] = pickFree(list.filter(([px, pz]) => roadEdge(px, pz) > 2 && heightAt(px, pz) > SEA.level + 1.5), 4.5);
    LM.crate(b, x, z, 1);
    LM.crate(b, x + 1.3, z + 0.3, 0.9);
    LM.crate(b, x + 0.5, z - 1.25, 0.8);
    b.add(box(0.9, 0.9, 0.9), 'wood#0', [x + 0.4, heightAt(x, z) + 1.5, z + 0.1], 0.5);
    b.add(box(1.5, 0.14, 1.1), 'wood#2', [x - 1.9, heightAt(x - 1.9, z) + 0.07, z + 0.4], 0.2);
    claim(x, z, 3.2);
    add({ id: 'job-port', name: '港口货场', kind: 'work', job: 'port', x: x - 1, z: z + 1.6, r: 4, hint: 'E 帮忙搬货' });
  });
  safe('office', () => {
    // 新新区：写字楼招临时工
    const d = district('cbd');
    const list = [];
    for (let r = 10; r <= 60; r += 10) for (let a = 0; a < 8; a++) list.push([d.x + Math.cos(a * 0.785 + r) * r, d.z + Math.sin(a * 0.785 + r) * r]);
    const [x, z] = list.find(([px, pz]) => clear(px, pz, 2.2) && roadEdge(px, pz) > 0.6 && roadEdge(px, pz) < 7) ?? list.find(([px, pz]) => clear(px, pz, 2.2)) ?? list[0];
    decor.push({ name: 'infra-notice-board', x, z, h: 2.2, r: 1 });
    add({ id: 'job-office', name: '写字楼招聘栏', kind: 'work', job: 'office', x, z: z + 0.8, r: 3.4, hint: 'E 打半天工' });
  });
  safe('chess', () => {
    // 海边新城：樱花树下的棋摊
    const [x, z] = [-769, 403];
    const y = heightAt(x, z);
    b.add(cyl(0.16, 0.66, 8), 'stone#0', [x, y + 0.33, z]);
    b.add(cyl(0.62, 0.1, 10), 'stone#2', [x, y + 0.7, z]);
    b.add(box(0.56, 0.04, 0.56), 'wall#6', [x, y + 0.77, z]);
    for (let k = 0; k < 6; k++) b.add(cyl(0.045, 0.03, 6), k % 2 ? 'iron#0' : 'cloth#0', [x - 0.18 + (k % 3) * 0.18, y + 0.8, z - 0.1 + Math.floor(k / 3) * 0.2]);
    for (const dx of [-1, 1]) b.add(cyl(0.22, 0.42, 8), 'stone#1', [x + dx * 0.95, y + 0.21, z]);
    b.collide(x, z, 0.6, 0.6, 1);
    claim(x, z, 2);
    add({ id: 'chess', name: '树下棋摊', kind: 'chess', x, z: z + 0.6, r: 2.8, hint: 'E 下一盘棋' });
  });

  return { update() {} };
}
