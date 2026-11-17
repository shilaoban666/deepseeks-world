// 能做的事：钓鱼、种菜、做饭、买菜、逛超市、上网、打电玩、锻炼、看书、祈祷、接委托、许愿、采花。
// 一个朴素的状态机 + 一点时间推进；面板都由 hud 弹出来。
import { DISTRICTS } from './plan.js';

const ITEMS = {
  rice: { name: '白米饭', icon: '🍚', price: 6, sell: 3 },
  fish: { name: '鱼', icon: '🐟', price: 22, sell: 12 },
  veg: { name: '青菜', icon: '🥬', price: 9, sell: 5 },
  seed: { name: '菜种', icon: '🌱', price: 8, sell: 2 },
  flower: { name: '野花', icon: '🌼', price: 14, sell: 7 },
  cooked: { name: '料理', icon: '🍱', price: 34, sell: 16 },
  tea: { name: '奶茶', icon: '🧋', price: 12, sell: 5 },
  pearl: { name: '珍珠', icon: '🫧', price: 60, sell: 30 },
};

const RECIPES = [
  { name: '白米饭团', need: { rice: 1 }, hunger: 26, desc: '捏成三角，撒点盐。小鲸鱼的主食。' },
  { name: '炭烤鱼饭', need: { fish: 1, rice: 1 }, hunger: 48, desc: '鱼烤到皮脆，铺在饭上。' },
  { name: '青菜粥', need: { veg: 1, rice: 1 }, hunger: 34, desc: '小火慢煮，撒一把葱花。' },
  { name: '清炒时蔬配鱼', need: { fish: 1, veg: 2 }, hunger: 42, desc: '一个人吃有点多，但她能吃。' },
];

export function createGame({ hud, player, city, onDoor, onSit, onTv, onTravel, onMap, busStops = [] }) {
  const state = {
    coins: 180,
    hunger: 74,
    stamina: 100,
    day: 1,
    minutes: 8 * 60 + 20,
    bag: { rice: 2, fish: 0, veg: 1, seed: 3, flower: 0, cooked: 0, tea: 0, pearl: 0 },
    plots: [],
    quests: [],
    stats: { fish: 0, cooked: 0, planted: 0, harvested: 0, shopped: 0, played: 0, read: 0 },
    luck: 0,
    indoor: false,
  };
  let fishing = null;
  let arcade = null;
  let panelTick = null;
  let clock = 0;

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
    return best ? best.name : '清镇野外';
  };
  const syncStats = () => hud.setStats({ coins: state.coins, hunger: state.hunger, stamina: state.stamina, clock: clockText(), place: placeName() });

  const add = (key, n = 1) => {
    state.bag[key] = (state.bag[key] ?? 0) + n;
    syncBag();
  };
  const take = (key, n = 1) => {
    if ((state.bag[key] ?? 0) < n) return false;
    state.bag[key] -= n;
    syncBag();
    return true;
  };
  const has = (need) => Object.entries(need).every(([k, n]) => (state.bag[k] ?? 0) >= n);

  // ---- 钓鱼 --------------------------------------------------------------------------------------------------
  const startFishing = () => {
    if (fishing) return;
    fishing = { phase: 'cast', t: 0, wait: 1.4 + Math.random() * 2.6 };
    hud.open('钓鱼', '<p id="fish-line">甩出鱼线……水面很静。</p>', [
      { label: '收线', onClick: () => { fishing = null; hud.close(); } },
    ]);
    panelTick = () => {
      if (!fishing) return;
      if (fishing.phase === 'cast') hud.refresh('fish-line', '甩出鱼线……水面上有细细的波纹。<br><span class="dim">（等一等）</span>');
      else hud.refresh('fish-line', `<b class="warn">！上钩了</b> —— 按 <kbd>E</kbd> 拉竿！<br><span class="dim">还剩 ${fishing.life.toFixed(1)} 秒</span>`);
    };
  };
  const pullFishing = () => {
    if (!fishing) return false;
    if (fishing.phase === 'cast') {
      hud.toast('太早了，鱼被吓跑了');
      fishing = null;
      hud.close();
      return true;
    }
    const good = Math.random() < 0.62 + state.luck * 0.05;
    if (good) {
      const rare = Math.random() < 0.12;
      add(rare ? 'pearl' : 'fish', 1);
      state.stats.fish++;
      hud.toast(rare ? '钓到一颗珍珠！' : '钓上来一条鱼！');
    } else hud.toast('跑掉了……');
    fishing = null;
    hud.close();
    return true;
  };

  // ---- 种植 --------------------------------------------------------------------------------------------------
  const openPlant = (it) => {
    hud.open(
      '门前的菜地',
      `<p>这块地空着。要种点什么？</p><p class="dim">手上的种子：${state.bag.seed ?? 0} 包 · 已经种下 ${state.plots.length} 块</p>`,
      [
        {
          label: '种一包菜种（🌱×1）',
          primary: true,
          disabled: (state.bag.seed ?? 0) < 1,
          onClick: () => {
            if (!take('seed', 1)) return;
            state.plots.push({ x: it.x, z: it.z, t: 0, name: '青菜' });
            state.stats.planted++;
            hud.close();
            hud.toast('种下了。过 20 秒再来看看');
          },
        },
        { label: '算了', onClick: () => hud.close() },
      ],
    );
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
          hud.toast(`做好了 ${r.name}`);
          syncStats();
          openCook();
        },
      })).concat([{ label: '关火', onClick: () => hud.close() }]),
    );
  };

  // ---- 商店 --------------------------------------------------------------------------------------------------
  const shop = (title, list, blurb) => {
    const rows = list.map((k) => `<tr><td>${ITEMS[k].icon} ${ITEMS[k].name}</td><td class="need">${ITEMS[k].price} 金币</td></tr>`).join('');
    hud.open(
      title,
      `<p>${blurb}</p><p class="dim">钱：${state.coins} 金币</p><table class="recipes"><tbody>${rows}</tbody></table>`,
      list
        .map((k) => ({
          label: `买 ${ITEMS[k].icon}${ITEMS[k].name}（${ITEMS[k].price}）`,
          disabled: state.coins < ITEMS[k].price,
          onClick: () => {
            state.coins -= ITEMS[k].price;
            add(k, 1);
            state.stats.shopped++;
            syncStats();
            shop(title, list, blurb);
          },
        }))
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
      hud.toast(`打完 5 轮，共 ${got} 分，换到 ${got * 3} 金币`);
    }
    return true;
  };

  const harvest = (it) => {
    const plot = state.plots.find((p) => p.t >= 20 && Math.hypot(p.x - it.x, p.z - it.z) < 6);
    if (!plot) return false;
    add('veg', 2);
    state.stats.harvested++;
    if (Math.random() < 0.5) add('seed', 1);
    hud.toast('收了 2 颗青菜');
    state.plots.splice(state.plots.indexOf(plot), 1);
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
    switch (it.kind) {
      case 'door':
        onDoor?.(true);
        break;
      case 'fish':
        if (!player.nearWater) return void hud.toast('离水太远了，往岸边站一点');
        startFishing();
        break;
      case 'plant':
        if (harvest(it)) break;
        openPlant(it);
        break;
      case 'farm':
        hud.toast('农夫：「今年的稻子长得不错。要种子的话，旁边铺子里有。」');
        break;
      case 'seed':
        shop('花鸟市场', ['seed', 'flower', 'veg'], '花苗、菜种，还有一笼会咕咕叫的鸽子。');
        break;
      case 'market':
        shop('菜市场', ['veg', 'fish', 'rice'], '早上的青菜还带着露水。');
        break;
      case 'shop':
        shop('超市', ['rice', 'tea', 'veg', 'fish', 'seed'], '灯管嗡嗡响，冷气很足。');
        break;
      case 'eat':
        shop('小吃街', ['rice', 'tea', 'fish'], '油锅的声音从街那头传过来。');
        break;
      case 'net': {
        const posts = [
          '【求助】推理链太长被老板说摸鱼，怎么办',
          '【闲聊】今天的白米饭特别香',
          '【提问】为什么我算 9.11 比 9.9 大（已经改了）',
          '【攻略】清镇湖钓鱼点位分享，靠北岸第三块石头',
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
          hud.toast('跑了两圈，体力 +14（门票 5 金币）');
        } else hud.toast('太累了，先吃点东西');
        break;
      case 'read': {
        const books = [
          '《山谷的四季》：春天，草从白色的雪里钻出来，像有人用笔尖点了一下。',
          '《手绘背景的十二种云》：卷云要画得急，积云要画得慢。',
          '《清镇市志》：此地旧名清溪，后因山泉清冽改称清镇。',
          '《如何不被叫胖》：第一章，「我不是胖，我是鲸」。',
        ];
        state.stats.read++;
        state.stamina = Math.min(100, state.stamina + 6);
        syncStats();
        hud.open('图书馆', `<p>${books[Math.floor(Math.random() * books.length)]}</p><p class="dim">安静得能听见翻页的声音。</p>`, [
          { label: '合上书', onClick: () => hud.close() },
        ]);
        break;
      }
      case 'study':
        hud.toast(`在${it.name}上了半节课，感觉又聪明了一点（并没有）`);
        break;
      case 'pray':
        state.luck = Math.min(3, state.luck + 1);
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
        hud.toast('硬币沉进水里，翻了个身。愿望说给水听');
        break;
      case 'mail': {
        const letters = ['一封是广告：「清镇市第一届钓鱼大赛报名中」', '一张明信片，背面画着一朵云', '一封信写着「鱼片，记得按时吃饭」', '里面只有一张白纸，可能重要，可能不重要'];
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
      case 'village':
        hud.open(it.name, `<p>${it.text ?? ''}</p>`, [{ label: '嗯', onClick: () => hud.close() }]);
        break;
      case 'station':
        hud.open('高铁站', '<p>大厅里很亮，广播在报站。</p><table><tr><td>G37 → 玉海城</td><td class="need">线路还在铺</td></tr><tr><td>G52 → 海边新城</td><td class="need">线路还在铺</td></tr></table><p class="dim">《幻想世界地图》上的玉海城、大学城、港口——等铁路修好就能去了。按 M 可以看地图。</p>', [
          { label: '看看地图', onClick: () => { hud.close(); onMap?.(); } },
          { label: '下次再来', onClick: () => hud.close() },
        ]);
        break;
      case 'bus': {
        const stops = busStops.filter((st) => st.name !== it.stop);
        hud.open('1 路公交', `<p>站牌：${it.stop}。车票 2 金币。</p>`, [
          ...stops.map((st) => ({
            label: `去 ${st.name}（2）`,
            disabled: state.coins < 2,
            onClick: () => {
              state.coins -= 2;
              state.minutes += 12;
              hud.close();
              onTravel?.(st);
              syncStats();
              hud.toast(`坐 1 路公交到了 ${st.name}`);
            },
          })),
          { label: '不坐了', onClick: () => hud.close() },
        ]);
        break;
      }
      case 'gate':
        hud.open('清镇市', '<p>牌坊上的字被太阳晒得发白。门那头是更远的山。</p><p class="dim">城里：广场、学校、教堂、夫子庙、市场、网吧、电玩厅、体育馆……</p>', [
          { label: '进城', onClick: () => hud.close() },
        ]);
        break;
      case 'gather':
        if (Math.random() < 0.75 + state.luck * 0.05) {
          add('flower', 1);
          hud.toast('采到一朵野花');
        } else hud.toast('这丛还没开');
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
        hud.toast(`睡到第二天早上（第 ${state.day} 天）`);
        break;
      case 'desk':
        state.stamina = Math.min(100, state.stamina + 4);
        syncStats();
        if (it.seat) onSit?.(it);
        hud.open('书房', '<p>桌上摊着一本手绘背景的画册，边角被翻得起了毛。</p><p class="dim">「颜色要按颜料去调，不要按光去调。」</p>', [
          { label: '合上', onClick: () => hud.close() },
        ]);
        break;
      case 'bath':
        state.stamina = Math.min(100, state.stamina + 20);
        state.hunger = Math.max(0, state.hunger - 4);
        syncStats();
        hud.toast('洗了个热水澡，整个人都松了（体力 +20）');
        break;
      default:
        hud.toast(it.name);
    }
  };

  const update = (dt) => {
    clock += dt;
    state.minutes += dt * 120; // 现实 1 秒 = 游戏 2 分钟
    if (state.minutes >= 24 * 60) {
      state.minutes -= 24 * 60;
      state.day++;
    }
    state.hunger = Math.max(0, state.hunger - dt * 0.32);
    if (state.hunger > 12) state.stamina = Math.min(100, state.stamina + dt * 1.1);
    else state.stamina = Math.max(0, state.stamina - dt * 0.6);
    for (const plot of state.plots) plot.t += dt;
    if (fishing) {
      fishing.t += dt;
      if (fishing.phase === 'cast' && fishing.t > fishing.wait) {
        fishing.phase = 'bite';
        fishing.life = 1.5;
      } else if (fishing.phase === 'bite') {
        fishing.life -= dt;
        if (fishing.life <= 0) {
          fishing = null;
          hud.close();
          hud.toast('鱼把饵吃了，跑了');
        }
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