// 和原作并排比：原作（painted-valley 的 dist）和小镇各开一页，什么都不拨——就是玩家点开时看到的样子——
// 截图，并把决定"远处是什么颜色"的那几个量读出来：雾、天光、曝光、天气、钟点。
//   node tools/compare-original.mjs --original <原作的 dist 目录> [--out shots/compare] [--town "quality=high"]
// 远处发白、发灰、发蓝，原因都在这几个数里；先量，再改。
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { guard } from './no-pointer-lock.mjs';

guard(chromium);
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const out = resolve(here, flag('out', 'shots/compare'));
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ogg': 'audio/ogg' };
const serve = (root) =>
  new Promise((done) => {
    const server = createServer((req, res) => {
      let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => done(server));
  });

const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'] });

/** 决定远处颜色的量。 */
const READ = () => {
  const tg = window.__tg;
  const u = tg.field.uniforms;
  const su = tg.sky?.uniforms ?? {};
  const c = (v) => (v ? [v.r ?? v.x, v.g ?? v.y, v.b ?? v.z].map((x) => +x.toFixed(3)) : null);
  return {
    fogDensity: +u.uFogDensity.value.toExponential(3),
    fogColor: c(u.uFogColor.value),
    fogSun: c(u.uFogSunColor.value),
    sun: c(u.uSunColor.value),
    skyLight: c(u.uSkyColor.value),
    sunDir: c(u.uSunDir.value),
    horizon: c(su.uHorizon?.value),
    mid: c(su.uMid?.value),
    zenith: c(su.uZenith?.value),
    exposure: +tg.frame.exposure.toFixed(3),
    grade: tg.frame.grade ? c(tg.frame.grade) : null,
    bloom: tg.frame.bloom,
    paint: tg.frame.paint,
    skyHour: tg.sky?.hour,
    weather: tg.weather?.info ?? null,
    clock: tg.game ? +((tg.game.state.minutes / 60) % 24).toFixed(2) : null,
    cameraFar: tg.camera.far,
  };
};

async function look(name, root, query, setups) {
  const server = await serve(root);
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/${query}`);
  await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  const result = {};
  for (const [shot, setup] of Object.entries(setups)) {
    if (setup) await page.evaluate(setup);
    await page.waitForTimeout(1500);
    result[shot] = await page.evaluate(READ);
    await page.screenshot({ path: join(out, `${name}-${shot}.png`) });
  }
  if (problems.length) console.log(name, 'problems:', problems.slice(0, 3).join(' | '));
  await page.close();
  server.close();
  return result;
}

const original = flag('original', null);
const report = {};
if (original) report.original = await look('original', resolve(original), '?dpr=1', { start: null });
report.town = await look('town', resolve(here, 'dist'), `town.html?dpr=1&${flag('town', 'quality=high')}`, {
  // 点开时的样子：钟点、天气都不动
  start: null,
  // 同一个钟点（原作开局是 15:30 的光），晴天
  sameHour: `(() => { const tg = window.__tg; tg.weather.set('clear', { immediate: true }); tg.setClock(15.5); for (let i = 0; i < 40; i++) tg.tick(1 / 30); })()`,
});
for (const [k, shots] of Object.entries(report)) for (const [s, v] of Object.entries(shots)) console.log(`\n== ${k} / ${s}\n${JSON.stringify(v)}`);
await browser.close();
