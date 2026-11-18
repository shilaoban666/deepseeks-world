// 小鲸鱼的世界：截图。
//   node tools/town-shots.mjs [names...] [--out shots/town] [--query "lite=1"] [--size 1600x900]
// 每个机位：人站在哪 (x,z)、镜头绕到哪 (yaw 度)、俯仰 (pitch 度)、离多远 (dist)。indoor: true 先进屋。
import { mkdirSync, createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { guard } from './no-pointer-lock.mjs';

export const VIEWS = {
  home: { x: 0, z: 6, yaw: 200, pitch: 10, dist: 7.5 },
  homeFront: { x: 0, z: 2, yaw: 20, pitch: 8, dist: 6 },
  street: { x: 40, z: 25, yaw: 240, pitch: 9, dist: 7 },
  plaza: { x: 96, z: 44, yaw: 235, pitch: 12, dist: 9 },
  plazaHigh: { x: 110, z: 92, yaw: 0, pitch: 34, dist: 24 },
  food: { x: 52, z: 111, yaw: 55, pitch: 10, dist: 8 },
  market: { x: 62, z: 180, yaw: 0, pitch: 16, dist: 10 },
  temple: { x: -262, z: -200, yaw: 0, pitch: 10, dist: 14 },
  church: { x: -140, z: -110, yaw: 40, pitch: 8, dist: 12 },
  school: { x: -290, z: -20, yaw: 60, pitch: 12, dist: 14 },
  gate: { x: 110, z: -300, yaw: 0, pitch: 8, dist: 12 },
  lake: { x: -130, z: -404, yaw: 0, pitch: 10, dist: 9 },
  river: { x: -410, z: -60, yaw: 60, pitch: 12, dist: 9 },
  bridge: { x: -360, z: -372, yaw: 45, pitch: 12, dist: 11 },
  sea: { x: 850, z: -300, yaw: 250, pitch: 8, dist: 9 },
  seaside: { x: 600, z: -380, yaw: 20, pitch: 10, dist: 12 },
  lighthouse: { x: 722, z: -400, yaw: 300, pitch: 4, dist: 14 },
  station: { x: 690, z: 150, yaw: 270, pitch: 8, dist: 14 },
  fishmarket: { x: 178, z: -76, yaw: 0, pitch: 14, dist: 9 },
  snowtown: { x: -560, z: -380, yaw: 20, pitch: 8, dist: 12 },
  walkSide: { x: 40, z: 25, yaw: 150, pitch: 8, dist: 5, face: 240, walk: true },
  walkFront: { x: 40, z: 25, yaw: 60, pitch: 8, dist: 5, face: 60, walk: true },
  sit: { indoor: true, x: -4.6, z: 4.6, yaw: 20, pitch: 45, dist: 6, sit: true },
  farm: { x: -330, z: 530, yaw: 20, pitch: 12, dist: 12 },
  fields: { x: -700, z: 160, yaw: 300, pitch: 16, dist: 14 },
  forest: { x: -680, z: -560, yaw: 60, pitch: 8, dist: 8 },
  wild: { x: 420, z: -120, yaw: 110, pitch: 8, dist: 8 },
  peak: { x: 60, z: -470, yaw: 0, pitch: 4, dist: 8 },
  overview: { x: 110, z: 60, yaw: 200, pitch: 52, dist: 26 },
  rainStreet: { x: 40, z: 25, yaw: 230, pitch: 8, dist: 7, weather: 'rain' },
  storm: { x: -400, z: 600, yaw: 300, pitch: 14, dist: 10, weather: 'storm', setup: "tg.weather.strike(tg.camera, { x: -440, z: 560 });" },
  frost: { x: 96, z: 44, yaw: 235, pitch: 12, dist: 9, weather: 'frost' },
  frostWild: { x: -400, z: 640, yaw: 60, pitch: 14, dist: 8, weather: 'frost' },
  sunny: { x: 858, z: -290, yaw: 250, pitch: 10, dist: 8, weather: 'sunny' },
  windy: { x: -470, z: 600, yaw: 300, pitch: 12, dist: 8, weather: 'windy', setup: "for (let i = 0; i < 120; i++) tg.weather.update(1/30, tg.camera, { minutes: 0 });" },
  swim: { x: -130, z: -450, yaw: 160, pitch: 14, dist: 6, setup: "tg.actions.step(0.016, tg.plan.walkAt);" },
  dive: { x: -130, z: -490, yaw: 120, pitch: 2, dist: 4.5, setup: "tg.actions.step(0.016, tg.plan.walkAt); tg.actions.act('dive'); for (let i = 0; i < 90; i++) tg.actions.step(1/30, tg.plan.walkAt);" },
  climb: { x: 0, z: 0, yaw: 30, pitch: 10, dist: 9, face: 180, setup: "const t = tg.city.woods.trees.filter((t) => t[2] >= 1 && t[2] <= 3 && t[3] > 0.9 && tg.city.colliders.every((c) => Math.abs(c.x - t[0]) > c.hw + 14 || Math.abs(c.z - t[1]) > c.hd + 14) && Math.hypot(t[0] + 300, t[1] - 300) < 400).sort((a, b) => Math.hypot(a[0] + 300, a[1] - 300) - Math.hypot(b[0] + 300, b[1] - 300))[0]; tg.whale.state.x = t[0] + 1.5; tg.whale.state.z = t[1] + 1.5; tg.whale.state.y = tg.plan.heightAt(t[0], t[1]); tg.actions.act('climb'); tg.mover.keys.add('KeyW'); for (let i = 0; i < 32; i++) tg.actions.step(1/30, tg.plan.walkAt); tg.mover.keys.clear(); tg.cam.yaw = Math.atan2(tg.whale.state.x - t[0], tg.whale.state.z - t[1]) + 0.5;" },
  fishing: { x: -130, z: -410, yaw: 50, pitch: 16, dist: 6, face: 180, setup: "tg.whale.state.yaw = Math.PI; tg.game.interact({ kind: 'fish', name: 'x' }); tg.game.fishing.wait = 99;" },
  lie: { x: 858, z: -290, yaw: 200, pitch: 28, dist: 5, weather: 'sunny', setup: "tg.actions.act('lie');" },
  fire: { x: -240, z: -84, yaw: 190, pitch: 16, dist: 11, face: 10, weather: 'windy', setup: "tg.whale.state.x = -240; tg.whale.state.z = -84; tg.whale.state.yaw = 0.17; tg.actions.act('fire'); for (let i = 0; i < 300; i++) tg.field.update(1/30, tg.camera);" },
  weatherPanel: { x: 96, z: 44, yaw: 235, pitch: 12, dist: 9, setup: "tg.panels.openWeather();" },
  bagPanel: { x: 40, z: 25, yaw: 230, pitch: 8, dist: 7, setup: "tg.game.state.bag.fish = 2; tg.game.state.bag.cooked = 1; tg.game.state.bag.flower = 3; tg.panels.openBag();" },
  bigmap: { x: 40, z: 25, yaw: 230, pitch: 8, dist: 7, setup: "for (const [x, z] of [[-130,-460],[-440,0],[-330,560],[-740,180],[740,190],[610,-460],[-560,-440],[290,700],[-640,-120],[850,-290]]) { tg.whale.state.x = x; tg.whale.state.z = z; tg.bigmap.update(0.016, true); } tg.whale.state.x = 40; tg.whale.state.z = 25; tg.bigmap.open(); tg.bigmap.setView(-40, -40, 1.05); tg.bigmap.setWaypoint({ id: 'lake-shore', name: '月亮湖边', x: -150, z: -500 }); tg.bigmap.update(0.016, true);" },
  bigmapZoom: { x: 40, z: 25, yaw: 230, pitch: 8, dist: 7, setup: "tg.bigmap.open(); tg.bigmap.select('bus-AI 小镇站'); tg.bigmap.setView(60, 40, 4.5); tg.bigmap.update(0.016, true);" },
  bigmapWorld: { x: 40, z: 25, yaw: 230, pitch: 8, dist: 7, setup: "tg.bigmap.open(); tg.bigmap.setTab('world'); tg.bigmap.update(0.016, true);" },
  bigmapTown: { x: 40, z: 25, yaw: 230, pitch: 8, dist: 7, setup: "tg.whale.state.x = -150; tg.whale.state.z = -380; tg.bigmap.open(); tg.bigmap.setTab('town'); tg.bigmap.update(0.016, true);" },
  catch: { x: -130, z: -410, yaw: 50, pitch: 16, dist: 6, face: 180, setup: "tg.whale.state.yaw = Math.PI; tg.game.interact({ kind: 'fish', name: 'x' }); tg.game.fishing.phase = 'bite'; tg.game.fishing.fish = tg.fishdex.BY_ID['mandarin-fish']; tg.game.fishing.life = 99; const r = Math.random; Math.random = () => 0; tg.game.interact({ kind: 'fish', name: 'x' }); Math.random = r;" },
  dex: { x: 40, z: 25, yaw: 230, pitch: 8, dist: 7, setup: "for (const id of ['crucian-carp','common-carp','grass-carp','mandarin-fish','koi-carp','snakehead','catfish','bream','chinese-sturgeon','tench','goldfish']) tg.game.state.dex[id] = 1 + (id.length % 4); tg.panels.openDex('lake');" },
  crops: { x: -720, z: 170, yaw: 200, pitch: 18, dist: 8 },
  orchard: { x: -600, z: -70, yaw: 330, pitch: 12, dist: 11 },
  diveSea: { x: 930, z: -330, yaw: 120, pitch: 2, dist: 4.5, setup: "tg.actions.step(0.016, tg.plan.walkAt); tg.actions.act('dive'); for (let i = 0; i < 90; i++) tg.actions.step(1/30, tg.plan.walkAt);" },
  camera: { x: 96, z: 44, yaw: 235, pitch: 12, dist: 9, setup: "tg.photo.enter(); tg.photo.setFocal(30);" },
  cameraSelfie: { x: -704, z: 262, yaw: 160, pitch: 8, dist: 9, face: 340, setup: "tg.photo.enter(); tg.photo.setMode('selfie'); tg.cam.yaw += 0.5; tg.photo.prefs.filter = 'warm'; tg.photo.refresh();" },
  cameraEye: { x: 850, z: -300, yaw: 250, pitch: -2, dist: 6, clock: 18.9, setup: "tg.photo.enter(); tg.photo.setMode('eye'); tg.cam.yaw = 250 * Math.PI / 180; tg.cam.pitch = -0.03; tg.photo.setFocal(28); tg.photo.prefs.filter = 'film'; tg.photo.prefs.stamp = true; tg.photo.refresh();" },
  cameraPortrait: { x: 40, z: 25, yaw: 230, pitch: 8, dist: 6, setup: "tg.photo.enter(); tg.photo.prefs.aspect = '9:16'; tg.photo.prefs.filter = 'warm'; tg.photo.setFocal(40); tg.photo.refresh();" },
  album: { x: 96, z: 44, yaw: 235, pitch: 12, dist: 9, async: "tg.photo.enter(); for (const [x, z, y, h, f, a, m] of [[96,44,235,10.5,'none','16:9','follow'],[-130,-404,0,17.8,'warm','3:2','follow'],[850,-300,250,18.9,'film','16:9','eye'],[-640,-80,0,9,'morning','1:1','selfie'],[-720,170,200,16,'dusk','9:16','follow'],[40,25,230,11,'ink','3:2','follow']]) { tg.photo.exit(); tg.setClock(h); tg.whale.state.x = x; tg.whale.state.z = z; tg.cam.yaw = y * Math.PI / 180; tg.cam.pitch = m === 'eye' ? -0.03 : 0.2; tg.whale.state.yaw = m === 'selfie' ? tg.cam.yaw : tg.cam.yaw + Math.PI; tg.photo.enter(); tg.photo.setMode(m); if (m === 'eye') { tg.cam.yaw = y * Math.PI / 180; tg.cam.pitch = -0.03; } tg.photo.prefs.filter = f; tg.photo.prefs.aspect = a; tg.photo.prefs.res = '1080p'; for (let i = 0; i < 40; i++) tg.tick(1/30); await tg.photo.shoot({ download: false }); } Object.assign(tg.photo.prefs, { res: '4K', filter: 'none', aspect: '16:9' }); tg.photo.album.open(); await new Promise((r) => setTimeout(r, 500));" },
  albumView: { x: 96, z: 44, yaw: 235, pitch: 12, dist: 9, async: "if (!tg.photo.photos.length) { tg.photo.enter(); for (let i = 0; i < 40; i++) tg.tick(1/30); await tg.photo.shoot({ download: false }); } tg.photo.enter(); tg.photo.album.open(tg.photo.photos.length - 1); await new Promise((r) => setTimeout(r, 600));" },
  playground: { x: 0, z: 0, yaw: 30, pitch: 12, dist: 9, setup: "const p = tg.city.interactables.find((i) => i.id === 'playground'); tg.whale.state.x = p.x + 4; tg.whale.state.z = p.z + 14; tg.whale.state.yaw = Math.PI;" },
  boats: { x: 752, z: -470, yaw: 270, pitch: 10, dist: 10 },
  garden: { x: -5, z: 7, yaw: 340, pitch: 22, dist: 7, face: 200, setup: "const ids = ['radish','napa-cabbage','tomato','chilli','maize','sunflower','potato','pea']; ids.forEach((c, i) => { tg.farming.plant(i, c); tg.farming.plot(i).growth = [1, 0.85, 0.6, 0.3, 1, 0.9, 0.15, 0.5][i]; if (i % 2) tg.farming.water(i); }); tg.farming.update(0);" },
  gardenNight: { x: -5, z: 7, yaw: 340, pitch: 22, dist: 7, face: 200, clock: 21.5, setup: "const ids = ['radish','napa-cabbage','tomato','chilli','maize','sunflower','potato','pea']; ids.forEach((c, i) => { tg.farming.plant(i, c); tg.farming.plot(i).growth = [1, 0.85, 0.6, 0.3, 1, 0.9, 0.15, 0.5][i]; if (i % 2) tg.farming.water(i); }); tg.farming.update(0);" },
  plotPanel: { x: -5, z: 7, yaw: 340, pitch: 22, dist: 7, face: 200, setup: "tg.farming.plant(3, 'tomato'); tg.farming.plot(3).growth = 0.62; tg.farming.water(3); tg.game.interact(tg.city.interactables.find((i) => i.id === 'plot-3'));" },
  seedPanel: { x: -5, z: 7, yaw: 340, pitch: 22, dist: 7, face: 200, setup: "tg.farming.clear(5); tg.game.state.bag['seed-maize'] = 2; tg.game.state.bag['seed-sunflower'] = 1; tg.game.interact(tg.city.interactables.find((i) => i.id === 'plot-5'));" },
  seedShop: { x: 6, z: 7, yaw: 20, pitch: 22, dist: 7, setup: "tg.game.interact(tg.city.interactables.find((i) => i.id === 'farm-seeds'));" },
  nightPlaza: { x: 96, z: 44, yaw: 235, pitch: 12, dist: 11, clock: 21 },
  nightFood: { x: 60, z: 104, yaw: 140, pitch: 10, dist: 9, clock: 21.3 },
  nightLake: { x: -130, z: -404, yaw: 0, pitch: 8, dist: 9, clock: 21.5 },
  nightLighthouse: { x: 700, z: -390, yaw: 308, pitch: 5, dist: 16, clock: 21.5 },
  nightHome: { x: 0, z: 12, yaw: 10, pitch: 14, dist: 12, clock: 20.6 },
  newtown: { x: 250, z: 640, yaw: 200, pitch: 10, dist: 14 },
  rentGarden: { x: -322, z: 684, yaw: 20, pitch: 32, dist: 9, setup: "['maize','sunflower','tomato','chilli','potato','tea','peanut','pea','radish','napa-cabbage','garlic','sweet-potato'].forEach((c, k) => { const i = 8 + k; tg.farming.plant(i, c); tg.farming.plot(i).growth = 0.3 + (k % 4) * 0.25; if (k % 2) tg.farming.water(i); }); tg.farming.update(0);" },
  living: { indoor: true, x: -2.5, z: 2.5, yaw: 30, pitch: 40, dist: 7 },
  kitchen: { indoor: true, x: 4, z: 3.5, yaw: 200, pitch: 40, dist: 7 },
  bedroom: { indoor: true, x: -5, z: -3.5, yaw: 150, pitch: 40, dist: 7 },
  houseTop: { indoor: true, x: 0, z: 0, yaw: 180, pitch: 62, dist: 14 },
};

guard(chromium);
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) i++;
  else names.push(args[i]);
}
const out = resolve(here, flag('out', 'shots/town'));
const [width, height] = flag('size', '1600x900').split('x').map(Number);
const hour = flag('hour', null);
const photoRes = flag('photo', null);
mkdirSync(out, { recursive: true });

const root = resolve(here, 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ogg': 'audio/ogg' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/town.html?dpr=1&${flag('query', 'quality=medium')}`;

const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text().slice(0, 1200)}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}\n${e.stack?.slice(0, 600)}`));
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 240000 });
} catch {
  console.log('never ready\n' + problems.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}
console.log(`ready in ${Date.now() - t0} ms`, JSON.stringify(await page.evaluate(() => window.__tg.city.stats)));
if (flag('nohud', null) !== null) await page.addStyleTag({ content: '#hud,#minimap-wrap,#help,.hud,.panel{display:none!important}' });

for (const name of names.length ? names : Object.keys(VIEWS)) {
  const view = VIEWS[name];
  if (!view) {
    console.log(`no view called ${name}`);
    continue;
  }
  const ms = await page.evaluate(
    ([v, hour]) => {
      const tg = window.__tg;
      if (!!v.indoor !== tg.indoor()) v.indoor ? tg.enter() : tg.exit();
      if (tg.hud.isOpen) tg.hud.close();
      tg.bigmap?.close();
      tg.photo?.exit();
      tg.setClock(v.clock ?? (hour != null ? Number(hour) : 10.5));
      tg.whale.state.x = v.x;
      tg.whale.state.z = v.z;
      tg.cam.yaw = (v.yaw * Math.PI) / 180;
      tg.cam.pitch = (v.pitch * Math.PI) / 180;
      tg.cam.distance = tg.cam.want = v.dist;
      tg.whale.state.yaw = v.face != null ? (v.face * Math.PI) / 180 : tg.cam.yaw + Math.PI;
      tg.mover.keys.clear();
      tg.actions?.reset();
      tg.forcePose = null;
      tg.weather?.set(v.weather ?? 'clear', { immediate: true });
      if (v.setup) new Function('tg', v.setup)(tg);
      if (v.sit) tg.game.interact(tg.interior.interactables.find((i) => i.kind === 'sofa'));
      for (let i = 0; i < 50; i++) {
        if (v.walk) {
          tg.whale.state.x = v.x;
          tg.whale.state.z = v.z;
          tg.whale.state.yaw = (v.face * Math.PI) / 180;
          tg.forceMoving = true;
        } else tg.forceMoving = false;
        tg.tick(1 / 30);
      }
      const gl = tg.renderer.getContext();
      gl.finish();
      const a = performance.now();
      for (let i = 0; i < 10; i++) tg.tick(1 / 60);
      gl.finish();
      return (performance.now() - a) / 10;
    },
    [view, hour],
  );
  if (view.async) await page.evaluate(async (code) => new (Object.getPrototypeOf(async () => {}).constructor)('tg', code)(window.__tg), view.async);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`shot ${name} (${ms.toFixed(1)} ms a frame)`);
  // --photo 4K：同一个机位再用游戏里的相机拍一张原尺寸的照片
  if (photoRes) {
    const got = await page.evaluate(async (res) => {
      const tg = window.__tg;
      tg.photo.album.close();
      const was = tg.photo.on;
      if (!was) tg.photo.enter();
      const keep = tg.photo.prefs.res;
      tg.photo.prefs.res = res;
      tg.tick(1 / 60);
      const t = performance.now();
      const rec = await tg.photo.shoot({ download: false, save: false });
      const ms = performance.now() - t;
      tg.photo.prefs.res = keep;
      if (!was) tg.photo.exit();
      if (!rec) return null;
      const url = await new Promise((r) => {
        const f = new FileReader();
        f.onload = () => r(f.result);
        f.readAsDataURL(rec.blob);
      });
      return { url, w: rec.w, h: rec.h, size: rec.size, ms, timing: tg.photo.timing, ext: rec.type === 'image/png' ? 'png' : 'jpg' };
    }, photoRes);
    if (!got) console.log(`photo ${name}: failed`);
    else {
      writeFileSync(join(out, `${name}-photo.${got.ext}`), Buffer.from(got.url.split(',')[1], 'base64'));
      console.log(`photo ${name}: ${got.w}x${got.h} ${(got.size / 1048576).toFixed(1)} MB in ${got.ms.toFixed(0)} ms ${JSON.stringify(Object.fromEntries(Object.entries(got.timing ?? {}).map(([k, v]) => [k, Math.round(v)])))}`);
    }
  }
}
if (problems.length) console.log([...new Set(problems)].slice(0, 12).join('\n'));
await browser.close();
server.close();
