// 界面：左上角的状态、底下的提示、右下角的小地图、还有各种面板（商店、烹饪、上网……）。
// 全部是 DOM，风格走吉卜力：奶油纸、墨蓝字、手写的圆角。
import { riverAt, RIVER_HALF, SEA, coastD, snowAt, heightAt, lakeDistance, forestAt, fieldsAt, smooth, DISTRICTS, YARDS, ROADS, BUS_ROUTE, METRO, RAIL, PLAZA, HALF, districtAt } from './plan.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    root: $('hud'),
    coins: $('stat-coins'),
    hunger: $('stat-hunger'),
    stamina: $('stat-stamina'),
    clock: $('stat-clock'),
    place: $('stat-place'),
    bag: $('bag'),
    prompt: $('prompt'),
    toast: $('toast'),
    panel: $('panel'),
    panelTitle: $('panel-title'),
    panelBody: $('panel-body'),
    panelFoot: $('panel-foot'),
    compass: $('compass'),
  };
  let toastTimer = 0;
  let panelOpen = false;

  const hud = {
    // 注意：不能叫 open，否则会和下面的 open() 方法撞名字（后者会覆盖 getter）
    get isOpen() {
      return panelOpen;
    },
    setStats(s) {
      el.coins.textContent = s.coins;
      el.hunger.style.width = `${Math.max(0, Math.min(100, s.hunger))}%`;
      el.stamina.style.width = `${Math.max(0, Math.min(100, s.stamina))}%`;
      el.clock.textContent = s.clock;
      el.place.textContent = s.place;
    },
    setBag(items) {
      el.bag.innerHTML = items
        .filter((i) => i.count > 0)
        .map((i) => `<span class="bag-item" title="${i.name}">${i.icon}<b>${i.count}</b></span>`)
        .join('');
    },
    prompt(text) {
      if (text) {
        const t = String(text).replace(/^E\s*/, '');
        el.prompt.innerHTML = `<kbd>E</kbd>${t}`;
        el.prompt.classList.add('on');
      } else el.prompt.classList.remove('on');
    },
    toast(text, ms = 2200) {
      el.toast.textContent = text;
      el.toast.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove('on'), ms);
    },
    /** 打开一个面板；body 是 HTML 字符串，buttons 是 [{label, onClick, primary, disabled, wide}] */
    open(title, body, buttons = [], { dock = false, grid = false } = {}) {
      el.panelTitle.textContent = title;
      el.panelBody.innerHTML = body;
      el.panelFoot.innerHTML = '';
      for (const btn of buttons) {
        const b = document.createElement('button');
        b.textContent = btn.label;
        if (btn.primary) b.className = 'primary';
        if (btn.disabled) b.disabled = true;
        if (btn.wide) b.classList.add('wide');
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          btn.onClick?.();
        });
        el.panelFoot.appendChild(b);
      }
      el.panel.classList.toggle('dock', dock);
      // grid：按钮排成两列（车站的目的地一多，一行行排下去太高）
      el.panelFoot.classList.toggle('grid', grid);
      el.panel.classList.add('on');
      el.root.classList.add('panel-open');
      panelOpen = true;
    },
    close() {
      el.panel.classList.remove('on');
      el.root.classList.remove('panel-open');
      panelOpen = false;
    },
    /** 面板里的实时区（倒计时、进度条要每帧刷） */
    refresh(id, html) {
      const n = document.getElementById(id);
      if (n) n.innerHTML = html;
    },
  };
  el.panel.addEventListener('click', (e) => {
    if (e.target === el.panel) hud.close();
  });
  return hud;
}

// ---- 小地图 ----------------------------------------------------------------------------------------------------
const MAP_SIZE = 512; // 烘出来的底图边长

/**
 * 把一串控制点顺成一条光滑的线：均匀 Catmull-Rom（tension 0.5，和 three 的 CatmullRomCurve3 'catmullrom' 一样，
 * 两头各补一个外推的点）。高铁线在世界里就是这么采的，地图上照样画才对得上。
 * @param pts [[x, z], ...]；per 每两个控制点之间采几段
 */
export function smoothLine(pts, per = 8) {
  const n = pts.length;
  if (n < 3) return pts.map((p) => [p[0], p[1]]);
  const P = (i) => (i < 0 ? [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]] : i >= n ? [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]] : pts[i]);
  const out = [];
  for (let i = 0; i + 1 < n; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (d) => {
        const m1 = 0.5 * (p2[d] - p0[d]);
        const m2 = 0.5 * (p3[d] - p1[d]);
        return (2 * t3 - 3 * t2 + 1) * p1[d] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[d] + (t3 - t2) * m2;
      };
      out.push([c(0), c(1)]);
    }
  }
  out.push([pts[n - 1][0], pts[n - 1][1]]);
  return out;
}

// heightAt 现在不便宜（海岸、河、十几块压平的地）：两张地图合用一张 4 米一格的高度表，中间双线性插值——
// 晕渲、等高线、水边都够细了，烘图的时间省下一大半。
const GRID = 512;
let grid = null;
/** 地图范围里 (x, z) 的高度（查表，第一次用的时候才算）。 */
export function gridHeight(x, z) {
  if (!grid) {
    grid = new Float32Array((GRID + 1) * (GRID + 1));
    const step = (HALF * 2) / GRID;
    for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) grid[j * (GRID + 1) + i] = heightAt(-HALF + i * step, -HALF + j * step);
  }
  const fx = Math.min(GRID - 0.001, Math.max(0, ((x + HALF) / (HALF * 2)) * GRID));
  const fz = Math.min(GRID - 0.001, Math.max(0, ((z + HALF) / (HALF * 2)) * GRID));
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const o = iz * (GRID + 1) + ix;
  const a = grid[o] + (grid[o + 1] - grid[o]) * tx;
  const b = grid[o + GRID + 1] + (grid[o + GRID + 2] - grid[o + GRID + 1]) * tx;
  return a + (b - a) * tz;
}
/** 铺了地的场子（广场、集市的院子、站前、货场）：0~1。路不算——路在地图上是另外画的线。 */
export function yardAt(x, z) {
  let p = 1 - smooth(29.5, 31.5, Math.hypot(x - PLAZA[0], z - PLAZA[1]));
  for (const d of DISTRICTS) {
    if (!d.yard || Math.abs(x - d.x) > d.yard + 2 || Math.abs(z - d.z) > d.yard + 2) continue;
    p = Math.max(p, 1 - smooth(d.yard - 1.5, d.yard + 1.5, Math.hypot(x - d.x, z - d.z)));
  }
  for (const [yx, yz, yr] of YARDS) {
    if (!yr || Math.abs(x - yx) > yr + 2 || Math.abs(z - yz) > yr + 2) continue;
    p = Math.max(p, 1 - smooth(yr - 1.5, yr + 1.5, Math.hypot(x - yx, z - yz)));
  }
  return p;
}

/** 把地形烘成一张 512×512 的底图：高度明暗 + 铺装 + 水 + 沙 + 雪 + 林 + 田，上面再描路、铁路、公交和地铁。 */
export function bakeMinimap() {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  const g = canvas.getContext('2d');
  const img = g.createImageData(MAP_SIZE, MAP_SIZE);
  const toWorld = (i, j) => [-HALF + (i / (MAP_SIZE - 1)) * HALF * 2, -HALF + (j / (MAP_SIZE - 1)) * HALF * 2];
  const heights = new Float32Array(MAP_SIZE * MAP_SIZE);
  for (let j = 0; j < MAP_SIZE; j++) {
    for (let i = 0; i < MAP_SIZE; i++) {
      const [x, z] = toWorld(i, j);
      heights[j * MAP_SIZE + i] = gridHeight(x, z);
    }
  }
  const at = (i, j) => heights[Math.min(MAP_SIZE - 1, Math.max(0, j)) * MAP_SIZE + Math.min(MAP_SIZE - 1, Math.max(0, i))];
  for (let j = 0; j < MAP_SIZE; j++) {
    for (let i = 0; i < MAP_SIZE; i++) {
      const [x, z] = toWorld(i, j);
      const h = at(i, j);
      const hx = at(i + 1, j) - at(i - 1, j);
      const hz = at(i, j + 1) - at(i, j - 1);
      let shade = Math.max(0.5, Math.min(1.25, 0.94 - hz * 0.12 - hx * 0.08));
      let r = 146;
      let gr = 180;
      let bl = 118;
      // 山：越高越灰、越白
      const m = smooth(150, 300, h);
      const peak = h > 240 ? Math.min(1, (h - 240) / 70) : 0;
      r = r * (1 - m * 0.5) + 150 * m * 0.5;
      gr = gr * (1 - m * 0.5) + 148 * m * 0.5;
      bl = bl * (1 - m * 0.5) + 146 * m * 0.5;
      // 林
      const f = forestAt(x, z);
      r = r * (1 - f * 0.55) + 92 * f * 0.55;
      gr = gr * (1 - f * 0.4) + 136 * f * 0.4;
      bl = bl * (1 - f * 0.5) + 98 * f * 0.5;
      // 田
      const fd = fieldsAt(x, z);
      r = r * (1 - fd * 0.7) + 226 * fd * 0.7;
      gr = gr * (1 - fd * 0.7) + 198 * fd * 0.7;
      bl = bl * (1 - fd * 0.7) + 112 * fd * 0.7;
      // 雪：雪山小镇那一片，和高处的雪线
      const snow = Math.max(peak, snowAt(x, z));
      r = r * (1 - snow) + 244 * snow;
      gr = gr * (1 - snow) + 246 * snow;
      bl = bl * (1 - snow) + 250 * snow;
      // 水、沙滩、铺装
      const cd = coastD(x, z);
      const ld = lakeDistance(x, z);
      const rv = riverAt(x, z);
      if (ld < 1.0 || (rv.d < RIVER_HALF + 2 && cd > -30) || (h < SEA.level && cd < 60)) {
        // 海越深越蓝
        const deep = cd < 0 ? Math.min(1, -cd / 320) : 0;
        r = 112 - 26 * deep;
        gr = 168 - 26 * deep;
        bl = 198 - 12 * deep;
        shade = 1;
      } else if (ld < 1.06 || (cd < 160 && h < SEA.level + 2.4)) {
        r = 232;
        gr = 218;
        bl = 176;
        shade = 1;
      } else {
        const p = yardAt(x, z);
        r = r * (1 - p) + 206 * p;
        gr = gr * (1 - p) + 198 * p;
        bl = bl * (1 - p) + 180 * p;
      }
      const k = (j * MAP_SIZE + i) * 4;
      img.data[k] = Math.min(255, r * shade);
      img.data[k + 1] = Math.min(255, gr * shade);
      img.data[k + 2] = Math.min(255, bl * shade);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // 线：1 像素 = 4 米，所以都画得比真的宽，雷达里才看得见
  const w2m = (x, z) => [((x + HALF) / (HALF * 2)) * MAP_SIZE, ((z + HALF) / (HALF * 2)) * MAP_SIZE];
  const path = (pts) => {
    g.beginPath();
    pts.forEach(([x, z], i) => {
      const [px, py] = w2m(x, z);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.stroke();
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // 土路：细的棕色虚线
  g.setLineDash([2.5, 2.5]);
  g.strokeStyle = 'rgba(128,98,62,0.85)';
  g.lineWidth = 1.2;
  for (const line of ROADS) if (line.kind === 'lane') path(line);
  g.setLineDash([]);
  // 公路（灰米色）和石板街（奶油色）：先一道深边，再填
  g.strokeStyle = 'rgba(104,90,72,0.7)';
  g.lineWidth = 3.8;
  for (const line of ROADS) if (line.kind !== 'lane') path(line);
  g.lineWidth = 2.5;
  g.strokeStyle = '#d6cdbb';
  for (const line of ROADS) if (line.kind === 'road') path(line);
  g.strokeStyle = '#f8f0da';
  for (const line of ROADS) if (line.kind === 'street') path(line);
  // 广场
  const [plx, ply] = w2m(PLAZA[0], PLAZA[1]);
  g.fillStyle = '#f2e8cf';
  g.strokeStyle = 'rgba(104,90,72,0.7)';
  g.lineWidth = 0.7;
  g.beginPath();
  g.arc(plx, ply, (30 / (HALF * 2)) * MAP_SIZE, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // 37 路公交：橙线压在路中间
  g.strokeStyle = 'rgba(236,138,44,0.95)';
  g.lineWidth = 1.1;
  path(BUS_ROUTE);
  // 地铁 1 号线：紫色虚线
  g.lineCap = 'butt';
  g.setLineDash([3, 2]);
  g.strokeStyle = 'rgba(134,92,196,0.95)';
  g.lineWidth = 1.5;
  path(METRO);
  // 高铁：深色的线，中间白色的节
  const rail = smoothLine(RAIL, 6);
  g.setLineDash([]);
  g.strokeStyle = 'rgba(52,56,66,0.95)';
  g.lineWidth = 2.4;
  path(rail);
  g.setLineDash([3, 3]);
  g.strokeStyle = 'rgba(250,248,240,0.95)';
  g.lineWidth = 1.1;
  path(rail);
  g.setLineDash([]);
  return canvas;
}

/**
 * 小地图：平时是以人为中心的雷达（半径 260 m），按 M 切成全图。
 */
export function createMinimap(canvas, baked) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  let full = false;
  let blink = 0;
  let interactables = [];
  const placeEl = document.getElementById('minimap-place');
  let placeName = null;

  const w2mFull = (x, z) => [((x + HALF) / (HALF * 2)) * W, ((z + HALF) / (HALF * 2)) * H];

  const api = {
    get full() {
      return full;
    },
    toggle() {
      full = !full;
      api.label = full ? '全图  M 关闭' : 'M 全图';
    },
    label: 'M 全图',
    setInteractables(list) {
      interactables = list;
    },
    /** @param s {x, z, yaw, meters} */
    draw(dt, s) {
      blink += dt;
      g.clearRect(0, 0, W, H);
      g.save();
      if (full) {
        // 整张图缩进画布
        g.drawImage(baked, 0, 0, W, H);
        // 交互点
        for (const it of interactables) {
          if (it.map === false) continue;
          const [px, py] = w2mFull(it.x, it.z);
          api.marker(px, py, it);
        }
        // 人
        const [px, py] = w2mFull(s.x, s.z);
        api.arrow(px, py, s.yaw, 6);
        g.restore();
        api.place(s);
        return;
      }
      // 雷达：把人周围 520 m 见方画满
      const span = 520;
      const scale = W / span;
      const sx = ((s.x + HALF) / (HALF * 2)) * baked.width - (span / (HALF * 2)) * baked.width * 0.5;
      const sz = ((s.z + HALF) / (HALF * 2)) * baked.height - (span / (HALF * 2)) * baked.height * 0.5;
      const sw = (span / (HALF * 2)) * baked.width;
      g.fillStyle = '#1d2a33';
      g.fillRect(0, 0, W, H);
      g.drawImage(baked, sx, sz, sw, sw, 0, 0, W, H);
      const w2m = (x, z) => [W / 2 + (x - s.x) * scale, H / 2 + (z - s.z) * scale];
      // 交互点（只画近的）
      for (const it of interactables) {
        if (it.map === false) continue;
        const d = Math.hypot(it.x - s.x, it.z - s.z);
        if (d > span * 0.55) continue;
        const [px, py] = w2m(it.x, it.z);
        api.marker(px, py, it);
      }
      // 目标：在圈里就画图钉，不在就在边上画一个指向它的小三角
      if (s.waypoint) {
        const [wx, wy] = w2m(s.waypoint.x, s.waypoint.z);
        const inside = wx > 8 && wy > 8 && wx < W - 8 && wy < H - 8;
        g.fillStyle = '#e0533a';
        g.strokeStyle = '#fff8ee';
        g.lineWidth = 1.5;
        if (inside) {
          g.beginPath();
          g.arc(wx, wy - 6, 4.5, 0, Math.PI * 2);
          g.moveTo(wx - 3.5, wy - 4);
          g.lineTo(wx, wy + 2);
          g.lineTo(wx + 3.5, wy - 4);
          g.fill();
          g.stroke();
        } else {
          const a = Math.atan2(wy - H / 2, wx - W / 2);
          const ex = W / 2 + Math.cos(a) * (W / 2 - 9);
          const ey = H / 2 + Math.sin(a) * (H / 2 - 9);
          g.save();
          g.translate(ex, ey);
          g.rotate(a);
          g.beginPath();
          g.moveTo(7, 0);
          g.lineTo(-4, -5);
          g.lineTo(-4, 5);
          g.closePath();
          g.fill();
          g.stroke();
          g.restore();
        }
      }
      // 人
      api.arrow(W / 2, H / 2, s.yaw, 7);
      // 指北：一块奶油色的小圆牌，上面一个红尖
      g.fillStyle = 'rgba(255,249,232,0.86)';
      g.strokeStyle = 'rgba(79,66,52,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(W - 16, 16, 10, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#c2543f';
      g.beginPath();
      g.moveTo(W - 16, 7.5);
      g.lineTo(W - 12.8, 12.5);
      g.lineTo(W - 19.2, 12.5);
      g.closePath();
      g.fill();
      g.fillStyle = '#4f4234';
      g.font = 'bold 10px ui-sans-serif,system-ui,sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('N', W - 16, 19.5);
      g.restore();
      api.place(s);
    },
    /** 小地图底下左边写脚下的地名（s.place 有就用它，比如在屋里） */
    place(s) {
      if (!placeEl) return;
      const name = s.place ?? districtAt(s.x, s.z)?.name ?? '郊外';
      if (name !== placeName) placeEl.textContent = placeName = name;
    },
    marker(px, py, it) {
      const pulse = 0.6 + 0.4 * Math.sin(blink * 3 + (it.x % 7));
      g.beginPath();
      g.arc(px, py, it.kind === 'fish' ? 3.4 : 2.9, 0, Math.PI * 2);
      g.fillStyle = COLOR[it.kind] ?? '#f6e7b8';
      g.globalAlpha = pulse;
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(20,30,40,0.75)';
      g.lineWidth = 1;
      g.stroke();
    },
    arrow(px, py, yaw, size) {
      g.save();
      g.translate(px, py);
      // yaw 是她的朝向：世界 +z 向下（画布 y+）
      g.rotate(-yaw + Math.PI);
      g.beginPath();
      g.moveTo(0, -size);
      g.lineTo(size * 0.66, size * 0.72);
      g.lineTo(0, size * 0.28);
      g.lineTo(-size * 0.66, size * 0.72);
      g.closePath();
      // 深色的外圈 + 奶白的内圈：压在草地、屋顶、海上都看得清
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(46,34,28,0.75)';
      g.lineWidth = 4;
      g.stroke();
      g.strokeStyle = '#fff8ee';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#ff5a3c';
      g.fill();
      g.restore();
    },
  };
  return api;
}

const COLOR = {
  door: '#ffd166',
  net: '#7ec8ff',
  arcade: '#c792ea',
  shop: '#8fe08a',
  market: '#ffb07c',
  seed: '#f5a3c7',
  eat: '#ff9a6c',
  fish: '#6fd3e8',
  plant: '#9ae66e',
  read: '#e0c9a6',
  study: '#cbd5a0',
  pray: '#d8c2ff',
  guild: '#ffcf5c',
  sport: '#8ad2ff',
  home: '#f0e2c8',
  gate: '#e8dcc8',
  wish: '#a8e6ff',
  board: '#e8dcc8',
  farm: '#c8e6a0',
  gather: '#f7bfe0',
  mail: '#e8dcc8',
  bus: '#f0a64a',
  station: '#7ab4e8',
  fishmarket: '#6fc3e8',
  village: '#e8dcc8',
  orchard: '#f2b6a0',
  pick: '#c8e6a0',
};
