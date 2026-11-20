// 小鲸鱼的世界：量启动。 node tools/startup.mjs [query] [--gl d3d11|swiftshader|default] [--root dist] [--size 1600x900] [--frames 20]
// 报告：到 ready 的时间、各阶段（main.js 里的 performance.mark('tg:…')）、最长的主线程卡顿、JS 堆、
// 显存估算（贴图 + 渲染目标，按 texImage/texStorage/renderbufferStorage 记账）、最大贴图边长、
// WebGL 上下文丢失、shader 报错/警告，以及 ready 之后的每帧毫秒数。
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
const query = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? '';
const root = resolve(here, flag('root', 'dist'));
const gl = flag('gl', 'd3d11');
const [width, height] = flag('size', '1600x900').split('x').map(Number);
const frames = Number(flag('frames', 20));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const glArgs = {
  d3d11: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'],
  // 软件光栅：最弱的"显卡"，用来看启动会不会在哪一步死掉
  swiftshader: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  default: [],
}[gl];
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--mute-audio', '--enable-precise-memory-info', ...glArgs] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

// 进页面之前：给 WebGL2 记账（贴图/渲染缓冲的字节数、最大边长），记上下文丢失和长任务
await page.addInitScript(() => {
  const acct = (window.__acct = { tex: new Map(), rb: new Map(), maxSide: 0, lost: 0, restored: 0, longTasks: [], big: [] });
  const BPP = { 0x8058: 4, 0x8c43: 4, 0x8051: 3, 0x8c41: 3, 0x881a: 8, 0x8814: 16, 0x822d: 2, 0x822e: 4, 0x8229: 1, 0x822b: 2, 0x822f: 4, 0x8230: 8, 0x81a5: 2, 0x81a6: 4, 0x88f0: 4, 0x8cac: 4, 0x8cad: 8, 0x1908: 4, 0x1907: 3, 0x1903: 1, 0x8c3a: 4, 0x8d62: 2 };
  const P = WebGL2RenderingContext.prototype;
  const bound = new WeakMap(); // gl → { target: texture }
  const cur = (gl, target) => {
    const t = target >= 0x8515 && target <= 0x851a ? 0x8513 : target;
    return bound.get(gl)?.[t];
  };
  const wrap = (name, fn) => {
    const orig = P[name];
    P[name] = function (...a) {
      try {
        fn(this, a);
      } catch {}
      return orig.apply(this, a);
    };
  };
  wrap('bindTexture', (gl, [target, tex]) => {
    if (!bound.has(gl)) bound.set(gl, {});
    bound.get(gl)[target] = tex;
  });
  const note = (gl, target, level, internal, w, h, d = 1, levels = 1) => {
    const tex = cur(gl, target);
    if (!tex || level > 0) return;
    const faces = target >= 0x8513 && target <= 0x851a ? 6 : 1;
    const rec = acct.tex.get(tex) ?? { w: 0, h: 0, d: 1, bytes: 0, faces, mips: levels > 1 };
    rec.w = w;
    rec.h = h;
    rec.d = d;
    rec.internal = internal;
    rec.bytes = w * h * d * (BPP[internal] ?? 4) * faces;
    if (levels > 1) rec.mips = true;
    acct.tex.set(tex, rec);
    acct.maxSide = Math.max(acct.maxSide, w, h);
  };
  wrap('texImage2D', (gl, a) => {
    // (target, level, internal, w, h, border, format, type, pixels) 或 (target, level, internal, format, type, source)
    if (a.length >= 9) note(gl, a[0], a[1], a[2], a[3], a[4]);
    else {
      const s = a[5];
      note(gl, a[0], a[1], a[2], s?.naturalWidth ?? s?.videoWidth ?? s?.width ?? 0, s?.naturalHeight ?? s?.videoHeight ?? s?.height ?? 0);
    }
  });
  wrap('texStorage2D', (gl, [target, levels, internal, w, h]) => note(gl, target, 0, internal, w, h, 1, levels));
  wrap('texStorage3D', (gl, [target, levels, internal, w, h, d]) => note(gl, target, 0, internal, w, h, d, levels));
  wrap('texImage3D', (gl, a) => note(gl, a[0], a[1], a[2], a[3], a[4], a[5]));
  wrap('generateMipmap', (gl, [target]) => {
    const rec = acct.tex.get(cur(gl, target));
    if (rec) rec.mips = true;
  });
  wrap('deleteTexture', (gl, [tex]) => acct.tex.delete(tex));
  const rbBound = new WeakMap();
  wrap('bindRenderbuffer', (gl, [, rb]) => rbBound.set(gl, rb));
  wrap('renderbufferStorage', (gl, [, internal, w, h]) => acct.rb.set(rbBound.get(gl), w * h * (BPP[internal] ?? 4)));
  wrap('renderbufferStorageMultisample', (gl, [, samples, internal, w, h]) => acct.rb.set(rbBound.get(gl), w * h * (BPP[internal] ?? 4) * Math.max(1, samples)));
  wrap('deleteRenderbuffer', (gl, [rb]) => acct.rb.delete(rb));
  document.addEventListener('webglcontextlost', () => acct.lost++, true);
  document.addEventListener('webglcontextrestored', () => acct.restored++, true);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) acct.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ entryTypes: ['longtask'] });
  } catch {}
  window.__acctSummary = () => {
    let tex = 0;
    const list = [];
    for (const r of acct.tex.values()) {
      const b = r.bytes * (r.mips ? 4 / 3 : 1);
      tex += b;
      list.push([Math.round(b / 1048576), `${r.w}x${r.h}${r.d > 1 ? 'x' + r.d : ''}${r.faces > 1 ? ' cube' : ''} 0x${(r.internal ?? 0).toString(16)}`]);
    }
    let rb = 0;
    for (const b of acct.rb.values()) rb += b;
    list.sort((a, b) => b[0] - a[0]);
    return { textures: acct.tex.size, textureMB: +(tex / 1048576).toFixed(1), renderbufferMB: +(rb / 1048576).toFixed(1), maxSide: acct.maxSide, biggest: list.slice(0, 12).map(([mb, s]) => `${mb}MB ${s}`), lost: acct.lost, restored: acct.restored };
  };
});

const problems = [];
const logs = [];
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${t.slice(0, 600)}`);
  else if (/画质|quality|显卡|GPU/i.test(t)) logs.push(t.slice(0, 300));
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}\n${e.stack?.slice(0, 600)}`));
page.on('crash', () => problems.push('PAGE CRASHED'));

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${server.address().port}/town.html?${query}`);
let ready = true;
try {
  await page.waitForFunction(() => window.__tg?.ready, null, { timeout: Number(flag('timeout', 420000)) });
} catch {
  ready = false;
}
const readyMs = Date.now() - t0;
const report = await page
  .evaluate((frames) => {
    const tg = window.__tg;
    const out = {};
    const marks = performance.getEntriesByType('mark').filter((m) => m.name.startsWith('tg:'));
    out.phases = {};
    for (let i = 0; i < marks.length; i++) out.phases[`${marks[i].name.slice(3)}@${Math.round(marks[i].startTime)}`] = Math.round((marks[i + 1]?.startTime ?? performance.now()) - marks[i].startTime);
    out.timings = window.__timings ?? null;
    out.lastPhase = marks.at(-1)?.name;
    out.loadingText = document.getElementById('loading-text')?.textContent ?? '(加载层已撤)';
    const lt = window.__acct.longTasks;
    out.longTasks = { count: lt.length, totalMs: lt.reduce((n, t) => n + t[1], 0), worst: [...lt].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([at, d]) => `${d}ms@${at}`) };
    out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
    out.gpu = window.__acctSummary();
    const c = document.createElement('canvas').getContext('webgl2');
    if (c) {
      const ext = c.getExtension('WEBGL_debug_renderer_info');
      out.renderer = ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER);
      out.limits = { maxTexture: c.getParameter(c.MAX_TEXTURE_SIZE), maxCube: c.getParameter(c.MAX_CUBE_MAP_TEXTURE_SIZE), units: c.getParameter(c.MAX_TEXTURE_IMAGE_UNITS), vertexUnits: c.getParameter(c.MAX_VERTEX_TEXTURE_IMAGE_UNITS), varyings: c.getParameter(c.MAX_VARYING_VECTORS), samples: c.getParameter(c.MAX_SAMPLES), floatRT: !!c.getExtension('EXT_color_buffer_float'), halfFloatRT: !!c.getExtension('EXT_color_buffer_half_float'), floatLinear: !!c.getExtension('OES_texture_float_linear'), parallelCompile: !!c.getExtension('KHR_parallel_shader_compile') };
    } else out.renderer = 'no webgl2';
    if (!tg?.ready) return out;
    out.quality = tg.quality ?? null;
    out.memory = { ...tg.renderer.info.memory, programs: tg.renderer.info.programs?.length };
    out.pixelRatio = tg.renderer.getPixelRatio();
    // 每帧：整帧的 draw call 和三角（后期链每一遍都会清零，所以关掉自动清零，自己清）
    const gl = tg.renderer.getContext();
    const px = new Uint8Array(4);
    const sync = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    };
    tg.renderer.setAnimationLoop(null); // 只由这里推帧（也免得动态分辨率中途改倍率）
    for (let i = 0; i < 4; i++) tg.tick(1 / 30);
    sync();
    const info = tg.renderer.info;
    info.autoReset = false;
    info.reset();
    tg.tick(1 / 60);
    out.frame = { calls: info.render.calls, triangles: info.render.triangles };
    info.autoReset = true;
    const a = performance.now();
    for (let i = 0; i < frames; i++) {
      tg.tick(1 / 60);
      sync();
    }
    out.msPerFrame = +((performance.now() - a) / frames).toFixed(1);
    return out;
  }, frames)
  .catch((e) => ({ error: String(e) }));
if (args.includes('--brief')) {
  // 一屏看完的摘要
  const r = report;
  console.log(`[${query || '(auto)'} | ${gl}] ready=${ready} ${readyMs}ms  quality=${r.quality}  dpr=${r.pixelRatio}  ${r.msPerFrame}ms/frame  calls=${r.frame?.calls} tris=${r.frame?.triangles}`);
  console.log(`  tex=${r.gpu?.textureMB}MB (${r.gpu?.textures}) rb=${r.gpu?.renderbufferMB}MB maxSide=${r.gpu?.maxSide} heap=${r.heapMB}MB lost=${r.gpu?.lost} longTasks=${r.longTasks?.count}/${r.longTasks?.totalMs}ms worst=${r.longTasks?.worst?.slice(0, 4).join(',')}`);
  console.log('  phases ' + Object.entries(r.phases ?? {}).filter(([, v]) => v >= 40).map(([k, v]) => `${k}:${v}`).join(' '));
  if (r.timings) console.log('  timings ' + Object.entries(r.timings).map(([k, v]) => `${k}:${v}`).join(' '));
  if (!ready) console.log(`  stuck at ${r.lastPhase} — "${r.loadingText}"`);
} else console.log(JSON.stringify({ query, gl, size: `${width}x${height}`, ready, readyMs, ...report }, null, 1));
if (logs.length) console.log(logs.join('\n'));
if (problems.length) console.log('--- problems ---\n' + [...new Set(problems)].slice(0, 20).join('\n'));
await browser.close();
server.close();
