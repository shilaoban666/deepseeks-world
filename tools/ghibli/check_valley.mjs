// 打开山谷 demo（3D 骨架人物那套），检查是否真的跑起来并截图。
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:5383/index.html';
const out = process.argv[3] || 'design/previews2/valley-demo.jpg';
const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: exe, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 240)); });
page.on('requestfailed', (r) => errs.push('REQ FAIL ' + r.url().slice(-70)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(12000);

const info = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return {
    canvas: !!c, w: c ? c.width : 0, h: c ? c.height : 0,
    webgl2: !!(c && c.getContext && (c.getContext('webgl2') || c.getContext('webgl'))),
    bodyText: (document.body.innerText || '').slice(0, 160),
    loading: (document.querySelector('#loading') || {}).className || null,
  };
});
await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
await browser.close();
console.log('CANVAS', info.w + 'x' + info.h, 'loading节点', info.loading);
console.log('页面文字', JSON.stringify(info.bodyText));
console.log('错误', errs.length, errs.slice(0, 6));
console.log('SHOT', out);