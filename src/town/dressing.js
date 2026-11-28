// 把模型库里转过来的那三百多种模型（public/models4/lib*.glb，tools/ghibli4/import_lib.py）摆到地图上。
// 每一件都先问占地（city.js 的朝向矩形）：不进房子、不压路、不下水、脚下够平，才放；放下之后自己也登记占地，后来的树会让开它。
// 规则按"它在世界里本来该在哪儿"分：房侧的杂物、街边的街具、公交站、集市和码头的场子、高铁站前、农家、水上的船、
// 各镇添的地标、成群的鸟、摊上的鱼。末了数一遍哪些型号一件都没摆出去（stats.unused），不留暗角。
import { SEGS, STREET_HALF, LANE_HALF, BUS_STOPS, RAIL_STATIONS, LAKE, SEA, HALF, RIVER_HALF, district, roadEdge, heightAt, waterAt, coastD, fieldsAt, builtAt, pavedAt, plazaDistance, snowAt, beachAt, riverPoint, riverAt, riverLevel, lakeDistance } from './plan.js';

const TAU = Math.PI * 2;

export function dress({ kit, random, painted, inst, makeRect, rectHit, rectNear, freeC, collide, railNear, faceRoad, extras = [], add = null }) {
  const VEH_LABEL = {
    car: ['小汽车', 'E 开车'],
    truck: ['小货车', 'E 开车'],
    bus: ['乡间巴士', 'E 开巴士'],
    bicycle: ['自行车', 'E 骑上去'],
    veh_wheelbarrow: ['独轮车', 'E 推车走'],
    prop_handcart: ['手推车', 'E 推车走'],
    fishboat: ['小渔船', 'E 推下水去划'],
    sailboat: ['小帆船', 'E 推下水去划'],
  };
  const SEAT_RE = /^(bench|prop_bench_|st_.*seat|inf_swing-bench|fur_(dining_chair|chair-old|armchair|rattan-sofa|settee|welcome-bench|milking-stool|stool-three-leg))/;
  let seq = 0;
  const count = new Map();
  const where = new Map(); // 每种模型摆出去的某一件在哪（质检时去那儿看）
  const item = (id) => kit.byId.get(id);
  const pick = (arr) => arr[Math.floor(random() * arr.length) % arr.length];
  /** 库里的小件里，名字对得上的那些 */
  const ids = (re) => kit.items.filter((it) => ((it.lib && it.style === 'lib') || it.style === 'prop') && re.test(it.id)).map((it) => it.id);
  const D = (id) => district(id);

  /** 看着是水的地方（水面比 waterAt 认的宽一圈：浅滩、岸边那道水线）：不是浮着的东西都不往这儿放。 */
  const soggy = (x, z) => {
    const h = heightAt(x, z);
    const rv = riverAt(x, z);
    if (rv.d < RIVER_HALF + 14 && h < riverLevel(rv.t) + 0.12) return true;
    if (lakeDistance(x, z) < 1.45 && h < LAKE.level + 0.12) return true;
    return h < SEA.level + 0.12;
  };
  /**
   * 放一件。o.gap 和别的东西留的缝；o.road 四角离路边至少多远（null = 不问）；o.flat 脚下容许的落差；
   * o.afloat 在水上；o.loose 不问占地（鸟、船）；o.circles 也让开地标圈出来的圆；o.solid=false 不设碰撞。
   */
  const put = (id, x, z, turn = 0, o = {}) => {
    const it = item(id);
    if (!it || Math.abs(x) > HALF - 25 || Math.abs(z) > HALF - 25) return null;
    const scale = o.scale ?? 1;
    const wet = waterAt(x, z) != null;
    if (o.afloat ? !wet : wet || (o.y == null && soggy(x, z))) return null;
    const r = makeRect(x, z, turn, it.bounds, scale, 'big');
    if (!o.loose) {
      if (rectHit(r, o.gap ?? 0.25)) return null;
      if (o.circles && !freeC(x, z, Math.min(r.rad, 8))) return null;
      if (railNear(x, z, 5 + r.rad)) return null;
      let lo = 1e9;
      let hi = -1e9;
      const road = o.road === undefined ? 0.3 : o.road;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const px = r.x + u * r.hw * r.c + v * r.hd * r.s;
        const pz = r.z - u * r.hw * r.s + v * r.hd * r.c;
        if (road !== null && roadEdge(px, pz) < road) return null;
        if (!o.afloat && waterAt(px, pz) != null) return null;
        const y = heightAt(px, pz);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      if (hi - lo > (o.flat ?? Math.max(0.5, 0.1 * r.rad + 0.35))) return null;
    }
    const e = inst(id, x, z, turn, { scale, y: o.y, norect: !!o.loose, wall: o.wall, roof: o.roof, accent: o.accent });
    e.auto = true;
    // 碰撞盒跟着模型的朝向；顶是模型的高度——矮的（箱子、长椅、车斗）跳得上去、站得住
    if (!o.loose && o.solid !== false && it.h * scale > 0.3 && Math.min(r.hw, r.hd) > 0.2) e.col = collide(r.x, r.z, r.hw, r.hd, it.h * scale, turn);
    // 栈桥的桥面、泊着的船：架在水上，人可以走上去
    if (o.loose && o.y != null && (id === 'pier' || /boat$/.test(id))) e.col = collide(r.x, r.z, r.hw - 0.05, r.hd, id === 'pier' ? 0.55 : id === 'rowboat' ? 0.22 : 0.5, turn, o.y);
    count.set(id, (count.get(id) ?? 0) + 1);
    if (!where.has(id) || random() < 0.2) where.set(id, [Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(turn * 100) / 100]);
    if (add && !o.bird) {
      if (VEH_LABEL[id]) {
        const [vname, hint] = VEH_LABEL[id];
        const isBoat = /boat$/.test(id);
        add({
          id: `dress-veh-${id}-${++seq}`,
          name: vname,
          kind: 'vehicle',
          vehicle: isBoat ? 'transport-rowboat' : id,
          x,
          z,
          r: Math.max(2.2, Math.max(it.w, it.d) * 0.65),
          hint,
          model: e,
          accent: o.accent ?? null,
          map: false,
        });
      } else if (SEAT_RE.test(id)) {
        add({
          id: `dress-seat-${id}-${++seq}`,
          name: '长椅',
          kind: 'chair',
          x,
          z,
          r: 2.3,
          hint: 'E 坐下',
          seat: { x, y: (o.y ?? heightAt(x, z)) + 0.44, z, yaw: turn },
          map: false,
        });
      }
    }
    return e;
  };
  /** 在 (cx, cz) 周围 R 米里给一件大东西找块地。 */
  const site = (id, cx, cz, R, o = {}) => {
    const it = item(id);
    if (!it) return null;
    for (let i = 0; i < (o.tries ?? 260); i++) {
      const a = random() * TAU;
      const rr = (o.minR ?? 0) + (R - (o.minR ?? 0)) * Math.sqrt(random());
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      if (!o.fields && fieldsAt(x, z) > 0.3) continue;
      if (pavedAt(x, z) > 0.25 || plazaDistance(x, z) < 44 || beachAt(x, z) > 0.3) continue;
      const e = put(id, x, z, o.turn ?? faceRoad(x, z), { gap: 1.2, road: 1.0, circles: true, flat: 1.6, ...o });
      if (e) return e;
    }
    return null;
  };
  /** 一圈场子里随手摆 n 件，脸朝场子中间。 */
  const yard = (cx, cz, R, pool, n, o = {}) => {
    let made = 0;
    for (let i = 0; i < n * 6 && made < n; i++) {
      const a = random() * TAU;
      const rr = R * (0.25 + 0.75 * Math.sqrt(random()));
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      if (o.town && pavedAt(x, z) < 0.3 && builtAt(x, z) < 0.5) continue;
      if (put(pick(pool), x, z, Math.atan2(cx - x, cz - z) + (random() - 0.5) * 0.5, { gap: 0.5, road: 0.5, ...o })) made++;
    }
    return made;
  };
  /** 一群鸟：落在地上（或浮在水上）。 */
  const flock = (id, cx, cz, n, spread, o = {}) => {
    const it = item(id);
    if (!it) return;
    const scale = o.scale ?? (Math.max(it.w, it.d) < 0.6 ? 1.7 : 1.0);
    for (let i = 0; i < n * 4 && n > 0; i++) {
      const a = random() * TAU;
      const d = spread * Math.sqrt(random());
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const level = waterAt(x, z);
      if (o.afloat ? level == null : level != null) continue;
      if (!o.afloat && (rectNear(x, z, 0.5) || roadEdge(x, z) < 0.6)) continue;
      put(id, x, z, random() * TAU, { loose: true, afloat: !!o.afloat, scale, y: o.afloat ? level : undefined });
      n--;
    }
  };

  const PAINTS = [[0.14, 0.34, 0.3], [0.16, 0.3, 0.52], [0.62, 0.17, 0.14], [0.82, 0.6, 0.2], [0.2, 0.42, 0.24], [0.8, 0.36, 0.16], [0.24, 0.46, 0.6], [0.9, 0.86, 0.74]];
  const paintOf = () => pick(PAINTS);

  // ---------------------------------------------------------------------------------------- 1. 房侧的杂物
  const TOWN = ids(/^(prop_(barrel|crate|planter_wood|planter_stone|ladder|laundry_rack|handcart|bench_wood|bench_iron|bin_barrel)|misc_(pottery|waterjar|wood_sign|birdhouse|stone_steps)|bicycle$|con_|inf_(urn-planter|planter-box|bike-rack|swing-bench)|flower_|st_(hanging-planter|station-flower-bed)|fur_(washing-tub|flower-basket|barrel|milking-stool|welcome-bench)|tool_(can_small|watering_large))/);
  const FARM = ids(/^(farm_(haystack|scarecrow|beehive|toolrack|trellis|trough|chicken_coop|well|grape_arbor|fence_a|fence_b|fence_gate)|veh_wheelbarrow|prop_(handcart|barrel|crate|ladder)|tool_|con_(churn|mixed|cloth|wicker|barrel)|fur_(milking-stool|washing-tub|smith-workbench|smith-bellows|bellows|furnace|kettle-stand|kettle-iron))/);
  const JP = ids(/^(misc_(stone_lantern|waterjar|pottery|bamboo|rock_garden)|prop_(bench_wood|planter_wood)|con_ceramic|fur_(bamboo-screen|vase-tall|tea-table-low|oil-lamp|jug-earthenware)|inf_hanging-lantern|flower_)/);
  for (const h of painted) {
    const it = item(h.kit);
    if (!it || !h.rect) continue;
    const pool = it.style === 'jp' ? JP : h.styleKit === 'farm' ? FARM : TOWN;
    if (!pool.length) continue;
    const n = random() < 0.42 ? 1 : random() < 0.4 ? 2 : 0;
    const c = Math.cos(h.turn);
    const s = Math.sin(h.turn);
    for (let k = 0; k < n; k++) {
      const id = pick(pool);
      const p = item(id);
      const where = random();
      let lx;
      let lz;
      let turn;
      if (where < 0.4) {
        // 靠着后墙
        lx = (it.bounds[0] + (it.bounds[1] - it.bounds[0]) * (0.15 + 0.7 * random())) * h.scale;
        lz = -it.bounds[3] * h.scale - p.d / 2 - 0.22;
        turn = h.turn + Math.PI;
      } else {
        // 靠着侧墙
        const side = where < 0.7 ? -1 : 1;
        lx = (side > 0 ? it.bounds[1] : it.bounds[0]) * h.scale + side * (p.d / 2 + 0.22);
        lz = -(it.bounds[2] + (it.bounds[3] - it.bounds[2]) * (0.15 + 0.7 * random())) * h.scale;
        turn = h.turn + (side * Math.PI) / 2;
      }
      put(id, h.x + lx * c + lz * s, h.z - lx * s + lz * c, turn + (random() - 0.5) * 0.24, { gap: 0.1, road: 0.5 });
    }
  }

  // ---------------------------------------------------------------------------------------- 2. 街边、路边
  const STREET = ids(/^(prop_(bin_pair|bin_barrel|mailbox|phonebooth|hydrant|sign_street|treegrate|bench_iron|bench_wood|lamp_classic|lamp_garden|planter_stone)|misc_(signpost|flag)|inf_(bollard|bollard-light|globe-lamp|sign-post|drinking-fountain|bike-rack|urn-planter|planter-box|info-kiosk)|st_(litter-bin-pair|backlit-poster|street-plate|bus-stop-lamp|waiting-room-seat|direction-sign)|bicycle)$/);
  const ROADSIDE = ids(/^(misc_signpost|inf_sign-post|st_direction-sign|prop_sign_street|misc_wood_sign|inf_taxi-rank-sign)$/);
  const LANE = ids(/^(misc_(signpost|wood_sign|birdhouse)|farm_(fence_a|fence_b|scarecrow|haystack)|prop_railing_wood|tool_)/);
  for (const g of SEGS) {
    const len = Math.hypot(g.bx - g.ax, g.bz - g.az);
    if (len < 12) continue;
    const ux = (g.bx - g.ax) / len;
    const uz = (g.bz - g.az) / len;
    const half = g.lane ? LANE_HALF : STREET_HALF;
    const pool = g.kind === 'street' ? STREET : g.lane ? LANE : ROADSIDE;
    if (!pool.length) continue;
    const every = g.kind === 'street' ? 11 : g.lane ? 46 : 64;
    for (let t = 5 + random() * every; t < len - 4; t += every * (0.6 + 0.8 * random())) {
      const side = random() < 0.5 ? -1 : 1;
      const id = pick(pool);
      const p = item(id);
      const off = half + 0.5 + p.d / 2 + (g.kind === 'street' ? 0 : random() * 1.5);
      const x = g.ax + ux * t - uz * side * off;
      const z = g.az + uz * t + ux * side * off;
      if (g.kind === 'street' && builtAt(x, z) < 0.35) continue;
      const e = put(id, x, z, Math.atan2(uz * side, -ux * side), { gap: 0.12, road: 0.25 });
      // 栏杆、篱笆：顺着路再接两三段
      if (e && /fence_|railing/.test(id)) {
        for (let k = 1; k <= 2; k++) put(id, x + ux * p.w * k, z + uz * p.w * k, Math.atan2(uz * side, -ux * side), { gap: 0.02, road: 0.25 });
      }
    }
  }

  // ---------------------------------------------------------------------------------------- 3. 公交站
  const SHELTER = ids(/^(prop_busstop|inf_bus-shelter|st_forecourt-bus-shelter|st_shelter-iron)$/);
  const STOPSIDE = ids(/^(st_bus-stop-bin|st_bus-stop-lamp|inf_taxi-rank-sign|st_backlit-poster|st_taxi-waiting-seat|st_waiting-seat-row|prop_bin_pair)$/);
  for (const stop of BUS_STOPS) {
    let best = null;
    for (const g of SEGS) {
      const dx = g.bx - g.ax;
      const dz = g.bz - g.az;
      const t = Math.min(1, Math.max(0, ((stop.x - g.ax) * dx + (stop.z - g.az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(stop.x - (g.ax + dx * t), stop.z - (g.az + dz * t));
      if (!best || d < best.d) best = { d, g, t, len: Math.hypot(dx, dz) };
    }
    if (!best || best.d > 60 || !SHELTER.length) continue;
    const { g, len } = best;
    const ux = (g.bx - g.ax) / len;
    const uz = (g.bz - g.az) / len;
    const half = g.lane ? LANE_HALF : STREET_HALF;
    let done = false;
    for (let k = 0; k < 14 && !done; k++) {
      const side = k % 2 ? 1 : -1;
      const along = best.t * len + (Math.floor(k / 2) - 3) * 5;
      const id = pick(SHELTER);
      const off = half + 0.7 + item(id).d / 2;
      const x = g.ax + ux * along - uz * side * off;
      const z = g.az + uz * along + ux * side * off;
      const turn = Math.atan2(uz * side, -ux * side);
      if (!put(id, x, z, turn, { gap: 0.3, road: 0.3 })) continue;
      done = true;
      let step = item(id).w / 2 + 0.9;
      for (const extra of [pick(STOPSIDE), pick(STOPSIDE), pick(STOPSIDE)]) {
        const w = item(extra).w;
        put(extra, x + ux * (step + w / 2), z + uz * (step + w / 2), turn, { gap: 0.1, road: 0.25 });
        step += w + 0.5;
      }
    }
  }

  // 停在路边的车：小汽车、三轮货车，顺着路的方向，贴着路牙；隔一个公交站停一辆公交
  for (const g of SEGS) {
    if (g.lane) continue;
    const len = Math.hypot(g.bx - g.ax, g.bz - g.az);
    if (len < 30) continue;
    const ux = (g.bx - g.ax) / len;
    const uz = (g.bz - g.az) / len;
    for (let t = 12 + random() * 60; t < len - 10; t += 50 + random() * 90) {
      const side = random() < 0.5 ? -1 : 1;
      const id = random() < 0.6 ? 'car' : 'truck';
      const off = STREET_HALF + 1.1;
      const x = g.ax + ux * t - uz * side * off;
      const z = g.az + uz * t + ux * side * off;
      if (builtAt(x, z) < 0.3 && random() < 0.7) continue;
      put(id, x, z, Math.atan2(ux * side, uz * side), { gap: 0.3, road: null, accent: paintOf() });
    }
  }
  BUS_STOPS.forEach((stop, i) => {
    if (i % 2) return;
    for (let k = 0; k < 60; k++) {
      const x = stop.x + (random() - 0.5) * 60;
      const z = stop.z + (random() - 0.5) * 60;
      const e = roadEdge(x, z);
      if (e < 1.6 || e > 3) continue;
      if (put('bus', x, z, faceRoad(x, z) + Math.PI / 2, { gap: 0.5, road: 0.2, accent: pick([[0.16, 0.36, 0.56], [0.64, 0.2, 0.16], [0.2, 0.44, 0.3]]) })) break;
    }
  });

  // ---------------------------------------------------------------------------------------- 4. 集市、小广场、码头的场子
  const MARKET = ids(/^(fishcrate$|prop_(stall_veg|stall_flower|stall_fish|stall_fruit|umbrella|kiosk|pergola|lamp_garden|crate|barrel|handcart)|st_(cafe-kiosk|newspaper-kiosk|digital-kiosk|forecourt-info-booth|rank-info-booth|amenity-phone-booth|amenity-drinking-fountain|charging-table)|inf_(bandstand|info-kiosk|tiered-fountain|lily-fountain|globe-lamp)|misc_flag|con_(wicker|crate|cloth))/);
  const QUAY = ids(/^(fishcrate$|fishrack$|misc_(net_rack|rope_knot|boardwalk|flag)|st_(cleat-post|ferry-gate|ferry-waiting-seat|forklift|rank-luggage-stand|bollard-light)|prop_(lamp_industrial|barrel|crate|stall_fish|handcart)|con_(barrel|mixed|wicker|crate)|inf_bollard)/);
  const CAFE_T = ids(/^fur_(dining_table|table-dining-small|table-dining|coffee_table|tea-table-low|side-table)$/);
  const CAFE_C = ids(/^fur_(dining_chair|chair-old|stool-three-leg|milking-stool|armchair|rattan-sofa|settee)$/);
  const FISH = ids(/^fish_(guppy|pond-loach|clownfish)$/);
  /** 一桌：桌子，围两三把椅子，有的撑一把伞 */
  const cafe = (cx, cz, R, n) => {
    for (let i = 0, made = 0; i < n * 8 && made < n && CAFE_T.length; i++) {
      const a = random() * TAU;
      const rr = R * Math.sqrt(random());
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const tid = pick(CAFE_T);
      const turn = random() * TAU;
      if (rectNear(x, z, 1.9) || roadEdge(x, z) < 1.6 || !put(tid, x, z, turn, { gap: 0.4, road: 0.6 })) continue;
      made++;
      const seats = 2 + Math.floor(random() * 3);
      const reach = Math.max(item(tid).w, item(tid).d) / 2 + 0.42;
      for (let k = 0; k < seats; k++) {
        const b = turn + (k / seats) * TAU + 0.4;
        const cid = pick(CAFE_C);
        // 椅子脸朝桌子
        put(cid, x + Math.sin(b) * reach, z + Math.cos(b) * reach, b + Math.PI, { gap: 0.03, road: 0.3 });
      }
      if (random() < 0.5) put('prop_umbrella', x + 0.2, z + 0.2, random() * TAU, { loose: true });
    }
  };
  for (const [id, n, tables] of [['market', 16, 3], ['flowermarket', 14, 2], ['food', 14, 7], ['civic', 12, 4], ['supermarket', 5, 0], ['cinema', 5, 2], ['library', 4, 2], ['lakeside', 10, 5], ['seaside', 10, 5], ['university', 12, 5], ['newtown', 10, 4], ['aitown', 12, 5], ['pastoral', 6, 2], ['snowtown', 6, 2], ['cbd', 10, 4], ['beach', 6, 8]]) {
    const d = D(id);
    if (!d) continue;
    const R = Math.min(d.r, 60);
    yard(d.x, d.z, R, MARKET, n);
    cafe(d.x, d.z, R, tables);
  }
  for (const [id, n] of [['fishmarket', 16], ['seafood', 12], ['port', 26], ['harbor', 22], ['lighthouse', 5]]) {
    const d = D(id);
    if (!d) continue;
    yard(d.x, d.z, Math.min(d.r, 70), QUAY, n);
    yard(d.x, d.z, Math.min(d.r, 50), MARKET, Math.round(n / 3));
    cafe(d.x, d.z, Math.min(d.r, 40), id === 'seafood' ? 8 : 2);
  }
  // 灯串：两根杆子之间拉一串小灯笼
  for (const id of ['market', 'food', 'seafood', 'flowermarket', 'beach', 'lakeside', 'fishmarket']) {
    const d = D(id);
    const pole = item('prop_lamp_string');
    const str = item('misc_lantern_str');
    if (!d || !pole || !str) continue;
    for (let k = 0, made = 0; k < 40 && made < 3; k++) {
      const a = random() * TAU;
      const x = d.x + Math.cos(a) * d.r * 0.6 * random();
      const z = d.z + Math.sin(a) * d.r * 0.6 * random();
      const t = random() * Math.PI;
      const dx = (Math.cos(t) * str.w) / 2;
      const dz = (-Math.sin(t) * str.w) / 2;
      if (rectNear(x, z, 1.2) || !put('prop_lamp_string', x - dx, z - dz, t, { gap: 0.2, road: 0.4 })) continue;
      if (!put('prop_lamp_string', x + dx, z + dz, t + Math.PI, { gap: 0.2, road: 0.4 })) continue;
      put('misc_lantern_str', x, z, t, { loose: true, y: Math.max(heightAt(x - dx, z - dz), heightAt(x + dx, z + dz)) + pole.h - 1.0 });
      made++;
    }
  }

  // ---------------------------------------------------------------------------------------- 5. 高铁站和各站前
  const STATION = ids(/^(st_|inf_(bollard-light|globe-lamp|info-kiosk|bike-rack|taxi-rank-sign)|prop_(bin_pair|bench_iron|phonebooth|mailbox|kiosk))/);
  {
    const d = D('station');
    if (d) {
      yard(d.x, d.z + 30, 46, STATION, 46, { gap: 0.6, town: true });
      site('veh_platform', d.x, d.z + 40, 60, { gap: 0.8, circles: false });
      site('inf_clock-tower', d.x, d.z + 36, 40, { circles: false });
    }
    for (const st of RAIL_STATIONS ?? []) {
      const x = st.x ?? st[0];
      const z = st.z ?? st[1];
      if (x == null) continue;
      yard(x, z, 34, STATION, 10, { gap: 0.6, town: true });
    }
  }

  // ---------------------------------------------------------------------------------------- 6. 农家
  for (const [id, R] of [['farm', 90], ['pastoral', 130], ['fields', 170], ['orchard', 90]]) {
    const d = D(id);
    if (!d) continue;
    for (const big of ['farm_barn', 'farm_silo', 'farm_greenhouse', 'farm_mill', 'farm_windmill', 'farm_chicken_coop', 'farm_well', 'farm_grape_arbor']) site(big, d.x, d.z, R, { fields: false });
    // 磨坊边上靠一架水车
    const e = site('farm_mill', d.x, d.z, R);
    if (e) put('farm_waterwheel', e.x + Math.cos(e.turn) * (item('farm_mill').w / 2 + 0.5), e.z - Math.sin(e.turn) * (item('farm_mill').w / 2 + 0.5), e.turn + Math.PI / 2, { loose: true });
    // 一排蜂箱
    for (let k = 0; k < 3; k++) {
      const a = random() * TAU;
      const x = d.x + Math.cos(a) * R * 0.6;
      const z = d.z + Math.sin(a) * R * 0.6;
      for (let i = 0; i < 4; i++) put('farm_beehive', x + i * 1.5, z, 0.2, { gap: 0.2, road: 1 });
    }
  }
  // 田里的稻草人、田埂上的草垛
  for (let i = 0, made = 0; i < 600 && made < 46; i++) {
    const f = random() < 0.75 ? D('fields') : D('farm');
    const x = f.x + (random() - 0.5) * 2 * (f.r + 30);
    const z = f.z + (random() - 0.5) * 2 * (f.r + 30);
    if (fieldsAt(x, z) < 0.5) continue;
    if (put(random() < 0.7 ? 'farm_scarecrow' : 'farm_haystack', x, z, random() * TAU, { gap: 0.6, road: 1.2 })) made++;
  }
  // 围起来的一圈：田园小镇边上养着鸵鸟和美洲鸵
  {
    const d = D('pastoral');
    const fence = item('farm_fence_b');
    if (d && fence) {
      for (let k = 0; k < 60; k++) {
        const cx = d.x + (random() - 0.5) * 220;
        const cz = d.z + (random() - 0.5) * 220;
        const n = 4;
        const half = (fence.w * n) / 2;
        if (rectNear(cx, cz, half * 1.5) || roadEdge(cx, cz) < half * 1.5 + 1 || waterAt(cx, cz) != null || fieldsAt(cx, cz) > 0.3) continue;
        if (Math.abs(heightAt(cx + half, cz) - heightAt(cx - half, cz)) > 0.8 || Math.abs(heightAt(cx, cz + half) - heightAt(cx, cz - half)) > 0.8) continue;
        flock('bird_hen', cx, cz, 6, half * 0.7, { scale: 1.25 });
        flock('bird_rooster', cx, cz, 1, half * 0.5, { scale: 1.25 });
        for (let i = 0; i < n; i++) {
          const t = -half + fence.w * (i + 0.5);
          put('farm_fence_b', cx + t, cz - half, 0, { gap: 0, road: 0.3, flat: 2 });
          put('farm_fence_b', cx + t, cz + half, 0, { gap: 0, road: 0.3, flat: 2 });
          put('farm_fence_b', cx - half, cz + t, Math.PI / 2, { gap: 0, road: 0.3, flat: 2 });
          put(i === 1 ? 'farm_fence_gate' : 'farm_fence_b', cx + half, cz + t, Math.PI / 2, { gap: 0, road: 0.3, flat: 2 });
        }
        put('farm_trough', cx + half * 0.5, cz - half * 0.6, 0.3, { gap: 0.2 });
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------------------- 7. 水上的船、岸边的栏杆
  {
    const boats = [];
    const far = (x, z, d) => boats.every((b) => Math.hypot(b[0] - x, b[1] - z) > d);
    for (let i = 0, made = 0; i < 300 && made < 12; i++) {
      const a = random() * TAU;
      const k = 0.25 + 0.6 * random();
      const x = LAKE.x + Math.cos(a) * LAKE.rx * k;
      const z = LAKE.z + Math.sin(a) * LAKE.rz * k;
      if (waterAt(x, z) !== LAKE.level || heightAt(x, z) > LAKE.level - 1.2 || !far(x, z, 22)) continue;
      const id = random() < 0.62 ? 'rowboat' : 'sailboat';
      if (put(id, x, z, random() * TAU, { loose: true, afloat: true, y: LAKE.level, accent: paintOf() })) (boats.push([x, z]), made++);
    }
    for (const [id, n] of [['port', 9], ['harbor', 8], ['beach', 6], ['seaside', 6], ['lighthouse', 3], ['seafood', 4]]) {
      const d = D(id);
      if (!d) continue;
      for (let i = 0, made = 0; i < 500 && made < n; i++) {
        const a = random() * TAU;
        const rr = 40 + random() * 190;
        const x = d.x + Math.cos(a) * rr;
        const z = d.z + Math.sin(a) * rr;
        if (waterAt(x, z) !== SEA.level || heightAt(x, z) > SEA.level - 2.2 || coastD(x, z) > -12 || !far(x, z, 26)) continue;
        const boat = random() < 0.55 ? 'fishboat' : random() < 0.6 ? 'sailboat' : 'rowboat';
        if (put(boat, x, z, random() * TAU, { loose: true, afloat: true, y: SEA.level, accent: paintOf() })) (boats.push([x, z]), made++);
      }
    }
    // 湖边的栈桥：岸上那头搭在岸边，往湖心伸进水里
    for (let i = 0, made = 0; item('pier') && i < 120 && made < 5; i++) {
      const a = random() * TAU;
      let k = 0.8;
      while (k < 1.4 && waterAt(LAKE.x + Math.cos(a) * LAKE.rx * k, LAKE.z + Math.sin(a) * LAKE.rz * k) != null) k += 0.01;
      const sx = LAKE.x + Math.cos(a) * LAKE.rx * k;
      const sz = LAKE.z + Math.sin(a) * LAKE.rz * k;
      const nx = LAKE.x - sx;
      const nz = LAKE.z - sz;
      const nl = Math.hypot(nx, nz) || 1;
      if (rectNear(sx, sz, 5) || !far(sx + (nx / nl) * 8, sz + (nz / nl) * 8, 12) || waterAt(sx + (nx / nl) * 10, sz + (nz / nl) * 10) == null) continue;
      if (!put('pier', sx + (nx / nl) * 0.6, sz + (nz / nl) * 0.6, Math.atan2(nx, nz), { loose: true, y: LAKE.level })) continue;
      boats.push([sx + (nx / nl) * 6, sz + (nz / nl) * 6]);
      made++;
      // 栈桥头上拴一条小船
      put('rowboat', sx + (nx / nl) * 9 - (nz / nl) * 2.2, sz + (nz / nl) * 9 + (nx / nl) * 2.2, Math.atan2(nx, nz) + 0.2, { loose: true, afloat: true, y: LAKE.level, accent: paintOf() });
    }
    // 岸边的栏杆：湖边小镇那一段、城里的河两岸
    const rail = (x, z, tx, tz, id, n) => {
      const p = item(id);
      if (!p) return;
      for (let k = 0; k < n; k++) put(id, x + tx * p.w * k, z + tz * p.w * k, Math.atan2(-tz, tx), { gap: 0.02, road: 0.3, flat: 1.2, solid: false });
    };
    for (let i = 0; i < 40; i++) {
      const a = random() * TAU;
      const x = LAKE.x + Math.cos(a) * LAKE.rx * 1.2;
      const z = LAKE.z + Math.sin(a) * LAKE.rz * 1.2;
      if (builtAt(x, z) < 0.3 || lakeDistance(x, z) < 1.17) continue;
      rail(x, z, -Math.sin(a), Math.cos(a) * (LAKE.rz / LAKE.rx), 'prop_railing_wood', 4);
    }
    for (let t = 0.05; t < 0.9; t += 0.012) {
      const s0 = riverPoint(t);
      for (const side of [-1, 1]) {
        const off = RIVER_HALF + 5.5;
        const x = s0[0] - s0[3] * side * off;
        const z = s0[1] + s0[2] * side * off;
        if (builtAt(x, z) < 0.55 || random() < 0.45 || riverAt(x, z).d < RIVER_HALF + 3) continue;
        rail(x, z, s0[2], s0[3], 'prop_railing_stone', 3);
      }
    }
    // 沙滩上的木栈道
    const bw = item('misc_boardwalk');
    const bd = D('beach');
    for (let i = 0, made = 0; bw && bd && i < 200 && made < 6; i++) {
      const x = bd.x + (random() - 0.5) * 300;
      const z = bd.z + (random() - 0.5) * 160;
      if (beachAt(x, z) < 0.6 || waterAt(x, z) != null) continue;
      const t = random() * Math.PI;
      if (!put('misc_boardwalk', x, z, t, { gap: 0.3, flat: 0.5, solid: false })) continue;
      made++;
      put('misc_boardwalk', x + Math.cos(t) * bw.w, z - Math.sin(t) * bw.w, t, { gap: 0.02, flat: 0.6, solid: false });
    }
  }

  // ---------------------------------------------------------------------------------------- 8. 各镇添的地标
  for (const [id, where, R, o] of [
    ['lm_church', 'lakeside', 130], ['lm_temple', 'pastoral', 150], ['lm_library', 'university', 140], ['lm_gym', 'newtown', 150],
    ['lm_lighthouse', 'harbor', 110], ['lm_lighthouse', 'beach', 150], ['lm_station', 'seaside', 220], ['lm_station', 'newtown', 220], ['lm_station', 'cbd', 200], ['lm_gate', 'snowtown', 130], ['lm_gate', 'pastoral', 130],
    ['lm_guild', 'aitown', 140], ['lm_guild', 'newtown', 140], ['lm_watertower', 'farm', 100], ['lm_watertower', 'fields', 170], ['lm_watertower', 'orchard', 90],
    ['lm_clocktower', 'seaside', 120], ['lm_clocktower', 'newtown', 120], ['lm_clocktower', 'lakeside', 120], ['lm_windmill', 'fields', 190], ['lm_windmill', 'pastoral', 150],
    ['lm_torii', 'temple', 70], ['lm_torii', 'snowtown', 120], ['lm_torii', 'lakeside', 130], ['lm_library', 'aitown', 150], ['lm_church', 'seaside', 150],
    ['inf_clock-tower', 'civic', 50], ['inf_clock-tower', 'university', 90], ['inf_bandstand', 'civic', 50, { scale: 1.7 }], ['inf_bandstand', 'lakeside', 90, { scale: 1.7 }],
    ['inf_bandstand', 'university', 100, { scale: 1.7 }], ['inf_memorial-arch', 'university', 110, { scale: 3 }], ['inf_memorial-arch', 'civic', 60, { scale: 3 }],
    ['inf_basketball-hoop', 'university', 110], ['inf_basketball-hoop', 'newtown', 120], ['inf_basketball-hoop', 'aitown', 120],
    ['inf_footbridge', 'university', 120, { gap: 2 }],
  ]) {
    const d = D(where);
    if (d) site(id, d.x, d.z, R, { minR: id.startsWith('lm_') ? 20 : 0, fields: id === 'lm_windmill' || id === 'lm_watertower', ...(o ?? {}) });
  }

  // ---------------------------------------------------------------------------------------- 9. 鸟
  {
    const spot = (id, r = 0.7) => {
      const d = D(id);
      const a = random() * TAU;
      return [d.x + Math.cos(a) * d.r * r * random(), d.z + Math.sin(a) * d.r * r * random()];
    };
    const shore = (k = 1.2) => {
      const a = random() * TAU;
      return [LAKE.x + Math.cos(a) * LAKE.rx * k, LAKE.z + Math.sin(a) * LAKE.rz * k];
    };
    // 落在东西上：篱笆、栏杆、长椅、石灯笼、路牌、木箱顶上
    const PERCH = /^(fence|bench|stonelantern|crate|logpile|prop_railing_|farm_fence_|prop_bench_|misc_(signpost|wood_sign|stone_lantern|birdhouse)|prop_(mailbox|crate|barrel)|farm_(scarecrow|beehive|trough)|con_barrel)/;
    let owls = 0;
    for (const e of extras.slice()) {
      const owl = (e.kit === 'stonelantern' || e.kit === 'misc_stone_lantern') && owls < 12 && random() < 0.3;
      if (owl) owls++;
      if (!PERCH.test(e.kit) || (!owl && random() > 0.07)) continue;
      const it = item(e.kit);
      const sy = Array.isArray(e.scale) ? e.scale[1] : e.scale;
      const sea = coastD(e.x, e.z) < 120;
      const id = owl ? 'bird_owl' : e.kit === 'misc_signpost' ? pick(['bird_crow', 'bird_sparrow']) : pick(sea ? ['bird_gull', 'bird_gull', 'bird_pigeon'] : ['bird_sparrow', 'bird_sparrow', 'bird_bluetit', 'bird_pigeon', 'bird_crow']);
      put(id, e.x, e.z, random() * TAU, { loose: true, y: (e.y ?? heightAt(e.x, e.z)) + it.h * sy - 0.02 });
    }
    // 落在地上的：只落在铺地、沙滩、路面上（草有半米高，小鸟站进去就看不见了）
    const bare = (x, z) => pavedAt(x, z) > 0.4 || beachAt(x, z) > 0.5 || roadEdge(x, z) < -0.4;
    const ground = (id, cx, cz, n, spread) => {
      for (let i = 0; i < n * 8 && n > 0; i++) {
        const a = random() * TAU;
        const d = spread * Math.sqrt(random());
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        if (!bare(x, z) || rectNear(x, z, 0.4) || waterAt(x, z) != null) continue;
        put(id, x, z, random() * TAU, { loose: true });
        n--;
      }
    };
    for (const id of ['market', 'flowermarket', 'food', 'civic', 'plaza', 'aitown', 'lakeside', 'seaside', 'newtown', 'university', 'station', 'cbd']) {
      for (let i = 0; i < 6; i++) ground(pick(['bird_pigeon', 'bird_pigeon', 'bird_sparrow', 'bird_crow']), ...spot(id, 0.8), 3 + Math.floor(random() * 5), 4);
    }
    for (const id of ['beach', 'harbor', 'port', 'seafood', 'lighthouse', 'fishmarket']) {
      for (let i = 0; i < 6; i++) ground('bird_gull', ...spot(id, 0.9), 3 + Math.floor(random() * 4), 5);
    }
    // 水边的大鸟：白鹭、丹顶鹤（腿长，站在草里也看得见）
    for (let i = 0; i < 12; i++) flock(pick(['bird_egret', 'bird_egret', 'bird_crane']), ...shore(1.2), 1 + Math.floor(random() * 3), 8, { scale: 1 });
    for (let t = 0.06; t < 0.9; t += 0.05) {
      const s0 = riverPoint(t);
      const side = random() < 0.5 ? 1 : -1;
      flock('bird_egret', s0[0] - s0[3] * side * (RIVER_HALF + 5), s0[1] + s0[2] * side * (RIVER_HALF + 5), 1 + Math.floor(random() * 2), 4, { scale: 1 });
    }
    for (const id of ['fields', 'farm']) for (let i = 0; i < 4; i++) flock(pick(['bird_egret', 'bird_crane']), ...spot(id, 1), 2, 8, { scale: 1 });
    // 浮在水上的鸭子
    for (let i = 0; i < 14; i++) flock(pick(['bird_duck', 'bird_duck', 'bird_duck_white']), ...shore(0.45 + 0.45 * random()), 3 + Math.floor(random() * 4), 6, { afloat: true, scale: 1.2 });
    for (let t = 0.08; t < 0.9; t += 0.06) {
      const s0 = riverPoint(t);
      flock('bird_duck', s0[0], s0[1], 2 + Math.floor(random() * 3), 4, { afloat: true, scale: 1.2 });
    }
    // 农家院里的鸡
    for (const h of painted) {
      if (h.styleKit !== 'farm' || random() > 0.4) continue;
      const a = random() * TAU;
      flock('bird_hen', h.x + Math.cos(a) * 9, h.z + Math.sin(a) * 9, 3 + Math.floor(random() * 3), 3, { scale: 1.25 });
      flock('bird_rooster', h.x + Math.cos(a) * 9, h.z + Math.sin(a) * 9, 1, 3, { scale: 1.25 });
    }
  }

  const life = new Set(['bicycle', 'bus', 'car', 'truck', 'rowboat', 'fishboat', 'sailboat', 'pier', 'fishcrate', 'fishrack']);
  const all = kit.items.filter((it) => (it.lib && it.style === 'lib') || life.has(it.id) || it.shape === 'bird');
  const unused = all.filter((it) => !count.has(it.id)).map((it) => it.id);
  let total = 0;
  for (const n of count.values()) total += n;
  return { where: Object.fromEntries(where), placed: total, kinds: count.size, of: all.length, unused, count: Object.fromEntries(count) };
}
