// 小鲸鱼的世界：逐项关掉，看每一项花多少毫秒。 node tools/town-perf.mjs [query]
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
const url = `http://127.0.0.1:${server.address().port}/town.html?${process.argv[2] ?? 'lite=1'}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 240000 });
const out = await page.evaluate(() => {
  const tg = window.__tg;
  tg.setClock(10.5);
  tg.whale.state.x = 96;
  tg.whale.state.z = 44;
  tg.cam.yaw = (235 * Math.PI) / 180;
  tg.cam.pitch = 0.2;
  const gl = tg.renderer.getContext();
  const time = () => {
    const px = new Uint8Array(4);
    const sync = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    };
    for (let i = 0; i < 6; i++) tg.tick(1 / 30);
    sync();
    const a = performance.now();
    for (let i = 0; i < 10; i++) {
      tg.tick(1 / 60);
      sync();
    }
    return +((performance.now() - a) / 10).toFixed(1);
  };
  const res = { all: time(), info: { calls: tg.renderer.info.render.calls, tris: tg.renderer.info.render.triangles } };
  const off = (name, obj) => {
    obj.visible = false;
    res[`no ${name}`] = time();
    obj.visible = true;
  };
  off('trees', tg.city.woods.group);
  off('city', tg.city.group);
  off('grass+ground', tg.field.group);
  const p = tg.frame.paint;
  tg.setPaint(0);
  res['no paint'] = time();
  tg.setPaint(p);
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
server.close();
