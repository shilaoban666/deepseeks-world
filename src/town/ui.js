// 界面：左上角的状态、底下的提示、右下角的小地图、还有各种面板（商店、烹饪、上网……）。
// 全部是 DOM，风格走吉卜力：奶油纸、墨蓝字、手写的圆角。
import { riverAt, RIVER_HALF, riverLevel, SEA, heightAt, lakeDistance, pavedAt, forestAt, fieldsAt, mountainAt, DISTRICTS, ROADS, PLAZA, LAKE, HALF, districtAt } from './plan.js';

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
    /** 打开一个面板；body 是 HTML 字符串，buttons 是 [{label, onClick, primary}] */
    open(title, body, buttons = []) {
      el.panelTitle.textContent = title;
      el.panelBody.innerHTML = body;
      el.panelFoot.innerHTML = '';
      for (const btn of buttons) {
        const b = document.createElement('button');
        b.textContent = btn.label;
        if (btn.primary) b.className = 'primary';
        if (btn.disabled) b.disabled = true;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          btn.onClick?.();
        });
        el.panelFoot.appendChild(b);
      }
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

/** 把地形烘成一张 512×512 的底图：高度明暗 + 铺装 + 水 + 林 + 田。 */
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
      heights[j * MAP_SIZE + i] = heightAt(x, z);
    }
  }
  const at = (i, j) => heights[Math.min(MAP_SIZE - 1, Math.max(0, j)) * MAP_SIZE + Math.min(MAP_SIZE - 1, Math.max(0, i))];
  for (let j = 0; j < MAP_SIZE; j++) {
    for (let i = 0; i < MAP_SIZE; i++) {
      const [x, z] = toWorld(i, j);
      const h = at(i, j);
      const hx = at(i + 1, j) - at(i - 1, j);
      const hz = at(i, j + 1) - at(i, j - 1);
      const shade = Math.max(0.4, Math.min(1.3, 0.92 - hz * 0.12 - hx * 0.08));
      let r = 138;
      let gr = 172;
      let bl = 116;
      // 山：越高越灰、越白
      const m = mountainAt(x, z);
      const snow = h > 240 ? Math.min(1, (h - 240) / 70) : 0;
      r = r * (1 - m * 0.5) + 150 * m * 0.5;
      gr = gr * (1 - m * 0.5) + 148 * m * 0.5;
      bl = bl * (1 - m * 0.5) + 146 * m * 0.5;
      r = r * (1 - snow) + 246 * snow;
      gr = gr * (1 - snow) + 248 * snow;
      bl = bl * (1 - snow) + 252 * snow;
      // 林
      const f = forestAt(x, z);
      r = r * (1 - f * 0.55) + 96 * f * 0.55;
      gr = gr * (1 - f * 0.4) + 138 * f * 0.4;
      bl = bl * (1 - f * 0.5) + 100 * f * 0.5;
      // 田
      const fd = fieldsAt(x, z);
      r = r * (1 - fd * 0.6) + 208 * fd * 0.6;
      gr = gr * (1 - fd * 0.6) + 190 * fd * 0.6;
      bl = bl * (1 - fd * 0.6) + 116 * fd * 0.6;
      // 铺装（城里）
      const p = pavedAt(x, z);
      r = r * (1 - p) + 196 * p;
      gr = gr * (1 - p) + 188 * p;
      bl = bl * (1 - p) + 172 * p;
      // 水
      const rv = riverAt(x, z);
      if (lakeDistance(x, z) < 1.0 || (rv.d < RIVER_HALF + 2) || (x > 560 && heightAt(x, z) < SEA.level)) {
        r = 96;
        gr = 150;
        bl = 184;
      } else if (lakeDistance(x, z) < 1.06) {
        r = 178;
        gr = 186;
        bl = 168;
      }
      const k = (j * MAP_SIZE + i) * 4;
      img.data[k] = Math.min(255, r * shade);
      img.data[k + 1] = Math.min(255, gr * shade);
      img.data[k + 2] = Math.min(255, bl * shade);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // 路：深一点的一条线
  const w2m = (x, z) => [((x + HALF) / (HALF * 2)) * MAP_SIZE, ((z + HALF) / (HALF * 2)) * MAP_SIZE];
  g.strokeStyle = 'rgba(150,138,120,0.95)';
  g.lineWidth = Math.max(2, (9 / (HALF * 2)) * MAP_SIZE * 1.6);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const line of ROADS) {
    g.beginPath();
    line.forEach(([x, z], i) => {
      const [px, py] = w2m(x, z);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.stroke();
  }
  // 广场
  const [plx, ply] = w2m(PLAZA[0], PLAZA[1]);
  g.fillStyle = 'rgba(214,204,182,0.95)';
  g.beginPath();
  g.arc(plx, ply, (30 / (HALF * 2)) * MAP_SIZE, 0, Math.PI * 2);
  g.fill();
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
          const [px, py] = w2mFull(it.x, it.z);
          api.marker(px, py, it);
        }
        // 人
        const [px, py] = w2mFull(s.x, s.z);
        api.arrow(px, py, s.yaw, 6);
        g.restore();
        return;
      }
      // 雷达：把人周围 520 m 见方画满
      const span = 520;
      const scale = W / span;
      const sx = ((s.x + HALF) / (HALF * 2)) * baked.width - (span / (HALF * 2)) * baked.width * 0.5;
      const sw = (span / (HALF * 2)) * baked.width;
      g.fillStyle = '#1d2a33';
      g.fillRect(0, 0, W, H);
      g.drawImage(baked, sx, sx, sw, sw, 0, 0, W, H);
      const w2m = (x, z) => [W / 2 + (x - s.x) * scale, H / 2 + (z - s.z) * scale];
      // 交互点（只画近的）
      for (const it of interactables) {
        const d = Math.hypot(it.x - s.x, it.z - s.z);
        if (d > span * 0.55) continue;
        const [px, py] = w2m(it.x, it.z);
        api.marker(px, py, it);
      }
      // 人
      api.arrow(W / 2, H / 2, s.yaw, 7);
      // 指北
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.font = 'bold 11px ui-sans-serif,system-ui,sans-serif';
      g.textAlign = 'center';
      g.fillText('N', W / 2, 14);
      g.restore();
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
      g.fillStyle = '#ff6a4d';
      g.fill();
      g.strokeStyle = '#fff8ee';
      g.lineWidth = 1.6;
      g.stroke();
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
};