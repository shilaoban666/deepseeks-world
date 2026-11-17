// 从 dsh-pet 的透明 webm 里抽帧，拼成精灵图集（给立牌主角用）。只读素材目录。
//   node tools/pet-frames.mjs <clips 目录> <输出目录> preview 片名...        每段抽 8 帧拼一张预览
//   node tools/pet-frames.mjs <clips 目录> <输出目录> atlas 名字=片名:起秒:止秒:帧数 ...
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const [clipsDir, outDir, mode, ...rest] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1));
  if (name === '') return void res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><body></body>');
  const file = join(resolve(clipsDir), name);
  if (!existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'none' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);

/** 抽帧：返回 { w, h, duration, frames: [dataURL...] }，每帧裁到 crop 并缩到 size */
const grab = (clip, t0, t1, n, crop, size) =>
  page.evaluate(
    async ([clip, t0, t1, n, crop, size]) => {
      const v = document.createElement('video');
      v.muted = true;
      v.src = `/${encodeURIComponent(clip)}.webm`;
      await new Promise((ok, no) => {
        v.onloadeddata = ok;
        v.onerror = () => no(new Error('load ' + clip));
      });
      const dur = v.duration;
      const end = t1 > 0 ? Math.min(t1, dur) : dur;
      const [cx, cy, cw, ch] = crop ?? [0, 0, v.videoWidth, v.videoHeight];
      const c = document.createElement('canvas');
      c.width = size?.[0] ?? cw;
      c.height = size?.[1] ?? ch;
      const g = c.getContext('2d');
      const frames = [];
      for (let i = 0; i < n; i++) {
        const t = t0 + ((end - t0) * i) / n;
        v.currentTime = Math.min(dur - 0.02, t);
        await new Promise((ok) => (v.onseeked = ok));
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(v, cx, cy, cw, ch, 0, 0, c.width, c.height);
        // 素材背景里有 1/255 的残留透明度，扣掉
        const img = g.getImageData(0, 0, c.width, c.height);
        for (let k = 3; k < img.data.length; k += 4) if (img.data[k] < 12) img.data[k] = 0;
        g.putImageData(img, 0, 0);
        frames.push(c.toDataURL('image/png'));
      }
      return { w: v.videoWidth, h: v.videoHeight, duration: dur, frames };
    },
    [clip, t0, t1, n, crop, size],
  );

const sheet = (frames, cols, w, h, bg) =>
  page.evaluate(
    async ([frames, cols, w, h, bg]) => {
      const rows = Math.ceil(frames.length / cols);
      const c = document.createElement('canvas');
      c.width = cols * w;
      c.height = rows * h;
      const g = c.getContext('2d');
      if (bg) {
        g.fillStyle = bg;
        g.fillRect(0, 0, c.width, c.height);
      }
      for (let i = 0; i < frames.length; i++) {
        const im = new Image();
        im.src = frames[i];
        await im.decode();
        g.drawImage(im, (i % cols) * w, Math.floor(i / cols) * h, w, h);
      }
      return c.toDataURL('image/png');
    },
    [frames, cols, w, h, bg],
  );
const save = (file, dataUrl) => writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

if (mode === 'preview') {
  for (const clip of rest) {
    const r = await grab(clip, 0, 0, 8, null, [320, 180]);
    save(join(outDir, `${clip}.png`), await sheet(r.frames, 4, 320, 180, '#7a8a9a'));
    console.log(clip, `${r.w}x${r.h}`, `${r.duration.toFixed(2)}s`);
  }
} else {
  const manifest = {};
  for (const spec of rest) {
    const [name, def] = spec.split('=');
    const [clip, t0, t1, n, crop, cell] = def.split(':');
    const cr = crop ? crop.split(',').map(Number) : null;
    const size = cell ? cell.split('x').map(Number) : [256, 256];
    const r = await grab(clip, Number(t0), Number(t1), Number(n), cr, size);
    const cols = Math.min(Number(n), Math.floor(2048 / size[0]));
    save(join(outDir, `${name}.png`), await sheet(r.frames, cols, size[0], size[1], null));
    manifest[name] = { file: `${name}.png`, frames: Number(n), cols, rows: Math.ceil(Number(n) / cols), cell: size, seconds: (Number(t1) > 0 ? Math.min(Number(t1), r.duration) : r.duration) - Number(t0), clip };
    console.log(name, manifest[name]);
  }
  writeFileSync(join(outDir, 'clips.json'), JSON.stringify(manifest, null, 1));
}
await browser.close();
server.close();
