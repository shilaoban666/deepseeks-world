// 种地：一块块菜地，种下种子 → 发芽 → 长叶 → 开花结果 → 成熟，浇过水长得快，下雨天自己就浇了。
// 作物的图是素材库的田间作物（farm 图集里的 plant-*，收获物是 produce-*）。
//
// 时间用游戏里的钟：现实 1 秒 = 游戏 2 分钟，所以"8 小时"的白菜现实里是 4 分钟。
// 菜地在两个地方：家门口 8 块、田园小镇租的 12 块（位置由 city.js 摆好，见 city.gardenPlots）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPlantBatch } from './billboard.js';
import { paintMaterial } from './paint.js';

/** 能种的作物。hours 成熟要几个游戏小时；seed 种子价；sell 收购价；food 吃一个加多少饱食；veg 能当"青菜"下锅；h 成熟时多高（米）；yield 一次收几个 */
export const CROPS = [
  { id: 'radish', name: '萝卜', hours: 6, seed: 5, sell: 10, food: 7, veg: true, h: 0.62, yield: [2, 4], note: '长得最快，红皮白心' },
  { id: 'napa-cabbage', name: '白菜', hours: 8, seed: 6, sell: 13, food: 8, veg: true, h: 0.7, yield: [2, 3], note: '一棵能吃好几顿' },
  { id: 'pea', name: '豌豆', hours: 10, seed: 7, sell: 15, food: 6, veg: true, h: 0.85, yield: [3, 5], note: '爬着竹竿往上长' },
  { id: 'garlic', name: '大蒜', hours: 9, seed: 6, sell: 14, food: 2, veg: true, h: 0.55, yield: [3, 5], note: '做什么菜都放一点' },
  { id: 'potato', name: '土豆', hours: 12, seed: 8, sell: 18, food: 12, veg: true, h: 0.7, yield: [3, 5], note: '挖出来一串一串的' },
  { id: 'tomato', name: '番茄', hours: 14, seed: 10, sell: 22, food: 9, veg: true, h: 0.9, yield: [3, 5], note: '晒足了太阳才甜' },
  { id: 'chilli', name: '辣椒', hours: 16, seed: 12, sell: 26, food: 3, veg: true, h: 0.75, yield: [4, 6], note: '一串红一串绿' },
  { id: 'sweet-potato', name: '红薯', hours: 18, seed: 9, sell: 22, food: 16, veg: true, h: 0.6, yield: [2, 4], note: '烤着吃最香' },
  { id: 'maize', name: '玉米', hours: 20, seed: 10, sell: 24, food: 14, veg: false, h: 1.9, yield: [2, 3], note: '比小鲸鱼还高' },
  { id: 'peanut', name: '花生', hours: 22, seed: 12, sell: 30, food: 10, veg: false, h: 0.55, yield: [4, 6], note: '果子长在土里' },
  { id: 'sunflower', name: '向日葵', hours: 26, seed: 14, sell: 36, food: 6, veg: false, h: 1.8, yield: [1, 2], note: '跟着太阳转，结一盘瓜子' },
  { id: 'tea', name: '茶树', hours: 36, seed: 20, sell: 50, food: 4, veg: false, h: 0.95, yield: [3, 4], note: '采最嫩的两片叶子' },
  { id: 'apple-tree', name: '苹果树苗', hours: 48, seed: 24, sell: 58, food: 12, veg: false, h: 2.8, yield: [3, 6], note: '四季都能照料的小苹果树', orchard: true, sprite: 'orchard-apple' },
  { id: 'peach-tree', name: '桃树苗', hours: 54, seed: 28, sell: 68, food: 14, veg: false, h: 3.0, yield: [3, 5], note: '春天开粉色的小花', orchard: true, sprite: 'orchard-peach' },
  { id: 'pear-tree', name: '梨树苗', hours: 60, seed: 30, sell: 74, food: 13, veg: false, h: 3.1, yield: [3, 5], note: '果实清甜，适合小镇风', orchard: true, sprite: 'orchard-pear' },
];
export const CROP = Object.fromEntries(CROPS.map((c) => [c.id, c]));
/** 收获物在 farm 图集里的名字 */
const PRODUCE = { radish: 'radish', 'napa-cabbage': 'napa-cabbage', pea: 'pea-pods', garlic: 'garlic-bulb', potato: 'potato-tuber', tomato: 'tomato', chilli: 'chilli', 'sweet-potato': 'sweet-potato-root', maize: 'maize-cob', peanut: 'peanuts', sunflower: 'sunflower-head', tea: 'tea-shoots' };
export const produceSprite = (id) => `produce-${PRODUCE[id] ?? id}`;
export const plantSprite = (c) => c.sprite ?? `plant-${c.id}`;
export const STAGES = ['种子', '发芽', '长叶', '开花结果', '成熟'];
/** 生长进度 → 第几阶段 */
export const stageOf = (g) => (g >= 1 ? 4 : g >= 0.75 ? 3 : g >= 0.4 ? 2 : g >= 0.12 ? 1 : 0);
// 每个阶段立牌有多高（占成熟高度的比例）：种子时只露一点芽
const STAGE_H = [0.16, 0.3, 0.55, 0.82, 1];

/**
 * @param shared 场地的 uniforms
 * @param plants loadPlantAtlases()（要有 farm）
 * @param plots [{ id, x, z, y, place }]（city.gardenPlots）
 */
export function createFarming(shared, plants, plots) {
  const group = new THREE.Group();
  const state = plots.map((p) => ({ ...p, crop: null, growth: 0, water: 0, planted: 0 }));
  const farmPage = plants?.farm?.[0];
  const spriteIndex = new Map((farmPage?.sprites ?? []).map((sp, i) => [sp.name, i]));

  // ---- 地：翻过的土（一块平台加三道垄），干的浅、湿的深 ---------------------------------------------------------
  const soil = (() => {
    const parts = [new THREE.BoxGeometry(1.8, 0.12, 1.25)];
    for (const dz of [-0.38, 0, 0.38]) {
      const r = new THREE.BoxGeometry(1.62, 0.1, 0.2);
      r.translate(0, 0.09, dz);
      parts.push(r);
    }
    const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    g.translate(0, 0.04, 0);
    return g;
  })();
  const dry = paintMaterial(shared, { lit: [0.4, 0.27, 0.17], shade: [0.3, 0.2, 0.13], kind: 'flat' });
  const wet = paintMaterial(shared, { lit: [0.24, 0.16, 0.1], shade: [0.18, 0.12, 0.08], kind: 'flat' });
  const soilMeshes = state.map((p) => {
    const m = new THREE.Mesh(soil, dry);
    m.position.set(p.x, p.y, p.z);
    m.rotation.y = p.rotY ?? 0;
    group.add(m);
    return m;
  });

  // ---- 作物的立牌：一块地一株（成熟时一株代表一畦），按阶段长高 -------------------------------------------------
  let attr = null;
  if (farmPage) {
    const first = spriteIndex.get('plant-napa-cabbage') ?? 0;
    const batch = createPlantBatch(shared, plants.farm, state.map((p) => ({ x: p.x, z: p.z, y: -500, h: 0.5, sprite: first })), { alpha: 0.16, sway: 0.6 });
    group.add(batch);
    const geo = batch.children[0].geometry;
    attr = { offset: geo.attributes.aOffset, scale: geo.attributes.aScale, rect: geo.attributes.aRect };
  }
  const shown = state.map(() => '');
  const draw = (i) => {
    const p = state[i];
    soilMeshes[i].material = p.water > 0.05 ? wet : dry;
    if (!attr) return;
    const c = p.crop ? CROP[p.crop] : null;
    const st = c ? stageOf(p.growth) : -1;
    const key = `${p.crop}|${st}`;
    if (shown[i] === key) return;
    shown[i] = key;
    if (!c) {
      attr.offset.setXYZ(i, p.x, -500, p.z);
    } else {
      const spriteId = spriteIndex.get(plantSprite(c)) ?? spriteIndex.get('plant-napa-cabbage') ?? 0;
      const sp = farmPage.sprites[spriteId];
      const h = c.h * STAGE_H[st] * 1.5;
      attr.offset.setXYZ(i, p.x, p.y + 0.12, p.z);
      attr.scale.setXY(i, (h * sp.w) / Math.max(1, sp.h), h);
      attr.rect.setXYZW(i, sp.u0, sp.v0, sp.u1, sp.v1);
      attr.scale.needsUpdate = attr.rect.needsUpdate = true;
    }
    attr.offset.needsUpdate = true;
  };
  state.forEach((_, i) => draw(i));

  return {
    group,
    plots: state,
    /** 第 i 块地 */
    plot: (i) => state[i],
    plant(i, cropId, minutes = 0) {
      const p = state[i];
      if (!p || p.crop || !CROP[cropId]) return false;
      Object.assign(p, { crop: cropId, growth: 0, planted: minutes });
      draw(i);
      return true;
    },
    water(i) {
      const p = state[i];
      if (!p) return false;
      p.water = 1;
      draw(i);
      return true;
    },
    /** 收：返回 { crop, n }（没熟返回 null） */
    harvest(i, luck = 0) {
      const p = state[i];
      if (!p?.crop || p.growth < 1) return null;
      const c = CROP[p.crop];
      const n = c.yield[0] + Math.floor(Math.random() * (c.yield[1] - c.yield[0] + 1)) + (Math.random() < luck * 0.1 ? 1 : 0);
      Object.assign(p, { crop: null, growth: 0 });
      draw(i);
      return { crop: c, n };
    },
    clear(i) {
      const p = state[i];
      if (!p) return;
      Object.assign(p, { crop: null, growth: 0 });
      draw(i);
    },
    /** 熟了的地（发光特效在上面撒一点亮晶晶） */
    ripe: () => state.filter((p) => p.crop && p.growth >= 1),
    /**
     * @param gameMinutes 这一帧过了几分钟游戏时间
     * @param raining 下雨：地都湿了
     */
    update(gameMinutes, raining = false) {
      const hours = gameMinutes / 60;
      state.forEach((p, i) => {
        const was = p.water > 0.05;
        if (raining) p.water = 1;
        if (p.crop && p.growth < 1) {
          const c = CROP[p.crop];
          p.growth = Math.min(1, p.growth + (hours / c.hours) * (p.water > 0.05 ? 1 : 0.35));
        }
        // 浇一次水管 8 个钟头
        p.water = Math.max(0, p.water - hours / 8);
        if (was !== p.water > 0.05 || p.crop) draw(i);
      });
    },
  };
}
