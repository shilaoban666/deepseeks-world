// 小鲸鱼的世界：逐项关掉，看每一项花多少毫秒。
//   node tools/town-perf.mjs "quality=high&at=40,-76" [--gl d3d11|swiftshader] [--frames 12] [--root dist] [--size 1600x900]
// 每一项：关掉它之后整帧省下的毫秒数（GPU 同步过的），以及它自己的 draw call / 三角数。
// 另外量：纯 CPU（tick 里 JS 自己花的）、后期链（笔触、泛光、云的逐帧重画）、各分辨率倍率下的帧时间。
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { guard } from './no-pointer-lock.mjs';
guard(chromium);
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const query = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? 'lite=1';
const root = resolve(here, flag('root', 'dist'));
const [width, height] = flag('size', '1600x900').split('x').map(Number);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// （dyn=0：量的时候不要让动态分辨率自己改倍率）
const url = `http://127.0.0.1:${server.address().port}/town.html?dyn=0&${query}`;
const glArgs = flag('gl', 'd3d11') === 'swiftshader' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'];
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--mute-audio', ...glArgs] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 600000 });
const out = await page.evaluate(async (N) => {
  const tg = window.__tg;
  tg.renderer.setAnimationLoop(null); // 只由这里来推帧
  tg.setClock(10.5);
  const q = new URLSearchParams(location.search);
  const at = q.get('at')?.split(',').map(Number) ?? [96, 44];
  tg.whale.state.x = at[0];
  tg.whale.state.z = at[1];
  tg.cam.yaw = (Number(q.get('yaw') ?? 235) * Math.PI) / 180;
  tg.cam.pitch = 0.2;
  const gl = tg.renderer.getContext();
  const info = tg.renderer.info;
  const px = new Uint8Array(4);
  const sync = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  /** 整帧毫秒数（每帧都等显卡画完） */
  const time = (n = N) => {
    for (let i = 0; i < 4; i++) tg.tick(1 / 30);
    sync();
    const a = performance.now();
    for (let i = 0; i < n; i++) {
      tg.tick(1 / 60);
      sync();
    }
    return +((performance.now() - a) / n).toFixed(1);
  };
  /** 一整帧的 draw call 和三角（后期链每一遍都会把计数清零，所以自己管清零） */
  const count = () => {
    info.autoReset = false;
    info.reset();
    tg.tick(1 / 60);
    const r = { calls: info.render.calls, tris: info.render.triangles };
    info.autoReset = true;
    return r;
  };
  for (let i = 0; i < 20; i++) tg.tick(1 / 30);
  const res = {};
  res.gpu = (() => {
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?';
  })();
  res.quality = tg.quality;
  res.pixelRatio = tg.renderer.getPixelRatio();
  const all = time();
  const base = count();
  res.all = { ms: all, ...base };
  // 纯 CPU：tick 里 JS 自己花的时间（不等显卡）
  {
    sync();
    const a = performance.now();
    for (let i = 0; i < N; i++) tg.tick(1 / 60);
    res.cpuMs = +((performance.now() - a) / N).toFixed(1);
    sync();
  }

  // ---- 分组：场景里每一个可画的东西归到一类 ----
  const inside = (o, root) => {
    for (let p = o; p; p = p.parent) if (p === root) return true;
    return false;
  };
  const groups = {};
  const put = (name, o) => (groups[name] ??= []).push(o);
  const f = tg.field;
  tg.scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    if (inside(o, f.blades.group)) return put(`grass ${f.blades.rings.find((r) => r.tiles.some((t) => t.mesh === o))?.ring.name}`, o);
    if (o === f.ground.mesh) return put('ground', o);
    if (f.flowers && inside(o, f.flowers.group)) return put('field flowers', o);
    if (inside(o, f.group)) return put('field other', o);
    if (inside(o, tg.city.woods.group)) return put(o.isInstancedMesh || o.geometry?.isInstancedBufferGeometry ? 'trees (instanced)' : 'trees (other)', o);
    if (tg.sky && o === tg.sky.mesh) return put('sky', o);
    if (inside(o, tg.city.group)) {
      if (o.userData.ink) return put('city ink shells', o);
      if (o.material?.uniforms?.tAtlas) return put('city billboards', o);
      if (o.isInstancedMesh) return put('city instanced', o);
      if (o.geometry?.isInstancedBufferGeometry) return put('city instanced-geo', o);
      return put('city merged/other', o);
    }
    if (tg.glow && inside(o, tg.glow.group)) return put('glow', o);
    if (tg.weather && inside(o, tg.weather.group)) return put('weather', o);
    if (tg.particles && o === tg.particles.mesh) return put('particles', o);
    if (tg.life && o === tg.life.mesh) return put('life', o);
    if (inside(o, tg.whale.group)) return put('whale', o);
    return put('other', o);
  });
  res.groups = {};
  for (const [name, list] of Object.entries(groups)) {
    const was = list.map((o) => o.visible);
    for (const o of list) o.visible = false;
    const ms = time();
    const c = count();
    list.forEach((o, i) => (o.visible = was[i]));
    res.groups[name] = { meshes: list.length, calls: base.calls - c.calls, tris: base.tris - c.tris, savesMs: +(all - ms).toFixed(1) };
  }
  // 整组关（和以前的输出对得上）
  const off = (name, obj) => {
    obj.visible = false;
    res.groups[`[${name}]`] = { savesMs: +(all - time()).toFixed(1) };
    obj.visible = true;
  };
  off('all trees', tg.city.woods.group);
  off('all city', tg.city.group);
  off('all grass+ground', tg.field.group);

  // ---- 后期链 ----
  res.post = {};
  const p = tg.frame.paint;
  tg.setPaint(0);
  res.post['paint off'] = +(all - time()).toFixed(1);
  tg.setPaint(1);
  res.post['paint 1'] = +(all - time()).toFixed(1);
  tg.setPaint(p);
  if (tg.sky?.clouds) {
    const upd = tg.sky.clouds.update;
    tg.sky.clouds.update = () => {};
    res.post['live clouds off'] = +(all - time()).toFixed(1);
    tg.sky.clouds.update = upd;
  }
  {
    // 场景一个都不画：剩下的就是后期链 + CPU
    const was = tg.scene.children.map((o) => o.visible);
    for (const o of tg.scene.children) o.visible = false;
    res.post['empty scene (post chain + cpu)'] = time();
    tg.scene.children.forEach((o, i) => (o.visible = was[i]));
  }
  // ---- 分辨率倍率 ----
  res.scale = {};
  const r0 = tg.renderer.getPixelRatio();
  for (const k of [1, 0.75, 0.5]) {
    tg.renderer.setPixelRatio(r0 * k);
    tg.renderer.setSize(window.innerWidth, window.innerHeight);
    res.scale[`x${k}`] = time();
  }
  tg.renderer.setPixelRatio(r0);
  tg.renderer.setSize(window.innerWidth, window.innerHeight);
  res.allAgain = time();
  return res;
}, Number(flag('frames', 12)));
const pad = (s, n) => String(s).padEnd(n);
console.log(`${query}  ${width}x${height}  dpr ${out.pixelRatio}  quality ${out.quality}\n${out.gpu}`);
console.log(`all: ${out.all.ms} ms/frame (again ${out.allAgain})   cpu ${out.cpuMs} ms   calls ${out.all.calls}   tris ${out.all.tris}`);
console.log(pad('group', 28) + pad('meshes', 8) + pad('calls', 8) + pad('tris', 11) + 'saves ms');
for (const [name, g] of Object.entries(out.groups).sort((a, b) => b[1].savesMs - a[1].savesMs)) console.log(pad(name, 28) + pad(g.meshes ?? '', 8) + pad(g.calls ?? '', 8) + pad(g.tris ?? '', 11) + g.savesMs);
console.log('post:', JSON.stringify(out.post));
console.log('scale:', JSON.stringify(out.scale));
await browser.close();
server.close();
