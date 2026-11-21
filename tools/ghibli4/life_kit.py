"""套件的第三部分：活的和会动的——鸟、车、船、栈桥、鱼摊。

模型库（public/models、models2）里这几类不合格，所以重建：
  · 300 只鸟其实是同一个横着的棕色身子换嘴和冠（一万面，减面之后是一坨）；120 条鱼是同一条灰鱼；
  · 200 件"交通工具"只有三个造型（方盒子车、一根圆柱、一个盒子船）；v1 的船是长方体，自行车是两个黑圆片。
这里的做法：放样（一圈圈截面连起来）出圆润的身子和船壳，轮辐、辐条、桨、桅杆是一根根细杆。
车身、船舷、遮阳篷用"点缀色"部件——到了游戏里每一辆、每一条自己一个颜色。

正面朝 -Y（到了游戏里是 +Z）。船的 z = 0 是水线；别的东西脚踩 z = 0。
"""
import math

from mathutils import Vector

import kitlib
from kitlib import C, UP, lin
from lm_kit import ball, bx, prism, ring

C.update({k: lin(v) for k, v in {
    'tyre': (0.13, 0.13, 0.15), 'chrome': (0.72, 0.75, 0.8), 'cream2': (0.96, 0.92, 0.8), 'hull': (0.95, 0.94, 0.9), 'antifoul': (0.62, 0.2, 0.16),
    'sail': (0.97, 0.94, 0.84), 'rope': (0.78, 0.66, 0.44), 'net': (0.24, 0.44, 0.4), 'deck': (0.74, 0.58, 0.38),
    'f_brown': (0.56, 0.38, 0.24), 'f_cream': (0.94, 0.88, 0.76), 'f_grey': (0.55, 0.6, 0.68), 'f_slate': (0.36, 0.42, 0.52), 'f_white': (0.98, 0.98, 0.96),
    'f_black': (0.12, 0.12, 0.15), 'f_green': (0.12, 0.42, 0.3), 'f_orange': (0.95, 0.6, 0.15), 'f_yellow': (0.96, 0.8, 0.25), 'f_red': (0.85, 0.2, 0.16),
    'f_tan': (0.74, 0.56, 0.36), 'f_drake': (0.7, 0.68, 0.64), 'f_blue': (0.3, 0.46, 0.7), 'fish1': (0.62, 0.7, 0.78), 'fish2': (0.9, 0.5, 0.4), 'fish3': (0.42, 0.55, 0.7), 'ice': (0.86, 0.93, 0.97),
}.items()})
TAU = math.tau


def loft(k, rings, part, col, closed=True, cap0=False, cap1=False, colf=None):
    """一圈圈截面连成皮。colf(面的中心) → (部件, 颜色)，没有就用 part / col。"""
    rings = [[Vector(p) for p in r] for r in rings]
    n = len(rings[0])
    ctr = [sum(r, Vector()) / n for r in rings]
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        m = (ctr[i] + ctr[i + 1]) / 2
        for j in range(n if closed else n - 1):
            j2 = (j + 1) % n
            uniq = []
            for p in (a[j], a[j2], b[j2], b[j]):
                if all((p - q).length > 1e-5 for q in uniq):
                    uniq.append(p)
            if len(uniq) < 3:
                continue
            mid = sum(uniq, Vector()) / len(uniq)
            pr, cl = colf(mid) if colf else (part, col)
            k.face(uniq, pr, cl, mid - m)
    if cap0:
        k.face(rings[0], part, col, ctr[0] - ctr[1])
    if cap1:
        k.face(rings[-1], part, col, ctr[-1] - ctr[-2])


def oval(y, rx, rz, cz, n=8, cx=0.0):
    """竖着的一圈（在 xz 面里）。"""
    return [(cx + math.cos(i / n * TAU) * rx, y, cz + math.sin(i / n * TAU) * rz) for i in range(n)]


def wheel(k, cx, cy, cz, r, w, n=12, hub=None):
    """轴顺着 x 的轮子：黑胎、浅色的毂。"""
    a = [(cx - w / 2, cy + math.cos(i / n * TAU) * r, cz + math.sin(i / n * TAU) * r) for i in range(n)]
    b = [(cx + w / 2, p[1], p[2]) for p in a]
    loft(k, [a, b], 'plain', C['tyre'], cap0=True, cap1=True)
    h = [(cx - w / 2 - 0.012, cy + math.cos(i / 8 * TAU) * r * 0.5, cz + math.sin(i / 8 * TAU) * r * 0.5) for i in range(8)]
    k.face(h, 'plain', hub or C['cream2'], (-1, 0, 0))
    k.face([(cx + w / 2 + 0.012, p[1], p[2]) for p in h], 'plain', hub or C['cream2'], (1, 0, 0))


# ====================================================================================================================
# 鸟
# ====================================================================================================================
def bird(k, L, body, belly, wing, beak=None, legs=0.2, leg_col=None, neck=0.0, bill=0.13, tail=0.26, head_col=None, crest=None, afloat=False, comb=None, head=0.14):
    """L 身长（米）。身子是放样出来的一个蛋，背深腹浅；头一个球，喙、翅、尾、腿各是各的。"""
    beak = beak or C['f_orange']
    leg_col = leg_col or beak
    zc = (0.0 if afloat else legs * L) + 0.16 * L
    ys = [0.5, 0.36, 0.1, -0.2, -0.38, -0.46]
    rx = [0.03, 0.14, 0.21, 0.2, 0.13, 0.05]
    if afloat:
        # 浮着的：身子宽、短、圆（细长了远看像根胡萝卜）
        rx = [v * 1.3 for v in rx]
        ys = [v * 0.86 for v in ys]
    rz = [0.03, 0.12, 0.19, 0.19, 0.14, 0.06]
    up = [0.07, 0.04, 0.0, 0.01, 0.06, 0.1]
    rings = [oval(ys[i] * L, rx[i] * L, rz[i] * L, zc + up[i] * L, 8) for i in range(len(ys))]
    loft(k, rings, 'plain', body, colf=lambda m: ('plain', belly if m.z < zc - 0.05 * L else body), cap0=True, cap1=True)
    # 脖子和头
    hy, hz = (-0.46 - 0.1 * neck) * L, zc + (0.2 + neck) * L
    if neck > 0.05:
        loft(k, [oval(-0.4 * L, 0.07 * L, 0.07 * L, zc + 0.08 * L, 6), oval((-0.44 - 0.05 * neck) * L, 0.045 * L, 0.05 * L, zc + (0.1 + neck * 0.5) * L, 6), oval(hy + 0.02 * L, 0.04 * L, 0.045 * L, hz - 0.08 * L, 6)], 'plain', head_col or body)
    r = head * L
    ball(k, (0, hy, hz), r, head_col or body, n=8, m=6)
    tip = Vector((0, hy - r - bill * L, hz - 0.02 * L))
    sq = [Vector((x, hy - r * 0.78, hz + z)) for x, z in ((-0.045 * L, 0), (0, 0.04 * L), (0.045 * L, 0), (0, -0.04 * L))]
    for i in range(4):
        pts = [sq[i], sq[(i + 1) % 4], tip]
        k.face(pts, 'plain', beak, sum(pts, Vector()) / 3 - Vector((0, hy - r, hz)))
    for sx in (-1, 1):
        k.box(sx * r * 0.82 - 0.012 * L, sx * r * 0.82 + 0.012 * L, hy - r * 0.5, hy - r * 0.5 + 0.03 * L, hz + 0.02 * L, hz + 0.05 * L, 'plain', C['f_black'])
    if crest:
        k.face([(0, hy + 0.02 * L, hz + r * 0.8), (0, hy + 0.22 * L, hz + r * 1.9), (0, hy + 0.12 * L, hz + r * 0.7)], 'plain', crest, (1, 0, 0))
    if comb:
        k.box(-0.012 * L, 0.012 * L, hy - r * 0.6, hy + r * 0.5, hz + r * 0.8, hz + r * 1.35, 'plain', comb)
        k.box(-0.012 * L, 0.012 * L, hy - r * 1.0, hy - r * 0.7, hz - r * 1.1, hz - r * 0.4, 'plain', comb)
    # 翅：身侧一片
    for sx in (-1, 1):
        x = sx * 0.215 * L
        pts = [(x * 0.9, -0.22 * L, zc + 0.1 * L), (x, 0.0, zc + 0.14 * L), (x * 0.8, 0.44 * L, zc + 0.07 * L), (x * 0.95, 0.12 * L, zc - 0.06 * L), (x * 0.9, -0.2 * L, zc - 0.03 * L)]
        k.face(pts, 'plain', wing, (sx, 0, 0.2))
    # 尾
    k.face([(-0.05 * L, 0.42 * L, zc + 0.06 * L), (0.05 * L, 0.42 * L, zc + 0.06 * L), (0.09 * L, (0.5 + tail) * L, zc + 0.05 * L), (-0.09 * L, (0.5 + tail) * L, zc + 0.05 * L)], 'plain', wing, UP)
    if not afloat:
        for sx in (-1, 1):
            x = sx * 0.07 * L
            k.beam_3d((x, 0.02 * L, zc - 0.14 * L), (x, 0.0, 0.0), 0.012 * L + 0.004, leg_col)
            k.box(x - 0.03 * L, x + 0.03 * L, -0.09 * L, 0.02 * L, 0.0, 0.012 * L + 0.004, 'plain', leg_col)
    w = 0.26 * L
    return (-w, w, -0.62 * L, (0.5 + tail) * L)


def owl(k):
    """站着的一团：猫头鹰。"""
    L = 0.5
    rings = [ring(0, 0, r, z, 10, sq=0.9) for z, r in ((0.05, 0.08), (0.16, 0.17), (0.34, 0.19), (0.5, 0.17), (0.6, 0.16), (0.7, 0.13), (0.76, 0.04))]
    loft(k, rings, 'plain', C['f_brown'], colf=lambda m: ('plain', C['f_cream'] if (m.y < -0.08 and m.z < 0.5) else C['f_brown']), cap1=True)
    for sx in (-1, 1):
        k.face([(sx * 0.07 + math.cos(i / 8 * TAU) * 0.055, -0.15, 0.62 + math.sin(i / 8 * TAU) * 0.055) for i in range(8)], 'plain', C['f_yellow'], (0, -1, 0))
        k.box(sx * 0.07 - 0.02, sx * 0.07 + 0.02, -0.165, -0.15, 0.6, 0.64, 'plain', C['f_black'])
        k.face([(sx * 0.1, -0.02, 0.72), (sx * 0.15, -0.02, 0.86), (sx * 0.05, -0.02, 0.76)], 'plain', C['f_brown'], (0, -1, 0))
        k.face([(sx * 0.19, -0.06, 0.48), (sx * 0.2, 0.06, 0.4), (sx * 0.16, 0.04, 0.12), (sx * 0.18, -0.06, 0.2)], 'plain', C['f_tan'], (sx, 0, 0))
        k.box(sx * 0.06 - 0.03, sx * 0.06 + 0.03, -0.12, -0.02, 0.0, 0.05, 'plain', C['f_yellow'])
    k.face([(-0.02, -0.16, 0.58), (0.02, -0.16, 0.58), (0, -0.19, 0.53)], 'plain', C['f_orange'], (0, -1, 0))
    return (-0.2, 0.2, -0.2, 0.2)


# ====================================================================================================================
# 车
# ====================================================================================================================
def bicycle(k):
    r = 0.34

    def rim(cy):
        pts = [Vector((0, cy + math.cos(i / 14 * TAU) * r, r + math.sin(i / 14 * TAU) * r)) for i in range(14)]
        for i in range(14):
            k.beam_3d(pts[i], pts[(i + 1) % 14], 0.022, C['tyre'])
        for i in range(0, 14, 2):
            k.beam_3d((0, cy, r), pts[i], 0.006, C['chrome'])
        k.beam_3d((-0.05, cy, r), (0.05, cy, r), 0.025, C['chrome'])

    with k.leaning((0, 0, 0), 0, 0.1):
        rim(0.52)
        rim(-0.52)
        R, F, B, S, H, Hb = (0, 0.52, r), (0, -0.52, r), (0, 0.1, 0.3), (0, 0.22, 0.84), (0, -0.36, 0.9), (0, -0.4, 0.68)
        for a, b in ((B, S), (B, Hb), (S, H), (R, B), (R, S), (Hb, F), (H, Hb)):
            k.beam_3d(a, b, 0.02, C['white'], part='accent')
        k.beam_3d(H, (0, -0.33, 1.0), 0.015, C['chrome'])
        k.beam_3d((-0.26, -0.3, 1.0), (0.26, -0.3, 1.0), 0.015, C['chrome'])
        for sx in (-1, 1):
            k.beam_3d((sx * 0.26, -0.3, 1.0), (sx * 0.26, -0.2, 1.0), 0.02, C['timber'])
        k.box(-0.07, 0.07, 0.1, 0.36, 0.84, 0.9, 'plain', C['timber'])
        k.beam_3d(S, (0, 0.23, 0.9), 0.014, C['chrome'])
        # 车筐、后架
        bx(k, 0, -0.62, 0.34, 0.24, 0.74, 0.96, 'plain', C['straw'], skip=(1,))
        k.box(-0.08, 0.08, 0.4, 0.86, 0.72, 0.74, 'plain', C['chrome'])
        k.beam_3d((0, 0.84, 0.72), R, 0.01, C['chrome'])
        k.beam_3d((0.03, 0.2, 0.3), (0.2, 0.3, 0.0), 0.012, C['chrome'])
        # 脚蹬、链盒
        k.beam_3d((-0.12, 0.1, 0.3), (0.12, 0.1, 0.3), 0.012, C['chrome'])
        k.box(0.03, 0.05, 0.06, 0.5, 0.26, 0.36, 'accent', C['white'])
    return (-0.34, 0.34, -0.9, 0.9)


def roof_arc(y, hw, z0, rise, n=7):
    return [(-hw + 2 * hw * i / (n - 1), y, z0 + rise * math.sin(math.pi * i / (n - 1))) for i in range(n)]


def glass(k, pts, hint, wid):
    k.face(pts, 'glass', C['glass'], hint, wid)


def bus(k):
    """带车鼻子的老公交：下半截是点缀色，窗带以上奶油色，圆顶。"""
    W, y0, y1 = 2.3, -1.9, 3.2
    bx(k, 0, (y0 + y1) / 2, W, y1 - y0, 0.48, 1.5, 'accent', C['white'])
    bx(k, 0, (y0 + y1) / 2, W - 0.06, y1 - y0 - 0.04, 1.5, 2.36, 'plain', C['cream2'], skip=(0, 1))
    bx(k, 0, (y0 + y1) / 2, W + 0.03, y1 - y0 + 0.03, 1.47, 1.55, 'plain', C['f_white'])
    loft(k, [roof_arc(y0 - 0.06, W / 2 + 0.03, 2.36, 0.44), roof_arc(y1 + 0.06, W / 2 + 0.03, 2.36, 0.44)], 'plain', C['cream2'], closed=False)
    for y in (y0 - 0.06, y1 + 0.06):
        k.face(roof_arc(y, W / 2 + 0.03, 2.36, 0.44), 'plain', C['cream2'], (0, -1 if y < 0 else 1, 0))
    wid = 1
    for sx in (-1, 1):
        for i in range(5):
            ya = y0 + 0.55 + i * 0.92
            x = sx * (W / 2 - 0.02)
            glass(k, [(x, ya, 1.66), (x, ya + 0.74, 1.66), (x, ya + 0.74, 2.24), (x, ya, 2.24)], (sx, 0, 0), wid)
            wid += 1
    glass(k, [(-0.95, y0 - 0.01, 1.62), (0.95, y0 - 0.01, 1.62), (0.95, y0 - 0.01, 2.26), (-0.95, y0 - 0.01, 2.26)], (0, -1, 0), 20)
    glass(k, [(-0.8, y1 + 0.01, 1.7), (0.8, y1 + 0.01, 1.7), (0.8, y1 + 0.01, 2.2), (-0.8, y1 + 0.01, 2.2)], (0, 1, 0), 21)
    # 门（左前）
    k.face([(-W / 2 - 0.012, y0 + 0.08, 0.5), (-W / 2 - 0.012, y0 + 0.5, 0.5), (-W / 2 - 0.012, y0 + 0.5, 2.26), (-W / 2 - 0.012, y0 + 0.08, 2.26)], 'plain', C['timber2'], (-1, 0, 0))
    # 车鼻子
    loft(k, [[(-0.8, y0 - 1.15, 0.5), (0.8, y0 - 1.15, 0.5), (0.8, y0 - 1.15, 1.18), (0.55, y0 - 1.15, 1.3), (-0.55, y0 - 1.15, 1.3), (-0.8, y0 - 1.15, 1.18)],
             [(-0.95, y0, 0.5), (0.95, y0, 0.5), (0.95, y0, 1.3), (0.7, y0, 1.46), (-0.7, y0, 1.46), (-0.95, y0, 1.3)]], 'accent', C['white'], cap0=True)
    bx(k, 0, y0 - 1.17, 0.9, 0.03, 0.62, 1.16, 'plain', C['chrome'])
    for i in range(5):
        k.box(-0.4 + i * 0.2 - 0.02, -0.4 + i * 0.2 + 0.02, y0 - 1.2, y0 - 1.18, 0.64, 1.14, 'plain', C['tyre'])
    for sx in (-1, 1):
        k.face([(sx * 0.62 + math.cos(i / 8 * TAU) * 0.13, y0 - 1.17, 0.98 + math.sin(i / 8 * TAU) * 0.13) for i in range(8)], 'lamp', lin((1.0, 0.9, 0.6)), (0, -1, 0))
        # 挡泥板
        loft(k, [[(sx * 0.72, y0 - 1.1 + 0.9 * i / 5, 0.55 + 0.42 * math.sin(math.pi * i / 5)) for i in range(6)], [(sx * 1.12, y0 - 1.1 + 0.9 * i / 5, 0.55 + 0.42 * math.sin(math.pi * i / 5)) for i in range(6)]], 'accent', C['white'], closed=False)
        wheel(k, sx * 0.95, y0 - 0.62, 0.42, 0.42, 0.26)
        wheel(k, sx * 1.0, y1 - 1.0, 0.42, 0.42, 0.3)
    bx(k, 0, y0 - 1.25, 2.0, 0.1, 0.4, 0.54, 'plain', C['chrome'])
    bx(k, 0, y1 + 0.06, 2.1, 0.1, 0.42, 0.56, 'plain', C['chrome'])
    bx(k, 0, y0 - 0.1, 1.2, 0.08, 2.42, 2.68, 'plain', C['f_white'])
    return (-1.2, 1.2, y0 - 1.3, y1 + 0.12)


def body_sect(y, w, z0, z1, r=0.12):
    h = w / 2
    return [(-h + r, y, z0), (h - r, y, z0), (h, y, z0 + r), (h, y, z1 - r), (h - r, y, z1), (-h + r, y, z1), (-h, y, z1 - r), (-h, y, z0 + r)]


def car(k):
    """圆头圆脑的小车。"""
    loft(k, [body_sect(y, w, z0, z1) for y, w, z0, z1 in ((-1.62, 1.0, 0.4, 0.62), (-1.45, 1.36, 0.32, 0.74), (-0.7, 1.46, 0.28, 0.84), (0.9, 1.46, 0.28, 0.86), (1.45, 1.36, 0.32, 0.8), (1.6, 1.0, 0.42, 0.66))],
         'accent', C['white'], cap0=True, cap1=True)
    cab = [body_sect(y, w, z0, z1, 0.14) for y, w, z0, z1 in ((-0.62, 1.3, 0.84, 0.9), (-0.25, 1.2, 0.84, 1.36), (0.7, 1.2, 0.84, 1.38), (1.12, 1.26, 0.84, 0.92))]
    loft(k, cab, 'glass', C['glass'], colf=lambda m: (('accent', C['white']) if m.z > 1.3 else ('glass', C['glass'])))
    for y in (-0.25, 0.22, 0.7):
        for sx in (-1, 1):
            k.beam_3d((sx * 0.62, y, 0.86), (sx * 0.6, y, 1.36), 0.025, C['white'], part='accent')
    for sx in (-1, 1):
        for y in (-0.98, 1.0):
            wheel(k, sx * 0.66, y, 0.27, 0.27, 0.16)
        k.face([(sx * 0.44 + math.cos(i / 8 * TAU) * 0.1, -1.58, 0.62 + math.sin(i / 8 * TAU) * 0.1) for i in range(8)], 'lamp', lin((1.0, 0.92, 0.66)), (0, -1, 0))
        k.box(sx * 0.5 - 0.07, sx * 0.5 + 0.07, 1.6, 1.62, 0.56, 0.66, 'plain', C['f_red'])
    bx(k, 0, -1.66, 1.2, 0.06, 0.36, 0.44, 'plain', C['chrome'])
    bx(k, 0, 1.64, 1.2, 0.06, 0.38, 0.46, 'plain', C['chrome'])
    # 车顶架上捆着行李
    for sx in (-1, 1):
        k.beam_3d((sx * 0.5, -0.1, 1.44), (sx * 0.5, 0.62, 1.44), 0.015, C['chrome'])
    bx(k, 0.05, 0.25, 0.7, 0.5, 1.45, 1.66, 'plain', C['f_tan'])
    bx(k, -0.1, 0.15, 0.4, 0.3, 1.66, 1.8, 'plain', C['c2'])
    return (-0.75, 0.75, -1.7, 1.68)


def truck(k):
    """三个轮子的小货车：前面一个轮，后斗里装着货。"""
    loft(k, [body_sect(y, w, z0, z1, 0.1) for y, w, z0, z1 in ((-1.72, 0.5, 0.5, 0.95), (-1.5, 1.0, 0.46, 1.1), (-1.25, 1.3, 0.46, 1.16), (-0.5, 1.3, 0.46, 1.16))], 'accent', C['white'], cap0=True, cap1=True)
    cab = [body_sect(y, w, z0, z1, 0.12) for y, w, z0, z1 in ((-1.3, 1.24, 1.16, 1.2), (-1.12, 1.2, 1.16, 1.74), (-0.5, 1.2, 1.16, 1.76))]
    loft(k, cab, 'glass', C['glass'], colf=lambda m: (('accent', C['white']) if m.z > 1.68 else ('glass', C['glass'])), cap1=True)
    k.face([(-0.6, -0.49, 1.16), (0.6, -0.49, 1.16), (0.6, -0.49, 1.76), (-0.6, -0.49, 1.76)], 'accent', C['white'], (0, 1, 0))
    for sx in (-1, 1):
        k.beam_3d((sx * 0.6, -1.12, 1.16), (sx * 0.6, -1.12, 1.74), 0.03, C['white'], part='accent')
        k.face([(sx * 0.3 + math.cos(i / 8 * TAU) * 0.08, -1.62, 0.92 + math.sin(i / 8 * TAU) * 0.08) for i in range(8)], 'lamp', lin((1.0, 0.92, 0.66)), (0, -1, 0))
        wheel(k, sx * 0.62, 0.75, 0.3, 0.3, 0.18)
    wheel(k, 0, -1.5, 0.3, 0.3, 0.16)
    # 后斗
    bx(k, 0, 0.55, 1.4, 2.0, 0.6, 0.7, 'wood', C['plank'])
    for sx in (-1, 1):
        bx(k, sx * 0.68, 0.55, 0.05, 2.0, 0.7, 1.0, 'wood', C['plank2'])
    bx(k, 0, 1.53, 1.4, 0.05, 0.7, 1.0, 'wood', C['plank2'])
    bx(k, 0, -0.43, 1.4, 0.05, 0.7, 1.1, 'wood', C['plank2'])
    k.crate(-0.3, 0.0, 0.5, 0.7, 0.2)
    k.crate(0.3, 0.1, 0.42, 0.7, -0.1)
    k.crate(-0.2, 0.05, 0.36, 1.2, 0.5)
    ball(k, (0.25, 0.85, 0.92), 0.26, C['f_tan'], n=8, m=5, sq=0.8)
    ball(k, (-0.25, 0.95, 0.92), 0.26, C['f_cream'], n=8, m=5, sq=0.8)
    ball(k, (0.0, 1.15, 1.1), 0.24, C['f_tan'], n=8, m=5, sq=0.8)
    return (-0.75, 0.75, -1.78, 1.6)


# ====================================================================================================================
# 船和栈桥
# ====================================================================================================================
def hull(k, sects, D, n=9, strake=0.14, bottom=None, side=None, part='accent', transom=True):
    """sects: [(y, 半宽, 舷顶高)]，船头在前（-y）。船底在舷顶下面 D。舷顶一圈是点缀色。"""
    side = side or C['hull']
    rings = []
    for y, hw, top in sects:
        rings.append([(hw * math.cos(math.pi * i / (n - 1)), y, top - D * math.sin(math.pi * i / (n - 1)) ** 0.7) for i in range(n)])

    def colf(m):
        # 离舷顶多远
        t = min(abs(m.y - s[0]) for s in sects)
        top = min(sects, key=lambda s: abs(s[0] - m.y))[2]
        if m.z > top - strake:
            return part, C['white']
        if bottom and m.z < 0.1:
            return 'plain', bottom
        return 'plain', side

    loft(k, rings, 'plain', side, closed=False, colf=colf)
    if transom:
        k.face(rings[-1], 'plain', side, (0, 1, 0))
    # 舷边的一圈木条
    for sx in (0, n - 1):
        for i in range(len(rings) - 1):
            k.beam_3d(rings[i][sx], rings[i + 1][sx], 0.035, C['timber2'], part='wood')
    return rings


def rowboat(k):
    rings = hull(k, [(-1.75, 0.02, 0.46), (-1.3, 0.36, 0.38), (-0.4, 0.62, 0.3), (0.8, 0.6, 0.3), (1.5, 0.44, 0.33), (1.7, 0.36, 0.35)], 0.5, side=C['plank2'])
    for y in (-0.55, 0.65):
        k.box(-0.56, 0.56, y - 0.12, y + 0.12, 0.12, 0.16, 'wood', C['plank'])
    k.box(-0.3, 0.3, 1.35, 1.62, 0.16, 0.2, 'wood', C['plank'])
    for sx in (-1, 1):
        k.beam_3d((sx * 0.2, -1.2, 0.2), (sx * 0.72, 0.7, 0.42), 0.022, C['timber2'], part='wood')
        k.box(sx * 0.14 - 0.07, sx * 0.14 + 0.07, -1.62, -1.2, 0.17, 0.2, 'wood', C['plank2'])
    prism(k, 0.2, 1.1, 0.14, 0.14, -0.08, -0.02, 8, 'plain', C['rope'])
    return (-0.66, 0.66, -1.78, 1.72)


def fishboat(k):
    rings = hull(k, [(-3.8, 0.04, 1.3), (-3.0, 0.8, 1.08), (-1.4, 1.26, 0.88), (1.4, 1.3, 0.8), (3.1, 1.08, 0.84), (3.7, 0.9, 0.88)], 1.3, strake=0.22, bottom=C['antifoul'])
    # 甲板
    deck = [(-3.0, 0.72), (-1.4, 1.16), (1.4, 1.2), (3.1, 1.0), (3.66, 0.84)]
    pts = [(-hw, y, 0.6) for y, hw in deck] + [(hw, y, 0.6) for y, hw in reversed(deck)]
    k.face(pts, 'wood', C['deck'], UP)
    # 驾驶室
    cy = 1.1
    bx(k, 0, cy, 1.5, 1.7, 0.6, 2.35, 'wall', C['white'], skip=(0,))
    bx(k, 0, cy - 0.05, 1.8, 2.0, 2.35, 2.45, 'accent', C['white'])
    glass(k, [(-0.6, cy - 0.86, 1.5), (0.6, cy - 0.86, 1.5), (0.6, cy - 0.86, 2.15), (-0.6, cy - 0.86, 2.15)], (0, -1, 0), 1)
    for sx in (-1, 1):
        glass(k, [(sx * 0.76, cy - 0.6, 1.5), (sx * 0.76, cy + 0.1, 1.5), (sx * 0.76, cy + 0.1, 2.15), (sx * 0.76, cy - 0.6, 2.15)], (sx, 0, 0), 2 + sx)
        # 挂在舷边的旧轮胎
        for y in (-1.6, 0.0, 2.0):
            a = [(sx * 1.33, y + math.cos(i / 8 * TAU) * 0.2, 0.55 + math.sin(i / 8 * TAU) * 0.2) for i in range(8)]
            loft(k, [a, [(p[0] + sx * 0.1, p[1], p[2]) for p in a]], 'plain', C['tyre'], cap1=True)
    k.face([(0.3, cy + 0.86, 0.62), (0.75, cy + 0.86, 0.62), (0.75, cy + 0.86, 2.0), (0.3, cy + 0.86, 2.0)], 'accent', C['white'], (0, 1, 0))
    # 救生圈
    a = [(-0.77, cy + 0.45 + math.cos(i / 10 * TAU) * 0.24, 1.2 + math.sin(i / 10 * TAU) * 0.24) for i in range(10)]
    for i in range(10):
        k.beam_3d(a[i], a[(i + 1) % 10], 0.05, C['f_red'] if i % 3 else C['f_white'])
    # 桅杆、吊杆、灯
    k.beam_3d((0, -1.5, 0.6), (0, -1.5, 4.6), 0.06, C['timber2'], part='wood')
    k.beam_3d((0, -1.5, 1.5), (0, 0.2, 2.6), 0.04, C['timber2'], part='wood')
    k.beam_3d((0, -1.5, 4.5), (0, -3.7, 1.35), 0.012, C['rope'])
    k.beam_3d((0, -1.5, 4.5), (0, 0.3, 2.5), 0.012, C['rope'])
    bx(k, 0, -1.5, 0.16, 0.16, 4.6, 4.8, 'lamp', lin((1.0, 0.86, 0.5)))
    k.beam_3d((0.5, cy + 0.3, 2.45), (0.5, cy + 0.3, 3.2), 0.05, C['iron'])
    # 甲板上的货：网、鱼箱、浮球
    ball(k, (-0.3, -2.3, 0.72), 0.5, C['net'], n=8, m=5, sq=0.5)
    k.crate(0.5, -0.6, 0.5, 0.6, 0.2)
    k.crate(-0.55, -0.4, 0.45, 0.6, -0.3)
    k.crate(0.45, 2.6, 0.5, 0.6, 0.1)
    for x, y, c in ((-0.7, 2.7, C['f_orange']), (-0.35, 2.9, C['f_red']), (0.75, -1.4, C['f_orange'])):
        ball(k, (x, y, 0.78), 0.18, c, n=8, m=5)
    return (-1.45, 1.45, -3.85, 3.75)


def sailboat(k):
    hull(k, [(-3.1, 0.03, 0.95), (-2.3, 0.55, 0.8), (-0.8, 0.95, 0.66), (1.2, 0.95, 0.62), (2.5, 0.7, 0.66), (2.9, 0.55, 0.7)], 1.05, strake=0.16, bottom=C['antifoul'])
    deck = [(-2.3, 0.5), (-0.8, 0.88), (1.2, 0.88), (2.5, 0.64), (2.86, 0.5)]
    k.face([(-hw, y, 0.5) for y, hw in deck] + [(hw, y, 0.5) for y, hw in reversed(deck)], 'wood', C['deck'], UP)
    loft(k, [body_sect(y, w, 0.5, z1, 0.1) for y, w, z1 in ((-1.3, 0.9, 0.82), (-0.9, 1.1, 1.0), (0.5, 1.1, 1.0), (0.8, 1.0, 0.86))], 'wall', C['white'], cap0=True, cap1=True)
    for sx in (-1, 1):
        for y in (-0.7, 0.0):
            glass(k, [(sx * 0.56, y, 0.68), (sx * 0.56, y + 0.4, 0.68), (sx * 0.56, y + 0.4, 0.9), (sx * 0.56, y, 0.9)], (sx, 0, 0), 3 + sx + y)
    my = -0.6
    k.beam_3d((0, my, 0.5), (0, my, 8.2), 0.055, C['timber2'], part='wood')
    k.beam_3d((0, my, 1.5), (0, 2.6, 1.6), 0.04, C['timber2'], part='wood')
    # 主帆（鼓着一点）、前帆
    a, b, c, m = Vector((0, my + 0.08, 1.6)), Vector((0, 2.5, 1.7)), Vector((0, my + 0.08, 7.9)), Vector((0.35, 0.6, 3.6))
    for tri in ((a, b, m), (b, c, m), (c, a, m)):
        k.face(list(tri), 'plain', C['sail'], (1, 0, 0))
    a, b, c, m = Vector((0, -3.0, 1.05)), Vector((0, my - 0.15, 1.3)), Vector((0, my - 0.1, 7.2)), Vector((-0.3, -1.5, 3.0))
    for tri in ((a, b, m), (b, c, m), (c, a, m)):
        k.face(list(tri), 'accent', C['white'], (-1, 0, 0))
    k.beam_3d((0, my, 8.1), (0, 2.85, 0.75), 0.01, C['rope'])
    k.face([(0, my, 8.2), (0, my + 0.5, 8.05), (0, my, 7.9)], 'accent', C['white'], (1, 0, 0))
    k.beam_3d((0, 2.5, 0.5), (0, 2.75, 1.2), 0.03, C['timber'], part='wood')
    return (-1.05, 1.05, -3.15, 2.95)


def pier(k):
    """木栈桥：岸在 +y 这头，往 -y 伸进水里 12 m。桥面 z = 0.55（z = 0 是水面），桩子往下埋到 -3。"""
    for i in range(30):
        y = 1.0 - 0.42 * i
        k.box(-1.3 + 0.03 * (i % 2), 1.3 - 0.03 * ((i + 1) % 2), y - 0.4, y - 0.02, 0.47, 0.55, 'wood', C['plank2'] if i % 3 else C['plank'])
    for y in (0.6, -2.6, -5.8, -9.0, -11.3):
        for sx in (-1, 1):
            prism(k, sx * 1.15, y, 0.13, 0.12, -3.0, 0.95 if y in (-11.3, 0.6) else 0.5, 8, 'wood', C['timber2'])
        k.beam_3d((-1.15, y, 0.36), (1.15, y, 0.36), 0.07, C['timber'], part='wood')
        k.beam_3d((-1.15, y, 0.3), (1.15, y, -0.9), 0.04, C['timber'], part='wood')
    for sx in (-1, 1):
        k.beam_3d((sx * 1.15, 0.6, 0.38), (sx * 1.15, -11.3, 0.38), 0.07, C['timber'], part='wood')
    # 尽头：一盏灯、一卷缆绳、一架下水的梯子、两个木箱
    k.beam_3d((1.15, -11.3, 0.9), (1.15, -11.3, 2.7), 0.05, C['iron'])
    k.beam_3d((1.15, -11.3, 2.7), (0.75, -11.3, 2.7), 0.03, C['iron'])
    bx(k, 0.72, -11.3, 0.22, 0.22, 2.36, 2.66, 'lamp', lin((1.0, 0.84, 0.5)))
    prism(k, -0.8, -10.6, 0.26, 0.26, 0.55, 0.67, 10, 'plain', C['rope'])
    for sx in (-0.25, 0.25):
        k.beam_3d((sx, -11.75, -1.4), (sx, -11.75, 0.9), 0.03, C['timber2'], part='wood')
    for z in (-1.0, -0.6, -0.2, 0.2, 0.6):
        k.beam_3d((-0.25, -11.75, z), (0.25, -11.75, z), 0.025, C['timber2'], part='wood')
    k.crate(0.7, -8.4, 0.55, 0.55, 0.3)
    k.crate(0.75, -7.7, 0.45, 0.55, -0.2)
    for y in (-3.0, -6.4):
        prism(k, -1.15, y, 0.1, 0.1, 0.5, 0.95, 8, 'wood', C['timber'])
    return (-1.35, 1.35, -11.8, 1.0)


# ====================================================================================================================
# 鱼
# ====================================================================================================================
def fish(k, at, L, col, belly=None, yaw=0.0, lie=True):
    """一条鱼：纺锤身子、叉尾。lie = 侧躺着（摆在冰上）；否则竖着挂。"""
    belly = belly or C['f_white']
    x0, y0, z0 = at
    m = kitlib.Matrix.Translation((x0, y0, z0)) @ kitlib.Matrix.Rotation(yaw, 4, 'Z') @ (kitlib.Matrix.Rotation(math.pi / 2, 4, 'Y') if lie else kitlib.Matrix.Rotation(math.pi / 2, 4, 'X'))
    with kitlib.Kit._Turn(k, m):
        ys = [-0.5, -0.38, -0.15, 0.15, 0.36, 0.44]
        rx = [0.01, 0.05, 0.075, 0.06, 0.025, 0.012]
        rz = [0.01, 0.1, 0.15, 0.13, 0.05, 0.03]
        loft(k, [oval(ys[i] * L, rx[i] * L, rz[i] * L, 0.0, 6) for i in range(6)], 'plain', col, colf=lambda q: ('plain', col))
        k.face([(0, 0.42 * L, 0), (0, 0.6 * L, 0.14 * L), (0, 0.52 * L, 0), (0, 0.6 * L, -0.14 * L)], 'plain', col, (1, 0, 0))
        k.face([(0, -0.1 * L, 0.14 * L), (0, 0.12 * L, 0.24 * L), (0, 0.18 * L, 0.12 * L)], 'plain', col, (1, 0, 0))
        for sx in (-1, 1):
            k.box(sx * 0.05 * L - 0.004, sx * 0.05 * L + 0.004, -0.4 * L, -0.36 * L, 0.03 * L, 0.06 * L, 'plain', C['f_black'])


def fishcrate(k):
    """一箱冰上码着的鱼。"""
    bx(k, 0, 0, 0.9, 0.6, 0.0, 0.34, 'wood', C['plank2'], skip=(1,))
    bx(k, 0, 0, 0.82, 0.52, 0.26, 0.3, 'plain', C['ice'])
    for i, (x, y, col) in enumerate(((-0.25, -0.1, 'fish1'), (-0.05, 0.08, 'fish2'), (0.16, -0.08, 'fish3'), (0.3, 0.12, 'fish1'), (-0.3, 0.14, 'fish3'))):
        fish(k, (x, y, 0.34), 0.42, C[col], yaw=0.3 + i * 0.5)
    return (-0.46, 0.46, -0.31, 0.31)


def fishrack(k):
    """晒鱼的架子：两根柱子一根横杆，挂着一排鱼。"""
    for sx in (-1, 1):
        k.beam_3d((sx * 1.2, 0.25, 0), (sx * 1.2, 0, 1.9), 0.045, C['timber2'], part='wood')
        k.beam_3d((sx * 1.2, -0.25, 0), (sx * 1.2, 0, 1.9), 0.045, C['timber2'], part='wood')
    k.beam_3d((-1.35, 0, 1.88), (1.35, 0, 1.88), 0.04, C['timber'], part='wood')
    for i in range(7):
        x = -0.95 + i * 0.32
        k.beam_3d((x, 0, 1.86), (x, 0, 1.7), 0.006, C['rope'])
        fish(k, (x, 0, 1.42), 0.5 + 0.08 * (i % 3), C[('fish1', 'fish3', 'fish2')[i % 3]], yaw=0.2 * (i % 2), lie=False)
    return (-1.4, 1.4, -0.3, 0.3)


def install(ns):
    P = lambda f, **kw: (lambda k: f(k, **kw))
    B = lambda **kw: (lambda k: bird(k, **kw))
    return [
        # 鸟（身长比真的大一圈：画里的鸟要看得见）
        ('bird_sparrow', 'bird', 'prop', 301, B(L=0.3, body=C['f_brown'], belly=C['f_cream'], wing=C['timber2'], beak=C['f_slate'], legs=0.14, bill=0.08, head=0.15), {}),
        ('bird_pigeon', 'bird', 'prop', 302, B(L=0.46, body=C['f_grey'], belly=C['f_slate'], wing=C['f_slate'], beak=C['f_orange'], legs=0.14, bill=0.08, head_col=C['f_slate']), {}),
        ('bird_gull', 'bird', 'prop', 303, B(L=0.62, body=C['f_white'], belly=C['f_white'], wing=C['f_grey'], beak=C['f_yellow'], legs=0.18, bill=0.14), {}),
        ('bird_crow', 'bird', 'prop', 304, B(L=0.52, body=C['f_black'], belly=C['f_black'], wing=lin((0.2, 0.2, 0.28)), beak=C['f_black'], leg_col=C['f_black'], legs=0.18, bill=0.14), {}),
        ('bird_egret', 'bird', 'prop', 305, B(L=0.9, body=C['f_white'], belly=C['f_white'], wing=C['f_cream'], beak=C['f_yellow'], leg_col=C['f_black'], legs=0.62, neck=0.5, bill=0.24, crest=C['f_white'], head=0.09), {}),
        ('bird_crane', 'bird', 'prop', 306, B(L=1.1, body=C['f_white'], belly=C['f_white'], wing=C['f_black'], beak=C['f_tan'], leg_col=C['f_black'], legs=0.7, neck=0.6, bill=0.2, head_col=C['f_black'], comb=C['f_red'], head=0.085), {}),
        ('bird_duck', 'bird', 'prop', 307, B(L=0.56, body=C['f_drake'], belly=C['f_cream'], wing=C['f_brown'], beak=C['f_yellow'], head_col=C['f_green'], afloat=True, neck=0.12, bill=0.12, tail=0.1), {'afloat': True}),
        ('bird_duck_white', 'bird', 'prop', 308, B(L=0.6, body=C['f_white'], belly=C['f_white'], wing=C['f_cream'], beak=C['f_orange'], afloat=True, neck=0.16, bill=0.12, tail=0.1), {'afloat': True}),
        ('bird_hen', 'bird', 'prop', 309, B(L=0.5, body=C['f_white'], belly=C['f_cream'], wing=C['f_cream'], beak=C['f_yellow'], legs=0.2, bill=0.07, comb=C['f_red'], tail=0.12, neck=0.1), {}),
        ('bird_rooster', 'bird', 'prop', 310, B(L=0.56, body=C['f_orange'], belly=C['f_brown'], wing=C['f_green'], beak=C['f_yellow'], legs=0.24, bill=0.08, comb=C['f_red'], tail=0.3, neck=0.14, head_col=C['f_orange']), {}),
        ('bird_bluetit', 'bird', 'prop', 311, B(L=0.26, body=C['f_blue'], belly=C['f_yellow'], wing=C['f_slate'], beak=C['f_black'], legs=0.14, bill=0.07, head=0.16), {}),
        ('bird_owl', 'bird', 'prop', 312, P(owl), {}),
        # 车
        ('bicycle', 'vehicle', 'prop', 320, P(bicycle), {}),
        ('bus', 'vehicle', 'prop', 321, P(bus), {}),
        ('car', 'vehicle', 'prop', 322, P(car), {}),
        ('truck', 'vehicle', 'prop', 323, P(truck), {}),
        # 船、栈桥
        ('rowboat', 'boat', 'prop', 330, P(rowboat), {'afloat': True}),
        ('fishboat', 'boat', 'prop', 331, P(fishboat), {'afloat': True}),
        ('sailboat', 'boat', 'prop', 332, P(sailboat), {'afloat': True}),
        ('pier', 'boat', 'prop', 333, P(pier), {'afloat': True}),
        # 鱼
        ('fishcrate', 'prop', 'prop', 340, P(fishcrate), {}),
        ('fishrack', 'prop', 'prop', 341, P(fishrack), {}),
    ]
