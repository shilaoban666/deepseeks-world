// One-off check: which GPU drives WebGL2 in Chrome for the town, and how many fps headless.
import { chromium } from 'playwright-core';

const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = process.argv[2] || 'http://127.0.0.1:5383/town.html?quality=high';
const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu', '--enable-gpu-rasterization', '--enable-zero-copy', '--force_high_performance_gpu'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 240000 });
console.log(`ready in ${Date.now() - t0} ms`);

const info = await page.evaluate(() => {
  const gl = window.__tg.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const q = (k) => gl.getParameter(gl[k]);
  return {
    vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : q('VENDOR'),
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : q('RENDERER'),
    version: q('VERSION'),
    shadingLanguage: q('SHADING_LANGUAGE_VERSION'),
    maxTextureSize: q('MAX_TEXTURE_SIZE'),
    maxSamples: q('MAX_SAMPLES'),
    devicePixelRatio: window.devicePixelRatio,
    drawCalls: window.__tg.renderer.info.render.calls,
    triangles: window.__tg.renderer.info.render.triangles,
    textures: window.__tg.renderer.info.memory.textures,
  };
});
console.log(JSON.stringify(info, null, 2));

const fps = await page.evaluate(async () => {
  let n = 0;
  const t0 = performance.now();
  await new Promise((r) => {
    const f = () => {
      n++;
      if (performance.now() - t0 > 3000) return r();
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  return n / ((performance.now() - t0) / 1000);
});
console.log(`fps over 3s: ${fps.toFixed(1)}`);
await browser.close();
