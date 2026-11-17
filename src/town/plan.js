// 小鲸鱼的世界：地图的骨架。和一个地方（world.js）一样，地形是纯函数——没有高度图文件，草地、碰撞、
// 小地图、放置物全部读同一个 heightAt，所以永远一致。
//
// 布局（世界坐标，x 向东，z 向南，米）：
//   家在城市西北的路口，往东南 120 m 是中心广场；广场放射出四条街：
//   北去清镇市城门，西去学校区，东去体育馆，南去湖。
//   城市半径约 420 m，外面是农田、森林、湖、最后是山。

const TAU = Math.PI * 2;

function hash(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x, z, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x, z, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    x = x * 2.03 + 11.7;
    z = z * 2.03 - 5.3;
  }
  return sum / norm;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export { smooth };

/** 地图有多大：世界是 [-HALF, HALF] 的正方形。 */
export const HALF = 1024;
/** 城市的中心：广场。 */
export const PLAZA = [110, 60];
/** 家：小鲸鱼的房子在城的西北角，也就是开局站的地方。 */
export const HOME = [0, 0];
/** 湖。 */
// 地理照《鱼的小镇地图》：月亮湖在镇子正北的山脚，清溪河从湖的西口出来沿镇西一路往南，
// 东边是大海，海边有海滨小镇和灯塔；镇东是高铁站，东南是高铁新城，西北雪山小镇，西南田园小镇。
export const LAKE = { x: -150, z: -600, rx: 150, rz: 100, level: 12, bed: 5 };
/** 海：东边。海面比镇子（-6 m）低一点。 */
export const SEA = { level: -9 };
/** 海岸线在 z 处的 x（往东是海）。 */
export const coastX = (z) => 790 + 55 * Math.sin(z / 210 + 0.7) + 30 * Math.sin(z / 83);
/** 清溪河：从月亮湖西口到地图南边。 */
export const RIVER = [[-262, -560], [-340, -470], [-410, -420], [-440, -280], [-430, -140], [-440, 0], [-470, 140], [-500, 280], [-500, 420], [-480, 560], [-470, 700], [-480, 860], [-490, 1100]];
const RSEGS = [];
{
  let along = 0;
  for (let i = 0; i + 1 < RIVER.length; i++) {
    const [ax, az] = RIVER[i];
    const [bx, bz] = RIVER[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    RSEGS.push({ ax, az, bx, bz, len, from: along, minx: Math.min(ax, bx) - 90, maxx: Math.max(ax, bx) + 90, minz: Math.min(az, bz) - 90, maxz: Math.max(az, bz) + 90 });
    along += len;
  }
  RSEGS.total = along;
}
/** 到河中线的距离 d，和沿河走了多远 t（0 在湖口，1 在南边）。离河远的地方 d 很大。 */
export function riverAt(x, z) {
  let d = 1e4;
  let t = 0;
  for (const s of RSEGS) {
    if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const k = Math.min(1, Math.max(0, ((x - s.ax) * dx + (z - s.az) * dz) / (s.len * s.len)));
    const dd = Math.hypot(x - (s.ax + dx * k), z - (s.az + dz * k));
    if (dd < d) {
      d = dd;
      t = (s.from + s.len * k) / RSEGS.total;
    }
  }
  // 河是弯的：中线加一点摆动，别是一段段直线
  if (d < 200) d = Math.abs(d + 5 * Math.sin(t * 60)) ;
  return { d, t };
}
/** 河面的海拔：从湖面一路降到南边。 */
export const riverLevel = (t) => LAKE.level - 0.4 + (-8.2 - LAKE.level) * Math.pow(t, 0.75);
/** 河的半宽（米）。 */
export const RIVER_HALF = 7;
/** 桥：路跨河的地方。x,z 桥心；rot 桥身方向（弧度，局部 +z 沿桥）；len 桥长；w 桥宽。 */
export const BRIDGES = [
  { name: '石板桥', x: -414, z: -429, rot: Math.atan2(-260, -10), len: 34, w: 6 },
  { name: '东溪桥', x: -477, z: 627, rot: Math.atan2(80, 50), len: 32, w: 5 },
];
for (const b of BRIDGES) b.deck = riverLevel(riverAt(b.x, b.z).t) + 1.5;
/** 在不在桥面上；在的话返回桥。 */
export function bridgeAt(x, z) {
  for (const b of BRIDGES) {
    const dx = x - b.x;
    const dz = z - b.z;
    const along = dx * Math.sin(b.rot) + dz * Math.cos(b.rot);
    const across = dx * Math.cos(b.rot) - dz * Math.sin(b.rot);
    if (Math.abs(along) < b.len / 2 && Math.abs(across) < b.w / 2) return b;
  }
  return null;
}
/** 城门：清镇市的牌坊。 */
export const GATE = [110, -330];
/** 城市半径（过了这个半径就是野外）。 */
export const CITY_R = 430;

/** 到湖心的椭圆距离：<1 在水里。 */
export function lakeDistance(x, z) {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const wobble = 1 + 0.08 * Math.sin(Math.atan2(dz, dx) * 3 + 1.1) + 0.05 * Math.sin(Math.atan2(dz, dx) * 7);
  return Math.hypot(dx / LAKE.rx, dz / LAKE.rz) / wobble;
}

/** 到城市中心的距离（米）。 */
export function cityDistance(x, z) {
  return Math.hypot(x - PLAZA[0], z - PLAZA[1]);
}

// ---- 路 --------------------------------------------------------------------------------------------------------
// 每条路是一串点；路面按 8 m 宽画，小地图和"不要长草"都读它。
export const ROADS = [
  // 家 → 广场（开局这条）
  [[0, 0], [26, 16], [58, 36], [110, 60]],
  // 广场 → 城门（北）
  [[110, 60], [110, -40], [110, -150], [110, -260], [110, -330]],
  // 广场 → 学校（西）
  [[110, 60], [10, 40], [-90, 30], [-190, 10], [-280, -10], [-330, -30]],
  // 广场 → 体育馆（东）
  [[110, 60], [200, 70], [290, 80], [330, 90]],
  // 广场 → 高铁新城（东南）
  [[110, 60], [140, 180], [220, 300], [290, 430], [330, 530]],
  // 小吃街（广场西南）
  [[110, 60], [40, 120], [-30, 160]],
  // 居民区 A 环线
  [[110, 60], [180, 160], [230, 230]],
  // 城门外的乡道 → 农村
  [[110, -330], [-140, -420], [-400, -430], [-560, -380]],
  // 农村 → 农田
  [[-560, -380], [-640, -160], [-650, 60]],
  // 湖 → 花鸟市场
  [[220, 300], [120, 250], [-10, 250]],
  // 10 北街 → 电玩厅 → 教堂 → 夫子庙
  [[110, -40], [62, -72], [12, -84], [-70, -104], [-138, -118], [-200, -168], [-250, -208]],
  // 11 北街 → 冒险者协会
  [[110, -150], [140, -146]],
  // 12 东街 → 超市
  [[200, 70], [222, 32], [232, 12]],
  // 13 西街 → 图书馆 → 居民区·西
  [[-90, 30], [-128, 76], [-164, 100], [-226, 176], [-286, 236]],
  // 14 北街 → 居民区·北
  [[110, -260], [84, -280], [64, -288]],
  // 15 田园小镇的小路（过东溪桥到蔬菜田园）
  [[-650, 60], [-640, 300], [-620, 470], [-520, 600], [-440, 650]],
  // 16 东街 → 高铁站
  [[330, 90], [440, 118], [530, 140]],
  // 17 高铁站 → 海滨小镇 → 灯塔
  [[530, 140], [596, -60], [628, -250], [640, -320], [700, -356], [736, -370]],
  // 18 北街 → 河鲜集市
  [[110, -100], [150, -100], [170, -98]],
  // 19 城门 → 月亮湖
  [[110, -330], [40, -420], [-30, -480]],
  // 20 高铁站 → 沙滩
  [[530, 140], [640, 110], [720, 80]],
  // 21 雪山小镇的岔路
  [[-640, -160], [-624, -230]],
];
/** 1 路公交：广场 → 高铁站 → 海滨小镇（沿着上面的路） */
export const BUS_ROUTE = [[124, 62], [200, 70], [290, 80], [330, 90], [440, 118], [530, 140], [596, -60], [628, -250], [640, -320]];
export const BUS_STOPS = [
  { name: 'AI 小镇站', x: 150, z: 70 },
  { name: '高铁站', x: 520, z: 146 },
  { name: '海滨小镇站', x: 634, z: -300 },
];

/** 缓存每一段的包围盒，别每次 O(n) 算全图。出了城的那几段是土路（lane），窄，没有石板。 */
const SEGS = [];
ROADS.forEach((line, li) => {
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const lane = Math.hypot((ax + bx) / 2 - PLAZA[0], (az + bz) / 2 - PLAZA[1]) > 380;
    SEGS.push({ li, lane, ax, az, bx, bz, minx: Math.min(ax, bx) - 20, maxx: Math.max(ax, bx) + 20, minz: Math.min(az, bz) - 20, maxz: Math.max(az, bz) + 20 });
  }
});
export { SEGS };
/** 石板街的半宽、土路的半宽（米）。 */
export const STREET_HALF = 3.6;
export const LANE_HALF = 1.7;

const segDistance = (s, x, z) => {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((x - s.ax) * dx + (z - s.az) * dz) / len2;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
};

/** 到最近一条路的中线的距离。 */
export function roadDistance(x, z) {
  let best = 1e4;
  for (const s of SEGS) {
    if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
    const d = segDistance(s, x, z);
    if (d < best) best = d;
  }
  return best;
}

/** 到路"边"的距离（负数在路面上），石板街和土路宽度不同。 */
export function roadEdge(x, z) {
  let best = 1e4;
  for (const s of SEGS) {
    if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
    const d = segDistance(s, x, z) - (s.lane ? LANE_HALF : STREET_HALF);
    if (d < best) best = d;
  }
  return best;
}

/** 广场是圆的，半径 30 m。 */
export function plazaDistance(x, z) {
  return Math.hypot(x - PLAZA[0], z - PLAZA[1]);
}

/** 铺过地的地方：路、广场、各个街区的场地。草长不出来。 */
export const STREETS = [];

// ---- 街区 ------------------------------------------------------------------------------------------------------
// kind 决定长什么、给什么用；r 是这一片的大致半径；landmark 会被小地图和交互系统读到。
export const DISTRICTS = [
  { id: 'home', name: '鱼的家', x: 0, z: 0, r: 34, kind: 'home', house: true },
  { id: 'plaza', name: '中央广场', x: 110, z: 60, r: 34, kind: 'plaza' },
  { id: 'food', name: '小吃街', x: -20, z: 165, r: 60, kind: 'food' },
  { id: 'netcafe', name: '网吧', x: -92, z: 62, r: 22, kind: 'netcafe' },
  { id: 'supermarket', name: '超市', x: 232, z: -8, r: 26, kind: 'supermarket' },
  { id: 'market', yard: 17, name: '菜市场', x: 62, z: 196, r: 40, kind: 'market' },
  { id: 'flowermarket', yard: 19, name: '花鸟市场', x: -10, z: 252, r: 40, kind: 'flowermarket' },
  { id: 'library', name: '图书馆', x: -172, z: 122, r: 32, kind: 'library' },
  { id: 'school', name: '学校（大中小学）', x: -330, z: -40, r: 120, kind: 'school' },
  { id: 'church', name: '教堂', x: -162, z: -140, r: 34, kind: 'church' },
  { id: 'temple', yard: 15, name: '夫子庙', x: -262, z: -232, r: 44, kind: 'temple' },
  { id: 'arcade', name: '电玩厅', x: 12, z: -100, r: 24, kind: 'arcade' },
  { id: 'gym', name: '体育馆', x: 330, z: 92, r: 44, kind: 'gym' },
  { id: 'guild', name: '冒险者协会', x: 152, z: -162, r: 30, kind: 'guild' },
  { id: 'resA', name: '居民区·东', x: 226, z: 226, r: 70, kind: 'residential' },
  { id: 'resB', name: '居民区·西', x: -300, z: 258, r: 66, kind: 'residential' },
  { id: 'resC', name: '居民区·北', x: 60, z: -300, r: 62, kind: 'residential' },
  { id: 'gate', yard: 9, name: '清镇市', x: 110, z: -336, r: 40, kind: 'gate' },
  { id: 'fishmarket', yard: 15, name: '河鲜集市', x: 178, z: -98, r: 30, kind: 'fishmarket' },
  { id: 'farm', name: '田园小镇', x: -620, z: 520, r: 130, kind: 'farm' },
  { id: 'fields', name: '蔬菜田园', x: -430, z: 660, r: 170, kind: 'fields' },
  { id: 'snowtown', name: '雪山小镇', x: -620, z: -250, r: 80, kind: 'snowtown' },
  { id: 'seaside', name: '海滨小镇', x: 640, z: -330, r: 90, kind: 'seaside' },
  { id: 'lighthouse', name: '灯塔', x: 742, z: -372, r: 26, kind: 'lighthouse' },
  { id: 'station', yard: 30, name: '高铁站', x: 560, z: 150, r: 60, kind: 'station' },
  { id: 'newtown', name: '高铁新城', x: 340, z: 560, r: 90, kind: 'newtown' },
  { id: 'beach', name: '沙滩', x: 760, z: 60, r: 120, kind: 'beach' },
  { id: 'forestW', name: '西林', x: -760, z: -480, r: 200, kind: 'forest' },
  { id: 'forestN', name: '高山森林', x: 330, z: -660, r: 250, kind: 'forest' },
  { id: 'lake', name: '月亮湖', x: LAKE.x, z: LAKE.z, r: 170, kind: 'lake' },
  { id: 'peak', name: '雪山', x: 0, z: -900, r: 240, kind: 'mountain' },
];

export function districtAt(x, z) {
  let best = null;
  let bestD = 1e9;
  for (const d of DISTRICTS) {
    const dist = Math.hypot(x - d.x, z - d.z);
    if (dist < d.r && dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}

// ---- 地形 ------------------------------------------------------------------------------------------------------
// 画面要"吉卜力"，地就不能是平的：城坐在一片缓缓起伏的浅盆里，出城是连绵的绿丘，
// 丘外一圈林山，正北一座真正的雪山。远处再远的群山不在这里——那是天空里画好的那条贴条（backdrop）。
/** 城市坐落的那片浅盆：中心最平，往外慢慢放开。 */
function cityPad(x, z) {
  return smooth(CITY_R + 170, 120, cityDistance(x, z));
}

const ridged = (x, z, seed) => 1 - Math.abs(fbm(x, z, 4, seed) * 2 - 1);

function land(x, z) {
  const r = Math.hypot(x, z);
  // 野外的底：大起伏 + 小褶皱
  let h = (fbm(x / 430 + 3.1, z / 430 - 1.7, 4, 1) - 0.5) * 58;
  h += (fbm(x / 120 + 9.3, z / 120 + 4.1, 3, 5) - 0.5) * 11;
  // 城里：只留长波的缓坡（200 多米才起落两三米，街道和房子都站得住）
  const pad = cityPad(x, z);
  const flat = -6 + (fbm(x / 260 + 2.2, z / 260 + 7.7, 2, 13) - 0.5) * 6.5;
  h += (flat - h) * pad;
  // 城门外沿着乡道压一压，别一出门就是陡坡
  h += (flat - h) * smooth(-250, -400, -z) * 0.5 * (1 - smooth(600, 820, r)) * (1 - pad);
  // 农村那一片是缓坡台地
  const farmPad = smooth(250, 90, Math.hypot(x + 600, z - 540));
  const farmH = -5 + (fbm(x / 90 + 1, z / 90 + 2, 2, 19) - 0.5) * 5;
  h += (farmH - h) * farmPad;
  // 一圈林山：不高（几十米到一百来米），有豁口，豁口里露出天边画的远山
  const ring = smooth(640, 1080, r) * (1 - smooth(330, 600, x));
  const gaps = 0.35 + 1.0 * fbm(x / 520 + 5, z / 520 + 1, 3, 41);
  h += 115 * ring * gaps * (0.72 + 0.28 * ridged(x / 260, z / 260, 43));
  // 正北的雪山：一道主脊加几条支脊
  const mx = x / 620;
  const mz = (z + 1040) / 360;
  const massif = Math.exp(-(mx * mx + mz * mz));
  h += massif * (250 + 150 * ridged(x / 300 + 2, z / 300 + 9, 37));
  // 地图外面：慢慢落回平地，融进雾里，不要一堵墙
  const out = smooth(1700, 2900, r);
  h *= 1 - 0.85 * out;
  // 东边：先是一片不低于镇子的海边平地，过了海岸线沉进海里
  if (x > 330) {
    const k = smooth(330, 520, x);
    h += (Math.max(h, -6.2 + (fbm(x / 70, z / 70, 2, 91) - 0.5) * 2) - h) * k;
    const cx = coastX(z);
    h += (-15 - h) * smooth(cx - 110, cx + 50, x);
    // 灯塔站的那块岬角
    const lh = Math.hypot(x - 742, z + 372);
    if (lh < 46) h += (-4.5 - h) * smooth(46, 20, lh);
  }
  // 清溪河：两岸压成平缓的河滩，中间是两米多深的河床
  const rv = riverAt(x, z);
  if (rv.d < 80) {
    const bank = riverLevel(rv.t) + 0.7;
    h += (bank - h) * smooth(80, 15, rv.d);
    h -= 2.8 * smooth(RIVER_HALF + 3, 2.5, rv.d);
  }
  // 湖：岸是一圈刚高出水面的矮滩，往里缓缓沉下去（水边在 lakeDistance ≈ 0.95）
  const ld = lakeDistance(x, z);
  if (ld < 2.4) {
    const bank = LAKE.level + 0.5;
    h += (bank - h) * smooth(2.4, 1.1, ld);
    h -= (bank - LAKE.bed) * smooth(1.06, 0.25, ld);
  }
  return h;
}

export function heightAt(x, z) {
  return land(x, z);
}

/** 人脚下的高度：平时就是地面，在桥上是桥面。 */
export function walkAt(x, z) {
  const b = bridgeAt(x, z);
  return b ? Math.max(b.deck, land(x, z)) : land(x, z);
}

/** 水上还是水下。湖面略低于岸。 */
export function inLake(x, z) {
  // 河：水深过膝就不让走（桥上例外）；海：同理
  const rv = riverAt(x, z);
  if (rv.d < RIVER_HALF + 1 && !bridgeAt(x, z) && heightAt(x, z) < riverLevel(rv.t) - 0.45) return true;
  if (x > 560 && heightAt(x, z) < SEA.level - 0.5) return true;
  return lakeDistance(x, z) < 1.05 && heightAt(x, z) < LAKE.level - 0.3;
}

/** 水有多深（0 = 岸上）。 */
export function depthAt(x, z) {
  return Math.max(0, LAKE.level - heightAt(x, z));
}

// ---- 地面上长什么 ----------------------------------------------------------------------------------------------
/** 铺装：路、广场、集市的场地。铺过的地方草长不出来；边缘是毛的，不是一刀切。 */
export function pavedAt(x, z) {
  const ld = lakeDistance(x, z);
  if (ld < 1.06) return 1; // 水下和沙滩
  // 河床和河滩的卵石、海边的沙滩
  const rv = riverAt(x, z);
  if (rv.d < RIVER_HALF + 4) return 1;
  if (x > 600 && heightAt(x, z) < SEA.level + 2.4) return 1;
  const ragged = (fbm(x / 3.1 + 4, z / 3.1 - 2, 2, 71) - 0.5) * 1.6;
  let p = 1 - smooth(-0.5, 0.9, roadEdge(x, z) + ragged);
  p = Math.max(p, 1 - smooth(29.5, 31.5, plazaDistance(x, z) + ragged));
  for (const d of DISTRICTS) {
    if (!d.yard) continue;
    p = Math.max(p, 1 - smooth(d.yard - 1.5, d.yard + 1.5, Math.hypot(x - d.x, z - d.z) + ragged * 1.5));
  }
  return p;
}

/** 给 createField 的 paint：dry/growth/wet/flowers。 */
export function paint(x, z) {
  const pav = pavedAt(x, z);
  const r = Math.hypot(x, z);
  const forest = forestAt(x, z);
  // 田：一块块的，麦子（干草色、长得高）、菜（绿）、休耕的土；田埂是踩实的土
  const field = fieldsAt(x, z);
  const plot = field > 0.45 ? plotAt(x, z) : null;
  let growth = 1;
  growth *= 1 - pav;
  if (plot) growth *= plot.edge * (plot.kind === 2 ? 0.25 : 1);
  growth *= 1 - forest * 0.35;
  // 高处是岩和雪
  growth *= 1 - smooth(150, 230, heightAt(x, z));
  // 城里野花少，野外多
  const wild = smooth(0.35, 0.9, fbm(x / 46 - 6, z / 46 + 3, 2, 55));
  const flowers = Math.min(1, wild * (0.45 + 0.7 * smooth(200, 560, r)) + forest * 0.2);
  const dry = 0.08 + 0.3 * smooth(0.55, 0.8, fbm(x / 110 + 2.2, z / 110 + 8.1, 3, 21));
  const wet = Math.max(0, 1 - smooth(1.0, 1.5, lakeDistance(x, z))) * 0.9;
  if (plot) return { dry: plot.kind === 0 ? 0.96 : plot.kind === 1 ? 0.02 : 0.5, growth: Math.max(0, growth), wet: 0, flowers: 0 };
  return { dry: dry * (1 - wet), growth: Math.max(0, growth), wet, flowers };
}

/** 森林密度 0~1：两片大林子，加上环山的山腰。 */
export function forestAt(x, z) {
  let f = 0;
  for (const d of DISTRICTS) {
    if (d.kind !== 'forest') continue;
    const dd = Math.hypot(x - d.x, z - d.z) / d.r;
    f = Math.max(f, (1 - smooth(0.55, 1.05, dd)) * (0.6 + 0.6 * fbm(x / 130 + 7, z / 130 + 2, 3, 61)));
  }
  const r = Math.hypot(x, z);
  const belt = smooth(700, 900, r) * smooth(0.42, 0.6, fbm(x / 210 + 1.3, z / 210 + 8.2, 3, 67));
  f = Math.max(f, belt * (1 - smooth(1.0, 1.6, Math.hypot(x / 620, (z + 1040) / 360)) * 0));
  if (lakeDistance(x, z) < 1.25 || riverAt(x, z).d < 22 || x > coastX(z) - 120) return 0;
  return Math.min(1, f);
}

/** 田里的一块：和远景 shader 用同一套格子（转了 35° 的 46×30 m）。kind 0 麦、1 菜、2 休耕；edge 0 在田埂上。 */
export function plotAt(x, z) {
  const u = (x * 0.82 + z * 0.57) / 46;
  const v = (-x * 0.57 + z * 0.82) / 30;
  const iu = Math.floor(u);
  const iv = Math.floor(v);
  const r = hash(iu, iv, 97);
  const eu = Math.min(u - iu, 1 - (u - iu)) * 46;
  const ev = Math.min(v - iv, 1 - (v - iv)) * 30;
  return { kind: r < 0.55 ? 0 : r < 0.85 ? 1 : 2, edge: smooth(0.5, 1.5, Math.min(eu, ev)), id: r };
}

/** 农田密度 0~1（作物）。 */
export function fieldsAt(x, z) {
  let f = 0;
  for (const d of DISTRICTS) {
    if (d.kind !== 'fields') continue;
    const dd = Math.hypot(x - d.x, z - d.z) / d.r;
    f = Math.max(f, 1 - smooth(0.6, 1.0, dd));
  }
  return f;
}

/** 高山密度（放岩石、雪线用）。 */
export function mountainAt(x, z) {
  const h = heightAt(x, z);
  return smooth(150, 300, h);
}

// ---- 出生点 ----------------------------------------------------------------------------------------------------
export const START = [0, 6];
export const START_YAW = Math.PI * 0.32;
/** 这里的水面有多高；不是水（或水太浅）就返回 null。湖、河、海都算。 */
export function waterAt(x, z) {
  const h = heightAt(x, z);
  if (lakeDistance(x, z) < 1.3 && h < LAKE.level) return LAKE.level;
  const rv = riverAt(x, z);
  if (rv.d < RIVER_HALF + 9) {
    const L = riverLevel(rv.t);
    if (h < L) return L;
  }
  if (x > 480 && h < SEA.level) return SEA.level;
  return null;
}
