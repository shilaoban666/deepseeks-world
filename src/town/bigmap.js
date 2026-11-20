// 大地图（M 键）：一张手绘感的全图——水彩底色、山的晕渲和等高线、林子一团团、田是拼布、房子一块块、
// 路是奶油色带深边；上面是地名、各个能去的地方、自己的箭头、目标的图钉。
//
// 走过的地方才看得清（探索），没去过的地方蒙着一层纸。滚轮缩放、拖动平移、点地标看详情，
// 能把它设为目标（小地图上会指方向），公交站、家和高铁站可以直接"坐车过去"。
// 上面的页签还能翻到手绘的纸地图：《幻想世界地图》总图，和十张分区图（public/maps/v3，tools/make-maps.mjs 缩的）。
import { DISTRICTS, ROADS, PLAZA, HOME, YUHAI, HALF, BUS_ROUTE, BUS_STOPS, METRO, METRO_STOPS, RAIL, RAIL_STATIONS, lakeDistance, riverAt, RIVER_HALF, SEA, coastD, snowAt, forestAt, fieldsAt, plotAt, smooth, fbm } from './plan.js';
import { smoothLine, gridHeight, yardAt } from './ui.js';

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
  // 各区的特色玩法（activities.js）
  ski: ['⛷️', '#bfe6ff', '娱乐'],
  boat: ['🚣', '#6fd3e8', '娱乐'],
  surf: ['🏄', '#ffb86b', '娱乐'],
  lounger: ['⛱️', '#ffd98a', '娱乐'],
  chess: ['♟️', '#e0c9a6', '娱乐'],
  shell: ['🐚', '#f7d9c4', '野外'],
  farmstand: ['🧺', '#ffb07c', '市场'],
  work: ['💼', '#ffcf5c', '委托'],
};
/** 可以直接传送过去的地点 */
const TRAVEL = new Set(['door', 'bus', 'station']);
/** 写大字的街区（一片片的地方）；别的是城里、镇上的一处处，放大了才写 */
const BIG = new Set(['lake', 'mountain', 'forest', 'fields', 'oldtown', 'town', 'snowtown', 'seaside', 'newtown', 'beach', 'university', 'cbd', 'lakeside', 'pastoral', 'port', 'harbor']);
/** 城、镇：里面的小地名缩小的时候不写（不然挤成一团） */
const TOWNS = DISTRICTS.filter((d) => ['oldtown', 'town', 'cbd'].includes(d.kind));
const INNER = new Set(DISTRICTS.filter((d) => !BIG.has(d.kind) && TOWNS.some((t) => Math.hypot(d.x - t.x, d.z - t.z) < t.r)).map((d) => d.id));
/** 高铁线：和世界里一样，把控制点顺成一条光滑的线 */
const RAIL_LINE = smoothLine(RAIL, 10);

/** 手绘的纸地图（public/maps/v3）：world 是总图，其余十张是分区图。at 是这张图画的那几处（挑"离你最近的一张"用）。 */
export const PAPERS = [
  { id: 'yuhai', name: '玉海城', at: [[YUHAI[0], YUHAI[1], 250]] },
  { id: 'aitown', name: 'AI 小镇', at: [[-470, -100, 120], [HOME[0], HOME[1], 40], [-452, 62, 60], [-378, 172, 50]] },
  { id: 'pastoral', name: '田园小镇', at: [[-860, -150, 90], [-872, 62, 150]] },
  { id: 'snow', name: '雪山小镇', at: [[-790, -560, 130]] },
  { id: 'lake', name: '月亮湖', at: [[-40, -520, 185], [285, -510, 100]] },
  { id: 'university', name: '大学城', at: [[640, -480, 135]] },
  { id: 'cbd', name: '新新区 CBD', at: [[445, -120, 125]] },
  { id: 'seaside-port', name: '海滨小镇 · 港口', at: [[762, -182, 110], [902, -190, 30], [715, 95, 95]] },
  { id: 'station-beach', name: '高铁站 · 沙滩', at: [[20, 400, 90], [425, 462, 50], [380, 556, 110]] },
  { id: 'newtown', name: '海边新城 · 码头', at: [[-740, 345, 125], [-735, 545, 75]] },
];
/** 离 (x, z) 最近的那张分区图的 id */
export function paperAt(x, z) {
  let best = PAPERS[0];
  let bestD = 1e9;
  for (const p of PAPERS) {
    for (const [px, pz, pr] of p.at) {
      const d = Math.hypot(x - px, z - pz) - pr;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best.id;
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** 烘一张 1024² 的手绘底图（第一次打开时才烘，一秒上下；高度查 ui.js 那张和小地图合用的表） */
function bake() {
  const c = document.createElement('canvas');
  c.width = c.height = BAKE;
  const g = c.getContext('2d');
  const img = g.createImageData(BAKE, BAKE);
  const S = (HALF * 2) / BAKE;
  const H = new Float32Array(BAKE * BAKE);
  for (let j = 0; j < BAKE; j++) for (let i = 0; i < BAKE; i++) H[j * BAKE + i] = gridHeight(-HALF + (i + 0.5) * S, -HALF + (j + 0.5) * S);
  const at = (i, j) => H[Math.min(BAKE - 1, Math.max(0, j)) * BAKE + Math.min(BAKE - 1, Math.max(0, i))];
  // 哪些格子是水（描岸线用）
  const water = new Uint8Array(BAKE * BAKE);
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
      const m = smooth(150, 300, h);
      col = mix3(col, [168, 158, 140], Math.min(1, m * 1.1));
      col = mix3(col, [246, 247, 250], Math.max(0, Math.min(1, (h - 230) / 60)));
      // 林：深绿（雪地里的林子是带霜的冷绿）
      const snow = snowAt(x, z);
      const f = forestAt(x, z);
      if (f > 0.05) col = mix3(col, [86, 128, 88], Math.min(1, f * 1.2));
      // 雪：雪山小镇那一片
      if (snow > 0.02) col = mix3(col, [246, 248, 252], snow * (0.92 - 0.3 * Math.min(1, f * 1.2)));
      // 田：拼布
      const fd = fieldsAt(x, z);
      if (fd > 0.4) {
        const p = plotAt(x, z);
        const crop = p.kind === 0 ? [224, 196, 112] : p.kind === 1 ? [128, 176, 92] : [178, 146, 104];
        col = mix3(col, p.edge < 0.6 ? [170, 150, 112] : crop, Math.min(1, (fd - 0.4) * 2.5));
      }
      // 铺装（广场、院子、站前、货场）：奶油
      const pv = yardAt(x, z);
      if (pv > 0.2) col = mix3(col, [226, 214, 188], pv * 0.85);
      // 水
      const rv = riverAt(x, z);
      const ld = lakeDistance(x, z);
      const cd = coastD(x, z);
      const isSea = h < SEA.level && cd < 60;
      const isWater = ld < 1.0 || (rv.d < RIVER_HALF + 1.5 && cd > -30) || isSea;
      if (isWater) water[j * BAKE + i] = 1;
      if (isWater) {
        const depth = isSea ? Math.min(1, (SEA.level - h) / 14) : ld < 1 ? Math.min(1, 1 - ld) : 0.4;
        col = mix3([150, 200, 214], [84, 140, 182], depth);
        shade = 1;
        // 水面的细波纹
        if (Math.sin((x + z * 0.3) * 0.25 + fbm(x / 40, z / 40, 2, 9) * 6) > 0.96) col = mix3(col, [230, 244, 248], 0.5);
      } else if (ld < 1.08 || (cd < 160 && h < SEA.level + 2.4) || rv.d < RIVER_HALF + 4) {
        col = mix3(col, [234, 220, 176], 0.85); // 沙滩、河滩
        shade = 0.5 + shade * 0.5;
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
  // 海岸线、湖岸、河岸：水和岸交界的地方描一道深蓝。岸线照着烘出来的水走（COAST 那个多边形在 coastD 里
  // 还加了摆动，沙滩上水边又退得远，直接描多边形会和水色对不上）
  for (let j = 1; j < BAKE - 1; j++) {
    for (let i = 1; i < BAKE - 1; i++) {
      const o = j * BAKE + i;
      const n = water[o - 1] + water[o + 1] + water[o - BAKE] + water[o + BAKE] + water[o - BAKE - 1] + water[o - BAKE + 1] + water[o + BAKE - 1] + water[o + BAKE + 1];
      const edge = water[o] ? 8 - n : n;
      if (!edge) continue;
      const a = Math.min(1, edge / 3) * (water[o] ? 0.5 : 0.28);
      img.data[o * 4] = lerp(img.data[o * 4], 52, a);
      img.data[o * 4 + 1] = lerp(img.data[o * 4 + 1], 96, a);
      img.data[o * 4 + 2] = lerp(img.data[o * 4 + 2], 130, a);
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
    // 雪地里的树：树冠上一层白
    const sn = snowAt(x, z);
    g.fillStyle = sn > 0.5 ? `rgba(${214 + Math.random() * 30},${228 + Math.random() * 20},232,0.85)` : `rgba(${96 + Math.random() * 30},${146 + Math.random() * 20},${92},0.8)`;
    g.beginPath();
    g.arc(px, py, r * 0.8, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
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
  // 分区手绘图翻到哪一张：null = 跟着人走（离哪张近看哪张）
  let paperPick = null;
  let paperShown = '';
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
  // 开局：家、AI 小镇看得清，玉海城露出一点（去过才全亮）
  reveal(HOME[0], HOME[1], 260);
  reveal(-460, -112, 220);
  reveal(YUHAI[0], YUHAI[1], 190);

  const places = () => city.interactables.filter((it) => ICON[it.kind] && it.kind !== 'home' && it.map !== false);

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
    const trace = (pts) => {
      g.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const [px, py] = w2s(pts[i][0], pts[i][1]);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    };
    // 土路：棕色的细虚线
    g.setLineDash([4 * dpr, 4 * dpr]);
    g.strokeStyle = 'rgba(140,108,70,0.8)';
    g.lineWidth = lw(2.4, 1.4);
    for (const line of ROADS) if (line.kind === 'lane') trace(line);
    g.setLineDash([]);
    // 公路（灰米色、窄一点）和石板街（奶油色）：先深边，再填；街压在公路上面
    g.strokeStyle = 'rgba(112,100,84,0.85)';
    g.lineWidth = lw(8.4, 3.2);
    for (const line of ROADS) if (line.kind === 'road') trace(line);
    g.strokeStyle = 'rgba(120,96,70,0.9)';
    g.lineWidth = lw(9.6, 3.6);
    for (const line of ROADS) if (line.kind === 'street') trace(line);
    g.strokeStyle = '#e4dccb';
    g.lineWidth = lw(6.2, 1.9);
    for (const line of ROADS) if (line.kind === 'road') trace(line);
    g.strokeStyle = '#f8eed6';
    g.lineWidth = lw(7.2, 2.2);
    for (const line of ROADS) if (line.kind === 'street') trace(line);
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
    // 37 路公交：橙色的线，站是白心的小圆点
    g.strokeStyle = 'rgba(232,140,52,0.95)';
    g.lineWidth = 2.2 * dpr;
    trace(BUS_ROUTE);
    const dotR = Math.min(5.5, 2.6 + zoom * 0.45) * dpr;
    for (const st of BUS_STOPS) {
      const [px, py] = w2s(st.x, st.z);
      g.beginPath();
      g.arc(px, py, dotR, 0, Math.PI * 2);
      g.fillStyle = '#fffaf0';
      g.fill();
      g.lineWidth = 1.6 * dpr;
      g.stroke();
    }
    // 地铁 1 号线：紫色虚线，站是 Ⓜ
    g.lineCap = 'butt';
    g.setLineDash([7 * dpr, 5 * dpr]);
    g.strokeStyle = 'rgba(128,88,190,0.95)';
    g.lineWidth = 2.6 * dpr;
    trace(METRO);
    g.setLineDash([]);
    for (const st of METRO_STOPS) {
      const [px, py] = w2s(st.x, st.z);
      const r = dotR * 1.25;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fillStyle = '#7a56bc';
      g.fill();
      g.strokeStyle = '#fffaf0';
      g.lineWidth = 1.4 * dpr;
      g.stroke();
      g.fillStyle = '#fffaf0';
      g.font = `800 ${Math.round(r * 1.25)}px "Microsoft YaHei","PingFang SC",sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('M', px, py + 0.5 * dpr);
    }
    // 高铁：老地图上铁路的画法——深色的线，里面一节节白
    g.strokeStyle = 'rgba(46,50,60,0.95)';
    g.lineWidth = lw(5, 3.4);
    trace(RAIL_LINE);
    g.setLineDash([lw(14, 7), lw(14, 7)]);
    g.strokeStyle = '#fbf6ea';
    g.lineWidth = lw(2.6, 1.6);
    trace(RAIL_LINE);
    g.setLineDash([]);
    g.lineCap = 'round';
    // 高铁站：🚄 的小牌子（去过的才画；城里已经有"高铁站"这个地点图标的就不重复）
    for (const st of RAIL_STATIONS) {
      if (!explored(st.x, st.z)) continue;
      if (places().some((it) => it.kind === 'station' && Math.hypot(it.x - st.x, it.z - st.z) < 45)) continue;
      const [px, py] = w2s(st.x, st.z);
      const fs = 11 * dpr * Math.min(1.3, 0.8 + zoom * 0.1);
      g.font = `700 ${fs}px "Segoe UI Emoji","Microsoft YaHei","PingFang SC",sans-serif`;
      const text = zoom >= 1.5 ? `🚄 ${st.name}` : '🚄';
      const tw = g.measureText(text).width + fs * 0.9;
      const th = fs * 1.7;
      g.beginPath();
      g.roundRect(px - tw / 2, py - th / 2, tw, th, th / 2);
      g.fillStyle = 'rgba(255,253,246,0.95)';
      g.fill();
      g.strokeStyle = 'rgba(46,50,60,0.85)';
      g.lineWidth = 1.4 * dpr;
      g.stroke();
      g.fillStyle = '#26333f';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, px, py + 0.5 * dpr);
    }
    // 地名（去过的才写）
    for (const d of DISTRICTS) {
      if (INNER.has(d.id) && zoom < 2.6) continue;
      if (!explored(d.x, d.z)) continue;
      const [px, py] = w2s(d.x, d.z);
      const big = BIG.has(d.kind);
      const s2 = (big ? 15 : 12.5) * dpr * Math.min(1.6, 0.75 + zoom * 0.18);
      // 有图标在同一处的，字写在图标上方，别压在一起
      const hasIcon = places().some((it) => Math.hypot(it.x - d.x, it.z - d.z) < Math.min(d.r * 0.6, 26));
      const lift = hasIcon ? 9 * dpr * Math.min(1.4, 0.7 + zoom * 0.15) + s2 * 0.75 : big ? 0 : 14 * dpr;
      label(d.name, px, py - lift, s2, big ? 800 : 700, big ? (['lake', 'beach', 'harbor', 'port'].includes(d.kind) ? '#2f5068' : ['forest', 'fields', 'mountain'].includes(d.kind) ? '#3f5a3a' : '#5a3424') : '#3a2e22');
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
    if (tab === 'world') {
      side.innerHTML = '<div class="bm-card"><div class="bm-title">幻想世界地图</div><div class="dim">手绘的总图：玉海城在正中，西边是 AI 小镇和鱼鱼家，东边和南边是海。</div></div><p class="dim">画是斜着俯瞰的，红色的图钉只是你大概在的位置。</p><div class="bm-sec">图例</div><div class="bm-legend"><span><i class="bm-line bus"></i>37 路公交</span><span><i class="bm-line metro"></i>地铁 1 号线</span><span><i class="bm-line hsr"></i>高铁线</span><span><i class="bm-line hwy"></i>公路</span></div>';
      return;
    }
    if (tab === 'district') {
      const cur = PAPERS.find((q) => q.id === paperShown) ?? PAPERS[0];
      const near = PAPERS.find((q) => q.id === paperAt(p.x, p.z));
      side.innerHTML = `<div class="bm-card"><div class="bm-title">${cur.name}</div><div class="dim">分区手绘图 · ${PAPERS.indexOf(cur) + 1} / ${PAPERS.length}</div>${cur !== near ? `<div class="bm-btns"><button data-act="near">回到我这儿（${near.name}）</button></div>` : '<div class="dim">你现在就在这一带。</div>'}</div><p class="dim">点图下面的名字翻到别的分区。</p>`;
      side.querySelector('[data-act="near"]')?.addEventListener('click', () => api.setPaper(null));
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
    html += `<div class="bm-sec">图例</div><div class="bm-legend">${[...cats].map(([cat, e]) => `<span>${e} ${cat}</span>`).join('')}<span><i class="bm-line bus"></i>37 路公交</span><span><i class="bm-line metro"></i>地铁 1 号线</span><span><i class="bm-line hsr"></i>高铁线</span><span><i class="bm-line road"></i>石板街</span><span><i class="bm-line hwy"></i>公路</span><span><i class="bm-line lane"></i>土路</span></div>`;
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
    /** 'map' 大地图 · 'world' 世界手绘图 · 'district' 分区手绘图 */
    setTab(t) {
      tab = ['map', 'world', 'district'].includes(t) ? t : 'map';
      for (const b of root.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
      root.classList.toggle('paper', tab !== 'map');
      root.classList.toggle('district', tab === 'district');
      showPaper();
      renderSide();
    },
    /** 分区手绘图翻到哪一张（PAPERS 里的 id）；null = 跟着人走 */
    setPaper(id) {
      paperPick = PAPERS.some((q) => q.id === id) ? id : null;
      if (tab !== 'district') return api.setTab('district');
      showPaper();
      renderSide();
    },
    get tab() {
      return tab;
    },
    get paper() {
      return tab === 'district' ? paperShown : tab === 'world' ? 'world' : null;
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
      paperPick = null;
      api.setTab('map');
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
      placeHere(p);
    },
  };
  // ---- 手绘的纸地图 ----
  const paper = $('bigmap-paper');
  const chips = $('bigmap-chips');
  chips.innerHTML = PAPERS.map((q) => `<button class="tab" data-paper="${q.id}">${q.name}</button>`).join('');
  for (const b of chips.querySelectorAll('[data-paper]')) b.addEventListener('click', () => api.setPaper(b.dataset.paper));
  function showPaper() {
    if (tab === 'map') return;
    const p = getPlayer();
    const id = tab === 'world' ? 'world' : (paperPick ?? paperAt(p.x, p.z));
    if (id !== paperShown || !paper.getAttribute('src')) {
      paperShown = id;
      paper.src = `./maps/v3/${id}.jpg`;
      paper.alt = tab === 'world' ? '幻想世界地图' : (PAPERS.find((q) => q.id === id)?.name ?? '');
    }
    for (const b of chips.querySelectorAll('[data-paper]')) b.classList.toggle('on', b.dataset.paper === id);
  }
  // 总图上的"你在这儿"：画是斜着俯瞰的，只能大概——横向 1900 米、纵向 1500 米铺满整张图。
  // 分区图没有靠得住的对应，不画。
  const here = document.createElement('div');
  here.className = 'bm-here';
  here.innerHTML = '<i></i><span>小鲸鱼在这儿</span>';
  paper.parentElement.append(here);
  function placeHere(p) {
    const show = open && tab === 'world';
    here.style.display = show ? '' : 'none';
    if (!show) return;
    // 图是 object-fit: contain 摆的：先算出它在框里实际占的那一块
    const view = paper.parentElement;
    const w = view.clientWidth;
    const h = view.clientHeight;
    const ar = paper.naturalWidth && paper.naturalHeight ? paper.naturalWidth / paper.naturalHeight : 1800 / 1120;
    const iw = Math.min(w, h * ar);
    const ih = iw / ar;
    const u = Math.min(0.985, Math.max(0.015, p.x / 1900 + 0.5));
    const v = Math.min(0.985, Math.max(0.015, p.z / 1500 + 0.5));
    here.classList.toggle('below', v < 0.12);
    here.classList.toggle('left', u > 0.86);
    here.style.left = `${(w - iw) / 2 + u * iw}px`;
    here.style.top = `${(h - ih) / 2 + v * ih}px`;
  }
  return api;
}
