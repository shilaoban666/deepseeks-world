// 小鲸鱼的世界：入口。
// 沿用原作的骨架——场地的草（src/lib）、天空与远山（src/valley/sky.js）、收尾的笔触（createFrame）——
// 换掉的是地、建筑、人，以及这一整套"能做的事"。
import * as THREE from 'three';
import { bakeGround, createField, createFrame, loadGroundTextures, LITE_RINGS } from '../lib/index.js';
import { createSky, createSkyParts } from '../valley/sky.js';
import { createStrokes } from '../valley/strokes.js';
import { createCity } from './city.js';
import { createInterior } from './interior.js';
import { loadWhalechan, createWhalechan, createCamera, createMover } from './player.js';
import { createHud, bakeMinimap, createMinimap } from './ui.js';
import { createGame } from './interactions.js';
import { createFarGround } from './props.js';
import { configureAlbedo, loadAlbedo } from './paint.js';
import { loadPlantAtlases } from './billboard.js';
import * as plan from './plan.js';
import { createParticles } from './particles.js';
import { createWeather } from './weather.js';
import { createActions } from './actions.js';
import { createPanels } from './panels.js';
import { spriteStyle } from './fishdex.js';
import { createBigMap } from './bigmap.js';
import { createPhoto } from './photo.js';
import { createLife } from './life.js';
import { createFarming, CROP } from './farming.js';
import { createGlow } from './glow.js';

const params = new URLSearchParams(location.search);
// 画质档和原作一样：high / medium / low。?lite=1 是 low 的别名（给核显用）。
const quality = params.get('quality') ?? 'high';
const lite = params.has('lite') || quality === 'low';
const medium = quality === 'medium';
const high = !lite && !medium;
const $ = (id) => document.getElementById(id);
// 低配档的草：在原作的稀草环上再稀一档——中圈和外圈每丛更宽、数量更少（覆盖范围不变）
const TOWN_LITE_RINGS = LITE_RINGS.map((r) => (r.name === 'near' ? r : { ...r, cell: r.cell * (r.name === 'mid' ? 1.22 : 1.38), width: r.width * (r.name === 'mid' ? 1.2 : 1.35) }));

const setProgress = (value, label) => {
  $('loading-bar').style.width = `${Math.round(value * 100)}%`;
  $('loading-text').textContent = label;
  return new Promise((r) => setTimeout(r, 0));
};

// ---- 显卡 ------------------------------------------------------------------------------------------------------
const canvas = $('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch {
  $('loading-text').textContent = '这台设备打不开 WebGL 2';
  throw new Error('no WebGL 2');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Number(params.get('dpr') ?? (lite ? 0.8 : 1.5))));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const indoorScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 12000);
const fitView = () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
};
window.addEventListener('resize', fitView);

// ---- 场地：草和地面（沿用 src/lib，只把地形函数换成这座城市） -------------------------------------------------
// 和原作一样，地面贴图是 1 m 一个纹素：草下面那张画（笔触、湿痕、裸土）全靠它
// 整张可走的地图（±1024 m）都在场地里：哪儿都有草，哪儿的地都是同一张
const EXTENT = 2048;
// （场地的中心只有一个：烘焙和 createField 必须用同一个，否则草、路、房子会错开几十米）
const CENTRE = [0, 0];
const GROUND = { extent: EXTENT, extentRes: lite ? 768 : 1024, centre: CENTRE };
const baked = await bakeGround({ ...GROUND, heightAt: plan.heightAt, paint: plan.paint }, (p) => {
  $('loading-bar').style.width = `${Math.round((0.05 + p * 0.3) * 100)}%`;
});
await setProgress(0.4, '正在铺路…');

const groundTextures = loadGroundTextures(renderer, './textures/');
const field = createField({
  ...GROUND,
  heightAt: plan.heightAt,
  paint: plan.paint,
  baked,
  textures: await groundTextures,
  size: 512,
  // 核显：草环换成稀的那一套（三角从一千多万降到四百多万，覆盖范围不变）
  rings: lite ? TOWN_LITE_RINGS : undefined,
  density: high ? 1 : medium ? 0.7 : 0.5,
  height: 0.5,
  seed: 7,
});
scene.add(field.group);
// 夜有多深（0 白天，1 深夜）：灯和窗读它
field.uniforms.uNight = { value: 0 };
// 屋里的剖面：人站的地方，和人→镜头的方向（interior 的墙读它）
field.uniforms.uCut = { value: new THREE.Vector4() };

// ---- 草地下面的"画"：笔触、坡向、眼点（这三样原作有、上一版漏了） -------------------------------------------
{
  // 笔触：一撮撮浅一点/深一点的绿，红通道是明暗，蓝通道是石头
  field.uniforms.tStrokes.value = createStrokes(renderer);
  // 坡向：让阳光落在坡的哪一面，读的是"几米范围"的走向，不是每一个小包
  const RES = high ? 384 : 192;
  const data = new Uint8Array(RES * RES * 2);
  const step = EXTENT / RES;
  const byte = (slope) => Math.round(255 * Math.min(1, Math.max(0, 0.5 + slope * 2)));
  for (let j = 0, k = 0; j < RES; j++) {
    const z = CENTRE[1] - EXTENT / 2 + (j + 0.5) * step;
    for (let i = 0; i < RES; i++) {
      const x = CENTRE[0] - EXTENT / 2 + (i + 0.5) * step;
      data[k++] = byte((field.heightAt(x + 24, z) - field.heightAt(x - 24, z)) / 48);
      data[k++] = byte((field.heightAt(x, z + 24) - field.heightAt(x, z - 24)) / 48);
    }
  }
  const slope = new THREE.DataTexture(data, RES, RES, THREE.RGFormat, THREE.UnsignedByteType);
  slope.minFilter = slope.magFilter = THREE.LinearFilter;
  slope.unpackAlignment = 1;
  slope.needsUpdate = true;
  field.uniforms.tSlope.value = slope;
  // 远地那套"按这个视点画"的笔触，也要给一个眼点（开局站的地方）
  field.uniforms.uHeroEye.value.set(plan.START[0], field.heightAt(plan.START[0], plan.START[1]) + 1.68, plan.START[1]);
}

// ---- 天空：原作那一套（云一次画进 cubemap，远山画成贴条） -----------------------------------------------------
const skyParts = createSkyParts(renderer, {
  cloudSize: high ? 2048 : medium ? 1024 : 512,
  cloudSteps: high ? 240 : medium ? 200 : 150,
  liveClouds: high || medium,
  backdropWidth: high ? 12288 : 4096,
});
const skyReady = (async () => {
  await skyParts.clouds.compile();
  await skyParts.backdrop.compile();
  skyParts.backdrop.paint();
  skyParts.light(15);
})();

// ---- 城市 ------------------------------------------------------------------------------------------------------
await setProgress(0.46, '正在铺贴图…');
// 手绘风 albedo 贴图（平光、镜像无缝），按材质类型登记给 paint.js。
// ?tex=0 可以关掉，退回纯 shader 的版本。
if (params.get('tex') !== '0') {
  const base = './textures/albedo/';
  const names = {
    // 墙 8 种：奶油石灰 / 白灰 / 木构架 / 红砖 / 石砌 / 夯土 / 冷灰泥 / 煤渣砖
    wall0: 'wall0', wall1: 'wall1', wall2: 'wall2', wall3: 'wall3', wall4: 'wall4', wall5: 'wall5', wall6: 'wall6', wall7: 'wall7',
    // 屋顶 6 种：赤陶瓦 / 青瓦 / 木瓦 / 茅草 / 瓦楞铁 / 谷仓板
    roof0: 'roof0', roof1: 'roof1', roof2: 'roof2', roof3: 'roof3', roof4: 'roof4', roof5: 'roof5',
    // 木 6 种：橡木地板 / 风蚀板 / 旧椽 / 门板 / 窗框 / 竖板
    wood0: 'wood0', wood1: 'wood1', wood2: 'wood2', wood3: 'wood3', wood4: 'wood4', wood5: 'wood5',
    // 石/地 4 种：石板路 / 毛石 / 石阶 / 石板桥
    stone0: 'stone0', stone1: 'stone1', stone2: 'stone2', stone3: 'stone3',
    // 其它
    fabric: 'fabric', snow: 'snow', paddy: 'paddy',
    // 桥：木桥面 / 木栏杆 / 桥墩石 / 石桥护墙
    bridge0: 'bridge0', bridge1: 'bridge1', bridge2: 'bridge2', bridge3: 'bridge3',
    // 路：土路 / 鹅卵石 / 碎石 / 柏油
    road0: 'road0', road1: 'road1', road2: 'road2', road3: 'road3',
    // 路灯：铁艺灯柱 / 灯罩玻璃 / 木电杆
    lamp0: 'lamp0', lamp1: 'lamp1', lamp2: 'lamp2',
    // 街具：长椅木条 / 铸铁椅架 / 木栅栏 / 铁皮桶 / 木牌
    bench0: 'bench0', bench1: 'bench1', fence0: 'fence0', bin0: 'bin0', sign0: 'sign0',
  };
  // 画风筛选：下面这几张和吉卜力/煤炭镇的手绘感不搭——鹅卵石和碎石路像照片、柏油和瓦楞铁太现代、
  // 铁艺灯柱和铁皮桶镜像拼接后出了对称花纹、木电杆是一整根画在图里（不能平铺）、煤渣砖太灰太脏。
  // 它们不载入；用到它们的地方自动退回同类的第 0 号或程序化画法。?alltex=1 全部载入（对比用）。
  const OFF_STYLE = ['road0', 'road1', 'road2', 'road3', 'roof4', 'wall7', 'lamp0', 'lamp2', 'bin0'];
  if (params.get('alltex') !== '1') for (const k of OFF_STYLE) delete names[k];
  const loaded = {};
  await Promise.all(
    Object.entries(names).map(async ([kind, file]) => {
      try {
        loaded[kind] = await loadAlbedo(base + file + '.png');
      } catch (e) {
        console.warn('albedo 缺失', file, e);
      }
    }),
  );
  // 屋里的墙纸、瓷砖、地砖（素材库 assets/textures/house 里挑的三张）
  await Promise.all(
    Object.entries({ indoorWall: 'wallpaper-stripe-fine', indoorTile: 'tile-subway', indoorFloor: 'tile-hex' }).map(async ([kind, file]) => {
      try {
        loaded[kind] = await loadAlbedo(`./textures/house/${file}.webp`);
      } catch (e) {
        console.warn('室内贴图缺失', file, e);
      }
    }),
  );
  configureAlbedo(loaded, { mix: Number(params.get('texmix') ?? 0.85), scales: { indoorWall: 1.4, indoorTile: 1.1, indoorFloor: 0.9 } });
}
await setProgress(0.48, '正在铺野花…');
// 手绘植物图集（139 种花 / 110 种树 / 8 个物件）。?plants=0 退回程序化花丛。
let plants = null;
if (params.get('plants') !== '0') {
  try {
    plants = await loadPlantAtlases('./textures/plants/');
    console.log('植物图集：', Object.entries(plants).map(([k, v]) => `${k} ${v.reduce((n, p) => n + p.sprites.length, 0)} 个/${v.length} 页`).join('  '));
  } catch (e) {
    console.warn('植物图集载入失败，退回程序化花丛', e);
  }
}
await setProgress(0.5, '正在盖房子…');
const city = createCity(field.uniforms, field, {
  plants,
  // 路面默认用程序化的手绘石板（新贴图版过曝、像照片）；?roadtex=1 才换贴图
  roadTex: params.get('tex') !== '0' && params.get('roadtex') === '1',
  cards: high ? 1 : medium ? 0.7 : 0.4,
  treeNear: high ? 150 : medium ? 110 : 70,
  treeFar: high ? 760 : medium ? 560 : 340,
  density: high ? 1 : medium ? 0.85 : 0.6,
});
scene.add(city.group);
// 鸟、鸭子、船（素材库 life 图集）
const life = plants?.life
  ? createLife(field.uniforms, plants, {
      random: (() => {
        let a = 20261118;
        return () => {
          a = (a + 0x6d2b79f5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      })(),
    })
  : null;
if (life) scene.add(life.mesh);
scene.add(createFarGround(field.uniforms, { centre: CENTRE, half: EXTENT / 2 }));

await setProgress(0.62, '正在种树…');
const interior = createInterior(field.uniforms);
indoorScene.add(interior.group);

// ---- 收尾：笔触 + 墨线。笔刷强度默认 3（和原作 high 一样），?paint=0 关掉 --------------------------------
const frame = createFrame(renderer, field, { samples: high ? 4 : medium ? 2 : 0, bloom: 0.1 });
const paintWas = Number(params.get('paint') ?? (high ? 3 : medium ? 2 : 1));
frame.paint = paintWas;
let paintNow = paintWas;

// ---- 主角 ------------------------------------------------------------------------------------------------------
await setProgress(0.78, '小鲸鱼正在起床…');
const arts = await loadWhalechan(field.uniforms, './figures/');
const whale = createWhalechan(field.uniforms, arts);
scene.add(whale.group);
whale.setPos(plan.START[0], plan.START[1]);

// ---- 相机、走路 ------------------------------------------------------------------------------------------------
const cam = createCamera(camera, canvas, document.body);
// 室外：镜头不穿进房子（细杆子不算，免得一路抖）
const bigBoxes = city.colliders.filter((c) => c.hw > 1.2 && c.hd > 1.2);
cam.obstacles = () => (indoor ? null : bigBoxes);
let indoor = false;
let seated = null; // { x, z, yaw, lookAt: {x,y,z}, kind }
const outdoorPos = { x: plan.START[0], z: plan.START[1] };
const outdoorDoor = { x: 0, z: -4.2 }; // 家门外站的地方（房子在 z=-16，门朝南）
cam.update(0.016, whale.state, plan.heightAt);
// 碰撞盒按室内/室外各一套；人也细一点（真人肩宽 ≈ 0.6 m）
const mover = createMover({ colliderList: () => (indoor ? interior.colliders : city.colliders) });

// ---- 界面 ------------------------------------------------------------------------------------------------------
// ---- 粒子和天气 -------------------------------------------------------------------------------------------------
const particles = createParticles(field.uniforms, lite ? 1400 : 2600);
scene.add(particles.mesh);
const weather = createWeather({ field, frame, particles, lite, ignite: (x, z, r) => field.ignite(x, z, r) });
scene.add(weather.group);
if (params.get('weather')) weather.set(params.get('weather'), { immediate: true });
let nightNow = 0;

const hud = createHud();
await setProgress(0.86, '正在画地图…');
const bakedMap = bakeMinimap();
const minimap = createMinimap($('minimap'), bakedMap);
minimap.setInteractables(city.interactables);

// 图集里的鱼和作物（界面图标、钓鱼结果用）
const fishSprites = Object.fromEntries((plants?.fish?.[0]?.sprites ?? []).map((sp) => [sp.name, sp]));
const farmSprites = Object.fromEntries((plants?.farm?.[0]?.sprites ?? []).map((sp) => [sp.name, sp]));
const game = createGame({
  hud,
  fishSprites,
  farmSprites,
  player: {
    /** 面朝的那片水是湖、河还是海 */
    get waterKind() {
      const f = [Math.sin(whale.state.yaw), Math.cos(whale.state.yaw)];
      for (let d = 1.5; d <= 7; d += 0.75) {
        const x = whale.state.x + f[0] * d;
        const z = whale.state.z + f[1] * d;
        if (plan.waterAt(x, z) != null) return plan.waterKind(x, z);
      }
      return plan.waterKind(whale.state.x, whale.state.z);
    },
    get raining() {
      return weather.info.rain > 0.3;
    },
    get x() {
      return whale.state.x;
    },
    get z() {
      return whale.state.z;
    },
    get nearWater() {
      // 湖、河、海：身边 3 米以内有水就算
      for (const r of [2, 3.5, 5]) for (let a = 0; a < 6.28; a += 0.6) if (plan.waterAt(whale.state.x + Math.cos(a) * r, whale.state.z + Math.sin(a) * r) != null) return true;
      return plan.waterAt(whale.state.x, whale.state.z) != null;
    },
  },
  city,
  busStops: plan.BUS_STOPS,
  onTravel(st) {
    whale.setPos(st.x + 1, st.z - 3);
  },
  onMap() {
    showMap(1);
  },
  onDoor(enter) {
    actions?.reset();
    if (enter === indoor) return;
    if (enter) {
      outdoorPos.x = whale.state.x;
      outdoorPos.z = whale.state.z;
      indoor = true;
      game.state.indoor = true;
      seated = null;
      scene.remove(whale.group);
      indoorScene.add(whale.group);
      // 站在玄关，面朝屋里（不是站在客厅中间）
      whale.setPos(interior.spawn.x, interior.spawn.z);
      whale.state.y = 0;
      whale.state.yaw = interior.spawn.yaw;
      cam.setIndoor(true);
      cam.yaw = 0.35;
      cam.distance = cam.want = 9.5;
      cam.pitch = 0.86;
      hud.toast('进屋了。E 用家具，走到大门按 E 出去');
    } else {
      indoor = false;
      game.state.indoor = false;
      indoorScene.remove(whale.group);
      scene.add(whale.group);
      // 出门站在门口，不在屋子正中间
      whale.setPos(outdoorDoor.x, outdoorDoor.z);
      whale.state.yaw = 0;
      cam.setIndoor(false);
      cam.distance = cam.want = 7.5;
      cam.pitch = 0.22;
      hud.toast('出门了');
    }
    whale.group.visible = true;
    minimap.setInteractables(indoor ? interior.interactables : city.interactables);
  },
  // 坐下：人挪到座位上（镜头还是那个俯看的镜头）
  onSit(it) {
    if (!it?.seat) return;
    const seat = it.seat;
    seated = { x: seat.x, z: seat.z, yaw: seat.yaw, kind: it.kind };
    whale.setPos(seat.x, seat.z);
    whale.state.y = 0;
    whale.state.yaw = seat.yaw;
    if (it.kind === 'sofa') {
      interior.tv.set(true);
      hud.toast('坐下了。电视开着——E 起身');
    } else hud.toast('坐下了。E 起身');
  },
  // 电视：开 / 关
  onTv() {
    const now = !interior.tv.on;
    interior.tv.set(now);
    hud.toast(now ? '电视开了：《山谷的四季》' : '电视关了');
  },
});

// 种地：家门口和田园小镇的菜地
const farming = createFarming(field.uniforms, plants, city.gardenPlots);
scene.add(farming.group);
game.setFarm(farming);

// 发光：路灯、石灯笼、灯串、灯塔光柱、萤火虫、熟了的菜上的小星
const glow = (() => {
  const flies = [];
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // 河边
  for (let i = 0; i + 1 < plan.RIVER.length; i++) {
    const [ax, az] = plan.RIVER[i];
    const [bx, bz] = plan.RIVER[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let k = 0; k < len / 9; k++) {
      const t = rnd();
      const side = rnd() < 0.5 ? -1 : 1;
      const off = plan.RIVER_HALF + 2 + rnd() * 9;
      const x = ax + (bx - ax) * t - ((bz - az) / len) * side * off;
      const z = az + (bz - az) * t + ((bx - ax) / len) * side * off;
      if (Math.abs(x) < plan.HALF && Math.abs(z) < plan.HALF) flies.push([x, plan.heightAt(x, z) + 0.6 + rnd() * 1.6, z]);
    }
  }
  // 湖边
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const k = 1.08 + rnd() * 0.35;
    const x = plan.LAKE.x + Math.cos(a) * plan.LAKE.rx * k;
    const z = plan.LAKE.z + Math.sin(a) * plan.LAKE.rz * k;
    flies.push([x, plan.heightAt(x, z) + 0.6 + rnd() * 1.6, z]);
  }
  // 田边、果园、家门口的菜地
  for (const id of ['fields', 'orchard', 'farm']) {
    const d = plan.DISTRICTS.find((q) => q.id === id);
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const r = d.r * (0.4 + rnd() * 0.7);
      const x = d.x + Math.cos(a) * r;
      const z = d.z + Math.sin(a) * r;
      flies.push([x, plan.heightAt(x, z) + 0.6 + rnd() * 1.4, z]);
    }
  }
  for (let i = 0; i < 12; i++) flies.push([2 + rnd() * 8, plan.heightAt(4, 0) + 0.7 + rnd(), -6 + rnd() * 10]);
  return createGlow(field.uniforms, { ...city.lights, fireflies: flies, ground: plan.heightAt });
})();
scene.add(glow.group);

/** 从座位上站起来 */
const standUp = () => {
  if (!seated) return false;
  seated = null;
  whale.group.visible = true;
  // 往座位后面让一点，别卡在沙发里
  whale.setPos(whale.state.x, whale.state.z - 0.6);
  hud.toast('起身了');
  return true;
};

// ---- 天空的时间跟着游戏钟走 ------------------------------------------------------------------------------------
let sky = null;
let skyHour = -1;
let shadeHour = -9;
let frozenClock = null; // 截图用：把钟停在某个时刻
frame.grade = new THREE.Vector3(1, 1, 1);
/**
 * 游戏里的钟 → 天上的光。原作的天只有"正午到日落"这半天，所以：
 * 上午是下午倒着放（日出像日落，太阳一路升到正午），夜里停在日落那一刻再整体压暗压蓝（日拍夜）。
 */
const dayLight = (clock) => {
  // clock：0~24 的小时
  const DAWN = 5.5;
  const DUSK = 19.5;
  let hour;
  if (clock >= 12 && clock <= DUSK) hour = 12 + ((clock - 12) / (DUSK - 12)) * 8.4;
  else if (clock >= DAWN && clock < 12) hour = 20.4 - ((clock - DAWN) / (12 - DAWN)) * 8.4;
  else hour = 20.4;
  // 夜有多深：日落后一小时全黑，日出前一小时开始亮
  let night = 0;
  if (clock > DUSK) night = Math.min(1, (clock - DUSK) / 1.2);
  else if (clock < DAWN) night = Math.min(1, (DAWN - clock) / 1.0);
  return { hour, night };
};
const syncSky = () => {
  const clock = frozenClock ?? (game.state.minutes / 60) % 24;
  const { hour, night } = dayLight(clock);
  if (sky && Math.abs(hour - skyHour) > 0.02) {
    const first = skyHour < 0;
    skyHour = hour;
    sky.setHour(hour, !first);
    // 树影跟着太阳走（太阳挪了一刻钟以上才重烘）
    if (first || Math.abs(hour - shadeHour) > 0.25) {
      shadeHour = hour;
      city.woods.cast(field.uniforms.uSunDir.value);
    }
  }
  if (sky) {
    frame.exposure = sky.exposure * (1 - 0.25 * night);
    // 夜里泛光开大一点：灯、灯串、萤火虫会晕开
    frame.bloom = 0.1 + 0.16 * night;
    frame.grade.set(1 - 0.8 * night, 1 - 0.68 * night, 1 - 0.36 * night);
    field.uniforms.uNight.value = night;
    nightNow = night;
    // 天气在这一刻的天光上再调一层（屋里有自己的灯，不调）
    if (!indoor) {
      weather.apply();
      underwaterLook();
    }
  }
};
/** 眼睛进了水：雾变成青绿色、很浓，画面整体压蓝 */
const underwaterLook = () => {
  const w = actions?.underwater(camera);
  if (w == null) return;
  const u = field.uniforms;
  const lum = Math.max(0.25, (u.uSkyColor.value.r + u.uSkyColor.value.g + u.uSkyColor.value.b) / 3);
  u.uFogColor.value.setRGB(0.05 * lum * 3, 0.26 * lum * 3, 0.32 * lum * 3);
  u.uFogSunColor.value.copy(u.uFogColor.value);
  u.uFogDensity.value = 0.11;
  frame.grade.x *= 0.62;
  frame.grade.y *= 0.9;
  frame.grade.z *= 1.04;
};
let actions = null;
await setProgress(0.92, '正在画云…');
await skyReady;
sky = createSky(renderer, field, { parts: skyParts });
{
  // 每次天光重算之后，让天气记下新的基准光
  const setHour = sky.setHour.bind(sky);
  sky.setHour = (h, soft) => {
    setHour(h, soft);
    weather.capture(sky);
  };
}
scene.add(sky.mesh);
city.lake.userData.setSky(sky);
syncSky();
await setProgress(0.96, '正在调光…');

// ---- 屋里的光：不用天上的太阳，用一盏从斜上方照下来的暖灯；墙朝镜头的那一侧剖开 ------------------------
let wasIndoor = false;
const indoorLight = () => {
  if (!indoor) {
    if (wasIndoor) {
      // 出门：把天光还回去
      wasIndoor = false;
      skyHour = -1;
      syncSky();
    }
    return;
  }
  wasIndoor = true;
  const u = field.uniforms;
  const night = u.uNight.value;
  u.uSunDir.value.set(0.42, 0.78, 0.46).normalize();
  // 白天是窗外进来的天光，夜里是灯：更暖、稍暗
  u.uSunColor.value.setRGB(1.72 - 0.1 * night, 1.6 - 0.26 * night, 1.42 - 0.5 * night);
  u.uSkyColor.value.setRGB(0.42 - 0.06 * night, 0.42 - 0.1 * night, 0.46 - 0.18 * night);
  frame.exposure = 1;
  frame.grade.set(1, 1, 1);
  const dx = camera.position.x - whale.state.x;
  const dz = camera.position.z - whale.state.z;
  const len = Math.hypot(dx, dz) || 1;
  u.uCut.value.set(whale.state.x, whale.state.z, dx / len, dz / len);
};

// ---- 地图：M 轮着看——小地图 / 全图 / 手绘的小镇图 / 手绘的世界图 ---------------------------------------
// ---- 大地图（M）：手绘全图、探索、地点、目标、坐车 -----------------------------------------------------------
const bigmap = createBigMap({
  city,
  hud,
  getPlayer: () => ({ x: whale.state.x, z: whale.state.z, yaw: whale.state.yaw }),
  onTravel(it) {
    if (indoor) game.interact({ kind: 'exit', name: '玄关' });
    actions.reset();
    // 站到那个地方的门口/站台边，别站在屋里
    const a = Math.atan2(it.x - whale.state.x, it.z - whale.state.z);
    whale.setPos(it.x - Math.sin(a) * 3, it.z - Math.cos(a) * 3);
    whale.state.yaw = a;
    cam.yaw = a + Math.PI;
    game.state.minutes += 20;
    hud.toast(`坐车到了：${it.name}（20 分钟）`);
  },
});
function showMap(page) {
  // 旧的接口：高铁站面板里"看看地图"还在调它
  if (page) {
    mapPage = 1;
    bigmap.open();
  } else bigmap.close();
}
let mapPage = 0;
$('minimap-wrap').addEventListener('click', (e) => {
  e.stopPropagation();
  bigmap.open();
});

// ---- 交互：找最近的那个点 --------------------------------------------------------------------------------------
let nearest = null;
const findNearest = () => {
  const list = indoor ? interior.interactables : city.interactables;
  let best = null;
  let bestD = 1e9;
  for (const it of list) {
    const d = Math.hypot(it.x - whale.state.x, it.z - whale.state.z);
    if (d < it.r && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
};

// 背包图标：有手绘图的换成手绘图
{
  const icon = (sp, atlas) => (sp ? `<span style="${spriteStyle(sp, atlas, 22)}"></span>` : null);
  const set = (k, html) => html && game.setIcon(k, html);
  set('fish', icon(fishSprites['crucian-carp'], './textures/plants/fish.png'));
  set('rice', icon(farmSprites['produce-rice-ears'], './textures/plants/farm.png'));
  set('veg', icon(farmSprites['produce-napa-cabbage'], './textures/plants/farm.png'));
  set('fruit', icon(farmSprites['orchard-peach'], './textures/plants/farm.png'));
}

// ---- 动作 ------------------------------------------------------------------------------------------------------
actions = createActions({ whale, mover, cam, game, hud, woods: city.woods, particles, field, plan, weather, plants, shared: field.uniforms, scene });
const panels = createPanels({
  fishSprites,
  actions,
  weather,
  game,
  hud,
  onAction(id) {
    if (id === 'bag') return panels.openBag();
    if (id === 'weather') return panels.openWeather();
    if (id === 'camera') {
      hud.close();
      return photo.enter();
    }
    if (id === 'strike') {
      hud.close();
      // 劈在她前面二十几米的草地上
      const fx = Math.sin(whale.state.yaw);
      const fz = Math.cos(whale.state.yaw);
      weather.strike(camera, { x: whale.state.x + fx * 24, z: whale.state.z + fz * 24 });
      return;
    }
    if (id === 'run') return hud.toast('按住 Shift 跑');
    if (indoor || seated) return;
    actions.act(id);
  },
});

// ---- 相机（V）：取景、4K 照片、相册 -----------------------------------------------------------------------------
const photo = createPhoto({
  renderer,
  frame,
  camera,
  cam,
  whale,
  canvas,
  hud,
  mover,
  scene: () => (indoor ? indoorScene : scene),
  info: () => ({
    place: $('stat-place').textContent || '清镇',
    clock: $('stat-clock').textContent,
    weather: `${weather.info.name} ${weather.info.temp}°C`,
    underwater: $('underwater').classList.contains('on'),
  }),
  light: {
    get: () => frozenClock ?? (game.state.minutes / 60) % 24,
    frozen: () => frozenClock,
    set(h) {
      frozenClock = h;
      syncSky();
    },
  },
});

const doInteract = () => {
  // 坐着的时候，E 就是起身
  if (seated) {
    standUp();
    return;
  }
  if (hud.isOpen) {
    // 面板开着时 E 交给小游戏（钓鱼拉竿、电玩停指针）
    game.interact(nearest ?? { kind: 'none', name: '' });
  } else if (nearest) {
    game.interact(nearest);
  } else if (!indoor && actions.canFish()) {
    actions.act('fish');
  } else if (indoor) {
    game.indoorMenu();
  }
  if (hud.isOpen) cam.unlock();
};

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  // 相机拿在手上：按键都归相机（走路的 WASD 照常）
  if (photo.on) {
    photo.handleKey(e);
    return;
  }
  // 坐着时按移动键也起身
  if (seated && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) {
    standUp();
    return;
  }
  // 大地图开着：只认 M 和 Esc，别的键不让人在后面乱走
  if (bigmap.isOpen) {
    if (e.code === 'KeyM' || e.code === 'Escape') bigmap.close();
    mover.keys.clear();
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyV') {
    if (hud.isOpen) hud.close();
    mover.keys.delete('KeyV');
    photo.enter();
    return;
  }
  if (e.code === 'KeyM') {
    if (hud.isOpen) hud.close();
    cam.unlock();
    mover.keys.clear();
    bigmap.open();
    return;
  }
  if (e.code === 'KeyE') {
    e.preventDefault();
    doInteract();
  }
  if (e.code === 'Escape') {
    if (hud.isOpen) hud.close();
    else cam.unlock();
  }
  if (e.code === 'KeyB') panels.openBag();
  if (e.code === 'KeyT') {
    if (hud.isOpen) hud.close();
    else panels.openWeather();
  }
  if (!indoor && !hud.isOpen && !seated && actions.handleKey(e.code)) e.preventDefault();
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyP') {
    paintNow = paintNow ? 0 : paintWas;
    hud.toast(paintNow ? `笔触：开（${paintNow}）` : '笔触：关');
  }
});
canvas.addEventListener('click', () => {
  if (hud.isOpen || bigmap.isOpen || photo.on) return;
  cam.lock();
});

/** 交互提示：菜地按长势变 */
function hintOf(it) {
  if (it.kind !== 'plot') return it.hint ?? 'E 互动';
  const p = farming.plot(it.plot);
  if (!p?.crop) return 'E 种点什么';
  const c = CROP[p.crop];
  if (p.growth >= 1) return `E 收${c.name}`;
  return p.water > 0.05 ? `E 看看${c.name}（${Math.round(p.growth * 100)}%）` : `E 给${c.name}浇水`;
}

// ---- 主循环 ----------------------------------------------------------------------------------------------------
let last = performance.now();
let mapAccum = 0;

function tick(dt) {
  const ground = indoor ? interior.groundAt : plan.walkAt;

  if (seated) {
    // 坐着：人不动，坐下去一点
    whale.state.x = seated.x;
    whale.state.z = seated.z;
    whale.state.y = seated.kind === 'sofa' ? 0.42 : seated.kind === 'bed' ? 0.55 : 0.4;
    whale.update(dt, camera, false, 'sit');
    cam.update(dt, whale.state, ground, 1.3);
  } else {
    let moving;
    let pose = null;
    let eye = indoor ? 0.9 : 1.35;
    if (indoor) {
      const moved = mover.step(dt, whale.state, cam, game.state.stamina > 15 ? 1 : 0.62);
      whale.state.y = whale.state.groundY = ground(whale.state.x, whale.state.z);
      moving = moved.moved > 0.004;
    } else {
      // 室外：交给动作系统（跑、跳、爬树、游泳、潜水、钓鱼、晒太阳）
      const r = actions.step(dt, ground);
      moving = r.moving;
      pose = r.pose;
      eye = r.eye;
    }
    // 朝向跟着走的方向（爬树、钓鱼、躺着的时候不转）
    const turn = indoor || ['ground', 'swim', 'dive'].includes(actions.mode);
    if (turn && moving) {
      const f = cam.forward;
      const rxp = -f.y;
      const rzp = f.x;
      let mx = 0;
      let mz = 0;
      if (mover.keys.has('KeyW') || mover.keys.has('ArrowUp')) mz += 1;
      if (mover.keys.has('KeyS') || mover.keys.has('ArrowDown')) mz -= 1;
      if (mover.keys.has('KeyD') || mover.keys.has('ArrowRight')) mx += 1;
      if (mover.keys.has('KeyA') || mover.keys.has('ArrowLeft')) mx -= 1;
      if (mx || mz) whale.state.yaw = Math.atan2(f.x * mz + rxp * mx, f.y * mz + rzp * mx);
    }
    whale.update(dt, camera, moving || window.__tg?.forceMoving, window.__tg?.forcePose ?? pose);
    cam.update(dt, whale.state, ground, eye);
  }
  // 相机拿在手上：焦距、歪镜头、她眼睛的机位
  photo.apply();

  field.update(dt, camera);
  city.update(dt, [whale.state.x, whale.state.z], camera);
  if (!indoor) life?.update(dt, camera, nightNow);
  glow.setGrade(frame.grade);
  glow.update(dt, farming.ripe());
  if (!indoor) field.uniforms.uWalker.value.set(whale.state.x, whale.state.z, 0.55, 2.2);
  else interior.update(dt);
  game.update(dt);
  bigmap.update(dt, !indoor);
  weather.update(dt, camera, { minutes: game.state.day * 1440 + game.state.minutes, outdoor: !indoor, night: nightNow });
  particles.update(dt, [field.uniforms.uWind.value.x, field.uniforms.uWind.value.y, field.uniforms.uWind.value.z]);
  syncSky();
  indoorLight();
  if (sky) sky.update(dt, camera);
  frame.update(dt, camera);
  // 屋里的东西小，笔刷也要小
  const wantPaint = indoor ? Math.min(1, paintNow) : paintNow;
  if (frame.paint !== wantPaint) frame.paint = wantPaint;
  frame.render(indoor ? indoorScene : scene, camera);

  nearest = seated ? null : findNearest();
  if (!hud.isOpen) hud.prompt(seated ? '站起身' : nearest ? hintOf(nearest) : !indoor && actions.canFish() ? 'E 钓鱼' : null);

  mapAccum += dt;
  if (mapAccum > 0.1) {
    mapAccum = 0;
    panels.update(indoor, camera);
    minimap.draw(0.1, { x: whale.state.x, z: whale.state.z, yaw: whale.state.yaw, waypoint: bigmap.waypoint });
    const wp = bigmap.waypoint;
    $('minimap-mode').textContent = wp ? `→ ${wp.name} ${Math.round(Math.hypot(wp.x - whale.state.x, wp.z - whale.state.z))} 米` : 'M 大地图';
  }
}

// 动态分辨率（?dyn=0 关）：低配档默认开。每 30 帧看一次平均帧时间，慢了就少画点像素，快了再加回来
const dyn = params.get('dyn') !== '0' && (lite || params.get('dyn') === '1');
const baseRatio = renderer.getPixelRatio();
let ratioK = 1;
let frames = 0;
let spent = 0;
renderer.setAnimationLoop((now) => {
  const raw = now - last;
  const dt = Math.min(0.05, Math.max(0, raw / 1000));
  last = now;
  tick(dt);
  if (!dyn || raw > 400) return;
  frames++;
  spent += raw;
  if (frames >= 30) {
    const avg = spent / frames;
    frames = 0;
    spent = 0;
    const want = avg > 40 ? ratioK - 0.08 : avg < 27 ? ratioK + 0.05 : ratioK;
    const next = Math.min(1, Math.max(0.55, want));
    if (Math.abs(next - ratioK) > 0.01) {
      ratioK = next;
      renderer.setPixelRatio(baseRatio * ratioK);
      fitView();
    }
  }
});

// ---- 收尾 ------------------------------------------------------------------------------------------------------
await setProgress(1, '到了');
await frame.compile(scene, camera).catch((e) => console.warn('compile outdoor', e));
await frame.compile(indoorScene, camera).catch((e) => console.warn('compile indoor', e));
$('loading').classList.add('done');
setTimeout(() => $('loading')?.remove(), 700);
minimap.draw(0.1, { x: whale.state.x, z: whale.state.z, yaw: whale.state.yaw });

// 给测试和录屏留的后门
window.__tg = {
  scene,
  indoorScene,
  camera,
  renderer,
  field,
  frame,
  sky,
  city,
  interior,
  whale,
  game,
  hud,
  minimap,
  cam,
  mover,
  plan,
  tick,
  /** 把钟停在几点（小时，可带小数）；null 恢复流逝 */
  setClock(h) {
    frozenClock = h;
    if (h != null) game.state.minutes = h * 60;
    syncSky();
  },
  weather,
  actions,
  particles,
  panels,
  bigmap,
  photo,
  life,
  farming,
  glow,
  fishdex: await import('./fishdex.js'),
  setPaint(v) {
    paintNow = v;
  },
  indoor: () => indoor,
  enter: () => game.interact(city.interactables.find((i) => i.kind === 'door')),
  exit: () => game.interact({ kind: 'exit', name: '玄关' }),
  nearest: () => nearest,
  ready: true,
};