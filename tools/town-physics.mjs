// 物理走查：真的让她走、跳、掉、骑、划，看数字对不对。
//   node tools/town-physics.mjs [--shots shots/physics] [--size 2560x1440] [--quality high]
// ① 矮东西：走过去被挡住 → 跳上去站住 → 走出边掉下来；② 台阶：一级级走上去；③ 自行车：骑上、模型跟着走、下车停在脚边；
// ④ 小船：推下水、划出去、模型跟着、靠岸；⑤ 栈桥：走上桥面不下水。
import { createReadStream, existsSync, statSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const root = resolve(here, 'dist');
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const shots = arg('--shots', null);
if (shots) mkdirSync(resolve(here, shots), { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'] });
const [vw, vh] = arg('--size', '1280x720').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 400)}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}\n${e.stack?.slice(0, 600)}`));
await page.goto(`http://127.0.0.1:${server.address().port}/town.html?quality=${arg('--quality', 'medium')}`);
await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 240000 });
await page.addStyleTag({ content: '#hud, #start, #intro { display: none !important; }' }).catch(() => {});

const setup = () => {
  const tg = window.__tg;
  const s = tg.whale.state;
  const T = (window.__t = {
    s,
    run(sec, each) {
      for (let i = 0; i < sec * 60; i++) {
        tg.tick(1 / 60);
        each?.(i);
      }
    },
    /** 面朝 (dx, dz) 走：镜头转到背后 */
    face(dx, dz) {
      tg.cam.yaw = Math.atan2(-dx, -dz);
      tg.cam.forward.set(dx / Math.hypot(dx, dz), dz / Math.hypot(dx, dz));
    },
    hold: (c) => tg.mover.keys.add(c),
    up: (c) => tg.mover.keys.delete(c),
    go(x, z) {
      tg.actions.reset?.();
      tg.whale.setPos(x, z);
      T.run(0.3);
    },
    r: (v) => Math.round(v * 100) / 100,
  });
};
await page.evaluate(setup);
const snap = async (name) => shots && page.screenshot({ path: join(resolve(here, shots), `${name}.png`) });
const out = {};

// ① 矮东西
out.box = await page.evaluate(() => {
  const tg = window.__tg;
  const { s, run, face, hold, up, go, r } = window.__t;
  const cols = tg.city.colliders;
  const alone = (c) => !cols.some((q) => q !== c && Math.hypot(q.x - c.x, q.z - c.z) < 4.5);
  const c = cols.find((q) => q.top > 0.62 && q.top < 1.15 && q.hw > 0.45 && q.hd > 0.45 && q.base == null && alone(q) && tg.plan.waterAt(q.x, q.z) == null && Math.abs(tg.plan.heightAt(q.x - 3, q.z) - tg.plan.heightAt(q.x + 1, q.z)) < 0.25);
  if (!c) return { skipped: 'no low box found' };
  const R = Math.hypot(c.hw, c.hd);
  const g0 = tg.plan.heightAt(c.x, c.z);
  go(c.x - R - 1.6, c.z);
  face(1, 0);
  hold('KeyW');
  run(1.2);
  const blockedAt = c.x - s.x;
  // 跳上去
  tg.actions.act('jump');
  let peak = -1e9;
  run(0.2, () => (peak = Math.max(peak, s.y)));
  up('KeyW');
  run(0.9, () => (peak = Math.max(peak, s.y)));
  const onTop = { dx: r(s.x - c.x), dz: r(s.z - c.z), y: r(s.y - g0), top: c.top };
  window.__keep = { x: s.x, z: s.z };
  return { box: { x: r(c.x), z: r(c.z), top: c.top, hw: r(c.hw), hd: r(c.hd) }, blockedAt: r(blockedAt), jumpPeak: r(peak - g0), onTop };
});
await snap('1-on-box');
out.fall = await page.evaluate(() => {
  const tg = window.__tg;
  const { s, run, hold, up, r } = window.__t;
  const y0 = s.y;
  hold('KeyW');
  let fell = 0;
  let air = 0;
  run(1.0, () => {
    if (tg.actions.air ?? s.vy < -0.5) air++;
    fell = Math.max(fell, y0 - s.y);
  });
  up('KeyW');
  run(0.3);
  return { dropped: r(fell), airFrames: air, endOnGround: r(s.y - tg.plan.walkAt(s.x, s.z)) };
});

// ② 台阶：家门口空地上搭一跑（8 级、每级 0.3 m），走上去
out.stairs = await page.evaluate(() => {
  const tg = window.__tg;
  const { s, run, face, hold, up, go, r } = window.__t;
  const cols = tg.city.colliders;
  let spot = null;
  for (let x = -640; x < -560 && !spot; x += 4) for (let z = 10; z < 60 && !spot; z += 4) {
    const h = [0, 3, 6, 9].map((d) => tg.plan.heightAt(x + d, z));
    if (Math.max(...h) - Math.min(...h) < 0.15 && tg.plan.waterAt(x, z) == null && !cols.some((q) => Math.abs(q.x - x - 4) < 9 && Math.abs(q.z - z) < 5)) spot = [x, z];
  }
  if (!spot) return { skipped: 'no flat spot' };
  const [x0, z0] = spot;
  const g = tg.plan.heightAt(x0, z0);
  for (let i = 0; i < 8; i++) cols.push({ x: x0 + 2 + i * 0.5 + 0.25, z: z0, hw: 0.27, hd: 1, top: (i + 1) * 0.3 + 3, base: g - 3, c: 1, s: 0 });
  cols.push({ x: x0 + 2 + 4 + 1.5, z: z0, hw: 1.5, hd: 1, top: 2.4 + 3, base: g - 3, c: 1, s: 0 });
  tg.mover.dirty();
  go(x0, z0);
  face(1, 0);
  hold('KeyW');
  const ys = [];
  run(1.5, (i) => i % 15 === 0 && ys.push(r(s.y - g)));
  up('KeyW');
  run(0.2);
  const top = r(s.y - g);
  hold('KeyW');
  run(1.2);
  up('KeyW');
  run(0.4);
  return { climb: ys, atTop: top, afterWalkingOffEnd: r(s.y - tg.plan.walkAt(s.x, s.z)) };
});
await snap('2-stairs');

// ③ 自行车
out.bike = await page.evaluate(() => {
  const tg = window.__tg;
  const { s, run, face, hold, up, go, r } = window.__t;
  const it = tg.city.interactables.find((q) => q.kind === 'vehicle' && /bicycle/.test(q.vehicle) && q.model?.slot);
  if (!it) return { skipped: 'no bicycle with a model' };
  const from = [it.x, it.z];
  go(it.x + 0.9, it.z + 0.9);
  tg.game.interact(it);
  const riding = !!tg.game.state.riding;
  face(0, 1);
  hold('KeyW');
  run(2);
  up('KeyW');
  run(0.2);
  const follow = r(Math.hypot(it.model.x - s.x, it.model.z - s.z));
  const rode = r(Math.hypot(s.x - from[0], s.z - from[1]));
  window.__bike = it;
  return { riding, colliderOffWhileRiding: it.model.col?.off === true, rode, modelFollows: follow, lift: s.lift };
});
await snap('3-riding');
out.bikeOff = await page.evaluate(() => {
  const tg = window.__tg;
  const { s, run, r } = window.__t;
  const it = window.__bike;
  if (!it) return null;
  tg.game.interact(it);
  run(0.3);
  return { riding: !!tg.game.state.riding, parkedBy: r(Math.hypot(it.model.x - s.x, it.model.z - s.z)), colliderBack: it.model.col ? it.model.col.off === false && r(Math.hypot(it.model.col.x - it.model.x, it.model.col.z - it.model.z)) : null };
});
await snap('4-parked');

// ④ 船
out.boat = await page.evaluate(() => {
  const tg = window.__tg;
  const { s, run, hold, up, go, r } = window.__t;
  const it = tg.city.interactables.find((q) => q.kind === 'vehicle' && /rowboat|kayak|canoe/.test(q.vehicle) && q.model?.slot);
  if (!it) return { skipped: 'no boat with a model' };
  go(it.x + 1, it.z + 1);
  const from = [it.model.x, it.model.z];
  tg.game.interact(it);
  run(0.3);
  const mode = tg.actions.mode;
  const start = [s.x, s.z];
  hold('KeyW');
  run(4);
  up('KeyW');
  run(0.3);
  window.__boat = it;
  return { vehicle: it.vehicle, mode, launchedFrom: from.map(r), rowed: r(Math.hypot(s.x - start[0], s.z - start[1])), modelFollows: r(Math.hypot(it.model.x - s.x, it.model.z - s.z)), onWater: r(it.model.y - (tg.plan.waterAt(s.x, s.z) ?? -99)) };
});
await snap('5-boat');
out.boatOff = await page.evaluate(() => {
  const tg = window.__tg;
  const { s, run, hold, up, r } = window.__t;
  const it = window.__boat;
  if (!it) return null;
  // 掉头划回去再靠岸
  hold('KeyS');
  run(4);
  up('KeyS');
  tg.actions.act('stop');
  run(0.3);
  return { mode: tg.actions.mode, ashore: tg.plan.waterAt(s.x, s.z) == null, boatLeftAt: r(Math.hypot(it.model.x - s.x, it.model.z - s.z)), canReach: Math.hypot(it.x - s.x, it.z - s.z) < it.r + 1 };
});

// ⑤ 栈桥
out.pier = await page.evaluate(() => {
  const tg = window.__tg;
  const { s, run, face, hold, up, go, r } = window.__t;
  const e = tg.city.kitHouses.find((q) => q.kit === 'pier' && q.col);
  if (!e) return { skipped: 'no pier with a deck collider' };
  const c = e.col;
  // 从岸上那一头（盒子局部 -z 方向是岸）走到桥中间
  const ax = c.s;
  const az = c.c;
  const ends = [1, -1].map((k) => [c.x + ax * c.hd * k, c.z + az * c.hd * k]);
  const shore = ends.find(([x, z]) => tg.plan.waterAt(x + (x - c.x) * 0.3, z + (z - c.z) * 0.3) == null) ?? ends[0];
  const dx = c.x - shore[0];
  const dz = c.z - shore[1];
  const L = Math.hypot(dx, dz);
  go(shore[0] - (dx / L) * 1.5, shore[1] - (dz / L) * 1.5);
  face(dx, dz);
  hold('KeyW');
  run((L + 1.5) / 5.35);
  up('KeyW');
  run(0.3);
  const level = c.base;
  return { mode: tg.actions.mode, overWater: tg.plan.waterAt(s.x, s.z) != null, aboveWater: r(s.y - level), deck: c.top, fromCentre: r(Math.hypot(s.x - c.x, s.z - c.z)) };
});
await snap('6-pier');

// ⑥ 玉海宫：从正面的台阶走上第二层石台
out.palace = await page.evaluate(() => {
  const tg = window.__tg;
  const { s, run, face, hold, up, go, r } = window.__t;
  const P = tg.plan.DISTRICTS?.find((d) => d.id === 'palace') ?? { x: 40, z: -196 };
  const steps = tg.city.colliders.filter((c) => c.hw === 5 && Math.hypot(c.x - P.x, c.z - P.z) < 40).sort((a, b) => a.top - b.top);
  if (!steps.length) return { skipped: 'no palace steps' };
  const lo = steps[0];
  const hi = steps[steps.length - 1];
  const dx = hi.x - lo.x;
  const dz = hi.z - lo.z;
  const L = Math.hypot(dx, dz) || 1;
  go(lo.x - (dx / L) * 6, lo.z - (dz / L) * 6);
  const g = s.y;
  face(dx, dz);
  hold('KeyW');
  const ys = [];
  run(2.6, (i) => i % 20 === 0 && ys.push(r(s.y - g)));
  up('KeyW');
  run(0.3);
  return { steps: steps.length, climb: ys, standingAt: r(s.y - lo.base), want: 3 };
});
await snap('7-palace');
// ⑦ 乡间小站：走楼梯上站台
out.station = await page.evaluate(() => {
  const tg = window.__tg;
  const { s, run, face, hold, up, go, r } = window.__t;
  const all = tg.city.colliders.filter((c) => Math.abs(c.hw - 0.29) < 1e-6 && Math.abs(c.hd - 0.85) < 1e-6);
  if (!all.length) return { skipped: 'no station stairs' };
  const first = all[0];
  const flight = all.filter((c) => Math.hypot(c.x - first.x, c.z - first.z) < 40 && c.base === first.base).sort((a, b) => a.top - b.top);
  const lo = flight[0];
  const hi = flight[flight.length - 1];
  const dx = hi.x - lo.x;
  const dz = hi.z - lo.z;
  const L = Math.hypot(dx, dz) || 1;
  go(lo.x - (dx / L) * 2.5, lo.z - (dz / L) * 2.5);
  const g = s.y;
  face(dx, dz);
  hold('KeyW');
  const ys = [];
  run((L + 5) / 5.35, (i) => i % 20 === 0 && ys.push(r(s.y - g)));
  up('KeyW');
  run(0.3);
  return { steps: flight.length, rise: r(flight[1] ? flight[1].top - flight[0].top : 0), climb: ys, standingAt: r(s.y - lo.base), platform: r(hi.top) };
});
await snap('8-station');

console.log(JSON.stringify(out, null, 1));
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
server.close();
