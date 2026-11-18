// 大地图（M 键）：一张手绘感的全图——水彩底色、山的晕渲和等高线、林子一团团、田是拼布、房子一块块、
// 路是奶油色带深边；上面是地名、各个能去的地方、自己的箭头、目标的图钉。
//
// 走过的地方才看得清（探索），没去过的地方蒙着一层纸。滚轮缩放、拖动平移、点地标看详情，
// 能把它设为目标（小地图上会指方向），公交站、家和高铁站可以直接"坐车过去"。
// 上面的页签还能翻到两张手绘的纸地图（小镇图、世界图）。
import { DISTRICTS, ROADS, SEGS, PLAZA, HALF, LAKE, BUS_ROUTE, heightAt, lakeDistance, riverAt, RIVER_HALF, SEA, coastX, forestAt, fieldsAt, plotAt, pavedAt, mountainAt, fbm } from './plan.js';

const $ = (id) => document.getElementById(id);
const BAKE = 1024;
const FOG = 128;

/** 每类地点在地图上的图标和颜色 */
const ICON = {
  door: ['🏠', '#ffd166', '家'],
  fish: ['🎣', '#6fd3e8', '钓鱼'],
  bus: ['🚌', '#f0a64a', '公交站'],
  station: ['🚄', '#7ab4e8', '高铁站'],
  shop: ['🛒', '#8fe08a', '商店'],
  market: ['🥬', '#ffb07c', '市场'],
  fishmarket: ['🐟', '#6fc3e8', '市场'],
  seed: ['🌱', '#f5a3c7', '市场'],
  eat: ['🍜', '#ff9a6c', '吃的'],
  net: ['💻', '#7ec8ff', '娱乐'],
  arcade: ['🕹️', '#c792ea', '娱乐'],
  read: ['📚', '#e0c9a6', '学习'],
  study: ['🏫', '#cbd5a0', '学习'],
  pray: ['⛩️', '#d8c2ff', '祈福'],
  wish: ['⛲', '#a8e6ff', '祈福'],
  guild: ['⚔️', '#ffcf5c', '委托'],
  sport: ['🏀', '#8ad2ff', '娱乐'],
  gate: ['⛩', '#e8dcc8', '地标'],
  village: ['🏘️', '#e8dcc8', '地标'],
  farm: ['🌾', '#c8e6a0', '田园'],
  pick: ['🥕', '#c8e6a0', '田园'],
  orchard: ['🍑', '#f2b6a0', '田园'],
  plant: ['🌱', '#9ae66e', '田园'],
  gather: ['🌼', '#f7bfe0', '野外'],
  board: ['📋', '#e8dcc8', '地标'],
  mail: ['✉️', '#e8dcc8', '地标'],
};
/** 可以直接传送过去的地点 */
const TRAVEL = new Set(['door', 'bus', 'station']);

const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** 烘一张 1024² 的手绘底图（第一次打开时才烘，约半秒） */
function bake() {
  const c = document.createElement('canvas');
  c.width = c.height = BAKE;
  const g = c.getContext('2d');
  const img = g.createImageData(BAKE, BAKE);
  const S = (HALF * 2) / BAKE;
  const H = new Float32Array(BAKE * BAKE);
  for (let j = 0; j < BAKE; j++) for (let i = 0; i < BAKE; i++) H[j * BAKE + i] = heightAt(-HALF + (i + 0.5) * S, -HALF + (j + 0.5) * S);
  const at = (i, j) => H[Math.min(BAKE - 1, Math.max(0, j)) * BAKE + Math.min(BAKE - 1, Math.max(0, i))];
  const PAPER = [242, 233, 210];
  for (let j = 0; j < BAKE; j++) {
    for (let i = 0; i < BAKE; i++) {
      const x = -HALF + (i + 0.5) * S;
      const z = -HALF + (j + 0.5) * S;
      const h = at(i, j);
      // 晕渲：光从西北来
      const hx = (at(i + 1, j) - at(i - 1, j)) / (2 * S);
      const hz = (at(i, j + 1) - at(i, j - 1)) / (2 * S);
      let shade = 1 + (-hx * 0.55 - hz * 0.55) * 0.9;
      shade = Math.max(0.62, Math.min(1.25, shade));
      // 水彩的色块：一层低频噪声让同一种颜色有浓有淡
      const wash = 0.93 + 0.14 * fbm(x / 90 + 3.3, z / 90 - 1.1, 3, 7);
      // 草地：黄绿到蓝绿
      let col = mix3([150, 186, 110], [118, 168, 104], fbm(x / 260, z / 260, 3, 3));
      // 山：越高越灰褐、雪线以上白
      const m = mountainAt(x, z);
      col = mix3(col, [168, 158, 140], Math.min(1, m * 1.1));
      col = mix3(col, [246, 247, 250], Math.max(0, Math.min(1, (h - 230) / 60)));
      // 林：深绿
      const f = forestAt(x, z);
      if (f > 0.05) col = mix3(col, [86, 128, 88], Math.min(1, f * 1.2));
      // 田：拼布
      const fd = fieldsAt(x, z);
      if (fd > 0.4) {
        const p = plotAt(x, z);
        const crop = p.kind === 0 ? [224, 196, 112] : p.kind === 1 ? [128, 176, 92] : [178, 146, 104];
        col = mix3(col, p.edge < 0.6 ? [170, 150, 112] : crop, Math.min(1, (fd - 0.4) * 2.5));
      }
      // 铺装：奶油
      const pv = pavedAt(x, z);
      if (pv > 0.2) col = mix3(col, [226, 214, 188], pv * 0.85);
      // 水
      const rv = riverAt(x, z);
      const ld = lakeDistance(x, z);
      const isSea = x > 480 && h < SEA.level;
      const isWater = ld < 1.0 || rv.d < RIVER_HALF + 1.5 || isSea;
      if (isWater) {
        const depth = isSea ? Math.min(1, (SEA.level - h) / 8) : ld < 1 ? Math.min(1, 1 - ld) : 0.4;
        col = mix3([150, 200, 214], [84, 140, 182], depth);
        shade = 1;
        // 水面的细波纹
        if (Math.sin((x + z * 0.3) * 0.25 + fbm(x / 40, z / 40, 2, 9) * 6) > 0.96) col = mix3(col, [230, 244, 248], 0.5);
      } else if (ld < 1.08 || (x > 480 && h < SEA.level + 1.2) || rv.d < RIVER_HALF + 4) {
        col = mix3(col, [228, 214, 172], 0.8); // 沙滩
      }
      let r = col[0] * shade * wash;
      let gg = col[1] * shade * wash;
      let b = col[2] * shade * wash;
      // 等高线：每 25 m 一道淡淡的褐线（水里不画）
      if (!isWater && h > -4) {
        const k = h / 25;
        const d = Math.abs(k - Math.round(k)) * 25;
        const slope = Math.hypot(hx, hz) + 0.02;
        if (d / slope < S * 0.6) {
          r = lerp(r, 120, 0.22);
          gg = lerp(gg, 98, 0.22);
          b = lerp(b, 72, 0.22);
        }
      }
      // 纸的纹理
      const grain = (fbm(i * 0.9, j * 0.9, 2, 11) - 0.5) * 18;
      const o = (j * BAKE + i) * 4;
      img.data[o] = Math.min(255, r + grain);
      img.data[o + 1] = Math.min(255, gg + grain);
      img.data[o + 2] = Math.min(255, b + grain * 0.8);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const w2p = (x, z) => [(x + HALF) / S, (z + HALF) / S];
  // 林子：一团团的树冠印章
  g.save();
  for (let k = 0; k < 9000; k++) {
    const x = -HALF + Math.random() * HALF * 2;
    const z = -HALF + Math.random() * HALF * 2;
    const f = forestAt(x, z);
    if (f < 0.35 || Math.random() > f) continue;
    const [px, py] = w2p(x, z);
    const r = 1.6 + Math.random() * 1.8;
    g.fillStyle = `rgba(52,96,62,${0.35 + Math.random() * 0.25})`;
    g.beginPath();
    g.arc(px + 0.6, py + 0.8, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(${96 + Math.random() * 30},${146 + Math.random() * 20},${92},0.8)`;
    g.beginPath();
    g.arc(px, py, r * 0.8, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // 海岸线、湖岸：一道深蓝的描边
  g.strokeStyle = 'rgba(52,96,130,0.6)';
  g.lineWidth = 1.2;
  g.beginPath();
  for (let z = -HALF; z <= HALF; z += 8) {
    const [px, py] = w2p(coastX(z) - 30, z);
    if (z === -HALF) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();
  // 四边：一圈暗下去的纸边
  const vg = g.createRadialGradient(BAKE / 2, BAKE / 2, BAKE * 0.42, BAKE / 2, BAKE / 2, BAKE * 0.74);
  vg.addColorStop(0, 'rgba(120,96,60,0)');
  vg.addColorStop(1, 'rgba(120,96,60,0.32)');
  g.fillStyle = vg;
  g.fillRect(0, 0, BAKE, BAKE);
  return c;
}

/**
 * @param o.city 城市（地点、碰撞盒）；o.getPlayer () => {x, z, yaw}；o.onTravel (place) => void；o.hud
 */
export function createBigMap({ city, getPlayer, onTravel, hud, minutes }) {
  const root = $('bigmap');
  const canvas = $('bigmap-canvas');
  const side = $('bigmap-side');
  const g = canvas.getContext('2d');
  let base = null;
  let open = false;
  let tab = 'map';
  let zoom = 1.6;
  let cx = 0;
  let cz = 0;
  let selected = null;
  let waypoint = null;
  let drag = null;
  let blink = 0;
  // 探索：128² 的格子，走过的地方亮
  const fog = new Uint8Array(FOG * FOG);
  const fogCanvas = document.createElement('canvas');
  fogCanvas.width = fogCanvas.height = FOG;
  const fg = fogCanvas.getContext('2d');
  const fogImg = fg.createImageData(FOG, FOG);
  let fogDirty = true;
  const reveal = (x, z, r) => {
    const cell = (HALF * 2) / FOG;
    const i0 = Math.max(0, Math.floor((x - r + HALF) / cell));
    const i1 = Math.min(FOG - 1, Math.floor((x + r + HALF) / cell));
    const j0 = Math.max(0, Math.floor((z - r + HALF) / cell));
    const j1 = Math.min(FOG - 1, Math.floor((z + r + HALF) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-HALF + (i + 0.5) * cell - x, -HALF + (j + 0.5) * cell - z);
        const v = Math.round(255 * Math.max(0, Math.min(1, (r - d) / (r * 0.35))));
        if (v > fog[j * FOG + i]) {
          fog[j * FOG + i] = v;
          fogDirty = true;
        }
      }
    }
  };
  const explored = (x, z) => {
    const cell = (HALF * 2) / FOG;
    const i = Math.floor((x + HALF) / cell);
    const j = Math.floor((z + HALF) / cell);
    return i >= 0 && j >= 0 && i < FOG && j < FOG && fog[j * FOG + i] > 120;
  };
  // 开局：镇子中心看得清
  reveal(PLAZA[0], PLAZA[1], 300);

  const places = () => city.interactables.filter((it) => ICON[it.kind] && it.kind !== 'home');

  // 世界 ↔ 画布
  const size = () => ({ W: canvas.width, H: canvas.height });
  const scale = () => (Math.min(canvas.width, canvas.height) / (HALF * 2)) * zoom;
  const w2s = (x, z) => {
    const { W, H } = size();
    const k = scale();
    return [W / 2 + (x - cx) * k, H / 2 + (z - cz) * k];
  };
  const s2w = (px, py) => {
    const { W, H } = size();
    const k = scale();
    return [cx + (px - W / 2) / k, cz + (py - H / 2) / k];
  };
  const clampView = () => {
    const lim = HALF * (1 - 0.5 / zoom);
    cx = Math.max(-lim, Math.min(lim, cx));
    cz = Math.max(-lim, Math.min(lim, cz));
  };

  const fit = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  };

  const label = (text, px, py, size2, weight = 700, color = '#3a2e22') => {
    g.font = `${weight} ${size2}px "Microsoft YaHei","PingFang SC",sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(3, size2 * 0.28);
    g.strokeStyle = 'rgba(250,244,228,0.92)';
    g.strokeText(text, px, py);
    g.fillStyle = color;
    g.fillText(text, px, py);
  };

  const draw = () => {
    if (!open || tab !== 'map') return;
    const { W, H } = size();
    const k = scale();
    const dpr = W / canvas.getBoundingClientRect().width;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#e9dcbc';
    g.fillRect(0, 0, W, H);
    const [x0, y0] = w2s(-HALF, -HALF);
    const span = HALF * 2 * k;
    g.imageSmoothingEnabled = true;
    g.drawImage(base, x0, y0, span, span);
    // 没去过的地方：蒙一层纸
    if (fogDirty) {
      for (let n = 0; n < fog.length; n++) {
        fogImg.data[n * 4] = 238;
        fogImg.data[n * 4 + 1] = 228;
        fogImg.data[n * 4 + 2] = 204;
        fogImg.data[n * 4 + 3] = Math.round((255 - fog[n]) * 0.82);
      }
      fg.putImageData(fogImg, 0, 0);
      fogDirty = false;
    }
    g.drawImage(fogCanvas, x0, y0, span, span);
    // 路、广场、房子、公交线：矢量画，放大也清楚
    const lw = (m, min) => Math.max(min * dpr, m * k);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const sg of SEGS) {
        const [ax, ay] = w2s(sg.ax, sg.az);
        const [bx, by] = w2s(sg.bx, sg.bz);
        if (sg.lane) {
          if (pass) continue;
          g.setLineDash([4 * dpr, 4 * dpr]);
          g.strokeStyle = 'rgba(140,108,70,0.8)';
          g.lineWidth = lw(2.4, 1.4);
        } else {
          g.setLineDash([]);
          g.strokeStyle = pass ? '#f8eed6' : 'rgba(120,96,70,0.9)';
          g.lineWidth = pass ? lw(7.2, 2.2) : lw(9.6, 3.6);
        }
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
    }
    g.setLineDash([]);
    {
      const [qx, qy] = w2s(PLAZA[0], PLAZA[1]);
      g.fillStyle = '#f2e6c8';
      g.strokeStyle = 'rgba(120,96,70,0.9)';
      g.lineWidth = 1.5 * dpr;
      g.beginPath();
      g.arc(qx, qy, 31 * k, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    const ROOF = ['#c96f55', '#b9634e', '#8a9bb0', '#d58a5c', '#c46a52'];
    for (const c2 of city.colliders) {
      if (c2.hw < 1.6 || c2.hd < 1.6 || (c2.top ?? 0) < 3 || !explored(c2.x, c2.z)) continue;
      const w = c2.hw * 2 * 0.78 * k;
      const h2 = c2.hd * 2 * 0.78 * k;
      const [px, py] = w2s(c2.x, c2.z);
      if (px < -w || py < -h2 || px > W + w || py > H + h2) continue;
      const r = Math.min(w, h2) * 0.18;
      g.fillStyle = 'rgba(70,50,40,0.22)';
      g.beginPath();
      g.roundRect(px - w / 2 + 1.2 * dpr, py - h2 / 2 + 1.2 * dpr, w, h2, r);
      g.fill();
      g.fillStyle = ROOF[Math.abs(Math.round(c2.x * 7 + c2.z * 3)) % ROOF.length];
      g.beginPath();
      g.roundRect(px - w / 2, py - h2 / 2, w, h2, r);
      g.fill();
      g.strokeStyle = 'rgba(70,46,34,0.6)';
      g.lineWidth = Math.max(0.6, 0.9 * dpr);
      g.stroke();
      // 屋脊：一道亮线
      if (zoom > 2.5) {
        g.strokeStyle = 'rgba(255,240,220,0.45)';
        g.beginPath();
        if (w > h2) {
          g.moveTo(px - w / 2 + r, py);
          g.lineTo(px + w / 2 - r, py);
        } else {
          g.moveTo(px, py - h2 / 2 + r);
          g.lineTo(px, py + h2 / 2 - r);
        }
        g.stroke();
      }
    }
    g.setLineDash([6 * dpr, 5 * dpr]);
    g.strokeStyle = 'rgba(232,140,52,0.95)';
    g.lineWidth = 2.4 * dpr;
    g.beginPath();
    BUS_ROUTE.forEach(([x, z], i) => {
      const [px, py] = w2s(x, z);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.stroke();
    g.setLineDash([]);
    // 地名（去过的才写）
    for (const d of DISTRICTS) {
      if (d.kind === 'residential' && zoom < 2.2) continue;
      if (!explored(d.x, d.z)) continue;
      const [px, py] = w2s(d.x, d.z);
      const big = ['lake', 'mountain', 'forest', 'fields', 'farm', 'snowtown', 'seaside', 'newtown', 'beach'].includes(d.kind);
      const s2 = (big ? 15 : 12.5) * dpr * Math.min(1.6, 0.75 + zoom * 0.18);
      // 有图标在同一处的，字写在图标上方，别压在一起
      const hasIcon = places().some((it) => Math.hypot(it.x - d.x, it.z - d.z) < d.r * 0.6);
      const lift = hasIcon ? 9 * dpr * Math.min(1.4, 0.7 + zoom * 0.15) + s2 * 0.75 : big ? 0 : 14 * dpr;
      label(d.name, px, py - lift, s2, big ? 800 : 700, big ? '#2f5068' : '#3a2e22');
    }
    // 地点图标
    const r0 = 9 * dpr * Math.min(1.4, 0.7 + zoom * 0.15);
    for (const it of places()) {
      if (!explored(it.x, it.z)) continue;
      const minor = ['gather', 'mail', 'board', 'plant'].includes(it.kind);
      if (minor && zoom < 5) continue;
      // 果园七排树：缩小的时候只画一个
      if (it.kind === 'orchard' && zoom < 4 && it.id !== 'orchard-3') continue;
      const [px, py] = w2s(it.x, it.z);
      if (px < -20 || py < -20 || px > W + 20 || py > H + 20) continue;
      const [emoji, color] = ICON[it.kind];
      const sel = selected === it;
      g.beginPath();
      g.arc(px, py, sel ? r0 * 1.35 : r0, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      g.lineWidth = sel ? 2.5 * dpr : 1.5 * dpr;
      g.strokeStyle = sel ? '#2f6d97' : 'rgba(58,46,34,0.85)';
      g.stroke();
      g.font = `${Math.round(r0 * 1.15)}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(emoji, px, py + 0.5 * dpr);
      const dup = DISTRICTS.some((d) => d.name === it.name || it.name.includes(d.name));
      if ((zoom > 3.2 && !dup) || sel) label(it.name, px, py + r0 + 9 * dpr, 11 * dpr, 600);
    }
    // 目标图钉
    if (waypoint) {
      const [px, py] = w2s(waypoint.x, waypoint.z);
      const bob = Math.sin(blink * 4) * 2 * dpr;
      g.fillStyle = '#e0533a';
      g.strokeStyle = '#fff8ee';
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.moveTo(px, py + bob);
      g.bezierCurveTo(px - 10 * dpr, py - 14 * dpr + bob, px - 9 * dpr, py - 26 * dpr + bob, px, py - 26 * dpr + bob);
      g.bezierCurveTo(px + 9 * dpr, py - 26 * dpr + bob, px + 10 * dpr, py - 14 * dpr + bob, px, py + bob);
      g.fill();
      g.stroke();
      g.fillStyle = '#fff8ee';
      g.beginPath();
      g.arc(px, py - 18 * dpr + bob, 3.4 * dpr, 0, Math.PI * 2);
      g.fill();
    }
    // 自己
    const p = getPlayer();
    const [px, py] = w2s(p.x, p.z);
    const pulse = 1 + 0.25 * Math.sin(blink * 3);
    g.beginPath();
    g.arc(px, py, 16 * dpr * pulse, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,106,77,0.18)';
    g.fill();
    g.save();
    g.translate(px, py);
    g.rotate(-p.yaw + Math.PI);
    const a = 10 * dpr;
    g.beginPath();
    g.moveTo(0, -a);
    g.lineTo(a * 0.68, a * 0.75);
    g.lineTo(0, a * 0.3);
    g.lineTo(-a * 0.68, a * 0.75);
    g.closePath();
    g.fillStyle = '#ff6a4d';
    g.fill();
    g.strokeStyle = '#fff8ee';
    g.lineWidth = 2 * dpr;
    g.stroke();
    g.restore();
    // 比例尺 + 指北针
    const meters = zoom < 2 ? 200 : zoom < 4 ? 100 : 50;
    const len = meters * k;
    const bx = 24 * dpr;
    const by = H - 26 * dpr;
    g.strokeStyle = '#3a2e22';
    g.lineWidth = 2 * dpr;
    g.beginPath();
    g.moveTo(bx, by - 5 * dpr);
    g.lineTo(bx, by);
    g.lineTo(bx + len, by);
    g.lineTo(bx + len, by - 5 * dpr);
    g.stroke();
    label(`${meters} 米`, bx + len / 2, by - 12 * dpr, 11 * dpr, 600);
    label('N', W - 30 * dpr, 30 * dpr, 16 * dpr, 800);
    g.beginPath();
    g.moveTo(W - 30 * dpr, 40 * dpr);
    g.lineTo(W - 36 * dpr, 58 * dpr);
    g.lineTo(W - 30 * dpr, 54 * dpr);
    g.lineTo(W - 24 * dpr, 58 * dpr);
    g.closePath();
    g.fillStyle = '#c0533a';
    g.fill();
  };

  // ---- 侧栏 ----
  const renderSide = () => {
    const p = getPlayer();
    if (tab !== 'map') {
      side.innerHTML = `<p class="dim">${tab === 'town' ? '这是镇上的人画的《鱼的小镇地图》。你现在能走到的地方都在这张图上。' : '《幻想世界地图》。玉海城、大学城、港口……要等铁路修好才能去。'}</p>`;
      return;
    }
    const all = places();
    const seen = all.filter((it) => explored(it.x, it.z));
    let html = `<div class="bm-sec">探索 <b>${Math.round((fog.reduce((a, b) => a + (b > 120 ? 1 : 0), 0) / fog.length) * 100)}%</b> · 发现地点 <b>${seen.length}</b>/${all.length}</div>`;
    if (selected) {
      const d = Math.round(Math.hypot(selected.x - p.x, selected.z - p.z));
      const [emoji, , cat] = ICON[selected.kind] ?? ['📍', '', ''];
      const isWp = waypoint && waypoint.id === selected.id;
      html += `<div class="bm-card"><div class="bm-title">${emoji} ${selected.name}</div><div class="dim">${cat} · 离你 ${d} 米</div>${selected.hint ? `<div class="dim">${selected.hint.replace(/^E\s*/, '到了按 E ')}</div>` : ''}
        <div class="bm-btns"><button data-act="wp">${isWp ? '取消目标' : '设为目标'}</button>${TRAVEL.has(selected.kind) ? '<button data-act="go" class="primary">坐车过去</button>' : ''}</div></div>`;
    } else html += '<p class="dim">点地图上的图标看看是什么地方。滚轮缩放，按住拖动。</p>';
    // 图例
    const cats = new Map();
    for (const it of seen) {
      const [emoji, , cat] = ICON[it.kind];
      if (!cats.has(cat)) cats.set(cat, emoji);
    }
    html += `<div class="bm-sec">图例</div><div class="bm-legend">${[...cats].map(([cat, e]) => `<span>${e} ${cat}</span>`).join('')}<span><i class="bm-line bus"></i>1 路公交</span><span><i class="bm-line road"></i>石板街</span><span><i class="bm-line lane"></i>土路</span></div>`;
    side.innerHTML = html;
    side.querySelector('[data-act="wp"]')?.addEventListener('click', () => {
      waypoint = waypoint && waypoint.id === selected.id ? null : { id: selected.id, name: selected.name, x: selected.x, z: selected.z };
      renderSide();
    });
    side.querySelector('[data-act="go"]')?.addEventListener('click', () => {
      const it = selected;
      api.close();
      onTravel?.(it);
    });
  };

  // ---- 输入 ----
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    const mx = (e.clientX - r.left) * dpr;
    const my = (e.clientY - r.top) * dpr;
    const [wx, wz] = s2w(mx, my);
    zoom = Math.max(1, Math.min(9, zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
    // 让鼠标下的那一点不动
    const [nx, nz] = s2w(mx, my);
    cx += wx - nx;
    cz += wz - nz;
    clampView();
  }, { passive: false });
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cx, cz, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dpr = canvas.width / canvas.getBoundingClientRect().width;
    const dx = (e.clientX - drag.x) * dpr;
    const dy = (e.clientY - drag.y) * dpr;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    cx = drag.cx - dx / scale();
    cz = drag.cz - dy / scale();
    clampView();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) {
      // 点击：找最近的图标
      const r = canvas.getBoundingClientRect();
      const dpr = canvas.width / r.width;
      const mx = (e.clientX - r.left) * dpr;
      const my = (e.clientY - r.top) * dpr;
      let best = null;
      let bestD = 18 * dpr;
      for (const it of places()) {
        if (!explored(it.x, it.z)) continue;
        const [px, py] = w2s(it.x, it.z);
        const d = Math.hypot(px - mx, py - my);
        if (d < bestD) {
          bestD = d;
          best = it;
        }
      }
      selected = best;
      renderSide();
    }
    drag = null;
  });
  for (const b of root.querySelectorAll('[data-tab]')) {
    b.addEventListener('click', () => api.setTab(b.dataset.tab));
  }
  root.querySelector('[data-zoom="in"]').addEventListener('click', () => {
    zoom = Math.min(9, zoom * 1.4);
    clampView();
  });
  root.querySelector('[data-zoom="out"]').addEventListener('click', () => {
    zoom = Math.max(1, zoom / 1.4);
    clampView();
  });
  root.querySelector('[data-zoom="me"]').addEventListener('click', () => {
    const p = getPlayer();
    cx = p.x;
    cz = p.z;
    zoom = Math.max(zoom, 3);
    clampView();
  });
  root.querySelector('[data-close]').addEventListener('click', () => api.close());
  window.addEventListener('resize', () => open && fit());

  const api = {
    get isOpen() {
      return open;
    },
    get waypoint() {
      return waypoint;
    },
    explored,
    setTab(t) {
      tab = t;
      for (const b of root.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === t);
      root.classList.toggle('paper', t !== 'map');
      $('bigmap-paper').src = t === 'town' ? './maps/town.jpg' : t === 'world' ? './maps/world.jpg' : '';
      renderSide();
    },
    open() {
      if (!base) base = bake();
      open = true;
      root.classList.add('on');
      fit();
      const p = getPlayer();
      cx = p.x;
      cz = p.z;
      clampView();
      api.setTab('map');
      renderSide();
    },
    close() {
      open = false;
      root.classList.remove('on');
    },
    toggle() {
      if (open) api.close();
      else api.open();
    },
    /** 选中一个地点（截图、测试用） */
    select(id) {
      selected = city.interactables.find((it) => it.id === id) ?? null;
      if (selected) {
        cx = selected.x;
        cz = selected.z;
        clampView();
      }
      renderSide();
    },
    setWaypoint(wp) {
      waypoint = wp;
    },
    setView(x, z, zz) {
      cx = x;
      cz = z;
      zoom = zz;
      clampView();
    },
    revealAll() {
      fog.fill(255);
      fogDirty = true;
    },
    update(dt, outdoor) {
      blink += dt;
      const p = getPlayer();
      if (outdoor) reveal(p.x, p.z, 110);
      // 走到目标附近：自动取消
      if (waypoint && Math.hypot(waypoint.x - p.x, waypoint.z - p.z) < 12) {
        hud.toast(`到了：${waypoint.name}`);
        waypoint = null;
        if (open) renderSide();
      }
      draw();
    },
  };
  return api;
}
