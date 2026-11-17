// 新增的界面：底部动作栏、顶上的天气牌、氧气条、水下的蓝、背包和天气两个面板。
// 和原来的 HUD 一个画风：奶油纸、墨蓝字、圆角。全是 DOM，点按钮和按键是一回事。
const $ = (id) => document.getElementById(id);

const DIRS = ['东', '东南', '南', '西南', '西', '西北', '北', '东北'];
/** 风往哪儿吹 → 风从哪儿来（"北风"是从北边吹来的） */
const windName = (angle) => {
  // 世界坐标 x 东、z 南；angle 是风吹向的方向
  const from = Math.atan2(-Math.sin(angle), -Math.cos(angle));
  const i = Math.round(((from + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return `${DIRS[i]}风`;
};
const windLevel = (v) => (v < 1.5 ? 0 : v < 3.4 ? 2 : v < 5.5 ? 3 : v < 8 ? 4 : v < 10.8 ? 5 : 6);

/**
 * @param o.actions 动作系统；o.weather 天气；o.game 游戏；o.hud 原来的 HUD
 */
export function createPanels({ actions, weather, game, hud, onAction }) {
  const bar = $('actionbar');
  const chip = $('weather-chip');
  const o2 = $('o2');
  const o2bar = $('stat-o2');
  const water = $('underwater');
  const buttons = new Map();
  let lastKey = '';

  const ensure = (list) => {
    const key = list.map((a) => a.id + a.label).join('|');
    if (key === lastKey) return;
    lastKey = key;
    bar.innerHTML = '';
    buttons.clear();
    for (const a of list) {
      const b = document.createElement('button');
      b.className = 'act';
      b.innerHTML = `<kbd>${a.key}</kbd><span>${a.label}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onAction(a.id);
      });
      bar.appendChild(b);
      buttons.set(a.id, b);
    }
    // 背包和天气两个面板的入口
    for (const [id, k, label] of [
      ['bag', 'B', '背包'],
      ['weather', 'T', '天气'],
    ]) {
      const b = document.createElement('button');
      b.className = 'act menu';
      b.innerHTML = `<kbd>${k}</kbd><span>${label}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onAction(id);
      });
      bar.appendChild(b);
    }
  };

  const panels = {
    update(indoor, camera) {
      const list = actions.available(indoor);
      ensure(list);
      for (const a of list) buttons.get(a.id)?.classList.toggle('off', !a.on);
      bar.classList.toggle('indoor', indoor);
      // 天气牌
      const w = weather.info;
      chip.innerHTML = `<span class="wi">${w.icon}</span><b>${w.name}</b><span class="dim">${w.temp}°C · ${windName(w.windAngle)} ${windLevel(w.wind)} 级${w.auto ? '' : ' · 手动'}</span>`;
      // 氧气
      const diving = actions.mode === 'dive';
      o2.classList.toggle('on', diving);
      o2bar.style.width = `${actions.oxygen}%`;
      // 水下
      water.classList.toggle('on', !indoor && actions.underwater(camera) != null);
    },
    openBag() {
      const items = game.bagList().filter((i) => i.count > 0);
      const grid = items.length
        ? `<div class="bag-grid">${items.map((i) => `<button class="slot" data-k="${i.key}"><span class="ic">${i.icon}</span><b>${i.name}</b><i>×${i.count}</i></button>`).join('')}</div>`
        : '<p class="dim">空空的。去集市、湖边、菜地转转吧。</p>';
      hud.open('背包', `<p class="dim">金币 ${game.state.coins} · 饱食 ${Math.round(game.state.hunger)} · 体力 ${Math.round(game.state.stamina)}</p>${grid}<p id="bag-msg" class="dim">点一样东西用掉它。</p>`, [{ label: '关上', onClick: () => hud.close() }]);
      for (const el of document.querySelectorAll('.bag-grid .slot')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const msg = game.use(el.dataset.k);
          panels.openBag();
          hud.refresh('bag-msg', msg);
        });
      }
    },
    openWeather() {
      const cur = weather.info;
      const cells = weather.list
        .map((w) => `<button class="slot wx${w.kind === cur.kind ? ' cur' : ''}" data-w="${w.kind}"><span class="ic">${w.icon}</span><b>${w.name}</b><i>${w.temp}°</i></button>`)
        .join('');
      hud.open(
        '天气',
        `<p>现在：${cur.icon} ${cur.name}，${cur.temp}°C，${windName(cur.windAngle)} ${windLevel(cur.wind)} 级。${cur.wet > 0.3 ? '地上还湿着。' : ''}</p><div class="bag-grid">${cells}</div><p class="dim">点一个就换过去（云、风、雨是慢慢来的）。雷雨天闪电会劈着草地；晴天按 G 点火，火会顺着风烧开，下雨能浇灭。</p>`,
        [
          { label: weather.auto ? '自动换天气：开' : '恢复自动换天气', primary: !weather.auto, onClick: () => { weather.set('auto'); panels.openWeather(); } },
          { label: '劈一道闪电', onClick: () => onAction('strike') },
          { label: '关上', onClick: () => hud.close() },
        ],
      );
      for (const el of document.querySelectorAll('.bag-grid .wx')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          weather.set(el.dataset.w);
          panels.openWeather();
        });
      }
    },
  };
  return panels;
}
