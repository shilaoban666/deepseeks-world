"""在 Blender 里建吉卜力风的房屋套件，导出给游戏实例化。

  blender -b --factory-startup --python tools/ghibli4/build_kit.py -- [--out public/models4] [--render shots/kit.jpg] [--only id,id] [--blend design/kit.blend]

产物：
  <out>/kit.glb   一个文件，每种房子一个 mesh（名字就是 id）。顶点带：位置、法线、COLOR_0（颜料 × 影子）、
                  TEXCOORD_0（表面上的米数：瓦的行、木纹、砖缝都按它画）、TEXCOORD_1（部件号 / 255，窗号的随机数）
  <out>/kit.json  清单：每种的 id、类别（shape）、风格（style）、占地（w × d，米）、高、三角数
造型都在本文件的配方里（euro / machiya / kura / church …），构件在 kitlib.py。
"""
import json
import math
import os
import struct
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kitlib  # noqa: E402
from kitlib import C, Kit, Side, UP  # noqa: E402


def arg(name, default=None):
    if '--' in sys.argv:
        a = sys.argv[sys.argv.index('--') + 1:]
        if name in a:
            return a[a.index(name) + 1]
    return default


ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.abspath(arg('--out', os.path.join(ROOT, 'public', 'models4')))
os.makedirs(OUT, exist_ok=True)


# ====================================================================================================================
# 欧式（镇子、海边、农村、雪山小镇都用它，换墙色瓦色）
# ====================================================================================================================
def block(k, rect, floors=2, ridge='x', pitch=1.15, jetty=0.0, timber_from=1, stone_ground=False, door=None, shop=False,
          nowin=(), dormers=0, chim=1, shutters=True, boxes=0.45, sag=0.07, over=0.5, fh0=2.75, fh=2.5, plinth=True,
          wall_part='wall', wall_col=None, attic=True, plank_top=False):
    """一个长方体的房身加一个双坡顶。door = (side, u)。返回 (最上一层的 rect, 檐口高)。"""
    r = k.r
    x0, x1, y0, y1 = rect
    if plinth:
        k.plinth(rect)
    z = 0.0
    cur = rect
    for f in range(floors):
        h = fh0 if f == 0 else fh
        if f >= 1 and jetty:
            cur = (cur[0] - 0.1, cur[1] + 0.1, cur[2] - jetty, cur[3])
            k.box(cur[0], cur[1], cur[2], cur[3], z - 0.16, z + 0.02, 'wood', C['timber'])
            for u in np.linspace(0.3, (cur[1] - cur[0]) - 0.3, 4):  # 挑梁头
                s = Side(cur, 'front')
                k.sbox(s, u - 0.07, u + 0.07, -jetty, 0.12, z - 0.34, z - 0.16, 'wood', C['timber2'])
        part, col = (('stone', C['stone3']) if (f == 0 and stone_ground) else (wall_part, wall_col or C['white']))
        if plank_top and f == floors - 1 and f > 0:
            part, col = 'wood', C['plank']
        k.walls(cur, z, z + h, part, col)
        for name in ('front', 'back', 'left', 'right'):
            s = Side(cur, name)
            long = name in ('front', 'back')
            n = max(1, round(s.len / (2.3 if long else 2.9)))
            if f >= timber_from and part == 'wall':
                k.timber(s, z, z + h, bays=n, brace=r.random() < 0.7)
            if name in nowin:
                continue
            du = door[1] if (door and door[0] == name and f == 0) else None
            if du is not None:
                if shop:
                    k.door(s, du, 1.0, 2.1, canopy=False, lamp=True)
                else:
                    k.door(s, du, 1.0, 2.05, canopy=r.random() < 0.6, lamp=r.random() < 0.5)
            if shop and f == 0 and name == 'front':
                # 铺面：一扇大橱窗、布雨棚、挑出来的招牌
                a, b = (du + 0.9, s.len - 0.45) if du < s.len / 2 else (0.45, du - 0.9)
                if b - a > 1.2:
                    k.window(s, (a + b) / 2, 0.75, b - a, 1.55, bars=(max(1, int((b - a) / 0.8)), 1))
                    k.sbox(s, a - 0.1, b + 0.1, 0, 0.1, 0.5, 0.75, 'wood', C['timber2'])
                k.awning(s, 0.25, s.len - 0.25, 2.62, out=1.15, stripes=max(4, int(s.len / 1.1)))
                k.sign(s, s.len - 0.5 if du < s.len / 2 else 0.5, 2.75)
                continue
            for i in range(n):
                u = s.len * (i + 0.5) / n
                if du is not None and abs(u - du) < 1.35:
                    continue
                if name != 'front' and r.random() < 0.28:
                    continue
                w = r.choice([0.85, 0.95, 1.05])
                k.window(s, u, z + 0.95, w, 1.25 if f else 1.3, shutters=shutters, box=(name == 'front' and r.random() < boxes), bars=(1, 2) if f else (1, 1))
        z += h
    # 屋顶
    cx, cy = (cur[0] + cur[1]) / 2, (cur[2] + cur[3]) / 2
    hx, hy = (cur[1] - cur[0]) / 2, (cur[3] - cur[2]) / 2
    if ridge == 'x':
        local, ctx = cur, None
    else:
        local, ctx = (cx - hy, cx + hy, cy - hx, cy + hx), k.turned(cx, cy)
    if ctx:
        ctx.__enter__()
    span = local[3] - local[2]
    rise = span / 2 * pitch
    wall = (wall_part, wall_col) if not plank_top else ('wood', C['plank'])
    hgt = k.gable(local, z, rise, over=over, sag=sag, wall=wall)
    lx0, lx1 = local[0], local[1]
    for name in ('left', 'right'):
        s = Side(local, name)
        if attic and rise > 1.9:
            k.window(s, s.len / 2, z + 0.4, 0.62, 0.78, sill=True, bars=(1, 1))
        if timber_from <= floors and wall_part == 'wall' and not plank_top:
            k.beam(s, 0.05, z + 0.08, s.len - 0.05, z + 0.08, 0.17)
            k.beam(s, s.len / 2, z + (1.3 if rise > 1.9 else 0.1), s.len / 2, z + rise * 0.78, 0.14)
            k.beam(s, s.len * 0.28, z + rise * 0.42, s.len * 0.72, z + rise * 0.42, 0.13)
    for i in range(dormers):
        x = lx0 + (lx1 - lx0) * (i + 0.5) / dormers + r.uniform(-0.3, 0.3)
        k.dormer(hgt, x, -1 if ridge == 'x' else r.choice([-1, 1]), wall=(wall_part, wall_col))
    for i in range(chim):
        x = lx0 + (lx1 - lx0) * (0.22 + 0.56 * r.random())
        sgn = r.choice([-1, 1])
        y = hgt.yc + sgn * hgt.half * r.uniform(0.25, 0.5)
        k.chimney(x, y, hgt(x, y) - 0.4, hgt.ridge + r.uniform(0.35, 0.8), pots=r.choice([1, 1, 2]), lean=0.035,
                  part='stone', col=r.choice([C['brick'], C['stone2'], C['stone3']]))
    if ctx:
        ctx.__exit__()
    return cur, z


def leanto(k, rect, name, u0, u1, out=2.0, z=2.35, plank=True):
    """靠在墙边的披屋。"""
    s = Side(rect, name)
    k.sbox(s, u0, u1, 0, out, -1.2, z - 0.55, 'wood' if plank else 'wall', C['plank'] if plank else C['white'], skip=(0,))
    k.slab([s.p(u0 - 0.25, 0, z), s.p(u1 + 0.25, 0, z), s.p(u1 + 0.25, out + 0.4, z - 0.85), s.p(u0 - 0.25, out + 0.4, z - 0.85)], 0.1, 'roof', C['white'])
    front = Side((0, 0, 0, 0), 'front')
    front.o, front.du, front.dw, front.len = s.p(u0, out, 0), s.du, s.dw, u1 - u0
    k.door(front, (u1 - u0) / 2, 0.9, 1.7, part='wood', col=C['plank2'], step=False)


def yard(k, rect, front_free, r):
    """门口和墙根的生活气：木桶、箱子、盆栽、灌木、柴垛、长凳。front_free = 门的 u（别挡门）。"""
    s = Side(rect, 'front')
    spots = [u for u in (0.6, 1.5, s.len - 1.5, s.len - 0.6) if abs(u - front_free) > 1.1]
    r.shuffle(spots)
    for u in spots[:r.randint(1, 3)]:
        p = s.p(u, 0.55, 0)
        kind = r.choice(['barrel', 'pot', 'pot', 'crate', 'bush'])
        if kind == 'barrel':
            k.barrel(p.x, p.y)
        elif kind == 'pot':
            k.pot(p.x, p.y)
        elif kind == 'crate':
            k.crate(p.x, p.y, 0.55, rot=r.uniform(0, 1))
            if r.random() < 0.5:
                k.crate(p.x + 0.1, p.y - 0.05, 0.4, z=0.55, rot=r.uniform(0, 1))
        else:
            k.bush(p.x, p.y, 0.5, flowers=True)
    side = Side(rect, r.choice(['left', 'right']))
    if r.random() < 0.5:
        k.woodpile(side, side.len * 0.25, side.len * 0.25 + 1.7)
    if r.random() < 0.55:
        k.ivy(Side(rect, r.choice(['left', 'right', 'front'])), r.choice([0.5, -0.5]) % 7 * 0 + r.uniform(0.6, 1.4), 0.3, r.uniform(2.6, 4.6))


def euro(k, W, D, floors, gable_front=False, **o):
    r = k.r
    rect = (-W / 2, W / 2, -D / 2, D / 2)
    du = r.choice([W * 0.3, W * 0.5, W * 0.7]) if not o.get('shop') else r.choice([W * 0.22, W * 0.78])
    extras = o.pop('extras', True)
    lean = o.pop('lean', False)
    top, z = block(k, rect, floors, ridge='y' if gable_front else 'x', door=('front', du), **o)
    if lean:
        leanto(k, rect, r.choice(['left', 'right']), D * 0.2, D * 0.2 + 2.6)
    if extras:
        yard(k, rect, du, r)
    return rect


def wing(k, W, D, floors, **o):
    """L 形：主屋横着，前面伸出一翼（山墙朝街）。"""
    r = k.r
    main = (-W / 2, W / 2, -D / 2 + 2.6, D / 2)
    ww = W * 0.46
    side = r.choice([-1, 1])
    wx0 = -W / 2 if side < 0 else W / 2 - ww
    wr = (wx0, wx0 + ww, -D / 2, -D / 2 + 3.4)
    du = (W * 0.72 if side < 0 else W * 0.28)
    block(k, main, floors, ridge='x', door=('front', du), dormers=o.get('dormers', 1), chim=1, jetty=0.0, timber_from=o.get('timber_from', 1),
          stone_ground=o.get('stone_ground', False), pitch=o.get('pitch', 1.1))
    block(k, wr, floors, ridge='y', door=None, nowin=('back',), chim=0, jetty=o.get('jetty', 0.25), timber_from=o.get('timber_from', 1),
          stone_ground=o.get('stone_ground', False), pitch=o.get('pitch', 1.1) * 1.08, plinth=True)
    s = Side(main, 'front')
    # 夹角里：一小片铺地上的东西
    p = s.p(du + (1.4 if side < 0 else -1.4), 0.6, 0)
    k.barrel(p.x, p.y)
    k.bush(-wx0 * 0.0 + (W / 2 - 0.7) * (1 if side < 0 else -1), -D / 2 + 2.0, 0.55, flowers=True)
    k.ivy(Side(wr, 'left' if side < 0 else 'right'), 1.2, 0.3, 4.2)
    return (-W / 2, W / 2, -D / 2, D / 2)


def row(k, units=3, uw=4.6, D=6.5, floors=2):
    """联排：几户连在一起，每户门窗颜色位置各不同，屋顶一高一低。"""
    r = k.r
    W = units * uw
    for i in range(units):
        x0 = -W / 2 + i * uw
        fl = floors + (1 if (i == 1 and r.random() < 0.6) else 0)
        block(k, (x0, x0 + uw, -D / 2, D / 2), fl, ridge='x', door=('front', r.choice([uw * 0.3, uw * 0.7])), nowin=tuple(n for n, c in (('left', i > 0), ('right', i < units - 1)) if c),
              chim=1, dormers=r.choice([0, 1]), jetty=r.choice([0, 0.22]), timber_from=r.choice([1, 1, 9]), pitch=r.uniform(1.0, 1.2), over=0.4, boxes=0.6)
    return (-W / 2, W / 2, -D / 2, D / 2)


def barn(k, W=12.0, D=6.8):
    r = k.r
    rect = (-W / 2, W / 2, -D / 2, D / 2)
    block(k, rect, 2, ridge='x', door=None, stone_ground=True, timber_from=9, plank_top=True, nowin=('front',), chim=0, pitch=0.95, fh0=2.6, fh=1.5, attic=False, shutters=False, boxes=0)
    s = Side(rect, 'front')
    k.door(s, W * 0.5, 2.6, 2.5, part='accent', step=False)   # 大门
    k.window(s, W * 0.5, 3.1, 0.9, 0.8, sill=False)             # 草料口
    k.window(s, W * 0.16, 1.0, 0.8, 0.9)
    k.window(s, W * 0.84, 1.0, 0.8, 0.9)
    leanto(k, rect, 'right', 1.2, 4.6, out=2.4)
    k.barrel(-W / 2 + 0.8, -D / 2 - 0.6)
    k.crate(-W / 2 + 1.6, -D / 2 - 0.6)
    k.woodpile(Side(rect, 'left'), 1.0, 3.4)
    for i in range(3):  # 草垛
        k.box(W * 0.2 + i * 0.95, W * 0.2 + i * 0.95 + 0.85, -D / 2 - 1.0, -D / 2 - 0.35, 0, 0.6 if i != 1 else 1.15, 'plain', C['straw'], skip=(0,))
    return rect


# ====================================================================================================================
# 和式（玉海城：木格子、深色木构、白墙、灰瓦、披檐）
# ====================================================================================================================
def jp_front(k, s, z0, h, door_u, lattice=True):
    """町屋的一层正面：木格子窗、推拉门、暖帘。"""
    r = k.r
    k.sbox(s, door_u - 0.9, door_u + 0.9, 0, 0.03, 0.05, 2.0, 'plain', C['cream'], skip=(0,))
    for u in (door_u - 0.9, door_u, door_u + 0.9):
        k.beam(s, u, 0.02, u, 2.05, 0.07, C['jpwood'], w=0.045)
    for zz in (0.75, 2.05):
        k.beam(s, door_u - 0.9, zz, door_u + 0.9, zz, 0.06, C['jpwood'], w=0.045)
    # 暖帘：三片
    for i in range(3):
        a = door_u - 0.84 + i * 0.57
        k.face([s.p(a, 0.12, 2.12), s.p(a + 0.53, 0.12, 2.12), s.p(a + 0.53, 0.14, 1.5), s.p(a, 0.14, 1.5)], 'cloth', C['white'], s.dw)
    k.sbox(s, door_u - 1.1, door_u + 1.1, 0, 0.5, -0.4, 0.12, 'stone', C['stone2'])
    for a, b in ((0.25, door_u - 1.15), (door_u + 1.15, s.len - 0.25)):
        if b - a < 0.8:
            continue
        if lattice:
            k.sbox(s, a, b, 0, 0.06, 0.55, 2.0, 'plain', C['iron'], skip=(0,))
            n = max(4, int((b - a) / 0.16))
            for i in range(n + 1):
                u = a + (b - a) * i / n
                k.beam(s, u, 0.5, u, 2.05, 0.05, C['jpwood2'], w=0.075)
            k.beam(s, a, 2.05, b, 2.05, 0.09, C['jpwood'], w=0.08)
            k.beam(s, a, 0.5, b, 0.5, 0.09, C['jpwood'], w=0.08)
        else:
            k.window(s, (a + b) / 2, 0.9, b - a - 0.2, 1.05, frame=C['jpwood'], bars=(max(2, int((b - a) / 0.3)), 0), sill=False)


def jp_frame(k, rect, z0, z1, col=None, sides=('front', 'back', 'left', 'right')):
    """白墙上的深色木框：角柱、上下梁。"""
    col = col or C['jpwood']
    for name in sides:
        s = Side(rect, name)
        n = max(1, round(s.len / 1.9))
        for i in range(n + 1):
            u = 0.07 + (s.len - 0.14) * i / n
            k.beam(s, u, z0, u, z1, 0.13, col)
        k.beam(s, 0, z0 + 0.07, s.len, z0 + 0.07, 0.14, col)
        k.beam(s, 0, z1 - 0.07, s.len, z1 - 0.07, 0.14, col)


def hisashi(k, rect, name, z, out=0.95, drop=0.32, u0=None, u1=None):
    """披檐：一层门面上面那一溜小瓦顶。"""
    s = Side(rect, name)
    u0 = -0.3 if u0 is None else u0
    u1 = s.len + 0.3 if u1 is None else u1
    k.slab([s.p(u0, 0, z), s.p(u1, 0, z), s.p(u1, out, z - drop), s.p(u0, out, z - drop)], 0.1, 'roof', C['white'])
    for u in np.linspace(u0 + 0.4, u1 - 0.4, max(2, int((u1 - u0) / 1.6))):
        k.beam_3d(s.p(u, 0.02, z - 0.55), s.p(u, out - 0.1, z - drop - 0.06), 0.04, C['jpwood'], part='wood')


def machiya(k, W=6.4, D=8.0, floors=2, lattice=True, inn=False, balcony=False, plaster=False, low=False):
    r = k.r
    rect = (-W / 2, W / 2, -D / 2, D / 2)
    k.plinth(rect, h=0.22, col=C['stone2'])
    du = r.choice([W * 0.3, W * 0.5, W * 0.68])
    h0 = 2.5
    # （一层：深色木板，或者白灰墙加木框）
    if plaster:
        k.walls(rect, 0, h0)
        jp_frame(k, rect, 0, h0, sides=('back', 'left', 'right'))
    else:
        k.walls(rect, 0, h0, 'wood', C['jpwood2'])
    s = Side(rect, 'front')
    jp_front(k, s, 0, h0, du, lattice)
    for name in ('left', 'right'):
        sd = Side(rect, name)
        k.window(sd, sd.len * 0.3, 1.0, 0.9, 0.9, frame=C['jpwood'], bars=(3, 0), sill=False)
    hisashi(k, rect, 'front', h0 + 0.12)
    z = h0
    for f in range(1, floors):
        h = (1.45 if low else 2.05) if f == floors - 1 else 2.3
        up = rect
        k.walls(up, z, z + h)
        jp_frame(k, up, z, z + h)
        sf = Side(up, 'front')
        n = max(2, round(W / 2.2))
        for i in range(n):
            if low:
                # 虫笼窗：矮矮的二层，一排竖条的小窗
                k.window(sf, W * (i + 0.5) / n, z + 0.45, W / n - 0.9, 0.55, frame=C['frame'], bars=(max(3, int((W / n - 0.9) / 0.16)), 0), sill=False)
            else:
                k.window(sf, W * (i + 0.5) / n, z + 0.7, W / n - 0.6, 0.85, frame=C['jpwood'], bars=(max(2, int((W / n - 0.6) / 0.28)), 0), sill=False)
        if balcony and f == 1:
            # 二层的栏杆和晾着的被子
            k.sbox(sf, 0.15, W - 0.15, 0.95, 1.02, z + 0.62, z + 0.7, 'wood', C['jpwood'])
            k.sbox(sf, 0.15, W - 0.15, 0.95, 1.02, z + 0.2, z + 0.26, 'wood', C['jpwood'])
            for u in np.linspace(0.2, W - 0.2, max(3, int(W / 1.1))):
                k.sbox(sf, u - 0.03, u + 0.03, 0.95, 1.02, z - 0.1, z + 0.7, 'wood', C['jpwood'])
            for u, col in ((W * 0.3, C['cream']), (W * 0.62, C['pink'])):
                k.sbox(sf, u - 0.5, u + 0.5, 0.9, 1.08, z + 0.1, z + 0.74, 'plain', col)
        for name in ('left', 'right', 'back'):
            sd = Side(up, name)
            if r.random() < 0.7:
                k.window(sd, sd.len * r.choice([0.3, 0.6]), z + 0.7, 0.9, 0.8, frame=C['jpwood'], bars=(3, 0), sill=False)
        if inn and f < floors - 1:
            hisashi(k, up, 'front', z + h + 0.1, out=0.8, drop=0.26)
            hisashi(k, up, 'left', z + h + 0.1, out=0.6, drop=0.2)
            hisashi(k, up, 'right', z + h + 0.1, out=0.6, drop=0.2)
            # 栏杆
            k.sbox(sf, 0.1, W - 0.1, 0.05, 0.1, z + 0.55, z + 0.62, 'wood', C['jpwood'])
        z += h
    hgt = k.gable(rect, z, D / 2 * 0.6, over=0.75, verge=0.45, sag=0.1, kick=0.5, thick=0.16)
    for x in (rect[0] - 0.4, rect[1] + 0.4):  # 鬼瓦
        k.box(x - 0.1, x + 0.1, -0.17, 0.17, hgt.ridge - 0.12, hgt.ridge + 0.26, 'roof', tuple(v * 0.7 for v in C['white']))
    # 门口：灯笼、盆栽、长凳
    p = s.p(du + 1.25, 0.3, 0)
    k.box(p.x - 0.14, p.x + 0.14, p.y - 0.14, p.y + 0.14, 1.55, 1.98, 'plain', C['red'] if r.random() < 0.6 else C['cream'])
    k.box(p.x - 0.16, p.x + 0.16, p.y - 0.16, p.y + 0.16, 1.98, 2.03, 'plain', C['iron'])
    q = s.p(0.5 if du > W / 2 else W - 0.5, 0.5, 0)
    k.pot(q.x, q.y)
    if r.random() < 0.6:
        b = s.p(W * 0.75 if du < W / 2 else W * 0.25, 0.75, 0)
        k.box(b.x - 0.7, b.x + 0.7, b.y - 0.2, b.y + 0.2, 0.36, 0.44, 'wood', C['plank'])
        for dx in (-0.6, 0.6):
            k.box(b.x + dx - 0.04, b.x + dx + 0.04, b.y - 0.18, b.y + 0.18, 0, 0.36, 'wood', C['timber2'])
    return rect


def jp_house(k, W=8.4, D=6.8):
    """平房：四坡顶，正面一条檐廊，纸拉门。"""
    r = k.r
    rect = (-W / 2, W / 2, -D / 2 + 1.1, D / 2)
    k.plinth(rect, h=0.3, col=C['stone2'])
    h = 2.55
    k.walls(rect, 0, h)
    jp_frame(k, rect, 0.3, h)
    s = Side(rect, 'front')
    # 檐廊：木地板、柱子、纸门
    k.sbox(s, -0.1, W + 0.1, 0, 1.15, 0.28, 0.42, 'wood', C['plank'])
    for u in np.linspace(0.2, W - 0.2, 4):
        k.sbox(s, u - 0.06, u + 0.06, 1.0, 1.12, -0.5, h + 0.2, 'wood', C['jpwood'])
        k.sbox(s, u - 0.1, u + 0.1, 0.9, 1.2, -0.6, 0.0, 'stone', C['stone2'])
    n = 4
    for i in range(n):
        a, b = W * i / n + 0.14, W * (i + 1) / n - 0.14
        k.squad(s, a, b, 0.45, 2.15, 0.03, 'plain', C['cream'])
        for u in np.linspace(a, b, 4):
            k.beam(s, u, 0.45, u, 2.15, 0.035, C['jpwood'], w=0.04)
        for zz in np.linspace(0.45, 2.15, 5):
            k.beam(s, a, zz, b, zz, 0.035, C['jpwood'], w=0.04)
    for name in ('left', 'right', 'back'):
        sd = Side(rect, name)
        k.window(sd, sd.len * 0.5, 0.95, 1.1, 0.95, frame=C['jpwood'], bars=(3, 1), sill=False)
    full = (-W / 2, W / 2, -D / 2, D / 2)
    k.hip((full[0] - 0.1, full[1] + 0.1, full[2] - 0.2, full[3] + 0.1), h + 0.25, D / 2 * 0.62, over=0.7)
    k.bush(-W / 2 + 0.6, -D / 2 - 0.5, 0.6, flowers=True)
    k.box(W / 2 - 1.1, W / 2 - 0.5, -D / 2 - 0.9, -D / 2 - 0.3, 0, 0.5, 'stone', C['stone'])   # 手水钵
    k.sbox(s, W * 0.5 - 0.5, W * 0.5 + 0.5, 1.15, 1.7, -0.4, 0.16, 'stone', C['stone2'])            # 踏脚石
    return full


def kura(k, W=5.4, D=6.4):
    """土藏：厚厚的白墙，下半截深色，小窗厚门，大屋顶。"""
    r = k.r
    rect = (-W / 2, W / 2, -D / 2, D / 2)
    k.plinth(rect, h=0.35, col=C['stone2'])
    k.walls(rect, 0, 1.25, 'stone', C['stone2'])
    k.walls(rect, 1.25, 5.2)
    for name in ('front', 'back', 'left', 'right'):
        s = Side(rect, name)
        k.beam(s, 0, 1.25, s.len, 1.25, 0.14, C['frame'])
        for u in np.linspace(0.3, s.len - 0.3, max(3, int(s.len / 0.9))):   # 海鼠壁的斜格
            k.beam(s, u - 0.3, 0.1, u + 0.3, 1.15, 0.05, C['frame'])
            k.beam(s, u + 0.3, 0.1, u - 0.3, 1.15, 0.05, C['frame'])
        if name != 'back':
            k.window(s, s.len / 2, 3.5, 0.7, 0.8, frame=C['frame'], bars=(0, 0), sill=True)
            for a in (-0.62, 0.38):
                k.sbox(s, s.len / 2 + a, s.len / 2 + a + 0.24, 0.02, 0.1, 3.45, 4.35, 'plain', C['iron'])
    s = Side(rect, 'front')
    k.door(s, W / 2, 1.3, 2.2, part='plain', col=C['iron'], canopy=True)
    hgt = k.gable(rect, 5.2, D / 2 * 0.72, over=0.8, verge=0.5, sag=0.06, kick=0.55, thick=0.2)
    for x in (rect[0] - 0.45, rect[1] + 0.45):
        k.box(x - 0.1, x + 0.1, -0.17, 0.17, hgt.ridge - 0.12, hgt.ridge + 0.26, 'roof', tuple(v * 0.7 for v in C['white']))
    k.barrel(W / 2 - 0.6, -D / 2 - 0.55)
    k.barrel(W / 2 - 1.35, -D / 2 - 0.5, r=0.3, h=0.75)
    return rect


# ====================================================================================================================
# 特别的几座
# ====================================================================================================================
def ngon_sides(cx, cy, rad, n):
    out = []
    for i in range(n):
        a0, a1 = -math.pi / 2 + (i - 0.5) / n * math.tau, -math.pi / 2 + (i + 0.5) / n * math.tau
        p0 = Vector((cx + math.cos(a0) * rad, cy + math.sin(a0) * rad, 0))
        p1 = Vector((cx + math.cos(a1) * rad, cy + math.sin(a1) * rad, 0))
        s = Side((0, 0, 0, 0), 'front')
        s.o, s.du, s.len = p0, (p1 - p0).normalized(), (p1 - p0).length
        mid = (p0 + p1) / 2 - Vector((cx, cy, 0))
        s.dw = mid.normalized()
        out.append(s)
    return out


def round_tower(k, rad=3.5, h=7.6, n=10):
    r = k.r
    sides = ngon_sides(0, 0, rad, n)
    for s in ngon_sides(0, 0, rad + 0.1, n):
        k.squad(s, 0, s.len, -1.2, 0.55, 0, 'stone', C['stone'])
    for i, s in enumerate(sides):
        for a, b, part, col in ((0.0, 2.9, 'stone', C['stone3']), (2.9, h - 0.7, 'wall', C['white']), (h - 0.7, h, 'wall', C['white'])):
            k.squad(s, 0, s.len, a, b, 0, part, col)
        k.beam(s, 0, 2.9, s.len, 2.9, 0.16)
        k.beam(s, 0, h - 0.08, s.len, h - 0.08, 0.16)
        k.beam(s, 0.04, 2.9, 0.04, h, 0.12)
        if i == 0:
            k.door(s, s.len / 2, 1.0, 2.05, canopy=True, lamp=True)
        elif i % 2 == 0:
            k.window(s, s.len / 2, 1.0, 0.7, 1.1, shutters=False)
        if i % 2 == 1 or i == 0:
            k.window(s, s.len / 2, 4.2, 0.75, 1.15, shutters=False, box=r.random() < 0.5)
    k.cone(0, 0, rad, h, rad * 1.5, n=n, over=0.55)
    k.box(-0.04, 0.04, -0.04, 0.04, h + rad * 1.5 - 0.1, h + rad * 1.5 + 0.9, 'plain', C['iron'])
    k.box(-0.3, 0.3, -0.02, 0.02, h + rad * 1.5 + 0.55, h + rad * 1.5 + 0.62, 'plain', C['brass'])
    k.ivy(sides[3], sides[3].len / 2, 0.3, 4.5)
    k.barrel(rad * 0.75, -rad - 0.3)
    return (-rad, rad, -rad, rad)


def slim_tower(k, w=3.6, h=8.6):
    r = k.r
    rect = (-w / 2, w / 2, -w / 2, w / 2)
    k.plinth(rect, h=0.6)
    k.walls(rect, 0, 3.0, 'stone', C['stone3'])
    k.walls(rect, 3.0, h)
    top = (rect[0] - 0.22, rect[1] + 0.22, rect[2] - 0.22, rect[3] + 0.22)
    k.box(top[0], top[1], top[2], top[3], h - 0.16, h + 0.02, 'wood', C['timber'])
    k.walls(top, h, h + 1.9)
    for name in ('front', 'back', 'left', 'right'):
        s = Side(rect, name)
        k.timber(s, 3.0, h, bays=1, brace=True)
        st = Side(top, name)
        k.timber(st, h, h + 1.9, bays=2, brace=False)
        # 钟面
        k.squad(st, st.len / 2 - 0.62, st.len / 2 + 0.62, h + 0.35, h + 1.59, 0.05, 'plain', C['cream'])
        k.beam(st, st.len / 2, h + 0.97, st.len / 2, h + 1.45, 0.05, C['iron'], w=0.07)
        k.beam(st, st.len / 2, h + 0.97, st.len / 2 + 0.32, h + 0.97, 0.05, C['iron'], w=0.07)
        if name == 'front':
            k.door(s, s.len / 2, 0.95, 2.05, canopy=True)
        else:
            k.window(s, s.len / 2, 1.1, 0.6, 1.0, shutters=False)
        k.window(s, s.len / 2, 5.0, 0.7, 1.2, shutters=True, box=name == 'front')
    with k.turned(0, 0, math.pi / 4):
        k.cone(0, 0, (w / 2 + 0.22) * 1.414, h + 1.9, 3.4, n=4, over=0.5)
    k.box(-0.04, 0.04, -0.04, 0.04, h + 5.2, h + 6.1, 'plain', C['iron'])
    return rect


def church(k, W=8.6, D=18.0):
    r = k.r
    nave = (-W / 2, W / 2, -D / 2 + 4.2, D / 2)
    k.plinth(nave, h=0.7)
    k.walls(nave, 0, 6.2)
    for name in ('left', 'right'):
        s = Side(nave, name)
        for i in range(4):
            u = s.len * (i + 0.5) / 4
            k.window(s, u, 1.9, 0.9, 3.0, bars=(1, 3), sill=True)
            k.sbox(s, u + s.len / 8 - 0.25, u + s.len / 8 + 0.25, 0, 0.5, -1.2, 4.6, 'stone', C['stone3'])   # 扶壁
    with k.turned(0, (nave[2] + nave[3]) / 2):
        cy = (nave[2] + nave[3]) / 2
        hx, hy = W / 2, (nave[3] - nave[2]) / 2
        k.gable((-hy, hy, cy - hx, cy + hx), 6.2, W / 2 * 1.25, over=0.45, sag=0.05)
    tw = 4.4
    tower = (-tw / 2, tw / 2, -D / 2, -D / 2 + tw)
    k.plinth(tower, h=0.7)
    k.walls(tower, 0, 12.5)
    s = Side(tower, 'front')
    k.door(s, tw / 2, 1.7, 2.9, canopy=False)
    k.sbox(s, tw / 2 - 1.15, tw / 2 + 1.15, 0, 0.14, 2.9, 3.3, 'stone', C['stone3'])
    k.window(s, tw / 2, 4.6, 1.0, 1.6, bars=(1, 2))
    for name in ('front', 'left', 'right', 'back'):
        st = Side(tower, name)
        k.window(st, tw / 2, 9.6, 0.9, 1.7, bars=(1, 0), frame=C['timber2'])     # 钟楼的百叶
        k.beam(st, 0, 8.7, tw, 8.7, 0.2, C['stone3'], w=0.06)
        k.beam(st, 0, 12.4, tw, 12.4, 0.22, C['stone3'], w=0.08)
    with k.turned(0, -D / 2 + tw / 2, math.pi / 4):
        k.cone(0, -D / 2 + tw / 2, tw / 2 * 1.414, 12.5, 6.2, n=4, over=0.4)
    cz = 12.5 + 6.2
    k.box(-0.06, 0.06, -D / 2 + tw / 2 - 0.06, -D / 2 + tw / 2 + 0.06, cz - 0.1, cz + 1.3, 'plain', C['brass'])
    k.box(-0.4, 0.4, -D / 2 + tw / 2 - 0.06, -D / 2 + tw / 2 + 0.06, cz + 0.7, cz + 0.82, 'plain', C['brass'])
    k.bush(-W / 2 - 0.2, -D / 2 + 3.6, 0.8, flowers=True)
    k.bush(W / 2 + 0.2, -D / 2 + 3.6, 0.8, flowers=True)
    return (-W / 2, W / 2, -D / 2, D / 2)


# ====================================================================================================================
# 清单：每种房子一个配方。shape 对上游戏里原来的类别（cottage / house / tall / wing / long / church / round / slim）。
# ====================================================================================================================
KIT = [
    # id, shape, style, seed, 配方
    ('cottage_a', 'cottage', 'euro', 11, lambda k: euro(k, 6.6, 5.8, 1, gable_front=False, pitch=1.25, dormers=1, timber_from=9, stone_ground=False, chim=1, lean=True)),
    ('cottage_b', 'cottage', 'euro', 12, lambda k: euro(k, 5.8, 6.8, 1, gable_front=True, pitch=1.35, timber_from=0, chim=1)),
    ('cottage_c', 'cottage', 'euro', 13, lambda k: euro(k, 7.0, 6.0, 1, gable_front=False, pitch=1.15, dormers=2, stone_ground=True, timber_from=9, chim=2)),
    ('cottage_d', 'cottage', 'euro', 14, lambda k: euro(k, 6.0, 6.2, 2, gable_front=True, pitch=1.2, jetty=0.28, timber_from=1, chim=1, fh=2.2)),
    ('house_a', 'house', 'euro', 21, lambda k: euro(k, 7.6, 6.8, 2, gable_front=False, pitch=1.15, jetty=0.3, dormers=1, chim=1)),
    ('house_b', 'house', 'euro', 22, lambda k: euro(k, 6.8, 7.4, 2, gable_front=True, pitch=1.25, jetty=0.32, chim=1, lean=True)),
    ('house_c', 'house', 'euro', 23, lambda k: euro(k, 8.0, 6.6, 2, gable_front=False, pitch=1.05, stone_ground=True, jetty=0.0, timber_from=9, dormers=2, chim=2)),
    ('house_d', 'house', 'euro', 24, lambda k: euro(k, 7.2, 7.0, 2, gable_front=False, pitch=1.2, shop=True, jetty=0.3, chim=1)),
    ('house_e', 'house', 'euro', 25, lambda k: euro(k, 6.6, 7.2, 2, gable_front=True, pitch=1.3, shop=True, jetty=0.3, chim=1)),
    ('tall_a', 'tall', 'euro', 31, lambda k: euro(k, 6.0, 7.4, 3, gable_front=True, pitch=1.4, jetty=0.28, shop=True, chim=1, fh=2.4)),
    ('tall_b', 'tall', 'euro', 32, lambda k: euro(k, 6.4, 7.0, 3, gable_front=False, pitch=1.25, jetty=0.26, dormers=1, chim=2, fh=2.4)),
    ('tall_c', 'tall', 'euro', 33, lambda k: euro(k, 5.6, 7.6, 3, gable_front=True, pitch=1.5, jetty=0.3, stone_ground=True, chim=1, fh=2.35)),
    ('wing_a', 'wing', 'euro', 41, lambda k: wing(k, 10.4, 9.4, 2)),
    ('wing_b', 'wing', 'euro', 42, lambda k: wing(k, 9.8, 9.0, 2, stone_ground=True, timber_from=1, pitch=1.2)),
    ('long_a', 'long', 'euro', 51, lambda k: row(k, 3, 4.6, 6.6, 2)),
    ('long_b', 'long', 'farm', 52, lambda k: barn(k, 12.5, 6.8)),
    ('long_c', 'long', 'euro', 53, lambda k: row(k, 3, 4.4, 6.4, 2)),
    ('church', 'church', 'special', 61, lambda k: church(k)),
    ('round', 'round', 'special', 62, lambda k: round_tower(k)),
    ('slim', 'slim', 'special', 63, lambda k: slim_tower(k)),
    ('machiya_a', 'house', 'jp', 71, lambda k: machiya(k, 6.4, 8.0, 2, lattice=True)),
    ('machiya_b', 'house', 'jp', 72, lambda k: machiya(k, 7.2, 7.6, 2, lattice=False)),
    ('machiya_c', 'cottage', 'jp', 73, lambda k: machiya(k, 5.6, 7.4, 2, lattice=True)),
    ('machiya_d', 'tall', 'jp', 74, lambda k: machiya(k, 6.8, 8.2, 3, lattice=True, inn=True)),
    ('machiya_e', 'long', 'jp', 75, lambda k: machiya(k, 11.0, 7.6, 2, lattice=True)),
    ('machiya_f', 'house', 'jp', 76, lambda k: machiya(k, 6.0, 7.8, 2, lattice=True, balcony=True)),
    ('machiya_g', 'house', 'jp', 77, lambda k: machiya(k, 7.0, 7.4, 2, lattice=False, plaster=True, low=True)),
    ('machiya_h', 'cottage', 'jp', 78, lambda k: machiya(k, 5.2, 7.0, 2, lattice=True, low=True)),
    ('machiya_i', 'tall', 'jp', 79, lambda k: machiya(k, 6.2, 7.8, 3, lattice=False, balcony=True, plaster=True)),
    ('machiya_j', 'wing', 'jp', 80, lambda k: machiya(k, 8.4, 8.0, 2, lattice=True, balcony=True, inn=False)),
    ('jphouse_a', 'wing', 'jp', 81, lambda k: jp_house(k, 8.6, 7.0)),
    ('jphouse_b', 'cottage', 'jp', 82, lambda k: jp_house(k, 7.2, 6.6)),
    ('kura_a', 'tall', 'jp', 91, lambda k: kura(k)),
]

import lm_kit  # noqa: E402

import life_kit  # noqa: E402
import play_kit  # noqa: E402

KIT = [e + ({},) for e in KIT] + lm_kit.install(globals()) + life_kit.install(globals()) + play_kit.install(globals())

# 预览用的墙色、瓦色、点缀色（游戏里每一栋自己另配）
PREVIEW = {
    'euro': dict(wall=[(0.96, 0.92, 0.8), (0.95, 0.85, 0.66), (0.93, 0.78, 0.68), (0.82, 0.87, 0.74), (0.97, 0.95, 0.9)],
                 roof=[(0.8, 0.36, 0.22), (0.72, 0.3, 0.2), (0.3, 0.46, 0.52), (0.36, 0.42, 0.56), (0.84, 0.5, 0.26)],
                 accent=[(0.2, 0.42, 0.36), (0.25, 0.4, 0.6), (0.62, 0.24, 0.2), (0.85, 0.66, 0.3)]),
    'jp': dict(wall=[(0.96, 0.94, 0.88), (0.93, 0.9, 0.8)], roof=[(0.33, 0.38, 0.46), (0.28, 0.34, 0.42), (0.36, 0.4, 0.44)],
               accent=[(0.16, 0.3, 0.5), (0.6, 0.2, 0.18), (0.2, 0.36, 0.3)]),
}
PREVIEW['farm'] = PREVIEW['special'] = PREVIEW['euro']
PREVIEW['prop'] = dict(wall=[(0.95, 0.93, 0.86)], roof=[(0.3, 0.36, 0.44)], accent=[(0.7, 0.22, 0.18), (0.2, 0.4, 0.6)])
PREVIEW['lm'] = dict(wall=[(0.95, 0.93, 0.86), (0.93, 0.86, 0.74)], roof=[(0.3, 0.36, 0.44), (0.86, 0.62, 0.2), (0.2, 0.56, 0.46), (0.7, 0.3, 0.2)], accent=[(0.7, 0.22, 0.18), (0.2, 0.4, 0.6), (0.2, 0.42, 0.36)])


def write_glb(path, meshes):
    """meshes: [(name, corners)]，corners 是 Kit.bake() 的结果。Blender (x, y, z) → glTF (x, z, -y)。"""
    blob = bytearray()
    views, accessors, gmeshes, nodes = [], [], [], []

    def add(arr, comp, kind, normalized=False, minmax=False):
        nonlocal blob
        while len(blob) % 4:
            blob += b'\0'
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': arr.nbytes, 'target': 34962})
        blob += arr.tobytes()
        acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': kind}
        if normalized:
            acc['normalized'] = True
        if minmax:
            acc['min'], acc['max'] = arr.min(axis=0).tolist(), arr.max(axis=0).tolist()
        accessors.append(acc)
        return len(accessors) - 1

    for name, corners in meshes:
        n = len(corners)
        pos = np.array([(p.x, p.z, -p.y) for p, *_ in corners], dtype=np.float32)
        nor = np.zeros((n, 4), dtype=np.int8)
        nor[:, :3] = np.round(np.array([(c[1].x, c[1].z, -c[1].y) for c in corners]) * 127)
        col = np.full((n, 4), 255, dtype=np.uint8)
        col[:, :3] = np.round(np.clip(np.array([c[2] for c in corners]), 0, 1) * 255)
        uv = np.array([c[3] for c in corners], dtype=np.float32)
        uv[:, 1] = -uv[:, 1]
        aux = np.zeros((n, 4), dtype=np.uint8)
        aux[:, 0] = [c[4] * 16 for c in corners]                                       # 部件号 × 16
        aux[:, 1] = [int((c[5] * 0.618034) % 1.0 * 255) if c[5] else 0 for c in corners]  # 每扇窗一个随机数
        attrs = {'POSITION': add(pos, 5126, 'VEC3', minmax=True), 'NORMAL': add(nor[:, :3].copy(order='C') if False else nor, 5120, 'VEC3', normalized=True),
                 'COLOR_0': add(col, 5121, 'VEC4', normalized=True), 'TEXCOORD_0': add(uv, 5126, 'VEC2'), 'TEXCOORD_1': add(aux, 5121, 'VEC2', normalized=True)}
        # （法线和 TEXCOORD_1 各占 4 字节一组、只用前几个分量：byteStride 说明步长）
        views[accessors[attrs['NORMAL']]['bufferView']]['byteStride'] = 4
        views[accessors[attrs['TEXCOORD_1']]['bufferView']]['byteStride'] = 4
        gmeshes.append({'name': name, 'primitives': [{'attributes': attrs, 'mode': 4}]})
        nodes.append({'name': name, 'mesh': len(gmeshes) - 1})
    g = {'asset': {'version': '2.0', 'generator': 'deepseek-world tools/ghibli4 (Blender %s)' % bpy.app.version_string},
         'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
         'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': gmeshes, 'accessors': accessors, 'bufferViews': views,
         'buffers': [{'byteLength': len(blob)}]}
    js = json.dumps(g, separators=(',', ':')).encode('utf-8')
    js += b' ' * (-len(js) % 4)
    blob += b'\0' * (-len(blob) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(blob), b'BIN\0') + bytes(blob))


def preview_object(name, corners, tints):
    """Blender 里的预览物体：把墙色瓦色点缀色先乘进顶点色（游戏里是着色器乘的）。"""
    me = bpy.data.meshes.new(name)
    n = len(corners)
    me.from_pydata([tuple(c[0]) for c in corners], [], [(i, i + 1, i + 2) for i in range(0, n, 3)])
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    part_tint = {0: tints['wall'], 1: tints['roof'], 5: tints['accent'], 8: tints['accent'], 4: (0.2, 0.28, 0.4)}
    for i, c in enumerate(corners):
        t = kitlib.lin(part_tint[c[4]]) if c[4] in part_tint else (1, 1, 1)
        attr.data[i].color = (c[2][0] * t[0], c[2][1] * t[1], c[2][2] * t[2], 1)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.get('KitPreview')
    if not mat:
        mat = bpy.data.materials.new('KitPreview')
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Roughness'].default_value = 1.0
        vc = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        mat.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        mat.use_backface_culling = False
    me.materials.append(mat)
    return ob


def render(objs, path, cols=7, view=(0.55, -1.0, 0.42), res=(2200, 1500)):
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'JPEG'
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('W')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.36, 0.56, 0.86, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sc.collection.objects.link(sun)
    sun.data.energy = 3.2
    sun.data.color = (1.0, 0.95, 0.85)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
    cell = float(arg('--cell', '15'))
    rows = math.ceil(len(objs) / cols)
    for i, ob in enumerate(objs):
        r, c = divmod(i, cols)
        ob.location = (c * cell, -r * cell * 1.15, 0)
        if arg('--cell'):
            ob.location = (c * float(arg('--cell')), -r * float(arg('--cell')) * 1.15, 0)
    bpy.ops.mesh.primitive_plane_add(size=1)
    g = bpy.context.object
    g.scale = (cols * cell + 30, rows * cell * 1.15 + 30, 1)
    g.location = ((cols - 1) * cell / 2, -(rows - 1) * cell * 1.15 / 2, 0)
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.2, 0.42, 0.1, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
    g.data.materials.append(gm)
    ctr = Vector(((cols - 1) * cell / 2, -(rows - 1) * cell * 1.15 / 2, 3.0))
    cd = bpy.data.cameras.new('Cam')
    cd.type = 'ORTHO'
    cd.ortho_scale = max(cols * cell * 1.05, rows * cell * 1.15 * 1.25 * res[0] / res[1])
    cam = bpy.data.objects.new('Cam', cd)
    sc.collection.objects.link(cam)
    cam.location = ctr + Vector(view).normalized() * 200
    cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
only = arg('--only')
only = set(only.split(',')) if only else None
import random as _random  # noqa: E402

meshes, manifest, previews = [], [], []
for kid, shape, style, seed, recipe, extra in KIT:
    if only and kid not in only:
        continue
    k = Kit(seed)
    rect = recipe(k)
    corners = k.bake()
    zs = [c[0].z for c in corners]
    xs = [c[0].x for c in corners]
    ys = [c[0].y for c in corners]
    item = {'id': kid, 'shape': shape, 'style': style, 'w': round(rect[1] - rect[0], 2), 'd': round(rect[3] - rect[2], 2), 'h': round(max(zs), 2),
            'tris': len(corners) // 3, 'bounds': [round(min(xs), 2), round(max(xs), 2), round(min(ys), 2), round(max(ys), 2)],
            # 正面（朝街那一面）离中心多远：门口的东西摆在它外面
            'front': round(-rect[2], 2)}
    item.update(extra)
    manifest.append(item)
    meshes.append((kid, corners))
    rr = _random.Random(seed * 7)
    p = PREVIEW[style]
    previews.append(preview_object(kid, corners, {'wall': rr.choice(p['wall']), 'roof': rr.choice(p['roof']), 'accent': rr.choice(p['accent'])}))
    print(f"KIT {kid:12s} {shape:8s} {style:8s} {item['w']:5.1f} x {item['d']:5.1f} x {item['h']:5.1f} m  {item['tris']:5d} tris")

if not only:
    write_glb(os.path.join(OUT, 'kit.glb'), meshes)
    json.dump({'style': '吉卜力风房屋套件（tools/ghibli4）', 'parts': kitlib.PART, 'total_tris': sum(m['tris'] for m in manifest), 'items': manifest},
              open(os.path.join(OUT, 'kit.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('WROTE', os.path.join(OUT, 'kit.glb'), round(os.path.getsize(os.path.join(OUT, 'kit.glb')) / 1048576, 2), 'MB,', len(manifest), 'models,', sum(m['tris'] for m in manifest), 'tris')
if arg('--blend'):
    os.makedirs(os.path.dirname(os.path.abspath(arg('--blend'))), exist_ok=True)
    for i, ob in enumerate(previews):
        ob.location = ((i % 7) * 15.0, -(i // 7) * 17.0, 0)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(arg('--blend')))
if arg('--render'):
    render(previews, os.path.abspath(arg('--render')), cols=int(arg('--cols', '7')))
    print('RENDER', arg('--render'))
