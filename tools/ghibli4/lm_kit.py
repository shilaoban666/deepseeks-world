"""套件的第二部分：街具和地标。配方写法和 build_kit.py 里的房子一样，由 build_kit.py 调 install() 接进清单。

每个配方返回占地 rect；清单里另外记：
  fit  [宽, 高, 深]：游戏里原来那个程序化的东西按这个尺寸做的，实例按参数和它的比例缩放（None = 这个方向不缩）
  sign [离地高, 离中心往前, 宽, 高]：招牌挂在哪（游戏里的字还是原来那套招牌贴图）
正面朝 -Y（到了游戏里是 +Z），和房子一样。
"""
import math

from mathutils import Vector

import kitlib
from kitlib import C, Side, UP, lin

C.update({k: lin(v) for k, v in {
    'palace': (0.72, 0.2, 0.15), 'teal': (0.16, 0.46, 0.44), 'dark': (0.1, 0.11, 0.16), 'water': (0.4, 0.68, 0.84), 'snow': (0.97, 0.98, 1.0),
    'ghglass': (0.72, 0.88, 0.86), 'crane': (0.86, 0.42, 0.16), 'c1': (0.72, 0.26, 0.2), 'c2': (0.2, 0.42, 0.62), 'c3': (0.24, 0.5, 0.36), 'c4': (0.86, 0.66, 0.24),
    'c5': (0.5, 0.52, 0.56), 'carrot': (0.95, 0.5, 0.15), 'bronze': (0.36, 0.34, 0.26), 'red2': (0.8, 0.2, 0.16),
}.items()})
TAU = math.tau


def ring(cx, cy, r, z, n, rot=0.0, sq=1.0):
    return [Vector((cx + math.cos(rot + i / n * TAU) * r, cy + math.sin(rot + i / n * TAU) * r * sq, z)) for i in range(n)]


def prism(k, cx, cy, r0, r1, z0, z1, n, part, col, top=True, bottom=False, rot=0.0, sq=1.0, wid=0.0):
    """棱柱 / 棱台 / 棱锥（r1 = 0）。"""
    a, b = ring(cx, cy, r0, z0, n, rot, sq), ring(cx, cy, r1, z1, n, rot, sq)
    for i in range(n):
        pts = [a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]] if r1 > 1e-6 else [a[i], a[(i + 1) % n], b[i]]
        m = (a[i] + a[(i + 1) % n]) / 2 if r0 > 1e-6 else (b[i] + b[(i + 1) % n]) / 2
        k.face(pts, part, col, Vector((m.x - cx, m.y - cy, (r0 - r1) * 0.9 + 1e-4 * (z1 - z0))), wid)
    if top and r1 > 1e-6:
        k.face(b, part, col, UP)
    if bottom:
        k.face(a, part, col, -UP)


def ball(k, c, r, col, part='plain', n=8, m=6, sq=1.0, half=False):
    cx, cy, cz = c
    for j in range(m // 2 if half else 0, m):
        p0, p1 = -math.pi / 2 + math.pi * j / m, -math.pi / 2 + math.pi * (j + 1) / m
        prism(k, cx, cy, r * math.cos(p0), max(0.0, r * math.cos(p1)), cz + r * sq * math.sin(p0), cz + r * sq * math.sin(p1), n, part, col, top=False)


def bx(k, cx, cy, w, d, z0, z1, part, col, **kw):
    k.box(cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, z0, z1, part, col, **kw)


def columns(k, rect, z0, z1, every=3.4, r=0.3, col=None, n=8, sides=('front', 'back', 'left', 'right')):
    col = col or C['palace']
    done = set()
    for name in sides:
        s = Side(rect, name)
        m = max(1, round(s.len / every))
        for i in range(m + 1):
            p = s.p(s.len * i / m, 0, 0)
            key = (round(p.x, 2), round(p.y, 2))
            if key in done:
                continue
            done.add(key)
            prism(k, p.x, p.y, r, r * 0.9, z0, z1, n, 'plain', col, top=False)
            bx(k, p.x, p.y, r * 2.6, r * 2.6, z0 - 0.25, z0 + 0.12, 'stone', C['stone2'])


def lattice_door(k, s, u, w, h, z=0.0, col=None, part='accent'):
    """宫殿、庙的格子门：深色的底，上半截细格。"""
    k.squad(s, u - w / 2, u + w / 2, z, z + h, 0.03, part, col or C['white'])
    k.squad(s, u - w / 2 + 0.12, u + w / 2 - 0.12, z + h * 0.42, z + h - 0.14, 0.045, 'plain', C['dark'])
    for i in range(1, 4):
        x = u - w / 2 + w * i / 4
        k.beam(s, x, z + h * 0.42, x, z + h - 0.14, 0.05, C['brass'], w=0.06)
    k.beam(s, u - w / 2, z + h * 0.7, u + w / 2, z + h * 0.7, 0.05, C['brass'], w=0.06)


def finial(k, x, y, z, h=1.0, col=None):
    col = col or C['brass']
    ball(k, (x, y, z + 0.22), 0.22, col, n=6, m=4)
    k.box(x - 0.04, x + 0.04, y - 0.04, y + 0.04, z + 0.3, z + h, 'plain', col)


# ====================================================================================================================
# 街具
# ====================================================================================================================
def lamp(k):
    k.box(-0.12, 0.12, -0.12, 0.12, 0, 0.5, 'plain', C['iron'])
    k.box(-0.16, 0.16, -0.16, 0.16, 0, 0.08, 'plain', C['iron'])
    k.box(-0.05, 0.05, -0.05, 0.05, 0.5, 3.36, 'plain', C['iron'])
    k.box(-0.03, 0.03, -0.66, 0.0, 3.25, 3.31, 'plain', C['iron'])
    k.beam_3d((0, -0.05, 2.86), (0, -0.42, 3.25), 0.02, C['iron'])
    k.box(-0.14, 0.14, -0.74, -0.46, 2.76, 3.08, 'lamp', C['yellow'])
    k.box(-0.16, 0.16, -0.76, -0.44, 2.72, 2.76, 'plain', C['iron'])
    prism(k, 0, -0.6, 0.27, 0.0, 3.08, 3.3, 4, 'plain', C['iron'], rot=math.pi / 4)
    return (-0.3, 0.3, -0.8, 0.2)


def bench(k):
    for i in range(3):
        k.box(-1.1, 1.1, -0.3 + i * 0.21, -0.3 + i * 0.21 + 0.17, 0.46, 0.52, 'wood', C['plank2'] if i % 2 else C['plank'])
    for i in range(2):
        k.box(-1.1, 1.1, -0.34, -0.28, 0.66 + i * 0.22, 0.83 + i * 0.22, 'wood', C['plank'] if i % 2 else C['plank2'])
    for x in (-0.9, 0.9):
        k.box(x - 0.04, x + 0.04, -0.32, 0.3, 0, 0.46, 'plain', C['iron'])
        k.box(x - 0.04, x + 0.04, -0.36, -0.28, 0.46, 1.1, 'plain', C['iron'])
        k.box(x - 0.05, x + 0.05, -0.3, 0.3, 0.66, 0.71, 'plain', C['iron'])
    return (-1.1, 1.1, -0.4, 0.3)


def fence(k):
    k.box(-0.86, -0.74, -0.06, 0.06, -0.3, 1.14, 'wood', C['timber2'])
    k.box(-0.88, -0.72, -0.08, 0.08, 1.14, 1.2, 'wood', C['timber'])
    for z in (0.4, 0.8):
        k.box(-0.8, 0.8, -0.03, 0.03, z - 0.05, z + 0.05, 'wood', C['plank'])
    for x in (-0.27, 0.27):
        k.box(x - 0.04, x + 0.04, -0.045, -0.02, 0.08, 1.0, 'wood', C['plank2'])
    return (-0.8, 0.8, -0.1, 0.1)


def stonelantern(k):
    prism(k, 0, 0, 0.44, 0.38, 0, 0.3, 6, 'stone', C['stone2'])
    prism(k, 0, 0, 0.19, 0.16, 0.3, 1.25, 6, 'stone', C['stone'], top=False)
    prism(k, 0, 0, 0.36, 0.42, 1.25, 1.36, 6, 'stone', C['stone2'])
    k.box(-0.26, 0.26, -0.26, 0.26, 1.36, 1.78, 'stone', C['stone'])
    for s in Side((-0.26, 0.26, -0.26, 0.26), 'front'), Side((-0.26, 0.26, -0.26, 0.26), 'back'), Side((-0.26, 0.26, -0.26, 0.26), 'left'), Side((-0.26, 0.26, -0.26, 0.26), 'right'):
        k.squad(s, 0.12, 0.4, 1.44, 1.7, 0.012, 'lamp', C['yellow'])
    prism(k, 0, 0, 0.56, 0.12, 1.78, 2.08, 4, 'stone', C['stone2'], rot=math.pi / 4)
    ball(k, (0, 0, 2.14), 0.1, C['stone'], part='stone', n=6, m=4)
    return (-0.5, 0.5, -0.5, 0.5)


def stall(k):
    k.box(-1.5, 1.5, -0.8, 0.8, 0, 0.9, 'wood', C['plank'], top=('wood', C['plank2']))
    for z in (0.25, 0.62):
        k.box(-1.52, 1.52, -0.82, 0.82, z, z + 0.06, 'wood', C['timber2'])
    for x in (-1.42, 1.42):
        for y in (-0.82, 0.82):
            k.box(x - 0.05, x + 0.05, y - 0.05, y + 0.05, 0, 2.5 if y > 0 else 2.2, 'wood', C['timber2'])
    n = 6
    for i in range(n):
        a, b = -1.75 + 3.5 * i / n, -1.75 + 3.5 * (i + 1) / n
        part, col = ('cloth', C['white']) if i % 2 == 0 else ('plain', C['cream'])
        k.face([(a, 1.05, 2.62), (b, 1.05, 2.62), (b, -1.25, 2.2), (a, -1.25, 2.2)], part, col, UP)
        k.face([(a, -1.25, 2.2), (b, -1.25, 2.2), (b, -1.27, 1.98), (a, -1.27, 1.98)], part, col, (0, -1, 0))
    k.face([(-1.75, 1.05, 2.6), (1.75, 1.05, 2.6), (1.75, -1.25, 2.18), (-1.75, -1.25, 2.18)], 'plain', tuple(v * 0.8 for v in C['cream']), -UP)
    cols = [C['red'], C['yellow'], C['leaf2'], C['carrot'], C['pink'], C['leaf']]
    for i in range(5):
        x = -1.2 + i * 0.6
        k.box(x - 0.24, x + 0.24, -0.6, -0.1, 0.9, 1.02, 'wood', C['plank2'])
        for j in range(3):
            ball(k, (x - 0.14 + j * 0.14, -0.35 + (j % 2) * 0.12, 1.1), 0.11, cols[(i + j) % len(cols)], n=6, m=4)
    k.box(-0.5, 0.5, 0.2, 0.7, 0.9, 1.3, 'wood', C['plank2'])
    return (-1.6, 1.6, -1.0, 1.0)


def fountain(k):
    prism(k, 0, 0, 6.5, 6.4, -0.6, 1.0, 16, 'stone', C['stone'])
    prism(k, 0, 0, 6.6, 6.6, 1.0, 1.16, 16, 'stone', C['stone3'])
    prism(k, 0, 0, 5.5, 5.5, 1.16, 1.3, 16, 'plain', C['water'])
    prism(k, 0, 0, 1.3, 0.9, 1.0, 1.7, 8, 'stone', C['stone2'])
    prism(k, 0, 0, 0.7, 0.55, 1.7, 3.9, 8, 'stone', C['stone'], top=False)
    prism(k, 0, 0, 0.9, 2.5, 3.6, 4.1, 12, 'stone', C['stone3'], top=False, bottom=True)
    prism(k, 0, 0, 2.3, 2.3, 4.08, 4.14, 12, 'plain', C['water'])
    prism(k, 0, 0, 0.4, 0.3, 4.1, 5.0, 8, 'stone', C['stone'], top=False)
    prism(k, 0, 0, 0.3, 0.9, 4.9, 5.2, 8, 'stone', C['stone3'], top=False, bottom=True)
    ball(k, (0, 0, 5.5), 0.3, C['stone2'], part='stone', n=6, m=4)
    for i in range(4):   # 四道落水
        a = i / 4 * TAU + 0.4
        k.beam_3d((math.cos(a) * 2.3, math.sin(a) * 2.3, 4.05), (math.cos(a) * 2.9, math.sin(a) * 2.9, 1.3), 0.07, C['water'])
    return (-6.5, 6.5, -6.5, 6.5)


def haystack(k):
    prism(k, 0, 0, 1.4, 1.5, 0, 1.2, 10, 'plain', C['straw'], top=False)
    ball(k, (0, 0, 1.15), 1.52, C['straw'], n=10, m=6, sq=0.95, half=True)
    prism(k, 0, 0, 0.5, 0.0, 2.45, 3.0, 6, 'plain', tuple(v * 0.8 for v in C['straw']))
    k.box(-0.05, 0.05, -0.05, 0.05, 2.6, 3.3, 'wood', C['timber2'])
    return (-1.5, 1.5, -1.5, 1.5)


def logpile(k):
    r = 0.28
    i = 0
    for row, n in enumerate((3, 2, 1)):
        for j in range(n):
            y = (j - (n - 1) / 2) * r * 2.05
            z = r + row * r * 1.75
            with k.turned(0, 0, 0):
                a, b = ring(0, y, r, 0, 7), None
            pts0 = [Vector((-1.1, y + math.cos(t / 7 * TAU) * r, z + math.sin(t / 7 * TAU) * r)) for t in range(7)]
            pts1 = [p + Vector((2.2 + 0.1 * ((i * 7) % 3 - 1), 0, 0)) for p in pts0]
            for t in range(7):
                q = [pts0[t], pts0[(t + 1) % 7], pts1[(t + 1) % 7], pts1[t]]
                k.face(q, 'wood', C['timber2'] if i % 2 else C['timber'], sum(q, Vector()) / 4 - Vector((0, y, z)))
            k.face(pts0, 'wood', C['plank2'], (-1, 0, 0))
            k.face(pts1, 'wood', C['plank2'], (1, 0, 0))
            i += 1
    return (-1.1, 1.1, -0.9, 0.9)


def crate(k):
    a = 1.1
    k.box(-a / 2, a / 2, -a / 2, a / 2, 0, a, 'wood', C['plank2'])
    for z in (0.16, 0.86):
        k.box(-a / 2 - 0.03, a / 2 + 0.03, -a / 2 - 0.03, a / 2 + 0.03, z, z + 0.12, 'wood', C['timber2'])
    for s in (Side((-a / 2, a / 2, -a / 2, a / 2), n) for n in ('front', 'back', 'left', 'right')):
        k.beam(s, 0.08, 0.3, a - 0.08, 0.84, 0.1, C['timber2'], w=0.02)
    return (-0.6, 0.6, -0.6, 0.6)


def snowman(k):
    ball(k, (0, 0, 0.5), 0.62, C['snow'], n=10, m=6)
    ball(k, (0, 0, 1.3), 0.46, C['snow'], n=10, m=6)
    ball(k, (0, 0, 1.92), 0.33, C['snow'], n=10, m=6)
    k.beam_3d((0, -0.3, 1.92), (0, -0.64, 1.9), 0.05, C['carrot'])
    for x in (-0.12, 0.12):
        k.box(x - 0.03, x + 0.03, -0.33, -0.29, 2.0, 2.06, 'plain', C['dark'])
    for i in range(3):
        k.box(-0.03, 0.03, -0.47, -0.43, 1.12 + i * 0.16, 1.18 + i * 0.16, 'plain', C['dark'])
    k.beam_3d((0.4, 0, 1.4), (1.0, 0, 1.75), 0.025, C['timber'], part='wood')
    k.beam_3d((-0.4, 0, 1.4), (-1.0, 0, 1.7), 0.025, C['timber'], part='wood')
    prism(k, 0, 0, 0.2, 0.17, 2.2, 2.5, 8, 'plain', C['c2'])
    prism(k, 0, 0, 0.3, 0.3, 2.18, 2.22, 8, 'plain', C['c2'])
    prism(k, 0, 0, 0.36, 0.34, 1.6, 1.72, 8, 'plain', C['red'], top=False)   # 围巾
    return (-0.7, 0.7, -0.7, 0.7)


# ====================================================================================================================
# 地标
# ====================================================================================================================
def gate(k, ns):
    for x in (-6.5, 0, 6.5):
        k.box(x - 0.75, x + 0.75, -0.75, 0.75, -0.6, 9.3, 'wood', C['timber2'])
        k.box(x - 1.0, x + 1.0, -1.0, 1.0, -0.8, 0.7, 'stone', C['stone2'])
        k.box(x - 0.85, x + 0.85, -0.85, 0.85, 5.3, 5.6, 'wood', C['timber'])
    k.box(-8.25, 8.25, -0.9, 0.9, 7.5, 8.9, 'wood', C['plank'])
    k.box(-7.75, 7.75, -0.8, 0.8, 5.85, 6.9, 'wood', C['plank'])
    for x in (-3.25, 3.25):
        k.box(x - 0.3, x + 0.3, -0.6, 0.6, 6.9, 7.5, 'wood', C['timber'])
    k.gable((-9.0, 9.0, -1.5, 1.5), 9.15, 1.7, over=0.75, verge=0.5, sag=0.12, kick=0.5, wall=('wood', C['timber']))
    k.squad(Side((-2.9, 2.9, -0.92, 0.92), 'front'), 0, 5.8, 7.5, 8.82, 0.03, 'plain', C['cream'])
    for x in (-7.4, 7.4):   # 垂着的灯笼
        k.box(x - 0.05, x + 0.05, -0.05, 0.05, 6.9, 7.5, 'plain', C['iron'])
        k.box(x - 0.3, x + 0.3, -0.3, 0.3, 6.2, 6.9, 'lamp', C['red'])
    return (-9, 9, -1.6, 1.6)


def gatetower(k, ns):
    for sx in (-1, 1):
        k.box(sx * 4.75 - 2.35, sx * 4.75 + 2.35, -4.1, 4.1, -1.5, 6.0, 'stone', C['stone3'])
        k.box(sx * 4.75 - 2.5, sx * 4.75 + 2.5, -4.25, 4.25, -1.5, 0.8, 'stone', C['stone2'])
    k.box(-2.6, 2.6, -4.0, 4.0, 4.6, 6.0, 'stone', C['stone3'])
    for sx in (-1, 1):   # 拱的意思：两边的抹角
        k.hexa([(sx * 2.6, -4.0, 3.6), (sx * 2.6, 4.0, 3.6), (sx * 2.6, 4.0, 4.6), (sx * 2.6, -4.0, 4.6),
                (sx * 1.5, -4.0, 4.6), (sx * 1.5, 4.0, 4.6), (sx * 1.5, 4.0, 4.6), (sx * 1.5, -4.0, 4.6)], 'stone', C['stone2'])
    k.box(-7.4, 7.4, -4.4, 4.4, 6.0, 6.4, 'stone', C['stone2'])
    for sx in range(-6, 7, 2):   # 垛口
        for y in (-4.25, 4.25):
            k.box(sx - 0.55, sx + 0.55, y - 0.3, y + 0.3, 6.4, 7.1, 'stone', C['stone3'])
    up = (-5.4, 5.4, -2.8, 2.8)
    k.walls(up, 6.4, 9.5)
    ns['jp_frame'](k, up, 6.4, 9.5)
    for name in ('front', 'back'):
        s = Side(up, name)
        for u in (2.0, 5.4, 8.8):
            k.window(s, u, 7.3, 1.6, 1.2, frame=C['jpwood'], bars=(4, 0), sill=False)
    k.hip((-5.6, 5.6, -3.0, 3.0), 9.5, 2.9, over=1.5, thick=0.18)
    finial(k, -2.9, 0, 12.4, 0.9)
    finial(k, 2.9, 0, 12.4, 0.9)
    k.squad(Side((-2.3, 2.3, -4.12, 4.12), 'front'), 0, 4.6, 4.75, 5.85, 0.03, 'plain', C['cream'])
    for sx in (-1, 1):
        k.box(sx * 2.9 - 0.25, sx * 2.9 + 0.25, -4.5, -4.2, 3.0, 3.7, 'lamp', C['red'])
    return (-7.5, 7.5, -4.5, 4.5)


def palace(k, ns):
    k.box(-24, 24, -17, 17, -1.5, 1.5, 'stone', C['stone3'])
    k.box(-21, 21, -14, 14, 1.5, 3.0, 'stone', C['stone3'])
    for (hw, hd, z) in ((24, 17, 1.5), (21, 14, 3.0)):   # 汉白玉栏杆
        for name in ('front', 'back', 'left', 'right'):
            s = Side((-hw, hw, -hd, hd), name)
            segs = [(0, s.len)] if name != 'front' else [(0, s.len / 2 - 5.5), (s.len / 2 + 5.5, s.len)]
            for a, b in segs:
                k.sbox(s, a, b, -0.3, -0.12, z + 0.55, z + 0.7, 'plain', C['cream'])
                n = max(2, int((b - a) / 2.4))
                for i in range(n + 1):
                    u = a + (b - a) * i / n
                    k.sbox(s, u - 0.12, u + 0.12, -0.33, -0.09, z, z + 0.95, 'plain', C['cream'])
    for i in range(10):
        k.box(-5, 5, -20.6 + i * 0.66, -13.8, -1.5, (i + 1) * 0.3, 'stone', C['stone'])
    hall = (-16, 16, -8, 8)
    k.walls(hall, 3.0, 9.6, 'plain', C['palace'])
    columns(k, (-17.2, 17.2, -9.2, 9.2), 3.0, 9.6, every=4.3, r=0.42)
    k.box(-17.6, 17.6, -9.6, 9.6, 9.0, 9.7, 'plain', C['teal'])
    s = Side(hall, 'front')
    for i in range(7):
        lattice_door(k, s, 32 * (i + 0.5) / 7, 3.4, 5.2, 3.05, col=C['palace'], part='plain')
    for name in ('left', 'right', 'back'):
        sd = Side(hall, name)
        for i in range(max(2, int(sd.len / 5))):
            lattice_door(k, sd, sd.len * (i + 0.5) / max(2, int(sd.len / 5)), 2.6, 3.0, 5.0, col=C['palace'], part='plain')
    k.hip((-17.6, 17.6, -9.6, 9.6), 9.7, 3.8, over=2.3, thick=0.22)
    t2 = (-11, 11, -5.2, 5.2)
    k.walls(t2, 11.4, 14.4, 'plain', C['palace'])
    k.box(-11.6, 11.6, -5.8, 5.8, 13.9, 14.5, 'plain', C['teal'])
    for name in ('front', 'back'):
        sd = Side(t2, name)
        for i in range(5):
            lattice_door(k, sd, 22 * (i + 0.5) / 5, 3.0, 1.9, 11.9, col=C['palace'], part='plain')
    k.hip((-11.6, 11.6, -5.8, 5.8), 14.5, 3.5, over=2.0, thick=0.2)
    t3 = (-6, 6, -3, 3)
    k.walls(t3, 16.2, 18.6, 'plain', C['palace'])
    k.box(-6.5, 6.5, -3.5, 3.5, 18.2, 18.7, 'plain', C['teal'])
    k.hip((-6.5, 6.5, -3.5, 3.5), 18.7, 3.3, over=1.8, thick=0.2)
    for x in (-3.4, 3.4):
        finial(k, x, 0, 22.0, 1.3)
    k.squad(Side((-3.2, 3.2, -8.05, 8.05), 'front'), 0, 6.4, 7.6, 9.0, 0.06, 'plain', C['c2'])   # 匾
    for sx in (-1, 1):   # 配亭
        p = (sx * 20 - 2.6, sx * 20 + 2.6, -13.6, -8.4)
        columns(k, p, 1.5, 4.9, every=5.2, r=0.26)
        k.box(p[0] - 0.2, p[1] + 0.2, p[2] - 0.2, p[3] + 0.2, 4.6, 5.0, 'plain', C['teal'])
        k.hip((p[0] - 0.2, p[1] + 0.2, p[2] - 0.2, p[3] + 0.21), 5.0, 2.4, over=1.2)
        prism(k, sx * 20, -11, 0.7, 0.5, 1.5, 2.3, 8, 'plain', C['bronze'])   # 香炉
    return (-24, 24, -20.6, 17)


def mosque(k, ns):
    k.box(-13.3, 13.3, -10.3, 10.3, -1.6, 0.6, 'stone', C['stone3'])
    for i in range(4):
        k.box(-4, 4, -12.2 + i * 0.5, -10.2, -1.6, 0.6 - (3 - i) * 0.16 - 0.1 + 0.1, 'stone', C['stone'])
    body = (-13, 13, -10, 10)
    k.walls(body, 0.6, 8.2)
    k.box(-13.3, 13.3, -10.3, 10.3, 7.2, 7.5, 'roof', C['white'])
    k.box(-13.35, 13.35, -10.35, 10.35, 8.2, 8.75, 'wall', C['white'])
    for name in ('front', 'back', 'left', 'right'):
        s = Side(body, name)
        n = 5 if s.len > 22 else 4
        for i in range(n):
            u = s.len * (i + 0.5) / n
            w, h = (2.9, 4.4) if name == 'front' else (1.5, 3.2)
            z = 0.9 if name == 'front' else 2.2
            col = C['dark'] if not (name == 'front' and i == 2) else C['teal']
            k.squad(s, u - w / 2, u + w / 2, z, z + h, 0.03, 'plain', col)
            k.face([s.p(u - w / 2, 0.03, z + h), s.p(u + w / 2, 0.03, z + h), s.p(u, 0.03, z + h + w * 0.62)], 'plain', col, s.dw)
            for a, b in ((u - w / 2 - 0.18, u - w / 2), (u + w / 2, u + w / 2 + 0.18)):
                k.squad(s, a, b, z, z + h, 0.06, 'roof', C['white'])
            k.beam(s, u - w / 2 - 0.18, z + h + 0.04, u, z + h + w * 0.62 + 0.2, 0.2, C['cream'], w=0.06)
            k.beam(s, u + w / 2 + 0.18, z + h + 0.04, u, z + h + w * 0.62 + 0.2, 0.2, C['cream'], w=0.06)
        for i in range(int(s.len / 1.6)):   # 垛口
            u = 0.8 + i * 1.6
            k.sbox(s, u - 0.4, u + 0.4, -0.3, 0.02, 8.75, 9.35, 'wall', C['white'])
    prism(k, 0, 0, 6.6, 6.6, 8.2, 10.6, 16, 'wall', C['white'], top=False)
    prism(k, 0, 0, 6.9, 6.9, 10.4, 10.8, 16, 'roof', C['white'])
    ball(k, (0, 0, 10.8), 6.4, C['white'], part='roof', n=16, m=8, sq=1.12, half=True)
    finial(k, 0, 0, 17.9, 1.6)
    for sx in (-1, 1):
        for sy in (-1, 1):
            if sy < 0:
                x, y = sx * 12.6, -9.6
                prism(k, x, y, 1.5, 1.5, -1.6, 1.4, 8, 'stone', C['stone3'], top=False)
                prism(k, x, y, 1.25, 1.05, 1.4, 16.5, 8, 'wall', C['white'], top=False)
                prism(k, x, y, 1.2, 1.9, 13.4, 13.9, 8, 'wall', C['white'], bottom=True)
                prism(k, x, y, 1.9, 1.9, 13.9, 14.5, 8, 'roof', C['white'], top=False)
                prism(k, x, y, 0.9, 0.9, 16.5, 18.2, 8, 'plain', C['dark'], top=False)
                prism(k, x, y, 1.3, 0.0, 18.2, 21.6, 8, 'roof', C['white'])
                finial(k, x, y, 21.4, 1.2)
            else:
                prism(k, sx * 9.5, 7, 2.3, 2.3, 8.2, 9.3, 10, 'wall', C['white'], top=False)
                ball(k, (sx * 9.5, 7, 9.3), 2.3, C['white'], part='roof', n=10, m=6, half=True)
    return (-13.5, 13.5, -12.2, 10.5)


def temple(k, ns):
    k.box(-11.5, 11.5, -9, 9, -1.5, 1.2, 'stone', C['stone3'])
    for i in range(5):
        k.box(-3.6, 3.6, -11.0 + i * 0.5, -8.9, -1.5, 0.24 * (i + 1), 'stone', C['stone'])
    hall = (-8.6, 8.6, -5.6, 5.6)
    k.walls(hall, 1.2, 5.7)
    ns['jp_frame'](k, hall, 1.2, 5.7, col=C['palace'])
    columns(k, (-10.2, 10.2, -7.4, 7.4), 1.2, 5.7, every=3.4, r=0.3)
    k.box(-10.5, 10.5, -7.7, 7.7, 5.4, 5.8, 'plain', C['teal'])
    s = Side(hall, 'front')
    for i in range(5):
        lattice_door(k, s, 17.2 * (i + 0.5) / 5, 2.7, 3.6, 1.25, col=C['palace'], part='plain')
    for name in ('left', 'right'):
        sd = Side(hall, name)
        k.window(sd, sd.len / 2, 2.6, 2.4, 1.6, frame=C['palace'], bars=(5, 1), sill=False)
    k.hip((-10.5, 10.5, -7.7, 7.7), 5.8, 2.9, over=1.7, thick=0.2)
    up = (-5.6, 5.6, -3.3, 3.3)
    k.walls(up, 7.6, 9.6)
    ns['jp_frame'](k, up, 7.6, 9.6, col=C['palace'])
    k.box(-6.0, 6.0, -3.7, 3.7, 9.3, 9.7, 'plain', C['teal'])
    k.hip((-6.0, 6.0, -3.7, 3.7), 9.7, 3.0, over=1.6, thick=0.2)
    for x in (-3.0, 3.0):
        finial(k, x, 0, 12.6, 1.0)
    prism(k, 0, -8.0, 0.75, 0.55, 1.2, 2.2, 8, 'plain', C['bronze'])   # 香炉
    prism(k, 0, -8.0, 0.9, 0.9, 2.2, 2.35, 8, 'plain', C['bronze'])
    k.squad(Side((-2.2, 2.2, -5.65, 5.65), 'front'), 0, 4.4, 4.5, 5.4, 0.08, 'plain', C['c2'])
    return (-11.5, 11.5, -11, 9)


def gym(k, ns):
    R = 26.0
    prism(k, 0, 0, R + 0.5, R + 0.5, -1.5, 1.2, 24, 'stone', C['stone3'], top=False)
    prism(k, 0, 0, R, R, 1.2, 12.0, 24, 'wall', C['white'], top=False)
    for i, s in enumerate(ns['ngon_sides'](0, 0, R * math.cos(math.pi / 24), 24)):
        if i != 0:
            k.window(s, s.len / 2, 5.4, 3.0, 3.6, bars=(2, 2))
            k.window(s, s.len / 2, 2.0, 2.2, 1.6, bars=(1, 0))
        k.sbox(s, -0.4, 0.4, -0.2, 0.5, -1.5, 12.0, 'stone', C['stone3'])   # 扶壁
    prism(k, 0, 0, R + 0.7, R + 0.7, 12.0, 12.9, 24, 'stone', C['stone2'])
    ball(k, (0, 0, 12.9), R + 0.2, C['white'], part='roof', n=24, m=10, sq=0.5, half=True)
    prism(k, 0, 0, 3.4, 3.4, 25.3, 27.4, 12, 'wall', C['white'], top=False)
    for s in ns['ngon_sides'](0, 0, 3.4 * math.cos(math.pi / 12), 12):
        k.squad(s, 0.25, s.len - 0.25, 25.7, 27.0, 0.03, 'glass', C['glass'], 99)
    prism(k, 0, 0, 3.9, 0.0, 27.4, 30.0, 12, 'roof', C['white'])
    finial(k, 0, 0, 29.8, 1.6)
    portal = (-5.5, 5.5, -28.2, -24.5)
    k.walls(portal, -1.5, 7.6, sides=('front', 'left', 'right'))
    s = Side(portal, 'front')
    k.door(s, 5.5, 3.6, 4.2, step=False)
    for u in (1.2, 9.8):
        k.sbox(s, u - 0.5, u + 0.5, 0, 0.5, -1.5, 7.6, 'stone', C['stone3'])
    with k.turned(0, -26.35):
        k.gable((-1.85, 1.85, -26.35 - 5.5, -26.35 + 5.5), 7.6, 3.0, over=0.5, verge=0.3, sag=0.03)
    for i in range(5):
        k.box(-5.5, 5.5, -30.6 + i * 0.5, -28.1, -1.5, 0.22 * (i + 1) - 0.1, 'stone', C['stone'])
    return (-26.5, 26.5, -30.6, 26.5)


def hall_big(k, ns, floors=2):
    r = k.r
    rect = (-9, 9, -5.5, 5.5)
    ns['block'](k, rect, floors, ridge='x', pitch=0.78, jetty=0.3, dormers=3, chim=2, fh0=3.3, fh=2.9, door=('front', 9.0), boxes=0.7, over=0.6)
    s = Side(rect, 'front')
    # 门廊：两根柱子托一个小山花
    for u in (7.4, 10.6):
        k.sbox(s, u - 0.16, u + 0.16, 1.3, 1.62, -0.4, 3.0, 'wood', C['timber2'])
    k.sbox(s, 7.0, 11.0, 0, 1.8, -0.5, 0.18, 'stone', C['stone2'])
    with k.turned(0, -6.4):
        k.gable((-0.95, 0.95, -6.4 - 2.1, -6.4 + 2.1), 3.0, 1.4, over=0.25, verge=0.2, sag=0.0, wall=('wood', C['plank']))
    k.squad(s, 6.6, 11.4, 3.9, 4.9, 0.36, 'plain', C['cream'])
    ns['yard'](k, rect, 9.0, r)
    k.ivy(Side(rect, 'right'), 2.0, 0.3, 5.5, spread=1.6)
    return rect


def hall_small(k, ns):
    r = k.r
    rect = (-8, 8, -4.8, 4.8)
    ns['block'](k, rect, 1, ridge='x', pitch=0.9, stone_ground=True, timber_from=9, dormers=2, chim=1, fh0=3.2, door=('front', 4.0), shop=True, over=0.6)
    s = Side(rect, 'front')
    k.squad(s, 5.5, 10.5, 3.3, 4.2, 0.2, 'plain', C['cream'])
    ns['yard'](k, rect, 4.0, r)
    return rect


def hall_flat(k, ns):
    """平顶的三层小楼（研究所、网吧）：灰泥墙、大窗、屋顶上有水箱、楼梯间、晾的衣服。"""
    r = k.r
    rect = (-8.5, 8.5, -5.5, 5.5)
    k.plinth(rect, h=0.5)
    fh = 3.3
    for f in range(3):
        z = f * fh
        k.walls(rect, z, z + fh)
        for name in ('front', 'back', 'left', 'right'):
            s = Side(rect, name)
            n = 6 if s.len > 12 else 3
            for i in range(n):
                u = s.len * (i + 0.5) / n
                if f == 0 and name == 'front':
                    continue
                if name != 'front' and r.random() < 0.25:
                    continue
                k.window(s, u, z + 0.95, 1.5, 1.5, bars=(2, 1), box=(name == 'front' and r.random() < 0.6))
            if f:
                k.beam(s, 0, z, s.len, z, 0.22, C['stone3'], w=0.05)
    s = Side(rect, 'front')
    k.door(s, 8.5, 1.8, 2.3, canopy=False, lamp=True)
    for a, b in ((0.6, 6.6), (10.4, 16.4)):
        k.window(s, (a + b) / 2, 0.8, b - a, 1.7, bars=(5, 1))
    k.awning(s, 0.3, 16.7, 3.05, out=1.3, stripes=12)
    k.squad(s, 5.0, 12.0, 3.5, 4.6, 0.06, 'plain', C['cream'])
    top = 3 * fh
    k.box(-8.8, 8.8, -5.8, 5.8, top, top + 0.25, 'stone', C['stone3'])
    k.walls((-8.6, 8.6, -5.6, 5.6), top + 0.25, top + 1.0)
    k.face([(-8.4, -5.4, top + 0.3), (8.4, -5.4, top + 0.3), (8.4, 5.4, top + 0.3), (-8.4, 5.4, top + 0.3)], 'stone', C['stone2'], UP)
    hut = (3.5, 7.5, 0.5, 4.5)
    k.walls(hut, top + 0.3, top + 2.8)
    k.door(Side(hut, 'front'), 2.0, 0.9, 1.9, step=False)
    k.gable(hut, top + 2.8, 1.2, over=0.35, verge=0.25, sag=0.02)
    prism(k, -5.0, 2.5, 1.3, 1.3, top + 1.3, top + 3.5, 10, 'wood', C['plank'], top=False)
    prism(k, -5.0, 2.5, 1.5, 0.0, top + 3.5, top + 4.3, 10, 'roof', C['white'])
    for dx, dy in ((-0.9, -0.9), (0.9, -0.9), (-0.9, 0.9), (0.9, 0.9)):
        k.box(-5.0 + dx - 0.07, -5.0 + dx + 0.07, 2.5 + dy - 0.07, 2.5 + dy + 0.07, top + 0.3, top + 1.3, 'wood', C['timber2'])
    for x in (-7.5, 1.5):
        k.box(x - 0.04, x + 0.04, -3.54, -3.46, top + 0.3, top + 2.3, 'plain', C['iron'])
    k.beam_3d((-7.5, -3.5, top + 2.2), (1.5, -3.5, top + 2.2), 0.015, C['iron'])
    for i, col in enumerate((C['cream'], C['blue'], C['pink'], C['cream'], C['yellow'])):   # 晾的衣服
        x = -6.6 + i * 1.6
        k.face([(x, -3.5, top + 2.18), (x + 1.0, -3.5, top + 2.18), (x + 1.0, -3.52, top + 1.2), (x, -3.52, top + 1.2)], 'plain', col, (0, -1, 0))
    k.box(6.0, 6.08, -4.5, -4.42, top + 0.3, top + 4.6, 'plain', C['iron'])   # 天线
    k.box(5.4, 6.7, -4.48, -4.44, top + 4.0, top + 4.06, 'plain', C['iron'])
    k.bush(-7.3, -4.3, 0.7, flowers=True)
    k.pot(Side(rect, 'front').p(6.9, 0.6, 0).x, -6.1)
    k.pot(Side(rect, 'front').p(10.1, 0.6, 0).x, -6.1)
    return rect


def neonshop(k, ns):
    """电影院 / 电玩店 / 超市：昭和街头那种大门脸——大雨棚、一排灯泡、竖着的灯箱招牌。"""
    r = k.r
    rect = (-12, 12, -7, 7)
    k.plinth(rect, h=0.5)
    k.walls(rect, 0, 10.0)
    k.box(-12.3, 12.3, -7.3, 7.3, 9.4, 9.75, 'stone', C['stone3'])
    k.walls((-12.1, 12.1, -7.1, 7.1), 9.75, 10.6)
    k.face([(-12, -7, 9.9), (12, -7, 9.9), (12, 7, 9.9), (-12, 7, 9.9)], 'stone', C['stone2'], UP)
    s = Side(rect, 'front')
    for u in (7.6, 12.0, 16.4):   # 三樘玻璃门
        k.window(s, u, 0.1, 3.4, 2.8, bars=(1, 1), sill=False)
    for u in (2.6, 21.4):         # 海报橱窗
        k.sbox(s, u - 1.6, u + 1.6, 0, 0.12, 0.9, 3.1, 'wood', C['timber2'])
        k.squad(s, u - 1.4, u + 1.4, 1.1, 2.9, 0.13, 'plain', r.choice([C['yellow'], C['c2'], C['pink']]))
        k.squad(s, u - 0.9, u + 0.9, 1.5, 2.5, 0.14, 'plain', r.choice([C['red'], C['cream']]))
    k.sbox(s, 2.0, 22.0, 0, 2.6, 3.6, 4.3, 'accent', C['white'])    # 大雨棚
    k.sbox(s, 1.9, 22.1, 2.5, 2.7, 3.5, 4.45, 'plain', C['cream'])
    for i in range(16):   # 雨棚底下一排灯泡
        u = 2.6 + i * 1.25
        k.sbox(s, u - 0.12, u + 0.12, 2.3, 2.54, 3.42, 3.6, 'lamp', C['yellow'])
    k.sbox(s, 3.5, 20.5, 0, 0.35, 5.2, 8.7, 'plain', C['cream'])    # 大招牌的底板
    k.sbox(s, 3.2, 20.8, 0, 0.42, 5.0, 5.2, 'accent', C['white'])
    k.sbox(s, 3.2, 20.8, 0, 0.42, 8.7, 8.9, 'accent', C['white'])
    for i in range(12):
        u = 3.9 + i * 1.47
        k.sbox(s, u - 0.1, u + 0.1, 0.42, 0.5, 8.72, 8.88, 'lamp', C['yellow'])
        k.sbox(s, u - 0.1, u + 0.1, 0.42, 0.5, 5.02, 5.18, 'lamp', C['yellow'])
    k.sbox(s, 22.3, 23.5, 0, 1.6, 4.4, 12.8, 'accent', C['white'])   # 竖灯箱
    for i in range(6):
        k.sbox(s, 22.5, 23.3, 1.6, 1.66, 5.0 + i * 1.3, 5.9 + i * 1.3, 'lamp', C['cream'])
    for name in ('left', 'right'):
        sd = Side(rect, name)
        for i in range(3):
            k.window(sd, sd.len * (i + 0.5) / 3, 5.6, 1.6, 1.8, bars=(1, 1))
            k.window(sd, sd.len * (i + 0.5) / 3, 1.2, 1.6, 1.6, bars=(1, 1))
    prism(k, -7.0, 2.0, 1.4, 1.4, 11.2, 13.4, 10, 'wood', C['plank'], top=False)
    prism(k, -7.0, 2.0, 1.6, 0.0, 13.4, 14.2, 10, 'roof', C['white'])
    for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        k.box(-7.0 + dx - 0.07, -7.0 + dx + 0.07, 2.0 + dy - 0.07, 2.0 + dy + 0.07, 9.9, 11.2, 'wood', C['timber2'])
    k.box(4.0, 7.0, 1.0, 4.0, 9.9, 11.4, 'stone', C['stone2'])
    k.pot(-10.5, -7.7)
    k.pot(10.2, -7.7)
    k.crate(9.0, -7.9, 0.7)
    return rect


def tower(k, ns):
    """商务区的高楼：不是玻璃盒子——石头裙楼、一层层退台、铜绿的尖顶，像老上海。"""
    r = k.r
    pod = (-12.5, 12.5, -12.5, 12.5)
    k.box(-12.7, 12.7, -12.7, 12.7, -1.5, 0.6, 'stone', C['stone2'])
    k.walls(pod, 0.6, 8.0, 'stone', C['stone3'])
    k.box(-12.9, 12.9, -12.9, 12.9, 8.0, 8.6, 'stone', C['stone2'])
    for name in ('front', 'back', 'left', 'right'):
        s = Side(pod, name)
        for i in range(5):
            u = 25 * (i + 0.5) / 5
            if name == 'front' and i == 2:
                k.door(s, u, 2.6, 3.4, lamp=True)
                k.sbox(s, u - 2.2, u + 2.2, 0, 1.6, 3.9, 4.2, 'accent', C['white'])
            else:
                k.window(s, u, 1.2, 3.4, 2.6, bars=(2, 1))
                if name == 'front':
                    k.awning(s, u - 1.9, u + 1.9, 4.3, out=1.0, stripes=4)
            k.window(s, u, 5.2, 2.6, 1.9, bars=(2, 1), sill=False)
    wid = 200

    def shaft(rect, z0, z1, bays):
        nonlocal wid
        k.walls(rect, z0, z1)
        fh = 3.4
        for name in ('front', 'back', 'left', 'right'):
            s = Side(rect, name)
            w = s.len / bays
            f = 0
            z = z0 + 0.9
            while z + 2.0 < z1:
                for i in range(bays):
                    wid += 1
                    k.squad(s, i * w + 0.55, (i + 1) * w - 0.55, z, z + 1.9, 0.03, 'glass', C['glass'], wid)
                k.beam(s, 0, z - 0.45, s.len, z - 0.45, 0.28, C['stone3'], w=0.06)
                z += fh
                f += 1
            for i in range(bays + 1):
                k.sbox(s, i * w - 0.32, i * w + 0.32, 0, 0.18, z0, z1, 'wall', C['white'])
        k.box(rect[0] - 0.3, rect[1] + 0.3, rect[2] - 0.3, rect[3] + 0.3, z1, z1 + 0.6, 'stone', C['stone3'])

    shaft((-11, 11, -11, 11), 8.6, 42.0, 5)
    shaft((-8.5, 8.5, -8.5, 8.5), 42.6, 52.0, 4)
    shaft((-5.5, 5.5, -5.5, 5.5), 52.6, 57.0, 2)
    with k.turned(0, 0, math.pi / 4):
        prism(k, 0, 0, 8.3, 0.0, 57.6, 64.5, 4, 'roof', C['white'])
    finial(k, 0, 0, 64.2, 3.2)
    for sx in (-1, 1):
        for sy in (-1, 1):   # 退台角上的小亭
            prism(k, sx * 9.8, sy * 9.8, 1.2, 1.2, 42.6, 44.6, 6, 'wall', C['white'], top=False)
            prism(k, sx * 9.8, sy * 9.8, 1.5, 0.0, 44.6, 46.6, 6, 'roof', C['white'])
    return pod


def apartment(k, ns):
    r = k.r
    rect = (-13, 13, -6.5, 6.5)
    k.plinth(rect, h=0.6)
    fh = 3.1
    floors = 5
    for f in range(floors):
        z = f * fh
        k.walls(rect, z, z + fh)
        for name in ('front', 'back', 'left', 'right'):
            s = Side(rect, name)
            n = 6 if s.len > 20 else 3
            for i in range(n):
                u = s.len * (i + 0.5) / n
                if f == 0 and name == 'front' and i in (2, 3):
                    continue
                if name == 'front' and i % 2 == f % 2 and f > 0:
                    # 阳台：一块板、铁栏杆、花
                    k.window(s, u, z + 0.1, 1.5, 2.2, bars=(1, 2), sill=False)
                    k.sbox(s, u - 1.5, u + 1.5, 0, 1.1, z - 0.02, z + 0.12, 'stone', C['stone3'])
                    for a, b, c, d in ((u - 1.5, u + 1.5, 1.04, 1.1), (u - 1.5, u - 1.44, 0, 1.1), (u + 1.44, u + 1.5, 0, 1.1)):
                        k.sbox(s, a, b, c, d, z + 0.12, z + 1.0, 'plain', C['iron'], skip=(0, 1))
                    for j in range(3):
                        c = s.p(u - 1.0 + j, 1.0, z + 1.05)
                        k.blob(c, 0.26, C['leaf2'] if j % 2 else C['leaf'])
                        k.blob(c + UP * 0.16, 0.11, r.choice([C['red'], C['pink'], C['yellow']]))
                else:
                    k.window(s, u, z + 1.0, 1.3, 1.4, shutters=(name == 'front' or r.random() < 0.5), box=(name == 'front' and r.random() < 0.3), bars=(1, 1))
    s = Side(rect, 'front')
    k.door(s, 13, 2.0, 2.4, canopy=True, lamp=True)
    k.awning(s, 9.2, 11.4, 2.7, out=0.9, stripes=3)
    k.awning(s, 14.6, 16.8, 2.7, out=0.9, stripes=3)
    top = floors * fh
    k.box(-13.3, 13.3, -6.8, 6.8, top, top + 0.3, 'stone', C['stone3'])
    k.hip((-13.2, 13.2, -6.7, 6.7), top + 0.3, 3.4, over=0.9, thick=0.2)
    for x in (-7, 6):
        k.chimney(x, 2.0, top + 1.2, top + 4.6, pots=2, lean=0.02)
    for x in (-4.0, 4.0):   # 屋顶的老虎窗
        k.box(x - 0.9, x + 0.9, -5.2, -3.2, top + 0.8, top + 2.2, 'wall', C['white'])
        k.window(Side((x - 0.9, x + 0.9, -5.2, -3.2), 'front'), 0.9, top + 1.0, 1.0, 0.9, sill=False)
        k.slab([(x - 1.1, -5.4, top + 2.2), (x + 1.1, -5.4, top + 2.2), (x + 1.1, -3.0, top + 2.75), (x - 1.1, -3.0, top + 2.75)], 0.1, 'roof', C['white'])
    k.bush(-11.5, -7.3, 0.8, flowers=True)
    k.bush(11.2, -7.3, 0.8, flowers=True)
    return rect


def clocktower(k, ns):
    k.box(-4.1, 4.1, -4.1, 4.1, -1.5, 3.2, 'stone', C['stone3'])
    k.box(-4.3, 4.3, -4.3, 4.3, 3.2, 3.6, 'stone', C['stone2'])
    sh = (-3.5, 3.5, -3.5, 3.5)
    k.walls(sh, 3.6, 26.5)
    for name in ('front', 'back', 'left', 'right'):
        s = Side(sh, name)
        for u in (0.3, 6.7):   # 角上的隅石
            for i in range(11):
                k.squad(s, u - 0.3, u + 0.3, 4.0 + i * 2.1, 5.1 + i * 2.1, 0.04, 'stone', C['stone3'])
        for z in (7.0, 12.5, 18.0):
            k.window(s, 3.5, z, 0.9, 2.2, bars=(1, 2))
        if name == 'front':
            k.door(Side((-4.1, 4.1, -4.1, 4.1), 'front'), 4.1, 1.6, 2.6)
    st = (-3.9, 3.9, -3.9, 3.9)
    k.box(-4.1, 4.1, -4.1, 4.1, 26.5, 27.0, 'stone', C['stone3'])
    k.walls(st, 27.0, 31.4)
    for name in ('front', 'back', 'left', 'right'):
        s = Side(st, name)
        c = s.p(3.9, 0.06, 29.2)
        pts = [c + s.du * math.cos(i / 16 * TAU) * 1.75 + UP * math.sin(i / 16 * TAU) * 1.75 for i in range(16)]
        k.face(pts, 'plain', C['cream'], s.dw)
        for i in range(12):
            a = i / 12 * TAU
            k.beam(s, 3.9 + math.cos(a) * 1.4, 29.2 + math.sin(a) * 1.4, 3.9 + math.cos(a) * 1.62, 29.2 + math.sin(a) * 1.62, 0.08, C['dark'], w=0.09)
        k.beam(s, 3.9, 29.2, 3.9, 30.4, 0.1, C['dark'], w=0.1)
        k.beam(s, 3.9, 29.2, 4.75, 28.9, 0.12, C['dark'], w=0.1)
    k.box(-4.2, 4.2, -4.2, 4.2, 31.4, 31.9, 'stone', C['stone3'])
    for sx in (-1, 1):   # 钟亭：四根柱子
        for sy in (-1, 1):
            k.box(sx * 3.2 - 0.4, sx * 3.2 + 0.4, sy * 3.2 - 0.4, sy * 3.2 + 0.4, 31.9, 34.2, 'stone', C['stone3'])
    prism(k, 0, 0, 0.9, 0.5, 32.4, 33.6, 8, 'plain', C['brass'])
    k.box(-4.0, 4.0, -4.0, 4.0, 34.2, 34.6, 'stone', C['stone2'])
    with k.turned(0, 0, math.pi / 4):
        prism(k, 0, 0, 6.2, 0.0, 34.6, 40.6, 4, 'roof', C['white'])
    finial(k, 0, 0, 40.3, 2.0)
    return (-4.3, 4.3, -4.3, 4.3)


def warehouse(k, ns):
    r = k.r
    rect = (-15, 15, -8, 8)
    k.plinth(rect, h=0.5, col=C['stone2'])
    k.walls(rect, 0, 7.0, 'stone', C['brick'])
    for name in ('front', 'back', 'left', 'right'):
        s = Side(rect, name)
        n = 6 if s.len > 20 else 3
        for i in range(n + 1):
            u = s.len * i / n
            k.sbox(s, u - 0.35, u + 0.35, 0, 0.22, -1.2, 7.0, 'stone', C['stone3'])
        for i in range(n):
            u = s.len * (i + 0.5) / n
            if name == 'front' and i in (1, 4):
                k.door(s, u, 3.4, 4.0, step=False)
                k.sbox(s, u - 2.2, u + 2.2, 0, 0.12, 4.0, 4.25, 'plain', C['iron'])
            else:
                k.window(s, u, 4.6, 1.8, 1.3, bars=(3, 1), sill=True, frame=C['stone3'])
        k.beam(s, 0, 6.8, s.len, 6.8, 0.4, C['stone3'], w=0.1)
    hgt = k.gable(rect, 7.0, 3.5, over=0.6, verge=0.5, sag=0.05, wall=('stone', C['brick']))
    mon = (-9, 9, -1.6, 1.6)   # 屋脊上的采光气楼
    k.walls(mon, hgt.ridge - 1.2, hgt.ridge + 0.9, 'wood', C['plank'])
    for name in ('front', 'back'):
        s = Side(mon, name)
        for i in range(6):
            k.squad(s, 0.4 + i * 3.0, 2.6 + i * 3.0, hgt.ridge - 0.1, hgt.ridge + 0.7, 0.03, 'glass', C['glass'], 300 + i)
    k.gable(mon, hgt.ridge + 0.9, 0.9, over=0.4, verge=0.3, sag=0.02, wall=('wood', C['plank']))
    k.barrel(-13.0, -8.8)
    k.barrel(-12.2, -8.9, r=0.3, h=0.75)
    k.crate(12.5, -9.0, 1.0)
    k.crate(11.3, -8.9, 0.8)
    k.crate(12.3, -8.9, 0.7, z=1.0)
    return rect


def crane(k, ns):
    P = C['crane']
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box(sx * 5 - 0.45, sx * 5 + 0.45, sy * 4 - 0.45, sy * 4 + 0.45, 0.5, 9.6, 'plain', P)
            k.box(sx * 5 - 0.8, sx * 5 + 0.8, sy * 4 - 1.2, sy * 4 + 1.2, -0.4, 0.6, 'plain', C['iron'])
        k.beam_3d((sx * 5, -4, 1.2), (sx * 5, 4, 8.8), 0.16, P)
        k.beam_3d((sx * 5, 4, 1.2), (sx * 5, -4, 8.8), 0.16, P)
    k.box(-5.6, 5.6, -4.6, -3.4, 9.6, 10.5, 'plain', P)
    k.box(-5.6, 5.6, 3.4, 4.6, 9.6, 10.5, 'plain', P)
    k.box(-5.6, -4.4, -4.6, 4.6, 9.6, 10.5, 'plain', P)
    k.box(4.4, 5.6, -4.6, 4.6, 9.6, 10.5, 'plain', P)
    k.box(-3.6, 3.6, -3.2, 3.2, 10.5, 11.0, 'plain', C['iron'])
    house = (-2.8, 2.8, -2.6, 3.0)
    k.walls(house, 11.0, 14.0, 'plain', C['cream'], cap=True)
    for name in ('front', 'left', 'right'):
        s = Side(house, name)
        k.window(s, s.len / 2, 11.9, s.len * 0.55, 1.2, bars=(2, 0), sill=False)
    k.slab([(-3.1, -2.9, 14.0), (3.1, -2.9, 14.0), (3.1, 3.3, 14.5), (-3.1, 3.3, 14.5)], 0.12, 'plain', P, under=('plain', C['iron']), edge=('plain', C['iron']))
    for sx in (-1, 1):   # 人字架
        k.beam_3d((sx * 1.6, 1.0, 14.3), (0, 0.4, 24.0), 0.2, P)
        k.beam_3d((sx * 1.4, -2.4, 13.8), (sx * 0.5, -22.0, 21.5), 0.26, P)   # 吊臂
    for i in range(7):
        y = -2.4 - i * 3.1
        z = 13.8 + (21.5 - 13.8) * i / 6.3
        k.beam_3d((-1.4 + 0.9 * i / 6.3, y, z), (1.4 - 0.9 * i / 6.3, y, z), 0.1, P)
    k.beam_3d((0, 0.4, 24.0), (0, -21.6, 21.7), 0.05, C['iron'])    # 拉索
    k.beam_3d((0, 0.4, 24.0), (0, 3.0, 14.4), 0.05, C['iron'])
    k.beam_3d((0, -21.0, 21.3), (0, -21.0, 12.0), 0.04, C['iron'])  # 吊钩
    k.box(-0.3, 0.3, -21.3, -20.7, 11.2, 12.0, 'plain', C['iron'])
    k.box(-1.6, 1.6, 1.4, 3.0, 11.0, 12.6, 'plain', C['iron'])       # 配重
    return (-5.8, 5.8, -5, 5)


def containers(k, ns):
    cols = [C['c1'], C['c2'], C['c3'], C['c4'], C['c5']]
    spots = [(-3.2, -1.4, 0, 0.0), (3.2, -1.3, 0, 0.03), (0.2, 1.4, 0, -0.02), (-2.6, -1.35, 2.6, 0.05), (2.4, 1.3, 2.6, 0.0)]
    for i, (x, y, z, rot) in enumerate(spots):
        with k.turned(x, y, rot):
            k.box(x - 3.03, x + 3.03, y - 1.22, y + 1.22, z, z + 2.6, 'plain', cols[i])
            for j in range(11):   # 瓦楞的意思：一道道竖条
                u = x - 2.75 + j * 0.55
                for yy, d in ((y - 1.22, -0.02), (y + 1.22, 0.02)):
                    k.face([(u - 0.1, yy + d, z + 0.2), (u + 0.1, yy + d, z + 0.2), (u + 0.1, yy + d, z + 2.4), (u - 0.1, yy + d, z + 2.4)], 'plain', tuple(v * 0.8 for v in cols[i]), (0, d, 0))
            for sx in (-1, 1):
                k.box(x + sx * 3.03 - 0.03, x + sx * 3.03 + 0.03, y - 0.06, y + 0.06, z + 0.3, z + 2.3, 'plain', C['iron'])
    return (-6.3, 6.3, -2.7, 2.7)


def windmill(k, ns, wood=False):
    h = 13.0
    rb, rt = h * 0.27, h * 0.17
    n = 8 if wood else 14
    rat = lambda z: rb + (rt - rb) * z / h
    prism(k, 0, 0, rb + 0.4, rb + 0.35, -1.5, 1.0, n, 'stone', C['stone3'])
    if wood:
        for i in range(6):   # 一圈圈的木板
            z0, z1 = 1.0 + i * 2.0, 3.0 + i * 2.0
            prism(k, 0, 0, rat(z0) + 0.03, rat(z1) + 0.03, z0, z1, n, 'wood', C['plank'] if i % 2 else C['plank2'], top=False)
    else:
        prism(k, 0, 0, rat(1.0), rt, 1.0, h, n, 'wall', C['white'], top=False)
    prism(k, 0, 0, rt + 0.3, rt + 0.3, h - 0.3, h + 0.1, n, 'wood', C['timber'])
    ch = h * 0.24
    prism(k, 0, 0, rt + 0.7, 0.0, h + 0.1, h + 0.1 + ch, n, 'wood' if wood else 'roof', C['timber2'] if wood else C['white'])
    ball(k, (0, 0, h + ch + 0.2), 0.22, C['brass'], n=6, m=4)
    gy = h * 0.36
    gr = rat(gy) + 1.1
    prism(k, 0, 0, gr, gr, gy - 0.1, gy + 0.1, n, 'wood', C['plank'], bottom=True)
    for i in range(n):
        a = (i + 0.5) / n * TAU
        x, y = math.cos(a) * (gr - 0.08), math.sin(a) * (gr - 0.08)
        k.box(x - 0.05, x + 0.05, y - 0.05, y + 0.05, gy, gy + 1.0, 'wood', C['timber2'])
        k.beam_3d((math.cos(a) * (gr - 0.3), math.sin(a) * (gr - 0.3), gy - 0.1), (math.cos(a) * rat(gy - 1.4), math.sin(a) * rat(gy - 1.4), gy - 1.4), 0.05, C['timber'], part='wood')
    prism(k, 0, 0, gr - 0.05, gr - 0.05, gy + 0.92, gy + 1.0, n, 'wood', C['timber2'], top=True, bottom=True)
    f = Side((-0.9, 0.9, -(rb - 0.1), 0), 'front')
    k.door(f, 0.9, 1.2, 2.2, canopy=True)
    for sx, wz in ((1, h * 0.6), (-1, h * 0.78)):
        s = Side((-rat(wz) + 0.1, rat(wz) - 0.1, -0.4, 0.4), 'right' if sx > 0 else 'left')
        k.window(s, 0.4, wz - 0.5, 0.6, 1.0, bars=(1, 1))
    k.window(Side((-0.5, 0.5, -rat(h * 0.62) + 0.1, 0), 'front'), 0.5, h * 0.55, 0.7, 1.0, bars=(1, 1))
    hub_z, hub_y = h + ch * 0.3, -(rt + 1.4)
    k.beam_3d((0, 0, hub_z), (0, hub_y, hub_z), 0.22, C['timber'], part='wood')
    k.barrel(rb + 0.8, -1.0)
    k.crate(-rb - 0.9, -0.6, 0.7)
    return (-rb - 0.4, rb + 0.4, -rb - 0.4, rb + 0.4)


def watermill(k, ns):
    r = k.r
    k.box(-5.2, 5.2, -3.7, 3.7, -2.5, 1.0, 'stone', C['stone3'])
    rect = (-5, 5, -3.5, 3.5)
    k.walls(rect, 1.0, 4.6, 'wood', C['plank'])
    for name in ('front', 'back', 'left', 'right'):
        s = Side(rect, name)
        k.timber(s, 1.0, 4.6, bays=3 if s.len > 8 else 2, brace=True)
    s = Side(rect, 'front')
    k.door(s, 3.0, 1.1, 2.0, canopy=False, step=False)
    k.sbox(s, 2.0, 4.0, 0, 1.0, 0.7, 1.0, 'stone', C['stone2'])
    k.window(s, 7.0, 2.3, 1.3, 1.1, shutters=True, box=True)
    k.window(Side(rect, 'left'), 3.5, 2.3, 1.2, 1.1)
    k.window(Side(rect, 'back'), 5.0, 2.3, 1.2, 1.1)
    hgt = k.gable(rect, 4.6, 3.5, over=0.95, verge=0.7, thick=0.5, sag=0.14, kick=0.55, wall=('wood', C['plank']), cap=False)
    k.box(-5.7, 5.7, -0.35, 0.35, hgt.ridge - 0.25, hgt.ridge + 0.2, 'plain', C['leaf3'])   # 苔色的脊
    k.chimney(-2.6, 1.6, hgt(-2.6, 1.6) - 0.5, hgt.ridge + 0.9, w=0.8, d=0.7, col=C['stone2'], lean=0.03)
    k.beam_3d((4.9, 0, 3.0), (6.9, 0, 3.0), 0.22, C['timber'], part='wood')
    k.box(5.0, 5.3, -0.5, 0.5, 2.5, 3.5, 'wood', C['timber2'])
    for i, col in enumerate((C['red'], C['c2'])):   # 屋檐下的两条鲤鱼旗
        y = -4.2
        x = -3.6 + i * 1.2
        k.box(x - 0.03, x + 0.03, y - 0.03, y + 0.03, 4.0, 4.6, 'plain', C['iron'])
        k.face([(x - 0.22, y, 4.0), (x + 0.22, y, 4.0), (x + 0.12, y - 0.05, 2.9), (x - 0.12, y - 0.05, 2.9)], 'plain', col, (0, -1, 0))
    k.barrel(4.0, -4.3)
    k.woodpile(Side(rect, 'left'), 0.6, 2.6)
    k.ivy(Side(rect, 'back'), 2.0, 1.0, 4.4)
    return (-5.2, 5.2, -3.7, 3.7)


def greenhouse(k, ns):
    rect = (-10, 10, -6, 6)
    k.box(-10.2, 10.2, -6.2, 6.2, -1.5, 0.9, 'stone', C['brick'])
    k.walls(rect, 0.9, 4.0, 'plain', C['ghglass'])
    fr = C['frame']
    for name in ('front', 'back', 'left', 'right'):
        s = Side(rect, name)
        n = int(s.len / 1.25)
        for i in range(n + 1):
            u = s.len * i / n
            k.beam(s, u, 0.9, u, 4.0, 0.09, fr, w=0.04)
        for z in (0.95, 2.4, 3.95):
            k.beam(s, 0, z, s.len, z, 0.1, fr, w=0.045)
    rise = 4.0
    for sgn in (-1, 1):
        q = [(-10.3, sgn * 6.3, 3.9), (10.3, sgn * 6.3, 3.9), (10.3, 0, 3.9 + rise), (-10.3, 0, 3.9 + rise)]
        k.face(q, 'plain', C['ghglass'], (0, sgn, 1))
        for i in range(17):
            x = -10.3 + 20.6 * i / 16
            k.beam_3d((x, sgn * 6.3, 3.95), (x, 0, 3.95 + rise), 0.05, fr)
        k.beam_3d((-10.3, sgn * 3.15, 3.95 + rise / 2), (10.3, sgn * 3.15, 3.95 + rise / 2), 0.05, fr)
    for x in (-10, 10):
        k.face([(x, -6, 4.0), (x, 6, 4.0), (x, 0, 4.0 + rise)], 'plain', C['ghglass'], (x, 0, 0))
        k.beam_3d((x, 0, 4.0), (x, 0, 4.0 + rise), 0.05, fr)
    k.box(-10.4, 10.4, -0.12, 0.12, 3.9 + rise, 4.2 + rise, 'plain', fr)
    for i in range(9):
        k.box(-9.6 + i * 2.4 - 0.05, -9.6 + i * 2.4 + 0.05, -0.05, 0.05, 4.2 + rise, 4.6 + rise, 'plain', C['iron'])
    s = Side(rect, 'front')
    k.door(s, 10, 1.6, 2.4, part='plain', col=fr, step=True)
    for i in range(8):   # 里面一排排的绿
        x = -8.4 + i * 2.4
        k.blob((x, 1.5, 1.6), 0.9, C['leaf'] if i % 2 else C['leaf2'])
        k.blob((x + 0.6, -1.8, 1.5), 0.8, C['leaf3'])
    k.pot(-8.0, -6.8)
    k.pot(8.0, -6.8)
    return (-10.2, 10.2, -6.2, 6.2)


def beacon(k, ns):
    k.box(-1.7, 1.7, -1.7, 1.7, -2.0, 0.9, 'stone', C['stone3'])
    prism(k, 0, 0, 1.25, 1.17, 0.9, 2.9, 12, 'plain', C['cream'], top=False)
    prism(k, 0, 0, 1.17, 1.1, 2.9, 4.4, 12, 'plain', C['red2'], top=False)
    prism(k, 0, 0, 1.1, 1.04, 4.4, 6.0, 12, 'plain', C['cream'], top=False)
    prism(k, 0, 0, 1.45, 1.45, 6.0, 6.15, 12, 'plain', C['iron'], bottom=True)
    for i in range(12):
        a = i / 12 * TAU
        k.box(math.cos(a) * 1.38 - 0.025, math.cos(a) * 1.38 + 0.025, math.sin(a) * 1.38 - 0.025, math.sin(a) * 1.38 + 0.025, 6.15, 6.85, 'plain', C['iron'])
    prism(k, 0, 0, 1.4, 1.4, 6.8, 6.86, 12, 'plain', C['iron'], top=True, bottom=True)
    prism(k, 0, 0, 0.75, 0.75, 6.15, 7.55, 10, 'lamp', C['yellow'], top=False)
    prism(k, 0, 0, 1.12, 0.0, 7.55, 8.75, 10, 'plain', C['red2'])
    ball(k, (0, 0, 8.85), 0.16, C['iron'], n=6, m=4)
    k.door(Side((-0.6, 0.6, -1.26, 0), 'front'), 0.6, 0.8, 1.7, step=False)
    return (-1.7, 1.7, -1.7, 1.7)


def install(ns):
    """ns：build_kit.py 的全局（block、jp_frame、ngon_sides、yard 这些配方里要用的）。返回要接进 KIT 的条目。"""
    L = lambda f, **kw: (lambda k: f(k, ns, **kw))
    P = lambda f: (lambda k: f(k))
    return [
        # id, shape, style, seed, 配方, 额外的清单字段
        ('lamp', 'prop', 'prop', 101, P(lamp), {}),
        ('bench', 'prop', 'prop', 102, P(bench), {}),
        ('fence', 'prop', 'prop', 103, P(fence), {'fit': [1.6, 1.1, None]}),
        ('stonelantern', 'prop', 'prop', 104, P(stonelantern), {}),
        ('stall', 'prop', 'prop', 105, P(stall), {}),
        ('fountain', 'prop', 'prop', 106, P(fountain), {}),
        ('haystack', 'prop', 'prop', 107, P(haystack), {}),
        ('logpile', 'prop', 'prop', 108, P(logpile), {}),
        ('crate', 'prop', 'prop', 109, P(crate), {}),
        ('snowman', 'prop', 'prop', 110, P(snowman), {}),
        ('gate', 'landmark', 'lm', 201, L(gate), {'sign': [8.15, 1.0, 5.4, 1.2]}),
        ('gatetower', 'landmark', 'lm', 202, L(gatetower), {'sign': [5.3, 4.2, 4.2, 1.0]}),
        ('palace', 'landmark', 'lm', 203, L(palace), {'sign': [8.3, 8.15, 5.6, 1.2]}),
        ('mosque', 'landmark', 'lm', 204, L(mosque), {}),
        ('temple', 'landmark', 'lm', 205, L(temple), {'sign': [4.95, 5.78, 4.0, 0.8]}),
        ('gym', 'landmark', 'lm', 206, L(gym), {'sign': [5.6, 28.3, 5.0, 1.1]}),
        ('hall_a', 'landmark', 'lm', 207, L(hall_big, floors=2), {'fit': [18, 8.6, 11], 'sign': [4.4, 5.92, 4.4, 0.9]}),
        ('hall_b', 'landmark', 'lm', 208, L(hall_big, floors=3), {'fit': [18, 11.4, 11], 'sign': [4.4, 5.92, 4.4, 0.9]}),
        ('hall_small', 'landmark', 'lm', 209, L(hall_small), {'fit': [16, 6.2, 9.6], 'sign': [3.75, 5.05, 4.6, 0.8]}),
        ('hall_flat', 'landmark', 'lm', 210, L(hall_flat), {'fit': [17, 11.4, 11], 'sign': [4.05, 5.6, 6.6, 1.0]}),
        ('neonshop', 'landmark', 'lm', 211, L(neonshop), {'fit': [24, 10, 14], 'sign': [6.95, 7.4, 15.5, 3.0]}),
        ('tower', 'landmark', 'lm', 212, L(tower), {'fit': [22, 60, 22]}),
        ('apartment', 'landmark', 'lm', 213, L(apartment), {'fit': [26, 15.5, 13]}),
        ('clocktower', 'landmark', 'lm', 214, L(clocktower), {'fit': [None, 36, None]}),
        ('warehouse', 'landmark', 'lm', 215, L(warehouse), {'fit': [30, 7, 16]}),
        ('crane', 'landmark', 'lm', 216, L(crane), {'fit': [None, 24, None]}),
        ('containers', 'landmark', 'lm', 217, L(containers), {}),
        ('windmill_a', 'landmark', 'lm', 218, L(windmill, wood=False), {'fit': [None, 13, None]}),
        ('windmill_b', 'landmark', 'lm', 219, L(windmill, wood=True), {'fit': [None, 13, None]}),
        ('watermill', 'landmark', 'lm', 220, L(watermill), {}),
        ('greenhouse', 'landmark', 'lm', 221, L(greenhouse), {'fit': [20, 8, 12]}),
        ('beacon', 'landmark', 'lm', 222, L(beacon), {'fit': [None, 9, None]}),
    ]
