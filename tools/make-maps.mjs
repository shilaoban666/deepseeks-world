// 把 dsh-image-gen/map 里的手绘地图缩小、转成 JPEG，放进 public/maps/v3/（大地图的"手绘图"页签用）。
//   node tools/make-maps.mjs [--src <dir>] [--out public/maps/v3] [--width 1800] [--quality 0.82] [--thumbs <dir>]
// 没有 sharp / PIL：开一个无头 Chrome，把图画到 canvas 上再 toDataURL。
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const src = resolve(flag('src', join(here, '..', 'dsh-image-gen', 'map')));
const out = resolve(here, flag('out', 'public/maps/v3'));
const maxW = Number(flag('width', 1800));
const quality = Number(flag('quality', 0.82));
const thumbs = flag('thumbs', null);

/** 源文件 → 干净的名字 */
export const MAPS = {
  'Gemini_Generated_Image_x4er0ux4er0ux4er.jpg': 'world',
  'Gemini_Generated_Image_er13kyer13kyer13.jpg': 'yuhai',
  'Gemini_Generated_Image_er13kyer13kyer13 (1).jpg': 'station-beach',
  'Gemini_Generated_Image_wpobfywpobfywpob (1).jpg': 'cbd',
  'Gemini_Generated_Image_wpobfywpobfywpob (3).jpg': 'snow',
  'Gemini_Generated_Image_wpobfywpobfywpob (4).jpg': 'pastoral',
  'Gemini_Generated_Image_wpobfywpobfywpob (5).jpg': 'lake',
  'Gemini_Generated_Image_wpobfywpobfywpob (6).jpg': 'university',
  'Gemini_Generated_Image_wpobfywpobfywpob (8).jpg': 'seaside-port',
  'Gemini_Generated_Image_wpobfywpobfywpob (9).jpg': 'newtown',
  'Gemini_Generated_Image_xweayxxweayxxwea.jpg': 'aitown',
};

const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
const shrink = (file, width, q) =>
  page.evaluate(
    async ([b64, mime, width, q]) => {
      const img = new Image();
      img.src = `data:${mime};base64,${b64}`;
      await img.decode();
      const k = Math.min(1, width / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      return { url: c.toDataURL('image/jpeg', q), w: c.width, h: c.height, sw: img.naturalWidth, sh: img.naturalHeight };
    },
    [readFileSync(file).toString('base64'), extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg', width, q],
  );

if (thumbs) {
  // 认图用：把目录里每一张都缩成小图
  mkdirSync(resolve(thumbs), { recursive: true });
  const files = readdirSync(src).filter((f) => /\.(jpe?g|png)$/i.test(f));
  for (let i = 0; i < files.length; i++) {
    const r = await shrink(join(src, files[i]), 760, 0.7);
    writeFileSync(join(resolve(thumbs), `${String(i).padStart(2, '0')}.jpg`), Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(`${String(i).padStart(2, '0')}  ${files[i]}  ${r.sw}x${r.sh}`);
  }
} else {
  mkdirSync(out, { recursive: true });
  for (const [file, name] of Object.entries(MAPS)) {
    const r = await shrink(join(src, file), maxW, quality);
    const buf = Buffer.from(r.url.split(',')[1], 'base64');
    writeFileSync(join(out, `${name}.jpg`), buf);
    console.log(`${name}.jpg  ${r.sw}x${r.sh} → ${r.w}x${r.h}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
}
await browser.close();
