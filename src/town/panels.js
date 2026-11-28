// 《煤炭镇的小白》风格昭和手账界面：
// 顶部角标功能栏、清爽单行动作栏、手账双栏背包、五分类博物图鉴（鱼/鸟兽/农作物/种子/建筑地标）、
// 以及完整设置面板（画面/吉卜力笔触/音效/界面开关/快捷键表）。
import { FISH, RARITY, WATER_NAME, spriteStyle } from './fishdex.js';
import {
  CROPS,
  CRITTERS_DEX,
  BUILDINGS_DEX,
  EMOTE_CATALOG,
  produceSprite,
  plantSprite,
  getItemInfo,
  loadSettings,
  saveSettings,
  loadEmoteSlots,
  saveEmoteSlots,
  playUiSound,
} from './encyclopedia.js';

const $ = (id) => document.getElementById(id);

const DIRS = ['东', '东南', '南', '西南', '西', '西北', '北', '东北'];
const windName = (angle) => {
  const from = Math.atan2(-Math.sin(angle), -Math.cos(angle));
  const i = Math.round(((from + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return `${DIRS[i]}风`;
};
const windLevel = (v) => (v < 1.5 ? 0 : v < 3.4 ? 2 : v < 5.5 ? 3 : v < 8 ? 4 : v < 10.8 ? 5 : 6);

const BAG_CATS = [
  { id: 'all', label: '全部' },
  { id: 'food', label: '🍱 食物料理' },
  { id: 'seed', label: '🌱 种子袋' },
  { id: 'produce', label: '🌾 农产与海产' },
];

const DEX_CATS = [
  { id: 'fish', label: '🐟 鱼类' },
  { id: 'critters', label: '🐦 飞鸟与动物' },
  { id: 'crops', label: '🌾 农作物' },
  { id: 'seeds', label: '🌱 种子' },
  { id: 'buildings', label: '🏡 小镇建筑' },
];

const CAT_LABELS = { food: '食物 / 料理', seed: '种植种子', produce: '农产 / 采集' };

/**
 * @param o.actions 动作系统；o.weather 天气；o.game 游戏；o.hud HUD；o.renderer / o.frame / o.quality 画面控制
 */
export function createPanels({
  actions,
  weather,
  game,
  hud,
  onAction,
  fishSprites = {},
  farmSprites = {},
  renderer = null,
  frame = null,
  quality = 'high',
  getPaint = () => 3,
  setPaint = () => {},
  onQualityChange = () => {},
  onPlayEmote = () => {},
}) {
  const bar = $('actionbar');
  const chip = $('weather-chip');
  const o2 = $('o2');
  const o2bar = $('stat-o2');
  const water = $('underwater');
  const cornerMenu = $('corner-menu');
  const buttons = new Map();
  let lastKey = '';

  // 持久化设置、表情快捷键槽位 & 博物图鉴发现记录
  const settings = loadSettings();
  const emoteSlots = loadEmoteSlots();
  const emoteById = Object.fromEntries(EMOTE_CATALOG.map((e) => [e.id, e]));
  const discovered = {
    critters: new Set(CRITTERS_DEX.filter((c) => c.defaultUnlocked).map((c) => c.id)),
    buildings: new Set(BUILDINGS_DEX.filter((b) => b.defaultUnlocked).map((b) => b.id)),
    crops: new Set(),
    seeds: new Set(['napa-cabbage', 'radish', 'tomato']),
  };
  try {
    const savedDisc = JSON.parse(localStorage.getItem('tg-dex-extra') || 'null');
    if (savedDisc) {
      for (const k of ['critters', 'buildings', 'crops', 'seeds']) {
        if (Array.isArray(savedDisc[k])) savedDisc[k].forEach((id) => discovered[k].add(id));
      }
    }
  } catch {}
  const saveDiscovered = () => {
    try {
      localStorage.setItem(
        'tg-dex-extra',
        JSON.stringify({
          critters: [...discovered.critters],
          buildings: [...discovered.buildings],
          crops: [...discovered.crops],
          seeds: [...discovered.seeds],
        }),
      );
    } catch {}
  };

  const applySettings = () => {
    document.body.classList.toggle('hide-minimap', !settings.showMinimap);
    document.body.classList.toggle('hide-actionbar', !settings.showActionbar);
    document.body.classList.toggle('hide-help', !settings.showHelp);
    document.body.classList.toggle('hide-quickbag', !settings.showQuickbag);
    saveSettings(settings);
  };
  applySettings();

  // 绑定右上角手账菜单与顶部天气牌点击
  if (cornerMenu) {
    for (const btn of cornerMenu.querySelectorAll('.cm-btn')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        playUiSound('open', settings);
        onAction(btn.dataset.menu);
      });
    }
  }
  if (chip) {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      playUiSound('open', settings);
      onAction('weather');
    });
  }

  const ensure = (list) => {
    const key = list.map((a) => a.id + a.label).join('|');
    if (key === lastKey) return;
    lastKey = key;
    bar.innerHTML = '';
    buttons.clear();
    // 底部只保留动作快捷键（单行清爽，绝不与交互提示重合；菜单入口已移至右上角）
    for (const a of list) {
      const b = document.createElement('button');
      b.className = 'act';
      b.innerHTML = `<kbd>${a.key}</kbd><span>${a.label}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        playUiSound('click', settings);
        onAction(a.id);
      });
      bar.appendChild(b);
      buttons.set(a.id, b);
    }
  };

  const syncBagDiscoveries = () => {
    let changed = false;
    for (const c of CROPS) {
      if ((game.state.bag[c.id] ?? 0) > 0 && !discovered.crops.has(c.id)) {
        discovered.crops.add(c.id);
        changed = true;
      }
      if ((game.state.bag[`seed-${c.id}`] ?? 0) > 0 && !discovered.seeds.has(c.id)) {
        discovered.seeds.add(c.id);
        changed = true;
      }
    }
    if (changed) saveDiscovered();
  };

  const panels = {
    settings,
    applySettings,
    /** 读取 1~9 快捷键当前绑定的 dsh-pet 表情动作 */
    getEmoteForKey(index) {
      const id = emoteSlots[index];
      return emoteById[id] ?? EMOTE_CATALOG[index] ?? null;
    },
    /** 表情与 dsh-pet 动作面板（点击立即播放，或先选上方 1~9 槽位再点动作进行绑定） */
    openEmotes(bindSlot = null) {
      const slotsHtml = emoteSlots
        .map((id, idx) => {
          const em = emoteById[id] ?? EMOTE_CATALOG[0];
          const sel = bindSlot === idx;
          return `<button class="emote-slot${sel ? ' sel' : ''}" data-eslot="${idx}" title="点击后选择下方动作绑定到数字键 ${idx + 1}">
            <kbd>${idx + 1}</kbd>
            <span class="es-ic">${em.icon}</span>
            <span>${em.label.slice(0, 2)}</span>
          </button>`;
        })
        .join('');

      const cardsHtml = EMOTE_CATALOG.map(
        (em) =>
          `<button class="emote-card" data-eid="${em.id}">
            <span class="em-ic">${em.icon}</span>
            <b>${em.label}</b>
            <small>${em.cat}</small>
          </button>`,
      ).join('');

      const tip =
        bindSlot != null
          ? `<b class="ok">正在设置快捷键 [${bindSlot + 1}]：点击下方任意动作即可绑定</b>`
          : '点击下方表情立即让小鲸鱼表演；先点上方数字槽位 [1~9] 可自定义快捷键绑定（适配 dsh-pet 动作库）。';

      hud.open(
        '小鲸鱼表情与动作',
        `<p class="dim" style="margin-bottom:8px">${tip}</p>
         <div class="emote-slots">${slotsHtml}</div>
         <div class="emote-grid">${cardsHtml}</div>`,
        [
          ...(bindSlot != null ? [{ label: '取消绑定', onClick: () => panels.openEmotes(null) }] : []),
          { label: '完成', primary: true, onClick: () => { playUiSound('close', settings); hud.close(); } },
        ],
        { wide: true },
      );

      for (const el of document.querySelectorAll('.emote-slots .emote-slot')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          playUiSound('click', settings);
          const idx = Number(el.dataset.eslot);
          panels.openEmotes(bindSlot === idx ? null : idx);
        });
      }
      for (const el of document.querySelectorAll('.emote-grid .emote-card')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const em = emoteById[el.dataset.eid];
          if (!em) return;
          if (bindSlot != null) {
            emoteSlots[bindSlot] = em.id;
            saveEmoteSlots(emoteSlots);
            playUiSound('page', settings);
            hud.toast(`数字键 ${bindSlot + 1} 已绑定：${em.icon} ${em.label}`, 1600);
            panels.openEmotes(null);
          } else {
            playUiSound('click', settings);
            hud.close();
            onPlayEmote(em);
          }
        });
      }
    },
    /** 随探索自动收录附近地标建筑与栖息小动物 */
    recordExplore(x, z, placeName = '', isNight = false) {
      let changed = false;
      for (const b of BUILDINGS_DEX) {
        if (!discovered.buildings.has(b.id) && b.pos && Math.hypot(x - b.pos[0], z - b.pos[1]) < 95) {
          discovered.buildings.add(b.id);
          changed = true;
        }
      }
      for (const c of CRITTERS_DEX) {
        if (discovered.critters.has(c.id)) continue;
        if (c.id === 'firefly' && isNight) {
          discovered.critters.add(c.id);
          changed = true;
        } else if (c.placeMatch && c.placeMatch.test(placeName)) {
          discovered.critters.add(c.id);
          changed = true;
        }
      }
      if (changed) saveDiscovered();
    },

    update(indoor, camera) {
      const list = actions.available(indoor);
      ensure(list);
      for (const a of list) buttons.get(a.id)?.classList.toggle('off', !a.on);
      bar.classList.toggle('indoor', indoor);
      const w = weather.info;
      chip.innerHTML = `<span class="wi">${w.icon}</span><b>${w.name}</b><span class="dim">${w.temp}°C · ${windName(w.windAngle)} ${windLevel(w.wind)} 级</span>`;
      const diving = actions.mode === 'dive';
      o2.classList.toggle('on', diving);
      o2bar.style.width = `${actions.oxygen}%`;
      water.classList.toggle('on', !indoor && actions.underwater(camera) != null);
    },

    /** 《煤炭镇的小白》风格双栏手账背包 */
    openBag(cat = 'all', selectedKey = null) {
      syncBagDiscoveries();
      const allItems = game.bagList().filter((i) => i.count > 0);
      const items = allItems.filter((i) => cat === 'all' || getItemInfo(i).cat === cat);
      const sel = items.find((i) => i.key === selectedKey) ?? items[0] ?? null;
      const selInfo = sel ? getItemInfo(sel) : null;
      const canUse = sel && !sel.seedOf;

      const tabsHtml = BAG_CATS.map(
        (c) => `<button class="nb-tab${c.id === cat ? ' on' : ''}" data-cat="${c.id}">${c.label}</button>`,
      ).join('');

      const slotsHtml = items.length
        ? items
            .map(
              (i) =>
                `<button class="bag-card${sel?.key === i.key ? ' sel' : ''}" data-k="${i.key}">
                  <span class="qty">×${i.count}</span>
                  <span class="ic">${i.icon}</span>
                  <b>${i.name}</b>
                </button>`,
            )
            .join('')
        : '<p class="dim" style="grid-column:1/-1;text-align:center;padding:34px 10px">这一页还空空的，去集市、湖边或菜地转转吧。</p>';

      const detailHtml = sel
        ? `<div>
            <div class="bag-detail-head">
              <div class="bag-detail-ic">${sel.icon}</div>
              <div>
                <div class="bag-detail-title">${sel.name}</div>
                <span class="bag-detail-tag">${CAT_LABELS[selInfo.cat] ?? '随身小物'} · 持有 ${sel.count}</span>
              </div>
            </div>
            <p class="bag-detail-desc">${selInfo.desc}</p>
            ${selInfo.effect ? `<div class="bag-detail-eff">✦ ${selInfo.effect}</div>` : ''}
          </div>
          <div>
            <button class="bag-use-btn" id="bag-use-btn" ${canUse ? '' : 'disabled'}>${
              sel.seedOf ? '请到菜地旁按 E 播种' : '使用 / 品尝'
            }</button>
            <p id="bag-msg" class="dim" style="margin:6px 0 0;font-size:12px;text-align:center"></p>
          </div>`
        : '<div style="margin:auto;text-align:center" class="dim">点左侧格子里的小物件，可以查看详情或使用。</div>';

      const body = `
        <div class="nb-stats">
          <span class="nb-stat-coin">🪙 ${game.state.coins} 金币</span>
          <div class="nb-stat-bar"><span>饱食</span><div class="meter hunger"><i style="width:${Math.round(game.state.hunger)}%"></i></div><span>${Math.round(game.state.hunger)}</span></div>
          <div class="nb-stat-bar"><span>体力</span><div class="meter stamina"><i style="width:${Math.round(game.state.stamina)}%"></i></div><span>${Math.round(game.state.stamina)}</span></div>
        </div>
        <div class="nb-tabs">${tabsHtml}</div>
        <div class="bag-layout">
          <div class="bag-slots">${slotsHtml}</div>
          <div class="bag-detail">${detailHtml}</div>
        </div>`;

      hud.open(
        '小鲸鱼的背包',
        body,
        [
          { label: '📖 打开博物图鉴 (J)', primary: true, onClick: () => { playUiSound('page', settings); panels.openDex(); } },
          { label: '合上背包', onClick: () => { playUiSound('close', settings); hud.close(); } },
        ],
        { wide: true },
      );

      for (const el of document.querySelectorAll('.nb-tabs .nb-tab')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          playUiSound('page', settings);
          panels.openBag(el.dataset.cat, null);
        });
      }
      for (const el of document.querySelectorAll('.bag-slots .bag-card')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          playUiSound('click', settings);
          panels.openBag(cat, el.dataset.k);
        });
      }
      const useBtn = document.getElementById('bag-use-btn');
      if (useBtn && sel && canUse) {
        useBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          playUiSound('click', settings);
          const msg = game.use(sel.key);
          panels.openBag(cat, sel.key);
          hud.refresh('bag-msg', msg);
        });
      }
    },

    /** 独立多分类《煤炭镇的小白》风博物图鉴（鱼类 / 飞鸟动物 / 农作物 / 种子 / 小镇建筑） */
    openDex(cat = 'fish', sub = 'lake', selectedId = null) {
      syncBagDiscoveries();
      const catTabsHtml = DEX_CATS.map(
        (c) => `<button class="nb-tab${c.id === cat ? ' on' : ''}" data-dcat="${c.id}">${c.label}</button>`,
      ).join('');

      let entries = [];
      let subHtml = '';
      let summaryNote = '';

      if (cat === 'fish') {
        const dex = game.state.dex;
        subHtml = `<div class="dex-subtabs">${['lake', 'river', 'sea']
          .map((w) => `<button class="dex-subtab${w === sub ? ' on' : ''}" data-sub="${w}">${WATER_NAME[w]}</button>`)
          .join('')}</div>`;
        const list = FISH.filter((f) => f.water === sub);
        entries = list.map((f) => {
          const sp = fishSprites[f.id];
          const pic = sp ? `<span style="${spriteStyle(sp, './textures/plants/fish.png', 52)}"></span>` : '🐟';
          const has = !!dex[f.id];
          return {
            id: f.id,
            name: f.name,
            icon: pic,
            unlocked: has,
            subText: `${RARITY[f.rarity]}${has ? ` · ${dex[f.id]}条` : ''}`,
            badgeClass: `r${f.rarity}`,
            meta: `${WATER_NAME[f.water]} · ${RARITY[f.rarity]}`,
            note: has ? f.note : '还没钓到过这种鱼。去水边按 E 甩竿试试，下雨天与夜晚更容易遇到稀有鱼。',
          };
        });
        summaryNote = `${WATER_NAME[sub]}鱼类 · 夜晚鲶鱼与鳗鱼活跃，雨天咬钩更勤`;
      } else if (cat === 'critters') {
        entries = CRITTERS_DEX.map((c) => {
          const has = discovered.critters.has(c.id);
          return {
            id: c.id,
            name: c.name,
            icon: c.icon,
            unlocked: has,
            subText: has ? c.time : '未遇见',
            badgeClass: `r${c.rarity}`,
            meta: `栖息：${c.place} · 时段：${c.time}`,
            note: has ? c.note : `听说常出没在「${c.place}」，去那里散散步也许就能遇见它。`,
          };
        });
        summaryNote = '探索小镇各处水岸、田野与夜色，记录身边的飞鸟与小动物';
      } else if (cat === 'crops') {
        entries = CROPS.map((c) => {
          const sp = farmSprites[produceSprite(c.id)] ?? farmSprites[plantSprite(c)];
          const pic = sp ? `<span style="${spriteStyle(sp, './textures/plants/farm.png', 48)}"></span>` : '🌾';
          const has = discovered.crops.has(c.id) || (game.state.bag[c.id] ?? 0) > 0;
          return {
            id: c.id,
            name: c.name,
            icon: pic,
            unlocked: has,
            subText: c.orchard ? '果树' : `成熟 ${c.hours}h`,
            badgeClass: c.orchard ? 'r3' : 'r1',
            meta: `成熟 ${c.hours} 小时 · 产量 ${c.yield[0]}-${c.yield[1]} · 收购 ${c.sell} 金币 · 饱食 +${c.food}`,
            note: has ? c.note : `种下「${c.name}种子」并浇水照料即可收获。${c.note}。`,
          };
        });
        summaryNote = '田园菜地与果园可种植的全部农作物与果树';
      } else if (cat === 'seeds') {
        entries = CROPS.map((c) => {
          const sp = farmSprites[plantSprite(c)];
          const pic = sp ? `<span class="seedpack"><span style="${spriteStyle(sp, './textures/plants/farm.png', 36)}"></span></span>` : '🌱';
          const has = discovered.seeds.has(c.id) || (game.state.bag[`seed-${c.id}`] ?? 0) > 0;
          return {
            id: c.id,
            name: `${c.name}种子`,
            icon: pic,
            unlocked: has,
            subText: `${c.seed} 金币`,
            badgeClass: 'r2',
            meta: `售价 ${c.seed} 金币 · 成熟 ${c.hours} 小时 · ${c.orchard ? '果园树苗' : '菜地作物'}`,
            note: `${c.note}。在种子铺或花鸟市场购入后，走到菜地旁按 E 播种。`,
          };
        });
        summaryNote = '种子铺与花鸟市场可买到的全部种子与树苗';
      } else if (cat === 'buildings') {
        entries = BUILDINGS_DEX.map((b) => {
          const has = discovered.buildings.has(b.id);
          return {
            id: b.id,
            name: b.name,
            icon: b.icon,
            unlocked: has,
            subText: has ? `✓ ${b.tag}` : b.tag,
            badgeClass: has ? 'r2' : 'r1',
            meta: `${b.tag} · 方位 (${Math.round(b.pos[0])}, ${Math.round(b.pos[1])})`,
            note: has ? b.note : `尚未亲自到访的地点（${b.tag}）。打开 M 大地图或坐高铁去打卡吧！`,
          };
        });
        summaryNote = '玉海城与周边小镇的特色建筑与风景地标，走近即可自动盖章收录';
      }

      const got = entries.filter((e) => e.unlocked).length;
      const pct = entries.length ? Math.round((got / entries.length) * 100) : 0;
      const sel = entries.find((e) => e.id === selectedId) ?? entries[0] ?? null;

      const cardsHtml = entries
        .map(
          (e) =>
            `<button class="dex-card${e.unlocked ? '' : ' unknown'}${sel?.id === e.id ? ' sel' : ''}" data-did="${e.id}">
              <span class="dex-ic">${e.icon}</span>
              <b>${e.unlocked ? e.name : '？？？'}</b>
              <small class="${e.badgeClass}">${e.subText}</small>
            </button>`,
        )
        .join('');

      const detailHtml = sel
        ? `<div class="dex-detail-box">
            <div class="dd-ic">${sel.unlocked ? sel.icon : '❓'}</div>
            <div class="dd-main">
              <div><span class="dd-name">${sel.unlocked ? sel.name : '尚未收录'}</span><span class="tag">${sel.meta}</span></div>
              <div class="dim" style="margin-top:2px">${sel.note}</div>
            </div>
          </div>`
        : '';

      const body = `
        <div class="nb-tabs">${catTabsHtml}</div>
        ${subHtml}
        <div class="dex-head-bar">
          <span class="dim">${summaryNote}</span>
          <div class="dex-prog">
            <span>已收录 ${got} / ${entries.length}</span>
            <div class="meter"><i style="width:${pct}%"></i></div>
          </div>
        </div>
        <div class="dex-grid">${cardsHtml}</div>
        ${detailHtml}`;

      hud.open(
        '夏日博物图鉴',
        body,
        [
          { label: '🎒 打开背包 (B)', onClick: () => { playUiSound('page', settings); panels.openBag(); } },
          { label: '合上图鉴', primary: true, onClick: () => { playUiSound('close', settings); hud.close(); } },
        ],
        { wide: true },
      );

      for (const el of document.querySelectorAll('.nb-tabs .nb-tab')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          playUiSound('page', settings);
          panels.openDex(el.dataset.dcat, 'lake', null);
        });
      }
      for (const el of document.querySelectorAll('.dex-subtabs .dex-subtab')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          playUiSound('click', settings);
          panels.openDex(cat, el.dataset.sub, null);
        });
      }
      for (const el of document.querySelectorAll('.dex-grid .dex-card')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          playUiSound('click', settings);
          panels.openDex(cat, sub, el.dataset.did);
        });
      }
    },

    /** 全新设置面板（画面 / 音效 / 界面与快捷键） */
    openSettings(tab = 'graphics') {
      const curPaint = getPaint();
      const curDpr = renderer ? Number(renderer.getPixelRatio().toFixed(2)) : 1.0;

      const tabsHtml = [
        ['graphics', '🎨 画面与笔触'],
        ['audio', '🔊 声音与音效'],
        ['controls', '⌨️ 界面与快捷键'],
      ]
        .map(([id, label]) => `<button class="nb-tab${tab === id ? ' on' : ''}" data-stab="${id}">${label}</button>`)
        .join('');

      let contentHtml = '';
      if (tab === 'graphics') {
        contentHtml = `
          <div class="set-group">
            <h4>🎨 吉卜力画质与手绘笔触</h4>
            <div class="set-row">
              <div><b>画质预设</b><span class="sr-sub">切换高/中/低（影响抗锯齿、体积云分辨率与植被密度，刷新后生效）</span></div>
              <div class="set-seg">
                ${['high', 'medium', 'low']
                  .map((q) => `<button data-q="${q}" class="${quality === q ? 'on' : ''}">${q === 'high' ? '高画质' : q === 'medium' ? '中画质' : '流畅'}</button>`)
                  .join('')}
              </div>
            </div>
            <div class="set-row">
              <div><b>手绘笔触强度（Kuwahara）</b><span class="sr-sub">实时调整吉卜力水彩笔触浓淡（也可按 P 键快速开关）</span></div>
              <div class="set-range">
                <input id="set-paint" type="range" min="0" max="3" step="1" value="${curPaint}" />
                <span id="set-paint-v">${curPaint === 0 ? '关' : curPaint}</span>
              </div>
            </div>
            <div class="set-row">
              <div><b>渲染清晰度（DPR）</b><span class="sr-sub">数值越高画面越细腻，若觉得掉帧可略微调低</span></div>
              <div class="set-range">
                <input id="set-dpr" type="range" min="0.75" max="1.5" step="0.05" value="${Math.min(1.5, Math.max(0.75, curDpr))}" />
                <span id="set-dpr-v">${curDpr.toFixed(2)}x</span>
              </div>
            </div>
          </div>`;
      } else if (tab === 'audio') {
        contentHtml = `
          <div class="set-group">
            <h4>🔊 音量与手账音效</h4>
            <div class="set-row">
              <div><b>总体音量</b><span class="sr-sub">控制界面翻页、点击及环境音的整体音量</span></div>
              <div class="set-range">
                <input id="set-vol" type="range" min="0" max="100" step="5" value="${settings.masterVolume}" />
                <span id="set-vol-v">${settings.masterVolume}%</span>
              </div>
            </div>
            <div class="set-row">
              <div><b>手账界面音效</b><span class="sr-sub">打开背包、翻阅图鉴与点击按钮时的轻柔提示音</span></div>
              <button class="set-toggle${settings.uiSfx ? ' on' : ''}" data-tog="uiSfx">${settings.uiSfx ? '已开启' : '已关闭'}</button>
            </div>
            <div class="set-row">
              <div><b>自然环境音</b><span class="sr-sub">微风、脚步声与小镇氛围声效</span></div>
              <button class="set-toggle${settings.ambientSound ? ' on' : ''}" data-tog="ambientSound">${settings.ambientSound ? '已开启' : '已关闭'}</button>
            </div>
          </div>`;
      } else {
        contentHtml = `
          <div class="set-group">
            <h4>🖥️ HUD 界面显示开关</h4>
            <div class="set-row"><span>左上角小地图</span><button class="set-toggle${settings.showMinimap ? ' on' : ''}" data-tog="showMinimap">${settings.showMinimap ? '显示' : '隐藏'}</button></div>
            <div class="set-row"><span>底部动作快捷栏</span><button class="set-toggle${settings.showActionbar ? ' on' : ''}" data-tog="showActionbar">${settings.showActionbar ? '显示' : '隐藏'}</button></div>
            <div class="set-row"><span>快捷随身物品条</span><button class="set-toggle${settings.showQuickbag ? ' on' : ''}" data-tog="showQuickbag">${settings.showQuickbag ? '显示' : '隐藏'}</button></div>
            <div class="set-row"><span>底部极简操作提示</span><button class="set-toggle${settings.showHelp ? ' on' : ''}" data-tog="showHelp">${settings.showHelp ? '显示' : '隐藏'}</button></div>
          </div>
          <div class="set-group">
            <h4>⌨️ 常用快捷键一览</h4>
            <div class="key-grid">
              <div class="key-item"><span>移动 / 快走 / 奔跑</span><span><kbd>WASD</kbd> / <kbd>Z</kbd> / <kbd>Shift</kbd></span></div>
              <div class="key-item"><span>跳跃 / 二段跳</span><span><kbd>Space</kbd></span></div>
              <div class="key-item"><span>互动 / 上下车 / 坐长椅</span><span><kbd>E</kbd></span></div>
              <div class="key-item"><span>打开背包 / 博物图鉴</span><span><kbd>B</kbd> / <kbd>J</kbd></span></div>
              <div class="key-item"><span>大地图 / 相机 / 天气</span><span><kbd>M</kbd> / <kbd>V</kbd> / <kbd>T</kbd></span></div>
              <div class="key-item"><span>设置面板 / 笔触开关</span><span><kbd>O</kbd> / <kbd>P</kbd></span></div>
              <div class="key-item"><span>放风筝 / 晒太阳 / 点火</span><span><kbd>K</kbd> / <kbd>R</kbd> / <kbd>G</kbd></span></div>
              <div class="key-item"><span>小鲸鱼表情动作</span><span><kbd>1</kbd> ~ <kbd>9</kbd></span></div>
            </div>
          </div>`;
      }

      hud.open(
        '游戏设置',
        `<div class="nb-tabs">${tabsHtml}</div>${contentHtml}`,
        [
          { label: '完成', primary: true, onClick: () => { playUiSound('close', settings); hud.close(); } },
        ],
        { wide: true },
      );

      for (const el of document.querySelectorAll('.nb-tabs .nb-tab')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          playUiSound('page', settings);
          panels.openSettings(el.dataset.stab);
        });
      }
      for (const el of document.querySelectorAll('.set-seg button[data-q]')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          playUiSound('click', settings);
          onQualityChange(el.dataset.q);
        });
      }
      const paintSlider = document.getElementById('set-paint');
      if (paintSlider) {
        paintSlider.addEventListener('input', () => {
          const v = Number(paintSlider.value);
          setPaint(v);
          if (frame) frame.paint = v;
          const lbl = document.getElementById('set-paint-v');
          if (lbl) lbl.textContent = v === 0 ? '关' : String(v);
        });
      }
      const dprSlider = document.getElementById('set-dpr');
      if (dprSlider && renderer) {
        dprSlider.addEventListener('input', () => {
          const v = Number(dprSlider.value);
          renderer.setPixelRatio(v);
          renderer.setSize(window.innerWidth, window.innerHeight);
          const lbl = document.getElementById('set-dpr-v');
          if (lbl) lbl.textContent = `${v.toFixed(2)}x`;
        });
      }
      const volSlider = document.getElementById('set-vol');
      if (volSlider) {
        volSlider.addEventListener('input', () => {
          settings.masterVolume = Number(volSlider.value);
          saveSettings(settings);
          const lbl = document.getElementById('set-vol-v');
          if (lbl) lbl.textContent = `${settings.masterVolume}%`;
        });
        volSlider.addEventListener('change', () => playUiSound('click', settings));
      }
      for (const el of document.querySelectorAll('.set-toggle[data-tog]')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const k = el.dataset.tog;
          settings[k] = !settings[k];
          applySettings();
          playUiSound('click', settings);
          panels.openSettings(tab);
        });
      }
    },

    openWeather() {
      const cur = weather.info;
      const cells = weather.list
        .map(
          (w) =>
            `<button class="slot wx${w.kind === cur.kind ? ' cur' : ''}" data-w="${w.kind}"><span class="ic">${w.icon}</span><b>${w.name}</b><i>${w.temp}°</i></button>`,
        )
        .join('');
      hud.open(
        '天气手账',
        `<p>现在：${cur.icon} ${cur.name}，${cur.temp}°C，${windName(cur.windAngle)} ${windLevel(cur.wind)} 级。${cur.wet > 0.3 ? '地上还湿着。' : ''}</p><div class="bag-grid">${cells}</div><p class="dim">点一个就换过去（云、风、雨是慢慢来的）。雷雨天闪电会劈着草地；晴天按 G 点火，火会顺着风烧开，下雨能浇灭。</p>`,
        [
          {
            label: weather.auto ? '自动换天气：开' : '恢复自动换天气',
            primary: !weather.auto,
            onClick: () => {
              playUiSound('click', settings);
              weather.set('auto');
              panels.openWeather();
            },
          },
          { label: '劈一道闪电', onClick: () => { playUiSound('click', settings); onAction('strike'); } },
          { label: '关上', onClick: () => { playUiSound('close', settings); hud.close(); } },
        ],
      );
      for (const el of document.querySelectorAll('.bag-grid .wx')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          playUiSound('click', settings);
          weather.set(el.dataset.w);
          panels.openWeather();
        });
      }
    },
  };
  return panels;
}
