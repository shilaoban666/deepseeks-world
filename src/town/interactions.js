// 能做的事：钓鱼、种菜、做饭、买菜、逛超市、上网、打电玩、锻炼、看书、祈祷、接委托、许愿、采花。
// 一个朴素的状态机 + 一点时间推进；面板都由 hud 弹出来。
import { DISTRICTS, RAIL_STATIONS } from './plan.js';
import { rollFish, BY_ID, RARITY, WATER_NAME, spriteStyle } from './fishdex.js';
import { CROPS, CROP, STAGES, stageOf, produceSprite } from './farming.js';

const ITEMS = {
  rice: { name: '白米饭', icon: '🍚', price: 6, sell: 3 },
  fish: { name: '鱼', icon: '🐟', price: 22, sell: 12 },
  veg: { name: '青菜', icon: '🥬', price: 9, sell: 5 },
  flower: { name: '野花', icon: '🌼', price: 14, sell: 7 },
  cooked: { name: '料理', icon: '🍱', price: 34, sell: 16 },
  tea: { name: '奶茶', icon: '🧋', price: 12, sell: 5 },
  pearl: { name: '珍珠', icon: '🫧', price: 60, sell: 30 },
  fruit: { name: '水果', icon: '🍑', price: 10, sell: 5 },
  shell: { name: '贝壳', icon: '🐚', price: 16, sell: 8 },
};

const RECIPES = [
  { name: '白米饭团', need: { rice: 1 }, hunger: 26, desc: '捏成三角，撒点盐。小鲸鱼的主食。' },
  { name: '炭烤鱼饭', need: { fish: 1, rice: 1 }, hunger: 48, desc: '鱼烤到皮脆，铺在饭上。' },
  { name: '青菜粥', need: { veg: 1, rice: 1 }, hunger: 34, desc: '小火慢煮，撒一把葱花。' },
  { name: '清炒时蔬配鱼', need: { fish: 1, veg: 2 }, hunger: 42, desc: '一个人吃有点多，但她能吃。' },
];

// 每种作物两样东西：种子（seed-xxx）和收获物（xxx）
for (const c of CROPS) {
  ITEMS[`seed-${c.id}`] = { name: `${c.name}种子`, icon: '🌱', price: c.seed, sell: 1, seedOf: c.id };
  ITEMS[c.id] = { name: c.name, icon: '🥕', price: c.sell * 2, sell: c.sell, crop: c.id };
}

export function createGame({ hud, player, city, onDoor, onSit, onTv, onTravel, onBookRail, onBookBus, onBookMetro, onCheckTicket, onMap, onRide, onAnimate, busStops = [], metroStops = [], railStations = RAIL_STATIONS, fishSprites = null, farmSprites = null, fishAtlas = './textures/plants/fish.png' }) {
  // 作物的图标：手绘的收获物，种子用作物本身的小图
  if (farmSprites) {
    for (const c of CROPS) {
      const sp = farmSprites[produceSprite(c.id)];
      const pl = farmSprites[`plant-${c.id}`];
      if (sp) ITEMS[c.id].icon = `<span style="${spriteStyle(sp, './textures/plants/farm.png', 22)}"></span>`;
      if (pl) ITEMS[`seed-${c.id}`].icon = `<span class="seedpack"><span style="${spriteStyle(pl, './textures/plants/farm.png', 18)}"></span></span>`;
    }
  }
  let farm = null;
  const state = {
    coins: 180,
    hunger: 74,
    stamina: 100,
    day: 1,
    minutes: 8 * 60 + 20,
    bag: { rice: 2, fish: 0, veg: 1, 'seed-napa-cabbage': 3, 'seed-radish': 2, 'seed-tomato': 1, flower: 0, cooked: 0, tea: 0, pearl: 0, fruit: 0, shell: 0 },
    /** 图鉴：钓到过的鱼 { id: 条数 } */
    dex: {},
    /** 今天摘过的地方 { id: 第几天 } */
    picked: {},
    quests: [],
    stats: { fish: 0, cooked: 0, planted: 0, harvested: 0, shopped: 0, played: 0, read: 0 },
    luck: 0,
    /** 各种小乐子的当天记录（滑雪几趟、租没租冲浪板、打没打工……）和最好成绩 */
    fun: {},
    indoor: false,
    riding: null,
  };
  let fishing = null;
  let arcade = null;
  let panelTick = null;
  let clock = 0;
  /** 动作系统（滑雪、划船、冲浪、躺椅）：actions.js 建好以后自己交进来 */
  let acts = null;
  /** 今天做过几次（key 一天一清） */
  const today = (key) => (state.fun[key]?.day === state.day ? state.fun[key].n : 0);
  const bump = (key) => {
    state.fun[key] = { day: state.day, n: today(key) + 1 };
  };

  const bagList = () => Object.entries(state.bag).map(([k, v]) => ({ key: k, ...ITEMS[k], count: v }));
  const syncBag = () => hud.setBag(bagList());
  const clockText = () => {
    const h = Math.floor(state.minutes / 60) % 24;
    const m = Math.floor(state.minutes % 60);
    return `第 ${state.day} 天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const placeName = () => {
    if (state.indoor) return '家里';
    let best = null;
    let bestD = 1e9;
    for (const d of DISTRICTS) {
      const dd = Math.hypot(d.x - player.x, d.z - player.z);
      if (dd < d.r * 1.6 && dd < bestD) {
        best = d;
        bestD = dd;
      }
    }
    return best ? best.name : '玉海郊外';
  };
  const syncStats = () => hud.setStats({ coins: state.coins, hunger: state.hunger, stamina: state.stamina, clock: clockText(), place: placeName() });

  const add = (key, n = 1) => {
    state.bag[key] = (state.bag[key] ?? 0) + n;
    syncBag();
  };
  // "青菜"：买来的青菜，加上自己种的、能下锅的菜（白菜、萝卜、番茄……）都算
  const VEG = CROPS.filter((c) => c.veg).map((c) => c.id);
  const count = (key) => (key === 'veg' ? (state.bag.veg ?? 0) + VEG.reduce((n, k) => n + (state.bag[k] ?? 0), 0) : (state.bag[key] ?? 0));
  const take = (key, n = 1) => {
    if (count(key) < n) return false;
    if (key === 'veg') {
      // 先用买来的青菜，再用自己种的
      for (const k of ['veg', ...VEG]) {
        const m = Math.min(n, state.bag[k] ?? 0);
        state.bag[k] = (state.bag[k] ?? 0) - m;
        n -= m;
        if (!n) break;
      }
    } else state.bag[key] -= n;
    syncBag();
    return true;
  };
  const has = (need) => Object.entries(need).every(([k, n]) => count(k) >= n);

  // ---- 钓鱼（经典三段时机判定条：未到时机 / 最佳起鱼区 / 超过时机） -------------------------------------------
  const renderFishingHtml = (f) => {
    const z0 = Math.round(f.zoneStart * 100);
    const zw = Math.round(f.zoneW * 100);
    const z1 = Math.min(100, z0 + zw);
    const pos = Math.min(100, Math.max(0, f.progress * 100));
    const inZone = f.phase === 'bite';
    const isLate = f.phase === 'late';
    const statusText = inZone
      ? '🎣 ！！就是现在！按 E 立刻拉竿！！'
      : isLate
        ? '💦 已经超过最佳时机，快跑了！'
        : '🎣 浮漂轻晃，等待指针进入绿色起鱼区…';
    const statusTag = inZone ? '最佳时机！' : isLate ? '已过时机' : '未到时机';
    return `<div class="fish-status${inZone ? ' bite' : ''}"><span>${statusText}</span><span class="${inZone ? 'ok' : isLate ? 'no' : 'dim'}">${statusTag}</span></div>
      <div class="fish-bar${inZone ? ' in-zone' : ''}">
        <div class="fish-bar-inner">
          <div class="fish-zone-early" style="width:${z0}%"></div>
          <div class="fish-zone-sweet" style="left:${z0}%;width:${zw}%"></div>
          <div class="fish-zone-late" style="left:${z1}%;width:${100 - z1}%"></div>
        </div>
        <div class="fish-needle" style="left:${pos.toFixed(1)}%"></div>
      </div>
      <div class="fish-legend">
        <span>← 未到时机（太早）</span>
        <span class="ok">★ 绿色起鱼区</span>
        <span class="no">超过时机（太晚）→</span>
      </div>
      <div class="fish-keys"><span>指针进入绿色区域时按 <kbd>E</kbd> 或点「拉竿」</span><span><kbd>Esc</kbd> 收线</span></div>`;
  };

  const startFishing = () => {
    if (fishing) return;
    const water = player.waterKind ?? 'lake';
    const h = Math.floor(state.minutes / 60) % 24;
    const fish = rollFish(water, { luck: state.luck + (acts?.fishBonus?.() ?? 0), night: h < 6 || h >= 19, rain: player.raining });
    // 越稀有：绿色起鱼区越窄、指针扫得越快（经典考验反应节奏的钓鱼手感！）
    const zoneW = [0, 0.16, 0.13, 0.10, 0.085][fish.rarity] + Math.min(0.025, state.luck * 0.008);
    const zoneStart = 0.28 + Math.random() * Math.max(0.10, 0.56 - zoneW);
    const duration = [0, 1.25, 1.05, 0.90, 0.78][fish.rarity];
    const waveAmp = [0, 0.0, 0.18, 0.28, 0.38][fish.rarity];
    const waveFreq = 5.5 + Math.random() * 3.5;
    fishing = {
      phase: 'cast', // 'cast'(未到) -> 'bite'(区间内) -> 'late'(已超过)
      t: 0,
      progress: 0,
      duration,
      waveAmp,
      waveFreq,
      zoneStart,
      zoneW,
      zoneEnd: zoneStart + zoneW,
      water,
      fish,
    };
    hud.open(
      '垂钓中',
      `<div id="fish-line" class="fish-box">${renderFishingHtml(fishing)}</div>`,
      [
        { label: '拉竿 (E)', primary: true, onClick: () => pullFishing() },
        { label: '收线', onClick: () => { fishing = null; hud.close(); } },
      ],
      { dock: true },
    );
    let lastPhase = null;
    panelTick = () => {
      if (!fishing) return;
      const needle = document.querySelector('#fish-line .fish-needle');
      if (needle && lastPhase === fishing.phase) {
        // 60fps 丝滑直驱指针位置，零重建 DOM 卡顿
        needle.style.left = `${Math.min(100, Math.max(0, fishing.progress * 100)).toFixed(2)}%`;
      } else {
        lastPhase = fishing.phase;
        hud.refresh('fish-line', renderFishingHtml(fishing));
      }
    };
  };
  const pullFishing = () => {
    if (!fishing) return false;
    const p = fishing.progress;
    const { zoneStart, zoneEnd, fish: f } = fishing;
    fishing = null;
    if (p < zoneStart) {
      hud.close();
      hud.toast('太早了！还没到咬钩时机，鱼被吓跑了');
      return true;
    }
    if (p > zoneEnd) {
      hud.close();
      hud.toast('太晚了！已经超过最佳时机，鱼挣脱跑掉了');
      return true;
    }
    state.stats.fish++;
    onAnimate?.('cheer', 1.6);
    const first = !state.dex[f.id];
    state.dex[f.id] = (state.dex[f.id] ?? 0) + 1;
    // 传说的鱼拍张照就放回去；其余进背包（做饭用）
    if (f.rarity < 4) add('fish', 1);
    else state.luck += 1;
    if (f.water === 'lake' && Math.random() < 0.05) add('pearl', 1);
    const pic = fishSprites?.[f.id] ? `<span style="${spriteStyle(fishSprites[f.id], fishAtlas, 150)}"></span>` : '';
    hud.open(
      first ? '新的鱼！' : '钓上来了',
      `<div class="catch"><div class="pic">${pic}</div><div><b class="r${f.rarity}">${f.name}</b> <span class="tag r${f.rarity}">${RARITY[f.rarity]}</span><p>${f.note}</p><p class="dim">${WATER_NAME[f.water]} · 已钓到 ${state.dex[f.id]} 条${f.rarity >= 4 ? ' · 放回去了（运气 +1）' : ''}</p></div></div>`,
      [
        { label: '再甩一竿', primary: true, onClick: () => { hud.close(); startFishing(); } },
        { label: '收竿', onClick: () => hud.close() },
      ],
      { dock: true },
    );
    return true;
  };

  // ---- 种植 --------------------------------------------------------------------------------------------------
  const cropIcon = (c, size = 40) => {
    const sp = farmSprites?.[`plant-${c.id}`];
    return sp ? `<span style="${spriteStyle(sp, './textures/plants/farm.png', size)}"></span>` : '🌱';
  };
  const hoursLeft = (p) => {
    const c = CROP[p.crop];
    const h = ((1 - p.growth) * c.hours) / (p.water > 0.05 ? 1 : 0.35);
    return h < 1 ? `${Math.max(1, Math.round(h * 60))} 分钟` : `${h.toFixed(h < 10 ? 1 : 0)} 小时`;
  };
  const openPlot = (it) => {
    if (!farm) return;
    const i = it.plot;
    const p = farm.plot(i);
    if (!p) return;
    // 熟了：直接收
    if (p.crop && p.growth >= 1) {
      const got = farm.harvest(i, state.luck);
      add(got.crop.id, got.n);
      state.stats.harvested++;
      onAnimate?.('cheer', 1.25);
      const back = Math.random() < 0.35;
      if (back) add(`seed-${got.crop.id}`, 1);
      syncStats();
      return void hud.toast(`收了 ${got.n} 个${got.crop.name}${back ? '，还留下一包种子' : ''}`);
    }
    if (!p.crop) {
      const seeds = CROPS.filter((c) => (state.bag[`seed-${c.id}`] ?? 0) > 0);
      hud.open(
        it.name,
        `<p>翻好的地，空着。种点什么？</p>` +
          ((seeds.filter((c) => !c.orchard || String(p.where).includes('果园')).length)
            ? `<div class="bag-grid">${seeds.filter((c) => !c.orchard || String(p.where).includes('果园')).map((c) => `<button class="slot" data-seed="${c.id}"><span class="ic">${cropIcon(c)}</span><b>${c.name}</b><i>×${state.bag[`seed-${c.id}`]} · ${c.hours} 小时熟</i></button>`).join('')}</div><p class="dim">果园地块适合果树苗；普通菜地适合蔬菜和花卉。浇水后生长更快。</p>`
            : `<p class="dim">手上没有种子。田园小镇的种子铺、花鸟市场都有卖。</p>`),
        [{ label: '走了', onClick: () => hud.close() }],
      );
      for (const el of document.querySelectorAll('[data-seed]')) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = el.dataset.seed;
          if (!take(`seed-${id}`, 1)) return;
          farm.plant(i, id, state.day * 1440 + state.minutes);
          state.stats.planted++;
          onAnimate?.('farm_plant', 1.05);
          hud.close();
          hud.toast(`种下了${CROP[id].name}。${p.water > 0.05 ? '地是湿的' : '记得浇水'}，大约 ${hoursLeft(farm.plot(i))}后能收`);
        });
      }
      return;
    }
    const c = CROP[p.crop];
    const st = stageOf(p.growth);
    const wetNow = p.water > 0.05;
    // 地干了：E 一下就是浇水（身边几块一起浇），再按 E 才看长势
    if (!wetNow) {
      const n = waterAround();
      onAnimate?.('farm_water', 1.15);
      return void hud.toast(n > 1 ? `提着水壶浇了 ${n} 块地` : `给${c.name}浇了水`);
    }
    hud.open(
      `${it.name} · ${c.name}`,
      `<div class="catch"><div class="pic">${cropIcon(c, 72)}</div><div>` +
        `<p><b>${STAGES[st]}</b> · ${Math.round(p.growth * 100)}%</p>` +
        `<div class="meter grow"><i style="width:${Math.round(p.growth * 100)}%"></i></div>` +
        `<p>${wetNow ? '<span class="ok">地是湿的</span>' : '<span class="no">地有点干了</span>'} · 还要 ${hoursLeft(p)}</p>` +
        `<p class="dim">${c.note}。熟了能收 ${c.yield[0]}–${c.yield[1]} 个，卖 ${c.sell} 金币一个。</p></div></div>`,
      [
        {
          label: wetNow ? '浇过水了' : '浇水',
          primary: !wetNow,
          disabled: wetNow,
          onClick: () => {
            farm.water(i);
            onAnimate?.('farm_water', 1.15);
            hud.close();
            hud.toast(`给${c.name}浇了水`);
          },
        },
        {
          label: '铲掉',
          onClick: () => {
            farm.clear(i);
            onAnimate?.('farm_plant', 0.95);
            hud.close();
            hud.toast('铲掉了，地空出来了');
          },
        },
        { label: '走了', onClick: () => hud.close() },
      ],
    );
  };
  /** 一键浇水：身边几米内的地都浇上 */
  const waterAround = () => {
    if (!farm) return 0;
    let n = 0;
    farm.plots.forEach((p, i) => {
      if (p.crop && p.water <= 0.05 && Math.hypot(p.x - player.x, p.z - player.z) < 7) {
        farm.water(i);
        n++;
      }
    });
    return n;
  };
  /** 卖菜：把自己种的收获物全卖掉 */
  const sellCrops = () => {
    let coins = 0;
    let n = 0;
    for (const c of CROPS) {
      const k = state.bag[c.id] ?? 0;
      if (!k) continue;
      coins += k * c.sell;
      n += k;
      state.bag[c.id] = 0;
    }
    state.coins += coins;
    syncBag();
    syncStats();
    return { coins, n };
  };

  // ---- 做饭 --------------------------------------------------------------------------------------------------
  const openCook = () => {
    const rows = RECIPES.map((r) => {
      const ok = has(r.need);
      const need = Object.entries(r.need).map(([k, n]) => `${ITEMS[k].icon}×${n}`).join(' ');
      return `<tr><td>${r.name}<br><span class="dim">${r.desc}</span></td><td class="need">${need}</td><td>${ok ? '<span class="ok">可以做</span>' : '<span class="no">缺材料</span>'}</td></tr>`;
    }).join('');
    hud.open(
      '厨房',
      `<table class="recipes"><thead><tr><th>菜</th><th>材料</th><th></th></tr></thead><tbody>${rows}</tbody></table>`,
      RECIPES.map((r) => ({
        label: r.name,
        disabled: !has(r.need),
        onClick: () => {
          for (const [k, n] of Object.entries(r.need)) take(k, n);
          add('cooked', 1);
          state.stats.cooked++;
          onAnimate?.('cook', 1.45);
          hud.toast(`做好了 ${r.name}`);
          syncStats();
          openCook();
        },
      })).concat([{ label: '关火', onClick: () => hud.close() }]),
    );
  };

  // ---- 商店 --------------------------------------------------------------------------------------------------
  const shop = (title, list, blurb, buysCrops = false) => {
    onAnimate?.('wave', 1.1);
    const rows = list.map((k) => `<tr><td>${ITEMS[k].icon} ${ITEMS[k].name}${ITEMS[k].seedOf ? ` <span class="dim">· ${CROP[ITEMS[k].seedOf].hours} 小时熟，卖 ${CROP[ITEMS[k].seedOf].sell}/个</span>` : ''}</td><td class="need">${ITEMS[k].price} 金币</td></tr>`).join('');
    const mine = CROPS.reduce((n, c) => n + (state.bag[c.id] ?? 0), 0);
    hud.open(
      title,
      `<p>${blurb}</p><p class="dim">钱：${state.coins} 金币</p><table class="recipes"><tbody>${rows}</tbody></table>`,
      list
        .map((k) => ({
          // 按钮使用纯文本，避免把手绘图标的 CSS 片段显示成字面量；商品表格仍保留图标。
          label: `买 ${ITEMS[k].name}（${ITEMS[k].price}）`,
          disabled: state.coins < ITEMS[k].price,
          onClick: () => {
            state.coins -= ITEMS[k].price;
            add(k, 1);
            state.stats.shopped++;
            syncStats();
            shop(title, list, blurb, buysCrops);
          },
        }))
        .concat(
          buysCrops
            ? [
                {
                  label: `卖掉自己种的菜（${mine} 个）`,
                  primary: mine > 0,
                  disabled: !mine,
                  onClick: () => {
                    const r = sellCrops();
                    shop(title, list, blurb, buysCrops);
                    hud.toast(`卖了 ${r.n} 个菜，得了 ${r.coins} 金币`);
                  },
                },
              ]
            : [],
        )
        .concat([{ label: '走了', onClick: () => hud.close() }]),
    );
  };

  // ---- 电玩 --------------------------------------------------------------------------------------------------
  const openArcade = () => {
    arcade = { t: 0, speed: 2.6, pos: 0, score: 0, round: 0 };
    hud.open(
      '电玩厅 · 打地鼠',
      `<p>指针在滑轨上来回跑，停在正中间就得分。</p>
       <div class="rail"><div class="rail-zone"></div><div class="rail-needle" id="rail-needle"></div></div>
       <p id="arcade-line">按 <kbd>E</kbd> 停</p>`,
      [{ label: '不玩了', onClick: () => { arcade = null; hud.close(); } }],
    );
    panelTick = () => {
      if (!arcade) return;
      hud.refresh('arcade-line', `第 ${arcade.round + 1} 轮 · 得分 ${arcade.score}<br><span class="dim">按 E 停</span>`);
      const needle = document.getElementById('rail-needle');
      if (needle) needle.style.left = `${50 + arcade.pos * 48}%`;
    };
  };
  const stopArcade = () => {
    if (!arcade) return false;
    const off = Math.abs(arcade.pos);
    if (off < 0.09) {
      arcade.score += 3;
      hud.toast('正中！+3');
    } else if (off < 0.25) {
      arcade.score += 1;
      hud.toast('还不错 +1');
    } else hud.toast('歪了');
    arcade.round++;
    arcade.speed += 0.35;
    if (arcade.round >= 5) {
      const got = arcade.score;
      state.coins += got * 3;
      state.stats.played++;
      arcade = null;
      hud.close();
      syncStats();
      onAnimate?.('cheer', 1.4);
      hud.toast(`打完 5 轮，共 ${got} 分，换到 ${got * 3} 金币`);
    }
    return true;
  };

  // ---- 分发 --------------------------------------------------------------------------------------------------
  const interact = (it) => {
    if (!it) return;
    if (hud.isOpen) {
      if (fishing) return void pullFishing();
      if (arcade) return void stopArcade();
      return;
    }
    // 滑着雪、冲着浪的时候，E 就是停下来
    if (acts && (acts.mode === 'ski' || acts.mode === 'surf')) return void acts.act('stop');
    switch (it.kind) {
      // ---- 各区的特色玩法（道具在 activities.js，动作在 actions.js）---------------------------------------
      case 'ski': {
        if (!acts) break;
        if (state.riding) return void hud.toast('先从车上下来');
        if (it.top) return void acts.startSki();
        if (it.lift) return void acts.skiLift(false);
        const best = state.fun.skiBest;
        hud.open(
          '雪场小屋',
          `<p>屋檐下靠着一排雪板，炉子上烤着手套。雪道从山腰一直铺到镇口，一路八道旗门：红旗在左，蓝旗在右，从中间穿过去。</p><p class="dim">魔毯免费，雪板随便借。A / D 转弯，S 刹车，W 撑一下雪杖。${best ? `<br>最好成绩：${best.time.toFixed(1)} 秒，过了 ${best.gates} 道门。` : ''}</p>`,
          [
            { label: '坐魔毯上山，滑下来', primary: true, onClick: () => { hud.close(); acts.skiLift(true); } },
            { label: '只坐魔毯上去看看', onClick: () => { hud.close(); acts.skiLift(false); } },
            { label: '烤烤火再说', onClick: () => hud.close() },
          ],
        );
        break;
      }
      case 'snowman':
        state.minutes += 6;
        onAnimate?.('cheer', 1.25);
        hud.toast(['给雪人拍实了一把雪，它看起来更圆了', '把雪人的鼻子扶正了。它好像在笑', '把自己的围巾借雪人围了一会儿，又拿回来了（冷）'][Math.floor(Math.random() * 3)]);
        break;
      case 'boat': {
        if (!acts) break;
        if (acts.aboard) return void acts.act('stop');
        if (state.riding) return void hud.toast('先从车上下来');
        const fee = it.fee ?? 8;
        const sea = !String(it.name).includes('湖');
        hud.open(
          it.name,
          `<p>${sea ? '浮桥边系着一条小木船，船底有一汪亮晶晶的海水。' : '栈桥头系着几条小木船，随着湖水轻轻碰着木桩。'}租一条 ${fee} 金币，划多久都行。</p><p class="dim">W / S 划桨，A / D 转船头；划到开阔的水面按 E 就能下竿${sea ? '（海里的鱼）' : '，湖心水深，稀罕的鱼多'}。划回来靠着栈桥按 E 上岸。</p><p class="dim">钱：${state.coins} 金币</p>`,
          [
            {
              label: `租一条小木船（${fee}）`,
              primary: true,
              disabled: state.coins < fee,
              onClick: () => {
                hud.close();
                if (!acts.startBoat(it)) return;
                state.coins -= fee;
                syncStats();
              },
            },
            { label: '下次吧', onClick: () => hud.close() },
          ],
        );
        break;
      }
      case 'surf': {
        const has = state.fun.board === state.day;
        const fee = it.fee ?? 6;
        const shells = state.bag.shell ?? 0;
        const best = state.fun.surfBest;
        hud.open(
          '冲浪小屋',
          `<p>晒得黝黑的店主在给板子打蜡。「浪不大，正好学。站稳了别直直冲上沙滩，斜着走，浪才追得上你。」</p><p class="dim">租一块板 ${fee} 金币，今天随便用：走进海里游起来，按 <kbd>X</kbd> 站上板子。A / D 压板转弯，Space 跳一个。贝壳他也收，8 金币一个。${best ? `<br>最好的一趟：${best.time.toFixed(0)} 秒，${best.tricks} 个花样。` : ''}</p><p class="dim">钱：${state.coins} 金币</p>`,
          [
            {
              label: has ? '板子已经在手上了' : `租一块冲浪板（${fee}）`,
              primary: !has,
              disabled: has || state.coins < fee,
              onClick: () => {
                state.coins -= fee;
                state.fun.board = state.day;
                syncStats();
                hud.close();
                hud.toast('夹着板子往海里走——水没过腰、游起来以后按 X 站上去');
              },
            },
            {
              label: `卖贝壳（${shells} 个）`,
              disabled: !shells,
              onClick: () => {
                state.bag.shell = 0;
                state.coins += shells * ITEMS.shell.sell;
                syncBag();
                syncStats();
                hud.close();
                hud.toast(`${shells} 个贝壳换了 ${shells * ITEMS.shell.sell} 金币。店主把最花的那个挂在了门口`);
              },
            },
            { label: '走了', onClick: () => hud.close() },
          ],
        );
        break;
      }
      case 'lounger':
        if (state.riding) return void hud.toast('先从车上下来');
        acts?.lieOn(it);
        break;
      case 'shell': {
        if (state.picked[it.id] === state.day) return void hud.toast('这一片捡过了，等明天潮水再送来');
        state.picked[it.id] = state.day;
        onAnimate?.('gather', 1.0);
        const n = 1 + Math.floor(Math.random() * 2);
        add('shell', n);
        if (Math.random() < 0.06 + state.luck * 0.02) {
          add('pearl', 1);
          hud.toast(`捡到 ${n} 个贝壳——其中一个里面躺着一颗珍珠！`);
        } else hud.toast(`蹲在潮线上翻了翻，捡到 ${n} 个贝壳（冲浪小屋收）`);
        break;
      }
      case 'farmstand': {
        const mine = CROPS.reduce((n, c) => n + (state.bag[c.id] ?? 0), 0);
        const fruit = state.bag.fruit ?? 0;
        hud.open(
          '田园收购摊',
          `<p>草帽大叔守着一杆秤：「自己种的、自己摘的，我都收。果子 ${ITEMS.fruit.sell} 金币一个，菜按行情。」</p><p class="dim">钱：${state.coins} 金币 · 篮子里有 ${mine} 个菜、${fruit} 个水果</p>`,
          [
            {
              label: `卖掉自己种的菜（${mine} 个）`,
              primary: mine > 0,
              disabled: !mine,
              onClick: () => {
                const r = sellCrops();
                hud.close();
                hud.toast(`卖了 ${r.n} 个菜，得了 ${r.coins} 金币`);
              },
            },
            {
              label: `卖水果（${fruit} 个）`,
              disabled: !fruit,
              onClick: () => {
                state.bag.fruit = 0;
                state.coins += fruit * ITEMS.fruit.sell;
                syncBag();
                syncStats();
                hud.close();
                hud.toast(`${fruit} 个水果卖了 ${fruit * ITEMS.fruit.sell} 金币。大叔塞回来一个最红的（没有，他自己吃了）`);
              },
            },
            { label: '买点种子', onClick: () => shop('种子铺', CROPS.map((c) => `seed-${c.id}`), '大叔从摊子底下拖出一只木箱，里面全是小纸包。「种在后面那十二块田里，浇了水长得快。」', true) },
            { label: '走了', onClick: () => hud.close() },
          ],
        );
        break;
      }
      case 'work': {
        const port = it.job === 'port';
        const h = Math.floor(state.minutes / 60) % 24;
        if (h < 7 || h >= 19) return void hud.toast(port ? '货场收工了，明天白天再来' : '写字楼的灯都灭了，明天白天再来');
        if (today(`job-${it.job}`) >= 2) return void hud.toast(port ? '工头摆摆手：「今天够了，小姑娘歇着去。」' : '前台说今天的临时工招满了');
        if (state.stamina < (port ? 30 : 20)) return void hud.toast('太累了，先歇一歇、吃点东西');
        const pay = port ? 18 : 42;
        hud.open(
          it.name,
          port
            ? `<p>吊车把箱子一只只放下来，工头正缺人手。「搬十箱到那边板车上，${pay} 金币，现结。」</p><p class="dim">大约 40 分钟，费力气（体力 −22）。</p>`
            : `<p>招聘栏上贴着一张手写的纸：「急招临时工，帮忙整理推理链，半天 ${pay} 金币，管一杯咖啡。」</p><p class="dim">大约 3 小时，费脑子（体力 −16，会饿）。</p>`,
          [
            {
              label: port ? '挽起袖子搬货' : '上楼打半天工',
              primary: true,
              onClick: () => {
                bump(`job-${it.job}`);
                state.minutes += port ? 40 : 180;
                state.stamina = Math.max(0, state.stamina - (port ? 22 : 16));
                state.hunger = Math.max(0, state.hunger - (port ? 6 : 12));
                state.coins += pay;
                syncStats();
                onAnimate?.('work', 1.5);
                hud.close();
                hud.toast(port ? `十箱货搬完了，胳膊酸酸的。工头数了 ${pay} 金币给你` : `整理了一下午推理链，还喝到了咖啡。领到 ${pay} 金币`);
              },
            },
            { label: '还是算了', onClick: () => hud.close() },
          ],
        );
        break;
      }
      case 'chess': {
        state.minutes += 25;
        state.stamina = Math.min(100, state.stamina + 6);
        const win = Math.random() < 0.4 + state.luck * 0.08;
        if (win && today('chess') < 3) {
          bump('chess');
          state.coins += 6;
        }
        syncStats();
        onAnimate?.(win ? 'cheer' : 'read', 1.35);
        hud.toast(win ? '樱花落在棋盘上。你走了一步怪棋，老爷爷想了很久，认输了（彩头 6 金币）' : '老爷爷落子很慢，赢得很快。「再来？」他笑眯眯地问');
        break;
      }
      case 'door':
        onDoor?.(true);
        break;
      case 'fish':
        if (!player.nearWater) return void hud.toast('离水太远了，往岸边站一点');
        startFishing();
        break;
      case 'plot':
        openPlot(it);
        break;
      case 'farm':
        hud.toast('农夫：「今年的稻子长得不错。要种子的话，旁边铺子里有。」');
        break;
      case 'seed':
        if (it.id === 'farm-seeds') shop('种子铺', CROPS.map((c) => `seed-${c.id}`), '一排排小纸包，每包上面画着长大以后的样子。老板说：「浇了水的长得快。」果园种植区还能栽果树苗。');
        else shop('花鸟市场', ['seed-napa-cabbage', 'seed-radish', 'seed-tomato', 'seed-sunflower', 'seed-apple-tree', 'seed-peach-tree', 'seed-pear-tree', 'flower', 'veg'], '花苗、菜种，还有一笼会咕咕叫的鸽子。');
        break;
      case 'market':
        shop('菜市场', ['veg', 'fish', 'rice'], '早上的青菜还带着露水。收菜的阿姨说：自己种的菜也收。', true);
        break;
      case 'shop':
        shop('超市', ['rice', 'tea', 'veg', 'fish'], '灯管嗡嗡响，冷气很足。');
        break;
      case 'eat':
        shop('小吃街', ['rice', 'tea', 'fish'], '油锅的声音从街那头传过来。');
        break;
      case 'net': {
        const posts = [
          '【求助】推理链太长被老板说摸鱼，怎么办',
          '【闲聊】今天的白米饭特别香',
          '【提问】为什么我算 9.11 比 9.9 大（已经改了）',
          '【攻略】月亮湖钓鱼点位分享，靠北岸第三块石头',
          '【告白】小鲸鱼是最好的',
        ];
        hud.open(
          '网吧',
          `<p class="dim">屏幕蓝得发亮，键盘有点黏。你打开了 DeepSeek 论坛。</p>
           <ul class="posts">${posts.map((p) => `<li>${p}</li>`).join('')}</ul><p id="net-line"></p>`,
          [
            {
              label: '发一条动态',
              primary: true,
              onClick: () => {
                const replies = ['有人回了你一句「鱼片说得对」', '被顶到了首页', '没人理你，但你心情不错', '被你自己的推理链绕晕了'];
                state.coins += 4;
                syncStats();
                hud.refresh('net-line', `<b class="ok">${replies[Math.floor(Math.random() * replies.length)]}</b><br><span class="dim">（上网补贴 +4 金币）</span>`);
              },
            },
            { label: '下机', onClick: () => hud.close() },
          ],
        );
        break;
      }
      case 'arcade':
        openArcade();
        break;
      case 'sport':
        if (state.stamina > 30) {
          state.stamina = Math.min(100, state.stamina + 14);
          state.coins = Math.max(0, state.coins - 5);
          syncStats();
          onAnimate?.('cheer', 1.35);
          hud.toast('跑了两圈，体力 +14（门票 5 金币）');
        } else hud.toast('太累了，先吃点东西');
        break;
      case 'read': {
        const books = [
          '《山谷的四季》：春天，草从白色的雪里钻出来，像有人用笔尖点了一下。',
          '《手绘背景的十二种云》：卷云要画得急，积云要画得慢。',
          '《玉海城志》：城以玉海宫得名，清溪河从月亮湖流出来，绕城西一路入海。',
          '《如何不被叫胖》：第一章，「我不是胖，我是鲸」。',
        ];
        state.stats.read++;
        state.stamina = Math.min(100, state.stamina + 6);
        syncStats();
        onAnimate?.('read', 1.6);
        hud.open('图书馆', `<p>${books[Math.floor(Math.random() * books.length)]}</p><p class="dim">安静得能听见翻页的声音。</p>`, [
          { label: '合上书', onClick: () => hud.close() },
        ]);
        break;
      }
      case 'study': {
        // 上半节课：过去 45 分钟；每天头一回认真听讲，有机会拿到一点奖学金
        state.minutes += 45;
        state.stats.read++;
        const first = today('study') === 0;
        bump('study');
        onAnimate?.('read', 1.6);
        if (first && Math.random() < 0.5) {
          state.coins += 12;
          hud.toast(`在${it.name}上了半节课，随堂小测居然全对——奖学金 12 金币`);
        } else hud.toast(`在${it.name}上了半节课，感觉又聪明了一点（并没有）`);
        syncStats();
        break;
      }
      case 'pray':
        state.luck = Math.min(3, state.luck + 1);
        onAnimate?.('pray', 1.6);
        hud.open(
          it.name,
          '<p>你闭上眼睛，听见风穿过屋檐。</p><p class="ok">获得祝福：接下来钓到东西的概率更高（运气 +1）</p>',
          [{ label: '起身', onClick: () => hud.close() }],
        );
        break;
      case 'wish':
        if (state.coins < 1) return void hud.toast('没钱许愿了');
        state.coins -= 1;
        syncStats();
        onAnimate?.('pray', 1.5);
        hud.toast('硬币沉进水里，翻了个身。愿望说给水听');
        break;
      case 'mail': {
        const letters = ['一封是广告：「玉海城第一届钓鱼大赛报名中」', '一张明信片，背面画着一朵云', '一封信写着「鱼片，记得按时吃饭」', '里面只有一张白纸，可能重要，可能不重要'];
        onAnimate?.('wave', 1.1);
        hud.open('信箱', `<p>${letters[Math.floor(Math.random() * letters.length)]}</p>`, [{ label: '收好', onClick: () => hud.close() }]);
        break;
      }
      case 'board': {
        const list = DISTRICTS.filter((d) => !['residential', 'forest', 'mountain'].includes(d.kind))
          .map((d) => `<li>${d.name}</li>`)
          .join('');
        hud.open('公告板', `<p>城里和城外能去的地方：</p><ul class="posts">${list}</ul>`, [{ label: '记下了', onClick: () => hud.close() }]);
        break;
      }
      case 'guild': {
        const quests = state.quests;
        hud.open(
          '冒险者协会',
          quests.length
            ? `<ul class="posts">${quests.map((q) => `<li>${q.name} —— ${q.done ? '<span class="ok">可以交差</span>' : `<span class="dim">${q.progress}/${q.need}</span>`}</li>`).join('')}</ul>`
            : '<p>柜台后面的人抬头看了你一眼。</p><p class="dim">「钓三条鱼来，我给你钱。」</p>',
          quests.length
            ? [
                {
                  label: '交差',
                  primary: true,
                  disabled: !quests.some((q) => q.done),
                  onClick: () => {
                    const q = quests.find((x) => x.done);
                    if (!q) return;
                    state.coins += q.reward;
                    state.quests = quests.filter((x) => x !== q);
                    syncStats();
                    onAnimate?.('cheer', 1.5);
                    hud.close();
                    hud.toast(`完成委托，+${q.reward} 金币`);
                  },
                },
                { label: '离开', onClick: () => hud.close() },
              ]
            : [
                {
                  label: '接下这个委托',
                  primary: true,
                  onClick: () => {
                    state.quests.push({ id: 'fish3', name: '钓三条鱼', need: 3, progress: 0, done: false, reward: 60, kind: 'fish' });
                    hud.close();
                    hud.toast('接了委托：钓三条鱼');
                  },
                },
                { label: '下次吧', onClick: () => hud.close() },
              ],
        );
        break;
      }
      case 'fishmarket':
        shop('河鲜集市', ['fish', 'rice', 'veg'], '刚从清溪河里捞上来的，还在蹦。架子上晒着一排鱼干。');
        break;
      case 'orchard':
      case 'pick': {
        const today = state.day;
        if (state.picked[it.id] === today) return void hud.toast(it.kind === 'orchard' ? '今天摘过了，留点给鸟吃' : '今天的菜摘过了');
        state.picked[it.id] = today;
        onAnimate?.('gather', 1.05);
        const n = 2 + Math.floor(Math.random() * 3);
        add(it.kind === 'orchard' ? 'fruit' : 'veg', n);
        hud.toast(it.kind === 'orchard' ? `摘了 ${n} 个果子（${it.fruit ?? '水果'}）` : `摘了 ${n} 把青菜`);
        break;
      }
      case 'village':
        if (it.id === 'cinema') {
          // 玉海城：看一场电影
          const fee = 12;
          hud.open(
            '玉海电影院',
            `<p>${it.text ?? ''}</p><p class="dim">一张票 ${fee} 金币，一场一个半小时。黑漆漆的放映厅里最适合歇脚（体力 +30）。钱：${state.coins} 金币</p>`,
            [
              {
                label: `买票看电影（${fee}）`,
                primary: true,
                disabled: state.coins < fee,
                onClick: () => {
                  state.coins -= fee;
                  state.minutes += 90;
                  state.stamina = Math.min(100, state.stamina + 30);
                  state.hunger = Math.max(0, state.hunger - 5);
                  state.luck = Math.min(3, state.luck + (today('movie') ? 0 : 1));
                  bump('movie');
                  syncStats();
                  hud.close();
                  hud.toast(['小鲸鱼游过河湾的时候，全场都很安静。出来天色都变了（体力 +30）', '看到一半睡着了，醒来正好是片尾曲。睡得很香（体力 +30）', '后排有人小声吃爆米花。结局是好的，你也跟着高兴（体力 +30）'][Math.floor(Math.random() * 3)]);
                },
              },
              { label: '只看看海报', onClick: () => hud.close() },
            ],
          );
          break;
        }
        hud.open(it.name, `<p>${it.text ?? ''}</p>`, [{ label: '嗯', onClick: () => hud.close() }]);
        break;
      case 'station': {
        // 高铁：购票 → 上站台候车（可坐在长椅休息）→ 列车进站开门 → 登车坐在车厢内沿高架旅行
        const here = railStations.find((st) => st.name === it.stop) ?? railStations.reduce((a, b) => (a && Math.hypot(a.x - it.x, a.z - it.z) <= Math.hypot(b.x - it.x, b.z - it.z) ? a : b), null);
        const fare = 5;
        const stops = railStations.filter((st) => st !== here);
        hud.open(
          here?.name ?? '高铁站',
          `<p>站台上的蓝白牌子被风吹得亮堂堂的。车票 ${fare} 金币，一站大约 8 分钟。</p><p class="dim">买票后会前往站台候车（可以坐在站台长椅上休息），列车进站开门后按 <kbd>E</kbd> 登车进入车厢。</p>`,
          [
            ...stops.map((st) => ({
              label: `🚄 购票去 ${st.name}（${fare}）`,
              disabled: state.coins < fare,
              onClick: () => {
                state.coins -= fare;
                hud.close();
                if (onBookRail) onBookRail(here, st, fare);
                else onTravel?.(st);
                syncStats();
              },
            })),
            { label: '看看地图', onClick: () => { hud.close(); onMap?.(); } },
            { label: '下次再来', onClick: () => hud.close() },
          ],
          { grid: stops.length > 6 },
        );
        break;
      }
      case 'bus': {
        // it.line：'37 路公交'（真实 3D 复古公交沿街接送）或者 '地铁 1 号线'（地下 1 号线列车沉浸乘车）
        const line = it.line ?? '37 路公交';
        const metro = line.includes('地铁');
        const fare = 2;
        const list = metro ? metroStops : busStops;
        const here = list.find((st) => st.name === it.stop) ?? list.reduce((a, b) => (a && Math.hypot(a.x - it.x, a.z - it.z) <= Math.hypot(b.x - it.x, b.z - it.z) ? a : b), null);
        const stops = list.filter((st) => st.name !== it.stop);
        hud.open(
          line,
          metro
            ? `<p>地铁 1 号线 · <b>${it.stop ?? it.name}</b>。单程票 ${fare} 金币。</p><p class="dim">购票进站后将登上 1 号线列车，坐在紫绒软座上穿梭地下隧道前往目的地（途中按 <kbd>X</kbd> 可快进到站）。</p>`
            : `<p>37 路公交 · <b>${it.stop ?? it.name}</b>。投币 ${fare} 金币。</p><p class="dim">买票后 37 路复古公交车将驶来开门接你上车，坐在窗边一路欣赏玉海城风景（途中按 <kbd>X</kbd> 可快进到站）。</p>`,
          [
            ...stops.map((st) => ({
              label: `${metro ? '🚇' : '🚌'} 去 ${st.name}（${fare}）`,
              disabled: state.coins < fare,
              onClick: () => {
                state.coins -= fare;
                hud.close();
                if (metro && onBookMetro) onBookMetro(here, st);
                else if (!metro && onBookBus) onBookBus(here, st);
                else {
                  state.minutes += metro ? 6 : 12;
                  onTravel?.(st);
                  hud.toast(`坐${line}到了 ${st.name}`);
                }
                syncStats();
              },
            })),
            { label: '不坐了', wide: true, onClick: () => hud.close() },
          ],
          { grid: stops.length > 6 },
        );
        break;
      }
      case 'vehicle': {
        // 小木船、皮划艇、独木舟：推下水去划（actions.js 的 boat），别的才是地上骑的
        if (acts && /rowboat|kayak|canoe/.test(it.vehicle ?? '')) {
          if (acts.aboard) acts.act('stop');
          else if (!state.riding) acts.startBoat(it);
          break;
        }
        if (acts && acts.mode !== 'ground' && !state.riding) return void hud.toast('现在腾不出手');
        if (state.riding?.id === it.id) {
          state.riding = null;
          onRide?.(null, it);
          hud.toast('下车了，风从耳边吹过');
        } else {
          state.riding = it;
          onRide?.(it, it);
          hud.toast(`坐上${it.name}，按 E 下车`);
        }
        break;
      }
      case 'building':
        hud.open(it.name, '<p>推开木门，屋里有晒过太阳的木头香。</p><p class="dim">每一栋房子都留下了居民的生活痕迹。</p>', [{ label: '离开', onClick: () => hud.close() }]);
        break;
      case 'chair':
        onSit?.(it);
        break;
      case 'ticketgate':
        onCheckTicket?.(it);
        break;
      case 'gate':
        hud.open(it.name ?? '玉海城', '<p>牌坊上的字被太阳晒得发白。门里是一条笔直的大街，尽头是玉海宫的金顶。</p><p class="dim">城里：宫前广场、玉海宫、清真寺、书店、老街、电影院、电玩店、超市、集市……</p>', [
          { label: '进城', onClick: () => hud.close() },
        ]);
        break;
      case 'gather':
        onAnimate?.('gather', 1.0);
        if (Math.random() < 0.75 + state.luck * 0.05) {
          add('flower', 1);
          hud.toast('采到一朵野花');
        } else hud.toast('这丛还没开');
        break;
      case 'play':
        state.stamina = Math.min(100, state.stamina + 12);
        state.minutes += 10;
        syncStats();
        onAnimate?.('cheer', 1.45);
        hud.toast(['荡了一会儿秋千，风从耳边过去（体力 +12）', '从滑梯上溜下来，裙子沾了点沙（体力 +12）', '转了几圈旋转木马，有点晕（体力 +12）'][Math.floor(Math.random() * 3)]);
        break;
      case 'home':
        hud.toast(`${it.name}：窗口亮着灯，有人在做饭`);
        break;
      // ---- 室内 ---------------------------------------------------------------------------------------------
      case 'exit':
        onDoor?.(false);
        break;
      case 'cook':
        openCook();
        break;
      case 'fridge':
        hud.open('冰箱', '<p>里面有一盒白米饭、半颗包菜、两颗鸡蛋，还有一罐冰镇奶茶。</p><p class="dim">（把材料拿到灶台去做饭吧）</p>', [
          {
            label: '拿一盒白米饭（🍚×1）',
            onClick: () => {
              add('rice', 1);
              hud.close();
              hud.toast('拿到一盒白米饭');
            },
          },
          { label: '关上冰箱', onClick: () => hud.close() },
        ]);
        break;
      case 'sofa':
        onSit?.(it);
        break;
      case 'tv':
        onTv?.(it);
        break;
      case 'dining':
        if ((state.bag.cooked ?? 0) > 0) {
          take('cooked', 1);
          state.hunger = Math.min(100, state.hunger + 45);
          syncStats();
          onSit?.(it);
          onAnimate?.('eat', 1.4);
          hud.toast('坐下来吃完了，很满足');
        } else if (it.seat) {
          onSit?.(it);
          hud.toast('桌上空空的，先去厨房做点吃的');
        } else hud.toast('桌上空空的，先去厨房做点吃的');
        break;
      case 'bed':
        state.minutes = 7 * 60;
        state.day++;
        state.stamina = 100;
        state.hunger = Math.max(6, state.hunger - 14);
        syncStats();
        onAnimate?.('sleep', 1.8);
        hud.toast(`睡到第二天早上（第 ${state.day} 天）`);
        break;
      case 'desk':
        state.stamina = Math.min(100, state.stamina + 4);
        syncStats();
        if (it.seat) onSit?.(it);
        onAnimate?.('read', 1.5);
        hud.open('书房', '<p>桌上摊着一本手绘背景的画册，边角被翻得起了毛。</p><p class="dim">「颜色要按颜料去调，不要按光去调。」</p>', [
          { label: '合上', onClick: () => hud.close() },
        ]);
        break;
      case 'bath':
        state.stamina = Math.min(100, state.stamina + 20);
        state.hunger = Math.max(0, state.hunger - 4);
        syncStats();
        onAnimate?.('cheer', 1.25);
        hud.toast('洗了个热水澡，整个人都松了（体力 +20）');
        break;
      default:
        onAnimate?.('wave', 1.0);
        hud.toast(it.name);
    }
  };

  const update = (dt) => {
    clock += dt;
    state.minutes += dt * 2; // 现实 1 秒 = 游戏 2 分钟（一天 12 分钟）
    if (state.minutes >= 24 * 60) {
      state.minutes -= 24 * 60;
      state.day++;
    }
    state.hunger = Math.max(0, state.hunger - dt * 0.32);
    if (state.hunger > 12) state.stamina = Math.min(100, state.stamina + dt * 1.1);
    else state.stamina = Math.max(0, state.stamina - dt * 0.6);
    farm?.update(dt * 2, player.raining);
    if (fishing) {
      // 稀有鱼在拉扯时会有微妙的变速节奏，更像真实咬钩手感
      const speedMul = 1 + (fishing.waveAmp ?? 0) * Math.sin(fishing.t * (fishing.waveFreq ?? 6));
      fishing.t += dt * Math.max(0.65, speedMul);
      fishing.progress = fishing.t / fishing.duration;
      if (fishing.progress < fishing.zoneStart) {
        fishing.phase = 'cast';
      } else if (fishing.progress <= fishing.zoneEnd) {
        fishing.phase = 'bite';
      } else if (fishing.progress < 1.0) {
        fishing.phase = 'late';
      } else {
        fishing = null;
        hud.close();
        hud.toast('超过最佳时机，鱼把饵吃了跑掉了');
      }
    }
    if (arcade) {
      arcade.t += dt;
      arcade.pos = Math.sin(arcade.t * arcade.speed);
    }
    for (const q of state.quests) {
      if (q.kind === 'fish') {
        q.progress = Math.min(q.need, state.stats.fish);
        q.done = q.progress >= q.need;
      }
    }
    panelTick?.();
    syncStats();
    if (Math.floor(clock * 10) % 4 === 0) syncBag();
  };

  syncBag();
  syncStats();

  return {
    state,
    interact,
    update,
    openCook,
    startFishing,
    stopFishing() {
      fishing = null;
      if (hud.isOpen) hud.close();
    },
    get fishing() {
      return fishing;
    },
    /** 界面用：把物品图标换成手绘图 */
    setIcon(key, html) {
      if (ITEMS[key]) ITEMS[key].icon = html;
      syncBag();
    },
    syncStats,
    /** 种地：main.js 建好 farming 之后交进来 */
    setFarm(f) {
      farm = f;
    },
    get farm() {
      return farm;
    },
    waterAround,
    sellCrops,
    /** 动作系统建好以后交进来（滑雪、划船、冲浪要用） */
    setActions(a) {
      acts = a;
    },
    /** 背包里的东西：[{ key, name, icon, count, food }] */
    bagList,
    /** 用一样东西（吃掉 / 看看） */
    use(key) {
      const FOOD = { rice: 18, fish: 0, veg: 6, cooked: 45, tea: 10, flower: 0, fruit: 12 };
      if (!(state.bag[key] > 0)) return '没有了';
      if (key === 'fish') return '生鱼……还是拿去厨房做了再吃吧';
      if (ITEMS[key]?.seedOf) return `种子要种到菜地里（家门口有八块，田园小镇还能租十二块）：走到地边按 E`;
      if (ITEMS[key]?.crop) {
        const c = CROP[key];
        take(key, 1);
        state.hunger = Math.min(100, state.hunger + c.food);
        syncStats();
        onAnimate?.('eat', 1.3);
        return `吃掉了一个${c.name}，饱食 +${c.food}`;
      }
      if (key === 'pearl') return '圆圆的，亮晶晶的。舍不得卖';
      if (key === 'flower') return '一把野花，闻起来是太阳的味道';
      if (key === 'shell') return '贴在耳朵上能听见海。沙滩的冲浪小屋收，8 金币一个';
      if (FOOD[key]) {
        take(key, 1);
        state.hunger = Math.min(100, state.hunger + FOOD[key]);
        if (key === 'tea') state.stamina = Math.min(100, state.stamina + 15);
        syncStats();
        onAnimate?.('eat', 1.3);
        return `吃掉了 ${ITEMS[key].icon}${ITEMS[key].name}，饱食 +${FOOD[key]}`;
      }
      return '';
    },
    indoorMenu() {
      hud.open(
        '家里',
        `<p>四室两厅，客厅的沙发有点塌了。</p><p class="dim">饱食 ${Math.round(state.hunger)} / 100 · 体力 ${Math.round(state.stamina)} / 100</p>`,
        [
          { label: '去厨房做饭', primary: true, onClick: () => openCook() },
          {
            label: '吃一份料理',
            disabled: !(state.bag.cooked > 0),
            onClick: () => {
              if (!take('cooked', 1)) return;
              state.hunger = Math.min(100, state.hunger + 45);
              syncStats();
              hud.close();
              hud.toast('吃得很饱，满足');
            },
          },
          {
            label: '睡一觉（到早上）',
            onClick: () => {
              state.minutes = 7 * 60;
              state.day++;
              state.stamina = 100;
              state.hunger = Math.max(10, state.hunger - 12);
              syncStats();
              hud.close();
              hud.toast('睡到自然醒');
            },
          },
          { label: '出门', onClick: () => { hud.close(); onDoor?.(false); } },
        ],
      );
    },
  };
}
