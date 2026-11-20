// 小鲸鱼的世界：按坐标随手截图。
//   node tools/quick-shots.mjs --root dist --out shots/new --query "quality=medium" name:x:z:yaw:pitch:dist[:hour] ...
//   --nohud 去掉界面；--perf 顺便量每帧毫秒数
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
const views = args.filter((a) => /^[\w-]+:-?\d/.test(a)).map((a) => a.split(':'));
const root = resolve(here, flag('root', 'dist'));
const out = resolve(here, flag('out', 'shots/new'));
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ogg': 'audio/ogg', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const [width, height] = flag('size', '1600x900').split('x').map(Number);
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text().slice(0, 900)}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}\n${e.stack?.slice(0, 900)}`));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${server.address().port}/town.html?dpr=1&${flag('query', 'quality=medium')}`);
try {
  await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 240000 });
} catch {
  console.log('never ready\n' + problems.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}
console.log(`ready in ${Date.now() - t0} ms`, JSON.stringify(await page.evaluate(() => window.__tg.city.stats)));
if (has('nohud')) await page.addStyleTag({ content: '#hud,#minimap-wrap,#help,.hud,.panel{display:none!important}' });
for (const [name, x, z, yaw, pitch, dist, hour] of views) {
  const ms = await page.evaluate(
    ([x, z, yaw, pitch, dist, hour, perf, ticks]) => {
      const tg = window.__tg;
      if (tg.indoor()) tg.exit();
      if (tg.hud.isOpen) tg.hud.close();
      tg.bigmap?.close();
      tg.setClock(hour ?? 10.5);
      tg.whale.state.x = x;
      tg.whale.state.z = z;
      tg.cam.yaw = (yaw * Math.PI) / 180;
      tg.cam.pitch = (pitch * Math.PI) / 180;
      tg.cam.distance = tg.cam.want = dist;
      tg.whale.state.yaw = tg.cam.yaw + Math.PI;
      tg.mover.keys.clear();
      tg.weather?.set('clear', { immediate: true });
      tg.actions?.reset?.();
      for (let i = 0; i < ticks; i++) tg.tick(1 / 30);
      if (!perf) return null;
      const gl = tg.renderer.getContext();
      const px = new Uint8Array(4);
      const sync = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      };
      sync();
      const a = performance.now();
      for (let i = 0; i < 12; i++) {
        tg.tick(1 / 60);
        sync();
      }
      return +((performance.now() - a) / 12).toFixed(1);
    },
    [Number(x), Number(z), Number(yaw), Number(pitch), Number(dist), hour ? Number(hour) : null, has('perf'), Number(flag('ticks', 50))],
  );
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(name, ms != null ? `${ms} ms/frame` : 'ok');
}
if (problems.length) console.log([...new Set(problems)].slice(0, 12).join('\n'));
await browser.close();
server.close();
