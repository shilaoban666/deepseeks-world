// 小鲸鱼的世界：截图。
//   node tools/town-shots.mjs [names...] [--out shots/town] [--query "lite=1"] [--size 1600x900]
// 每个机位：人站在哪 (x,z)、镜头绕到哪 (yaw 度)、俯仰 (pitch 度)、离多远 (dist)。indoor: true 先进屋。
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
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
  lake: { x: -150, z: -478, yaw: 180, pitch: 10, dist: 9 },
  river: { x: -400, z: -60, yaw: 60, pitch: 12, dist: 9 },
  bridge: { x: -380, z: -420, yaw: 100, pitch: 10, dist: 10 },
  sea: { x: 716, z: 70, yaw: 250, pitch: 8, dist: 9 },
  seaside: { x: 610, z: -250, yaw: 200, pitch: 10, dist: 12 },
  lighthouse: { x: 716, z: -350, yaw: 300, pitch: 4, dist: 14 },
  station: { x: 520, z: 150, yaw: 270, pitch: 8, dist: 14 },
  fishmarket: { x: 178, z: -76, yaw: 0, pitch: 14, dist: 9 },
  snowtown: { x: -600, z: -200, yaw: 20, pitch: 8, dist: 12 },
  garden: { x: -400, z: 640, yaw: 60, pitch: 14, dist: 8 },
  walkSide: { x: 40, z: 25, yaw: 150, pitch: 8, dist: 5, face: 240, walk: true },
  walkFront: { x: 40, z: 25, yaw: 60, pitch: 8, dist: 5, face: 60, walk: true },
  sit: { indoor: true, x: -4.6, z: 4.6, yaw: 20, pitch: 45, dist: 6, sit: true },
  farm: { x: -600, z: 470, yaw: 20, pitch: 12, dist: 12 },
  fields: { x: -470, z: 600, yaw: 300, pitch: 16, dist: 14 },
  forest: { x: -560, z: -380, yaw: 60, pitch: 8, dist: 8 },
  wild: { x: 420, z: -120, yaw: 110, pitch: 8, dist: 8 },
  peak: { x: 60, z: -470, yaw: 0, pitch: 4, dist: 8 },
  overview: { x: 110, z: 60, yaw: 200, pitch: 52, dist: 26 },
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
      tg.setClock(v.clock ?? (hour != null ? Number(hour) : 10.5));
      tg.whale.state.x = v.x;
      tg.whale.state.z = v.z;
      tg.cam.yaw = (v.yaw * Math.PI) / 180;
      tg.cam.pitch = (v.pitch * Math.PI) / 180;
      tg.cam.distance = tg.cam.want = v.dist;
      tg.whale.state.yaw = v.face != null ? (v.face * Math.PI) / 180 : tg.cam.yaw + Math.PI;
      tg.mover.keys.clear();
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
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`shot ${name} (${ms.toFixed(1)} ms a frame)`);
}
if (problems.length) console.log([...new Set(problems)].slice(0, 12).join('\n'));
await browser.close();
server.close();
