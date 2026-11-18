// 布局自检：每个地点的高度、离湖/河/海多远；路有没有不经过桥就下水；两座桥在不在河上；几个岸边站位。
//   node tools/town-layout.mjs
import * as P from '../src/town/plan.js';
const out = (k, v) => console.log(k.padEnd(14), v);
for (const d of P.DISTRICTS) out(d.id, `h=${P.heightAt(d.x, d.z).toFixed(1)} lake=${P.lakeDistance(d.x, d.z).toFixed(2)} river=${P.riverAt(d.x, d.z).d.toFixed(0)} coast=${P.coastX(d.z).toFixed(0)} water=${P.waterAt(d.x, d.z)}`);
// 路过不过湖/河/海
for (const [i, line] of P.ROADS.entries()) {
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1];
    for (let t = 0; t <= 1; t += 0.02) {
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const w = P.waterAt(x, z);
      if (w != null && !P.bridgeAt(x, z)) { out(`road${i}`, `water at ${x.toFixed(0)},${z.toFixed(0)} (${P.waterKind(x, z)})`); break; }
    }
  }
}
for (const b of P.BRIDGES) out(b.name, `river d=${P.riverAt(b.x, b.z).d.toFixed(1)} deck=${b.deck.toFixed(1)} ground=${P.heightAt(b.x, b.z).toFixed(1)}`);
// 找岸边站的地方：从水里往某个方向走到岸上
const shore = (x, z, dx, dz) => { for (let i = 0; i < 400; i++) { if (P.waterAt(x, z) == null && !P.inLake(x, z)) return [Math.round(x), Math.round(z)]; x += dx; z += dz; } return null; };
out('lakeShoreS', shore(-130, -540, 0, 1));
out('riverBankE0', shore(-446, 0, 1, 0));
out('seaShore-300', shore(1000, -300, -1, 0));
out('seaShore-560', shore(900, -560, -1, 0));
out('station h', [P.heightAt(700, 186), P.heightAt(740, 190), P.heightAt(760, 120), P.heightAt(760, 300)].map((v) => v.toFixed(1)).join(' '));
out('home/plaza', [P.heightAt(0, 0), P.heightAt(110, 60), P.heightAt(110, -330), P.heightAt(-40, -432)].map((v) => v.toFixed(1)).join(' '));
