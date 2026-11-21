// 小鲸鱼的世界：截图。
//   node tools/town-shots.mjs [names...] [--out shots/town] [--query "lite=1"] [--size 1600x900]
// 每个机位：人站在哪 (x,z)、镜头绕到哪 (yaw 度)、俯仰 (pitch 度)、离多远 (dist)。indoor: true 先进屋。
import { mkdirSync, createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { guard } from './no-pointer-lock.mjs';

// yaw：镜头绕到她的哪一边（0 = 镜头在南边、朝北看；90 = 镜头在东边、朝西看；180 = 朝南看；270 = 朝东看）。
// 坐标照 src/town/plan.js 的新地图：玉海城在正中，家在西边 (-600, -20)，海在东边和南边。
export const VIEWS = {
  // ---- 家、AI 小镇、河 ----
  home: { x: -600, z: -14, yaw: 20, pitch: 10, dist: 12 },
  // 两列高铁交会的那一刻：把两列车往前开到车头相距 60 m 以内，人站到桥边去看
  trains: { x: 20, z: 400, yaw: 0, pitch: 6, dist: 16, async: "const a = tg.city.train, b = tg.city.train2; for (let i = 0; i < 60 * 600; i++) { a.update(1 / 60); b.update(1 / 60); if (Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]) < 60) break; } const mx = (a.position[0] + b.position[0]) / 2, mz = (a.position[2] + b.position[2]) / 2; tg.whale.setPos(mx + 10, mz + 44); tg.cam.yaw = Math.atan2(10, 44); tg.cam.pitch = 0.1; tg.cam.want = tg.cam.distance = 14; for (let i = 0; i < 40; i++) tg.tick(0);" },
  // 弹窗长什么样（不带 --nohud 拍）
  dialog: { x: -600, z: -14, yaw: 20, pitch: 10, dist: 12, async: "document.getElementById('panel-title').textContent = '居民小屋'; document.getElementById('panel-body').innerHTML = '<p>推开木门，屋里有晒过太阳的木头香。</p><p class=\"dim\">每一栋房子都留下了居民的生活痕迹。</p>'; document.getElementById('panel-foot').innerHTML = '<button class=\"primary\">进去看看</button><button>离开</button>'; document.getElementById('panel').classList.add('on'); const p = document.getElementById('prompt'); p.innerHTML = '<kbd>E</kbd>查看建筑'; p.classList.add('on'); await new Promise((r) => setTimeout(r, 700));" },
  homeFront: { x: -600, z: -12, yaw: 340, pitch: 8, dist: 7 },
  aitown: { x: -470, z: -95, yaw: 30, pitch: 12, dist: 16 },
  river: { x: -606, z: 30, yaw: 60, pitch: 12, dist: 10 },
  farm: { x: -452, z: 72, yaw: 20, pitch: 12, dist: 12 },
  fishmarket: { x: -378, z: 172, yaw: 135, pitch: 14, dist: 12 },
  bridge: { x: -352, z: 371, yaw: 20, pitch: 12, dist: 14 },
  // ---- 玉海城 ----
  yuhaiGate: { x: 40, z: 215, yaw: 0, pitch: 10, dist: 16 },
  street: { x: 40, z: 60, yaw: 10, pitch: 9, dist: 8 },
  plaza: { x: 40, z: -80, yaw: 0, pitch: 12, dist: 16 },
  plazaHigh: { x: 40, z: -70, yaw: 0, pitch: 34, dist: 30 },
  palace: { x: 40, z: -150, yaw: 0, pitch: 12, dist: 18 },
  oldstreet: { x: 128, z: -20, yaw: 0, pitch: 10, dist: 12 },
  food: { x: 128, z: 10, yaw: 200, pitch: 10, dist: 10 },
  market: { x: 170, z: 78, yaw: 0, pitch: 16, dist: 12 },
  mosque: { x: -118, z: -95, yaw: 0, pitch: 12, dist: 16 },
  temple: { x: 196, z: -168, yaw: 0, pitch: 10, dist: 14 },
  shops: { x: 10, z: 128, yaw: 180, pitch: 10, dist: 14 },
  overview: { x: 40, z: 20, yaw: 0, pitch: 52, dist: 40 },
  overviewYuhai: { x: 40, z: -60, yaw: 0, pitch: 55, dist: 60 },
  // ---- 东边：CBD、海滨小镇、灯塔、港口 ----
  cbd: { x: 455, z: -40, yaw: 0, pitch: 12, dist: 18 },
  civic: { x: 492, z: -62, yaw: 300, pitch: 14, dist: 16 },
  seaside: { x: 745, z: -175, yaw: 270, pitch: 12, dist: 16 },
  lighthouse: { x: 880, z: -188, yaw: 270, pitch: 6, dist: 16 },
  sea: { x: 806, z: -512, yaw: 250, pitch: 8, dist: 9 },
  port: { x: 715, z: 95, yaw: 270, pitch: 12, dist: 18 },
  boats: { x: 780, z: 95, yaw: 270, pitch: 10, dist: 12 },
  // ---- 南边：高铁站、海鲜排档、沙滩 ----
  station: { x: 20, z: 445, yaw: 0, pitch: 10, dist: 18 },
  seafood: { x: 425, z: 462, yaw: 30, pitch: 12, dist: 14 },
  beach: { x: 385, z: 535, yaw: 150, pitch: 10, dist: 12 },
  // ---- 西南：海边新城、码头 ----
  newtown: { x: -740, z: 345, yaw: 0, pitch: 12, dist: 18 },
  harbor: { x: -733, z: 500, yaw: 180, pitch: 12, dist: 16 },
  // ---- 西边：田园小镇、麦田、果园 ----
  pastoral: { x: -850, z: -140, yaw: 30, pitch: 12, dist: 16 },
  fields: { x: -850, z: 40, yaw: 300, pitch: 16, dist: 14 },
  crops: { x: -860, z: 70, yaw: 200, pitch: 18, dist: 8 },
  orchard: { x: -800, z: -288, yaw: 330, pitch: 12, dist: 11 },
  // ---- 北边：雪山小镇、月亮湖、湖边小镇、大学城 ----
  snowtown: { x: -790, z: -548, yaw: 20, pitch: 10, dist: 16 },
  peak: { x: -760, z: -640, yaw: 0, pitch: 4, dist: 8 },
  forest: { x: -430, z: -650, yaw: 60, pitch: 8, dist: 8 },
  lake: { x: 40, z: -425, yaw: 30, pitch: 10, dist: 10 },
  lakeside: { x: 270, z: -505, yaw: 0, pitch: 12, dist: 16 },
  university: { x: 660, z: -455, yaw: 40, pitch: 12, dist: 18 },
  wild: { x: 330, z: 215, yaw: 110, pitch: 8, dist: 8 },
  // ---- 走路、坐 ----
  walkSide: { x: 40, z: 60, yaw: 90, pitch: 8, dist: 5, face: 180, walk: true },
  walkFront: { x: 40, z: 60, yaw: 180, pitch: 8, dist: 5, face: 180, walk: true },
  sit: { indoor: true, x: -4.6, z: 4.6, yaw: 20, pitch: 45, dist: 6, sit: true },
  // ---- 天气 ----
  rainStreet: { x: 40, z: 60, yaw: 10, pitch: 8, dist: 7, weather: 'rain' },
  storm: { x: -150, z: 520, yaw: 300, pitch: 14, dist: 10, weather: 'storm', setup: "tg.weather.strike(tg.camera, { x: -190, z: 480 });" },
  frost: { x: 40, z: -80, yaw: 0, pitch: 12, dist: 16, weather: 'frost' },
  frostWild: { x: -150, z: 520, yaw: 60, pitch: 14, dist: 8, weather: 'frost' },
  sunny: { x: 385, z: 535, yaw: 150, pitch: 10, dist: 8, weather: 'sunny' },
  windy: { x: -850, z: 40, yaw: 300, pitch: 12, dist: 8, weather: 'windy', setup: "for (let i = 0; i < 120; i++) tg.weather.update(1/30, tg.camera, { minutes: 0 });" },
  // ---- 动作 ----
  swim: { x: -40, z: -462, yaw: 160, pitch: 14, dist: 6, setup: "tg.actions.step(0.016, tg.plan.walkAt);" },
  dive: { x: -40, z: -500, yaw: 120, pitch: 2, dist: 4.5, setup: "tg.actions.step(0.016, tg.plan.walkAt); tg.actions.act('dive'); for (let i = 0; i < 90; i++) tg.actions.step(1/30, tg.plan.walkAt);" },
  diveSea: { x: 400, z: 650, yaw: 120, pitch: 2, dist: 4.5, setup: "tg.actions.step(0.016, tg.plan.walkAt); tg.actions.act('dive'); for (let i = 0; i < 90; i++) tg.actions.step(1/30, tg.plan.walkAt);" },
  climb: { x: 320, z: 120, yaw: 30, pitch: 10, dist: 9, face: 180, setup: "const t = tg.city.woods.trees.filter((t) => t[2] >= 1 && t[2] <= 3 && t[3] > 0.9 && tg.city.colliders.every((c) => Math.abs(c.x - t[0]) > c.hw + 14 || Math.abs(c.z - t[1]) > c.hd + 14) && Math.hypot(t[0] - 320, t[1] - 120) < 400).sort((a, b) => Math.hypot(a[0] - 320, a[1] - 120) - Math.hypot(b[0] - 320, b[1] - 120))[0]; tg.whale.state.x = t[0] + 1.5; tg.whale.state.z = t[1] + 1.5; tg.whale.state.y = tg.plan.heightAt(t[0], t[1]); tg.actions.act('climb'); tg.mover.keys.add('KeyW'); for (let i = 0; i < 32; i++) tg.actions.step(1/30, tg.plan.walkAt); tg.mover.keys.clear(); tg.cam.yaw = Math.atan2(tg.whale.state.x - t[0], tg.whale.state.z - t[1]) + 0.5;" },
  fishing: { x: -60, z: -432, yaw: 50, pitch: 16, dist: 6, face: 180, setup: "tg.whale.state.yaw = Math.PI; tg.game.interact({ kind: 'fish', name: 'x' }); tg.game.fishing.wait = 99;" },
  catch: { x: -60, z: -432, yaw: 50, pitch: 16, dist: 6, face: 180, setup: "tg.whale.state.yaw = Math.PI; tg.game.interact({ kind: 'fish', name: 'x' }); tg.game.fishing.phase = 'bite'; tg.game.fishing.fish = tg.fishdex.BY_ID['mandarin-fish']; tg.game.fishing.life = 99; const r = Math.random; Math.random = () => 0; tg.game.interact({ kind: 'fish', name: 'x' }); Math.random = r;" },
  lie: { x: 380, z: 540, yaw: 200, pitch: 28, dist: 5, weather: 'sunny', setup: "tg.actions.act('lie');" },
  fire: { x: -250, z: 300, yaw: 190, pitch: 16, dist: 11, face: 10, weather: 'windy', setup: "tg.whale.state.x = -250; tg.whale.state.z = 300; tg.whale.state.yaw = 0.17; tg.actions.act('fire'); for (let i = 0; i < 300; i++) tg.field.update(1/30, tg.camera);" },
  playground: { x: -470, z: -95, yaw: 30, pitch: 12, dist: 9, setup: "const p = tg.city.interactables.find((i) => i.id === 'playground'); if (p) { tg.whale.state.x = p.x + 4; tg.whale.state.z = p.z + 14; tg.whale.state.yaw = Math.PI; }" },
  // ---- 面板、地图 ----
  weatherPanel: { x: 40, z: -80, yaw: 0, pitch: 12, dist: 16, setup: "tg.panels.openWeather();" },
  bagPanel: { x: 40, z: 60, yaw: 10, pitch: 8, dist: 7, setup: "tg.game.state.bag.fish = 2; tg.game.state.bag.cooked = 1; tg.game.state.bag.flower = 3; tg.panels.openBag();" },
  dex: { x: 40, z: 60, yaw: 10, pitch: 8, dist: 7, setup: "for (const id of ['crucian-carp','common-carp','grass-carp','mandarin-fish','koi-carp','snakehead','catfish','bream','chinese-sturgeon','tench','goldfish']) tg.game.state.dex[id] = 1 + (id.length % 4); tg.panels.openDex('lake');" },
  busPanel: { x: -344, z: -84, yaw: 0, pitch: 10, dist: 8, setup: "tg.game.state.coins = Math.max(tg.game.state.coins, 20); tg.game.interact(tg.city.interactables.find((i) => i.kind === 'bus') ?? { kind: 'bus', name: '公交站', stop: 'AI 小镇站' });" },
  metroPanel: { x: 252, z: -44, yaw: 0, pitch: 10, dist: 8, setup: "tg.game.state.coins = Math.max(tg.game.state.coins, 20); tg.game.interact(tg.city.interactables.find((i) => i.kind === 'bus' && String(i.line).includes('地铁')) ?? { kind: 'bus', name: '地铁站', stop: '老街站', line: '地铁 1 号线' });" },
  railPanel: { x: 20, z: 445, yaw: 0, pitch: 10, dist: 18, setup: "tg.game.state.coins = Math.max(tg.game.state.coins, 20); tg.game.interact(tg.city.interactables.find((i) => i.kind === 'station') ?? { kind: 'station', name: '高铁站', stop: '高铁站', x: 20, z: 372 });" },
  bigmap: { x: 40, z: 60, yaw: 10, pitch: 8, dist: 7, setup: "for (const [x, z] of [[-40,-430],[-460,-112],[-850,40],[-860,-150],[-740,345],[-735,545],[715,95],[762,-182],[640,-480],[285,-510],[-790,-548],[385,535],[20,400],[445,-120],[40,-60],[-352,371]]) { tg.whale.state.x = x; tg.whale.state.z = z; tg.bigmap.update(0.016, true); } tg.whale.state.x = 40; tg.whale.state.z = 60; tg.bigmap.open(); tg.bigmap.setView(0, -20, 1.05); tg.bigmap.setWaypoint({ id: 'lake-shore', name: '月亮湖边', x: -60, z: -436 }); tg.bigmap.update(0.016, true);" },
  bigmapAll: { x: 40, z: 60, yaw: 10, pitch: 8, dist: 7, setup: "tg.bigmap.revealAll(); tg.bigmap.open(); tg.bigmap.setView(0, 0, 1); tg.bigmap.update(0.016, true);" },
  bigmapZoom: { x: -345, z: -70, yaw: 10, pitch: 8, dist: 7, setup: "tg.bigmap.open(); tg.bigmap.select('bus-AI 小镇站'); tg.bigmap.setView(-420, -80, 4.5); tg.bigmap.update(0.016, true);" },
  bigmapYuhai: { x: 40, z: 60, yaw: 10, pitch: 8, dist: 7, setup: "tg.bigmap.revealAll(); tg.bigmap.open(); tg.bigmap.setView(40, -40, 3.2); tg.bigmap.update(0.016, true);" },
  bigmapWorld: { x: 40, z: 60, yaw: 10, pitch: 8, dist: 7, async: "tg.bigmap.open(); tg.bigmap.setTab('world'); tg.bigmap.update(0.016, true); await new Promise((r) => setTimeout(r, 900)); tg.bigmap.update(0.016, true);" },
  bigmapDistrict: { x: -470, z: -95, yaw: 30, pitch: 12, dist: 16, async: "tg.bigmap.open(); tg.bigmap.setTab('district'); tg.bigmap.update(0.016, true); await new Promise((r) => setTimeout(r, 900));" },
  bigmapPaper: { x: 40, z: 60, yaw: 10, pitch: 8, dist: 7, async: "tg.bigmap.open(); tg.bigmap.setPaper('seaside-port'); tg.bigmap.update(0.016, true); await new Promise((r) => setTimeout(r, 900));" },
  minimap: { x: 40, z: 150, yaw: 0, pitch: 12, dist: 10 },
  // ---- 相机、相册 ----
  camera: { x: 40, z: -80, yaw: 0, pitch: 12, dist: 16, setup: "tg.photo.enter(); tg.photo.setFocal(30);" },
  cameraSelfie: { x: -850, z: 40, yaw: 160, pitch: 8, dist: 9, face: 340, setup: "tg.photo.enter(); tg.photo.setMode('selfie'); tg.cam.yaw += 0.5; tg.photo.prefs.filter = 'warm'; tg.photo.refresh();" },
  cameraEye: { x: 880, z: -188, yaw: 270, pitch: -2, dist: 6, clock: 18.9, setup: "tg.photo.enter(); tg.photo.setMode('eye'); tg.cam.yaw = 270 * Math.PI / 180; tg.cam.pitch = -0.03; tg.photo.setFocal(28); tg.photo.prefs.filter = 'film'; tg.photo.prefs.stamp = true; tg.photo.refresh();" },
  cameraPortrait: { x: 40, z: 60, yaw: 10, pitch: 8, dist: 6, setup: "tg.photo.enter(); tg.photo.prefs.aspect = '9:16'; tg.photo.prefs.filter = 'warm'; tg.photo.setFocal(40); tg.photo.refresh();" },
  album: { x: 40, z: -80, yaw: 0, pitch: 12, dist: 16, async: "tg.photo.enter(); for (const [x, z, y, h, f, a, m] of [[40,-80,0,10.5,'none','16:9','follow'],[40,-425,30,17.8,'warm','3:2','follow'],[880,-188,270,18.9,'film','16:9','eye'],[-600,-12,20,9,'morning','1:1','selfie'],[-850,40,200,16,'dusk','9:16','follow'],[40,60,10,11,'ink','3:2','follow']]) { tg.photo.exit(); tg.setClock(h); tg.whale.state.x = x; tg.whale.state.z = z; tg.cam.yaw = y * Math.PI / 180; tg.cam.pitch = m === 'eye' ? -0.03 : 0.2; tg.whale.state.yaw = m === 'selfie' ? tg.cam.yaw : tg.cam.yaw + Math.PI; tg.photo.enter(); tg.photo.setMode(m); if (m === 'eye') { tg.cam.yaw = y * Math.PI / 180; tg.cam.pitch = -0.03; } tg.photo.prefs.filter = f; tg.photo.prefs.aspect = a; tg.photo.prefs.res = '1080p'; for (let i = 0; i < 40; i++) tg.tick(1/30); await tg.photo.shoot({ download: false }); } Object.assign(tg.photo.prefs, { res: '4K', filter: 'none', aspect: '16:9' }); tg.photo.album.open(); await new Promise((r) => setTimeout(r, 500));" },
  albumView: { x: 40, z: -80, yaw: 0, pitch: 12, dist: 16, async: "if (!tg.photo.photos.length) { tg.photo.enter(); for (let i = 0; i < 40; i++) tg.tick(1/30); await tg.photo.shoot({ download: false }); } tg.photo.enter(); tg.photo.album.open(tg.photo.photos.length - 1); await new Promise((r) => setTimeout(r, 600));" },
  // ---- 种地（家门口的菜地在院子西半边；租的菜地在丰收田园） ----
  garden: { x: -605, z: -13, yaw: 340, pitch: 22, dist: 7, face: 200, setup: "const ids = ['radish','napa-cabbage','tomato','chilli','maize','sunflower','potato','pea']; ids.forEach((c, i) => { tg.farming.plant(i, c); tg.farming.plot(i).growth = [1, 0.85, 0.6, 0.3, 1, 0.9, 0.15, 0.5][i]; if (i % 2) tg.farming.water(i); }); tg.farming.update(0);" },
  gardenNight: { x: -605, z: -13, yaw: 340, pitch: 22, dist: 7, face: 200, clock: 21.5, setup: "const ids = ['radish','napa-cabbage','tomato','chilli','maize','sunflower','potato','pea']; ids.forEach((c, i) => { tg.farming.plant(i, c); tg.farming.plot(i).growth = [1, 0.85, 0.6, 0.3, 1, 0.9, 0.15, 0.5][i]; if (i % 2) tg.farming.water(i); }); tg.farming.update(0);" },
  plotPanel: { x: -605, z: -13, yaw: 340, pitch: 22, dist: 7, face: 200, setup: "tg.farming.plant(3, 'tomato'); tg.farming.plot(3).growth = 0.62; tg.farming.water(3); tg.game.interact(tg.city.interactables.find((i) => i.id === 'plot-3'));" },
  seedPanel: { x: -605, z: -13, yaw: 340, pitch: 22, dist: 7, face: 200, setup: "tg.farming.clear(5); tg.game.state.bag['seed-maize'] = 2; tg.game.state.bag['seed-sunflower'] = 1; tg.game.interact(tg.city.interactables.find((i) => i.id === 'plot-5'));" },
  seedShop: { x: -594, z: -13, yaw: 20, pitch: 22, dist: 7, setup: "tg.game.interact(tg.city.interactables.find((i) => i.id === 'farm-seeds'));" },
  rentGarden: { x: -478, z: 52, yaw: 20, pitch: 32, dist: 9, setup: "['maize','sunflower','tomato','chilli','potato','tea','peanut','pea','radish','napa-cabbage','garlic','sweet-potato'].forEach((c, k) => { const i = 8 + k; tg.farming.plant(i, c); tg.farming.plot(i).growth = 0.3 + (k % 4) * 0.25; if (k % 2) tg.farming.water(i); }); tg.farming.update(0);" },
  // ---- 夜里 ----
  nightPlaza: { x: 40, z: -80, yaw: 0, pitch: 12, dist: 16, clock: 21 },
  nightFood: { x: 128, z: 10, yaw: 200, pitch: 10, dist: 10, clock: 21.3 },
  nightShops: { x: 10, z: 128, yaw: 180, pitch: 10, dist: 14, clock: 21.2 },
  nightLake: { x: 40, z: -425, yaw: 30, pitch: 8, dist: 10, clock: 21.5 },
  nightLighthouse: { x: 850, z: -188, yaw: 270, pitch: 5, dist: 18, clock: 21.5 },
  nightHome: { x: -600, z: -8, yaw: 10, pitch: 14, dist: 12, clock: 20.6 },
  nightCbd: { x: 455, z: -40, yaw: 0, pitch: 12, dist: 18, clock: 21 },
  // ---- 屋里 ----
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
// --at "名字:x,z,yaw,pitch,dist[,fov]"：临时加一个机位（不用改上面的表）；可以写多次
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--at') continue;
  const [name, rest] = args[i + 1].split(':');
  const [x, z, yaw, pitch, dist, fov] = rest.split(',').map(Number);
  VIEWS[name] = { x, z, yaw, pitch, dist, fov };
  names.push(name);
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
      tg.camera.fov = v.fov || 58;
      tg.camera.updateProjectionMatrix();
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
