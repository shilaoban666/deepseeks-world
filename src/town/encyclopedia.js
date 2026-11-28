// 博物图鉴与物品手账数据 + 轻柔昭和手账界面音效（零外部音频依赖）
import { CROPS, produceSprite, plantSprite } from './farming.js';
import { DISTRICTS, RAIL_STATIONS, HOME, LAKE, PLAZA } from './plan.js';

/** 飞鸟与小动物图鉴 */
export const CRITTERS_DEX = [
  { id: 'pigeon', name: '广场白鸽', icon: '🕊️', place: '玉海宫广场 / 老街', time: '全天', rarity: 1, defaultUnlocked: true, note: '不怕人，总在石板广场上摇摇摆摆地找面包屑，飞起来会带起一阵暖风。' },
  { id: 'duck', name: '清溪绿头鸭', icon: '🦆', place: '清溪河 / 月亮湖', time: '白天', rarity: 1, defaultUnlocked: true, note: '常排成一队顺着河湾漂流，偶尔一头扎进水里只露出圆滚滚的尾巴。' },
  { id: 'butterfly', name: '菜地菜粉蝶', icon: '🦋', place: '鱼鱼家菜地 / 田园小镇', time: '晴天白天', rarity: 1, defaultUnlocked: true, note: '白色的翅膀像被风吹起的纸片，最爱在刚浇过水的白菜和萝卜叶上打转。' },
  { id: 'seagull', name: '海滨银鸥', icon: '🦅', place: '海滨小镇 / 港口 / 沙滩', time: '全天', rarity: 2, placeMatch: /海|港|滩/, note: '乘着海风在灯塔与防波堤之间盘旋，叫声里带着咸咸的潮汐味。' },
  { id: 'firefly', name: '夏夜萤火虫', icon: '✨', place: '鱼鱼家草坡 / 河畔', time: '夜晚', rarity: 3, placeMatch: /鱼鱼家|田园|湖/, note: '太阳落山后才从草叶间飘出来，一闪一闪像掉在地面上的小星星。' },
  { id: 'swallow', name: '屋檐家燕', icon: '🐦', place: 'AI 小镇 / 玉海城老街', time: '清晨与黄昏', rarity: 2, placeMatch: /玉海|小镇|街/, note: '剪刀尾巴贴着屋檐低飞，老人说它们飞得低的时候，天快要下雨了。' },
  { id: 'egret', name: '浅滩小白鹭', icon: '🦢', place: '月亮湖畔 / 河鲜集市', time: '清晨', rarity: 3, placeMatch: /湖|河/, note: '单脚静静立在晨雾里的浅水边，雪白的羽毛映在水面像一幅水彩画。' },
  { id: 'frog', name: '稻田青蛙', icon: '🐸', place: '田园小镇 / 麦田水沟', time: '雨天与傍晚', rarity: 2, placeMatch: /田园|麦田/, note: '雨点落下来时最热闹，躲在田埂草丛里此起彼伏地合唱。' },
  { id: 'squirrel', name: '松林红松鼠', icon: '🐿️', place: '雪山山麓 / 环城绿带', time: '白天', rarity: 3, placeMatch: /雪山|大学/, note: '捧着松果在树枝间跳来跳去，蓬松的大尾巴比身子还长。' },
  { id: 'cat', name: '老街三花猫', icon: '🐈', place: '玉海电影院 / 书店屋檐', time: '午后', rarity: 2, placeMatch: /玉海|城/, note: '总在晒得暖烘烘的石阶上蜷成一团，有人路过也只是懒洋洋地眯一下眼。' },
];

/** 小镇建筑与地标图鉴（结合真实分区坐标与特色建筑） */
export const BUILDINGS_DEX = [
  { id: 'home', name: '鱼鱼家', icon: '🏡', tag: '温馨居所', pos: HOME, defaultUnlocked: true, note: '清溪河拐弯处的木构小屋，门口有八块菜地。推门进去有厨房、书桌和软软的床。' },
  { id: 'yuhai-palace', name: '玉海宫与广场', icon: '🏯', tag: '城市地标', pos: PLAZA, defaultUnlocked: true, note: '玉海城正中的金顶古建，宽阔的石板广场上常有白鸽落脚，是整座城市的起点。' },
  { id: 'hsr-grand', name: '玉海高铁总站', icon: '🚄', tag: '交通枢纽', pos: [RAIL_STATIONS[0]?.x ?? 40, RAIL_STATIONS[0]?.z ?? 540], defaultUnlocked: true, note: '高架上的海青色流线高铁从这里出发，买票上站台坐在长椅候车，就能乘车环游全城。' },
  { id: 'hsr-pastoral', name: '田园高铁站', icon: '🚉', tag: '田园站台', pos: [RAIL_STATIONS[1]?.x ?? -660, RAIL_STATIONS[1]?.z ?? 180], note: '掩映在金色麦田旁的小站，木质候车亭与青瓦屋顶下总能吹来稻香。' },
  { id: 'moon-lake', name: '月亮湖', icon: '🌙', tag: '自然胜景', pos: [LAKE.x, LAKE.z], note: '城北如弯月般的湛蓝湖泊，湖水澄澈，盛产鲫鱼与稀有的月亮鲈，夜晚能看见月光碎影。' },
  { id: 'ai-town', name: 'AI 小镇', icon: '🏘️', tag: '生活街区', pos: [-490, -110], note: '红瓦白墙的木构架小镇，街角停着复古自行车与敞篷小车，邻里间烟火气十足。' },
  { id: 'pastoral-farm', name: '田园农庄与菜市', icon: '🌾', tag: '农耕田园', pos: [-680, 40], note: '清溪河西岸成片的农田与果园，可以在这里买种子、租地种菜，也能把丰收的菜卖给集市。' },
  { id: 'river-market', name: '清溪河鲜集市', icon: '🧺', tag: '水岸集市', pos: [-520, 210], note: '紧挨着清溪河的露天摊位，架子上晒着鱼干，刚钓上来的活鱼在这里最受欢迎。' },
  { id: 'cinema', name: '玉海电影院', icon: '🎬', tag: '文化休闲', pos: [110, -40], note: '老城里的复古放映厅，花 12 金币看一场老电影，能舒舒服服恢复 30 点体力。' },
  { id: 'university', name: '大学城与图书馆', icon: '📚', tag: '书香校园', pos: [440, -460], note: '东北方的林荫校园，安静的图书馆里藏着《山谷的四季》与《手绘背景的十二种云》。' },
  { id: 'seaside-port', name: '海滨灯塔与港口', icon: '⚓', tag: '海风港湾', pos: [660, 120], note: '悬崖上的红白灯塔守望着东海，港湾里停着木船与独木舟，推下水就能出海划船。' },
  { id: 'snow-town', name: '雪山小镇', icon: '🏔️', tag: '北境雪国', pos: [-580, -640], note: '西北高坡上常年积雪的小镇，蓝白相间的雪坡适合滑雪，抬头便是巍峨的远山雪峰。' },
  { id: 'cbd', name: '新新区 CBD', icon: '🏙️', tag: '现代城区', pos: [490, -80], note: '玉海城东侧的玻璃幕墙与林荫大道，夕阳照在楼群上会染出温暖的橘金色。' },
  { id: 'beach', name: '南岸海滩排档', icon: '🏖️', tag: '滨海度假', pos: [-60, 620], note: '绵长的金色沙滩与海鲜排档，可以晒太阳、冲浪，或者捡拾潮水留下的贝壳与珍珠。' },
];

/** 物品分类与手账风描述 */
export const ITEM_META = {
  rice:   { cat: 'food',    desc: '粒粒饱满的热气白米饭，小鲸鱼最爱的日常主食。', effect: '饱食 +18' },
  cooked: { cat: 'food',    desc: '亲手在厨房小火慢做出来的家常料理，香气扑鼻。', effect: '饱食 +45' },
  tea:    { cat: 'food',    desc: '甜度刚好的手摇奶茶，逛累了喝一口立刻回神。', effect: '饱食 +10 · 体力 +8' },
  fruit:  { cat: 'food',    desc: '果园里刚摘下的新鲜时令水果，汁水清甜。', effect: '饱食 +12' },
  veg:    { cat: 'produce', desc: '带着清晨露水的脆嫩青菜，可直接吃也能回厨房下锅。', effect: '饱食 +6 / 可烹饪' },
  fish:   { cat: 'produce', desc: '刚从水里钓起来的鲜鱼，拿去做炭烤鱼饭或卖给集市都很棒。', effect: '可烹饪 / 可出售' },
  flower: { cat: 'produce', desc: '山坡和路边采到的清新野花，带着阳光与青草香。', effect: '观赏 / 装饰' },
  pearl:  { cat: 'produce', desc: '在海边浅滩或潜水时偶遇的温润珍珠，闪着柔和微光。', effect: '珍贵收藏 / 高价出售' },
  shell:  { cat: 'produce', desc: '海浪冲上沙滩的螺旋贝壳，贴近耳朵能听见海风声。', effect: '海滨纪念 / 可出售' },
};

export function getItemInfo(item) {
  if (!item) return { cat: 'produce', desc: '旅途中收集到的小物件。', effect: '' };
  if (ITEM_META[item.key]) return ITEM_META[item.key];
  if (item.seedOf) {
    const c = CROPS.find((x) => x.id === item.seedOf);
    return {
      cat: 'seed',
      desc: c ? `${c.note}。带着它走到菜地旁按 E 即可播种，约 ${c.hours} 小时成熟。` : '可以种在菜地里的种子包。',
      effect: c ? `成熟 ${c.hours}h · 收获卖 ${c.sell} 金币` : '菜地播种',
    };
  }
  if (item.crop) {
    const c = CROPS.find((x) => x.id === item.crop);
    return {
      cat: 'produce',
      desc: c ? `亲手种出的新鲜${c.name}：${c.note}。` : '自家菜地丰收的农作物。',
      effect: c ? `饱食 +${c.food} · 集市收购 ${c.sell} 金币` : '',
    };
  }
  return { cat: 'produce', desc: '旅途中收集到的小物件。', effect: '' };
}

/** 根据农作物获取 farm 图集里的精灵名 */
export { CROPS, produceSprite, plantSprite, DISTRICTS };

// ---- 轻柔昭和手账界面音效（Web Audio 合成，无需外部音频文件） -----------------------------------------
const SETTINGS_KEY = 'tg-settings';
const EMOTE_SLOTS_KEY = 'tg-emote-slots';

/** 完整 dsh-pet 风格表情与互动动作目录（供右上角「表情」面板播放与绑定 1~9 快捷键） */
export const EMOTE_CATALOG = [
  { id: 'wave',        label: '挥手招呼', icon: '👋', dur: 1.8, cat: '日常' },
  { id: 'happy',       label: '开心蹦跳', icon: '😆', dur: 2.0, cat: '情绪' },
  { id: 'dance',       label: '转圈跳舞', icon: '💃', dur: 3.2, cat: '表演' },
  { id: 'cheer',       label: '元气欢呼', icon: '🙌', dur: 1.8, cat: '情绪' },
  { id: 'think',       label: '托腮思考', icon: '🤔', dur: 2.8, cat: '日常' },
  { id: 'shy',         label: '害羞捂脸', icon: '😳', dur: 2.4, cat: '情绪' },
  { id: 'angry',       label: '生气跺脚', icon: '😤', dur: 2.0, cat: '情绪' },
  { id: 'dizzy',       label: '晕乎乎',   icon: '😵', dur: 2.4, cat: '情绪' },
  { id: 'shock',       label: '吓一跳',   icon: '😲', dur: 1.6, cat: '情绪' },
  { id: 'float',       label: '轻盈漂浮', icon: '🫧', dur: 3.0, cat: '表演' },
  { id: 'sleep_start', label: '打哈欠',   icon: '🥱', dur: 2.2, cat: '日常' },
  { id: 'sleep',       label: '安心打盹', icon: '😴', dur: 3.6, cat: '日常' },
  { id: 'sleep_end',   label: '伸个懒腰', icon: '🙆', dur: 2.0, cat: '日常' },
  { id: 'eat',         label: '开心干饭', icon: '🍙', dur: 2.2, cat: '日常' },
  { id: 'read',        label: '捧书阅读', icon: '📖', dur: 2.6, cat: '日常' },
  { id: 'pray',        label: '合十许愿', icon: '🙏', dur: 2.4, cat: '日常' },
  { id: 'cook',        label: '颠勺做饭', icon: '🍳', dur: 2.4, cat: '表演' },
  { id: 'photo',       label: '比耶摆拍', icon: '✌️', dur: 2.0, cat: '表演' },
];

export const DEFAULT_EMOTE_SLOTS = ['wave', 'happy', 'dance', 'think', 'sleep', 'shy', 'angry', 'dizzy', 'shock'];

export function loadEmoteSlots() {
  try {
    const raw = JSON.parse(localStorage.getItem(EMOTE_SLOTS_KEY) || 'null');
    if (Array.isArray(raw) && raw.length === 9) return raw;
  } catch {}
  return [...DEFAULT_EMOTE_SLOTS];
}

export function saveEmoteSlots(slots) {
  try {
    localStorage.setItem(EMOTE_SLOTS_KEY, JSON.stringify(slots));
  } catch {}
}

export const DEFAULT_SETTINGS = {
  masterVolume: 75,
  ambientSound: true,
  uiSfx: true,
  showMinimap: true,
  showActionbar: false,
  showHelp: false,
  showQuickbag: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    // 若用户尚未在 v2 布局里手动调整过，保持干净的底部默认隐藏快捷栏
    if (parsed._v !== 2) {
      return { ...DEFAULT_SETTINGS, ...parsed, showActionbar: false, showHelp: false, _v: 2 };
    }
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS, _v: 2 };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, _v: 2 }));
  } catch {}
}

let audioCtx = null;
export function playUiSound(type = 'click', settings = null) {
  const s = settings ?? loadSettings();
  if (!s.uiSfx || s.masterVolume <= 0) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const vol = (s.masterVolume / 100) * 0.08;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    if (type === 'page') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(760, now + 0.055);
      gain.gain.setValueAtTime(vol * 0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'open') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.08);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.11);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'close') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.07);
      gain.gain.setValueAtTime(vol * 0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.1);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.045);
      gain.gain.setValueAtTime(vol * 0.75, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.065);
    }
  } catch {}
}
