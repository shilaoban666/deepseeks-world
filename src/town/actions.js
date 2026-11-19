// 主角能做的动作：走、跑、跳、爬树、游泳、潜水、钓鱼、晒太阳、点火。
//
// 一个很小的状态机：ground（地上，含跳起来在空中）/ climb / swim / dive / fish / lie。
// 水平方向的走动和碰撞还是 player.js 的 mover，这里只管"现在是哪种动作"、竖直方向怎么动、
// 体力和氧气怎么变、脚下冒什么粒子。每帧返回给主循环：她在不在动、摆什么姿势、镜头看多高。
import * as THREE from 'three';
import { createPlantBatch } from './billboard.js';
import { FISH } from './fishdex.js';

const GRAVITY = 16;
const JUMP = 5.6;

/**
 * @param o.whale 主角；o.mover 走路；o.cam 镜头；o.game 游戏状态（体力、钓鱼）；o.hud 界面
 * @param o.woods 会长的树（爬树用）；o.particles 粒子；o.field 草地（点火）；o.plan 地图函数
 * @param o.weather 天气（下雨不能晒太阳、点不着火）；o.plants 物件图集（水下的鱼）；o.shared uniforms
 */
export function createActions({ whale, mover, cam, game, hud, woods, particles, field, plan, weather, plants, shared, scene }) {
  const s = whale.state;
  const st = game.state;
  let mode = 'ground';
  let air = false;
  let tree = null; // 正在爬的树 { x, z, top }
  let oxygen = 100;
  let dustAcc = 0;
  let rippleAcc = 0;
  let bubbleAcc = 0;
  let lieTime = 0;
  let wasFishing = false;
  let lastWater = null;

  // 钓竿：一根细杆 + 一根线 + 一个红白浮漂
  const rod = new THREE.Group();
  const rodMat = new THREE.MeshBasicMaterial({ color: 0x5a3a22 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 2.2, 5), rodMat);
  stick.geometry.translate(0, 1.1, 0);
  rod.add(stick);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8e4da }));
  line.frustumCulled = false;
  const float = new THREE.Group();
  const fTop = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8483a }));
  const fBot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf4efe4 }));
  float.add(fTop, fBot);
  rod.visible = line.visible = float.visible = false;
  scene.add(rod, line, float);
  let floatAt = null;

  // 晒太阳的毯子
  const towel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.8), new THREE.MeshBasicMaterial({ color: 0xe8a65a }));
  towel.geometry.rotateX(-Math.PI / 2);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.22), new THREE.MeshBasicMaterial({ color: 0xf6efe0 }));
  stripe.geometry.rotateX(-Math.PI / 2);
  stripe.position.y = 0.005;
  towel.add(stripe);
  towel.visible = false;
  scene.add(towel);

  // 水下的鱼：湖、河、海各一群（图鉴里那片水的鱼），跟着潜水的人
  let fish = null;
  if (plants?.fish?.length) {
    const sprites = plants.fish[0].sprites;
    const idxOf = new Map(sprites.map((sp, i) => [sp.name, i]));
    const pick = (water) => FISH.filter((f) => f.water === water && f.rarity <= 3).map((f) => idxOf.get(f.id)).filter((i) => i != null);
    const schools = {};
    for (const water of ['lake', 'river', 'sea']) {
      const ids = pick(water);
      const school = Array.from({ length: 16 }, (_, i) => ({ a: Math.random() * 6.28, r: 2 + Math.random() * 6, h: Math.random(), w: (0.25 + Math.random() * 0.4) * (i % 2 ? 1 : -1), size: 0.3 + Math.random() * 0.45 }));
      const batch = createPlantBatch(shared, plants.fish, school.map((f, i) => ({ x: 0, z: 0, y: -999, h: f.size, sprite: ids[i % ids.length] })), { alpha: 0.16, sway: 0 });
      batch.visible = false;
      scene.add(batch);
      schools[water] = { batch, school, at: batch.children[0].geometry.attributes.aOffset };
    }
    fish = schools;
  }

  const keyDown = (c) => mover.keys.has(c);
  const moveKeys = () => ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(keyDown);
  const forward = () => [Math.sin(s.yaw), Math.cos(s.yaw)];

  /** 身边最近的、能爬的树（树干 2.6 m 以内的大树和中等的树） */
  const nearTree = () => {
    if (!woods?.trees) return null;
    let best = null;
    let bestD = 2.6;
    for (const t of woods.trees) {
      if (t[2] > 6) continue;
      const d = Math.hypot(t[0] - s.x, t[1] - s.z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) return null;
    const size = woods.sizes?.[best[2]];
    const top = (size ? size.crownY : 5) * best[3] * 0.92;
    return { x: best[0], z: best[1], top, ground: plan.heightAt(best[0], best[1]) };
  };
  /** 前面 1~5 米有没有水（钓鱼用） */
  const waterAhead = () => {
    const [fx, fz] = forward();
    for (let d = 1.5; d <= 6; d += 0.75) {
      const x = s.x + fx * d;
      const z = s.z + fz * d;
      const w = plan.waterAt(x, z);
      if (w != null && w - plan.heightAt(x, z) > 0.3) return { x, z, y: w };
    }
    return null;
  };
  const depthHere = () => {
    const w = plan.waterAt(s.x, s.z);
    return w == null ? null : { level: w, depth: w - plan.heightAt(s.x, s.z) };
  };

  const enterSwim = (w) => {
    mode = 'swim';
    air = false;
    particles.splash(s.x, w, s.z, 1.2);
    hud.toast('扑通——游起来了（C 潜水，往岸上游就上岸）');
  };
  const standUp = () => {
    mode = 'ground';
    towel.visible = false;
  };

  const actions = {
    get mode() {
      return mode;
    },
    get air() {
      return air;
    },
    get oxygen() {
      return oxygen;
    },
    /** 眼睛在水下吗（主循环据此加水下的雾和颜色） */
    underwater(camera) {
      const w = plan.waterAt(camera.position.x, camera.position.z);
      return w != null && camera.position.y < w - 0.05 ? w : null;
    },
    /** 现在能做哪些动作（动作栏读它） */
    available(indoor) {
      if (indoor) return [];
      const t = mode === 'ground' && !air ? nearTree() : null;
      const water = mode === 'ground' ? waterAhead() : null;
      const raining = weather && (weather.info.rain > 0.2 || weather.info.snow > 0.3);
      return [
        { id: 'run', key: 'Shift', label: '跑', on: mode === 'ground' && st.stamina > 15 },
        { id: 'jump', key: 'Space', label: mode === 'dive' ? '上浮' : mode === 'climb' ? '跳下' : '跳', on: (mode === 'ground' && !air) || mode === 'dive' || mode === 'climb' || mode === 'swim' },
        { id: 'climb', key: 'F', label: mode === 'climb' ? '下树' : '爬树', on: !!t || mode === 'climb' },
        { id: 'dive', key: 'C', label: mode === 'dive' ? '上浮' : '潜水', on: mode === 'swim' || mode === 'dive' },
        { id: 'fish', key: 'E', label: '钓鱼', on: !!water && !raining },
        { id: 'lie', key: 'R', label: mode === 'lie' ? '起来' : '晒太阳', on: (mode === 'ground' && !air) || mode === 'lie' },
        { id: 'fire', key: 'G', label: '点火', on: mode === 'ground' && !raining },
      ];
    },
    /** 能不能在这儿钓鱼（E 键在没有别的交互点时会走这里） */
    canFish: () => mode === 'ground' && !!waterAhead(),
    /** 执行一个动作；返回 true 表示按键被用掉了 */
    act(id) {
      switch (id) {
        case 'jump':
          if (mode === 'ground' && !air) {
            air = true;
            s.vy = JUMP;
            particles.dust(s.x, s.y, s.z, 3);
            return true;
          }
          if (mode === 'climb') {
            const [fx, fz] = forward();
            mode = 'ground';
            air = true;
            s.vy = 2.5;
            s.x -= fx * 0.8;
            s.z -= fz * 0.8;
            tree = null;
            return true;
          }
          if (mode === 'dive') {
            mode = 'swim';
            return true;
          }
          return false;
        case 'climb': {
          if (mode === 'climb') {
            // 慢慢滑下来
            s.vy = -1;
            mode = 'ground';
            air = true;
            tree = null;
            return true;
          }
          const t = mode === 'ground' && !air ? nearTree() : null;
          if (!t) {
            hud.toast('身边没有能爬的树');
            return true;
          }
          tree = t;
          mode = 'climb';
          // 贴到树干靠自己这一边，面朝树干
          const a = Math.atan2(s.x - t.x, s.z - t.z);
          s.x = t.x + Math.sin(a) * 0.55;
          s.z = t.z + Math.cos(a) * 0.55;
          s.yaw = a + Math.PI;
          hud.toast('抱住树干了：W 往上爬，S 往下，Space 跳下来');
          return true;
        }
        case 'dive':
          if (mode === 'swim') {
            mode = 'dive';
            oxygen = Math.min(100, oxygen);
            hud.toast('深吸一口气——潜下去了（Space 上浮）');
            return true;
          }
          if (mode === 'dive') {
            mode = 'swim';
            return true;
          }
          return false;
        case 'lie': {
          if (mode === 'lie') {
            standUp();
            return true;
          }
          if (mode !== 'ground' || air) return false;
          if (weather && weather.info.rain > 0.2) {
            hud.toast('下着雨呢，躺不下去');
            return true;
          }
          mode = 'lie';
          lieTime = 0;
          const h = Math.floor(st.minutes / 60) % 24;
          const night = h < 6 || h >= 19;
          const sunny = weather?.kind === 'sunny';
          hud.toast(night ? '躺下来看星星。（任意方向键起来）' : sunny ? '大太阳，暖洋洋的……（时间过得快一点）' : '躺在草地上晒太阳……（任意方向键起来）');
          return true;
        }
        case 'fire': {
          if (mode !== 'ground') return false;
          if (weather && (weather.info.rain > 0.2 || weather.info.snow > 0.3)) {
            hud.toast('湿漉漉的，划了几根火柴都没点着');
            return true;
          }
          const [fx, fz] = forward();
          const x = s.x + fx * 2.2;
          const z = s.z + fz * 2.2;
          const lit = field.ignite(x, z, 0.7);
          if (lit) {
            hud.toast('草烧起来了！顺着风在蔓延——离远一点');
            for (let i = 0; i < 10; i++) particles.emit({ x, y: plan.heightAt(x, z) + 0.2, z, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 0.8, size: 0.06, color: [4, 2.4, 1], alpha: 1, gravity: 2 });
          } else hud.toast('这里没有能烧的草（路上、水边、湿地都点不着）');
          return true;
        }
        case 'fish': {
          const w = waterAhead();
          if (!w) {
            hud.toast('往水边站一点，面朝着水');
            return true;
          }
          floatAt = w;
          game.startFishing?.();
          return true;
        }
        default:
          return false;
      }
    },
    /** 按键 → 动作 */
    handleKey(code) {
      if (code === 'Space') return actions.act('jump');
      if (code === 'KeyF') return actions.act('climb');
      if (code === 'KeyC' || code === 'ControlLeft') return actions.act('dive');
      if (code === 'KeyR') return actions.act('lie');
      if (code === 'KeyG') return actions.act('fire');
      return false;
    },
    /**
     * 每帧（室外、没坐着的时候）。返回 { moving, pose, eye }。
     * @param ground (x, z) => 脚下高度（含桥面）
     */
    step(dt, ground) {
      const fishing = !!game.fishing;
      // 开始钓鱼的那一刻：在原地坐下，竿子伸出去
      if (fishing && !wasFishing) {
        mode = 'fish';
        if (!floatAt) floatAt = waterAhead();
      }
      if (!fishing && wasFishing) {
        mode = 'ground';
        floatAt = null;
      }
      wasFishing = fishing;
      rod.visible = line.visible = float.visible = mode === 'fish' && !!floatAt;

      // 躺着、钓鱼：动一下方向键就起来
      if ((mode === 'lie' || mode === 'fish') && moveKeys()) {
        if (mode === 'fish') game.stopFishing?.();
        standUp();
      }

      let moving = false;
      let pose = null;
      let eye = 1.35;
      const running = (keyDown('ShiftLeft') || keyDown('ShiftRight')) && st.stamina > 15;

      if (mode === 'ground') {
        // 乘坐交通工具时提高巡航速度，同时不再因体力下降而突然变慢。
        const rideBoost = game.state.riding ? (game.state.riding.vehicle?.includes('boat') || game.state.riding.vehicle?.includes('canoe') || game.state.riding.vehicle?.includes('kayak') ? 1.3 : 1.65) : 1;
        const moved = mover.step(dt, s, cam, (st.stamina > 15 ? 1 : 0.72) * rideBoost, true);
        moving = moved.moved > 0.004;
        const g = ground(s.x, s.z);
        s.groundY = g;
        if (air) {
          s.vy -= GRAVITY * dt;
          s.y += s.vy * dt;
          if (s.y <= g) {
            s.y = g;
            air = false;
            const w = depthHere();
            if (w && w.depth > 0.3) particles.splash(s.x, w.level, s.z, 1);
            else particles.dust(s.x, g, s.z, 5);
          }
        } else s.y = g;
        // 走进深水 → 游泳
        const w = depthHere();
        if (w && w.depth > 1.0 && !air) enterSwim(w.level);
        else if (w && w.depth > 0.15) {
          // 蹚水：脚下一圈圈涟漪
          rippleAcc += dt * (moving ? 6 : 0.8);
          if (rippleAcc > 1) {
            rippleAcc = 0;
            particles.ripple(s.x, w.level, s.z, 0.3, 1.2);
          }
        }
        if (moving && running && !air) {
          st.stamina = Math.max(0, st.stamina - dt * 7);
          dustAcc += dt;
          if (dustAcc > 0.14) {
            dustAcc = 0;
            particles.dust(s.x, g, s.z, 2, plan.pavedAt?.(s.x, s.z) > 0.5 ? [0.8, 0.78, 0.72] : [0.62, 0.7, 0.42]);
          }
          pose = 'run';
        }
        if (air) pose = 'air';
      } else if (mode === 'climb') {
        let dy = 0;
        if (keyDown('KeyW') || keyDown('ArrowUp')) dy += 1;
        if (keyDown('KeyS') || keyDown('ArrowDown')) dy -= 1;
        const top = tree.ground + tree.top;
        s.y = Math.min(top, Math.max(tree.ground, s.y + dy * 1.7 * dt));
        s.groundY = tree.ground;
        if (dy) st.stamina = Math.max(0, st.stamina - dt * 4);
        moving = dy !== 0 && s.y < top && s.y > tree.ground;
        if (dy < 0 && s.y <= tree.ground + 0.01) {
          mode = 'ground';
          tree = null;
        } else if (s.y >= top - 0.01 && dy > 0) hud.toast('爬到树冠里了。风吹着叶子沙沙响');
        if (st.stamina <= 0 && mode === 'climb') {
          hud.toast('没力气了，抱不住——');
          actions.act('climb');
        }
        pose = mode === 'climb' ? 'climb' : null;
        eye = 1.1;
      } else if (mode === 'swim' || mode === 'dive') {
        const moved = mover.step(dt, s, cam, mode === 'dive' ? 0.5 : 0.42, true);
        moving = moved.moved > 0.003;
        const w = depthHere();
        if (!w || w.depth < 0.85) {
          // 游到岸边：站起来
          mode = 'ground';
          s.y = ground(s.x, s.z);
          hud.toast('上岸了，湿漉漉的');
        } else {
          lastWater = w.level;
          const bed = w.level - w.depth;
          s.groundY = bed;
          if (mode === 'swim') {
            const want = w.level - 1.05 + Math.sin(performance.now() * 0.003) * 0.04;
            s.y += (want - s.y) * Math.min(1, dt * 4);
            st.stamina = Math.max(0, st.stamina - dt * (moving ? 1.2 : 0.4));
            oxygen = Math.min(100, oxygen + dt * 30);
            rippleAcc += dt * (moving ? 5 : 1.2);
            if (rippleAcc > 1) {
              rippleAcc = 0;
              particles.ripple(s.x, w.level, s.z, 0.45, 1.5);
            }
            pose = 'swim';
          } else {
            const want = Math.max(bed + 0.3, w.level - 4.2);
            s.y += (want - s.y) * Math.min(1, dt * 1.4);
            oxygen = Math.max(0, oxygen - dt * 7);
            bubbleAcc += dt * 4;
            if (bubbleAcc > 1) {
              bubbleAcc = 0;
              particles.emit({ x: s.x + (Math.random() - 0.5) * 0.3, y: s.y + 1.2, z: s.z + (Math.random() - 0.5) * 0.3, vy: 0.6, float: 0.8, life: Math.max(0.4, (w.level - s.y - 1.2) / 1.2), size: 0.06 + Math.random() * 0.06, shape: 'bubble', color: [0.9, 0.97, 1.0], alpha: 0.8, wobble: 0.3, fade: 0 });
            }
            if (oxygen <= 0) {
              hud.toast('憋不住了！浮上去换气');
              mode = 'swim';
            }
            pose = 'dive';
            eye = 0.8;
          }
        }
      } else if (mode === 'lie') {
        s.groundY = s.y = ground(s.x, s.z);
        lieTime += dt;
        const h = Math.floor(st.minutes / 60) % 24;
        const day = h >= 6 && h < 19;
        const sunny = weather?.kind === 'sunny' || weather?.kind === 'clear';
        // 晒太阳：时间过得快、体力回得快；大太阳下还会有点口渴（饱食掉得快一点）
        st.minutes += dt * (day ? 10 : 6);
        st.stamina = Math.min(100, st.stamina + dt * (sunny && day ? 5 : 3));
        if (weather?.kind === 'sunny') st.hunger = Math.max(0, st.hunger - dt * 0.4);
        towel.visible = true;
        towel.position.set(s.x, s.y + 0.04, s.z);
        towel.rotation.y = s.yaw;
        if (weather && weather.info.rain > 0.25) {
          hud.toast('下雨了，赶紧收毯子');
          standUp();
        }
        pose = 'lie';
        eye = 0.9;
      } else if (mode === 'fish') {
        s.groundY = s.y = ground(s.x, s.z);
        pose = 'fish';
        if (floatAt) {
          // 竿子从她手里斜着伸向水面，线垂到浮漂上；上钩的时候浮漂往下一沉一沉
          const [fx, fz] = forward();
          rod.position.set(s.x + fx * 0.25, s.y + 0.55, s.z + fz * 0.25);
          const dir = new THREE.Vector3(floatAt.x - rod.position.x, 0, floatAt.z - rod.position.z).normalize();
          dir.y = 0.75;
          rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
          rod.updateMatrixWorld(true);
          const tip = new THREE.Vector3(0, 2.2, 0).applyMatrix4(rod.matrixWorld);
          const bite = game.fishing?.phase === 'bite';
          const t = performance.now() * 0.001;
          const dip = bite ? -0.09 + Math.sin(t * 22) * 0.05 : Math.sin(t * 1.6) * 0.012;
          float.position.set(floatAt.x, floatAt.y + dip, floatAt.z);
          const p = lineGeo.attributes.position;
          p.setXYZ(0, tip.x, tip.y, tip.z);
          p.setXYZ(1, floatAt.x, floatAt.y + 0.05, floatAt.z);
          p.needsUpdate = true;
          rippleAcc += dt * (bite ? 8 : 0.6);
          if (rippleAcc > 1) {
            rippleAcc = 0;
            particles.ripple(floatAt.x, floatAt.y, floatAt.z, bite ? 0.25 : 0.15, 1.3);
          }
        }
      }

      // 水下的鱼
      if (fish) {
        const kind = mode === 'dive' ? plan.waterKind(s.x, s.z) : null;
        for (const [water, sc] of Object.entries(fish)) {
          sc.batch.visible = water === kind;
          if (water !== kind || lastWater == null) continue;
          const t = performance.now() * 0.001;
          sc.school.forEach((f, i) => {
            const a = f.a + t * f.w;
            const x = s.x + Math.cos(a) * f.r;
            const z = s.z + Math.sin(a) * f.r;
            const bed = plan.heightAt(x, z);
            const y = Math.min(lastWater - 0.6, Math.max(bed + 0.3, s.y + 0.4 + (f.h - 0.5) * 2.2));
            sc.at.setXYZ(i, x, y, z);
          });
          sc.at.needsUpdate = true;
        }
      }
      return { moving, pose, eye };
    },
    /** 出门/进门的时候把状态归零 */
    reset() {
      mode = 'ground';
      air = false;
      tree = null;
      towel.visible = false;
      rod.visible = line.visible = float.visible = false;
      if (fish) for (const sc of Object.values(fish)) sc.batch.visible = false;
    },
  };
  return actions;
}
