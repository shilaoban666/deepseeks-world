// 重绘后的模型在网页里能不能用：用项目自己的 three + GLTFLoader 真加载、真渲染一帧，截一张图。
//   node tools/ghibli3/verify_web.mjs [--dir public/models3] [--out shots/models-pilot/web.png] [--max 12]
// 查的是：GLB 能解析、外部贴图（../tex/*.jpg）都取到了、有 UV 和顶点色、渲染没有 GL 错误。
import { createReadStream, existsSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const dir = flag('dir', 'public/models3');
const out = resolve(here, flag('out', 'shots/models-pilot/web.png'));
const max = Number(flag('max', 12));
mkdirSync(dirname(out), { recursive: true });
const items = JSON.parse(readFileSync(join(here, dir, '_manifest.json'), 'utf8')).items.filter((r) => r.glb).slice(0, max);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const page_ = /* html */ `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#8fb4dc}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const items = ${JSON.stringify(items.map((r) => ({ id: r.id, url: `/${dir}/${r.glb.split('/').slice(1).join('/')}` })))};
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb4dc);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x9a8f78, 1.5));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.position.set(-6, 10, 7);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x86b65a }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const loader = new GLTFLoader();
const report = [];
const cols = Math.ceil(Math.sqrt(items.length * 1.6));
let i = 0;
for (const it of items) {
  const r = { id: it.id };
  try {
    const gltf = await loader.loadAsync(it.url);
    let tris = 0, uv = true, colour = true, textured = 0, loaded = 0;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      uv &&= !!o.geometry.attributes.uv;
      colour &&= !!o.geometry.attributes.color;
      if (o.material.map) { textured++; if (o.material.map.image?.width > 1) loaded++; }
    });
    Object.assign(r, { ok: true, tris, uv: !!uv, colour: !!colour, textured, loaded });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    gltf.scene.position.set((i % cols) * 16 - box.getCenter(new THREE.Vector3()).x, 0, Math.floor(i / cols) * 16);
    scene.add(gltf.scene);
  } catch (e) {
    Object.assign(r, { ok: false, error: String(e.message ?? e) });
  }
  report.push(r);
  i++;
}
const rows = Math.ceil(items.length / cols);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 2000);
const cx = (cols - 1) * 8, cz = (rows - 1) * 8;
const reach = Math.max(cols, rows) * 16;
camera.position.set(cx - reach * 0.55, reach * 0.5 + 6, cz + reach * 0.95 + 14);
camera.lookAt(cx, 2, cz);
renderer.render(scene, camera);
window.__report = { items: report, glError: renderer.getContext().getError() };
</script>`;
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') return void res.writeHead(200, { 'Content-Type': 'text/html' }).end(page_);
  if (path === '/favicon.ico') return void res.writeHead(204).end();
  const file = normalize(join(here, path));
  if (!file.startsWith(here) || !existsSync(file) || statSync(file).isDirectory()) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`));
page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()}: ${r.url()}`));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__report, null, { timeout: 120000 });
const report = await page.evaluate(() => window.__report);
await page.screenshot({ path: out });
const bad = report.items.filter((r) => !r.ok || !r.uv || !r.colour || r.loaded !== r.textured);
console.log(`loaded ${report.items.filter((r) => r.ok).length}/${report.items.length}, with uv+colour+all textures ${report.items.length - bad.length}/${report.items.length}, gl error ${report.glError}`);
for (const r of bad) console.log('  BAD', JSON.stringify(r));
if (problems.length) console.log([...new Set(problems)].slice(0, 10).join('\n'));
console.log('shot', out);
await browser.close();
server.close();
process.exit(bad.length || report.glError || problems.length ? 1 : 0);
