"""吉卜力风房屋套件的建模库：在 Blender 里（bpy / mathutils）一块一块"搭"出来。

和 tools/ghibli 那两代的区别：
  · 面数低（一栋两三千个三角），因为一座城要摆几千栋，全部实例化；
  · 造型上的"吉卜力"：陡屋顶、檐口起翘、屋脊微微塌腰、出挑的二层、木构架、歪一点的烟囱、
    老虎窗、凸窗、披屋、雨棚、窗台花箱、门口的木桶和盆栽——轮廓不是一个盒子加一个三角；
  · 颜色不写死：每个面记它是"哪种部件"（墙 / 瓦 / 木 / 石 / 玻璃 / 点缀色 / 植物 / 原色 / 布），
    墙、瓦、点缀色到了游戏里按每一栋自己的颜色来调；顶点色里存的是这块颜料的深浅和檐下的影子。

坐标：Blender 的 Z 朝上，房子正面朝 -Y，脚踩 z = 0，墙往下多埋 1.2 m（坡地上不露底）。
"""
import math
import random

from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

PART = {'wall': 0, 'roof': 1, 'wood': 2, 'stone': 3, 'glass': 4, 'accent': 5, 'leaf': 6, 'plain': 7, 'cloth': 8, 'lamp': 9}
UP = Vector((0, 0, 1))
# 影子的颜色：偏蓝紫（乘在底色上）
SHADOW = Vector((0.6, 0.64, 0.86))


def lin(c):
    """sRGB → 线性。调色板按看到的颜色写，存进模型的是线性值。"""
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


# 不随房子换色的那些颜料（sRGB）
C = {k: lin(v) for k, v in {
    'white': (1.0, 1.0, 1.0),
    'timber': (0.33, 0.22, 0.15), 'timber2': (0.42, 0.29, 0.19), 'plank': (0.62, 0.46, 0.3), 'plank2': (0.7, 0.55, 0.38),
    'under': (0.36, 0.26, 0.2), 'jpwood': (0.3, 0.2, 0.14), 'jpwood2': (0.4, 0.27, 0.18),
    'stone': (0.66, 0.63, 0.56), 'stone2': (0.56, 0.55, 0.52), 'stone3': (0.74, 0.69, 0.58), 'brick': (0.7, 0.4, 0.3),
    'frame': (0.93, 0.9, 0.82), 'glass': (1.0, 1.0, 1.0), 'iron': (0.2, 0.21, 0.25), 'brass': (0.85, 0.65, 0.25),
    'leaf': (0.2, 0.46, 0.17), 'leaf2': (0.36, 0.6, 0.2), 'leaf3': (0.12, 0.34, 0.16),
    'red': (0.86, 0.26, 0.22), 'yellow': (0.97, 0.8, 0.26), 'pink': (0.95, 0.58, 0.68), 'blue': (0.36, 0.56, 0.86), 'cream': (0.97, 0.94, 0.86),
    'terracotta': (0.78, 0.44, 0.28), 'straw': (0.86, 0.72, 0.4), 'cloth': (1.0, 1.0, 1.0), 'sign': (0.86, 0.74, 0.5),
}.items()}


class Side:
    """矩形墙的一面：u 沿墙走，w 往外，z 往上。"""

    def __init__(self, rect, name):
        x0, x1, y0, y1 = rect
        self.name = name
        if name == 'front':
            self.o, self.du, self.dw, self.len = Vector((x0, y0, 0)), Vector((1, 0, 0)), Vector((0, -1, 0)), x1 - x0
        elif name == 'back':
            self.o, self.du, self.dw, self.len = Vector((x1, y1, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), x1 - x0
        elif name == 'left':
            self.o, self.du, self.dw, self.len = Vector((x0, y1, 0)), Vector((0, -1, 0)), Vector((-1, 0, 0)), y1 - y0
        else:
            self.o, self.du, self.dw, self.len = Vector((x1, y0, 0)), Vector((0, 1, 0)), Vector((1, 0, 0)), y1 - y0

    def p(self, u, w, z):
        return self.o + self.du * u + self.dw * w + UP * z


class Kit:
    def __init__(self, seed=1):
        self.faces = []  # (pts, normal, part, colour, wid)
        self.r = random.Random(seed)
        self.M = Matrix.Identity(4)
        self.wid = 0

    # ---------------------------------------------------------------- 基本面
    def face(self, pts, part, col, hint, wid=0.0):
        pts = [self.M @ Vector(p) for p in pts]
        n = Vector((0, 0, 0))
        for i in range(1, len(pts) - 1):
            n += (pts[i] - pts[0]).cross(pts[i + 1] - pts[0])
        if n.length < 1e-10:
            return
        n.normalize()
        h = self.M.to_3x3() @ Vector(hint)
        if n.dot(h) < 0:
            pts.reverse()
            n = -n
        self.faces.append((pts, n, PART[part], col, wid))

    def hexa(self, c, part, col, skip=(), top=None, wid=0.0):
        """八个角：下面四个（绕一圈），上面四个。top = (part, col)：顶面换一种颜料。"""
        c = [Vector(p) for p in c]
        mid = sum(c, Vector()) / 8
        quads = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        for i, q in enumerate(quads):
            if i in skip:
                continue
            pts = [c[k] for k in q]
            pr, cl = (top if (i == 1 and top) else (part, col))
            self.face(pts, pr, cl, sum(pts, Vector()) / 4 - mid, wid)

    def box(self, x0, x1, y0, y1, z0, z1, part, col, **kw):
        self.hexa([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], part, col, **kw)

    def sbox(self, s, u0, u1, w0, w1, z0, z1, part, col, **kw):
        self.hexa([s.p(u0, w0, z0), s.p(u1, w0, z0), s.p(u1, w1, z0), s.p(u0, w1, z0), s.p(u0, w0, z1), s.p(u1, w0, z1), s.p(u1, w1, z1), s.p(u0, w1, z1)], part, col, **kw)

    def squad(self, s, u0, u1, z0, z1, w, part, col, wid=0.0):
        """贴在墙上的一块平板（比墙凸出 w）。"""
        self.face([s.p(u0, w, z0), s.p(u1, w, z0), s.p(u1, w, z1), s.p(u0, w, z1)], part, col, s.dw, wid)

    def blob(self, c, r, col, squash=0.8):
        """一团叶子 / 一朵花：圆的一团（上下各一个尖、中间两圈，每圈六个点，稍微歪一点），不是菱形。"""
        c = Vector(c)
        n = 6
        rot = self.r.uniform(0, math.tau)
        rings = []
        for lat, rr in ((-0.42, 0.8), (0.3, 0.92)):
            rings.append([c + Vector((math.cos(rot + (i + (0.5 if lat > 0 else 0)) / n * math.tau) * r * rr, math.sin(rot + (i + (0.5 if lat > 0 else 0)) / n * math.tau) * r * rr, r * squash * lat)) for i in range(n)])
        t, b = c + Vector((0, 0, r * squash)), c - Vector((0, 0, r * squash * 0.8))
        lo, hi = rings
        for i in range(n):
            j = (i + 1) % n
            for pts in ([lo[j], lo[i], b], [lo[i], lo[j], hi[i]], [lo[j], hi[j], hi[i]], [hi[i], hi[j], t]):
                self.face(pts, 'leaf', col, sum(pts, Vector()) / 3 - c)

    # ---------------------------------------------------------------- 墙
    def walls(self, rect, z0, z1, part='wall', col=None, sides=('front', 'back', 'left', 'right'), cap=False):
        """一圈墙。横着分三段（墙根、墙身、檐下）：影子才有地方落。"""
        col = col or C['white']
        cuts = [z0]
        for z in (z0 + 0.55, z1 - 0.7):
            if cuts[-1] + 0.3 < z < z1 - 0.2:
                cuts.append(z)
        cuts.append(z1)
        for name in sides:
            s = Side(rect, name)
            for a, b in zip(cuts, cuts[1:]):
                self.squad(s, 0, s.len, a, b, 0, part, col)
        if cap:
            x0, x1, y0, y1 = rect
            self.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], part, col, UP)

    def plinth(self, rect, h=0.5, out=0.09, col=None):
        x0, x1, y0, y1 = rect
        self.box(x0 - out, x1 + out, y0 - out, y1 + out, -1.2, h, 'stone', col or C['stone'], skip=(0,))

    # ---------------------------------------------------------------- 屋顶
    def slab(self, quad, thick, part, col, under=('wood', None), edge=('wood', None), skip_under=False):
        """一片有厚度的斜板：瓦面、底面、四条边。quad 绕一圈。"""
        q = [Vector(p) for p in quad]
        n = (q[1] - q[0]).cross(q[3] - q[0]).normalized()
        if n.z < 0:
            n = -n
        lo = [p - n * thick for p in q]
        self.face(q, part, col, n)
        if not skip_under:
            self.face(lo, under[0], under[1] or C['under'], -n)
        mid = sum(q, Vector()) / 4
        for i in range(4):
            pts = [q[i], q[(i + 1) % 4], lo[(i + 1) % 4], lo[i]]
            self.face(pts, edge[0], edge[1] or C['timber'], sum(pts, Vector()) / 4 - mid)

    def gable(self, rect, z, rise, over=0.5, verge=0.35, thick=0.14, sag=0.07, kick=0.62, col=None, wall=('wall', None), cap=True):
        """
        双坡顶，屋脊沿 x。檐口那一段坡度放缓（起翘），屋脊中间微微塌一点。两头的山墙一起补上。
        返回 height(x, y)：瓦面在 (x, y) 处的高度。
        """
        x0, x1, y0, y1 = rect
        col = col or C['white']
        yc = (y0 + y1) / 2
        half = (y1 - y0) / 2
        slope = rise / half
        dk = kick * half
        ridge = slope * dk + slope * kick * (half - dk)

        def zat(d, t):
            base = ridge - slope * d if d <= dk else ridge - slope * dk - slope * kick * (d - dk)
            return z + base - sag * math.sin(math.pi * t) * (1 - 0.6 * min(1, d / half))

        xs = [x0 - verge, x0 + (x1 - x0) * 0.34, x0 + (x1 - x0) * 0.66, x1 + verge]
        ts = [0, 0.34, 0.66, 1]
        ds = [0, dk, half + over]
        for sgn in (-1, 1):
            for i in range(3):
                for j in range(2):
                    q = [(xs[i], yc + sgn * ds[j], zat(ds[j], ts[i])), (xs[i + 1], yc + sgn * ds[j], zat(ds[j], ts[i + 1])),
                         (xs[i + 1], yc + sgn * ds[j + 1], zat(ds[j + 1], ts[i + 1])), (xs[i], yc + sgn * ds[j + 1], zat(ds[j + 1], ts[i]))]
                    self.face(q, 'roof', col, UP)
                    lo = [Vector(p) - Vector((0, 0, thick)) for p in q]
                    self.face(lo, 'wood', C['under'], -UP)
                    if j == 1:  # 檐口的封檐板
                        self.face([q[3], q[2], lo[2], lo[3]], 'wood', C['timber'], (0, sgn, 0))
                    if i == 0:  # 山墙一侧的博风板
                        self.face([q[0], q[3], lo[3], lo[0]], 'wood', C['timber'], (-1, 0, 0))
                    if i == 2:
                        self.face([q[1], q[2], lo[2], lo[1]], 'wood', C['timber'], (1, 0, 0))
        if cap:  # 脊瓦
            for i in range(3):
                a, b = Vector((xs[i], yc, zat(0, ts[i]))), Vector((xs[i + 1], yc, zat(0, ts[i + 1])))
                w, h = 0.16, 0.09
                self.hexa([a + Vector((0, -w, -0.04)), b + Vector((0, -w, -0.04)), b + Vector((0, w, -0.04)), a + Vector((0, w, -0.04)),
                           a + Vector((0, -w * 0.5, h)), b + Vector((0, -w * 0.5, h)), b + Vector((0, w * 0.5, h)), a + Vector((0, w * 0.5, h))],
                          'roof', tuple(v * 0.72 for v in col), skip=(0,))
        # 山墙
        wpart, wcol = wall[0], wall[1] or C['white']
        for x, t, nx in ((x0, 0.0, -1), (x1, 1.0, 1)):
            und = lambda d: zat(d, t) - thick + 0.02
            pts = [(x, y0, z), (x, y1, z), (x, yc + dk, und(dk)), (x, yc, und(0)), (x, yc - dk, und(dk))]
            cen = (x, yc, z)
            for i in range(len(pts)):
                self.face([cen, pts[i], pts[(i + 1) % len(pts)]], wpart, wcol, (nx, 0, 0))

        def height(x, y):
            t = min(1.0, max(0.0, (x - x0) / max(1e-6, x1 - x0)))
            return zat(abs(y - yc), t)

        height.ridge = z + ridge
        height.yc = yc
        height.half = half
        return height

    def hip(self, rect, z, rise, over=0.55, thick=0.13, col=None):
        """四坡顶：屋脊沿长边。"""
        x0, x1, y0, y1 = rect
        col = col or C['white']
        if (y1 - y0) > (x1 - x0):
            with self.turned((x0 + x1) / 2, (y0 + y1) / 2):
                cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
                hw, hd = (y1 - y0) / 2, (x1 - x0) / 2
                return self.hip((cx - hw, cx + hw, cy - hd, cy + hd), z, rise, over, thick, col)
        yc = (y0 + y1) / 2
        half = (y1 - y0) / 2
        drop = over * rise / half * 0.7
        e = [(x0 - over, y0 - over, z - drop), (x1 + over, y0 - over, z - drop), (x1 + over, y1 + over, z - drop), (x0 - over, y1 + over, z - drop)]
        ra, rb = (x0 + half * 0.9, yc, z + rise), (x1 - half * 0.9, yc, z + rise)
        for pts in ([e[0], e[1], rb, ra], [e[2], e[3], ra, rb], [e[1], e[2], rb], [e[3], e[0], ra]):
            n = (Vector(pts[1]) - Vector(pts[0])).cross(Vector(pts[2]) - Vector(pts[0])).normalized()
            if n.z < 0:
                n = -n
            self.face(pts, 'roof', col, n)
            self.face([Vector(p) - Vector((0, 0, thick)) for p in pts], 'wood', C['under'], -n)
            a, b = Vector(pts[0]), Vector(pts[1])
            self.face([a, b, b - Vector((0, 0, thick)), a - Vector((0, 0, thick))], 'wood', C['timber'], (a + b) / 2 - Vector(((x0 + x1) / 2, yc, a.z)))
        w = 0.16
        self.hexa([(ra[0], yc - w, z + rise - 0.05), (rb[0], yc - w, z + rise - 0.05), (rb[0], yc + w, z + rise - 0.05), (ra[0], yc + w, z + rise - 0.05),
                   (ra[0], yc - w * 0.5, z + rise + 0.09), (rb[0], yc - w * 0.5, z + rise + 0.09), (rb[0], yc + w * 0.5, z + rise + 0.09), (ra[0], yc + w * 0.5, z + rise + 0.09)],
                  'roof', tuple(v * 0.72 for v in col), skip=(0,))

        def height(x, y):
            return z + rise * max(0.0, 1 - abs(y - yc) / half)

        height.ridge = z + rise
        return height

    def cone(self, cx, cy, r, z, rise, n=10, col=None, over=0.4):
        col = col or C['white']
        ring = [(cx + math.cos(i / n * math.tau) * (r + over), cy + math.sin(i / n * math.tau) * (r + over), z - over * 0.5) for i in range(n)]
        for i in range(n):
            pts = [ring[i], ring[(i + 1) % n], (cx, cy, z + rise)]
            self.face(pts, 'roof', col, Vector(pts[0]) + Vector(pts[1]) - 2 * Vector((cx, cy, z)) + UP * 2)
            self.face([ring[i], ring[(i + 1) % n], (cx, cy, z - over * 0.5)], 'wood', C['under'], -UP)

    # ---------------------------------------------------------------- 变换
    class _Turn:
        def __init__(self, kit, m):
            self.kit, self.m = kit, m

        def __enter__(self):
            self.keep = self.kit.M.copy()
            self.kit.M = self.kit.M @ self.m

        def __exit__(self, *a):
            self.kit.M = self.keep

    def turned(self, cx, cy, angle=math.pi / 2):
        """绕 (cx, cy) 这根竖轴转。"""
        return Kit._Turn(self, Matrix.Translation((cx, cy, 0)) @ Matrix.Rotation(angle, 4, 'Z') @ Matrix.Translation((-cx, -cy, 0)))

    def leaning(self, at, ax, ay):
        """以 at 为支点歪一点（弧度）。"""
        at = Vector(at)
        return Kit._Turn(self, Matrix.Translation(at) @ Matrix.Rotation(ax, 4, 'X') @ Matrix.Rotation(ay, 4, 'Y') @ Matrix.Translation(-at))

    # ---------------------------------------------------------------- 门窗和零碎
    def window(self, s, u, z, w=0.9, h=1.2, frame=None, shutters=False, box=False, bars=(1, 1), sill=True):
        """一扇窗：玻璃、窗框、窗棂、窗台；可以带百叶和花箱。u 是窗的中线，z 是窗台高。"""
        frame = frame or C['frame']
        self.wid += 1
        wid = self.wid
        u0, u1 = u - w / 2, u + w / 2
        self.squad(s, u0, u1, z, z + h, 0.02, 'glass', C['glass'], wid)
        f = 0.075
        # 窗框有厚度（凸出墙面七厘米），玻璃退在里面：侧光下每扇窗都有一道影子
        for a, b, c, d in ((u0 - f, u1 + f, z + h, z + h + f), (u0 - f, u1 + f, z - f * 0.4, z), (u0 - f, u0, z, z + h), (u1, u1 + f, z, z + h)):
            self.sbox(s, a, b, 0, 0.075, c, d, 'plain', frame, skip=(3,))
        for i in range(1, bars[0] + 1):
            x = u0 + w * i / (bars[0] + 1)
            self.squad(s, x - 0.025, x + 0.025, z, z + h, 0.045, 'plain', frame)
        for i in range(1, bars[1] + 1):
            y = z + h * i / (bars[1] + 1)
            self.squad(s, u0, u1, y - 0.025, y + 0.025, 0.045, 'plain', frame)
        if sill:
            self.sbox(s, u0 - 0.14, u1 + 0.14, 0, 0.13, z - 0.1, z - 0.02, 'stone', C['stone3'], skip=(0,))
        if shutters:
            sw = w * 0.46
            for a, b in ((u0 - f - sw, u0 - f), (u1 + f, u1 + f + sw)):
                self.sbox(s, a, b, 0, 0.05, z - 0.02, z + h + 0.02, 'accent', C['white'], skip=(3,))
        if box:
            self.sbox(s, u0 - 0.05, u1 + 0.05, 0.12, 0.34, z - 0.3, z - 0.08, 'wood', C['plank'], skip=(1,))
            cols = [C['red'], C['yellow'], C['pink'], C['cream'], C['blue']]
            n = max(2, int(w / 0.33))
            for i in range(n):
                c = s.p(u0 + w * (i + 0.5) / n, 0.24 + self.r.uniform(-0.03, 0.05), z - 0.02 + self.r.uniform(-0.03, 0.06))
                self.blob(c, 0.15, C['leaf2'] if i % 2 else C['leaf'])
                self.blob(c + UP * 0.1 + s.dw * 0.06, 0.075, self.r.choice(cols))

    def door(self, s, u, w=1.0, h=2.05, col=None, part='accent', canopy=False, arch=False, step=True, lamp=False):
        col = col or C['white']
        u0, u1 = u - w / 2, u + w / 2
        self.squad(s, u0, u1, 0.02, h, 0.03, part, col)
        for i in range(1, 4):  # 板缝
            x = u0 + w * i / 4
            self.squad(s, x - 0.012, x + 0.012, 0.05, h - 0.05, 0.036, 'wood', C['timber'])
        f = 0.1
        for a, b, c, d in ((u0 - f, u1 + f, h, h + f), (u0 - f, u0, 0, h), (u1, u1 + f, 0, h)):
            self.sbox(s, a, b, 0, 0.07, c, d, 'wood', C['timber2'], skip=(0,))
        self.sbox(s, u1 - 0.2, u1 - 0.14, 0.03, 0.08, h * 0.48, h * 0.48 + 0.06, 'plain', C['brass'])
        if step:
            self.sbox(s, u0 - 0.25, u1 + 0.25, 0, 0.55, -0.4, 0.16, 'stone', C['stone2'])
        if canopy:
            a, b = s.p(u0 - 0.35, 0, h + 0.55), s.p(u1 + 0.35, 0, h + 0.55)
            c, d = s.p(u1 + 0.35, 0.8, h + 0.22), s.p(u0 - 0.35, 0.8, h + 0.22)
            self.slab([a, b, c, d], 0.07, 'roof', C['white'])
            for x in (u0 - 0.25, u1 + 0.25):
                self.sbox(s, x - 0.035, x + 0.035, 0, 0.6, h + 0.12, h + 0.2, 'wood', C['timber'])
        if lamp:
            self.sbox(s, u1 + 0.3, u1 + 0.46, 0.05, 0.21, h - 0.25, h + 0.0, 'plain', C['yellow'])
            self.sbox(s, u1 + 0.28, u1 + 0.48, 0.03, 0.23, h, h + 0.05, 'plain', C['iron'])

    def beam(self, s, u0, z0, u1, z1, wide=0.15, col=None, w=0.03):
        """墙上的一根木构件（平的一条，凸出墙面一点）。"""
        a, b = Vector((u0, z0)), Vector((u1, z1))
        d = (b - a).normalized()
        n = Vector((-d.y, d.x)) * wide / 2
        pts = [a - n, b - n, b + n, a + n]
        self.face([s.p(p.x, w, p.y) for p in pts], 'wood', col or C['timber'], s.dw)

    def timber(self, s, z0, z1, bays=3, brace=True, col=None, u0=0.0, u1=None):
        """一面墙的木构架：上下梁、立柱、几根斜撑。"""
        u1 = s.len if u1 is None else u1
        self.beam(s, u0, z0 + 0.08, u1, z0 + 0.08, 0.17, col)
        self.beam(s, u0, z1 - 0.08, u1, z1 - 0.08, 0.17, col)
        for i in range(bays + 1):
            u = u0 + 0.08 + (u1 - u0 - 0.16) * i / bays
            self.beam(s, u, z0, u, z1, 0.15, col)
        if brace:
            w = (u1 - u0) / bays
            for i in (0, bays - 1):
                a, b = u0 + w * i + 0.1, u0 + w * (i + 1) - 0.1
                if i == 0:
                    self.beam(s, a, z0 + 0.12, b, z1 - 0.12, 0.12, col)
                else:
                    self.beam(s, b, z0 + 0.12, a, z1 - 0.12, 0.12, col)

    def chimney(self, x, y, z0, z1, w=0.6, d=0.5, part='stone', col=None, pots=1, lean=0.0):
        col = col or C['brick']
        with self.leaning((x, y, z0), lean * self.r.uniform(-1, 1), lean * self.r.uniform(-1, 1)):
            t = 0.88
            self.hexa([(x - w / 2, y - d / 2, z0), (x + w / 2, y - d / 2, z0), (x + w / 2, y + d / 2, z0), (x - w / 2, y + d / 2, z0),
                       (x - w / 2 * t, y - d / 2 * t, z1), (x + w / 2 * t, y - d / 2 * t, z1), (x + w / 2 * t, y + d / 2 * t, z1), (x - w / 2 * t, y + d / 2 * t, z1)], part, col, skip=(0,))
            self.box(x - w / 2 - 0.05, x + w / 2 + 0.05, y - d / 2 - 0.05, y + d / 2 + 0.05, z1, z1 + 0.1, 'stone', C['stone2'])
            for i in range(pots):
                px = x + (i - (pots - 1) / 2) * 0.26
                self.box(px - 0.09, px + 0.09, y - 0.09, y + 0.09, z1 + 0.1, z1 + 0.42, 'plain', C['terracotta'], skip=(0,))

    def dormer(self, hgt, x, sgn, w=1.15, h=0.95, col=None, wall=('wall', None)):
        """老虎窗：坐在 gable() 的坡面上，朝 sgn 那一侧。"""
        yc, half = hgt.yc, hgt.half
        yf = yc + sgn * half * 0.72
        zb = hgt(x, yf) - 0.05
        yb = yc + sgn * half * 0.1
        rect = (x - w / 2, x + w / 2, min(yf, yb), max(yf, yb))
        wp, wc = wall[0], wall[1] or C['white']
        s = Side(rect, 'front' if sgn < 0 else 'back')
        self.squad(s, 0, w, zb, zb + h, 0, wp, wc)
        for name in ('left', 'right'):
            sd = Side(rect, name)
            self.face([sd.p(0, 0, zb + h), sd.p(sd.len, 0, zb + h), sd.p(sd.len if (name == 'left') == (sgn < 0) else 0, 0, zb)], wp, wc, sd.dw)
        self.window(s, w / 2, zb + 0.18, w * 0.56, h * 0.66, sill=False)
        # 小屋顶：两片，屋脊垂直于大屋脊，往回插进大屋顶里
        rz = zb + h + w * 0.42
        for k in (-1, 1):
            a = (x, yf + sgn * 0.22, rz)
            b = (x, yb, rz)
            c = (x + k * (w / 2 + 0.16), yb, zb + h - 0.06)
            d = (x + k * (w / 2 + 0.16), yf + sgn * 0.22, zb + h - 0.06)
            self.slab([a, b, c, d], 0.08, 'roof', col or C['white'])
        self.face([(x - w / 2, yf, zb + h), (x + w / 2, yf, zb + h), (x, yf, rz - 0.08)], wp, wc, (0, sgn, 0))

    def awning(self, s, u0, u1, z, out=1.1, drop=0.45, stripes=5):
        """布雨棚：一条一条的，颜色一深一浅。"""
        n = stripes
        for i in range(n):
            a, b = u0 + (u1 - u0) * i / n, u0 + (u1 - u0) * (i + 1) / n
            col = C['white'] if i % 2 == 0 else tuple(v * 0.55 for v in C['white'])
            part = 'cloth' if i % 2 == 0 else 'plain'
            col = C['white'] if part == 'cloth' else C['cream']
            self.face([s.p(a, 0.02, z), s.p(b, 0.02, z), s.p(b, out, z - drop), s.p(a, out, z - drop)], part, col, UP + s.dw * 0.3)
            self.face([s.p(a, out, z - drop), s.p(b, out, z - drop), s.p(b, out, z - drop - 0.16), s.p(a, out, z - drop - 0.16)], part, col, s.dw)
        self.face([s.p(u0, 0.02, z - 0.03), s.p(u1, 0.02, z - 0.03), s.p(u1, out, z - drop - 0.03), s.p(u0, out, z - drop - 0.03)], 'plain', tuple(v * 0.8 for v in C['cream']), -UP)
        for u in (u0 + 0.04, u1 - 0.04):
            self.beam_3d(s.p(u, 0.03, z - drop - 0.5), s.p(u, out - 0.04, z - drop - 0.02), 0.03, C['iron'])

    def beam_3d(self, a, b, r, col, part='plain'):
        """空间里的一根细杆（方截面）。"""
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        side = d.cross(UP)
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(d)
        o = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        self.hexa([a + side * r * i + up * r * j for i, j in o] + [b + side * r * i + up * r * j for i, j in o], part, col, skip=(0, 1))

    def sign(self, s, u, z, out=0.9, col=None):
        """挑出来的招牌：铁杆上挂一块木牌。"""
        self.beam_3d(s.p(u, 0, z + 0.62), s.p(u, out, z + 0.62), 0.025, C['iron'])
        self.hexa([s.p(u - 0.03, 0.25, z), s.p(u + 0.03, 0.25, z), s.p(u + 0.03, out - 0.05, z), s.p(u - 0.03, out - 0.05, z),
                   s.p(u - 0.03, 0.25, z + 0.5), s.p(u + 0.03, 0.25, z + 0.5), s.p(u + 0.03, out - 0.05, z + 0.5), s.p(u - 0.03, out - 0.05, z + 0.5)], 'accent', col or C['white'])

    def barrel(self, x, y, r=0.34, h=0.85):
        n = 8
        ring = lambda rr, z: [(x + math.cos(i / n * math.tau) * rr, y + math.sin(i / n * math.tau) * rr, z) for i in range(n)]
        a, b, c = ring(r * 0.86, 0), ring(r, h * 0.5), ring(r * 0.86, h)
        for lo, hi, col in ((a, b, C['plank']), (b, c, C['plank2'])):
            for i in range(n):
                pts = [lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]]
                self.face(pts, 'wood', col, Vector(pts[0]) + Vector(pts[1]) - 2 * Vector((x, y, pts[0][2])))
        self.face(c, 'wood', C['timber2'], UP)

    def crate(self, x, y, s=0.6, z=0.0, rot=0.3):
        with self.turned(x, y, rot):
            self.box(x - s / 2, x + s / 2, y - s / 2, y + s / 2, z, z + s, 'wood', C['plank2'], skip=(0,))

    def bush(self, x, y, r=0.5, flowers=False):
        self.blob((x, y, r * 0.55), r, C['leaf'])
        self.blob((x + r * 0.5, y + r * 0.2, r * 0.42), r * 0.7, C['leaf2'])
        if flowers:
            for i in range(3):
                a = self.r.uniform(0, math.tau)
                self.blob((x + math.cos(a) * r * 0.5, y + math.sin(a) * r * 0.5, r * 0.9), r * 0.2, self.r.choice([C['red'], C['yellow'], C['pink'], C['cream']]))

    def pot(self, x, y, flowers=True):
        self.box(x - 0.17, x + 0.17, y - 0.17, y + 0.17, 0, 0.3, 'plain', C['terracotta'], skip=(0,))
        self.blob((x, y, 0.5), 0.27, C['leaf'])
        if flowers:
            self.blob((x + 0.08, y - 0.05, 0.7), 0.12, self.r.choice([C['red'], C['yellow'], C['pink']]))

    def ivy(self, s, u, z0, z1, spread=1.2):
        """爬在墙上的一片藤：一团团压扁的叶子。"""
        n = int((z1 - z0) * 3.2)
        for i in range(n):
            t = i / max(1, n - 1)
            c = s.p(u + self.r.uniform(-1, 1) * spread * (0.35 + 0.65 * (1 - t)), 0.1, z0 + (z1 - z0) * t + self.r.uniform(-0.2, 0.2))
            self.blob(c, self.r.uniform(0.3, 0.48), self.r.choice([C['leaf'], C['leaf3'], C['leaf2']]), squash=0.9)

    def woodpile(self, s, u0, u1, h=0.9):
        self.sbox(s, u0, u1, 0.02, 0.5, 0, h, 'wood', C['plank'], skip=(0,))
        for i in range(int((u1 - u0) / 0.24)):
            u = u0 + 0.12 + i * 0.24
            self.squad(s, u - 0.09, u + 0.09, h * 0.2, h * 0.92, 0.51, 'wood', C['plank2'] if i % 2 else C['timber2'])

    # ---------------------------------------------------------------- 收尾：影子、导出用的数组
    def bake(self):
        """
        每个面角：位置、法线、颜色（颜料 × 檐下的影子 × 墙根的深色）、表面坐标（米）、部件号、窗号。
        """
        tris, idx = [], []
        for pts, n, part, col, wid in self.faces:
            base = len(tris)
            tris.extend(pts)
            for i in range(1, len(pts) - 1):
                idx.append((base, base + i, base + i + 1))
        tree = BVHTree.FromPolygons(tris, idx, all_triangles=True)
        out = []
        flat = [Vector(d).normalized() for d in ((0, 0, 1), (0.6, 0, 0.8), (-0.6, 0, 0.8), (0, 0.6, 0.8), (0, -0.6, 0.8))]
        REACH = 2.2
        for pts, n, part, col, wid in self.faces:
            ua = UP.cross(n)
            if ua.length < 1e-3:
                ua = Vector((1, 0, 0))
            ua.normalize()
            va = n.cross(ua)
            if abs(n.z) < 0.7:
                h = Vector((n.x, n.y, 0)).normalized()
                sd = Vector((-h.y, h.x, 0))
                rays = [UP, (UP * 0.8 + h * 0.6).normalized(), (UP * 0.8 + h * 0.3 + sd * 0.5).normalized(), (UP * 0.8 + h * 0.3 - sd * 0.5).normalized()]
            else:
                rays = flat
            corner = []
            for p in pts:
                if n.z < -0.6:
                    occ = 1.0
                else:
                    o = p + n * 0.04
                    occ = 0.0
                    for d in rays:
                        hit = tree.ray_cast(o, d, REACH)
                        if hit[0] is not None:
                            occ += 1.0 - hit[3] / REACH
                    occ /= len(rays)
                shade = min(1.0, occ * 1.5) * 0.55
                if part in (PART['wall'], PART['stone'], PART['wood']) and abs(n.z) < 0.5:
                    shade = max(shade, 0.24 * max(0.0, 1.0 - p.z / 0.5))
                k = Vector((1, 1, 1)).lerp(SHADOW, shade)
                c = (col[0] * k.x, col[1] * k.y, col[2] * k.z)
                corner.append((p, n, c, (p.dot(ua), p.dot(va)), part, wid))
            for i in range(1, len(corner) - 1):
                out.extend((corner[0], corner[i], corner[i + 1]))
        return out
