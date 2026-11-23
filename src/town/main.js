// 小鲸鱼的世界：入口。
// 沿用原作的骨架——场地的草（src/lib）、天空与远山（src/valley/sky.js）、收尾的笔触（createFrame）——
// 换掉的是地、建筑、人，以及这一整套"能做的事"。
import * as THREE from 'three';
import { bakeGround, createField, createFrame, loadGroundTextures, LITE_RINGS } from '../lib/index.js';
import { createSky, createSkyParts } from '../valley/sky.js';
import { createStrokes } from '../valley/strokes.js';
import { createCity } from './city.js';
import { loadTownModels } from './models.js';
import { loadKitManifest, createKitHouses } from './kit.js';
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
import { gpuDone, guessQuality, lazyMatrices } from '../lib/gpu.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
// 启动各阶段的记号和耗时（tools/startup.mjs 读它们）
const mark = (name) => performance.mark(`tg:${name}`);
const timings = (window.__timings = {});
const timed = async (name, job) => {
  const t = performance.now();
  const out = await (typeof job === 'function' ? job() : job);
  timings[name] = Math.round(performance.now() - t);
  return out;
};

const setProgress = (value, label) => {
  $('loading-bar').style.width = `${Math.round(value * 100)}%`;
  $('loading-text').textContent = label;
  return new Promise((r) => setTimeout(r, 0));
};

// ---- 启动失败时：绝不留一张白页。把原因写在加载层上，给一个"低画质重试" -------------------------------------
let started = false;
let failed = false;
const safeStore = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {}
  },
};
function fail(why, detail = '') {
  if (failed) return;
  failed = true;
  console.error('启动失败：', why, detail);
  let box = $('loading');
  if (!box) {
    // 加载层已经撤了（玩到一半显卡丢了）：现搭一个
    box = document.createElement('div');
    box.id = 'loading';
    box.innerHTML = '<div class="box"><b>小鲸鱼的世界</b><span id="loading-text"></span><div id="loading-fail"><p id="loading-why"></p><a href="?quality=low">低画质重试</a><a class="minor" href="?quality=low&dpr=0.5">最低画质重试</a></div></div>';
    document.body.appendChild(box);
  }
  box.classList.remove('done');
  box.classList.add('failed');
  $('loading-text').textContent = why;
  if ($('loading-why')) $('loading-why').textContent = detail;
  if ($('loading-fail')) $('loading-fail').hidden = false;
}
window.addEventListener('error', (e) => {
  if (!started) fail('启动时出错了', `${e.message ?? e.error ?? ''}\n可以换低画质再试一次。`);
});
window.addEventListener('unhandledrejection', (e) => {
  if (!started) fail('启动时出错了', `${e.reason?.message ?? e.reason ?? ''}\n可以换低画质再试一次。`);
});

// ---- 显卡 ------------------------------------------------------------------------------------------------------
mark('renderer');
const canvas = $('view');
let renderer;
try {
  if (!window.WebGL2RenderingContext) throw new Error('no WebGL 2');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  fail('这台设备打不开 WebGL 2', '请确认浏览器开启了硬件加速（Chrome：设置 → 系统 → 使用图形加速功能），\n并把显卡驱动更新到最新；或者换 Chrome / Edge 的新版本。');
  throw new Error(`no WebGL 2: ${e?.message ?? e}`);
}
// 显卡上下文丢了（驱动重置、显存不够）：停下来说清楚，不留黑屏
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  renderer.setAnimationLoop(null);
  fail('显卡撑不住了（WebGL 上下文丢失）', '多半是显存不够或者显卡驱动被系统重置了。\n换低画质可以少用很多显存。');
});

// ---- 画质档：high / medium / low（?lite=1 是 low 的别名）。地址里没写就自动挑 ---------------------------------
//   ?quality=low|medium|high  明说的档会记住（下次不写也用它）；?quality=auto 忘掉记住的、重新自动挑
//   自动：软件光栅/核显/手机 → low，认不出来 → medium，独显 → high（规则在 src/lib/gpu.js）
//   上一次没能启动完（卡死、显卡丢了）：这一次自动降一档
const TIERS = ['low', 'medium', 'high'];
const gpu = guessQuality(renderer.getContext(), { dpr: window.devicePixelRatio || 1, memory: navigator.deviceMemory, pixels: screen.width * screen.height });
const asked = params.has('lite') ? 'low' : params.get('quality');
let quality;
let qualityFrom;
if (TIERS.includes(asked)) {
  quality = asked;
  qualityFrom = '指定';
  safeStore.set('tg-quality', asked);
} else {
  if (asked === 'auto') safeStore.set('tg-quality', null);
  const saved = safeStore.get('tg-quality');
  quality = TIERS.includes(saved) ? saved : gpu.quality;
  qualityFrom = TIERS.includes(saved) ? '上次选的' : '自动';
  // 上次启动到一半就没了下文：降一档再来
  const crashed = safeStore.get('tg-starting');
  if (TIERS.includes(crashed) && TIERS.indexOf(crashed) <= TIERS.indexOf(quality) && quality !== 'low') {
    quality = TIERS[Math.max(0, TIERS.indexOf(crashed) - 1)];
    qualityFrom = '上次没启动成功，自动降档';
    safeStore.set('tg-quality', null);
  }
}
safeStore.set('tg-starting', quality);
const lite = quality === 'low';
const medium = quality === 'medium';
const high = !lite && !medium;
{
  const short = gpu.name.replace(/^ANGLE \((?:[^,]*, )?/, '').replace(/ \(0x[0-9a-f]+\)/i, '').replace(/ Direct3D.*$| OpenGL.*$|, .*$|\)$/g, '') || '未知显卡';
  const label = { low: '低', medium: '中', high: '高' }[quality];
  console.log(`画质：${quality}（${qualityFrom}；显卡 ${gpu.name || '?'}；判定 ${gpu.why}）。可在地址后加 ?quality=low|medium|high 指定，?quality=auto 恢复自动。`);
  if ($('loading-note')) $('loading-note').textContent = `画质：${label}（${qualityFrom} · ${short}）`;
}
// 低配档的草：在原作的稀草环上再稀一档——中圈和外圈每丛更宽、数量更少（覆盖范围不变）
const TOWN_LITE_RINGS = LITE_RINGS.map((r) => (r.name === 'near' ? r : { ...r, cell: r.cell * (r.name === 'mid' ? 1.22 : 1.38), width: r.width * (r.name === 'mid' ? 1.2 : 1.35) }));
// ?legacy=1：关掉这一轮的几项渲染优化（画的顺序、空转的合成遍、云的细条、矩阵缓存），对比画面用
const legacy = params.get('legacy') === '1';
// 显卡干完手上的活再给下一片（核显上重活必须切片，见 src/lib/gpu.js）
const gpuWait = () => gpuDone(renderer);

// （趁显卡还闲着先问一次：这是个要等显卡回话的同步调用，等它忙着编天空的 shader 时再问，页面要跟着僵两三秒）
renderer.capabilities.getMaxAnisotropy();
// 笔触图也趁现在画：它是 2D 画布画的，而浏览器的 2D 画布也走显卡进程——等显卡忙起来再画，同样要干等两秒
const strokesTexture = createStrokes(renderer);

// 渲染倍率：?dpr= 指定；否则高/中档最多 1.5，低档 0.8（核显的像素最贵）
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

// ---- 天空：原作那一套（云一次画进 cubemap，远山画成贴条） -----------------------------------------------------
// （最先开工：它不靠地形，显卡编它的 shader、画它的时候，CPU 正好去烘地面、盖城市）
mark('sky-parts');
const skyParts = createSkyParts(renderer, {
  cloudSize: high ? 2048 : medium ? 1024 : 512,
  cloudSteps: high ? 240 : medium ? 200 : 150,
  // 云每帧重画一小条（跟着钟点换光、慢慢翻涌）。条切细：2048 的云图一条 1/8 面是五十万条光线，
  // 核显上一帧要四十多毫秒；切成 1/32 面，一轮多花几秒，云动得那么慢，看不出来。
  // 低档以前干脆不重画（云的光永远停在开局那一刻），现在也画，一条才八千个像素。
  liveClouds: true,
  cloudStrips: legacy ? 8 : high ? 32 : medium ? 16 : 32,
  backdropWidth: high ? 12288 : 4096,
  // 雪山：只在一个方向——北偏西，雪山小镇背后——占天边八分之一（45°），别的方向一点不动，还是原作的远山。
  // 它是画在天边的（和原作那两座大峰同一个配方、同一种画法），隔着十八公里的空气：
  // 近处的草坡、中间的绿丘、云带、再后面才是它——远近的层次靠这个，不靠把一座白山堆在眼前。
  snowPeak: { at: [-18.4, -1.6], broad: 20, tall: 3.5, lower: 1.25, width: 45 },
});
// （云和远山的 shader 是整个游戏里最重的两个：编译放在后台，画的时候切成条，条与条之间等显卡喘气——
//   一口气画完在核显上会让显卡好几秒不回话，系统就把驱动重置了）
const skyReady = (async () => {
  // （两套 shader 一起交给显卡驱动去编，它有自己的线程）
  await Promise.all([timed('sky:compile-clouds', skyParts.clouds.compile()), timed('sky:compile-backdrop', skyParts.backdrop.compile())]);
  await timed('sky:paint-backdrop', skyParts.backdrop.paintAsync(gpuWait));
  // 远山只画这一次：画它用的那张高度图可以还给显卡了
  skyParts.backdrop.release();
})();

// ---- 场地：草和地面（沿用 src/lib，只把地形函数换成这座城市） -------------------------------------------------
// 和原作一样，地面贴图是 1 m 一个纹素：草下面那张画（笔触、湿痕、裸土）全靠它
// 整张可走的地图（±1024 m）都在场地里：哪儿都有草，哪儿的地都是同一张
mark('bake-ground');
const EXTENT = 2048;
// （场地的中心只有一个：烘焙和 createField 必须用同一个，否则草、路、房子会错开几十米）
const CENTRE = [0, 0];
const GROUND = { extent: EXTENT, extentRes: lite ? 768 : 1024, centre: CENTRE };
const bakeProgress = (p) => {
  $('loading-bar').style.width = `${Math.round((0.05 + p * 0.3) * 100)}%`;
};
/** 地面烘焙分给几个 worker（src/town/bake.worker.js）；开不了 worker 就还在页面线程上分片算 */
const bakeInWorkers = ({ extent, extentRes, centre }) =>
  new Promise((resolve, reject) => {
    // （留两个核给显卡驱动编 shader：它这时候正在后台编天空那两个大的）
    const count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
    const heights = new Float32Array(extentRes * extentRes);
    const map = new Uint8Array(extentRes * extentRes * 4);
    const BAND = 16;
    let next = 0;
    let done = 0;
    const workers = [];
    const stop = (err) => {
      for (const w of workers) w.terminate();
      if (err) reject(err);
      else resolve({ heights, map });
    };
    const give = (w) => {
      if (next >= extentRes) return;
      const from = next;
      next = Math.min(extentRes, next + BAND);
      w.postMessage({ extent, extentRes, centre, from, to: next });
    };
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('./bake.worker.js', import.meta.url), { type: 'module' });
      workers.push(w);
      w.onerror = (e) => stop(new Error(e.message || 'bake worker'));
      w.onmessage = ({ data }) => {
        heights.set(data.heights, data.from * extentRes);
        map.set(data.map, data.from * extentRes * 4);
        done += data.to - data.from;
        bakeProgress(done / extentRes);
        if (done >= extentRes) stop();
        else give(w);
      };
      give(w);
    }
  });
const baked = await timed('bake', async () => {
  if (params.get('worker') !== '0' && window.Worker) {
    try {
      return await bakeInWorkers(GROUND);
    } catch (e) {
      console.warn('烘焙 worker 开不了，改在页面线程上算', e);
    }
  }
  return bakeGround({ ...GROUND, heightAt: plan.heightAt, paint: plan.paint }, bakeProgress);
});
await setProgress(0.4, '正在铺路…');

mark('field');
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
  // 核显：每格一朵花（原来两朵）——花丛的三角是草的好几倍，九十五万降到四十七万
  flowerSubs: lite ? 1 : 2,
  density: high ? 1 : medium ? 0.7 : 0.5,
  height: 0.5,
  seed: 7,
});
scene.add(field.group);
// 地面的片元是全场最贵的（十几次采样加两层笔触）。让它排在房子、树、草之后画：
// 被挡住的像素深度测试直接丢掉，不用算。都是不透明的，画出来的图一样。
if (!legacy) field.ground.mesh.renderOrder = 6;
// 夜有多深（0 白天，1 深夜）：灯和窗读它
field.uniforms.uNight = { value: 0 };
// 这是一座走在里面的城：房子带上街景画里才有的东西——木构架、爬藤、窗台花箱（src/valley/village.js）
field.uniforms.uTown = { value: 1 };
// 草的绿调深一档（?grass=0 是原作的浅度，对比用）：晴天的大太阳底下，草地用深一点的那几种绿来调，颜色才沉得住
field.uniforms.uMeadowDeep.value = Number(params.get('grass') ?? 0.2);
// 屋里的剖面：人站的地方，和人→镜头的方向（interior 的墙读它）
field.uniforms.uCut = { value: new THREE.Vector4() };

mark('strokes-slope');
// ---- 草地下面的"画"：笔触、坡向、眼点（这三样原作有、上一版漏了） -------------------------------------------
{
  // 笔触：一撮撮浅一点/深一点的绿，红通道是明暗，蓝通道是石头
  field.uniforms.tStrokes.value = strokesTexture;
  // 核显：各向异性过滤封顶（地面那几张图每个像素要采好几次）
  if (lite) {
    field.uniforms.tStrokes.value.anisotropy = Math.min(4, field.uniforms.tStrokes.value.anisotropy);
    for (const u of ['tSoil', 'tSoilN', 'tDirt', 'tDirtN']) field.ground.uniforms[u].value.anisotropy = 2;
  }
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

// ---- 城市 ------------------------------------------------------------------------------------------------------
mark('albedo');
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
mark('plants');
await setProgress(0.48, '正在铺野花…');
// 手绘植物图集（139 种花 / 110 种树 / 8 个物件）。?plants=0 退回程序化花丛。
let plants = null;
if (params.get('plants') !== '0') {
  try {
    plants = await loadPlantAtlases('./textures/plants/', lite ? { maxSize: 1024, anisotropy: 2 } : {});
    console.log('植物图集：', Object.entries(plants).map(([k, v]) => `${k} ${v.reduce((n, p) => n + p.sprites.length, 0)} 个/${v.length} 页`).join('  '));
  } catch (e) {
    console.warn('植物图集载入失败，退回程序化花丛', e);
  }
}
mark('city');
await setProgress(0.5, '正在盖房子…');
// 精模试点（public/models3：Blender 里重绘过的房子）。默认不开——它们和周围的房子大小、画法都不统一；
// ?models=12 才把家门口和 AI 小镇的十二栋换上（看效果用）。
let modelList = [];
if (Number(params.get('models') ?? 0) > 0) {
  try {
    const res = await fetch('./models3/_manifest.json');
    if (res.ok) modelList = (await res.json()).items.filter((r) => r.glb).slice(0, Number(params.get('models'))).map((r) => r.glb);
  } catch (e) {
    console.warn('精模清单读不到，照旧画', e);
  }
}
// 房屋套件（public/models4：Blender 里建的吉卜力风房子，实例化）。高、中画质用它，房子也多五倍；
// 低画质和 ?kit=0 还是原来画出来的房子。
let kit = null;
if (!lite && params.get('kit') !== '0') {
  try {
    kit = await loadKitManifest('./models4/');
  } catch (e) {
    console.warn('房屋套件读不到，照旧画', e);
  }
}
const city = createCity(field.uniforms, field, {
  plants,
  kit,
  models: kit ? [] : modelList,
  // 路面默认用程序化的手绘石板（新贴图版过曝、像照片）；?roadtex=1 才换贴图
  roadTex: params.get('tex') !== '0' && params.get('roadtex') === '1',
  cards: high ? 1 : medium ? 0.7 : 0.4,
  treeNear: high ? 150 : medium ? 110 : 70,
  treeFar: high ? 760 : medium ? 560 : 340,
  density: high ? 1 : medium ? 0.85 : 0.6,
});
scene.add(city.group);
if (city.modelSlots.length) {
  try {
    const fine = await timed('models', loadTownModels(field.uniforms, city.modelSlots, plan.heightAt));
    scene.add(fine);
    console.log('精模：', JSON.stringify(fine.userData.stats));
  } catch (e) {
    console.warn('精模没载成：那几栋房子这次是空的（?models=0 可以先关掉）', e);
  }
}
let rig = null; // 会动的模型（车、船）
let ridden = null; // 正骑着的那一件 { model, it }
if (kit && city.kitHouses.length) {
  try {
    const houses = await timed('kit', createKitHouses(field.uniforms, kit, city.kitHouses, plan.heightAt));
    scene.add(houses);
    rig = houses.userData.rig;
    console.log('房屋套件：', JSON.stringify(houses.userData.stats));
  } catch (e) {
    console.warn('房屋套件没载成：房子这次是空的（?kit=0 可以先关掉）', e);
  }
}
if (city.propSlots.length) {
  try {
    const props = await timed('props', loadTownModels(field.uniforms, city.propSlots, plan.heightAt, { ink: false, srgbFix: true }));
    scene.add(props);
    console.log('街具：', JSON.stringify(props.userData.stats));
  } catch (e) {
    console.warn('街具没载成', e);
  }
}
mark('life-farground');
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

mark('interior');
await setProgress(0.62, '正在种树…');
const interior = createInterior(field.uniforms);
indoorScene.add(interior.group);

// ---- 收尾：笔触 + 墨线。笔刷强度默认 3（和原作 high 一样），?paint=0 关掉 --------------------------------
mark('frame');
const frame = createFrame(renderer, field, { samples: high ? 4 : medium ? 2 : 0, bloom: 0.1 });
const paintWas = Number(params.get('paint') ?? (high ? 3 : medium ? 2 : 1));
frame.paint = paintWas;
if (legacy) frame.skipIdle = false;
let paintNow = paintWas;

// ---- 主角 ------------------------------------------------------------------------------------------------------
mark('whale');
await setProgress(0.78, '小鲸鱼正在起床…');
const arts = await loadWhalechan(field.uniforms, './figures/');
const whale = createWhalechan(field.uniforms, arts);
scene.add(whale.group);
whale.setPos(plan.START[0], plan.START[1]);

// ---- 相机、走路 ------------------------------------------------------------------------------------------------
const cam = createCamera(camera, canvas, document.body);
// 室外：镜头不穿进房子（细杆子不算，免得一路抖）
const bigBoxes = city.colliders.filter((c) => c.hw > 1.2 && c.hd > 1.2);
// 建筑投影体：所有房子、地标、高架墩与大亭台，烘进 tShade 的 G 通道（定向投影 + 墙脚接触 AO）
const shadowCasters = city.colliders.filter((c) => !c.off && (c.top ?? 0) >= 2.0 && c.hw >= 0.85 && c.hd >= 0.85);
cam.obstacles = () => (indoor ? null : bigBoxes);
let indoor = false;
let seated = null; // { x, z, yaw, lookAt: {x,y,z}, kind }
const outdoorPos = { x: plan.START[0], z: plan.START[1] };
const outdoorDoor = { x: 0, z: -4.2 }; // 家门外站的地方（房子在 z=-16，门朝南）
cam.update(0.016, whale.state, plan.heightAt);
// 碰撞盒按室内/室外各一套；人也细一点（真人肩宽 ≈ 0.6 m）
const mover = createMover({ colliderList: () => (indoor ? interior.colliders : city.colliders), groundAt: (x, z) => (indoor ? interior.groundAt(x, z) : plan.heightAt(x, z)) });

// ---- 界面 ------------------------------------------------------------------------------------------------------
// ---- 粒子和天气 -------------------------------------------------------------------------------------------------
mark('particles-weather');
const particles = createParticles(field.uniforms, lite ? 1400 : 2600);
scene.add(particles.mesh);
const weather = createWeather({ field, frame, particles, lite, ignite: (x, z, r) => field.ignite(x, z, r) });
scene.add(weather.group);
if (params.get('weather')) weather.set(params.get('weather'), { immediate: true });
let nightNow = 0;

const hud = createHud();
mark('minimap');
await setProgress(0.86, '正在画地图…');
const bakedMap = bakeMinimap();
const minimap = createMinimap($('minimap'), bakedMap);
minimap.setInteractables(city.interactables);

// 图集里的鱼和作物（界面图标、钓鱼结果用）
mark('game');
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
  metroStops: plan.METRO_STOPS,
  railStations: plan.RAIL_STATIONS,
  onTravel(st) {
    // 高铁站：city.js 给每个站补了一个地面上的出站口 exit；公交、地铁站就落在站牌边上
    if (st.exit) whale.setPos(st.exit[0], st.exit[1]);
    else whale.setPos(st.x + 1, st.z - 3);
  },
  onRide(vehicle, it) {
    // 交通工具状态保存在 game.state 中；这里让相机轻微拉远，保证骑乘时画面舒展。
    cam.want = vehicle ? Math.max(cam.want, 9.5) : Math.min(cam.want, 7.5);
    // 骑的是地上那一件模型：上车时它的碰撞盒让开，跟着人走；下车时停在脚边，人站到旁边
    const model = it?.model;
    if (!rig || !model?.slot) return;
    const st = whale.state;
    if (vehicle) {
      ridden = { model, it };
      if (model.col) model.col.off = true;
      st.lift = /bicycle|bike|scooter/.test(it.vehicle) ? 0.42 : 0.5;
    } else {
      ridden = null;
      st.lift = 0;
      const gy = Math.max(plan.walkAt(st.x, st.z), mover.floorAt(st.x, st.z, st.y));
      rig.move(model, st.x, gy, st.z, st.yaw);
      it.x = st.x;
      it.z = st.z;
      if (model.col) Object.assign(model.col, { x: st.x, z: st.z, c: Math.cos(st.yaw), s: Math.sin(st.yaw), ty: undefined, base: gy, off: false });
      mover.dirty();
      st.x += Math.cos(st.yaw) * 0.95;
      st.z -= Math.sin(st.yaw) * 0.95;
    }
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
      whale.setIndoor(true);
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
      whale.setIndoor(false);
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
mark('farming-glow');
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
  for (let i = 0; i < 12; i++) flies.push([plan.HOME[0] + 2 + rnd() * 8, plan.heightAt(plan.HOME[0] + 4, plan.HOME[1]) + 0.7 + rnd(), plan.HOME[1] - 6 + rnd() * 10]);
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
  // 清晨（5:00~9:30）：清透淡粉蓝朝霞 + 轻薄晨雾，与傍晚暖金黄昏区分开
  let morning = 0;
  if (clock >= 5.0 && clock <= 9.5) {
    morning = clock < 6.8 ? Math.min(1, (clock - 5.0) / 1.8) : Math.max(0, 1 - (clock - 6.8) / 2.7);
  }
  return { hour, night, morning };
};
const MORNING_FOG = new THREE.Color(0.68, 0.78, 0.9);
const syncSky = () => {
  const clock = frozenClock ?? (game.state.minutes / 60) % 24;
  const { hour, night, morning } = dayLight(clock);
  if (sky && Math.abs(hour - skyHour) > 0.02) {
    const first = skyHour < 0;
    skyHour = hour;
    sky.setHour(hour, !first);
    // 树影与建筑定向投影跟着太阳走（太阳挪了一刻钟以上才重烘）
    if (first || Math.abs(hour - shadeHour) > 0.25) {
      shadeHour = hour;
      city.woods.cast(field.uniforms.uSunDir.value, shadowCasters);
    }
  }
  if (sky) {
    frame.exposure = sky.exposure * (1 - 0.25 * night);
    // 夜里泛光开大一点：灯、灯串、萤火虫、星月会晕开
    frame.bloom = 0.1 + 0.16 * night;
    frame.grade.set(1 - 0.8 * night, 1 - 0.68 * night, 1 - 0.36 * night);
    field.uniforms.uNight.value = night;
    sky.uniforms.uMorning.value = morning;
    nightNow = night;
    // 天气在这一刻的天光上再调一层（屋里有自己的灯，不调）
    if (!indoor) {
      weather.apply();
      if (morning > 0.01 && night < 0.5) {
        // 清晨微薄晨雾与清透冷暖：比下午多一点蓝白空气感
        const m = morning * (1 - night);
        field.uniforms.uFogDensity.value *= 1 + 0.28 * m;
        field.uniforms.uFogColor.value.lerp(MORNING_FOG, 0.18 * m);
        frame.grade.x *= 1 - 0.02 * m;
        frame.grade.y *= 1 + 0.01 * m;
        frame.grade.z *= 1 + 0.035 * m;
      }
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
mark('sky');
await setProgress(0.92, '正在画云…');
// 天穹现在就能建（它只要那几张贴图的"壳"）；云和远山还在后台一条一条地画，画完之前不撤加载层。
// 云按开局那一刻的光画一次（以前先按 15 点画一遍、马上又按真正的钟点重画一遍）。
const startHour = dayLight(frozenClock ?? (game.state.minutes / 60) % 24).hour;
skyParts.drawn = startHour; // （别让 setHour 在这里同步地整张重画）
const skyPainted = (async () => {
  await timed('sky:wait', skyReady);
  await timed('sky:paint-clouds', skyParts.lightAsync(startHour, gpuWait));
})().catch((e) => console.warn('天空没画成', e));
sky = createSky(renderer, field, { parts: skyParts });
{
  // 每次天光重算之后，让天气记下新的基准光
  const setHour = sky.setHour.bind(sky);
  sky.setHour = (h, soft) => {
    setHour(h, soft);
    weather.capture(sky);
  };
}
// 天最后画（它在最远处）：先画的话，被房子、树、地挡住的那些像素也要白算一遍天
if (!legacy) sky.mesh.renderOrder = 7;
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
mark('bigmap-actions-photo');
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
  for (const c of CROP ? [] : []) void c;
}

// ---- 动作 ------------------------------------------------------------------------------------------------------
actions = createActions({ rig, whale, mover, cam, game, hud, woods: city.woods, particles, field, plan, weather, plants, shared: field.uniforms, scene });
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
    place: $('stat-place').textContent || '玉海城',
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
    // 骑着的车跟着人走
    if (ridden && rig) rig.move(ridden.model, whale.state.x, whale.state.y, whale.state.z, whale.state.yaw);
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
  if (!indoor) field.uniforms.uWalker.value.set(whale.state.x, whale.state.z, 0.55 * (1 - nightNow), 2.2 * (1 - nightNow));
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
    minimap.draw(0.1, { x: whale.state.x, z: whale.state.z, yaw: whale.state.yaw, waypoint: bigmap.waypoint, place: indoor ? '家里' : undefined });
    const wp = bigmap.waypoint;
    $('minimap-mode').textContent = wp ? `→ ${wp.name} ${Math.round(Math.hypot(wp.x - whale.state.x, wp.z - whale.state.z))} 米` : 'M 大地图';
  }
}

// 动态分辨率（?dyn=0 关）：低配档默认开。每 30 帧看一次平均帧时间，慢了就少画点像素，快了再加回来
// 默认对所有设备启用动态分辨率，忙碌街区会自动降采样，空旷区域再恢复清晰度。
const dyn = params.get('dyn') !== '0';
const baseRatio = renderer.getPixelRatio();
let ratioK = 1;
let frames = 0;
let spent = 0;
const loop = (now) => {
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
    // 慢了：按"像素数正比于倍率的平方"一步降到位（最多一次降两成），不用一小格一小格地熬；快了再慢慢加回来
    const want = avg > 38 ? ratioK * Math.max(0.8, Math.sqrt(34 / avg)) : avg < 24 ? ratioK + 0.05 : ratioK;
    const next = Math.min(1, Math.max(lite ? 0.5 : 0.55, want));
    if (Math.abs(next - ratioK) > 0.02 && !photo.on) {
      ratioK = next;
      renderer.setPixelRatio(baseRatio * ratioK);
      fitView();
    }
  }
};

// ---- 收尾 ------------------------------------------------------------------------------------------------------
mark('compile-outdoor');
await setProgress(0.97, '正在调颜料…');
// 静物的矩阵不再每帧重算（见 src/lib/gpu.js）
if (!legacy) {
  lazyMatrices(scene);
  lazyMatrices(indoorScene);
}
// 先把 shader 和贴图、顶点都送进显卡（切成小份，份与份之间等显卡），再开始画第一帧：
// 以前是先开了主循环，第一帧里一口气编译全部 shader、上传全部贴图，核显上页面要僵住好几秒
await frame
  .compile(scene, camera, (done, of, warming) => {
    $('loading-bar').style.width = `${Math.round((warming ? 0.985 + 0.015 * (done / of) : 0.97 + 0.015 * (done / of)) * 100)}%`;
  })
  .catch((e) => console.warn('compile outdoor', e));
mark('sky-wait');
await skyPainted;
mark('warm');
await frame
  .warm(scene, camera, gpuWait, (done, of) => {
    $('loading-bar').style.width = `${Math.round((0.985 + 0.015 * (done / of)) * 100)}%`;
  })
  .catch((e) => console.warn('warm', e));
mark('first-frame');
await setProgress(1, '到了');
last = performance.now();
tick(0);
await gpuWait();
last = performance.now();
renderer.setAnimationLoop(loop);
// 屋里的那一套不急：进了游戏再在后台编译（进屋之前早就好了）
setTimeout(() => frame.compile(indoorScene, camera).catch((e) => console.warn('compile indoor', e)), 1500);
mark('done');
started = true;
safeStore.set('tg-starting', null);
$('loading').classList.add('done');
setTimeout(() => !failed && $('loading')?.remove(), 700);
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
  quality,
  gpu,
  ready: true,
};
