// 小鲸鱼的世界：地图的骨架。地形是纯函数——没有高度图文件，草地、碰撞、小地图、放置物全部读同一个
// heightAt，所以永远一致。
//
// 这一版照《幻想世界地图》（dsh-image-gen/map 里那张总图和十一张分区图）整个重摆：
//   玉海城在正中（玉海宫、清真寺、老街、电影院、电玩店、超市、集市），外面一圈 37 路环线；
//   西边：清溪河从月亮湖流出来，绕过 AI 小镇和鱼鱼家，过河鲜集市，往南入海；河西是田园小镇和麦田；
//   西北：雪山小镇和雪山；北边：月亮湖、湖边小镇；东北：大学城；
//   东边：新新区 CBD、崖上的海滨小镇和灯塔、港口；
//   南边：高铁站、海鲜排档、沙滩；西南：海边新城、码头和海堤。
//   高铁高架从雪山一路绕过西、南、东，到大学城和湖边小镇。
// 世界坐标：x 向东，z 向南，单位米；可走的范围是 [-HALF, HALF] 的正方形。

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
/** 玉海城的城心。 */
export const YUHAI = [40, -60];
/** 环城路（37 路环线）的半径。 */
export const RING_R = 290;
/** 老城的半径（过了它是环城绿带）。 */
export const CITY_R = 232;
/** 玉海宫前的广场。 */
export const PLAZA = [40, -108];
/** 家：鱼鱼家在 AI 小镇西南、清溪河拐弯的地方，也就是开局站的地方。 */
export const HOME = [-600, -20];
/** 月亮湖。 */
export const LAKE = { x: -40, z: -520, rx: 185, rz: 86, level: 9, bed: 2 };
/** 海：东边和南边。海面比城里（-5 m）低一点。 */
export const SEA = { level: -9 };

// ---- 海岸 ------------------------------------------------------------------------------------------------------
// 陆地是一个多边形（顺着海岸走一圈）；到海岸的带符号距离烘成一张粗格子，查的时候双线性插值——
// heightAt 一帧要被问几万次，不能每次都去数线段。
/** 海岸线（陆地多边形）。大地图拿它描边。 */
export const COAST = [
  [-5000, -5000], [880, -5000], [880, -900], [860, -760], [835, -650], [850, -560], [840, -470], [810, -390], [800, -310],
  [840, -262], [905, -236], [935, -190], [915, -140], [850, -112], [800, -70], [778, 0], [770, 60], [772, 130], [760, 200],
  [725, 265], [688, 330], [640, 400], [588, 468], [520, 528], [430, 572], [320, 602], [200, 618], [90, 640], [-30, 688],
  [-140, 716], [-240, 700], [-300, 655], [-380, 655], [-450, 690], [-530, 700], [-600, 650], [-640, 585], [-668, 540],
  [-700, 512], [-760, 508], [-800, 530], [-828, 575], [-850, 630], [-910, 655], [-1000, 620], [-1100, 570], [-1300, 540], [-5000, 700],
];
const SDF_CELL = 16;
const SDF_MIN = -2304;
const SDF_N = Math.round((-SDF_MIN * 2) / SDF_CELL) + 1;
const SDF = new Float32Array(SDF_N * SDF_N);
{
  const n = COAST.length;
  for (let j = 0; j < SDF_N; j++) {
    const z = SDF_MIN + j * SDF_CELL;
    for (let i = 0; i < SDF_N; i++) {
      const x = SDF_MIN + i * SDF_CELL;
      let best = 1e12;
      let inside = false;
      for (let k = 0, p = n - 1; k < n; p = k++) {
        const ax = COAST[p][0];
        const az = COAST[p][1];
        const bx = COAST[k][0];
        const bz = COAST[k][1];
        if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        const ex = x - (ax + dx * t);
        const ez = z - (az + dz * t);
        const d2 = ex * ex + ez * ez;
        if (d2 < best) best = d2;
      }
      SDF[j * SDF_N + i] = (inside ? 1 : -1) * Math.sqrt(best);
    }
  }
}
/** 到海岸线的距离（米）：正的在陆上，负的在海里。岸线带一点摆动，别是一段段直线。 */
export function coastD(x, z) {
  const fx = Math.min(SDF_N - 1.001, Math.max(0, (x - SDF_MIN) / SDF_CELL));
  const fz = Math.min(SDF_N - 1.001, Math.max(0, (z - SDF_MIN) / SDF_CELL));
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const o = iz * SDF_N + ix;
  const a = SDF[o] + (SDF[o + 1] - SDF[o]) * tx;
  const b = SDF[o + SDF_N] + (SDF[o + SDF_N + 1] - SDF[o + SDF_N]) * tx;
  return a + (b - a) * tz + 9 * Math.sin(x / 61 + z / 83) + 5 * Math.sin(x / 23 - z / 29 + 1.3);
}
/** 这里是不是海那一边（海里，或者紧贴着岸）。 */
export const seaSide = (x, z) => coastD(x, z) < 30;

// ---- 清溪河 ----------------------------------------------------------------------------------------------------
/** 清溪河：从月亮湖西口出来，往西南绕过 AI 小镇和鱼鱼家，拐向东南过河鲜集市，往南入海。 */
export const RIVER = [
  [-205, -522], [-270, -505], [-340, -460], [-450, -400], [-560, -310], [-640, -205], [-680, -110], [-670, -20], [-625, 55], [-540, 110],
  [-455, 150], [-400, 200], [-368, 270], [-355, 340], [-348, 430], [-340, 540], [-338, 640], [-338, 780],
];
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
/** 到河中线的距离 d，和沿河走了多远 t（0 在湖口，1 在入海口外）。离河远的地方 d 很大。 */
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
  if (d < 200) d = Math.abs(d + 5 * Math.sin(t * 60));
  return { d, t };
}
/** 河面的海拔：从湖面一路降到海面。 */
export const riverLevel = (t) => LAKE.level - 0.4 + (SEA.level + 0.15 - (LAKE.level - 0.4)) * Math.pow(t, 0.62);
/** 河的半宽（米）。 */
export const RIVER_HALF = 7;
/** 沿河 t 处中线上的点和方向：[x, z, dx, dz]（方向是单位向量）。 */
export function riverPoint(t) {
  let s = Math.min(1, Math.max(0, t)) * RSEGS.total;
  for (const g of RSEGS) {
    if (s <= g.len || g === RSEGS[RSEGS.length - 1]) {
      const k = Math.min(1, s / g.len);
      return [g.ax + (g.bx - g.ax) * k, g.az + (g.bz - g.az) * k, (g.bx - g.ax) / g.len, (g.bz - g.az) / g.len];
    }
    s -= g.len;
  }
  return [0, 0, 1, 0];
}

/** 桥：路跨河的地方。x,z 桥心；rot 桥身方向（弧度，局部 +z 沿桥）；len 桥长；w 桥宽。 */
export const BRIDGES = [
  { name: '田园桥', x: -678, z: -98, rot: Math.atan2(-78, 2), len: 36, w: 6 },
  { name: '石板桥', x: -505, z: -357, rot: Math.atan2(-35, -37), len: 36, w: 6 },
  { name: '清溪大桥', x: -352, z: 371, rot: Math.atan2(-78, -8), len: 40, w: 7 },
  { name: '鱼市桥', x: -421, z: 181, rot: Math.atan2(-60, 40), len: 36, w: 5 },
];
for (const b of BRIDGES) b.deck = riverLevel(riverAt(b.x, b.z).t) + 1.5;
/** 栈桥、码头、海堤：水上能走的木板和石堤（和桥一个结构）。kind 决定长什么样（city.js）。 */
export const PIERS = [
  // 河鲜集市：沿河一条木栈台
  { name: '河鲜集市栈台', kind: 'deck', x: -393, z: 187, rot: Math.atan2(50, 70), len: 40, w: 10, deck: riverLevel(riverAt(-400, 200).t) + 1.0 },
  // 月亮湖：湖边小镇伸进湖里的两条木栈桥
  { name: '湖边栈桥', kind: 'pier', x: 152, z: -512, rot: -Math.PI / 2, len: 34, w: 4, deck: LAKE.level + 0.8 },
  { name: '湖边栈桥', kind: 'pier', x: 142, z: -470, rot: -Math.PI / 2, len: 30, w: 4, deck: LAKE.level + 0.8 },
  // 海边新城的码头：两条浮桥、一圈海堤
  { name: '码头', kind: 'pier', x: -705, z: 536, rot: 0, len: 44, w: 4, deck: SEA.level + 1.5 },
  { name: '码头', kind: 'pier', x: -762, z: 536, rot: 0, len: 44, w: 4, deck: SEA.level + 1.5 },
  { name: '海堤', kind: 'mole', x: -655, z: 615, rot: Math.atan2(-14, 80), len: 84, w: 5, deck: SEA.level + 2.3 },
  { name: '海堤', kind: 'mole', x: -708, z: 664, rot: Math.atan2(-94, 16), len: 98, w: 5, deck: SEA.level + 2.3 },
  { name: '海堤', kind: 'mole', x: -792, z: 654, rot: Math.atan2(-76, -40), len: 88, w: 5, deck: SEA.level + 2.3 },
  // 港口：两条伸进海里的石码头
  { name: '港口码头', kind: 'quay', x: 812, z: 48, rot: Math.PI / 2, len: 84, w: 12, deck: -6.3 },
  { name: '港口码头', kind: 'quay', x: 812, z: 138, rot: Math.PI / 2, len: 84, w: 12, deck: -6.3 },
  // 海鲜排档前的小栈桥
  { name: '观海栈桥', kind: 'pier', x: 560, z: 520, rot: Math.atan2(30, 30), len: 46, w: 4, deck: SEA.level + 1.6 },
];
const DECKS = [...BRIDGES, ...PIERS];
for (const d of DECKS) {
  d.sin = Math.sin(d.rot);
  d.cos = Math.cos(d.rot);
  d.reach = Math.hypot(d.len, d.w) / 2 + 1;
}
/** 在不在桥面（或栈桥、海堤）上；在的话返回它。 */
export function bridgeAt(x, z) {
  for (const b of DECKS) {
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) > b.reach || Math.abs(dz) > b.reach) continue;
    const along = dx * b.sin + dz * b.cos;
    const across = dx * b.cos - dz * b.sin;
    if (Math.abs(along) < b.len / 2 && Math.abs(across) < b.w / 2) return b;
  }
  return null;
}

/** 到湖心的椭圆距离：<1 在水里。 */
export function lakeDistance(x, z) {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  if (Math.abs(dx) > LAKE.rx * 3 || Math.abs(dz) > LAKE.rz * 3) return 9;
  const wobble = 1 + 0.08 * Math.sin(Math.atan2(dz, dx) * 3 + 1.1) + 0.05 * Math.sin(Math.atan2(dz, dx) * 7);
  return Math.hypot(dx / LAKE.rx, dz / LAKE.rz) / wobble;
}

/** 到玉海城城心的距离（米）。 */
export function cityDistance(x, z) {
  return Math.hypot(x - YUHAI[0], z - YUHAI[1]);
}

// ---- 路 --------------------------------------------------------------------------------------------------------
// 每条路是一串点，带一个 kind：street 石板街（城里、镇上）、road 普通道路（城与城之间）、lane 土路。
const ring = (cx, cz, r, n) => Array.from({ length: n + 1 }, (_, i) => [Math.round(cx + Math.cos((i / n) * Math.PI * 2) * r), Math.round(cz + Math.sin((i / n) * Math.PI * 2) * r)]);
const R = (kind, pts) => Object.assign(pts, { kind });
export const ROADS = [
  // 0 环城路（37 路环线）
  R('road', ring(YUHAI[0], YUHAI[1], RING_R, 36)),
  // 1 中轴大街：宫前广场 → 南门 → 环城路
  R('street', [[40, -108], [40, -20], [40, 60], [40, 150], [40, 230]]),
  // 2 东西大街：西门 → 东门
  R('street', [[-250, -60], [-150, -55], [-45, -50], [40, -50], [130, -50], [240, -55], [330, -60]]),
  // 3 南市街：电影院、电玩店、超市、集市
  R('street', [[-183, 125], [-110, 125], [-35, 128], [40, 125], [110, 128], [180, 112], [270, 117]]),
  // 4 广场 → 清真寺 → 西北门
  R('street', [[40, -108], [-45, -112], [-115, -88], [-170, -110], [-225, -150]]),
  // 5 广场 → 东北门
  R('street', [[40, -108], [130, -112], [200, -125], [290, -170]]),
  // 6 老街（南北）
  R('street', [[130, -112], [130, -50], [125, 40], [110, 128]]),
  // 7 书店街（南北）
  R('street', [[-45, -112], [-45, -50], [-40, 40], [-35, 128]]),
  // 8 西巷、东巷
  R('street', [[-150, -55], [-140, 40], [-110, 125]]),
  R('street', [[240, -55], [215, 30], [180, 112]]),
  // 10 北门 → 月亮湖
  R('road', [[40, -350], [40, -418]]),
  // 11 西门 → AI 小镇
  R('road', [[-250, -60], [-300, -75], [-345, -88], [-400, -100], [-470, -110]]),
  // 12 AI 小镇的街：→ 鱼鱼家
  R('street', [[-470, -110], [-520, -85], [-555, -45], [-575, -6], [-600, -4], [-600, -20]]),
  // 13 AI 小镇南北街 → 丰收田园
  R('street', [[-470, -200], [-470, -110], [-455, -30], [-450, 30]]),
  // 14 AI 小镇 → 河鲜集市 → 环城路西南
  R('road', [[-400, -100], [-375, -20], [-355, 70], [-362, 150]]),
  R('road', [[-362, 150], [-300, 165], [-225, 160], [-165, 145]]),
  // 16 AI 小镇 → 田园桥 → 田园小镇
  R('road', [[-520, -85], [-600, -100], [-678, -98], [-750, -110], [-810, -135], [-860, -150]]),
  // 17 田园小镇 → 麦田边 → 海边新城
  R('road', [[-860, -150], [-790, -60], [-745, 40], [-735, 150], [-740, 240], [-740, 330]]),
  // 18 海边新城的街
  R('street', [[-850, 335], [-740, 330], [-620, 330]]),
  R('street', [[-740, 330], [-735, 400], [-732, 470]]),
  R('street', [[-850, 472], [-732, 470], [-640, 478]]),
  // 21 海边新城 → 清溪大桥 → 高铁站 → 海鲜排档
  R('road', [[-620, 330], [-520, 345], [-430, 362], [-352, 371], [-280, 374], [-200, 385], [-140, 430], [-80, 450], [20, 452], [125, 452], [280, 455], [400, 440]]),
  // 22 海鲜排档 → 港口
  R('road', [[400, 440], [480, 395], [560, 320], [630, 230], [680, 150], [705, 95]]),
  // 23 港口 → CBD
  R('road', [[705, 95], [660, 20], [595, -60], [520, -125]]),
  // 24 东门 → CBD → 海滨小镇 → 灯塔
  R('road', [[330, -60], [385, -88], [440, -108], [520, -125], [600, -150], [680, -170], [750, -178]]),
  R('street', [[750, -178], [820, -185], [880, -190]]),
  // 26 CBD → 大学城
  R('road', [[520, -125], [540, -230], [575, -340], [610, -420], [640, -470]]),
  // 27 东北门 → 湖边小镇
  R('road', [[245, -265], [300, -340], [310, -420], [290, -500]]),
  // 28 湖边小镇 → 大学城
  R('road', [[290, -500], [380, -515], [470, -500], [560, -480], [640, -470]]),
  // 29 月亮湖南岸的小路
  R('lane', [[40, -418], [-60, -426], [-180, -422], [-262, -446]]),
  R('lane', [[40, -418], [130, -428], [215, -462], [290, -500]]),
  // 31 AI 小镇 → 石板桥 → 雪山高铁站 → 雪山小镇
  R('road', [[-470, -200], [-455, -270], [-470, -320], [-505, -357], [-560, -420], [-620, -500], [-700, -545], [-800, -560]]),
  // 32 田园小镇 → 果园 → 雪山小镇
  R('lane', [[-860, -150], [-850, -230], [-800, -300], [-790, -400], [-800, -490], [-800, -560]]),
  // 33 南门外 → 高铁站
  R('road', [[40, 230], [95, 290], [125, 360], [125, 452]]),
  // 34 海鲜排档 → 沙滩
  R('lane', [[400, 440], [395, 500], [380, 548]]),
  // 35 大学城 → 观海台
  R('street', [[640, -470], [700, -482], [760, -500], [806, -512]]),
  // 36 CBD 的街
  R('street', [[452, -205], [445, -108], [455, -30]]),
  // 37 湖边小镇的街
  R('street', [[290, -500], [250, -535], [215, -520]]),
  R('street', [[290, -500], [300, -560], [322, -596]]),
  // 39 田园小镇的风车路
  R('lane', [[-860, -150], [-935, -120], [-965, -40], [-960, 60]]),
  // 40 丰收田园 → 鱼市桥
  R('lane', [[-450, 30], [-440, 110], [-421, 181], [-380, 172]]),
];
/** 37 路公交：AI 小镇 → 玉海城西门 → 沿环城路 → 东门 → CBD → 港口 → 海鲜排档 → 高铁站。 */
export const BUS_ROUTE = [
  [-345, -88], [-300, -75], [-250, -60],
  ...Array.from({ length: 17 }, (_, i) => {
    const a = Math.PI - (i / 18) * Math.PI - Math.PI / 18;
    return [Math.round(YUHAI[0] + Math.cos(a) * RING_R), Math.round(YUHAI[1] + Math.sin(a) * RING_R)];
  }),
  [330, -60], [385, -88], [440, -108], [520, -125], [595, -60], [660, 20], [705, 95], [680, 150], [630, 230], [560, 320], [480, 395], [400, 440], [280, 455], [140, 452],
];
/** 公交站（坐 37 路能到的地方）。 */
export const BUS_STOPS = [
  { name: 'AI 小镇站', x: -345, z: -80 },
  { name: '玉海城西门', x: -262, z: -50 },
  { name: '玉海城南门', x: 54, z: 240 },
  { name: '月亮湖', x: 48, z: -404 },
  { name: '新新区 CBD', x: 436, z: -98 },
  { name: '海滨小镇', x: 742, z: -168 },
  { name: '港口', x: 696, z: 84 },
  { name: '海鲜排档', x: 392, z: 430 },
  { name: '高铁站', x: 140, z: 442 },
  { name: '海边新城', x: -700, z: 340 },
  { name: '田园小镇', x: -842, z: -138 },
  { name: '雪山小镇', x: -772, z: -548 },
  { name: '湖边小镇', x: 304, z: -478 },
  { name: '大学城', x: 628, z: -456 },
];
/** 地铁 1 号线（图上那条紫色虚线）：湖边小镇 → 玉海城东 → 高铁站。 */
export const METRO = [[300, -560], [285, -420], [252, -272], [238, -150], [246, -52], [215, 60], [150, 170], [108, 290], [98, 430]];
export const METRO_STOPS = [
  { name: '湖边小镇站', x: 306, z: -540 },
  { name: '玉海北站', x: 262, z: -262 },
  { name: '老街站', x: 252, z: -44 },
  { name: '集市站', x: 160, z: 172 },
  { name: '高铁站', x: 96, z: 436 },
];
/** 高铁线（高架）的控制点：雪山 → 田园 → 海边新城 → 高铁总站 → CBD 东 → 大学城 → 湖边小镇。 */
export const RAIL = [
  [-560, -590], [-610, -525], [-680, -400], [-735, -250], [-748, -110], [-742, -20], [-725, 90], [-670, 200], [-590, 290], [-500, 380], [-400, 430],
  [-300, 446], [-200, 440], [-100, 410], [20, 372], [160, 372], [300, 330], [420, 240], [500, 120], [560, 0], [610, -140], [660, -270],
  [722, -380], [775, -455], [790, -520], [770, -620], [700, -690], [560, -706], [420, -660], [320, -615], [210, -640],
];
/** 高铁站：坐高铁能到的地方（x,z 在线上）。 */
export const RAIL_STATIONS = [
  { name: '雪山高铁站', x: -610, z: -525 },
  { name: '田园高铁站', x: -742, z: -20 },
  { name: '高铁站', x: 20, z: 372, main: true },
  { name: '大学城站', x: 790, z: -520 },
  { name: '湖边小镇站', x: 320, z: -615 },
];

/** 高铁线在地面上的投影：把控制点用 Catmull-Rom 样条连起来，每 step 米一个点 [x, z]。 */
export function railCurve(step = 6) {
  const P = RAIL;
  const out = [];
  for (let i = 0; i + 1 < P.length; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[P.length - 1].slice());
  return out;
}

/** 缓存每一段的包围盒，别每次 O(n) 算全图。 */
const SEGS = [];
ROADS.forEach((line, li) => {
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    SEGS.push({ li, kind: line.kind, lane: line.kind === 'lane', ax, az, bx, bz, minx: Math.min(ax, bx) - 20, maxx: Math.max(ax, bx) + 20, minz: Math.min(az, bz) - 20, maxz: Math.max(az, bz) + 20 });
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
// kind 决定长什么、给什么用；r 是这一片的大致半径；yard 是铺了地的院子半径。
export const DISTRICTS = [
  { id: 'home', name: '鱼鱼家', x: HOME[0], z: HOME[1], r: 30, kind: 'home', house: true },
  { id: 'aitown', name: 'AI 小镇', x: -460, z: -112, r: 120, kind: 'town' },
  { id: 'farm', name: '丰收田园', x: -452, z: 62, r: 62, kind: 'farm' },
  { id: 'fishmarket', yard: 15, name: '河鲜集市', x: -378, z: 172, r: 44, kind: 'fishmarket' },
  { id: 'yuhai', name: '玉海城', x: YUHAI[0], z: YUHAI[1], r: CITY_R, kind: 'oldtown' },
  { id: 'plaza', name: '宫前广场', x: PLAZA[0], z: PLAZA[1], r: 34, kind: 'plaza' },
  { id: 'palace', name: '玉海宫', x: 40, z: -196, r: 46, kind: 'palace' },
  { id: 'mosque', yard: 13, name: '清真寺', x: -118, z: -132, r: 36, kind: 'mosque' },
  { id: 'library', name: '书店', x: -72, z: -28, r: 22, kind: 'library' },
  { id: 'food', name: '老街', x: 128, z: 0, r: 46, kind: 'food' },
  { id: 'cinema', name: '电影院', x: -150, z: 112, r: 26, kind: 'cinema' },
  { id: 'arcade', name: '电玩店', x: -72, z: 113, r: 20, kind: 'arcade' },
  { id: 'supermarket', name: '超市', x: 80, z: 113, r: 22, kind: 'supermarket' },
  { id: 'market', yard: 17, name: '集市', x: 170, z: 62, r: 34, kind: 'market' },
  { id: 'guild', name: '冒险者协会', x: -8, z: -8, r: 20, kind: 'guild' },
  { id: 'netcafe', name: '网吧', x: -8, z: 113, r: 16, kind: 'netcafe' },
  { id: 'temple', yard: 15, name: '夫子庙', x: 196, z: -196, r: 34, kind: 'temple' },
  { id: 'flowermarket', yard: 17, name: '花鸟市场', x: -165, z: -8, r: 32, kind: 'flowermarket' },
  { id: 'lake', name: '月亮湖', x: LAKE.x, z: LAKE.z, r: 175, kind: 'lake' },
  { id: 'lakeside', name: '湖边小镇', x: 285, z: -510, r: 100, kind: 'lakeside' },
  { id: 'university', name: '大学城', x: 640, z: -480, r: 135, kind: 'university' },
  { id: 'cbd', name: '新新区 CBD', x: 445, z: -120, r: 125, kind: 'cbd' },
  { id: 'civic', yard: 24, name: '市民广场', x: 492, z: -62, r: 34, kind: 'civic' },
  { id: 'gym', name: '体育馆', x: 372, z: -196, r: 40, kind: 'gym' },
  { id: 'seaside', name: '海滨小镇', x: 762, z: -182, r: 100, kind: 'seaside' },
  { id: 'lighthouse', name: '灯塔', x: 902, z: -190, r: 26, kind: 'lighthouse' },
  { id: 'port', yard: 0, name: '港口', x: 715, z: 95, r: 92, kind: 'port' },
  { id: 'station', yard: 0, name: '高铁站', x: 20, z: 400, r: 78, kind: 'station' },
  { id: 'seafood', yard: 20, name: '海鲜排档', x: 425, z: 462, r: 48, kind: 'seafood' },
  { id: 'beach', name: '沙滩', x: 385, z: 530, r: 130, kind: 'beach' },
  { id: 'newtown', name: '海边新城', x: -740, z: 345, r: 125, kind: 'newtown' },
  { id: 'harbor', name: '码头', x: -735, z: 545, r: 75, kind: 'harbor' },
  { id: 'pastoral', name: '田园小镇', x: -860, z: -150, r: 88, kind: 'pastoral' },
  { id: 'fields', name: '金色麦田', x: -872, z: 62, r: 150, kind: 'fields' },
  { id: 'orchard', name: '果园', x: -800, z: -300, r: 56, kind: 'orchard' },
  { id: 'snowtown', name: '雪山小镇', x: -800, z: -562, r: 100, kind: 'snowtown' },
  { id: 'forestW', name: '高山森林', x: -420, z: -730, r: 230, kind: 'forest' },
  { id: 'forestN', name: '北山林', x: 330, z: -800, r: 250, kind: 'forest' },
  { id: 'forestS', name: '海角林', x: -150, z: 570, r: 120, kind: 'forest' },
  { id: 'forestE', name: '东坡林', x: 320, z: 120, r: 110, kind: 'forest' },
  { id: 'peak', name: '雪山', x: -760, z: -930, r: 240, kind: 'mountain' },
];
const D = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));
/** 按 id 取街区。 */
export const district = (id) => D[id];

export function districtAt(x, z) {
  let best = null;
  let bestD = 1e9;
  for (const d of DISTRICTS) {
    const dist = Math.hypot(x - d.x, z - d.z);
    // 大片的（城、镇）让位给里面具体的地方
    const score = dist / d.r;
    if (dist < d.r && score < bestD) {
      best = d;
      bestD = score;
    }
  }
  return best;
}

/** 盖了房子的地方（城、镇、站）：[x, z, 半径]。林子不长进来，野花少一点。 */
export const URBAN = [
  [YUHAI[0], YUHAI[1], RING_R + 16], [-470, -100, 150], [-600, -20, 50], [445, -120, 135], [20, 410, 110], [715, 95, 105], [762, -182, 110], [640, -480, 150],
  [285, -515, 115], [-740, 350, 135], [-735, 520, 80], [-860, -150, 95], [-790, -560, 120], [-610, -525, 50], [-742, -20, 40], [790, -520, 40], [320, -615, 40], [425, 462, 60], [-378, 172, 50],
];
/** 在不在城镇里（0~1，边上是软的）。 */
export function builtAt(x, z) {
  let k = 0;
  for (const [ux, uz, ur] of URBAN) {
    const dx = x - ux;
    const dz = z - uz;
    if (Math.abs(dx) > ur + 30 || Math.abs(dz) > ur + 30) continue;
    k = Math.max(k, 1 - smooth(ur - 10, ur + 30, Math.hypot(dx, dz)));
  }
  return k;
}

/** 滑雪道：雪山小镇北边一条笔直的雪坡。bottom 在镇口，top 在山腰；half 是半宽，drop 是落差（米）。 */
export const SKI = { top: [-690, -790], bottom: [-712, -640], half: 30, drop: 46, base: 30 };
{
  const dx = SKI.top[0] - SKI.bottom[0];
  const dz = SKI.top[1] - SKI.bottom[1];
  SKI.len = Math.hypot(dx, dz);
  SKI.ux = dx / SKI.len;
  SKI.uz = dz / SKI.len;
}
/** 在滑雪道上的位置：t 0（坡底）~1（坡顶），across 离中线多远（米），k 0~1 在不在道上（边上是软的）。 */
export function skiAt(x, z) {
  const rx = x - SKI.bottom[0];
  const rz = z - SKI.bottom[1];
  const along = rx * SKI.ux + rz * SKI.uz;
  if (along < -60 || along > SKI.len + 140) return { t: 0, across: 0, k: 0 };
  const across = rx * SKI.uz - rz * SKI.ux;
  const k = (1 - smooth(SKI.half, SKI.half + 120, Math.abs(across))) * smooth(-40, 0, along) * (1 - smooth(SKI.len, SKI.len + 130, along));
  return { t: Math.min(1, Math.max(0, along / SKI.len)), across, k };
}
/** 滑雪道中线上 t 处的地面高度。 */
export const skiHeight = (t) => SKI.base + SKI.drop * (t * t * (3 - 2 * t) * 0.35 + t * 0.65);

/**
 * 雪山小镇背后的雪坡：一道圆缓的山肩，0~1（1 在山肩顶上）。
 * 它只是近处的一座小山——真正的"雪山"是天边画好的那几座雪峰（src/valley/backdrop.js），
 * 远的东西照原作的办法一次画成，不用几何去堆。
 */
export function massifAt(x, z) {
  const mx = (x + 760) / 600;
  const mz = (z + 1090) / 330;
  return Math.exp(-(mx * mx + mz * mz));
}

/** 雪：雪山小镇那一片是白的（地上盖一层雪，房顶也是），加上滑雪道。0~1。 */
export function snowAt(x, z) {
  // （只盖在镇子坐的那块平地上，背后的山坡是绿的——
  //   整面山坡都刷白的话，从远处看是一大块没有明暗的白板。真正的雪山是天边画的那一座，见 main.js）
  const dx = x + 752;
  const dz = z + 556;
  if (Math.abs(dx) > 260 || dz > 230 || dz < -330) return 0;
  const d = Math.hypot(dx, dz) + (fbm(x / 30 + 3, z / 30 - 8, 2, 77) - 0.5) * 44;
  const s = 1 - smooth(138, 176, d);
  const ski = skiAt(x, z).k;
  return Math.max(s, smooth(0.72, 0.92, ski));
}

// ---- 地形 ------------------------------------------------------------------------------------------------------
// 画面要"吉卜力"，地就不能是平的：城和镇各坐在一块缓缓起伏的平地上，之间是连绵的绿丘；
// 西北是真正的雪山，北边一圈林山；东边和南边沉进海里——海滨小镇和大学城站在崖上，南边是一弯沙滩。
/** 各处压平的地：[x, z, 全平的半径, 放开的半径, 海拔] */
const PADS = [
  [YUHAI[0], YUHAI[1], 310, 440, -5],
  [-480, -40, 170, 290, -1.5],
  [445, -110, 135, 225, -5],
  [30, 400, 140, 230, -5.5],
  [420, 440, 60, 140, -5.6],
  [705, 90, 90, 170, -6.2],
  [770, -185, 125, 195, 6],
  [655, -485, 155, 245, 10],
  [300, -525, 110, 190, 10.6],
  [-740, 350, 130, 210, -5.5],
  [-872, 60, 150, 230, -2],
  [-860, -150, 82, 150, 0],
  [-800, -300, 60, 130, 7],
  [-745, -552, 155, 245, 30],
];
/** 崖：这里的岸不是缓缓下去的，是一道陡坡。[x, z, 半径] */
const CLIFFS = [[830, -190, 230], [800, -520, 280], [800, -360, 150]];
/** 沙滩：这里的岸特别缓、特别宽。[x, z, 半径] */
const BEACHES = [[400, 560, 300], [-470, 690, 110]];
const blob = (list, x, z) => {
  let k = 0;
  for (const [bx, bz, br] of list) {
    const dx = x - bx;
    const dz = z - bz;
    if (Math.abs(dx) > br || Math.abs(dz) > br) continue;
    k = Math.max(k, 1 - smooth(br * 0.55, br, Math.hypot(dx, dz)));
  }
  return k;
};

/** 沙滩 0~1。 */
export const beachAt = (x, z) => smooth(0.25, 0.6, blob(BEACHES, x, z) * (1 - blob(CLIFFS, x, z)));

const ridged = (x, z, seed) => 1 - Math.abs(fbm(x, z, 4, seed) * 2 - 1);

function land(x, z) {
  const r = Math.hypot(x, z);
  const cd = coastD(x, z);
  // 野外的底：大起伏 + 小褶皱；有人住的这一片盆地里收着一点
  const calm = 1 - smooth(640, 1020, Math.hypot(x, z + 40));
  let h = 5 + ((fbm(x / 430 + 3.1, z / 430 - 1.7, 4, 1) - 0.5) * 58 + (fbm(x / 120 + 9.3, z / 120 + 4.1, 3, 5) - 0.5) * 11) * (1 - 0.55 * calm);
  // 北边和西边的环山：照原作 world.js 的办法——山不矮（一百米上下），但坡很长（将近一公里才升上去）、
  // 形状很大（八百米一个起伏）。所以天边是几道圆润的大弧，一道叠一道；没有陡坡，也就没有岩石和等高线似的笔触。
  // 可走的范围里它只升到五六十米，大半座山在外面，隔着一层空气看。靠海的地方没有。
  const edge = z + 160 * (fbm(x / 520 + 5, z / 520, 2, 31) - 0.5);
  const hills = Math.max(smooth(-600, -1420, edge), smooth(-880, -1700, x)) * smooth(120, 420, cd);
  if (hills > 0) h += 105 * hills * (0.6 + 0.8 * fbm(x / 800 + 2, z / 800 + 9, 3, 37));
  // 雪山小镇背后的雪坡：一道圆缓的山肩，滑雪道就在它上面（真正的雪峰在天边，是画的）
  const massif = massifAt(x, z);
  if (massif > 0.002) h += massif * (62 + 16 * ridged(x / 520 + 2, z / 520 + 9, 37));
  // 地图外面：慢慢落回平地，融进雾里，不要一堵墙
  h *= 1 - 0.85 * smooth(1700, 2900, r);
  // 城、镇、站：各压成一块缓坡的平地
  for (const [px, pz, r0, r1, lv] of PADS) {
    const dx = x - px;
    const dz = z - pz;
    if (Math.abs(dx) > r1 || Math.abs(dz) > r1) continue;
    const k = smooth(r1, r0, Math.hypot(dx, dz));
    if (k > 0) h += (lv + (fbm(x / 240 + 2.2, z / 240 + 7.7, 2, 13) - 0.5) * 3.2 - h) * k;
  }
  // 滑雪道：一条平整的斜坡
  if (x < -500 && x > -900 && z < -580 && z > -960) {
    const s = skiAt(x, z);
    if (s.k > 0) h += (skiHeight(s.t) - h) * s.k;
  }
  // 海岸：先是一条不低于海面的岸边平地，过了岸线沉进海里；崖上不压低，到了崖边才陡下去
  if (cd < 170) {
    const cliff = blob(CLIFFS, x, z);
    const beach = blob(BEACHES, x, z) * (1 - cliff);
    const strip = smooth(170, 40, cd) * (1 - cliff);
    h += (-6 + (fbm(x / 70, z / 70, 2, 91) - 0.5) * 1.6 - h) * strip;
    const gentle = smooth(30 + 80 * beach, -70 - 30 * beach, cd);
    const steep = smooth(24, -8, cd);
    const sink = gentle + (steep - gentle) * cliff;
    h += (-16 - h) * sink;
    h -= 13 * smooth(-70, -520, cd);
  } else if (h < -7.3) {
    // 离海岸远的低洼：垫到海面以上（不然海面会从地底下透出来，像一个个水塘）
    h = -7.3;
  }
  if (cd >= 40 && cd < 170 && h < -7.3) h = -7.3;
  // 清溪河：两岸压成平缓的河滩，中间是两米多深的河床（入了海就不管了）
  const rv = riverAt(x, z);
  if (rv.d < 80 && cd > -40) {
    const k = smooth(-40, 30, cd);
    const bank = riverLevel(rv.t) + 0.7;
    h += (bank - h) * smooth(80, 15, rv.d) * k;
    h -= 2.8 * smooth(RIVER_HALF + 3, 2.5, rv.d) * k;
  }
  // 湖：岸是一圈刚高出水面的矮滩，往里缓缓沉下去（水边在 lakeDistance ≈ 0.95）
  const ld = lakeDistance(x, z);
  if (ld < 2.4) {
    const bank = LAKE.level + 0.5;
    h += (bank - h) * smooth(2.4, 1.36, ld);
    h -= (bank - LAKE.bed) * smooth(1.06, 0.25, ld);
  }
  return h;
}

export function heightAt(x, z) {
  return land(x, z);
}

/** 人脚下的高度：平时就是地面，在桥、栈桥、海堤上是桥面。 */
export function walkAt(x, z) {
  const b = bridgeAt(x, z);
  return b ? Math.max(b.deck, land(x, z)) : land(x, z);
}

/** 水上还是水下。湖面略低于岸。 */
export function inLake(x, z) {
  if (bridgeAt(x, z)) return false;
  // 河：水深过膝就不让走；海：同理
  const h = heightAt(x, z);
  const rv = riverAt(x, z);
  if (rv.d < RIVER_HALF + 1 && h < riverLevel(rv.t) - 0.45) return true;
  if (h < SEA.level - 0.5 && seaSide(x, z)) return true;
  return lakeDistance(x, z) < 1.05 && h < LAKE.level - 0.3;
}

/** 水有多深（0 = 岸上）。 */
export function depthAt(x, z) {
  return Math.max(0, LAKE.level - heightAt(x, z));
}

// ---- 地面上长什么 ----------------------------------------------------------------------------------------------
/** 铺了地的场子（不跟着街区走的）：[x, z, 半径] */
export const YARDS = [
  [20, 432, 30], [-20, 432, 26], [62, 432, 26], // 高铁站前广场
  [722, 72, 30], [738, 130, 26], // 港口的货场
  [-735, 492, 20], [-690, 492, 18], [-780, 492, 18], // 码头岸边
  [640, -470, 16], [804, -512, 12], // 大学城中心、观海台
  [-460, -112, 18], // AI 小镇的小广场
  [-800, -562, 0],
];
/** 铺装：路、广场、集市的场地。铺过的地方草长不出来；边缘是毛的，不是一刀切。 */
export function pavedAt(x, z) {
  const ld = lakeDistance(x, z);
  if (ld < 1.06) return 1; // 水下和湖滩
  // 河床和河滩的卵石、海边的沙滩
  const rv = riverAt(x, z);
  if (rv.d < RIVER_HALF + 4) return 1;
  const cd = coastD(x, z);
  if (cd < 160 && heightAt(x, z) < SEA.level + 2.4) return 1;
  const ragged = (fbm(x / 3.1 + 4, z / 3.1 - 2, 2, 71) - 0.5) * 1.6;
  let p = 1 - smooth(-0.5, 0.9, roadEdge(x, z) + ragged);
  // 沙滩：比别处的岸宽得多
  if (cd < 150) p = Math.max(p, beachAt(x, z) * (1 - smooth(96, 112, cd + ragged * 4)));
  p = Math.max(p, 1 - smooth(29.5, 31.5, plazaDistance(x, z) + ragged));
  for (const d of DISTRICTS) {
    if (!d.yard) continue;
    const dx = x - d.x;
    const dz = z - d.z;
    if (Math.abs(dx) > d.yard + 4 || Math.abs(dz) > d.yard + 4) continue;
    p = Math.max(p, 1 - smooth(d.yard - 1.5, d.yard + 1.5, Math.hypot(dx, dz) + ragged * 1.5));
  }
  for (const [yx, yz, yr] of YARDS) {
    if (!yr) continue;
    const dx = x - yx;
    const dz = z - yz;
    if (Math.abs(dx) > yr + 4 || Math.abs(dz) > yr + 4) continue;
    p = Math.max(p, 1 - smooth(yr - 1.5, yr + 1.5, Math.hypot(dx, dz) + ragged * 1.5));
  }
  return p;
}

/** 菜地：家门口院子西半边、丰收田园里租的那片。地是翻过的土，不长草。 */
export const GARDENS = [
  { x: HOME[0] - 5.2, z: HOME[1] - 2, hw: 3.3, hd: 3.4, where: '门前的菜地', cols: 2, rows: 4 },
  { x: -478, z: 44, hw: 6.2, hd: 3.8, where: '租的菜地', cols: 4, rows: 3 },
];
export function gardenAt(x, z) {
  for (const g of GARDENS) if (Math.abs(x - g.x) < g.hw && Math.abs(z - g.z) < g.hd) return g;
  return null;
}

/** 给 createField 的 paint：dry/growth/wet/flowers。 */
export function paint(x, z) {
  if (gardenAt(x, z)) return { dry: 0.55, growth: 0, wet: 0, flowers: 0 };
  const pav = pavedAt(x, z);
  const forest = forestAt(x, z);
  const built = builtAt(x, z);
  // 田：一块块的，麦子（干草色、长得高）、菜（绿）、休耕的土；田埂是踩实的土
  const field = fieldsAt(x, z);
  const plot = field > 0.45 ? plotAt(x, z) : null;
  let growth = 1;
  growth *= 1 - pav;
  if (plot) growth *= plot.edge * (plot.kind === 2 ? 0.25 : 1);
  growth *= 1 - forest * 0.35;
  // 高处是岩和雪；雪山小镇的地上盖着雪
  growth *= 1 - smooth(150, 230, heightAt(x, z));
  const snow = snowAt(x, z);
  growth *= 1 - smooth(0.25, 0.6, snow);
  // 城里野花少，野外多
  const wild = smooth(0.35, 0.9, fbm(x / 46 - 6, z / 46 + 3, 2, 55));
  const flowers = Math.min(1, wild * (1.15 - 0.75 * built) + forest * 0.2) * (1 - snow);
  const dry = 0.08 + 0.3 * smooth(0.55, 0.8, fbm(x / 110 + 2.2, z / 110 + 8.1, 3, 21));
  const wet = Math.max(0, 1 - smooth(1.0, 1.5, lakeDistance(x, z))) * 0.9;
  if (plot) return { dry: plot.kind === 0 ? 0.96 : plot.kind === 1 ? 0.02 : 0.5, growth: Math.max(0, growth), wet: 0, flowers: 0 };
  return { dry: dry * (1 - wet), growth: Math.max(0, growth), wet, flowers };
}

const FORESTS = DISTRICTS.filter((d) => d.kind === 'forest');
/** 森林密度 0~1：几片大林子，加上北边和西边的山腰；城镇、水边、海边不长。 */
export function forestAt(x, z) {
  let f = 0;
  for (const d of FORESTS) {
    const dx = x - d.x;
    const dz = z - d.z;
    if (Math.abs(dx) > d.r * 1.05 || Math.abs(dz) > d.r * 1.05) continue;
    const dd = Math.hypot(dx, dz) / d.r;
    f = Math.max(f, (1 - smooth(0.55, 1.05, dd)) * (0.6 + 0.6 * fbm(x / 130 + 7, z / 130 + 2, 3, 61)));
  }
  const belt = Math.max(smooth(-600, -820, z), smooth(-940, -1100, x)) * smooth(0.47, 0.62, fbm(x / 210 + 1.3, z / 210 + 8.2, 3, 67));
  f = Math.max(f, belt);
  if (f <= 0) return 0;
  if (lakeDistance(x, z) < 1.25 || riverAt(x, z).d < 22 || coastD(x, z) < 70) return 0;
  return Math.min(1, f) * (1 - builtAt(x, z));
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
  return { kind: r < 0.6 ? 0 : r < 0.88 ? 1 : 2, edge: smooth(0.5, 1.5, Math.min(eu, ev)), id: r };
}

/** 田：河西的金色麦田，AI 小镇南边的丰收田园，田园高铁站旁边的一小片。[x, z, 半径] */
const FIELDS = [[-872, 62, 150], [-415, 92, 46], [-800, -40, 44]];
/** 农田密度 0~1（作物）。 */
export function fieldsAt(x, z) {
  let f = 0;
  for (const [fx, fz, fr] of FIELDS) {
    const dx = x - fx;
    const dz = z - fz;
    if (Math.abs(dx) > fr || Math.abs(dz) > fr) continue;
    f = Math.max(f, 1 - smooth(0.6, 1.0, Math.hypot(dx, dz) / fr));
  }
  if (f > 0 && (roadEdge(x, z) < 3 || riverAt(x, z).d < RIVER_HALF + 10)) return 0;
  return f;
}

/** 高山密度（放岩石用）：雪山小镇背后那道山肩。 */
export function mountainAt(x, z) {
  return smooth(0.45, 0.8, massifAt(x, z));
}

// ---- 出生点 ----------------------------------------------------------------------------------------------------
export const START = [HOME[0], HOME[1] + 6];
// （开局她面朝西北：越过磨坊和高架桥，是一层层的绿丘、云带和天边的雪峰——这个世界的第一眼）
export const START_YAW = Math.PI + 0.5;
/** 这里的水面有多高；不是水（或水太浅）就返回 null。湖、河、海都算。 */
export function waterAt(x, z) {
  const h = heightAt(x, z);
  if (lakeDistance(x, z) < 1.3 && h < LAKE.level) return LAKE.level;
  const rv = riverAt(x, z);
  if (rv.d < RIVER_HALF + 9 && coastD(x, z) > -30) {
    const L = riverLevel(rv.t);
    if (h < L) return L;
  }
  if (h < SEA.level && coastD(x, z) < 60) return SEA.level;
  return null;
}

/** 这片水是湖、河还是海（钓鱼和水下的鱼按它来）。 */
export function waterKind(x, z) {
  if (lakeDistance(x, z) < 1.5) return 'lake';
  if (coastD(x, z) < 25 && riverAt(x, z).d > RIVER_HALF + 12) return 'sea';
  if (coastD(x, z) < -20) return 'sea';
  return 'river';
}
