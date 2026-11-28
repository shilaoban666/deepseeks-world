import { chromium } from 'playwright-core';
const urls = [
  ['maid', 'http://127.0.0.1:5383/town.html?quality=high&char=maid'],
  ['billboard', 'http://127.0.0.1:5383/town.html?quality=high'],
];
const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
for (const [tag, url] of urls) {
  const browser = await chromium.launch({ executablePath: exe, headless: true,
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(url);
  await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  const res = await page.evaluate(() => {
    const tg = window.__tg;
    const gp = tg.whale.group.position;
    const v = gp.clone();
    v.y = gp.y + 0.9;
    v.project(tg.camera);
    const cvs = tg.renderer.domElement;
    const x = Math.round((v.x * 0.5 + 0.5) * cvs.width);
    const y = Math.round((-v.y * 0.5 + 0.5) * cvs.height);
    const c2 = document.createElement('canvas');
    c2.width = cvs.width; c2.height = cvs.height;
    const ctx = c2.getContext('2d');
    ctx.drawImage(cvs, 0, 0);
    const r = 42;
    const sx = Math.max(0, Math.min(cvs.width - 1, x)) - r;
    const sy = Math.max(0, Math.min(cvs.height - 1, y)) - r;
    const data = ctx.getImageData(Math.max(0, sx), Math.max(0, sy), r * 2, r * 2).data;
    let n = 0, R = 0, G = 0, B = 0, dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      R += data[i]; G += data[i + 1]; B += data[i + 2]; n++;
      if (data[i] + data[i + 1] + data[i + 2] < 45) dark++;
    }
    let lights = 0;
    tg.scene?.traverse?.((o) => { if (o.isLight) lights++; });
    return { screen: [x, y], mean: [Math.round(R / n), Math.round(G / n), Math.round(B / n)],
             darkRatio: +(dark / n).toFixed(3), lights,
             isModel: !!(tg.whale.mixer) };
  });
  console.log(tag, JSON.stringify(res), errs.slice(0, 2).join(' | '));
  await page.screenshot({ path: `design/previews_maid/ingame-${tag}.jpg`, type: 'jpeg', quality: 90 });
  await browser.close();
}
