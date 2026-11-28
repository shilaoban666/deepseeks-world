// 用 ?char=maid 打开小镇，检查 3D 女仆是否加载、骨骼动画是否在跑，并截图。
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://127.0.0.1:5383/town.html?quality=high&char=maid';
const out = process.argv[3] || 'design/previews_maid/ingame-maid.jpg';
const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: exe, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });

const t0 = Date.now();
await page.goto(base);
try {
  await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 180000 });
} catch {
  console.log('NOT READY');
  console.log(errs.slice(0, 8).join('\n'));
  await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
  await browser.close();
  process.exit(1);
}
console.log('ready in', Date.now() - t0, 'ms');

const info = await page.evaluate(() => {
  const tg = window.__tg;
  let skinned = 0, bones = 0, meshes = 0;
  tg.whale?.group?.traverse((o) => {
    if (o.isSkinnedMesh) { skinned++; bones += o.skeleton?.bones?.length ?? 0; }
    if (o.isMesh) meshes++;
  });
  const mixer = tg.whale?.mixer;
  const actions = mixer ? Object.keys(tg.whale.clips || {}) : [];
  return {
    hasWhale: !!tg.whale,
    hasMixer: !!mixer,
    skinnedMeshes: skinned,
    bones,
    meshes,
    clips: actions,
    state: tg.whale?.state ? { x: +tg.whale.state.x.toFixed(2), z: +tg.whale.state.z.toFixed(2) } : null,
  };
});
console.log(JSON.stringify(info, null, 1));

// 让角色跑一会，验证动画在推进（比较两帧的骨骼矩阵）
const moved = await page.evaluate(async () => {
  const tg = window.__tg;
  tg.whale?.group?.traverse?.((o) => { if (o.isBone) o.__p = o.quaternion.clone(); });
  tg.mover?.keys?.add?.('KeyW');
  await new Promise((r) => setTimeout(r, 1200));
  tg.mover?.keys?.delete?.('KeyW');
  let diff = 0;
  tg.whale?.group?.traverse?.((o) => {
    if (o.isBone && o.__p) diff = Math.max(diff, o.quaternion.angleTo(o.__p));
  });
  return { maxBoneDelta: +diff.toFixed(3), pos: tg.whale?.state ? [+tg.whale.state.x.toFixed(2), +tg.whale.state.z.toFixed(2)] : null };
});
console.log('after walk:', JSON.stringify(moved));

await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
await browser.close();
console.log('SHOT', out);
if (errs.length) console.log('errors:', errs.slice(0, 6));