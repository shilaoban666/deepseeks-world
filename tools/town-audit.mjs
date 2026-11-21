// 穿模体检：打开小镇（高画质，套件模型都在），读 city.cull（拆了多少房子、因为什么）和 city.audit()（还有多少东西叠着）。
//   node tools/town-audit.mjs [--quality high]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const root = resolve(here, 'dist');
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 400)}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}\n${e.stack?.slice(0, 600)}`));
await page.goto(`http://127.0.0.1:${server.address().port}/town.html?quality=${arg('--quality', 'high')}`);
await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 240000 });
const report = await page.evaluate(() => ({ stats: window.__tg.city.stats, cull: window.__tg.city.cull, settle: window.__tg.city.settle, dress: (({ count, where, ...d }) => d)(window.__tg.city.dress ?? {}), where: window.__tg.city.dress?.where ?? {}, houses: Object.fromEntries(window.__tg.city.kitHouses.filter((h) => h.auto).map((h) => [h.kit, [Math.round(h.x), Math.round(h.z), h.turn]])), extras: window.__tg.city.kitHouses.length, props: window.__tg.city.propSlots.length, audit: window.__tg.city.audit() }));
if (arg('--where', null)) {
  // 给 town-shots.mjs 用的机位：站在这件东西正面几米外看它
  const { writeFileSync } = await import('node:fs');
  writeFileSync(arg('--where'), JSON.stringify({ where: report.where, houses: report.houses }));
}
delete report.where;
delete report.houses;
console.log(JSON.stringify(report, null, 1));
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
server.close();
