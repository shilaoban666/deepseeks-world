// 主角能做的动作：走、跑、跳、爬树、游泳、潜水、钓鱼、晒太阳、点火；还有各区的特色玩法：滑雪、划船、冲浪。
//
// 一个很小的状态机：ground（地上，含跳起来在空中）/ climb / swim / dive / fish / lie / ski / boat / surf。
// 水平方向的走动和碰撞还是 player.js 的 mover，这里只管"现在是哪种动作"、竖直方向怎么动、
// 体力和氧气怎么变、脚下冒什么粒子。每帧返回给主循环：她在不在动、摆什么姿势、镜头看多高。
import * as THREE from 'three';
import { createPlantBatch } from './billboard.js';
import { FISH } from './fishdex.js';
import { paintMaterial, outlineMaterial } from './paint.js';
import { SKI_COURSE, SNOW_LIFT } from './activities.js';

const GRAVITY = 16;
const JUMP = 5.8;
const JUMP_DOUBLE = 6.2;

/**
 * @param o.whale 主角；o.mover 走路；o.cam 镜头；o.game 游戏状态（体力、钓鱼）；o.hud 界面
 * @param o.woods 会长的树（爬树用）；o.particles 粒子；o.field 草地（点火）；o.plan 地图函数
 * @param o.weather 天气（下雨不能晒太阳、点不着火）；o.plants 物件图集（水下的鱼）；o.shared uniforms
 */
export function createActions({ rig = null, whale, mover, cam, game, hud, woods, particles, field, plan, weather, plants, shared, scene, vehicleAssets = null }) {
  const s = whale.state;
  const st = game.state;
  let mode = 'ground';
  let air = false;
  let jumpCount = 0;
  let doubleJumpTimer = 0;
  let prevGroundY = s.y;
  let tree = null; // 正在爬的树 { x, z, top }
  let oxygen = 100;
  const handPos = new THREE.Vector3();
  let dustAcc = 0;
  let rippleAcc = 0;
  let bubbleAcc = 0;
  let lieTime = 0;
  let wasFishing = false;
  let lastWater = null;
  let kite = null;
  let kiteLine = null;
  let kitePhase = 0;
  {
    kite = vehicleAssets?.createKite?.() ?? null;
    if (!kite) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.7); shape.lineTo(0.55, 0); shape.lineTo(0, -0.7); shape.lineTo(-0.55, 0); shape.closePath();
      kite = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xe87961, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
    }
    kite.visible = false; scene.add(kite);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    kiteLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf5e8ca, transparent: true, opacity: 0.85 }));
    kiteLine.visible = false; scene.add(kiteLine);
  }

  // ---- 各区的特色玩法：滑雪 / 划船 / 冲浪 / 躺椅 ----
  let modeAt = 0; // 上一次进出这些玩法的时刻（同一下 E 不要既开始又结束）
  let ski = null; // { v, time, gates, next, timed, spray }
  let aboard = null; // 在船上：{ vehicle, name, home, v, level, phase, idx, vmax }
  let surf = null; // { v, time, tricks, h, vy, spin, roll, grace, spray, phase }
  let lounger = null; // 躺在躺椅上：{ y, from }
  const SEAT = 0.02; // 坐在船里，人比水面高多少
  const spot = [0, 0];
  /** 手绘画法的小道具：平涂两阶色 + 倒壳墨线（和风车叶片一个做法） */
  const inked = (geo, lit, kind = 'flat', thick = 0.025) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, paintMaterial(shared, { lit, shade: lit.map((c) => c * 0.62), kind }));
    const ink = new THREE.Mesh(geo, outlineMaterial(shared, [0.05, 0.06, 0.12], thick));
    m.frustumCulled = ink.frustumCulled = false;
    g.add(m, ink);
    return g;
  };
  // 雪板：两条翘头的板子
  const skiProp = new THREE.Group();
  skiProp.rotation.order = 'YXZ';
  for (const sx of [-1, 1]) {
    const plank = new THREE.BoxGeometry(0.12, 0.035, 1.7);
    plank.translate(sx * 0.15, 0.02, 0.12);
    const tip = new THREE.BoxGeometry(0.12, 0.035, 0.26);
    tip.rotateX(-0.5);
    tip.translate(sx * 0.15, 0.075, 1.07);
    skiProp.add(inked(plank, sx > 0 ? [0.88, 0.5, 0.22] : [0.88, 0.5, 0.22]), inked(tip, [0.9, 0.72, 0.28]));
  }
  // 冲浪板：一片珊瑚红的板子，中间一道米白
  const boardProp = new THREE.Group();
  boardProp.rotation.order = 'YXZ';
  {
    const deck = new THREE.SphereGeometry(1, 14, 8);
    deck.scale(0.3, 0.05, 1.12);
    const stripe = new THREE.BoxGeometry(0.07, 0.012, 1.7);
    stripe.translate(0, 0.05, 0);
    const fin = new THREE.BoxGeometry(0.03, 0.2, 0.26);
    fin.translate(0, -0.12, -0.8);
    boardProp.add(inked(deck, [0.92, 0.42, 0.34]), inked(stripe, [0.96, 0.93, 0.84], 'flat', 0.008), inked(fin, [0.24, 0.32, 0.56], 'flat', 0.012));
  }
  skiProp.visible = boardProp.visible = false;
  scene.add(skiProp, boardProp);
  // 坐的船：life 图集里手绘的小木船 / 皮划艇 / 独木舟，一条立牌跟着人走
  const BOATS = { 'transport-rowboat': 2.0, 'transport-kayak': 1.3, 'transport-canoe': 1.4 };
  let boatAt = null;
  const boatIdx = {};
  if (plants?.life?.length) {
    const sprites = plants.life[0].sprites;
    const places = [];
    for (const [name, h] of Object.entries(BOATS)) {
      const sprite = sprites.findIndex((sp) => sp.name === name);
      if (sprite < 0) continue;
      boatIdx[name] = places.length;
      places.push({ x: 0, z: 0, y: -999, h, sprite });
    }
    if (places.length) {
      const batch = createPlantBatch(shared, plants.life, places, { alpha: 0.16, sway: 0 });
      scene.add(batch);
      boatAt = batch.children[0].geometry.attributes.aOffset;
    }
  }
  const hideBoats = () => {
    if (!boatAt) return;
    for (let i = 0; i < boatAt.count; i++) boatAt.setY(i, -999);
    boatAt.needsUpdate = true;
  };

  // 钓竿：一根细杆 + 一根线 + 一个红白浮漂
  const rod = new THREE.Group();
  const rodMat = new THREE.MeshBasicMaterial({ color: 0x5a3a22 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 2.2, 5), rodMat);
  stick.geometry.translate(0, 1.1, 0);
  rod.add(stick);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8e4da }));
  line.frustumCulled = false;
  const float = new THREE.Group();
  const fTop = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8483a }));
  const fBot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf4efe4 }));
  float.add(fTop, fBot);
  rod.visible = line.visible = float.visible = false;
  scene.add(rod, line, float);
  let floatAt = null;

  // 晒太阳的毯子
  const towel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.8), new THREE.MeshBasicMaterial({ color: 0xe8a65a }));
  towel.geometry.rotateX(-Math.PI / 2);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.22), new THREE.MeshBasicMaterial({ color: 0xf6efe0 }));
  stripe.geometry.rotateX(-Math.PI / 2);
  stripe.position.y = 0.005;
  towel.add(stripe);
  towel.visible = false;
  scene.add(towel);

  // 水下的鱼：湖、河、海各一群（图鉴里那片水的鱼），跟着潜水的人
  let fish = null;
  if (plants?.fish?.length) {
    const sprites = plants.fish[0].sprites;
    const idxOf = new Map(sprites.map((sp, i) => [sp.name, i]));
    const pick = (water) => FISH.filter((f) => f.water === water && f.rarity <= 3).map((f) => idxOf.get(f.id)).filter((i) => i != null);
    const schools = {};
    for (const water of ['lake', 'river', 'sea']) {
      const ids = pick(water);
      const school = Array.from({ length: 16 }, (_, i) => ({
        a: Math.random() * 6.28,
        r: 2 + Math.random() * 6,
        h: Math.random(),
        w: (0.25 + Math.random() * 0.4) * (i % 2 ? 1 : -1),
        size: 0.3 + Math.random() * 0.45,
        phase: Math.random() * 6.28,
        depth: 0.45 + Math.random() * 0.8,
      }));
      const batch = createPlantBatch(shared, plants.fish, school.map((f, i) => ({ x: 0, z: 0, y: -999, h: f.size, sprite: ids[i % ids.length] })), { alpha: 0.16, sway: 0 });
      batch.visible = false;
      scene.add(batch);
      schools[water] = { batch, school, at: batch.children[0].geometry.attributes.aOffset };
    }
    fish = schools;
  }

  const keyDown = (c) => mover.keys.has(c);
  const moveKeys = () => ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(keyDown);
  const forward = () => [Math.sin(s.yaw), Math.cos(s.yaw)];

  /** 身边最近的、能爬的树（树干 2.6 m 以内的大树和中等的树） */
  const nearTree = () => {
    if (!woods?.trees) return null;
    let best = null;
    let bestD = 2.6;
    for (const t of woods.trees) {
      if (t[2] > 6) continue;
      const d = Math.hypot(t[0] - s.x, t[1] - s.z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) return null;
    const size = woods.sizes?.[best[2]];
    const top = (size ? size.crownY : 5) * best[3] * 0.92;
    return { x: best[0], z: best[1], top, ground: plan.heightAt(best[0], best[1]) };
  };
  /** 前面 1~5 米有没有水（钓鱼用） */
  const waterAhead = () => {
    const [fx, fz] = forward();
    for (let d = 1.5; d <= 6; d += 0.75) {
      const x = s.x + fx * d;
      const z = s.z + fz * d;
      const w = plan.waterAt(x, z);
      if (w != null && w - plan.heightAt(x, z) > 0.3) return { x, z, y: w };
    }
    return null;
  };
  const depthHere = () => {
    const w = plan.waterAt(s.x, s.z);
    return w == null ? null : { level: w, depth: w - plan.heightAt(s.x, s.z) };
  };

  const now = () => performance.now();
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  /** 镜头慢慢绕到身后（滑雪、划船、冲浪都是"朝着自己的方向"操纵的） */
  const followCam = (dt, rate) => {
    cam.yaw += wrap(s.yaw + Math.PI - cam.yaw) * Math.min(1, dt * rate);
  };
  /** A / D：+1 往左转，-1 往右转 */
  const steer = () => (keyDown('KeyA') || keyDown('ArrowLeft') ? 1 : 0) - (keyDown('KeyD') || keyDown('ArrowRight') ? 1 : 0);
  const todayN = (key) => (st.fun?.[key]?.day === st.day ? st.fun[key].n : 0);
  const bump = (key) => {
    (st.fun ??= {})[key] = { day: st.day, n: todayN(key) + 1 };
  };
  const SKI = plan.SKI;
  const skiAlong = (x, z) => (x - SKI.bottom[0]) * SKI.ux + (z - SKI.bottom[1]) * SKI.uz;
  const skiAcross = (x, z) => (x - SKI.bottom[0]) * SKI.uz - (z - SKI.bottom[1]) * SKI.ux;
  const snowUp = (x, z) => SNOW_LIFT * Math.min(1, Math.max(0, (plan.snowAt(x, z) - 0.12) / 0.48));
  const onSkiRun = () => SKI && Math.abs(s.x - SKI.bottom[0]) < 260 && Math.abs(s.z - SKI.bottom[1]) < 260 && plan.skiAt(s.x, s.z).k > 0.4 && plan.snowAt(s.x, s.z) > 0.3;
  const inSea = () => {
    const w = depthHere();
    return !!w && w.depth > 0.8 && plan.waterKind(s.x, s.z) === 'sea';
  };

  // ---- 滑雪 ----
  const stopSki = (say = true) => {
    if (mode !== 'ski') return;
    mode = 'ground';
    modeAt = now();
    ski = null;
    skiProp.visible = false;
    s.y = plan.walkAt(s.x, s.z);
    if (say) hud.toast('把雪板卸下来，扛在肩上');
  };
  const startSki = () => {
    if (mode === 'ski') return true;
    if (st.riding) return void hud.toast('先从车上下来');
    if (mode !== 'ground' || air) return void hud.toast('先站稳了再扣雪板');
    if (!onSkiRun()) return void hud.toast('这儿不是雪道。雪山小镇北边的雪场才能滑');
    const along = skiAlong(s.x, s.z);
    const gates = SKI_COURSE.gates;
    let next = 0;
    while (next < gates.length && gates[next].along > along - 1) next++;
    const timed = along >= SKI_COURSE.startAlong - 16;
    mode = 'ski';
    modeAt = now();
    ski = { v: 0.8, time: 0, gates: 0, next, timed, spray: 0 };
    s.yaw = Math.atan2(-SKI.ux, -SKI.uz);
    cam.want = Math.max(cam.want, 8.5);
    hud.toast(timed ? '雪板扣好了——出发！A / D 转弯，S 刹车，从红旗蓝旗中间穿过去' : '雪板扣好了。A / D 转弯，S 刹车（从坡顶出发才计时）', 3200);
    return true;
  };
  /** 坐魔毯到坡顶；go = 到了直接出发 */
  const skiLift = (go) => {
    if (st.riding) return void hud.toast('先从车上下来');
    if (mode === 'ski') stopSki(false);
    if (mode !== 'ground') return;
    const [x, z] = SKI_COURSE.point(SKI_COURSE.startAlong, 0);
    s.x = x;
    s.z = z;
    s.y = s.groundY = plan.walkAt(x, z);
    s.yaw = Math.atan2(-SKI.ux, -SKI.uz);
    cam.yaw = s.yaw + Math.PI;
    air = false;
    st.minutes += 4;
    modeAt = now();
    if (go) startSki();
    else hud.toast('魔毯慢悠悠地把你送到了坡顶。整个小镇都在脚下——按 E 出发', 3200);
  };
  const finishSki = () => {
    const k = ski;
    const total = SKI_COURSE.gates.length;
    const paid = todayN('ski') < 3;
    const pay = paid ? 6 + k.gates * 3 : 0;
    bump('ski');
    const best = st.fun.skiBest;
    const record = !best || k.gates > best.gates || (k.gates === best.gates && k.time < best.time);
    if (record) st.fun.skiBest = { time: k.time, gates: k.gates };
    st.coins += pay;
    st.stamina = Math.max(0, st.stamina - 6);
    for (let i = 0; i < 14; i++) particles.emit({ x: s.x, y: s.y + 0.3, z: s.z, vx: (Math.random() - 0.5) * 5, vy: 1.5 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 5, life: 0.9, size: 0.14, color: [0.96, 0.98, 1], alpha: 0.85, gravity: 6, drag: 1 });
    stopSki(false);
    game.syncStats?.();
    hud.open(
      k.gates === total ? '一道门都没漏！' : '冲过终点',
      `<p>用时 <b>${k.time.toFixed(1)}</b> 秒，穿过 <b>${k.gates} / ${total}</b> 道旗门。${record ? '<span class="ok">新的最好成绩！</span>' : ''}</p><p class="dim">${paid ? `雪场的人往你手里塞了 ${pay} 金币的"勇气奖"（每天头三趟有）。` : '今天的勇气奖领完了，纯滑着玩。'}</p>`,
      [
        { label: '再来一趟（坐魔毯）', primary: true, onClick: () => { hud.close(); skiLift(true); } },
        { label: '歇会儿', onClick: () => hud.close() },
      ],
    );
    cam.unlock?.();
  };

  // ---- 划船 ----
  /** 这儿船能不能去：水够深、不压着栈桥码头、没出地图；能去就返回水面高度 */
  const boatable = (x, z) => {
    const w = plan.waterAt(x, z);
    if (w == null || w - plan.heightAt(x, z) < 0.45) return null;
    if (plan.bridgeAt(x, z)?.kind) return null;
    const lim = plan.HALF - 45;
    return Math.abs(x) > lim || Math.abs(z) > lim ? null : w;
  };
  /** 身边 R 米内最近的一块能站人的地（岸、栈桥面）；结果放在 spot 里 */
  const landNear = (R) => {
    for (let r = 1.5; r <= R; r += 1.5) {
      for (let a = 0; a < 12; a++) {
        const x = s.x + Math.cos(a * 0.5236) * r;
        const z = s.z + Math.sin(a * 0.5236) * r;
        const w = plan.waterAt(x, z);
        if ((w == null || plan.walkAt(x, z) > w - 0.25) && !plan.inLake(x, z)) {
          spot[0] = x;
          spot[1] = z;
          return spot;
        }
      }
    }
    return null;
  };
  let rental = null;
  const startBoat = (it = {}) => {
    if (aboard) return true;
    if (st.riding) return void hud.toast('先从车上下来');
    if ((mode !== 'ground' && mode !== 'swim') || air) return void hud.toast('现在腾不出手');
    let to = null;
    if (it.launch && boatable(it.launch[0], it.launch[1]) != null) to = it.launch;
    for (let r = 2; r <= 28 && !to; r += 2) {
      for (let a = 0; a < 12; a++) {
        const x = s.x + Math.cos(a * 0.5236) * r;
        const z = s.z + Math.sin(a * 0.5236) * r;
        const w = boatable(x, z);
        if (w != null && w - plan.heightAt(x, z) > 0.75) {
          spot[0] = x;
          spot[1] = z;
          to = spot;
          break;
        }
      }
    }
    if (!to) return void hud.toast('这儿离水太远，船推不下去');
    const vehicle = BOATS[it.vehicle] ? it.vehicle : 'transport-rowboat';
    const name = it.land ? '小木船' : (it.name ?? '小木船');
    const from = it.land ?? [s.x, s.z];
    s.yaw = Math.atan2(to[0] - from[0], to[1] - from[1]);
    s.x = to[0];
    s.z = to[1];
    const level = plan.waterAt(s.x, s.z);
    aboard = { vehicle, name, home: it.land ? it : null, v: 0, level, phase: 0, idx: boatIdx[vehicle] ?? -1, vmax: vehicle === 'transport-rowboat' ? 4.4 : 5.4 };
    // 立体的船：岸上那一条推下水（它的碰撞盒让开）；租来的另要一条
    aboard.it = it;
    aboard.model = rig ? (it.model?.slot ? it.model : (rental ??= rig.spawn('rowboat'))) : null;
    if (it.model?.col) it.model.col.off = true;
    if (aboard.home) {
      // 租船的地方：在船上的时候，提示换成"还船"
      it.hintAshore ??= it.hint;
      it.hint = 'E 靠岸还船';
    }
    s.y = level + SEAT;
    mode = 'boat';
    modeAt = now();
    air = false;
    cam.want = Math.max(cam.want, 9);
    particles.splash(s.x, level, s.z, 0.8);
    hud.toast(`坐进${name}了。W / S 划桨，A / D 转船头；开阔水面按 E 下竿，X 靠岸下船`, 3600);
    return true;
  };
  const leaveBoat = () => {
    const a = aboard;
    if (!a) return false;
    const to = a.home && Math.hypot(a.home.x - s.x, a.home.z - s.z) < a.home.r + 7 ? a.home.land : landNear(11);
    if (!to) {
      hud.toast('离岸太远了。划到岸边或者栈桥旁边再下船');
      return false;
    }
    if (game.fishing) game.stopFishing?.();
    if (a.model) {
      if (a.model === rental) rig.move(rental, 0, -999, 0, 0);
      else {
        // 船留在靠岸的水边：离上岸的地方两三米，下次还从这儿推
        const d = Math.hypot(s.x - to[0], s.z - to[1]) || 1;
        const k = Math.min(1, 2.8 / d);
        const bx = to[0] + (s.x - to[0]) * k;
        const bz = to[1] + (s.z - to[1]) * k;
        const wl = plan.waterAt(bx, bz);
        const by = wl ?? plan.heightAt(bx, bz) + 0.17;
        rig.move(a.model, bx, by, bz, s.yaw);
        if (a.it) Object.assign(a.it, { x: (bx + to[0]) / 2, z: (bz + to[1]) / 2, r: Math.max(a.it.r ?? 2.8, 3.4) });
        if (a.model.col) Object.assign(a.model.col, { x: bx, z: bz, c: Math.cos(s.yaw), s: Math.sin(s.yaw), ty: undefined, base: wl ?? by - 0.17, off: false });
        mover.dirty?.();
      }
    }
    s.x = to[0];
    s.z = to[1];
    s.y = s.groundY = plan.walkAt(s.x, s.z);
    if (a.home) a.home.hint = a.home.hintAshore ?? a.home.hint;
    aboard = null;
    mode = 'ground';
    modeAt = now();
    hideBoats();
    hud.toast(a.home ? '把船系回木桩上，上岸了' : `把${a.name}拖上岸，上岸了`);
    return true;
  };
  /** 船的立牌跟着人：往镜头那边挪一点，正好挡住她的腿；返回这一帧的起伏 */
  const drawBoat = (dt) => {
    const a = aboard;
    a.phase += dt;
    const bob = Math.sin(a.phase * 1.7) * 0.045;
    s.y = a.level + SEAT + bob;
    s.groundY = s.y - 9; // 水上没有影子
    if (a.model) rig.move(a.model, s.x, a.level + bob, s.z, s.yaw);
    else if (boatAt && a.idx >= 0) {
      boatAt.setXYZ(a.idx, s.x + Math.sin(cam.yaw) * 0.14, a.level - 0.3 + bob, s.z + Math.cos(cam.yaw) * 0.14);
      boatAt.needsUpdate = true;
    }
  };

  // ---- 冲浪 ----
  const startSurf = () => {
    if (mode === 'surf') return true;
    if (st.riding) return false;
    if (mode !== 'swim' && mode !== 'ground') return false;
    if (!inSea()) return void hud.toast('要在海里才能冲浪——再往深一点的地方游');
    if (st.fun?.board !== st.day) return void hud.toast('手上没有冲浪板。沙滩上的冲浪小屋有租');
    mode = 'surf';
    modeAt = now();
    air = false;
    surf = { v: 5.5, time: 0, tricks: 0, h: 0, vy: 0, spin: 0, roll: 0, grace: 3, spray: 0, phase: 0 };
    cam.want = Math.max(cam.want, 8.5);
    particles.splash(s.x, plan.SEA.level, s.z, 1);
    hud.toast('站上板子了！斜着朝岸边走，浪会推着你。A / D 压板转弯，Space 跳一个，X 收板', 3600);
    return true;
  };
  const endSurf = (why) => {
    const f = surf;
    if (mode !== 'surf' || !f) return;
    surf = null;
    boardProp.visible = false;
    modeAt = now();
    const secs = Math.floor(f.time);
    const paid = secs >= 8 && todayN('surf') < 3;
    const pay = paid ? Math.min(28, Math.floor((secs + f.tricks * 5) / 3)) : 0;
    if (secs >= 8) bump('surf');
    const best = st.fun?.surfBest;
    if (secs >= 5 && (!best || secs + f.tricks * 5 > best.time + best.tricks * 5)) st.fun.surfBest = { time: f.time, tricks: f.tricks };
    st.coins += pay;
    st.stamina = Math.max(0, st.stamina - Math.min(10, secs * 0.2));
    game.syncStats?.();
    const tail = secs >= 3 ? `这一趟 ${secs} 秒${f.tricks ? `、${f.tricks} 个花样` : ''}${pay ? `，沙滩上有人鼓掌，往你帽子里丢了 ${pay} 金币` : ''}。` : '';
    if (why === 'beach') {
      mode = 'ground';
      s.y = s.groundY = plan.walkAt(s.x, s.z);
      hud.toast(`顺着浪一路冲上了沙滩！${tail}`, 3600);
    } else {
      mode = 'swim';
      particles.splash(s.x, plan.SEA.level, s.z, 1.4);
      hud.toast(`${why === 'fall' ? '浪没接住，扑通掉进海里了。' : '从板上滑进水里，把板子夹好。'}${tail}`, 3600);
    }
  };

  /** 躺到躺椅上（再按一次起来） */
  const lieOn = (it) => {
    if (mode === 'lie') return void standUp();
    if (mode !== 'ground' || air) return;
    if (weather && weather.info.rain > 0.2) return void hud.toast('下着雨呢，躺椅都是湿的');
    mode = 'lie';
    lieTime = 0;
    lounger = { y: plan.heightAt(it.x, it.z) + (it.seatY ?? 0.42), from: st.stamina, it, hint: it.hint };
    it.hint = 'E 起来';
    s.x = it.x;
    s.z = it.z;
    s.yaw = it.yaw ?? 0;
    const h = Math.floor(st.minutes / 60) % 24;
    hud.toast(h < 6 || h >= 19 ? '躺进躺椅里，听着浪看星星……（任意方向键起来）' : '躺进躺椅里，伞影正好遮住眼睛，海风一阵一阵的……（任意方向键起来）', 3200);
  };

  const enterSwim = (w) => {
    mode = 'swim';
    air = false;
    particles.splash(s.x, w, s.z, 1.2);
    hud.toast('扑通——游起来了（C 潜水，往岸上游就上岸）');
  };
  const standUp = () => {
    mode = aboard ? 'boat' : 'ground';
    towel.visible = false;
    if (lounger) {
      const gain = Math.round(st.stamina - lounger.from);
      lounger.it.hint = lounger.hint;
      lounger = null;
      hud.toast(gain > 0 ? `晒得暖洋洋的，伸了个大大的懒腰（体力 +${gain}）` : '伸了个懒腰，从躺椅上起来了');
    }
  };

  const actions = {
    get mode() {
      return mode;
    },
    get air() {
      return air;
    },
    get oxygen() {
      return oxygen;
    },
    /** 眼睛在水下吗（主循环据此加水下的雾和颜色） */
    underwater(camera) {
      const w = plan.waterAt(camera.position.x, camera.position.z);
      return w != null && camera.position.y < w - 0.05 ? w : null;
    },
    /** 现在能做哪些动作（动作栏读它） */
    available(indoor) {
      if (indoor) return [];
      if (mode === 'ski')
        return [
          { id: 'steer', key: 'A / D', label: '转弯', on: true },
          { id: 'brake', key: 'S', label: '刹车', on: true },
          { id: 'score', key: '⏱', label: ski.timed ? `${Math.floor(ski.time)} 秒 · 旗门 ${ski.gates}/${SKI_COURSE.gates.length}` : '自由滑', on: ski.timed },
          { id: 'stop', key: 'E', label: '结束', on: true },
        ];
      if (mode === 'surf')
        return [
          { id: 'steer', key: 'A / D', label: '压板转弯', on: true },
          { id: 'jump', key: 'Space', label: '花样', on: surf.v > 4 && surf.h <= 0 },
          { id: 'score', key: '🌊', label: `${Math.floor(surf.time)} 秒 · 花样 ${surf.tricks}`, on: true },
          { id: 'stop', key: 'X', label: '收板', on: true },
        ];
      if (aboard)
        return [
          { id: 'row', key: 'W / S', label: '划桨', on: mode === 'boat' },
          { id: 'steer', key: 'A / D', label: '转船头', on: mode === 'boat' },
          { id: 'fish', key: 'E', label: '下竿钓鱼', on: mode === 'boat' && !!waterAhead() && !(weather && weather.info.rain > 0.2) },
          { id: 'stop', key: 'X', label: '靠岸下船', on: true },
        ];
      const special = mode === 'ground' && !air && onSkiRun() ? '滑雪' : mode === 'swim' && st.fun?.board === st.day && plan.waterKind(s.x, s.z) === 'sea' ? '冲浪' : null;
      const t = mode === 'ground' && !air ? nearTree() : null;
      const water = mode === 'ground' ? waterAhead() : null;
      const raining = weather && (weather.info.rain > 0.2 || weather.info.snow > 0.3);
      return [
        { id: 'fastWalk', key: 'Z', label: mover.fastWalk ? '快走：开' : '快走', on: mode === 'ground' },
        { id: 'run', key: 'Shift', label: '跑', on: mode === 'ground' && st.stamina > 15 },
        { id: 'jump', key: 'Space', label: mode === 'dive' ? '上浮' : mode === 'climb' ? '跳下' : air && jumpCount < 2 ? '二段跳' : '跳', on: (mode === 'ground' && (!air || jumpCount < 2)) || mode === 'dive' || mode === 'climb' || mode === 'swim' },
        { id: 'climb', key: 'F', label: mode === 'climb' ? '下树' : '爬树', on: !!t || mode === 'climb' },
        { id: 'dive', key: 'C', label: mode === 'dive' ? '上浮' : '潜水', on: mode === 'swim' || mode === 'dive' },
        { id: 'fish', key: 'E', label: '钓鱼', on: !!water && !raining },
        { id: 'lie', key: 'R', label: mode === 'lie' ? '起来' : '晒太阳', on: (mode === 'ground' && !air) || mode === 'lie' },
        { id: 'fire', key: 'G', label: '点火', on: mode === 'ground' && !raining },
        { id: 'kite', key: 'K', label: mode === 'kite' ? '收风筝' : '放风筝', on: mode === 'ground' || mode === 'kite' },
        ...(special ? [{ id: 'special', key: 'X', label: special, on: true }] : []),
      ];
    },
    /** 在船上吗（钓鱼的时候 mode 是 fish，船还在） */
    get aboard() {
      return !!aboard;
    },
    /** 船上钓鱼的加成：湖心水深，稀罕的鱼多 */
    fishBonus: () => (!aboard ? 0 : plan.waterKind(s.x, s.z) === 'lake' && plan.lakeDistance(s.x, s.z) < 0.55 ? 2 : 1),
    startSki,
    skiLift,
    startBoat,
    startSurf,
    lieOn,
    /** 能不能在这儿钓鱼（E 键在没有别的交互点时会走这里） */
    canFish: () => (mode === 'ground' || mode === 'boat') && !!waterAhead(),
    /** 执行一个动作；返回 true 表示按键被用掉了 */
    act(id) {
      switch (id) {
        // ---- 滑雪 / 划船 / 冲浪：X 是"这儿的特色玩法"，stop 是结束 ----
        case 'stop':
          if (mode === 'ski') stopSki();
          else if (mode === 'surf') endSurf('quit');
          else if (aboard) leaveBoat();
          else return false;
          return true;
        case 'special':
          if (mode === 'ski' || mode === 'surf' || aboard) return actions.act('stop');
          if (mode === 'ground' && !air && onSkiRun()) return startSki() || true;
          if (mode === 'swim' && plan.waterKind(s.x, s.z) === 'sea') return startSurf() || true;
          return false;
        case 'fastWalk': {
          const on = mover.toggleFastWalk?.();
          hud.toast(on ? '快速行走：开（再按 Z 切回漫步）' : '切回正常行走');
          return true;
        }
        case 'jump':
          if (mode === 'surf') {
            if (surf.h > 0 || surf.v < 4) return true;
            surf.vy = 4.4;
            surf.h = 0.01;
            return true;
          }
          if (mode === 'ski' || aboard) return true;
          if ((mode === 'ground' || mode === 'kite') && !air) {
            air = true;
            jumpCount = 1;
            doubleJumpTimer = 0;
            s.vy = JUMP;
            particles.dust(s.x, s.y, s.z, 4);
            return true;
          }
          if ((mode === 'ground' || mode === 'kite') && air && jumpCount < 2) {
            // 二段跳：空中轻盈旋身再跃一次 + 一圈清风微光粒子
            jumpCount = 2;
            doubleJumpTimer = 0.56;
            s.vy = JUMP_DOUBLE;
            for (let i = 0; i < 12; i++) {
              const a = (i / 12) * Math.PI * 2;
              particles.emit({
                x: s.x + Math.cos(a) * 0.28,
                y: s.y + 0.16,
                z: s.z + Math.sin(a) * 0.28,
                vx: Math.cos(a) * 2.1,
                vy: -0.3 + Math.random() * 0.6,
                vz: Math.sin(a) * 2.1,
                life: 0.48,
                size: 0.09,
                color: i % 2 ? [0.76, 0.92, 1.0] : [1.0, 0.96, 0.84],
                alpha: 0.88,
                gravity: 1.5,
                drag: 2.2,
              });
            }
            return true;
          }
          if (mode === 'climb') {
            const [fx, fz] = forward();
            mode = 'ground';
            air = true;
            jumpCount = 1;
            s.vy = 2.5;
            s.x -= fx * 0.8;
            s.z -= fz * 0.8;
            tree = null;
            return true;
          }
          if (mode === 'dive') {
            mode = 'swim';
            return true;
          }
          return false;
        case 'climb': {
          if (mode === 'climb') {
            // 慢慢滑下来
            s.vy = -1;
            mode = 'ground';
            air = true;
            tree = null;
            return true;
          }
          const t = mode === 'ground' && !air ? nearTree() : null;
          if (!t) {
            hud.toast('身边没有能爬的树');
            return true;
          }
          tree = t;
          mode = 'climb';
          // 贴到树干靠自己这一边，面朝树干
          const a = Math.atan2(s.x - t.x, s.z - t.z);
          s.x = t.x + Math.sin(a) * 0.55;
          s.z = t.z + Math.cos(a) * 0.55;
          s.yaw = a + Math.PI;
          hud.toast('抱住树干了：W 往上爬，S 往下，Space 跳下来');
          return true;
        }
        case 'dive':
          if (mode === 'swim') {
            mode = 'dive';
            oxygen = Math.min(100, oxygen);
            hud.toast('深吸一口气——潜下去了（Space 上浮）');
            return true;
          }
          if (mode === 'dive') {
            mode = 'swim';
            return true;
          }
          return false;
        case 'lie': {
          if (mode === 'lie') {
            standUp();
            return true;
          }
          if (mode !== 'ground' || air) return false;
          if (weather && weather.info.rain > 0.2) {
            hud.toast('下着雨呢，躺不下去');
            return true;
          }
          mode = 'lie';
          lieTime = 0;
          const h = Math.floor(st.minutes / 60) % 24;
          const night = h < 6 || h >= 19;
          const sunny = weather?.kind === 'sunny';
          hud.toast(night ? '躺下来看星星。（任意方向键起来）' : sunny ? '大太阳，暖洋洋的……（时间过得快一点）' : '躺在草地上晒太阳……（任意方向键起来）');
          return true;
        }
        case 'fire': {
          if (mode !== 'ground') return false;
          if (weather && (weather.info.rain > 0.2 || weather.info.snow > 0.3)) {
            hud.toast('湿漉漉的，划了几根火柴都没点着');
            return true;
          }
          const [fx, fz] = forward();
          const x = s.x + fx * 2.2;
          const z = s.z + fz * 2.2;
          const lit = field.ignite(x, z, 0.7);
          whale.trigger?.('fire', 0.95);
          if (lit) {
            hud.toast('草烧起来了！顺着风在蔓延——离远一点');
            for (let i = 0; i < 10; i++) particles.emit({ x, y: plan.heightAt(x, z) + 0.2, z, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 0.8, size: 0.06, color: [4, 2.4, 1], alpha: 1, gravity: 2 });
          } else hud.toast('这里没有能烧的草（路上、水边、湿地都点不着）');
          return true;
        }
        case 'fish': {
          if (mode !== 'ground' && mode !== 'boat') return false;
          const w = waterAhead();
          if (!w) {
            hud.toast('往水边站一点，面朝着水');
            return true;
          }
          floatAt = w;
          game.startFishing?.();
          return true;
        }
        case 'kite': {
          if (mode === 'kite') { mode = 'ground'; kite.visible = kiteLine.visible = false; hud.toast('把风筝线绕好，收进了篮子'); return true; }
          if (mode !== 'ground' || air) return false;
          mode = 'kite'; kitePhase = 0; kite.visible = kiteLine.visible = true;
          hud.toast('风筝飞起来了！（WASD 走动，K 收线）');
          return true;
        }
        default:
          return false;
      }
    },
    /** 按键 → 动作 */
    handleKey(code) {
      if (code === 'Space') return actions.act('jump');
      if (code === 'KeyZ') return actions.act('fastWalk');
      if (code === 'KeyF') return actions.act('climb');
      if (code === 'KeyC' || code === 'ControlLeft') return actions.act('dive');
      if (code === 'KeyR') return actions.act('lie');
      if (code === 'KeyG') return actions.act('fire');
      if (code === 'KeyK') return actions.act('kite');
      if (code === 'KeyX') return actions.act('special');
      // 滑着雪、冲着浪：E 和 Esc 也是停下来（刚按 E 开始的那一下不算）
      if ((code === 'KeyE' || code === 'Escape') && (mode === 'ski' || mode === 'surf') && now() - modeAt > 250) return actions.act('stop');
      return false;
    },
    /**
     * 每帧（室外、没坐着的时候）。返回 { moving, pose, eye }。
     * @param ground (x, z) => 脚下高度（含桥面）
     */
    step(dt, ground) {
      const fishing = !!game.fishing;
      // 开始钓鱼的那一刻：在原地坐下，竿子伸出去
      if (fishing && !wasFishing) {
        mode = 'fish';
        if (!floatAt) floatAt = waterAhead();
        whale.trigger?.('fish_cast', 0.68);
      }
      if (!fishing && wasFishing) {
        mode = aboard ? 'boat' : 'ground';
        floatAt = null;
      }
      wasFishing = fishing;
      rod.visible = line.visible = float.visible = mode === 'fish' && !!floatAt;

      // 躺着、钓鱼：动一下方向键就起来
      if ((mode === 'lie' || mode === 'fish') && moveKeys()) {
        if (mode === 'fish') game.stopFishing?.();
        standUp();
      }

      let moving = false;
      let pose = null;
      let eye = 1.35;
      let animCtx = {};
      const running = (keyDown('ShiftLeft') || keyDown('ShiftRight')) && st.stamina > 15;
      if (doubleJumpTimer > 0) doubleJumpTimer = Math.max(0, doubleJumpTimer - dt);

      if (mode === 'ground' || mode === 'kite') {
        // 乘坐交通工具时按车型决定巡航速度与动作，不再因体力下降而突然变慢。
        const rv = game.state.riding?.vehicle ?? '';
        const isMotor = /^(car|truck|bus)$/.test(rv);
        const isPush = /wheelbarrow|handcart/.test(rv);
        const rideBoost = !game.state.riding
          ? 1
          : rv === 'car'
            ? 2.45
            : rv === 'bus'
              ? 2.2
              : rv === 'truck'
                ? 2.05
                : /scooter/.test(rv)
                  ? 2.0
                  : /oxcart|ox-cart/.test(rv)
                    ? 1.35
                    : isPush
                      ? 1.15
                      : /boat|canoe|kayak/.test(rv)
                        ? 1.3
                        : 1.85;
        const moved = mover.step(dt, s, cam, (st.stamina > 15 ? 1 : 0.72) * rideBoost, true, st.stamina > 15);
        moving = moved.moved > 0.004;
        // 脚下：地面，或者踩得到的东西的顶（箱子、长椅、栈桥、台阶……）
        const terr = ground(s.x, s.z);
        const g = Math.max(terr, mover.floorAt?.(s.x, s.z, s.y) ?? -Infinity);
        const onThing = g > terr + 0.2;
        s.groundY = g;
        // 走出了边：脚下空了就往下掉（小落差直接跟着地面走）
        if (!air && s.y > g + 0.5) {
          air = true;
          jumpCount = Math.max(jumpCount, 1);
          s.vy = 0;
        }
        if (air) {
          // Integrate in small fixed slices so a long frame cannot skip through the ground.
          const slices = Math.max(1, Math.ceil(dt / 0.025));
          const h = dt / slices;
          for (let step = 0; step < slices && air; step++) {
            s.vy = Math.max(-32, s.vy - GRAVITY * h);
            s.y += s.vy * h;
            if (s.y <= g) {
              s.y = g;
              air = false;
              jumpCount = 0;
              doubleJumpTimer = 0;
              const w = depthHere();
              if (w && w.depth > 0.3) particles.splash(s.x, w.level, s.z, 1);
              else particles.dust(s.x, g, s.z, 5);
            }
          }
        } else {
          s.y = g;
          jumpCount = 0;
        }
        // 走进深水 → 游泳
        const w = onThing ? null : depthHere();
        const wading = !!(w && w.depth > 0.15 && w.depth <= 1.0 && !air);
        if (w && w.depth > 1.0 && !air) enterSwim(w.level);
        else if (wading) {
          // 蹚水：脚下一圈圈涟漪
          rippleAcc += dt * (moving ? 6 : 0.8);
          if (rippleAcc > 1) {
            rippleAcc = 0;
            particles.ripple(s.x, w.level, s.z, 0.3, 1.2);
          }
        }
        const [fx, fz] = forward();
        const aheadG = Math.max(ground(s.x + fx * 0.42, s.z + fz * 0.42), mover.floorAt?.(s.x + fx * 0.42, s.z + fz * 0.42, s.y + 0.4) ?? -Infinity);
        const onStairs = !air && moving && (Math.abs(aheadG - g) > 0.09 || (onThing && Math.abs(g - prevGroundY) > 0.015));
        prevGroundY = g;

        if (game.state.riding) {
          const rv = game.state.riding.vehicle ?? '';
          pose = /^(car|truck|bus)$/.test(rv) ? 'drive' : /wheelbarrow|handcart/.test(rv) ? 'push' : 'ride';
        } else if (air) {
          pose = doubleJumpTimer > 0 ? 'doubleJump' : s.vy > 0.4 ? 'jump' : 'fall';
        } else if (onStairs) {
          pose = 'stairs';
        } else if (moving && running) {
          st.stamina = Math.max(0, st.stamina - dt * 7);
          dustAcc += dt;
          if (dustAcc > 0.14) {
            dustAcc = 0;
            particles.dust(s.x, g, s.z, 2, plan.pavedAt?.(s.x, s.z) > 0.5 ? [0.8, 0.78, 0.72] : [0.62, 0.7, 0.42]);
          }
          pose = 'run';
        } else if (moving && wading) {
          pose = 'wade';
        } else if (moving) {
          pose = moved.gait === 'fastWalk' ? 'fastWalk' : 'walk';
        }
        animCtx = { speed: moved.speed, air };
        if (mode === 'kite') {
          kitePhase += dt;
          const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
          const reach = 5.2 + Math.min(3, weather?.info?.wind ?? 1);
          kite.position.set(s.x + fx * reach, s.y + 4.2 + Math.sin(kitePhase * 2.1) * 0.45, s.z + fz * reach);
          kite.rotation.set(0.25 * Math.sin(kitePhase), s.yaw, Math.sin(kitePhase * 1.7) * 0.18);
          const lp = kiteLine.geometry.attributes.position;
          const hp = whale.getHandWorldPos?.('right', handPos);
          if (hp) lp.setXYZ(0, hp.x, hp.y, hp.z);
          else lp.setXYZ(0, s.x, s.y + 1.0, s.z);
          lp.setXYZ(1, kite.position.x, kite.position.y, kite.position.z);
          lp.needsUpdate = true;
          if (!air) pose = 'kite';
        }
      } else if (mode === 'climb') {
        let dy = 0;
        if (keyDown('KeyW') || keyDown('ArrowUp')) dy += 1;
        if (keyDown('KeyS') || keyDown('ArrowDown')) dy -= 1;
        const top = tree.ground + tree.top;
        s.y = Math.min(top, Math.max(tree.ground, s.y + dy * 1.7 * dt));
        s.groundY = tree.ground;
        if (dy) st.stamina = Math.max(0, st.stamina - dt * 4);
        moving = dy !== 0 && s.y < top && s.y > tree.ground;
        if (dy < 0 && s.y <= tree.ground + 0.01) {
          mode = 'ground';
          tree = null;
        } else if (s.y >= top - 0.01 && dy > 0) hud.toast('爬到树冠里了。风吹着叶子沙沙响');
        if (st.stamina <= 0 && mode === 'climb') {
          hud.toast('没力气了，抱不住——');
          actions.act('climb');
        }
        pose = mode === 'climb' ? 'climb' : null;
        eye = 1.1;
      } else if (mode === 'swim' || mode === 'dive') {
        const moved = mover.step(dt, s, cam, mode === 'dive' ? 0.5 : 0.42, true);
        moving = moved.moved > 0.003;
        const w = depthHere();
        if (!w || w.depth < 0.85) {
          // 游到岸边：站起来
          mode = 'ground';
          s.y = ground(s.x, s.z);
          hud.toast('上岸了，湿漉漉的');
        } else {
          lastWater = w.level;
          const bed = w.level - w.depth;
          s.groundY = bed;
          if (mode === 'swim') {
            const want = w.level - 1.05 + Math.sin(performance.now() * 0.003) * 0.04;
            s.y += (want - s.y) * Math.min(1, dt * 4);
            st.stamina = Math.max(0, st.stamina - dt * (moving ? 1.2 : 0.4));
            oxygen = Math.min(100, oxygen + dt * 30);
            rippleAcc += dt * (moving ? 5 : 1.2);
            if (rippleAcc > 1) {
              rippleAcc = 0;
              particles.ripple(s.x, w.level, s.z, 0.45, 1.5);
            }
            pose = 'swim';
          } else {
            const want = Math.max(bed + 0.3, w.level - 4.2);
            s.y += (want - s.y) * Math.min(1, dt * 1.4);
            oxygen = Math.max(0, oxygen - dt * 7);
            bubbleAcc += dt * 4;
            if (bubbleAcc > 1) {
              bubbleAcc = 0;
              particles.emit({ x: s.x + (Math.random() - 0.5) * 0.3, y: s.y + 1.2, z: s.z + (Math.random() - 0.5) * 0.3, vy: 0.6, float: 0.8, life: Math.max(0.4, (w.level - s.y - 1.2) / 1.2), size: 0.06 + Math.random() * 0.06, shape: 'bubble', color: [0.9, 0.97, 1.0], alpha: 0.8, wobble: 0.3, fade: 0 });
            }
            if (oxygen <= 0) {
              hud.toast('憋不住了！浮上去换气');
              mode = 'swim';
            }
            pose = 'dive';
            eye = 0.8;
          }
        }
      } else if (mode === 'ski') {
        // 滑雪：重力顺着朝向把人往下拉，A / D 转弯，S 刹车；过旗门、冲终点
        const k = ski;
        const turn = steer();
        const brake = keyDown('KeyS') || keyDown('ArrowDown');
        s.yaw += turn * dt * (1.9 - Math.min(0.9, k.v * 0.06));
        const fx = Math.sin(s.yaw);
        const fz = Math.cos(s.yaw);
        const slope = (plan.heightAt(s.x + fx, s.z + fz) - plan.heightAt(s.x - fx, s.z - fz)) / 2;
        const push = (keyDown('KeyW') || keyDown('ArrowUp')) && k.v < 5 ? 3.2 : 0;
        k.v += (-9.2 * slope + push - (0.18 + (brake ? 1.7 : 0) + Math.abs(turn) * 0.1) * k.v - (brake ? 2.5 : 0.25)) * dt;
        k.v = Math.min(16.5, Math.max(0, k.v));
        s.x += fx * k.v * dt;
        s.z += fz * k.v * dt;
        const g = ground(s.x, s.z);
        s.groundY = s.y = g + snowUp(s.x, s.z);
        skiProp.visible = true;
        skiProp.position.set(s.x, s.y + 0.02, s.z);
        skiProp.rotation.set(-Math.atan(slope), s.yaw, 0);
        // 雪沫：越快越多，刹车和转弯的时候扬得高
        if (k.v > 2.5) {
          k.spray += dt * (k.v * 1.1 + (brake || turn ? 14 : 0));
          while (k.spray > 1) {
            k.spray -= 1;
            const side = Math.random() - 0.5;
            particles.emit({ x: s.x - fx * 0.7 - fz * side * 0.5, y: s.y + 0.08, z: s.z - fz * 0.7 + fx * side * 0.5, vx: -fx * k.v * 0.12 + side * 1.6, vy: 0.7 + Math.random() * (brake || turn ? 2 : 0.9), vz: -fz * k.v * 0.12 + side * 1.6, life: 0.7, size: 0.13, grow: 1.1, color: [0.95, 0.97, 1], alpha: 0.75, gravity: 4, drag: 1.4 });
          }
        }
        const along = skiAlong(s.x, s.z);
        const gates = SKI_COURSE.gates;
        while (k.next < gates.length && along < gates[k.next].along) {
          const gt = gates[k.next++];
          if (!k.timed) continue;
          if (Math.abs(skiAcross(s.x, s.z) - gt.across) < gt.half) {
            k.gates++;
            hud.toast(`过门 ${k.gates} / ${gates.length}`, 900);
          } else hud.toast('漏了一道门', 900);
        }
        if (k.timed) k.time += dt;
        followCam(dt, 1.8);
        moving = k.v > 0.5;
        pose = 'ski';
        animCtx = { speed: k.v, steer: turn, brake };
        eye = 1.3;
        if (along < SKI_COURSE.finishAlong) {
          if (k.timed) finishSki();
          else {
            stopSki(false);
            hud.toast('滑到坡底了。想计时的话，坐魔毯从坡顶出发');
          }
        } else if (plan.skiAt(s.x, s.z).k < 0.08) {
          stopSki(false);
          hud.toast('滑出雪道了，把雪板卸下来');
        }
      } else if (mode === 'boat') {
        // 划船：W / S 划桨，A / D 转船头；只能待在水够深的地方
        const a = aboard;
        const row = (keyDown('KeyW') || keyDown('ArrowUp') ? 1 : 0) - (keyDown('KeyS') || keyDown('ArrowDown') ? 1 : 0);
        const turn = steer();
        a.v += ((row > 0 ? a.vmax : row < 0 ? -1.8 : 0) - a.v) * Math.min(1, dt * (row ? 0.9 : 0.55));
        s.yaw += turn * dt * (0.5 + Math.min(0.6, Math.abs(a.v) * 0.2)) * (a.v < -0.2 ? -1 : 1);
        const fx = Math.sin(s.yaw);
        const fz = Math.cos(s.yaw);
        const nx = s.x + fx * a.v * dt;
        const nz = s.z + fz * a.v * dt;
        const w = boatable(nx, nz);
        if (w != null) {
          s.x = nx;
          s.z = nz;
          a.level += (w - a.level) * Math.min(1, dt * 3);
        } else a.v *= -0.25;
        drawBoat(dt);
        if (row) st.stamina = Math.max(0, st.stamina - dt * 0.5);
        rippleAcc += dt * (Math.abs(a.v) * 1.3 + 0.35);
        if (rippleAcc > 1) {
          rippleAcc = 0;
          particles.ripple(s.x - fx * 0.9, a.level, s.z - fz * 0.9, 0.5, 1.7);
        }
        if (Math.abs(a.v) > 0.6) followCam(dt, 0.9);
        moving = Math.abs(row) > 0;
        pose = 'boat';
        animCtx = { speed: Math.abs(a.v), steer: turn };
        eye = 1.0;
      } else if (mode === 'surf') {
        // 冲浪：浪往岸上推，斜着走最快；背着浪走会慢下来，太慢就掉下去
        const f = surf;
        f.time += dt;
        f.grace -= dt;
        f.phase += dt;
        const turn = steer();
        s.yaw += turn * dt * 1.7;
        f.roll += (turn * 0.42 - f.roll) * Math.min(1, dt * 6);
        const fx = Math.sin(s.yaw);
        const fz = Math.cos(s.yaw);
        let gx = plan.coastD(s.x + 3, s.z) - plan.coastD(s.x - 3, s.z);
        let gz = plan.coastD(s.x, s.z + 3) - plan.coastD(s.x, s.z - 3);
        const gl = Math.hypot(gx, gz) || 1;
        gx /= gl;
        gz /= gl;
        const toShore = fx * gx + fz * gz;
        const paddle = keyDown('KeyW') || keyDown('ArrowUp') ? 1.2 : 0;
        const drag = 0.36 + (keyDown('KeyS') || keyDown('ArrowDown') ? 0.9 : 0);
        f.v = Math.min(11, Math.max(0, f.v + (1.7 + 3.4 * toShore + paddle - drag * f.v) * dt));
        const lim = plan.HALF - 45;
        const nx = s.x + fx * f.v * dt;
        const nz = s.z + fz * f.v * dt;
        if (Math.abs(nx) < lim && Math.abs(nz) < lim) {
          s.x = nx;
          s.z = nz;
        } else f.v = 0;
        // 跳：板子在空中转一圈，落下来算一个花样
        if (f.h > 0) {
          f.vy -= 12 * dt;
          f.h += f.vy * dt;
          f.spin += dt * 8.6;
          if (f.h <= 0) {
            f.h = 0;
            f.spin = 0;
            f.tricks++;
            particles.splash(s.x, plan.SEA.level, s.z, 0.9);
            hud.toast(['漂亮！', '稳稳落板', '转了一整圈！'][f.tricks % 3] + ` 花样 ×${f.tricks}`, 900);
          }
        }
        const level = plan.SEA.level;
        const swell = Math.sin(f.phase * 1.9 + s.x * 0.05) * 0.13;
        s.y = level + 0.12 + swell + f.h;
        s.groundY = s.y - 9;
        boardProp.visible = true;
        boardProp.position.set(s.x, level + 0.06 + swell + f.h * 0.86, s.z);
        boardProp.rotation.set(Math.cos(f.phase * 1.9 + s.x * 0.05) * 0.07 - f.vy * 0.03 * (f.h > 0 ? 1 : 0), s.yaw + f.spin, f.roll);
        if (f.v > 2.5 && f.h <= 0) {
          f.spray += dt * f.v * 1.6;
          while (f.spray > 1) {
            f.spray -= 1;
            const side = Math.random() - 0.5;
            particles.emit({ x: s.x - fx * 0.9 - fz * side * 0.5, y: level + 0.1, z: s.z - fz * 0.9 + fx * side * 0.5, vx: -fx * 0.8 + side * 2.2, vy: 1.2 + Math.random() * 1.6, vz: -fz * 0.8 + side * 2.2, life: 0.6, size: [0.05, 0.14], shape: 'streak', color: [0.88, 0.95, 1], alpha: 0.85, gravity: 9 });
          }
          rippleAcc += dt * 3;
          if (rippleAcc > 1) {
            rippleAcc = 0;
            particles.ripple(s.x - fx * 1.1, level, s.z - fz * 1.1, 0.5, 1.4);
          }
        }
        followCam(dt, 1.5);
        moving = f.v > 0.5;
        pose = 'surf';
        animCtx = { speed: f.v, steer: turn, trick: f.h > 0 };
        eye = 1.3;
        const w = depthHere();
        if (!w || w.depth < 0.45) endSurf('beach');
        else if (f.grace < 0 && f.v < 1.8 && f.h <= 0) endSurf('fall');
      } else if (mode === 'lie') {
        s.groundY = s.y = lounger ? lounger.y : ground(s.x, s.z);
        lieTime += dt;
        const h = Math.floor(st.minutes / 60) % 24;
        const day = h >= 6 && h < 19;
        const sunny = weather?.kind === 'sunny' || weather?.kind === 'clear';
        // 晒太阳：时间过得快、体力回得快；大太阳下还会有点口渴（饱食掉得快一点）
        st.minutes += dt * (day ? 10 : 6);
        st.stamina = Math.min(100, st.stamina + dt * ((sunny && day ? 5 : 3) + (lounger ? 2 : 0)));
        if (weather?.kind === 'sunny') st.hunger = Math.max(0, st.hunger - dt * 0.4);
        towel.visible = !lounger;
        towel.position.set(s.x, s.y + 0.04, s.z);
        towel.rotation.y = s.yaw;
        if (weather && weather.info.rain > 0.25) {
          hud.toast('下雨了，赶紧收毯子');
          standUp();
        }
        pose = 'lie';
        eye = 0.9;
      } else if (mode === 'fish') {
        if (aboard) drawBoat(dt);
        else s.groundY = s.y = ground(s.x, s.z);
        const bite = game.fishing?.phase === 'bite';
        pose = bite ? 'fish_bite' : 'fish';
        if (floatAt) {
          // 竿子直接握在她 3D 右手骨骼上斜伸向水面，线垂到浮漂；上钩时连人带竿一起拉扯
          const [fx, fz] = forward();
          const hp = whale.getHandWorldPos?.('right', handPos);
          if (hp) rod.position.copy(hp);
          else rod.position.set(s.x + fx * 0.25, s.y + 0.55, s.z + fz * 0.25);
          const dir = new THREE.Vector3(floatAt.x - rod.position.x, 0, floatAt.z - rod.position.z).normalize();
          dir.y = bite ? 1.08 + Math.sin(performance.now() * 0.022) * 0.12 : 0.78;
          rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
          rod.updateMatrixWorld(true);
          const tip = new THREE.Vector3(0, 2.2, 0).applyMatrix4(rod.matrixWorld);
          const t = performance.now() * 0.001;
          const dip = bite ? -0.09 + Math.sin(t * 22) * 0.05 : Math.sin(t * 1.6) * 0.012;
          float.position.set(floatAt.x, floatAt.y + dip, floatAt.z);
          const p = lineGeo.attributes.position;
          p.setXYZ(0, tip.x, tip.y, tip.z);
          p.setXYZ(1, floatAt.x, floatAt.y + 0.05, floatAt.z);
          p.needsUpdate = true;
          rippleAcc += dt * (bite ? 8 : 0.6);
          if (rippleAcc > 1) {
            rippleAcc = 0;
            particles.ripple(floatAt.x, floatAt.y, floatAt.z, bite ? 0.25 : 0.15, 1.3);
          }
        }
      }

      // 水下的鱼
      if (fish) {
        const kind = mode === 'dive' ? plan.waterKind(s.x, s.z) : null;
        for (const [water, sc] of Object.entries(fish)) {
          sc.batch.visible = water === kind;
          if (water !== kind || lastWater == null) continue;
          const t = performance.now() * 0.001;
          sc.school.forEach((f, i) => {
            // Each fish has its own heading, radius and depth bob, which keeps the
            // school alive without allocating meshes or per-frame objects.
            const a = f.a + t * f.w + Math.sin(t * 0.18 + f.phase) * 0.16;
            const radius = f.r + Math.sin(t * 0.23 + f.phase) * 0.45;
            const x = s.x + Math.cos(a) * radius;
            const z = s.z + Math.sin(a) * radius;
            const bed = plan.heightAt(x, z);
            const swimDepth = s.y + 0.4 + (f.h - 0.5) * 2.2 + (f.depth - 0.8) * 0.8 + Math.sin(t * 1.7 + f.phase) * 0.16;
            const y = Math.min(lastWater - 0.6, Math.max(bed + 0.3, swimDepth));
            sc.at.setXYZ(i, x, y, z);
          });
          sc.at.needsUpdate = true;
        }
      }
      return { moving, pose, eye, animCtx };
    },
    /** 出门/进门的时候把状态归零 */
    reset() {
      mode = 'ground';
      if (aboard?.home) aboard.home.hint = aboard.home.hintAshore ?? aboard.home.hint;
      if (lounger) lounger.it.hint = lounger.hint;
      ski = surf = aboard = lounger = null;
      skiProp.visible = boardProp.visible = false;
      hideBoats();
      kite.visible = kiteLine.visible = false;
      air = false;
      jumpCount = 0;
      doubleJumpTimer = 0;
      tree = null;
      towel.visible = false;
      rod.visible = line.visible = float.visible = false;
      if (fish) for (const sc of Object.values(fish)) sc.batch.visible = false;
    },
  };
  // 把自己交给 game：按 E 之后的面板（租船、雪场小屋……）要调这里的 startSki / startBoat / lieOn
  game.setActions?.(actions);
  return actions;
}
