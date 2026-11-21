"""套件的第四部分：原来用平面立牌画的那些街景小物，改成立体的——
小电驴、货运自行车、皮划艇、独木舟、牛车、游乐场（秋千、滑梯、跷跷板、转盘、沙坑、木马）、野餐桌、压水井、告示板、街钟。

立牌从侧面看是一张纸，站在篱笆、墙边上就像穿进去了；这些是有厚度的模型，和别的东西一样登记占地。
正面朝 -Y（到了游戏里是 +Z）。船的 z = 0 是水线；别的东西脚踩 z = 0。
"""
import math

from mathutils import Vector

from kitlib import C, UP, lin
from lm_kit import ball, bx, prism
import life_kit
from life_kit import hull, loft, oval, wheel

C.update({k: lin(v) for k, v in {
    'sand': (0.93, 0.84, 0.62), 'seat': (0.2, 0.18, 0.2), 'play_y': (0.97, 0.78, 0.25), 'play_b': (0.3, 0.55, 0.8), 'play_r': (0.86, 0.3, 0.24), 'paper': (0.97, 0.95, 0.88),
}.items()})
TAU = math.tau


def spoked(k, cx, cy, cz, r, col=None, n=12, w=0.07):
    """木头的大车轮：轴顺着 x。"""
    col = col or C['timber2']
    pts = [Vector((cx, cy + math.cos(i / n * TAU) * r, cz + math.sin(i / n * TAU) * r)) for i in range(n)]
    for i in range(n):
        k.beam_3d(pts[i], pts[(i + 1) % n], w * 0.5, col, part='wood')
    for i in range(0, n, 2):
        k.beam_3d((cx, cy, cz), pts[i], 0.022, C['plank'], part='wood')
    k.beam_3d((cx - w, cy, cz), (cx + w, cy, cz), 0.07, C['timber'], part='wood')


def scooter(k):
    with k.leaning((0, 0, 0), 0, 0.08):
        for y in (-0.56, 0.5):
            wheel(k, 0, y, 0.2, 0.2, 0.1, n=12)
        # 后半身：一个鼓起来的壳
        rings = [oval(y, rx, rz, cz, 8) for y, rx, rz, cz in ((0.02, 0.13, 0.1, 0.34), (0.2, 0.17, 0.17, 0.44), (0.5, 0.18, 0.19, 0.48), (0.74, 0.12, 0.12, 0.5))]
        loft(k, rings, 'accent', C['white'], cap0=True, cap1=True)
        k.box(-0.15, 0.15, 0.08, 0.66, 0.64, 0.71, 'plain', C['seat'])
        # 踏板、前挡
        k.box(-0.16, 0.16, -0.4, 0.06, 0.2, 0.26, 'accent', C['white'])
        loft(k, [[(-0.2, -0.42, 0.24), (0.2, -0.42, 0.24), (0.2, -0.36, 0.24), (-0.2, -0.36, 0.24)], [(-0.2, -0.52, 0.6), (0.2, -0.52, 0.6), (0.2, -0.45, 0.6), (-0.2, -0.45, 0.6)], [(-0.12, -0.5, 0.92), (0.12, -0.5, 0.92), (0.12, -0.44, 0.92), (-0.12, -0.44, 0.92)]], 'accent', C['white'], cap1=True)
        k.beam_3d((0, -0.5, 0.2), (0, -0.46, 1.0), 0.025, C['chrome'])
        k.beam_3d((-0.28, -0.44, 1.0), (0.28, -0.44, 1.0), 0.018, C['chrome'])
        for sx in (-1, 1):
            k.beam_3d((sx * 0.28, -0.44, 1.0), (sx * 0.2, -0.44, 1.0), 0.026, C['seat'])
        ball(k, (0, -0.54, 0.84), 0.07, C['cream2'], part='lamp', n=8, m=4)
        k.box(-0.06, 0.06, 0.72, 0.78, 0.4, 0.46, 'plain', C['red'])
        k.beam_3d((0.06, 0.1, 0.26), (0.22, 0.2, 0.0), 0.012, C['chrome'])
    return (-0.34, 0.34, -0.8, 0.8)


def cargobike(k):
    life_kit.bicycle(k)
    with k.leaning((0, 0, 0), 0, 0.1):
        k.box(-0.26, 0.26, 0.38, 0.98, 0.76, 0.8, 'wood', C['plank'])
        for x0, x1, y0, y1 in ((-0.26, -0.23, 0.38, 0.98), (0.23, 0.26, 0.38, 0.98), (-0.26, 0.26, 0.38, 0.41), (-0.26, 0.26, 0.95, 0.98)):
            k.box(x0, x1, y0, y1, 0.8, 1.08, 'wood', C['plank2'])
        k.box(-0.2, 0.2, 0.45, 0.9, 0.8, 1.0, 'cloth', C['cream'])
    return (-0.36, 0.36, -0.9, 1.0)


def canoe(k):
    hull(k, [(-2.3, 0.02, 0.44), (-1.7, 0.27, 0.32), (-0.6, 0.42, 0.26), (0.6, 0.42, 0.26), (1.7, 0.27, 0.32), (2.3, 0.02, 0.44)], 0.4, side=C['plank2'], transom=False)
    for y in (-1.1, 0.0, 1.1):
        k.box(-0.36, 0.36, y - 0.08, y + 0.08, 0.14, 0.17, 'wood', C['plank'])
    k.beam_3d((0.1, -1.4, 0.2), (0.3, 0.6, 0.3), 0.02, C['timber2'], part='wood')
    k.box(0.02, 0.2, -1.75, -1.4, 0.17, 0.2, 'wood', C['plank2'])
    return (-0.46, 0.46, -2.32, 2.32)


def kayak(k):
    sects = [(-2.0, 0.015, 0.2), (-1.3, 0.2, 0.22), (-0.3, 0.3, 0.24), (0.5, 0.3, 0.24), (1.4, 0.19, 0.22), (2.0, 0.015, 0.2)]
    rings = hull(k, sects, 0.26, n=7, strake=0.3, side=C['hull'], transom=False)
    # 甲板：两舷之间鼓起来一点
    for i in range(len(rings) - 1):
        a0, a1, b0, b1 = (Vector(v) for v in (rings[i][0], rings[i][-1], rings[i + 1][0], rings[i + 1][-1]))
        ma, mb = (a0 + a1) / 2 + Vector((0, 0, 0.05)), (b0 + b1) / 2 + Vector((0, 0, 0.05))
        k.face([a0, b0, mb, ma], 'accent', C['white'], Vector((0.3, 0, 1)))
        k.face([ma, mb, b1, a1], 'accent', C['white'], Vector((-0.3, 0, 1)))
    prism(k, 0, 0.15, 0.24, 0.22, 0.27, 0.33, 10, 'plain', C['seat'], sq=1.5)
    k.beam_3d((-0.75, -0.5, 0.36), (0.75, -0.3, 0.36), 0.016, C['timber2'], part='wood')
    for sx in (-1, 1):
        k.box(sx * 0.75 - 0.09, sx * 0.75 + 0.09, -0.4 - sx * 0.1 - 0.012, -0.4 - sx * 0.1 + 0.012, 0.24, 0.48, 'plain', C['play_y'])
    return (-0.34, 0.34, -2.02, 2.02)


def oxcart(k):
    for sx in (-1, 1):
        spoked(k, sx * 0.82, 0.25, 0.62, 0.62)
    k.box(-0.7, 0.7, -0.9, 1.4, 0.66, 0.74, 'wood', C['plank'])
    for sx in (-1, 1):
        k.box(sx * 0.7 - 0.03, sx * 0.7 + 0.03, -0.9, 1.4, 0.74, 1.12, 'wood', C['plank2'])
        for y in (-0.85, -0.1, 0.65, 1.35):
            k.beam_3d((sx * 0.7, y, 0.7), (sx * 0.7, y, 1.2), 0.03, C['timber2'], part='wood')
        k.beam_3d((sx * 0.4, -0.9, 0.7), (sx * 0.32, -2.5, 0.84), 0.035, C['timber2'], part='wood')
    k.box(-0.7, 0.7, 1.37, 1.43, 0.74, 1.12, 'wood', C['plank2'])
    k.beam_3d((-0.5, -2.45, 0.84), (0.5, -2.45, 0.84), 0.04, C['timber'], part='wood')
    k.beam_3d((0, -1.5, 0.76), (0, -1.5, 0.0), 0.03, C['timber'], part='wood')
    # 一车干草
    for x, y, z, r in ((-0.25, -0.3, 1.0, 0.5), (0.25, 0.4, 1.05, 0.52), (-0.1, 0.9, 0.98, 0.46), (0.2, -0.5, 0.95, 0.4)):
        ball(k, (x, y, z), r, C['straw'], n=7, m=4, sq=0.75)
    return (-0.9, 0.9, -2.5, 1.45)


def swing(k):
    H = 2.5
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.beam_3d((sx * 1.7, sy * 0.9, 0.0), (sx * 1.55, 0, H), 0.05, C['play_r'], part='accent')
        k.beam_3d((sx * 1.63, -0.45, H / 2), (sx * 1.63, 0.45, H / 2), 0.035, C['play_r'], part='accent')
    k.beam_3d((-1.6, 0, H), (1.6, 0, H), 0.055, C['play_r'], part='accent')
    for cx, sway in ((-0.7, 0.18), (0.7, -0.1)):
        y = sway * 2.0
        for sx in (-1, 1):
            k.beam_3d((cx + sx * 0.22, 0, H), (cx + sx * 0.22, y, 0.55), 0.012, C['iron'])
        k.box(cx - 0.27, cx + 0.27, y - 0.11, y + 0.11, 0.5, 0.55, 'wood', C['plank2'])
    return (-1.8, 1.8, -1.0, 1.0)


def slide(k):
    # 台子和梯子在后（+y），滑道往前（-y）下来
    for sx in (-1, 1):
        for y in (0.9, 1.6):
            k.beam_3d((sx * 0.4, y, 0), (sx * 0.4, y, 2.3 if y < 1.2 else 1.6), 0.045, C['play_b'])
        k.beam_3d((sx * 0.4, 1.6, 1.6), (sx * 0.4, 2.3, 0.0), 0.04, C['play_b'])
        k.beam_3d((sx * 0.4, 0.9, 2.2), (sx * 0.4, 1.6, 2.2), 0.03, C['play_b'])
        # 滑道的两道边
        pts = [(sx * 0.36, 0.9, 1.72), (sx * 0.36, -0.4, 0.75), (sx * 0.36, -1.4, 0.3), (sx * 0.36, -1.9, 0.26)]
        for a, b in zip(pts, pts[1:]):
            k.beam_3d(a, b, 0.04, C['play_y'], part='accent')
    k.box(-0.42, 0.42, 0.88, 1.62, 1.52, 1.6, 'wood', C['plank'])
    for i in range(5):
        z = 0.28 + i * 0.28
        y = 2.3 - (z / 1.6) * 0.7
        k.beam_3d((-0.4, y, z), (0.4, y, z), 0.025, C['chrome'])
    bed = [(0.9, 1.6), (-0.4, 0.63), (-1.4, 0.18), (-1.9, 0.14)]
    for (y0, z0), (y1, z1) in zip(bed, bed[1:]):
        k.face([(-0.36, y0, z0), (0.36, y0, z0), (0.36, y1, z1), (-0.36, y1, z1)], 'accent', C['white'], UP)
        k.face([(-0.36, y1, z1 - 0.04), (0.36, y1, z1 - 0.04), (0.36, y0, z0 - 0.04), (-0.36, y0, z0 - 0.04)], 'accent', C['white'], -UP)
    k.beam_3d((0, -1.5, 0.22), (0, -1.5, 0.0), 0.04, C['play_b'])
    return (-0.5, 0.5, -1.95, 2.35)


def seesaw(k):
    prism(k, 0, 0, 0.28, 0.1, 0.0, 0.5, 6, 'plain', C['play_b'])
    k.beam_3d((-0.3, 0, 0.5), (0.3, 0, 0.5), 0.04, C['chrome'])
    with k.leaning((0, 0, 0.52), 0.2, 0):
        k.box(-0.14, 0.14, -1.7, 1.7, 0.5, 0.56, 'accent', C['white'])
        for sy in (-1, 1):
            k.box(-0.17, 0.17, sy * 1.45 - 0.2, sy * 1.45 + 0.2, 0.56, 0.6, 'plain', C['seat'])
            y = sy * 1.12
            for sx in (-1, 1):
                k.beam_3d((sx * 0.1, y, 0.56), (sx * 0.14, y, 0.82), 0.014, C['chrome'])
            k.beam_3d((-0.14, y, 0.82), (0.14, y, 0.82), 0.016, C['chrome'])
    return (-0.34, 0.34, -1.75, 1.75)


def merrygo(k):
    prism(k, 0, 0, 1.15, 1.15, 0.16, 0.24, 14, 'accent', C['white'], bottom=True)
    prism(k, 0, 0, 0.14, 0.12, 0.0, 1.0, 8, 'plain', C['play_b'])
    ball(k, (0, 0, 1.02), 0.14, C['play_y'], n=8, m=4)
    for i in range(6):
        a = i / 6 * TAU
        p = Vector((math.cos(a) * 1.0, math.sin(a) * 1.0, 0.24))
        top = p + Vector((0, 0, 0.72))
        k.beam_3d(p, top, 0.02, C['chrome'])
        k.beam_3d(top, (math.cos(a) * 0.12, math.sin(a) * 0.12, 0.96), 0.018, C['chrome'])
        b = Vector((math.cos(a + TAU / 6) * 1.0, math.sin(a + TAU / 6) * 1.0, 0.96))
        if i % 2 == 0:
            k.beam_3d(top, b, 0.018, C['chrome'])
    return (-1.2, 1.2, -1.2, 1.2)


def sandbox(k):
    W = 1.4
    for x0, x1, y0, y1 in ((-W, W, -W, -W + 0.16), (-W, W, W - 0.16, W), (-W, -W + 0.16, -W, W), (W - 0.16, W, -W, W)):
        k.box(x0, x1, y0, y1, 0.0, 0.3, 'wood', C['plank'])
    k.box(-W + 0.16, W - 0.16, -W + 0.16, W - 0.16, 0.0, 0.17, 'plain', C['sand'], skip=(0,))
    for x, y, r in ((-0.5, 0.3, 0.34), (0.45, -0.4, 0.26), (0.5, 0.6, 0.2)):
        ball(k, (x, y, 0.15), r, C['sand'], n=7, m=4, sq=0.55, half=True)
    prism(k, -0.2, -0.6, 0.11, 0.14, 0.17, 0.4, 8, 'plain', C['play_r'])
    k.beam_3d((0.1, -0.2, 0.2), (0.4, 0.1, 0.42), 0.014, C['play_b'])
    k.box(0.02, 0.16, -0.3, -0.14, 0.17, 0.2, 'plain', C['play_b'])
    return (-W, W, -W, W)


def rockhorse(k):
    for sx in (-1, 1):
        pts = [Vector((sx * 0.17, math.sin(a) * 0.7, 0.62 - math.cos(a) * 0.6)) for a in [(-0.8 + 1.6 * i / 8) for i in range(9)]]
        for a, b in zip(pts, pts[1:]):
            k.beam_3d(a, b, 0.028, C['play_r'], part='accent')
        for y in (-0.26, 0.26):
            k.beam_3d((sx * 0.17, y * 1.2, 0.06), (sx * 0.1, y, 0.5), 0.03, C['plank'], part='wood')
    for y in (-0.45, 0.45):
        k.beam_3d((-0.17, y, 0.14), (0.17, y, 0.14), 0.024, C['play_r'], part='accent')
    rings = [oval(y, rx, rz, cz, 8) for y, rx, rz, cz in ((-0.4, 0.07, 0.09, 0.66), (-0.25, 0.13, 0.15, 0.64), (0.1, 0.14, 0.15, 0.62), (0.36, 0.12, 0.14, 0.64), (0.46, 0.05, 0.06, 0.66))]
    loft(k, rings, 'plain', C['plank2'], cap0=True, cap1=True)
    loft(k, [oval(-0.34, 0.07, 0.1, 0.72, 6), oval(-0.46, 0.06, 0.08, 0.92, 6), oval(-0.54, 0.055, 0.07, 1.0, 6)], 'plain', C['plank2'])
    rings = [oval(y, rx, rz, cz, 6) for y, rx, rz, cz in ((-0.46, 0.065, 0.08, 1.02), (-0.6, 0.06, 0.07, 0.98), (-0.74, 0.04, 0.045, 0.92))]
    loft(k, rings, 'plain', C['plank2'], cap0=True, cap1=True)
    k.box(-0.012, 0.012, -0.5, -0.3, 0.86, 1.1, 'plain', C['timber'])
    for sx in (-1, 1):
        k.face([(sx * 0.03, -0.46, 1.08), (sx * 0.05, -0.44, 1.19), (sx * 0.06, -0.4, 1.07)], 'plain', C['plank2'], (sx, 0, 0.3))
        k.box(sx * 0.064 - 0.005, sx * 0.064 + 0.005, -0.62, -0.59, 0.99, 1.02, 'plain', C['f_black'])
    k.beam_3d((-0.18, -0.5, 0.94), (0.18, -0.5, 0.94), 0.016, C['play_y'])
    k.box(-0.15, 0.15, -0.1, 0.22, 0.75, 0.8, 'accent', C['white'])
    k.face([(-0.012, 0.44, 0.7), (0.012, 0.44, 0.7), (0.0, 0.62, 0.4)], 'plain', C['timber'], (1, 0, 0))
    return (-0.24, 0.24, -0.78, 0.74)


def picnic(k):
    for i in range(4):
        x = -0.36 + i * 0.24
        k.box(x - 0.11, x + 0.11, -0.9, 0.9, 0.72, 0.77, 'wood', C['plank2'] if i % 2 else C['plank'])
    for sx in (-1, 1):
        k.box(sx * 0.78 - 0.13, sx * 0.78 + 0.13, -0.9, 0.9, 0.42, 0.47, 'wood', C['plank'])
    for y in (-0.62, 0.62):
        for sx in (-1, 1):
            k.beam_3d((sx * 0.86, y, 0.0), (sx * 0.2, y, 0.72), 0.04, C['timber2'], part='wood')
        k.beam_3d((-0.9, y, 0.4), (0.9, y, 0.4), 0.035, C['timber2'], part='wood')
    k.box(-0.3, 0.3, -0.35, 0.35, 0.772, 0.78, 'cloth', C['cream'])
    prism(k, 0.05, 0.05, 0.1, 0.13, 0.78, 0.9, 8, 'plain', C['straw'])
    for x, y, c in ((0.0, 0.02, 'red'), (0.08, 0.08, 'yellow'), (0.04, -0.02, 'red')):
        ball(k, (x, y, 0.93), 0.05, C[c], n=6, m=4)
    return (-0.95, 0.95, -0.92, 0.92)


def pump(k):
    prism(k, 0, 0, 0.5, 0.46, 0.0, 0.16, 8, 'stone', C['stone'])
    prism(k, 0, 0, 0.09, 0.08, 0.16, 1.0, 8, 'plain', C['f_green'])
    prism(k, 0, 0, 0.12, 0.1, 1.0, 1.12, 8, 'plain', C['f_green'])
    ball(k, (0, 0, 1.12), 0.1, C['f_green'], n=8, m=4, half=True)
    k.beam_3d((0, -0.06, 0.82), (0, -0.34, 0.8), 0.04, C['f_green'])
    k.beam_3d((0, -0.34, 0.8), (0, -0.36, 0.7), 0.04, C['f_green'])
    k.beam_3d((0, 0.02, 1.14), (0, 0.5, 1.3), 0.022, C['iron'])
    k.beam_3d((0, 0.5, 1.3), (0, 0.62, 0.9), 0.022, C['iron'])
    prism(k, 0, -0.36, 0.13, 0.16, 0.16, 0.42, 8, 'plain', C['chrome'])
    return (-0.5, 0.5, -0.5, 0.64)


def noticeboard(k):
    for sx in (-1, 1):
        k.box(sx * 0.82 - 0.06, sx * 0.82 + 0.06, -0.06, 0.06, 0.0, 2.0, 'wood', C['timber2'])
    k.box(-0.82, 0.82, -0.035, 0.035, 0.85, 1.85, 'wood', C['plank'])
    k.box(-0.76, 0.76, -0.045, -0.035, 0.91, 1.79, 'plain', C['cream'])
    for x, z, w, h, c in ((-0.5, 1.4, 0.34, 0.44, 'paper'), (-0.08, 1.5, 0.3, 0.38, 'yellow'), (0.4, 1.36, 0.4, 0.5, 'paper'), (-0.4, 1.0, 0.4, 0.26, 'pink'), (0.14, 1.04, 0.28, 0.34, 'paper'), (0.52, 0.98, 0.2, 0.2, 'blue')):
        k.box(x - w / 2, x + w / 2, -0.052, -0.045, z - h / 2, z + h / 2, 'plain', C[c])
    # 小屋檐
    k.face([(-1.0, -0.26, 1.94), (1.0, -0.26, 1.94), (1.0, 0.0, 2.16), (-1.0, 0.0, 2.16)], 'roof', C['white'], Vector((0, -0.6, 1)))
    k.face([(1.0, 0.26, 1.94), (-1.0, 0.26, 1.94), (-1.0, 0.0, 2.16), (1.0, 0.0, 2.16)], 'roof', C['white'], Vector((0, 0.6, 1)))
    k.face([(-1.0, -0.26, 1.92), (-1.0, 0.26, 1.92), (1.0, 0.26, 1.92), (1.0, -0.26, 1.92)], 'wood', C['under'], -UP)
    return (-1.0, 1.0, -0.28, 0.28)


def streetclock(k):
    prism(k, 0, 0, 0.3, 0.22, 0.0, 0.2, 8, 'stone', C['stone2'])
    prism(k, 0, 0, 0.13, 0.09, 0.2, 0.7, 8, 'plain', C['iron'])
    prism(k, 0, 0, 0.06, 0.05, 0.7, 2.7, 8, 'plain', C['iron'])
    prism(k, 0, 0, 0.1, 0.1, 2.62, 2.72, 8, 'plain', C['brass'])
    # 钟头：一只扁鼓，两面钟面
    cz, r = 3.12, 0.42
    a = [(math.cos(i / 14 * TAU) * r, -0.13, cz + math.sin(i / 14 * TAU) * r) for i in range(14)]
    b = [(p[0], 0.13, p[2]) for p in a]
    loft(k, [a, b], 'plain', C['iron'])
    for sy in (-1, 1):
        k.face([(p[0], sy * 0.13, p[2]) for p in a], 'plain', C['iron'], (0, sy, 0))
        k.face([(p[0] * 0.86, sy * 0.136, cz + (p[2] - cz) * 0.86) for p in a], 'plain', C['paper'], (0, sy, 0))
        for i in range(12):
            an = i / 12 * TAU
            x, z = math.cos(an) * r * 0.72, cz + math.sin(an) * r * 0.72
            s = 0.028 if i % 3 == 0 else 0.016
            k.box(x - s, x + s, sy * 0.136, sy * 0.142, z - s, z + s, 'plain', C['iron'])
        k.box(-0.016, 0.016, sy * 0.138, sy * 0.146, cz, cz + 0.27, 'plain', C['iron'])
        k.box(0.0, 0.19 * sy, sy * 0.138, sy * 0.146, cz - 0.016, cz + 0.016, 'plain', C['iron']) if sy > 0 else k.box(-0.19, 0.0, -0.146, -0.138, cz - 0.016, cz + 0.016, 'plain', C['iron'])
    prism(k, 0, 0, 0.08, 0.0, cz + r, cz + r + 0.26, 6, 'plain', C['brass'])
    return (-0.44, 0.44, -0.3, 0.3)


def install(ns):
    P = lambda f: (lambda k: f(k))
    return [
        ('scooter', 'vehicle', 'prop', 401, P(scooter), {}),
        ('cargobike', 'vehicle', 'prop', 402, P(cargobike), {}),
        ('canoe', 'boat', 'prop', 403, P(canoe), {'afloat': True}),
        ('kayak', 'boat', 'prop', 404, P(kayak), {'afloat': True}),
        ('oxcart', 'vehicle', 'prop', 405, P(oxcart), {}),
        ('swing', 'play', 'prop', 410, P(swing), {}),
        ('slide', 'play', 'prop', 411, P(slide), {}),
        ('seesaw', 'play', 'prop', 412, P(seesaw), {}),
        ('merrygo', 'play', 'prop', 413, P(merrygo), {}),
        ('sandbox', 'play', 'prop', 414, P(sandbox), {}),
        ('rockhorse', 'play', 'prop', 415, P(rockhorse), {}),
        ('picnic', 'prop', 'prop', 416, P(picnic), {}),
        ('pump', 'prop', 'prop', 417, P(pump), {}),
        ('noticeboard', 'prop', 'prop', 418, P(noticeboard), {}),
        ('streetclock', 'prop', 'prop', 419, P(streetclock), {}),
    ]
