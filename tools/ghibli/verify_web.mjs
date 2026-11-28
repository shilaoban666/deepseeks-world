// 用项目自己的 three.js + GLTFLoader 在真浏览器里加载全部 150 个 GLB。
//   node tools/ghibli/verify_web.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(process.argv[2] || '.');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png',
  '.jpg': 'image/jpeg',
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
const url = `http://127.0.0.1:${server.address().port}/tools/ghibli/webcheck.html`;

const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({
  executablePath: exe, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });

const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__done === true, null, { timeout: 300000 });
const results = await page.evaluate(() => window.__results);
await browser.close();
server.close();

const ok = results.filter((r) => r.ok);
const bad = results.filter((r) => !r.ok);
const noUv = results.filter((r) => r.no_uv);
const summary = {
  checked: results.length, ok: ok.length, failed: bad.length,
  elapsed_s: Math.round((Date.now() - t0) / 100) / 10,
  tris: Math.round(results.reduce((a, r) => a + (r.tris || 0), 0)),
  materials: results.reduce((a, r) => a + (r.materials || 0), 0),
  without_uv: noUv.length,
  gl_errors: results.filter((r) => r.gl_error).length,
  page_errors: errors.slice(0, 8),
  items: results,
};
await writeFile(join(ROOT, 'design', 'webcheck.json'), JSON.stringify(summary, null, 1));
console.log(`WEB ${ok.length}/${results.length} 加载并渲染通过 · ${summary.elapsed_s}s · ${summary.tris} tris · UV 缺失 ${noUv.length} 件`);
for (const r of bad.slice(0, 12)) console.log(' FAIL', r.id, r.error || `gl_error=${r.gl_error}`);
if (errors.length) console.log('页面错误:', errors.slice(0, 4).join(' | '));