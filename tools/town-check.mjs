// 小鲸鱼的世界：把每一个交互点都按一遍，看有没有报错；再走一走、进出一次屋。 node tools/town-check.mjs
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { guard } from './no-pointer-lock.mjs';
guard(chromium);
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const root = resolve(here, 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ogg': 'audio/ogg' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 400)}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}\n${e.stack?.slice(0, 400)}`));
await page.goto(`http://127.0.0.1:${server.address().port}/town.html?lite=1`);
await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 240000 });
const report = await page.evaluate(async () => {
  const tg = window.__tg;
  const out = { outdoor: [], indoor: [], failed: [] };
  const press = (it, bucket) => {
    try {
      tg.whale.state.x = it.x;
      tg.whale.state.z = it.z;
      tg.tick(1 / 30);
      tg.game.interact(it);
      const opened = tg.hud.isOpen;
      // 面板里的第一个按钮也点一下
      const btn = document.querySelector('.panel button, #panel button');
      if (btn) btn.click();
      for (let i = 0; i < 5; i++) tg.tick(1 / 30);
      if (tg.hud.isOpen) tg.hud.close();
      bucket.push(`${it.kind}:${it.name}${opened ? '(面板)' : ''}`);
    } catch (e) {
      out.failed.push(`${it.kind}:${it.name} → ${e.message}`);
    }
  };
  const kinds = new Set();
  for (const it of tg.city.interactables) {
    if (it.kind === 'door' || kinds.has(it.kind)) continue;
    kinds.add(it.kind);
    press(it, out.outdoor);
  }
  // 进屋
  tg.enter();
  for (let i = 0; i < 10; i++) tg.tick(1 / 30);
  out.entered = tg.indoor();
  for (const it of tg.interior.interactables) {
    if (it.kind === 'exit') continue;
    press(it, out.indoor);
    // 坐下的要站起来
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    tg.tick(1 / 30);
  }
  tg.exit();
  for (let i = 0; i < 10; i++) tg.tick(1 / 30);
  out.exited = !tg.indoor();
  // 走路：按住 W 走两秒，看位置变没变；撞墙看会不会穿进房子
  tg.whale.state.x = 40;
  tg.whale.state.z = 25;
  tg.cam.yaw = Math.PI;
  const before = [tg.whale.state.x, tg.whale.state.z];
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  for (let i = 0; i < 60; i++) tg.tick(1 / 30);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  out.walked = +Math.hypot(tg.whale.state.x - before[0], tg.whale.state.z - before[1]).toFixed(1);
  out.state = { coins: tg.game.state.coins ?? tg.game.state.gold, day: tg.game.state.day };
  out.stats = tg.city.stats;
  return out;
});
console.log(JSON.stringify(report, null, 1));
console.log(problems.length ? [...new Set(problems)].join('\n') : 'no page errors');
await browser.close();
server.close();
