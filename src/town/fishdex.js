// 鱼的图鉴：哪种水里有哪些鱼、多难钓、值多少钱。图片在 public/textures/plants/fish.png（tools/pack-extra.py 打的图集）。
//
// 三种水：月亮湖（湖）、清溪河（溪流，冷水鱼多）、东边的大海（海）。
// 稀有度：1 常见 · 2 少见 · 3 稀有 · 4 传说。越稀有越难上钩、拉竿的时间越短、卖得越贵。

/** [图集里的名字, 中文名, 稀有度, 一句话] */
const LAKE = [
  ['crucian-carp', '鲫鱼', 1, '小而耐活，熬汤最鲜'],
  ['common-carp', '鲤鱼', 1, '嘴边两对须，过年要吃'],
  ['grass-carp', '草鱼', 1, '吃水草长大的，个头大'],
  ['silver-carp', '鲢鱼', 1, '一跳一跳的，鳞很细'],
  ['bighead-carp', '胖头鱼', 1, '头大，拿来炖豆腐'],
  ['bream', '鳊鱼', 1, '扁扁的，银白'],
  ['wuchang-bream', '武昌鱼', 2, '才饮长沙水，又食武昌鱼'],
  ['tilapia', '罗非鱼', 1, '什么水都能活'],
  ['mud-carp', '鲮鱼', 1, '做鱼丸的那种'],
  ['black-carp', '青鱼', 2, '专吃螺蛳，力气很大'],
  ['catfish', '鲶鱼', 2, '胡子长长，夜里才出来'],
  ['snakehead', '黑鱼', 2, '凶，咬钩就往草里钻'],
  ['yellow-catfish', '黄辣丁', 1, '背鳍有刺，小心扎手'],
  ['mandarin-fish', '鳜鱼', 3, '桃花流水鳜鱼肥'],
  ['freshwater-perch', '河鲈', 2, '身上一道道黑纹'],
  ['topmouth-culter', '翘嘴鲌', 2, '嘴往上翘，追小鱼吃'],
  ['bitterling', '鳑鲏', 1, '指头大，闪着蓝光'],
  ['tench', '丁鱥', 2, '滑溜溜的，绿褐色'],
  ['northern-pike', '白斑狗鱼', 3, '湖里的霸王'],
  ['swamp-eel', '黄鳝', 2, '其实不是鳗鱼'],
  ['japanese-eel', '鳗鲡', 3, '从海里游回来的'],
  ['pond-loach', '泥鳅', 1, '钻泥的，滑得抓不住'],
  ['sleeper-goby', '沙塘鳢', 2, '趴在石头上不动'],
  ['goldfish', '金鱼', 3, '谁家放生的吧'],
  ['koi-carp', '锦鲤', 3, '红白相间，据说会带来好运'],
  ['chinese-sturgeon', '中华鲟', 4, '比恐龙还古老的鱼——拍张照就放回去吧'],
];
const RIVER = [
  ['stone-moroko', '麦穗鱼', 1, '溪里最多的小鱼'],
  ['dace', '雅罗鱼', 1, '银亮亮的一条'],
  ['chub', '鲢子鱼', 1, '浅滩里成群游'],
  ['gudgeon', '鮈鱼', 1, '贴着沙底游'],
  ['river-goby', '吻虾虎', 1, '鼓着腮帮子'],
  ['chinese-sucker', '胭脂鱼', 3, '一帆风顺，背鳍像船帆'],
  ['barbel', '鲃鱼', 2, '嘴边四根须'],
  ['spined-loach', '花鳅', 1, '一节一节的斑'],
  ['weatherfish', '大鳞副泥鳅', 1, '下雨前会浮上来'],
  ['torrent-catfish', '石爬鮡', 2, '吸在急流的石头上'],
  ['bagrid-catfish', '鮠鱼', 2, '也叫江团'],
  ['rainbow-trout', '虹鳟', 2, '身上一道彩虹'],
  ['brown-trout', '褐鳟', 2, '一身红点'],
  ['lenok', '细鳞鲑', 3, '只在最凉的水里'],
  ['arctic-grayling', '北极茴鱼', 3, '背鳍像一面旗'],
  ['arctic-char', '红点鲑', 3, '从雪山上流下来的水里才有'],
  ['amur-pike', '黑斑狗鱼', 3, '一口能吞下半条鱼'],
  ['taimen', '哲罗鲑', 4, '河里的老虎，一米多长'],
  ['european-eel', '欧洲鳗', 3, '不知道怎么游到这儿来的'],
];
const SEA = [
  ['sardine', '沙丁鱼', 1, '一群一群的'],
  ['anchovy', '鳀鱼', 1, '做鱼露的'],
  ['herring', '鲱鱼', 1, '银色的小鱼'],
  ['pacific-saury', '秋刀鱼', 1, '烤一烤，撒点盐'],
  ['spanish-mackerel', '马鲛鱼', 1, '包饺子的那种'],
  ['yellow-croaker', '黄鱼', 2, '金黄金黄的'],
  ['croaker', '黄姑鱼', 1, '会咕咕叫'],
  ['hairtail', '带鱼', 2, '像一条银腰带'],
  ['pomfret', '鲳鱼', 2, '扁扁圆圆，清蒸'],
  ['butterfish', '鲹鱼', 1, '尾巴细细的'],
  ['grey-mullet', '鲻鱼', 1, '在码头边转悠'],
  ['pacific-cod', '鳕鱼', 2, '从深水里拉上来的'],
  ['red-sea-bream', '真鲷', 2, '红色的，喜庆'],
  ['black-sea-bream', '黑鲷', 2, '狡猾，很难钓'],
  ['snapper', '笛鲷', 2, '粉红色的大鱼'],
  ['grouper', '石斑鱼', 3, '躲在礁石缝里'],
  ['flounder', '牙鲆', 2, '两只眼睛长在一边'],
  ['halibut', '大比目鱼', 3, '比桌面还大'],
  ['turbot', '多宝鱼', 2, '一身疙瘩'],
  ['john-dory', '海鲂', 2, '身上一个黑圆点'],
  ['gurnard', '鲂鮄', 2, '胸鳍像蓝色的翅膀'],
  ['scorpionfish', '鲉鱼', 3, '鳍上有毒刺'],
  ['conger-eel', '星康吉鳗', 2, '夜里从石缝里出来'],
  ['monkfish', '鮟鱇', 3, '长得有点吓人，很好吃'],
  ['parrotfish', '鹦嘴鱼', 3, '会啃珊瑚'],
  ['clownfish', '小丑鱼', 3, '和海葵住在一起'],
  ['butterflyfish', '蝴蝶鱼', 3, '黄黑相间'],
  ['flying-fish', '飞鱼', 3, '会贴着海面飞'],
  ['mahi-mahi', '鬼头刀', 3, '金绿色的，跑得飞快'],
  ['ocean-sunfish', '翻车鱼', 4, '又圆又扁，像被切了一半'],
  ['bluefin-tuna', '蓝鳍金枪鱼', 4, '拉了半个小时才上来'],
  ['swordfish', '剑鱼', 4, '嘴是一把长剑'],
  ['oarfish', '皇带鱼', 4, '传说中的海龙王'],
  ['coelacanth', '腔棘鱼', 4, '活化石——这是真的吗'],
];

const PRICE = [0, 14, 30, 70, 200];
const WEIGHT = [0, 60, 26, 9, 1.4];
export const RARITY = ['', '常见', '少见', '稀有', '传说'];

const make = (list, water) => list.map(([id, name, rarity, note]) => ({ id, name, rarity, note, water, price: PRICE[rarity] }));
export const FISH = [...make(LAKE, 'lake'), ...make(RIVER, 'river'), ...make(SEA, 'sea')];
export const BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]));
export const WATER_NAME = { lake: '月亮湖', river: '清溪河', sea: '大海' };

/**
 * 钓一条。
 * @param water 'lake' | 'river' | 'sea'
 * @param luck 运气（祈祷、许愿加的）；night 夜里鲶鱼鳗鱼多；rain 下雨鱼口好
 */
export function rollFish(water, { luck = 0, night = false, rain = false } = {}) {
  const pool = FISH.filter((f) => f.water === water);
  const weights = pool.map((f) => {
    let w = WEIGHT[f.rarity] * (1 + luck * 0.15 * (f.rarity - 1));
    if (night && /eel|catfish|loach|monk|conger/.test(f.id)) w *= 3;
    if (rain && f.rarity >= 2) w *= 1.4;
    return w;
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[0];
}

/** 图集里一个精灵 → CSS 背景（给界面上的小图标用） */
export function spriteStyle(sp, atlasUrl, size = 48) {
  if (!sp) return '';
  const k = size / Math.max(sp.w, sp.h);
  const W = 2048 * k;
  const x = sp.u0 * W;
  const y = (1 - sp.v1) * W;
  const w = (sp.u1 - sp.u0) * W;
  const h = (sp.v1 - sp.v0) * W;
  return `display:inline-block;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;background:url(${atlasUrl}) ${(-x).toFixed(1)}px ${(-y).toFixed(1)}px / ${W.toFixed(0)}px ${W.toFixed(0)}px no-repeat;vertical-align:middle`;
}
