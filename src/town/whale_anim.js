// 小鲸鱼（3D 骨骼模型）的完整动作系统与二级物理（头发、呆毛、裙摆、鲸鱼耳、鲸鱼尾）。
// 融合了 dsh-pet 风格的灵动待机小动作（歪头、摇尾、蹦跳、伸懒腰）与所有玩法的专属动作：
// 走 / 快走 / 跑 / 跳 / 二段跳 / 落地 / 蹚水 / 游泳 / 潜水 / 钓鱼（甩竿/等待/拉竿）/ 爬树 / 滑雪 / 冲浪 /
// 划船 / 放风筝 / 晒太阳 / 睡觉 / 坐下 / 骑车 / 点火 / 种菜 / 浇水 / 采摘 / 做饭 / 吃饭 / 祈祷 / 看书 / 挥手 / 打工 / 庆祝 / 拍照。
import * as THREE from 'three';

const DEG = Math.PI / 180;
const _e = new THREE.Euler(0, 0, 0, 'XYZ');
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

/** 动作名称中文标签（用于调试与拍照/动作提示） */
export const ACTION_LABELS = {
  idle: '待机',
  walk: '行走',
  fastWalk: '快速行走',
  run: '奔跑',
  jump: '跳跃',
  doubleJump: '二段跳',
  fall: '下落',
  land: '落地',
  wade: '蹚水',
  stairs: '上楼梯',
  swim: '游泳',
  dive: '潜水',
  fish_cast: '甩竿',
  fish: '钓鱼',
  fish_bite: '拉竿',
  climb: '爬树',
  ski: '滑雪',
  surf: '冲浪',
  boat: '划船',
  kite: '放风筝',
  lie: '晒太阳',
  sleep_start: '打哈欠入睡',
  sleep: '睡觉',
  sleep_end: '醒来伸懒腰',
  sit: '坐着',
  ride: '骑行',
  drive: '驾驶',
  push: '推车',
  fire: '点火',
  farm_plant: '种植',
  farm_water: '浇水',
  gather: '采摘',
  cook: '做饭',
  eat: '吃饭',
  pray: '祈祷',
  read: '阅读',
  wave: '挥手',
  work: '打工',
  cheer: '欢呼',
  happy: '开心蹦跳',
  dance: '跳舞',
  think: '思考托腮',
  shy: '害羞',
  dizzy: '晕乎乎',
  angry: '生气跺脚',
  shock: '惊讶',
  float: '飘浮',
  photo: '拍照',
};

/** dsh-pet 招牌表情与互动动作清单（快捷键 1~9 或动作栏触发） */
export const PET_EMOTES = [
  { id: 'wave', label: '挥手', dur: 1.8 },
  { id: 'happy', label: '开心蹦跳', dur: 2.0 },
  { id: 'dance', label: '跳舞', dur: 3.2 },
  { id: 'think', label: '思考', dur: 2.8 },
  { id: 'sleep', label: '打盹', dur: 3.6 },
  { id: 'shy', label: '害羞', dur: 2.4 },
  { id: 'angry', label: '生气跺脚', dur: 2.0 },
  { id: 'dizzy', label: '晕乎乎', dur: 2.4 },
  { id: 'shock', label: '惊讶', dur: 1.5 },
];

/**
 * 为已载入的 33 骨骼小鲸鱼骨架创建动作驱动器。
 * @param {THREE.Object3D} model glTF 场景根节点
 * @param {THREE.AnimationClip[]} gltfClips GLB 内烘焙的基础动画片段
 */
export function createWhaleAnimator(model, gltfClips = []) {
  const bones = {};
  const restQuat = {};
  const restPos = {};
  model.traverse((o) => {
    if (o.isBone) {
      bones[o.name] = o;
      restQuat[o.name] = o.quaternion.clone();
      restPos[o.name] = o.position.clone();
    }
  });

  // 保留一个标准 AnimationMixer 供外部调试/工具检查
  const mixer = new THREE.AnimationMixer(model);
  const clips = Object.fromEntries(gltfClips.map((c) => [c.name, c]));

  // 当前目标姿态表：boneName -> [rxDeg, ryDeg, rzDeg]
  const targets = {};
  const curQuat = {};
  for (const name of Object.keys(bones)) {
    targets[name] = [0, 0, 0];
    curQuat[name] = restQuat[name].clone();
  }
  const hipsOffset = new THREE.Vector3();
  const targetHipsOffset = new THREE.Vector3();

  // 状态与计时
  let current = 'idle';
  let phase = 0;
  let stateTime = 0;
  let idleVariant = 0;
  let idleNextSwitch = 4.5;
  let oneshot = null; // { name, time, duration }
  let landTimer = 0;
  let prevAir = false;
  let prevYaw = 0;
  let smoothTurn = 0;
  let smoothSpeed = 0;
  let smoothVy = 0;

  // 二级弹簧状态（头发、裙摆、尾巴、呆毛跟随惯性与微风）
  const spring = {
    hairPitch: 0,
    hairRoll: 0,
    tailYaw: 0,
    ahogePitch: 0,
    ahogeRoll: 0,
  };

  const resetTargets = () => {
    for (const name in targets) {
      const t = targets[name];
      t[0] = t[1] = t[2] = 0;
    }
    targetHipsOffset.set(0, 0, 0);
  };

  const set = (name, rx, ry = 0, rz = 0) => {
    const t = targets[name];
    if (!t) return;
    t[0] = rx;
    t[1] = ry;
    t[2] = rz;
  };

  const add = (name, rx, ry = 0, rz = 0) => {
    const t = targets[name];
    if (!t) return;
    t[0] += rx;
    t[1] += ry;
    t[2] += rz;
  };

  /** 触发一个一次性交互动作（种菜、浇水、采摘、做饭、吃饭、祈祷、挥手、欢呼、点火、甩竿等） */
  const trigger = (name, duration = 1.25) => {
    oneshot = { name, time: 0, duration };
  };

  /** 通用步态生成器（参考 dsh-pet 活力 Q 版大摆臂步态：走 / 快走 / 跑 / 蹚水） */
  const evalGait = (ph, { leg, knee, arm, elbow = 24, shoulderTwist = 10, lean, bob, tail, hair, highStep = 0 }) => {
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const kl = Math.max(0, knee * Math.sin(ph + 0.7)) + highStep * Math.max(0, s);
    const kr = Math.max(0, knee * Math.sin(ph + Math.PI + 0.7)) + highStep * Math.max(0, -s);

    set('hips', -lean * 0.35, 5.5 * c, 2.8 * s);
    set('spine', -lean * 0.45, -4.0 * c, -1.8 * s);
    set('chest', -lean * 0.25, -4.5 * c, 0);
    set('head', lean * 0.72, 3.5 * c, 3.2 * s);
    set('ahoge', hair * 0.45 + 10 * Math.sin(ph * 2), 0, 7 * s);
    set('ear_l', 0, 0, 7.0 * Math.abs(s));
    set('ear_r', 0, 0, -7.0 * Math.abs(s));

    set('thigh_l', leg * s + highStep * 0.5 * Math.max(0, s), 0, 2.5);
    set('thigh_r', -leg * s + highStep * 0.5 * Math.max(0, -s), 0, -2.5);
    set('calf_l', -kl, 0, 0);
    set('calf_r', -kr, 0, 0);
    set('foot_l', 10 * c, 0, 0);
    set('foot_r', -10 * c, 0, 0);

    // 明显、有力的摆臂：肩膀随躯干联动 + 大臂前后大幅摆动 + 小臂前摆自然屈肘
    set('shoulder_l', 0, -shoulderTwist * s, 3 * Math.abs(s));
    set('shoulder_r', 0, -shoulderTwist * s, -3 * Math.abs(s));
    set('upperarm_l', -arm * s, 0, 14 + lean * 0.45 + highStep * 0.35 + 4 * Math.abs(s));
    set('upperarm_r', arm * s, 0, -14 - lean * 0.45 - highStep * 0.35 - 4 * Math.abs(s));
    set('lowerarm_l', elbow + elbow * 0.85 * Math.max(0, -s), 0, -6);
    set('lowerarm_r', elbow + elbow * 0.85 * Math.max(0, s), 0, 6);

    set('skirt_f', 8 + 7 * Math.abs(s), 0, 0);
    set('skirt_b', -10 - 8 * Math.abs(s), 0, 0);
    set('skirt_l', 0, 0, -6 * s);
    set('skirt_r', 0, 0, -6 * s);

    set('hair_b1', -hair - 5 * Math.abs(s), 0, 4.5 * s);
    set('hair_b2', -hair * 0.7 - 8 * Math.sin(ph * 2 - 0.5), 0, 6.0 * s);
    set('hair_l', -hair * 0.4, 0, 4 * s);
    set('hair_r', -hair * 0.4, 0, 4 * s);

    set('tail_1', 0, tail * s, 6 * c);
    set('tail_2', 0, tail * 1.2 * Math.sin(ph - 0.55), 8 * s);

    // Blender Z-up -> glTF Y-up: hips local Y is up!
    targetHipsOffset.set(0, bob * Math.abs(s), 0);
  };

  /** 根据动作名评估目标骨骼角度 */
  const evaluatePose = (pose, t, ctx) => {
    resetTargets();
    const s1 = Math.sin(t * 2.1);
    const c1 = Math.cos(t * 2.1);
    const s2 = Math.sin(t * 4.2);

    switch (pose) {
      case 'walk':
        evalGait(phase, { leg: 28, knee: 34, arm: 38, elbow: 18, shoulderTwist: 10, lean: 6, bob: 0.030, tail: 14, hair: 8 });
        break;
      case 'fastWalk':
        evalGait(phase, { leg: 36, knee: 46, arm: 52, elbow: 24, shoulderTwist: 14, lean: 11, bob: 0.044, tail: 20, hair: 14 });
        break;
      case 'run':
        evalGait(phase, { leg: 46, knee: 58, arm: 68, elbow: 32, shoulderTwist: 18, lean: 18, bob: 0.062, tail: 26, hair: 22 });
        break;
      case 'wade':
        evalGait(phase, { leg: 28, knee: 40, arm: 40, elbow: 22, shoulderTwist: 12, lean: 7, bob: 0.032, tail: 16, hair: 8, highStep: 14 });
        break;
      case 'stairs': {
        // 上楼梯：明显高抬腿迈步 + 躯干前倾 + 协调大摆臂（持续连贯不僵硬）
        evalGait(phase * 1.15, { leg: 46, knee: 72, arm: 56, elbow: 32, shoulderTwist: 16, lean: 18, bob: 0.075, tail: 20, hair: 14, highStep: 36 });
        break;
      }

      case 'jump': {
        const up = THREE.MathUtils.clamp((ctx.vy ?? 0) * 0.18, -1, 1);
        set('hips', -4 + up * 6, 0, 0);
        set('spine', 4 * up, 0, 0);
        set('head', 6 * up, 0, 0);
        set('thigh_l', 28 + 8 * up, 0, 6);
        set('thigh_r', 16 + 4 * up, 0, -6);
        set('calf_l', -42 - 8 * up, 0, 0);
        set('calf_r', -26 - 6 * up, 0, 0);
        set('upperarm_l', 14 + 6 * up, 0, 32 + 8 * up);
        set('upperarm_r', 14 + 6 * up, 0, -32 - 8 * up);
        set('lowerarm_l', 14, 0, 0);
        set('lowerarm_r', 14, 0, 0);
        set('skirt_f', 12, 0, 0);
        set('skirt_b', -12, 0, 0);
        set('skirt_l', 0, 0, 10);
        set('skirt_r', 0, 0, -10);
        set('hair_b1', -14 + 8 * up, 0, 0);
        set('hair_b2', -14 + 10 * up, 0, 0);
        set('tail_1', 0, 16 * Math.sin(t * 9), 12);
        set('ear_l', 0, 0, 8);
        set('ear_r', 0, 0, -8);
        break;
      }

      case 'doubleJump': {
        // 二段跳：灵动空中 360° 旋身跃起！
        const p = Math.min(1, t / 0.52);
        const spin = p * 360;
        const tuck = Math.sin(p * Math.PI);
        set('hips', -8 * tuck, spin, 0);
        set('spine', -6 * tuck, 0, 0);
        set('head', 8 * tuck, 0, 0);
        set('thigh_l', 34 * tuck + 14, 0, 8);
        set('thigh_r', 34 * tuck + 14, 0, -8);
        set('calf_l', -48 * tuck - 14, 0, 0);
        set('calf_r', -48 * tuck - 14, 0, 0);
        set('upperarm_l', 14, 0, 38);
        set('upperarm_r', 14, 0, -38);
        set('skirt_f', 16, 0, 0);
        set('skirt_b', -16, 0, 0);
        set('skirt_l', 0, 0, 14);
        set('skirt_r', 0, 0, -14);
        set('hair_b1', -20, 0, 12);
        set('hair_b2', -18, 0, 18);
        set('tail_1', 0, 22, 16);
        set('ahoge', 12, 0, 14);
        break;
      }

      case 'fall': {
        const flutter = Math.sin(t * 9);
        set('hips', -6, 0, 0);
        set('spine', -4, 0, 0);
        set('head', 6, 0, 3 * flutter);
        set('thigh_l', 20 + 6 * flutter, 0, 5);
        set('thigh_r', 20 - 6 * flutter, 0, -5);
        set('calf_l', -30, 0, 0);
        set('calf_r', -30, 0, 0);
        set('upperarm_l', 10, 0, 34 + 6 * flutter);
        set('upperarm_r', 10, 0, -34 - 6 * flutter);
        set('skirt_f', 14, 0, 0);
        set('skirt_b', -14, 0, 0);
        set('hair_b1', -20, 0, 4 * flutter);
        set('hair_b2', -18, 0, 6 * flutter);
        set('tail_1', 0, 18 * flutter, 14);
        break;
      }

      case 'land': {
        const k = Math.sin(Math.min(1, t / 0.22) * Math.PI);
        set('hips', -8 * k, 0, 0);
        set('spine', -6 * k, 0, 0);
        set('head', 10 * k, 0, 0);
        set('thigh_l', 22 * k, 0, 4 * k);
        set('thigh_r', 22 * k, 0, -4 * k);
        set('calf_l', -30 * k, 0, 0);
        set('calf_r', -30 * k, 0, 0);
        set('upperarm_l', 8 * k, 0, 18 * k);
        set('upperarm_r', 8 * k, 0, -18 * k);
        set('ear_l', 0, 0, -10 * k);
        set('ear_r', 0, 0, 10 * k);
        set('ahoge', -14 * k, 0, 0);
        targetHipsOffset.set(0, -0.055 * k, 0);
        break;
      }

      case 'swim': {
        const spd = ctx.moving ? 5.6 : 2.6;
        const ph = t * spd;
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        set('hips', -(ctx.moving ? 30 : 16) - 4 * s, 0, 4 * c);
        set('head', (ctx.moving ? 22 : 10), 0, 3 * c);
        set('upperarm_l', 28 + 20 * s, 0, 28 + 18 * c);
        set('upperarm_r', 28 + 20 * s, 0, -28 - 18 * c);
        set('lowerarm_l', 16 + 10 * c, 0, 0);
        set('lowerarm_r', 16 + 10 * c, 0, 0);
        set('thigh_l', 16 * s, 0, 4);
        set('thigh_r', -16 * s, 0, -4);
        set('calf_l', -20 - 14 * c, 0, 0);
        set('calf_r', -20 + 14 * c, 0, 0);
        set('hair_b1', -18 - 5 * s, 0, 3 * c);
        set('hair_b2', -14 - 7 * c, 0, 5 * s);
        set('tail_1', 12 * s, 16 * c, 4);
        set('tail_2', 16 * Math.sin(ph - 0.6), 20 * c, 6);
        targetHipsOffset.set(0, 0.035 * s, 0);
        break;
      }

      case 'dive': {
        // 潜水：水平流线型海豚/小鲸鱼游姿，鲸鱼尾强力波浪摆动！
        const spd = ctx.moving ? 6.2 : 2.8;
        const ph = t * spd;
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        set('hips', -74 - 5 * s, 0, 3 * c);
        set('spine', -6 * Math.sin(ph - 0.4), 0, 0);
        set('head', 38 + 4 * c, 0, 0);
        set('upperarm_l', 34 + 14 * s, 0, 26 + 14 * c);
        set('upperarm_r', 34 + 14 * s, 0, -26 - 14 * c);
        set('lowerarm_l', 14, 0, 0);
        set('lowerarm_r', 14, 0, 0);
        set('thigh_l', 20 * Math.sin(ph - 0.8), 0, 3);
        set('thigh_r', 20 * Math.sin(ph - 0.8), 0, -3);
        set('calf_l', -22 - 14 * Math.sin(ph - 1.3), 0, 0);
        set('calf_r', -22 - 14 * Math.sin(ph - 1.3), 0, 0);
        set('tail_1', 20 * Math.sin(ph - 0.7), 12 * c, 0);
        set('tail_2', 26 * Math.sin(ph - 1.2), 16 * c, 0);
        set('hair_b1', -10 - 6 * s, 0, 0);
        set('hair_b2', -12 - 8 * Math.sin(ph - 0.7), 0, 0);
        set('skirt_f', 8, 0, 0);
        set('skirt_b', -8, 0, 0);
        targetHipsOffset.set(0, 0.14 + 0.04 * s, 0);
        break;
      }

      case 'fish_cast': {
        // 甩竿：先往后蓄力再向前挥出！
        const p = Math.min(1, t / 0.65);
        const swing = p < 0.4 ? -Math.sin((p / 0.4) * Math.PI * 0.5) : Math.cos(((p - 0.4) / 0.6) * Math.PI * 0.5) * -1 + 1.2 * Math.sin(((p - 0.4) / 0.6) * Math.PI);
        set('hips', -4 + swing * 6, -10 + swing * 16, 0);
        set('spine', -6 + swing * 12, 0, 0);
        set('head', 4, 0, 0);
        set('upperarm_r', 28 + swing * 32, 0, -24 - swing * 18);
        set('lowerarm_r', 22 + swing * 16, 0, 8);
        set('upperarm_l', 24 + swing * 14, 0, 14);
        set('tail_1', 0, 18 * swing, 8);
        break;
      }

      case 'fish': {
        // 钓鱼等待：双手持竿，微微前倾晃动，尾巴轻拍
        set('spine', -6 - 2 * s1, 0, 1.5 * c1);
        set('head', 4 + 2 * s1, 4 * Math.sin(t * 0.9), 2 * c1);
        set('upperarm_r', 44 + 4 * s1, 0, -14);
        set('lowerarm_r', 22 + 3 * s1, 0, 10);
        set('upperarm_l', 36 + 3 * s1, 0, 16);
        set('lowerarm_l', 24 + 3 * s1, 0, -10);
        set('thigh_l', 44, 0, 6);
        set('thigh_r', 44, 0, -6);
        set('calf_l', -42, 0, 0);
        set('calf_r', -42, 0, 0);
        set('skirt_f', 16, 0, 0);
        set('tail_1', 0, 14 * s1, 6);
        set('tail_2', 0, 18 * Math.sin(t * 2.1 - 0.5), 4);
        targetHipsOffset.set(0, -0.05, 0);
        break;
      }

      case 'fish_bite': {
        // 鱼咬钩了！往后猛拽拉竿！
        const tug = Math.sin(t * 20);
        set('hips', 12 + 4 * tug, 0, 3 * tug);
        set('spine', 10 + 5 * tug, 0, -3 * tug);
        set('head', -6, 0, 4 * tug);
        set('upperarm_r', 36 + 14 * tug, 0, -28 - 10 * tug);
        set('lowerarm_r', 32 + 12 * tug, 0, 10);
        set('upperarm_l', 32 + 12 * tug, 0, 24 + 8 * tug);
        set('lowerarm_l', 30 + 10 * tug, 0, -10);
        set('thigh_l', 46, 0, 7);
        set('thigh_r', 46, 0, -7);
        set('calf_l', -44, 0, 0);
        set('calf_r', -44, 0, 0);
        set('tail_1', 0, 24 * tug, 12);
        set('ahoge', 14 * tug, 0, 12 * tug);
        targetHipsOffset.set(0, -0.04, 0);
        break;
      }

      case 'climb': {
        const ph = ctx.moving ? t * 7.5 : t * 1.6;
        const s = ctx.moving ? Math.sin(ph) : 0.15 * Math.sin(ph);
        set('spine', -6, 0, 4 * s);
        set('head', 14, 0, -2 * s);
        set('upperarm_l', 44 + 20 * s, 0, 24);
        set('upperarm_r', 44 - 20 * s, 0, -24);
        set('lowerarm_l', 24, 0, 0);
        set('lowerarm_r', 24, 0, 0);
        set('thigh_l', 24 + 18 * s, 0, 6);
        set('thigh_r', 24 - 18 * s, 0, -6);
        set('calf_l', -28 - 14 * s, 0, 0);
        set('calf_r', -28 + 14 * s, 0, 0);
        set('tail_1', 0, 12 * s, 4);
        targetHipsOffset.set(0, 0.02 * Math.abs(s), 0);
        break;
      }

      case 'ski': {
        const carve = (ctx.steer ?? 0) * 18;
        const brake = ctx.brake ? 1 : 0;
        set('hips', -8 + brake * 14, carve * 0.4, carve * 0.7);
        set('spine', -18 + brake * 10, 0, carve * 0.5);
        set('head', 16, -carve * 0.3, -carve * 0.4);
        set('thigh_l', 26 + brake * 8, 0, 4 + brake * 8);
        set('thigh_r', 26 + brake * 8, 0, -4 - brake * 8);
        set('calf_l', -32 - brake * 8, 0, 0);
        set('calf_r', -32 - brake * 8, 0, 0);
        set('upperarm_l', 22, 0, 24 + brake * 14);
        set('upperarm_r', 22, 0, -24 - brake * 14);
        set('hair_b1', -22, 0, carve * 0.6);
        set('hair_b2', -18, 0, carve * 0.8);
        set('tail_1', 0, 16 * s1 + carve, 8);
        targetHipsOffset.set(0, -0.045, 0);
        break;
      }

      case 'surf': {
        const roll = (ctx.steer ?? 0) * 16;
        const trick = ctx.trick ? 1 : 0;
        set('hips', -6, -34, roll + 5 * s1);
        set('spine', -6, 12, -roll * 0.5 - 4 * s1);
        set('head', 5, 22, -roll * 0.3);
        set('thigh_l', 22 + trick * 16, 0, 10);
        set('thigh_r', 22 + trick * 16, 0, -10);
        set('calf_l', -26 - trick * 18, 0, 0);
        set('calf_r', -26 - trick * 18, 0, 0);
        set('upperarm_l', 12, 0, 36 + trick * 8 - 6 * s1);
        set('upperarm_r', 12, 0, -36 - trick * 8 - 6 * s1);
        set('hair_b1', -20, 0, 8 * s1 + roll * 0.5);
        set('hair_b2', -16, 0, 10 * s1);
        set('tail_1', 0, 18 * s1, 10);
        targetHipsOffset.set(0, -0.035, 0);
        break;
      }

      case 'boat': {
        // 划船：坐姿 + W/S 划桨动作
        const row = ctx.moving ? Math.sin(t * 5.0) : 0.15 * s1;
        set('spine', -6 - 10 * row, 0, 0);
        set('head', 4 + 6 * row, 4 * Math.sin(t * 0.8), 0);
        set('upperarm_l', 26 + 22 * row, 0, 22);
        set('upperarm_r', 26 + 22 * row, 0, -22);
        set('lowerarm_l', 22 + 12 * row, 0, 0);
        set('lowerarm_r', 22 + 12 * row, 0, 0);
        set('thigh_l', 56, 0, 6);
        set('thigh_r', 56, 0, -6);
        set('calf_l', -48, 0, 0);
        set('calf_r', -48, 0, 0);
        set('skirt_f', 18, 0, 0);
        set('tail_1', 0, 12 * s1, 6);
        targetHipsOffset.set(0, -0.08, 0);
        break;
      }

      case 'kite': {
        if (ctx.moving) {
          evalGait(phase, { leg: 30, knee: 36, arm: 24, lean: 8, bob: 0.035, tail: 16, hair: 12 });
        } else {
          set('spine', 3, 0, 2 * c1);
          set('tail_1', 0, 12 * s1, 6);
        }
        // 右手高举风筝线，微微抬头看风筝
        set('head', 14, -4, 3 * s1);
        set('upperarm_r', 30, 0, -38 - 5 * s1);
        set('lowerarm_r', 16, 0, -6);
        break;
      }

      case 'lie': {
        set('hips', 78, 0, 0);
        set('spine', -6 - 2 * s1, 0, 0);
        set('head', -10, 5 * Math.sin(t * 0.7), 0);
        set('upperarm_l', 14, 0, 24);
        set('upperarm_r', 14, 0, -24);
        set('thigh_l', 10 + 7 * Math.sin(t * 1.8), 0, 4);
        set('thigh_r', 6, 0, -4);
        set('calf_l', -14 - 8 * Math.sin(t * 1.8), 0, 0);
        set('calf_r', -8, 0, 0);
        set('tail_1', 0, 10 * s1, 0);
        targetHipsOffset.set(0, -0.14, 0);
        break;
      }

      case 'sleep_start': {
        // dsh-pet 睡觉第1段：打哈欠 + 缓缓趴下
        const p = Math.min(1, t / 0.9);
        const k = p * p * (3 - 2 * p);
        set('hips', 80 * k, 0, 12 * k);
        set('spine', -8 * k, 0, 6 * k);
        set('head', 14 * Math.sin(p * Math.PI) - 8 * k, 10 * k, 8 * k);
        set('upperarm_l', 28 * k, 0, 14);
        set('upperarm_r', 26 * k, 0, -14);
        targetHipsOffset.set(0, -0.16 * k, 0);
        break;
      }
      case 'sleep': {
        // dsh-pet 睡觉第2段：酣睡均匀呼吸
        const br = Math.sin(t * 1.35);
        set('hips', 80, 0, 12);
        set('spine', -8 - 3 * br, 0, 6);
        set('head', -8 + 2 * br, 10, 8);
        set('upperarm_l', 28, 0, 12);
        set('upperarm_r', 26, 0, -14);
        set('lowerarm_l', 24, 0, -8);
        set('lowerarm_r', 24, 0, 8);
        set('thigh_l', 24, 0, 4);
        set('thigh_r', 20, 0, -4);
        set('calf_l', -30, 0, 0);
        set('calf_r', -26, 0, 0);
        set('ear_l', 0, 0, -10 + 2 * br);
        set('ear_r', 0, 0, 10 - 2 * br);
        set('ahoge', -10 + 4 * br, 0, 6);
        set('tail_1', 0, 6 * br, -4);
        targetHipsOffset.set(0, -0.16, 0);
        break;
      }
      case 'sleep_end': {
        // dsh-pet 睡觉第3段：醒来伸大懒腰
        const p = Math.min(1, t / 1.0);
        const stretch = Math.sin(p * Math.PI);
        set('spine', 10 * stretch, 0, 0);
        set('head', 12 * stretch, 0, 6 * Math.sin(p * 6));
        set('upperarm_l', 20 * stretch, 0, 56 * stretch);
        set('upperarm_r', 20 * stretch, 0, -56 * stretch);
        set('ear_l', 0, 0, 10 * stretch);
        set('ear_r', 0, 0, -10 * stretch);
        set('tail_1', 0, 18 * stretch, 10);
        targetHipsOffset.set(0, 0.025 * stretch, 0);
        break;
      }

      case 'sit': {
        const kick = Math.sin(t * 2.4);
        set('spine', -3 - 1.5 * s1, 0, 1.5 * c1);
        set('head', 2 + 1.5 * s1, 4 * Math.sin(t * 0.8), 2 * c1);
        set('thigh_l', 56, 0, 6);
        set('thigh_r', 56, 0, -6);
        set('calf_l', -46 + 8 * kick, 0, 0);
        set('calf_r', -46 - 8 * kick, 0, 0);
        set('upperarm_l', 20, 0, 12);
        set('upperarm_r', 20, 0, -12);
        set('lowerarm_l', 16, 0, -8);
        set('lowerarm_r', 16, 0, 8);
        set('skirt_f', 20, 0, 0);
        set('skirt_b', -8, 0, 0);
        set('tail_1', 0, 12 * s1, 6);
        targetHipsOffset.set(0, -0.07, 0);
        break;
      }

      case 'ride': {
        const ped = ctx.moving ? Math.sin(t * 10) : 0;
        set('hips', -8, 0, smoothTurn * 8);
        set('spine', -12, 0, smoothTurn * 5);
        set('head', 14, 0, -smoothTurn * 4);
        set('upperarm_l', 40, 0, 16);
        set('upperarm_r', 40, 0, -16);
        set('lowerarm_l', 16, 0, 0);
        set('lowerarm_r', 16, 0, 0);
        set('thigh_l', 44 + 14 * ped, 0, 8);
        set('thigh_r', 44 - 14 * ped, 0, -8);
        set('calf_l', -42 - 12 * ped, 0, 0);
        set('calf_r', -42 + 12 * ped, 0, 0);
        set('skirt_f', 16, 0, 0);
        set('hair_b1', -(ctx.moving ? 20 : 6), 0, 4 * ped);
        set('hair_b2', -(ctx.moving ? 16 : 4), 0, 6 * ped);
        set('tail_1', 0, 14 * (ctx.moving ? ped : s1), 8);
        targetHipsOffset.set(0, -0.05 + 0.015 * Math.abs(ped), 0);
        break;
      }

      case 'drive': {
        // 开汽车 / 货车 / 巴士：坐姿握方向盘 + 转弯打方向
        const steer = THREE.MathUtils.clamp(-smoothTurn * 10, -24, 24);
        const vib = ctx.moving ? Math.sin(t * 18) * 0.8 : s1 * 0.4;
        set('hips', -4, 0, steer * 0.25);
        set('spine', -4 + vib, 0, steer * 0.2);
        set('head', 4, -steer * 0.35, 2 * c1);
        set('upperarm_l', 46 + steer * 0.5, 0, 14);
        set('upperarm_r', 46 - steer * 0.5, 0, -14);
        set('lowerarm_l', 24, 0, -10);
        set('lowerarm_r', 24, 0, 10);
        set('thigh_l', 54, 0, 6);
        set('thigh_r', 54, 0, -6);
        set('calf_l', -46, 0, 0);
        set('calf_r', -46, 0, 0);
        set('skirt_f', 18, 0, 0);
        set('tail_1', 0, 10 * s1, 5);
        targetHipsOffset.set(0, -0.07 + 0.004 * vib, 0);
        break;
      }

      case 'push': {
        // 推独轮车 / 手推车：双手前伸扶把手，腿部迈步
        if (ctx.moving) {
          evalGait(phase, { leg: 26, knee: 34, arm: 6, elbow: 16, shoulderTwist: 4, lean: 14, bob: 0.028, tail: 12, hair: 8 });
        } else {
          set('spine', -10, 0, 0);
          set('head', 8, 0, 2 * c1);
          set('tail_1', 0, 10 * s1, 5);
        }
        set('upperarm_l', 44, 0, 12);
        set('upperarm_r', 44, 0, -12);
        set('lowerarm_l', 16, 0, -6);
        set('lowerarm_r', 16, 0, 6);
        break;
      }

      // ---- 一次性交互动作（和任意玩法均可触发！） ----
      case 'fire':
      case 'farm_plant':
      case 'gather': {
        // 弯腰蹲下采花 / 种菜 / 捡贝壳 / 点火
        const k = Math.sin(Math.min(1, t / 0.9) * Math.PI);
        const scoop = Math.sin(t * 10);
        set('hips', -24 * k, 0, 0);
        set('spine', -18 * k, 0, 0);
        set('head', 16 * k, 0, 4 * scoop * k);
        set('thigh_l', 28 * k, 0, 6 * k);
        set('thigh_r', 28 * k, 0, -6 * k);
        set('calf_l', -36 * k, 0, 0);
        set('calf_r', -36 * k, 0, 0);
        set('upperarm_r', (38 + 12 * scoop) * k, 0, -16 * k);
        set('lowerarm_r', 20 * k, 0, 0);
        set('upperarm_l', 24 * k, 0, 14 * k);
        set('tail_1', 0, 18 * scoop * k, 10 * k);
        targetHipsOffset.set(0, -0.08 * k, 0);
        break;
      }

      case 'farm_water': {
        // 提水壶前倾浇水，轻轻左右晃动
        const k = Math.sin(Math.min(1, t / 1.1) * Math.PI);
        const pour = Math.sin(t * 8);
        set('spine', -14 * k, 0, 6 * pour * k);
        set('head', 8 * k, 0, 4 * pour * k);
        set('upperarm_r', 44 * k, 0, (-22 + 12 * pour) * k);
        set('lowerarm_r', 22 * k, 0, 10 * pour * k);
        set('upperarm_l', 22 * k, 0, 18 * k);
        set('tail_1', 0, 16 * pour * k, 8 * k);
        break;
      }

      case 'cook': {
        // 厨房颠勺/搅拌
        const stir = Math.sin(t * 11);
        const stirC = Math.cos(t * 11);
        set('spine', -8, 4 * stir, 0);
        set('head', 4, 0, 5 * stirC);
        set('upperarm_r', 38 + 12 * stir, 0, -16 + 8 * stirC);
        set('lowerarm_r', 24 + 10 * stirC, 0, 0);
        set('upperarm_l', 34, 0, 16);
        set('lowerarm_l', 20, 0, 0);
        set('tail_1', 0, 18 * stir, 8);
        targetHipsOffset.set(0, 0.015 * Math.abs(stir), 0);
        break;
      }

      case 'eat': {
        // 开心吃东西（啊呜啊呜点头 + 摇尾）
        const nom = Math.sin(t * 10);
        set('spine', -4 + 3 * nom, 0, 0);
        set('head', -6 + 8 * nom, 0, 5 * Math.sin(t * 5));
        set('upperarm_r', 44 + 8 * nom, 0, -18);
        set('lowerarm_r', 32 + 8 * nom, 0, 14);
        set('upperarm_l', 34, 0, 16);
        set('lowerarm_l', 24, 0, -10);
        set('ear_l', 0, 0, 8 * Math.abs(nom));
        set('ear_r', 0, 0, -8 * Math.abs(nom));
        set('tail_1', 0, 22 * nom, 10);
        set('ahoge', 8 * nom, 0, 8 * Math.cos(t * 5));
        targetHipsOffset.set(0, 0.018 * Math.abs(nom), 0);
        break;
      }

      case 'pray': {
        // 双手合十祈祷/许愿，安静低头
        const k = Math.sin(Math.min(1, t / 1.4) * Math.PI);
        set('spine', -8 * k, 0, 0);
        set('head', -12 * k, 0, 0);
        set('upperarm_l', 40 * k, 0, 8 * k);
        set('upperarm_r', 40 * k, 0, -8 * k);
        set('lowerarm_l', 28 * k, 0, -18 * k);
        set('lowerarm_r', 28 * k, 0, 18 * k);
        set('ear_l', 0, 0, -5 * k);
        set('ear_r', 0, 0, 5 * k);
        set('tail_1', 0, 6 * s1, 4);
        break;
      }

      case 'read': {
        // 捧书阅读，微微点头
        const nod = Math.sin(t * 3.5);
        set('spine', -6, 0, 0);
        set('head', -10 + 3 * nod, 4 * Math.sin(t * 1.5), 2 * c1);
        set('upperarm_l', 36, 0, 10);
        set('upperarm_r', 36, 0, -10);
        set('lowerarm_l', 26, 0, -12);
        set('lowerarm_r', 26, 0, 12);
        set('tail_1', 0, 8 * s1, 4);
        break;
      }

      case 'wave': {
        // 热情挥手打招呼（商店、村民、信箱、委托、车站）
        const wv = Math.sin(t * 11);
        set('spine', 0, 0, -4);
        set('head', 4, 0, 7 + 4 * wv);
        set('upperarm_r', 22, 0, -44 - 10 * wv);
        set('lowerarm_r', 16, 0, -12 * wv);
        set('upperarm_l', -4, 0, 10);
        set('tail_1', 0, 18 * wv, 8);
        set('ahoge', 0, 0, 10 * wv);
        set('ear_l', 0, 0, 6 * Math.abs(wv));
        set('ear_r', 0, 0, -6 * Math.abs(wv));
        targetHipsOffset.set(0, 0.018 * Math.abs(wv), 0);
        break;
      }

      case 'work': {
        // 搬货 / 打工发力
        const lift = Math.sin(t * 6.5);
        set('spine', -10 - 6 * lift, 0, 0);
        set('head', 6, 0, 0);
        set('upperarm_l', 36 + 14 * lift, 0, 16);
        set('upperarm_r', 36 + 14 * lift, 0, -16);
        set('lowerarm_l', 24, 0, -8);
        set('lowerarm_r', 24, 0, 8);
        set('thigh_l', 14 * Math.max(0, -lift), 0, 4);
        set('thigh_r', 14 * Math.max(0, -lift), 0, -4);
        set('calf_l', -18 * Math.max(0, -lift), 0, 0);
        set('calf_r', -18 * Math.max(0, -lift), 0, 0);
        targetHipsOffset.set(0, 0.025 * lift, 0);
        break;
      }

      case 'cheer': {
        // 欢呼雀跃（钓到鱼、赢下棋/电玩、完成委托、堆雪人、游乐场）
        const hop = Math.abs(Math.sin(t * 9.5));
        const sway = Math.sin(t * 9.5);
        set('spine', 5 * hop, 0, 5 * sway);
        set('head', 6 * hop, 0, -6 * sway);
        set('upperarm_l', 18, 0, 40 + 8 * hop);
        set('upperarm_r', 18, 0, -40 - 8 * hop);
        set('thigh_l', 18 * hop, 0, 5);
        set('thigh_r', 18 * hop, 0, -5);
        set('calf_l', -24 * hop, 0, 0);
        set('calf_r', -24 * hop, 0, 0);
        set('ear_l', 0, 0, 12 * hop);
        set('ear_r', 0, 0, -12 * hop);
        set('ahoge', 12 * hop, 0, 12 * sway);
        set('tail_1', 0, 26 * sway, 14);
        set('tail_2', 0, 30 * sway, 14);
        targetHipsOffset.set(0, 0.075 * hop, 0);
        break;
      }

      case 'photo': {
        // 相机自拍/留影姿势：俏皮歪头 + 举手比耶感
        set('spine', 0, -6, -5);
        set('head', 4, 8, 10 + 2 * s1);
        set('upperarm_r', 24, 0, -40);
        set('lowerarm_r', 18, 0, -8);
        set('upperarm_l', 12, 0, 22);
        set('tail_1', 0, 14 * s1, 10);
        set('ahoge', 4 * s2, 0, 8);
        break;
      }

      case 'happy': {
        // dsh-pet 开心蹦跳：高高举手左右摇摆 + 轻快连跳
        const hop = Math.abs(Math.sin(t * 8.5));
        const sway = Math.sin(t * 4.25);
        set('spine', 4 * hop, 0, 6 * sway);
        set('head', 6 * hop, 6 * sway, -8 * sway);
        set('upperarm_l', 20, 0, 48 + 12 * hop);
        set('upperarm_r', 20, 0, -48 - 12 * hop);
        set('thigh_l', 22 * hop, 0, 6);
        set('thigh_r', 22 * hop, 0, -6);
        set('calf_l', -28 * hop, 0, 0);
        set('calf_r', -28 * hop, 0, 0);
        set('ear_l', 0, 0, 12 * hop);
        set('ear_r', 0, 0, -12 * hop);
        set('tail_1', 0, 28 * sway, 14);
        set('ahoge', 12 * hop, 0, 12 * sway);
        targetHipsOffset.set(0, 0.09 * hop, 0);
        break;
      }

      case 'dance': {
        // dsh-pet 跳舞：转圈摆手摇尾巴的萌系小舞步
        const ph = t * 5.2;
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        const hop = Math.abs(Math.sin(ph));
        set('hips', 0, 16 * s, 6 * c);
        set('spine', -3, -10 * s, -6 * c);
        set('head', 4, 12 * c, 10 * s);
        set('upperarm_l', 26 + 22 * s, 0, 42 + 16 * c);
        set('upperarm_r', 26 - 22 * s, 0, -42 + 16 * c);
        set('lowerarm_l', 22, 0, -10);
        set('lowerarm_r', 22, 0, 10);
        set('thigh_l', 20 * Math.max(0, s), 0, 6);
        set('thigh_r', 20 * Math.max(0, -s), 0, -6);
        set('calf_l', -24 * Math.max(0, s), 0, 0);
        set('calf_r', -24 * Math.max(0, -s), 0, 0);
        set('skirt_l', 0, 0, 12 * s);
        set('skirt_r', 0, 0, 12 * s);
        set('tail_1', 0, 26 * s, 10);
        set('tail_2', 0, 30 * c, 12);
        set('ahoge', 8 * hop, 0, 14 * s);
        targetHipsOffset.set(0, 0.045 * hop, 0);
        break;
      }

      case 'think': {
        // dsh-pet 思考（DeepSeek 思考态）：歪头 + 右手托腮 + 尾巴慢摇
        const nod = Math.sin(t * 2.2);
        set('spine', -4, 4, 5);
        set('head', -6 + 2 * nod, 8, 12);
        set('upperarm_r', 52, 0, -24);
        set('lowerarm_r', 36, 0, 14);
        set('upperarm_l', 16, 0, 12);
        set('lowerarm_l', 18, 0, -10);
        set('ear_l', 0, 0, -4);
        set('ear_r', 0, 0, -6);
        set('ahoge', 6 * nod, 0, 10);
        set('tail_1', 0, 8 * Math.sin(t * 1.4), 4);
        break;
      }

      case 'shy': {
        // dsh-pet 害羞扭捏：双手微捂脸颊 + 身体左右轻扭
        const wiggle = Math.sin(t * 4.5);
        set('hips', 0, 10 * wiggle, 4 * wiggle);
        set('spine', -6, -6 * wiggle, 0);
        set('head', -10, -8 * wiggle, 10 * wiggle);
        set('upperarm_l', 50, 0, 18);
        set('upperarm_r', 50, 0, -18);
        set('lowerarm_l', 38, 0, -18);
        set('lowerarm_r', 38, 0, 18);
        set('thigh_l', 6, 0, -5);
        set('thigh_r', 6, 0, 5);
        set('ear_l', 0, 0, -10);
        set('ear_r', 0, 0, 10);
        set('tail_1', 0, 14 * wiggle, 6);
        break;
      }

      case 'dizzy': {
        // dsh-pet 晕乎乎：头和身体画圈摇晃 + 呆毛打转
        const a = t * 6.5;
        set('hips', 4 * Math.sin(a), 8 * Math.cos(a), 8 * Math.sin(a));
        set('spine', 6 * Math.cos(a), 0, 8 * Math.sin(a));
        set('head', 8 * Math.sin(a), 14 * Math.cos(a), 14 * Math.sin(a));
        set('upperarm_l', 18, 0, 30 + 12 * Math.sin(a));
        set('upperarm_r', 18, 0, -30 + 12 * Math.cos(a));
        set('ear_l', 0, 0, -12 + 6 * Math.sin(a));
        set('ear_r', 0, 0, 12 + 6 * Math.cos(a));
        set('ahoge', 14 * Math.sin(a * 1.5), 0, 18 * Math.cos(a * 1.5));
        break;
      }

      case 'angry': {
        // dsh-pet 生气跺脚：叉腰 + 气鼓鼓跺脚
        const stomp = Math.abs(Math.sin(t * 9.0));
        const side = Math.sin(t * 4.5) >= 0 ? 1 : -1;
        set('hips', -4, 0, 3 * side);
        set('spine', -6, 0, -4 * side);
        set('head', -4, 0, 6 * side);
        set('upperarm_l', 18, 0, 34);
        set('upperarm_r', 18, 0, -34);
        set('lowerarm_l', 26, 0, -24);
        set('lowerarm_r', 26, 0, 24);
        set('thigh_l', side > 0 ? 24 * stomp : 0, 0, 4);
        set('thigh_r', side < 0 ? 24 * stomp : 0, 0, -4);
        set('calf_l', side > 0 ? -28 * stomp : 0, 0, 0);
        set('calf_r', side < 0 ? -28 * stomp : 0, 0, 0);
        set('ear_l', 0, 0, -12);
        set('ear_r', 0, 0, 12);
        set('ahoge', -14, 0, 12 * side);
        set('tail_1', 0, 24 * Math.sin(t * 14), 12);
        targetHipsOffset.set(0, -0.02 * (1 - stomp), 0);
        break;
      }

      case 'shock': {
        // dsh-pet 惊讶：猛地一蹦 + 双手张开 + 耳朵炸毛竖起
        const p = Math.min(1, t / 0.8);
        const hop = Math.sin(p * Math.PI);
        set('spine', 10 * hop, 0, 0);
        set('head', 10 * hop, 0, 0);
        set('upperarm_l', 22 * hop, 0, 56 * hop);
        set('upperarm_r', 22 * hop, 0, -56 * hop);
        set('thigh_l', 24 * hop, 0, 8 * hop);
        set('thigh_r', 24 * hop, 0, -8 * hop);
        set('calf_l', -32 * hop, 0, 0);
        set('calf_r', -32 * hop, 0, 0);
        set('ear_l', 0, 0, 18 * hop);
        set('ear_r', 0, 0, -18 * hop);
        set('ahoge', 18 * hop, 0, 0);
        targetHipsOffset.set(0, 0.11 * hop, 0);
        break;
      }

      case 'float': {
        // dsh-pet 被拎起/失重飘浮：双腿轻晃 + 呆毛和尾巴飘荡
        const fl = Math.sin(t * 3.8);
        const kick = Math.sin(t * 6.5);
        set('spine', -4, 0, 4 * fl);
        set('head', 6, 6 * fl, 5 * fl);
        set('upperarm_l', 16, 0, 42 + 8 * fl);
        set('upperarm_r', 16, 0, -42 - 8 * fl);
        set('thigh_l', 18 + 12 * kick, 0, 6);
        set('thigh_r', 18 - 12 * kick, 0, -6);
        set('calf_l', -24 - 10 * kick, 0, 0);
        set('calf_r', -24 + 10 * kick, 0, 0);
        set('tail_1', 0, 18 * fl, 12);
        targetHipsOffset.set(0, 0.08 + 0.04 * fl, 0);
        break;
      }

      case 'idle':
      default: {
        // dsh-pet 风格的灵动待机：基础呼吸 + 定时触发可爱小动作（歪头张望 / 摇尾蹦跶 / 伸懒腰）
        set('spine', -1.5 * s1, 0, 1.2 * c1);
        set('head', 1.5 * s1, 3.0 * Math.sin(t * 0.7), 2.0 * c1);
        set('ahoge', 5 * s2, 0, 4 * c1);
        set('ear_l', 0, 0, 3.5 * s1);
        set('ear_r', 0, 0, -3.5 * s1);
        set('upperarm_l', 2.5 * s1, 0, 6 + 2 * s1);
        set('upperarm_r', 2.5 * s1, 0, -6 - 2 * s1);
        set('hair_b1', -2 - 1.5 * s1, 0, 1.2 * c1);
        set('hair_b2', -2 - 2 * Math.sin(t * 2.1 - 0.5), 0, 1.8 * c1);
        set('tail_1', 0, 9 * s2, 4 * c1);
        set('tail_2', 0, 13 * Math.sin(t * 4.2 - 0.5), 3 * s1);
        targetHipsOffset.set(0, 0.008 * s1, 0);

        // 可爱待机变体
        if (idleVariant === 1) {
          // 好奇左右张望 + 歪头
          const lk = Math.sin(t * 1.6);
          add('head', 3, 14 * lk, 7 * Math.cos(t * 1.6));
          add('ear_l', 0, 0, 5 * lk);
          add('ear_r', 0, 0, 5 * lk);
        } else if (idleVariant === 2) {
          // 开心轻摇鲸鱼尾 + 小幅晃动
          const wag = Math.sin(t * 7.5);
          add('tail_1', 0, 16 * wag, 6);
          add('tail_2', 0, 20 * Math.sin(t * 7.5 - 0.5), 6);
          add('head', 0, 0, 4 * wag);
          add('ahoge', 0, 0, 8 * wag);
        } else if (idleVariant === 3) {
          // 悠闲伸个小懒腰
          const st = Math.sin(Math.min(1, (t % 3.5) / 2.2) * Math.PI);
          add('spine', 6 * st, 0, 0);
          add('head', 8 * st, 0, 0);
          add('upperarm_l', 12 * st, 0, 38 * st);
          add('upperarm_r', 12 * st, 0, -38 * st);
          targetHipsOffset.y += 0.015 * st;
        }
        break;
      }
    }
  };

  /**
   * 每帧更新骨架姿态与二次物理。
   * @param {number} dt 帧间隔（秒）
   * @param {object} ctx { pose, moving, speed, vy, yaw, onGround, air, wind: THREE.Vector3, steer, brake, trick }
   */
  const update = (dt, ctx = {}) => {
    const safeDt = Math.min(0.05, Math.max(0.0001, dt));
    const air = !!ctx.air || ctx.pose === 'air' || ctx.pose === 'jump' || ctx.pose === 'doubleJump' || ctx.pose === 'fall';

    // 落地检测：从空中落地触发短暂的缓冲回弹
    if (prevAir && !air && (ctx.pose == null || ctx.pose === 'walk' || ctx.pose === 'fastWalk' || ctx.pose === 'run')) {
      landTimer = 0.22;
    }
    prevAir = air;
    if (landTimer > 0) landTimer = Math.max(0, landTimer - safeDt);

    // 决定最终要播放的状态（一次性动作优先，除非玩家主动移动/跳跃打断）
    let active = ctx.pose || (ctx.moving ? 'walk' : 'idle');
    if (active === 'air') active = (ctx.vy ?? 0) > 0.4 ? 'jump' : 'fall';
    if (oneshot) {
      oneshot.time += safeDt;
      const interrupted = (ctx.moving && !['fish_cast', 'wave', 'cheer'].includes(oneshot.name)) || air;
      if (oneshot.time >= oneshot.duration || interrupted) {
        oneshot = null;
      } else {
        active = oneshot.name;
      }
    } else if (landTimer > 0 && !ctx.moving && active === 'idle') {
      active = 'land';
    }

    if (active !== current) {
      current = active;
      stateTime = 0;
    } else {
      stateTime += safeDt;
    }

    // 待机小动作轮换（dsh-pet 风格的自然灵动感）
    if (active === 'idle') {
      idleNextSwitch -= safeDt;
      if (idleNextSwitch <= 0) {
        idleVariant = idleVariant === 0 ? 1 + Math.floor(Math.random() * 3) : 0;
        idleNextSwitch = idleVariant === 0 ? 3.5 + Math.random() * 4.5 : 2.6 + Math.random() * 1.4;
      }
    } else {
      idleVariant = 0;
    }

    // 步态相位推进（根据真实移速自适应步频，脚不打滑）
    const speed = ctx.speed ?? 0;
    smoothSpeed += (speed - smoothSpeed) * Math.min(1, safeDt * 10);
    smoothVy += ((ctx.vy ?? 0) - smoothVy) * Math.min(1, safeDt * 10);
    const dyaw = Math.atan2(Math.sin((ctx.yaw ?? 0) - prevYaw), Math.cos((ctx.yaw ?? 0) - prevYaw));
    prevYaw = ctx.yaw ?? 0;
    smoothTurn += (THREE.MathUtils.clamp(dyaw / safeDt, -5, 5) - smoothTurn) * Math.min(1, safeDt * 8);

    const gaitRate = active === 'run' ? 12.6 : active === 'fastWalk' ? 9.8 : active === 'stairs' ? 8.8 : active === 'wade' ? 6.4 : 7.8;
    phase += safeDt * (ctx.moving ? gaitRate * Math.max(0.65, Math.min(1.4, smoothSpeed / (active === 'run' ? 10 : active === 'fastWalk' ? 7 : 4.5))) : 2.0);

    // 1. 计算基础动作目标角度
    evaluatePose(active, oneshot ? oneshot.time : stateTime, { ...ctx, steer: ctx.steer ?? 0, brake: ctx.brake ?? false, trick: ctx.trick ?? false });

    // 2. 叠加真实世界风场与运动惯性的二次物理（头发、呆毛、裙摆、鲸鱼尾、耳朵）
    const wind = ctx.wind;
    const windSpeed = wind ? Math.min(8, wind.z ?? 1.5) : 1.2;
    const windGust = Math.sin(performance.now() * 0.0024) * 0.6 + Math.sin(performance.now() * 0.0053) * 0.4;
    const windPush = windSpeed * (0.8 + 0.55 * windGust);

    const targetHairPitch = -Math.min(20, smoothSpeed * 1.2 + windPush * 1.4) + THREE.MathUtils.clamp(-smoothVy * 1.6, -12, 14);
    const targetHairRoll = THREE.MathUtils.clamp(-smoothTurn * 3.8 + windPush * 0.7 * windGust, -16, 16);
    const targetTailYaw = THREE.MathUtils.clamp(-smoothTurn * 4.5, -18, 18);
    const targetAhogePitch = THREE.MathUtils.clamp(smoothSpeed * 1.1 - smoothVy * 2.2 + windPush * 1.8, -18, 22);
    const targetAhogeRoll = THREE.MathUtils.clamp(-smoothTurn * 4.2 + windPush * 1.4 * windGust, -18, 18);

    const spK = Math.min(1, safeDt * 7.5);
    spring.hairPitch += (targetHairPitch - spring.hairPitch) * spK;
    spring.hairRoll += (targetHairRoll - spring.hairRoll) * spK;
    spring.tailYaw += (targetTailYaw - spring.tailYaw) * spK;
    spring.ahogePitch += (targetAhogePitch - spring.ahogePitch) * spK;
    spring.ahogeRoll += (targetAhogeRoll - spring.ahogeRoll) * spK;

    if (active !== 'lie' && active !== 'sleep') {
      add('hair_b1', spring.hairPitch * 0.55, 0, spring.hairRoll * 0.5);
      add('hair_b2', spring.hairPitch * 0.65, 0, spring.hairRoll * 0.75);
      add('hair_l', spring.hairPitch * 0.3, 0, spring.hairRoll * 0.45);
      add('hair_r', spring.hairPitch * 0.3, 0, spring.hairRoll * 0.45);
      add('ahoge', spring.ahogePitch * 0.55, 0, spring.ahogeRoll * 0.55);
      add('tail_1', 0, spring.tailYaw * 0.5, 0);
      add('tail_2', 0, spring.tailYaw * 0.7, 0);
      add('skirt_b', spring.hairPitch * 0.25, 0, 0);
      add('skirt_f', -Math.min(8, Math.max(0, smoothVy * 1.2)), 0, 0);
    }

    // 3. 四元数平滑混合到所有骨骼（动作切换丝滑无跳变）
    const blendRate = active === 'doubleJump' || active === 'fish_bite' || active === 'land' ? 20 : 12;
    const alpha = 1 - Math.exp(-blendRate * safeDt);
    for (const name in bones) {
      const b = bones[name];
      const t = targets[name];
      _e.set(t[0] * DEG, t[1] * DEG, t[2] * DEG, 'XYZ');
      _q2.setFromEuler(_e);
      _q1.copy(restQuat[name]).multiply(_q2);
      // For DoubleJump 360 spin on hips, follow rotation cleanly without shortest-path flip
      if (name === 'hips' && active === 'doubleJump') {
        curQuat[name].copy(_q1);
      } else {
        curQuat[name].slerp(_q1, alpha);
      }
      b.quaternion.copy(curQuat[name]);
    }
    if (bones.hips) {
      hipsOffset.lerp(targetHipsOffset, alpha);
      bones.hips.position.copy(restPos.hips).add(hipsOffset);
    }

    return active;
  };

  /** 获取左手/右手骨骼的世界坐标（给钓竿、风筝线挂接） */
  const getHandWorldPos = (side = 'right', out = new THREE.Vector3()) => {
    const b = bones[side === 'left' ? 'hand_l' : 'hand_r'];
    if (!b) return null;
    model.updateMatrixWorld(true);
    return b.getWorldPosition(out);
  };

  return {
    bones,
    mixer,
    clips,
    update,
    trigger,
    getHandWorldPos,
    get current() {
      return current;
    },
    get oneshot() {
      return oneshot?.name ?? null;
    },
    label: () => ACTION_LABELS[current] ?? current,
  };
}
