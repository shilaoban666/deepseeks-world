// 相机：V 拿起相机取景，空格按快门。拍下来的是一张 4K 的画——和游戏里同一套光、笔触、墨线，只是在一张
// 3840×2160 的画布上重画一遍（不是把屏幕放大），所以草叶、瓦片、她的墨线都是清楚的。拍好的存进相册
// （浏览器的 IndexedDB），也可以直接存成电脑里的 PNG / JPG。
//
// 取景框和成片对得上：框的长宽比就是照片的长宽比，屏幕上的视角按框的大小算，按下快门时照片用同一个视角。
// 焦距按 35mm 全画幅的对角线折算（24mm 广角、50mm 标准、85mm 人像、200mm 长焦）。
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

/** 滤镜：屏幕上用 CSS filter 预览，冲洗时用同一个字符串画进照片（canvas 2D 的 filter），两边一样 */
export const FILTERS = [
  { id: 'none', name: '原画', css: 'none' },
  { id: 'warm', name: '暖阳', css: 'sepia(0.16) saturate(1.12) brightness(1.04) hue-rotate(-5deg)' },
  { id: 'morning', name: '清晨', css: 'saturate(0.88) brightness(1.07) contrast(0.93) hue-rotate(6deg)' },
  { id: 'film', name: '胶片', css: 'contrast(1.05) saturate(0.84) sepia(0.14) brightness(1.02)', grain: true },
  { id: 'dusk', name: '黄昏', css: 'sepia(0.32) saturate(1.28) hue-rotate(-12deg) contrast(1.04) brightness(0.98)' },
  { id: 'ink', name: '墨白', css: 'grayscale(1) sepia(0.16) contrast(1.1) brightness(1.04)' },
];
/** 画幅：4K 档的像素；2K、1080p 按比例缩 */
export const ASPECTS = [
  { id: '16:9', a: 16 / 9, size: [3840, 2160] },
  { id: '3:2', a: 3 / 2, size: [3840, 2560] },
  { id: '1:1', a: 1, size: [2880, 2880] },
  { id: '9:16', a: 9 / 16, size: [2160, 3840], name: '竖幅' },
];
export const RES = [
  { id: '4K', k: 1 },
  { id: '2K', k: 2 / 3 },
  { id: '1080p', k: 0.5 },
];
const MODES = [
  ['follow', '跟拍'],
  ['selfie', '自拍'],
  ['eye', '她的眼睛'],
];
const FOCAL_MIN = 14;
const FOCAL_MAX = 200;
// 取景框四周留给按钮的边（上下一样多：框必须在屏幕正中，不然和照片的视角对不上）
const INSET_Y = 96;
const INSET_X = 24;

// ---- 相册：IndexedDB 里一张一条（原图 blob + 小图 blob + 拍摄信息）。打不开（隐私模式）就只放在内存里 ----
function createStore() {
  let db = null;
  const ready = new Promise((resolve) => {
    try {
      const r = indexedDB.open('whale-album', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
      r.onsuccess = () => {
        db = r.result;
        resolve();
      };
      r.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  const run = (mode, fn) =>
    ready.then(
      () =>
        new Promise((resolve, reject) => {
          if (!db) return resolve(null);
          const t = db.transaction('photos', mode);
          const req = fn(t.objectStore('photos'));
          t.oncomplete = () => resolve(req?.result ?? null);
          t.onerror = () => reject(t.error);
        }),
    );
  return {
    all: () => run('readonly', (s) => s.getAll()).then((r) => r ?? []),
    put: (rec) => run('readwrite', (s) => s.put(rec)),
    remove: (id) => run('readwrite', (s) => s.delete(id)),
  };
}

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const mb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
const hourText = (h) => `${pad(Math.floor(h) % 24)}:${pad(Math.round((h % 1) * 60) % 60)}`;
const blobOf = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

/** 胶片颗粒：一小块噪点，平铺着叠上去 */
let grainTile = null;
const grain = () => {
  if (grainTile) return grainTile;
  grainTile = document.createElement('canvas');
  grainTile.width = grainTile.height = 256;
  const g = grainTile.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 120;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return grainTile;
};

/**
 * @param o.renderer, o.frame, o.camera, o.cam 渲染和镜头
 * @param o.whale 主角（眼睛机位要藏起她、自拍要转到她前面）
 * @param o.scene() 现在画的是哪个场景（屋里 / 屋外）
 * @param o.info() 拍摄信息：{ place, clock, weather, underwater }
 * @param o.light { get(), frozen(), set(h|null) } 天光的时刻（取景时停住，可以拨）
 * @param o.mover 走路的按键（空格在相机里是快门，不能让她跳）
 */
export function createPhoto({ renderer, frame, camera, cam, whale, canvas, hud, scene, info, light, mover }) {
  const store = createStore();
  const ui = {
    root: $('camera'),
    rect: $('vf-rect'),
    top: $('vf-top'),
    bottom: $('vf-bottom'),
    flash: $('vf-flash'),
    grain: $('vf-grain'),
    album: $('album'),
  };
  const prefs = { aspect: '16:9', res: '4K', format: 'png', filter: 'none', grid: true, stamp: false, auto: true };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem('whale-camera') ?? '{}'));
  } catch {}
  const savePrefs = () => {
    try {
      localStorage.setItem('whale-camera', JSON.stringify(prefs));
    } catch {}
  };

  let on = false;
  let mode = 'follow';
  let focal = 24;
  let roll = 0;
  let hidePlayer = false;
  let busy = false;
  let saved = null; // 拿起相机前的镜头设置，放下时还回去
  let photos = [];
  let lastThumb = '';
  const urls = new Map(); // id → 小图的 object URL

  const aspect = () => ASPECTS.find((a) => a.id === prefs.aspect) ?? ASPECTS[0];
  const filter = () => FILTERS.find((f) => f.id === prefs.filter) ?? FILTERS[0];
  /** 照片的像素 */
  const pixels = () => {
    const k = (RES.find((r) => r.id === prefs.res) ?? RES[0]).k;
    const [w, h] = aspect().size;
    return [Math.round((w * k) / 2) * 2, Math.round((h * k) / 2) * 2];
  };
  /** 取景框在屏幕上的位置（CSS 像素，居中） */
  const frameRect = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const a = aspect().a;
    let h = H - INSET_Y * 2;
    let w = h * a;
    if (w > W - INSET_X * 2) {
      w = W - INSET_X * 2;
      h = w / a;
    }
    return { x: (W - w) / 2, y: (H - h) / 2, w, h, W, H };
  };
  /** 照片的竖直半视角的 tan：焦距按 35mm 对角线（43.27mm）折算 */
  const tanPhoto = () => {
    const a = aspect().a;
    return 21.63 / focal / Math.sqrt(1 + a * a);
  };

  // ---- 取景：每帧在 cam.update 之后调 ----------------------------------------------------------------------
  const eyeAt = new THREE.Vector3();
  const look = new THREE.Vector3();
  const apply = () => {
    if (!on) return;
    if (mode === 'eye') {
      // 她眼睛的高度，往前一点（别看见自己的刘海）
      const s = whale.state;
      const cp = Math.cos(cam.pitch);
      const dx = -Math.sin(cam.yaw) * cp;
      const dz = -Math.cos(cam.yaw) * cp;
      const dy = -Math.sin(cam.pitch);
      eyeAt.set(s.x + dx * 0.25, s.y + 1.42, s.z + dz * 0.25);
      camera.position.copy(eyeAt);
      camera.lookAt(look.set(eyeAt.x + dx, eyeAt.y + dy, eyeAt.z + dz));
    }
    whale.group.visible = !(hidePlayer || mode === 'eye');
    const r = frameRect();
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((tanPhoto() * r.H) / r.h));
    camera.updateProjectionMatrix();
    if (roll) camera.rotateZ(roll);
  };

  // ---- 界面 --------------------------------------------------------------------------------------------------
  const chip = (key, label, cur, title = '') => `<button class="vf-chip${cur ? ' on' : ''}" data-k="${key}" title="${title}">${label}</button>`;
  const draw = () => {
    if (!on) return;
    const r = frameRect();
    Object.assign(ui.rect.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    ui.rect.classList.toggle('grid', prefs.grid);
    const [pw, ph] = pixels();
    const f = filter();
    canvas.style.filter = f.css === 'none' ? '' : f.css;
    ui.grain.classList.toggle('on', !!f.grain);
    $('vf-read').innerHTML = `<b>${Math.round(focal)} mm</b>${roll ? ` · 歪 ${Math.round(THREE.MathUtils.radToDeg(roll))}°` : ''}`;
    $('vf-size').textContent = `${pw}×${ph} · ${prefs.format.toUpperCase()}`;
    $('vf-date').classList.toggle('on', prefs.stamp);
    $('vf-date').textContent = dateStamp(new Date());
    ui.top.innerHTML =
      `<b class="vf-title">相机</b>` +
      `<div class="vf-group">${MODES.map(([k, n]) => chip(`mode:${k}`, n, mode === k)).join('')}</div>` +
      `<div class="vf-group">${ASPECTS.map((a) => chip(`aspect:${a.id}`, a.name ?? a.id, prefs.aspect === a.id)).join('')}</div>` +
      `<div class="vf-group">${RES.map((x) => chip(`res:${x.id}`, x.id, prefs.res === x.id)).join('')}</div>` +
      `<div class="vf-group">${chip('format', prefs.format === 'png' ? 'PNG 无损' : 'JPG', false, '换格式')}${chip('grid', '九宫格', prefs.grid)}${chip('stamp', '日期', prefs.stamp)}${chip('hide', '藏起主角', hidePlayer || mode === 'eye')}${chip('auto', '自动存到电脑', prefs.auto)}</div>` +
      `<button class="vf-x" data-k="exit" title="放下相机（V / Esc）">✕</button>`;
    const h = light.get();
    const last = photos[photos.length - 1];
    const thumb = last ? urls.get(last.id) : '';
    ui.bottom.innerHTML =
      `<div class="vf-left">` +
      `<label class="vf-slider"><span>焦距</span><input id="vf-focal" type="range" min="0" max="1000" value="${Math.round((Math.log(focal / FOCAL_MIN) / Math.log(FOCAL_MAX / FOCAL_MIN)) * 1000)}"><i>${Math.round(focal)}mm</i></label>` +
      `<label class="vf-slider"><span>光线</span><input id="vf-light" type="range" min="5" max="21.5" step="0.25" value="${h}"><i>${hourText(h)}</i></label>` +
      `</div>` +
      `<div class="vf-filters">${FILTERS.map((x, i) => `<button class="vf-filter${prefs.filter === x.id ? ' on' : ''}" data-k="filter:${x.id}"><kbd>${i + 1}</kbd>${x.name}</button>`).join('')}</div>` +
      `<button class="vf-shutter${busy ? ' busy' : ''}" data-k="shoot" title="拍照（空格）"><i></i></button>` +
      `<button class="vf-roll" data-k="album" title="相册">${thumb ? `<img src="${thumb}" alt="">` : '<span>相册</span>'}<b>${photos.length}</b></button>`;
    lastThumb = thumb;
  };
  // 底栏的滑块拖动时不重画整栏（不然滑块会被换掉、拖不动）
  const quick = () => {
    if (!on) return;
    const r = frameRect();
    Object.assign(ui.rect.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    $('vf-read').innerHTML = `<b>${Math.round(focal)} mm</b>${roll ? ` · 歪 ${Math.round(THREE.MathUtils.radToDeg(roll))}°` : ''}`;
    const fi = ui.bottom.querySelector('#vf-focal');
    if (fi && document.activeElement !== fi) fi.value = Math.round((Math.log(focal / FOCAL_MIN) / Math.log(FOCAL_MAX / FOCAL_MIN)) * 1000);
    const fl = ui.bottom.querySelector('#vf-focal + i');
    if (fl) fl.textContent = `${Math.round(focal)}mm`;
  };
  const dateStamp = (d) => `'${String(d.getFullYear()).slice(2)} ${pad(d.getMonth() + 1)} ${pad(d.getDate())}`;

  const setMode = (m) => {
    mode = m;
    if (m === 'selfie') {
      // 转到她正面，近一点、平一点
      cam.yaw = whale.state.yaw;
      cam.want = 3.6;
      cam.pitch = 0.06;
      if (focal < 28) focal = 35;
    }
    if (m === 'eye') {
      cam.minPitch = -1.25;
      cam.maxPitch = 1.25;
    } else if (saved) {
      cam.minPitch = saved.minPitch;
      cam.maxPitch = saved.maxPitch;
    }
  };

  const onClick = (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (!k) return;
    e.stopPropagation();
    const [a, b] = k.split(':');
    if (a === 'exit') return photo.exit();
    if (a === 'shoot') return photo.shoot();
    if (a === 'album') return album.open();
    if (a === 'mode') setMode(b);
    if (a === 'aspect') prefs.aspect = b;
    if (a === 'res') prefs.res = b;
    if (a === 'filter') prefs.filter = b;
    if (a === 'format') prefs.format = prefs.format === 'png' ? 'jpg' : 'png';
    if (a === 'grid') prefs.grid = !prefs.grid;
    if (a === 'stamp') prefs.stamp = !prefs.stamp;
    if (a === 'auto') prefs.auto = !prefs.auto;
    if (a === 'hide') hidePlayer = !hidePlayer;
    savePrefs();
    draw();
  };
  ui.top.addEventListener('click', onClick);
  ui.bottom.addEventListener('click', onClick);
  let lightTimer = 0;
  ui.bottom.addEventListener('input', (e) => {
    if (e.target.id === 'vf-focal') {
      focal = FOCAL_MIN * Math.pow(FOCAL_MAX / FOCAL_MIN, e.target.value / 1000);
      quick();
    }
    if (e.target.id === 'vf-light') {
      const h = Number(e.target.value);
      e.target.nextElementSibling.textContent = hourText(h);
      // 树影要重烘，拖得快了攒一下
      clearTimeout(lightTimer);
      lightTimer = setTimeout(() => light.set(h), 60);
    }
  });
  // 拖完滑块把焦点还给页面，空格还是快门
  ui.bottom.addEventListener('change', (e) => e.target.blur?.());
  window.addEventListener(
    'wheel',
    (e) => {
      if (!on || e.target !== canvas) return;
      e.preventDefault();
      e.stopPropagation();
      focal = Math.min(FOCAL_MAX, Math.max(FOCAL_MIN, focal * Math.pow(1.09, -Math.sign(e.deltaY))));
      quick();
    },
    { capture: true, passive: false },
  );
  window.addEventListener('resize', () => on && draw());

  // ---- 快门声：两下短促的"咔嚓"（白噪声过带通） --------------------------------------------------------------
  let audio = null;
  const click = () => {
    try {
      audio ??= new AudioContext();
      const t0 = audio.currentTime;
      for (const [at, f, g] of [
        [0, 2600, 0.5],
        [0.075, 1700, 0.38],
      ]) {
        const n = audio.createBuffer(1, audio.sampleRate * 0.05, audio.sampleRate);
        const d = n.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
        const src = audio.createBufferSource();
        src.buffer = n;
        const bp = audio.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = 1.4;
        const gain = audio.createGain();
        gain.gain.value = g;
        src.connect(bp).connect(gain).connect(audio.destination);
        src.start(t0 + at);
      }
    } catch {}
  };

  // ---- 冲洗：照片的像素 → 滤镜、颗粒、水下的蓝、日期 → 文件 -----------------------------------------------------
  const develop = (px, w, h, look) => {
    const raw = document.createElement('canvas');
    raw.width = w;
    raw.height = h;
    const g = raw.getContext('2d');
    const img = g.createImageData(w, h);
    const row = w * 4;
    // （GL 的行是从下往上的）
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    g.putImageData(img, 0, 0);
    const f = look.filter;
    let out = raw;
    if (f.css !== 'none') {
      out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const o = out.getContext('2d');
      o.filter = f.css;
      o.drawImage(raw, 0, 0);
      o.filter = 'none';
      raw.width = raw.height = 0;
    }
    const o = out.getContext('2d');
    if (look.underwater) {
      // 和屏幕上那层水下的蓝一样（#underwater）
      const gr = o.createRadialGradient(w / 2, h * 0.2, 0, w / 2, h * 0.2, Math.hypot(w, h) * 0.62);
      gr.addColorStop(0, 'rgba(120,210,230,0.1)');
      gr.addColorStop(0.75, 'rgba(10,60,90,0.42)');
      gr.addColorStop(1, 'rgba(10,60,90,0.42)');
      o.globalCompositeOperation = 'multiply';
      o.fillStyle = gr;
      o.fillRect(0, 0, w, h);
    }
    if (f.grain) {
      // 颗粒按 1080p 的大小来，4K 上一颗也是两三个像素；四角压一点暗
      o.globalCompositeOperation = 'overlay';
      o.globalAlpha = 0.16;
      const p = o.createPattern(grain(), 'repeat');
      const k = Math.max(1, h / 1080);
      p.setTransform(new DOMMatrix().scale(k, k));
      o.fillStyle = p;
      o.fillRect(0, 0, w, h);
      o.globalAlpha = 1;
      o.globalCompositeOperation = 'multiply';
      const v = o.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.56);
      v.addColorStop(0, 'rgba(255,255,255,1)');
      v.addColorStop(1, 'rgba(150,135,120,1)');
      o.fillStyle = v;
      o.fillRect(0, 0, w, h);
    }
    o.globalCompositeOperation = 'source-over';
    if (look.stamp) {
      // 老傻瓜机印在右下角的橙色日期
      const s = Math.min(w, h) * 0.038;
      o.font = `700 ${s}px "Courier New", Consolas, monospace`;
      o.textAlign = 'right';
      o.textBaseline = 'alphabetic';
      o.shadowColor = 'rgba(255,110,30,0.75)';
      o.shadowBlur = s * 0.3;
      o.fillStyle = '#ffa24a';
      o.fillText(dateStamp(look.when), w - s * 1.4, h - s * 1.2);
      o.shadowBlur = 0;
    }
    return out;
  };

  /**
   * 拍一张。
   * @param o.download 拍完存到电脑（默认看"自动存到电脑"）；o.save 存进相册（默认是）
   * @returns 相册里的那一条：{ id, blob, w, h, ... }
   */
  const shoot = async ({ download = prefs.auto, save = true } = {}) => {
    if (busy) return null;
    busy = true;
    draw();
    click();
    ui.flash.classList.remove('on');
    void ui.flash.offsetWidth;
    ui.flash.classList.add('on');
    // 让闪光先画出来，再开始重活
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const gl = renderer.getContext();
    let [w, h] = pixels();
    const max = Math.min(renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
    if (Math.max(w, h) > max) {
      const k = max / Math.max(w, h);
      w = Math.floor((w * k) / 2) * 2;
      h = Math.floor((h * k) / 2) * 2;
    }
    const look = { filter: filter(), stamp: prefs.stamp, underwater: info().underwater, when: new Date() };
    let px = null;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: false });
    const keep = { aspect: camera.aspect, fov: camera.fov };
    try {
      camera.aspect = w / h;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanPhoto()));
      camera.updateProjectionMatrix();
      // 笔刷跟着画布一起放大：屏幕上取景框多高，照片上的一笔就宽多少倍（最多两倍，再宽笔触会散）
      const r = frameRect();
      frame.paintStride = Math.min(2, Math.max(1, h / (Math.min(r.h, r.w / aspect().a) * renderer.getPixelRatio())));
      frame.render(scene(), camera, rt);
      px = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    } catch (e) {
      console.warn('拍照失败', e);
    } finally {
      rt.dispose();
      renderer.setRenderTarget(null);
      camera.aspect = keep.aspect;
      camera.fov = keep.fov;
      camera.updateProjectionMatrix();
    }
    if (!px || gl.isContextLost()) {
      busy = false;
      draw();
      hud.toast('这台电脑画不动这么大的照片，换成 2K 再试试');
      return null;
    }
    const out = develop(px, w, h, look);
    px = null;
    const type = prefs.format === 'jpg' ? 'image/jpeg' : 'image/png';
    const blob = await blobOf(out, type, 0.95);
    // 相册里的小图
    const tw = 480;
    const th = Math.round((tw * h) / w);
    const tc = document.createElement('canvas');
    tc.width = tw;
    tc.height = th;
    tc.getContext('2d').drawImage(out, 0, 0, tw, th);
    const thumb = await blobOf(tc, 'image/jpeg', 0.86);
    out.width = out.height = 0;
    const meta = info();
    const rec = {
      id: look.when.getTime(),
      blob,
      thumb,
      w,
      h,
      type,
      size: blob.size,
      place: meta.place,
      clock: meta.clock,
      weather: meta.weather,
      focal: Math.round(focal),
      filter: look.filter.name,
      mode: MODES.find((m) => m[0] === mode)[1],
      when: look.when.toISOString(),
    };
    if (save) {
      photos.push(rec);
      urls.set(rec.id, URL.createObjectURL(thumb));
      store.put(rec).catch((e) => console.warn('相册没存上', e));
    }
    if (download) saveFile(rec);
    busy = false;
    draw();
    // 小图飞进右下角的相册
    ui.root.querySelector('.vf-roll')?.classList.add('pop');
    hud.toast(`拍好了：${w}×${h} ${type === 'image/png' ? 'PNG' : 'JPG'}，${mb(blob.size)}${download ? '，已存到电脑的下载文件夹' : '，在相册里'}`, 3200);
    return rec;
  };

  const fileName = (rec) => `小鲸鱼的世界-${rec.place}-${stamp(new Date(rec.when))}.${rec.type === 'image/png' ? 'png' : 'jpg'}`;
  const saveFile = (rec) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(rec.blob);
    a.download = fileName(rec);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };

  // ---- 相册 --------------------------------------------------------------------------------------------------
  let viewing = -1;
  let bigUrl = '';
  let confirmDelete = false;
  const album = {
    get isOpen() {
      return ui.album.classList.contains('on');
    },
    open(index = -1) {
      ui.album.classList.add('on');
      viewing = index;
      confirmDelete = false;
      album.draw();
    },
    close() {
      ui.album.classList.remove('on');
      if (bigUrl) URL.revokeObjectURL(bigUrl);
      bigUrl = '';
    },
    draw() {
      const body = $('album-body');
      $('album-count').textContent = `${photos.length} 张`;
      if (bigUrl) URL.revokeObjectURL(bigUrl);
      bigUrl = '';
      if (viewing < 0 || !photos[viewing]) {
        viewing = -1;
        body.className = 'al-grid';
        body.innerHTML = photos.length
          ? [...photos]
              .reverse()
              .map((p) => `<button class="al-cell" data-i="${photos.indexOf(p)}"><img src="${urls.get(p.id)}" alt=""><span>${p.place} · ${p.clock.replace(/^第 \d+ 天 /, '')}</span></button>`)
              .join('')
          : `<div class="al-empty"><b>相册还是空的</b><p>按 <kbd>V</kbd> 拿起相机，取好景按 <kbd>空格</kbd>。</p><p class="dim">照片是 4K 的，和游戏里同一套画法重画一遍；存在这台电脑的浏览器里，也能存成文件。</p></div>`;
        return;
      }
      const p = photos[viewing];
      bigUrl = URL.createObjectURL(p.blob);
      body.className = 'al-view';
      body.innerHTML =
        `<div class="al-pic"><img src="${bigUrl}" alt=""><button class="al-nav prev" data-nav="-1" ${viewing <= 0 ? 'disabled' : ''}>‹</button><button class="al-nav next" data-nav="1" ${viewing >= photos.length - 1 ? 'disabled' : ''}>›</button></div>` +
        `<div class="al-side"><div class="bm-card">` +
        `<div class="bm-title">${p.place}</div>` +
        `<div class="dim">${p.clock} · ${p.weather}</div>` +
        `<p>${p.mode} · ${p.focal} mm · ${p.filter}</p>` +
        `<p class="dim">${p.w}×${p.h} · ${p.type === 'image/png' ? 'PNG' : 'JPG'} · ${mb(p.size)}<br>拍于 ${new Date(p.when).toLocaleString('zh-CN', { hour12: false })}</p>` +
        `<div class="bm-btns"><button class="primary" data-act="save">存到电脑</button></div>` +
        `<div class="bm-btns"><button data-act="grid">全部照片</button><button data-act="del" class="${confirmDelete ? 'danger' : ''}">${confirmDelete ? '再点一次删掉' : '删除'}</button></div>` +
        `</div><p class="dim">← → 翻看 · Esc 关上</p></div>`;
    },
    step(d) {
      if (viewing < 0) return;
      viewing = Math.min(photos.length - 1, Math.max(0, viewing + d));
      confirmDelete = false;
      album.draw();
    },
  };
  ui.album.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (e.target === ui.album || e.target.closest('[data-close]')) return album.close();
    const cell = e.target.closest('[data-i]');
    if (cell) return album.open(Number(cell.dataset.i));
    const nav = e.target.closest('[data-nav]');
    if (nav) return album.step(Number(nav.dataset.nav));
    const act = e.target.closest('[data-act]')?.dataset.act;
    const p = photos[viewing];
    if (act === 'save' && p) saveFile(p);
    if (act === 'grid') album.open(-1);
    if (act === 'del' && p) {
      if (!confirmDelete) {
        confirmDelete = true;
        return album.draw();
      }
      photos.splice(viewing, 1);
      URL.revokeObjectURL(urls.get(p.id));
      urls.delete(p.id);
      await store.remove(p.id);
      viewing = Math.min(viewing, photos.length - 1);
      confirmDelete = false;
      album.draw();
      draw();
    }
  });

  store.all().then((list) => {
    photos = list.sort((a, b) => a.id - b.id);
    for (const p of photos) urls.set(p.id, URL.createObjectURL(p.thumb));
  });

  const photo = {
    get on() {
      return on;
    },
    get busy() {
      return busy;
    },
    get mode() {
      return mode;
    },
    get photos() {
      return photos;
    },
    album,
    prefs,
    apply,
    shoot,
    setMode,
    setFocal(f) {
      focal = Math.min(FOCAL_MAX, Math.max(FOCAL_MIN, f));
      quick();
    },
    setRoll(r) {
      roll = r;
      quick();
    },
    enter() {
      if (on) return;
      on = true;
      saved = { fov: camera.fov, minPitch: cam.minPitch, maxPitch: cam.maxPitch, frozen: light.frozen() };
      // 取景的时候天光停住（风和草照样在动），光线滑块可以把它拨到别的时刻
      light.set(light.get());
      roll = 0;
      setMode('follow');
      cam.unlock();
      document.body.classList.add('photo');
      ui.root.classList.add('on');
      draw();
    },
    exit() {
      if (!on) return;
      on = false;
      document.body.classList.remove('photo');
      ui.root.classList.remove('on');
      canvas.style.filter = '';
      ui.grain.classList.remove('on');
      cam.minPitch = saved.minPitch;
      cam.maxPitch = saved.maxPitch;
      camera.fov = saved.fov;
      camera.updateProjectionMatrix();
      whale.group.visible = true;
      light.set(saved.frozen);
      album.close();
    },
    /** 相机拿在手上时的按键；返回 true 表示用掉了 */
    handleKey(e) {
      if (album.isOpen) {
        if (e.code === 'Escape' || e.code === 'KeyV') album.close();
        if (e.code === 'ArrowLeft') album.step(-1);
        if (e.code === 'ArrowRight') album.step(1);
        e.preventDefault();
        return true;
      }
      const c = e.code;
      if (c === 'KeyV' || c === 'Escape') photo.exit();
      else if (c === 'Space' || c === 'Enter') {
        mover.keys.delete('Space');
        if (!e.repeat) shoot();
      } else if (c === 'Tab') {
        const i = MODES.findIndex((m) => m[0] === mode);
        setMode(MODES[(i + 1) % MODES.length][0]);
        draw();
      } else if (/^Digit[1-6]$/.test(c)) {
        prefs.filter = FILTERS[Number(c.slice(5)) - 1].id;
        savePrefs();
        draw();
      } else if (c === 'KeyQ' || c === 'KeyE') {
        roll = Math.max(-0.5, Math.min(0.5, roll + (c === 'KeyQ' ? 1 : -1) * THREE.MathUtils.degToRad(2)));
        quick();
      } else if (c === 'KeyR') {
        roll = 0;
        quick();
      } else if (c === 'KeyZ' || c === 'KeyX') {
        photo.setFocal(focal * (c === 'KeyX' ? 1.12 : 1 / 1.12));
      } else if (c === 'KeyH') {
        hidePlayer = !hidePlayer;
        draw();
      } else if (c === 'KeyG') {
        prefs.grid = !prefs.grid;
        savePrefs();
        draw();
      } else if (c === 'KeyL') album.open();
      else return false;
      e.preventDefault();
      return true;
    },
  };
  return photo;
}
