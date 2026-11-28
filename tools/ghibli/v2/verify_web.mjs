// 用项目自己的 three.js + GLTFLoader 在真浏览器里加载 models2 全部 GLB。
//   node tools/ghibli/v2/verify_web.mjs [--limit N]
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve('.');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  try {
    let p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if ((await stat(p)).isDirectory()) p = join(p, 'index.html');
    if (!p.startsWith(ROOT)) return void res.writeHead(403).end();
    const body = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/tools/ghibli/v2/webcheck.html?manifest=/public/models2/_manifest.json&base=/public/`;

const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({
  executablePath: exe, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--mute-audio',
         '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });

const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__done === true, null, { timeout: 1800000 });
const results = await page.evaluate(() => window.__results);
await browser.close();
server.close();

const ok = results.filter((r) => r.ok);
const bad = results.filter((r) => !r.ok);
const noUv = results.filter((r) => r.no_uv);
const byCat = {};
for (const r of results) {
  byCat[r.cat] = byCat[r.cat] || { n: 0, ok: 0 };
  byCat[r.cat].n++;
  if (r.ok) byCat[r.cat].ok++;
}
const summary = {
  checked: results.length, ok: ok.length, failed: bad.length,
  elapsed_s: Math.round((Date.now() - t0) / 100) / 10,
  tris: Math.round(results.reduce((a, r) => a + (r.tris || 0), 0)),
  without_uv: noUv.length,
  gl_errors: results.filter((r) => r.gl_error).length,
  by_cat: byCat,
  page_errors: errors.slice(0, 8),
  items: results,
};
await writeFile(join(ROOT, 'design', 'webcheck2.json'), JSON.stringify(summary, null, 1));
console.log(`WEB ${ok.length}/${results.length} 通过 · ${summary.elapsed_s}s · ${summary.tris} tris · UV缺失 ${noUv.length}`);
console.log('by_cat', JSON.stringify(byCat));
for (const r of bad.slice(0, 15)) console.log(' FAIL', r.id, r.error || `gl_error=${r.gl_error}`);
if (errors.length) console.log('页面错误:', errors.slice(0, 4).join(' | '));