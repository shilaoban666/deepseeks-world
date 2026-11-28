"""v2 精模库：在 v1 的 Model 上加"精加工"构件。

设计原则（吉卜力 / 煤炭镇）：
  · 没有一个平面是裸的——墙有压顶线脚、勒脚、板缝；屋顶有瓦垄、椽头、封檐板、檐沟
  · 门窗是"装上去"的：框、中挺、横档、窗台、窗帘、花箱、门灯、门槛、雨搭
  · 小件也做结构：抽屉有拉手、柜门有合页、椅子有横撑、车轮有辐条
  · 颜色低饱和暖调，材质靠 Principled 基础色分开（无贴图）
"""
import bpy
import bmesh
import math
from mathutils import Vector

from lib import Model, P, ROOF_KEYS

TAU = math.tau


class Model2(Model):
    """带精加工构件的建模器。"""

    # ------------------------------------------------------------ 线脚 / 板缝
    def moulding(self, w, d, z, thick=0.08, out=0.05, mat_key='wood_light', around=True):
        """沿墙一圈的线脚（压顶、腰线、勒脚）。"""
        m = self.m(mat_key)
        self.box((w + out * 2, d + out * 2, thick), (0, 0, z), mat=m, bevel=thick * 0.28, seg=2)
        if around:
            self.box((w + out * 2.6, d + out * 2.6, thick * 0.45), (0, 0, z - thick * 0.55),
                     mat=self.m('stone_warm'), bevel=thick * 0.2)

    def plank_lines(self, w, h, at, n=8, mat_key='wood_dark', thick=0.02, axis='y'):
        """水平板缝（木板墙）。"""
        m = self.m(mat_key)
        for i in range(1, n):
            z = at[2] - h / 2 + h * i / n
            if axis == 'y':
                self.box((w, thick, thick * 0.8), (at[0], at[1], z), mat=m, bevel=thick * 0.3)
            else:
                self.box((thick, w, thick * 0.8), (at[0], at[1], z), mat=m, bevel=thick * 0.3)

    def courses(self, w, d, z0, z1, mat_key='stone_dark', rows=6, axis='y'):
        """砌体层理线（石墙/砖墙），带错缝。"""
        m = self.m(mat_key)
        for i in range(rows):
            z = z0 + (z1 - z0) * (i + 0.5) / rows
            self.box((w + 0.02, 0.035, 0.045), (0, -d / 2 - 0.015, z), mat=m, bevel=0.006)
            off = 0.5 if i % 2 else 0.0
            for k in range(3):
                x = -w / 2 + w * ((k + off) / 3)
                if abs(x) < w / 2 - 0.1:
                    self.box((0.03, 0.05, (z1 - z0) / rows * 0.9), (x, -d / 2 - 0.02, z), mat=m, bevel=0.004)

    # ------------------------------------------------------------ 屋顶
    def tile_roof(self, w, d, rise, at_z, roof_key='red', overhang=0.6,
                  rafter=True, gutter=True, upturn=0.12):
        """双坡瓦屋顶：一片一片的瓦 + 屋脊 + 椽头 + 封檐板 + 檐沟。"""
        rm = self.m(ROOF_KEYS.get(roof_key, roof_key))
        em = self.m('wood_dark')
        dm = self.m('roof_slate' if roof_key in ('grey', 'slate') else 'wood_mid')
        half = d / 2 + overhang
        nrow = max(6, int(half / 0.34))          # 顺着坡向的瓦行数
        for side in (-1, 1):
            # 望板（底板）
            rows = []
            for i in range(nrow + 1):
                t = i / nrow
                z = at_z + rise * (1 - t) ** 1.4 + upturn * (t ** 3)
                rows.append([Vector((-w / 2 - overhang, side * half * t, z)),
                             Vector((w / 2 + overhang, side * half * t, z))])
            self.quad_strip(rows, mat=dm, smooth=False)
            # 一片一片的筒瓦：每行沿檐口方向排瓦，瓦是半圆小条
            tile_w = 0.26
            cnt = max(6, int((w + 2 * overhang) / tile_w))
            for k in range(cnt):
                x = -(w / 2 + overhang) + (w + 2 * overhang) * (k + 0.5) / cnt
                strip = []
                for i in range(nrow + 1):
                    t = i / nrow
                    z = at_z + rise * (1 - t) ** 1.4 + upturn * (t ** 3)
                    y = side * half * t
                    strip.append(Vector((x, y, z + 0.012)))
                prev = None
                for i in range(nrow):
                    t = i / nrow
                    z = at_z + rise * (1 - t) ** 1.4 + upturn * (t ** 3)
                    y = side * half * t
                    z2 = at_z + rise * (1 - (i + 1) / nrow) ** 1.4 + upturn * (((i + 1) / nrow) ** 3)
                    y2 = side * half * (i + 1) / nrow
                    r = tile_w * 0.5
                    # 断面用三个点做出"拱形瓦"
                    p0 = Vector((x - r, y, z + 0.002))
                    p1 = Vector((x, y, z + 0.055))
                    p2 = Vector((x + r, y, z + 0.002))
                    q0 = Vector((x - r, y2, z2 + 0.002))
                    q1 = Vector((x, y2, z2 + 0.055))
                    q2 = Vector((x + r, y2, z2 + 0.002))
                    self.quad_strip([[p0, p1], [q0, q1]], mat=rm, smooth=True)
                    self.quad_strip([[p1, p2], [q1, q2]], mat=rm, smooth=True)
            # 檐口封边 + 椽头
            eave_z = at_z + upturn
            self.box((w + 2 * overhang, 0.1, 0.16), (0, side * half, eave_z - 0.06),
                     mat=em, bevel=0.02)
            if rafter:
                cnt2 = max(5, int((w + 2 * overhang) / 0.55))
                for k in range(cnt2):
                    x = -(w / 2 + overhang) + (w + 2 * overhang) * (k + 0.5) / cnt2
                    self.box((0.075, 0.5, 0.09), (x, side * (half - 0.24), eave_z - 0.14),
                             mat=self.m('wood_mid'), bevel=0.008)
            if gutter:
                self.cyl(0.075, w + 2 * overhang, (0, side * (half + 0.02), eave_z - 0.16),
                         rot=(0, 90, 0), mat=self.m('metal_dark'), seg=10, bevel=0.0)
        # 屋脊瓦
        self.box((w + 2 * overhang + 0.06, 0.3, 0.16), (0, 0, at_z + rise + 0.06), mat=em, bevel=0.03)
        for k in range(max(3, int((w + 2 * overhang) / 0.5))):
            x = -(w / 2 + overhang) + (w + 2 * overhang) * (k + 0.5) / max(3, int((w + 2 * overhang) / 0.5))
            self.cyl(0.09, 0.34, (x, 0, at_z + rise + 0.14), rot=(90, 0, 0), mat=rm, seg=8, bevel=0.006)

    # ------------------------------------------------------------ 门窗
    def window_dressed(self, cx, cy, cz, w=0.9, h=1.1, nx=0, ny=-1,
                       frame='wood_dark', glass='glass_warm', curtain=True,
                       flower=False, lamp=False, shutters=True, transom=True):
        """装好的窗：框 + 中挺 + 横档 + 气窗 + 窗台 + 窗帘 + 花箱 + 窗灯 + 百叶。"""
        fm = self.m(frame)
        gm = self.m(glass, rough=0.22)
        tm = self.m('wood_dark')
        if ny:
            def B(sx, sy, sz, px, py, pz, mat, bev=0.008):
                self.box((sx, sy, sz), (cx + px, cy + py, cz + pz), mat=mat, bevel=bev)
            B(w, 0.03, h, 0, 0, 0, gm, 0.0)
            B(w + 0.18, 0.1, 0.09, 0, ny * 0.02, h / 2, fm)
            B(w + 0.18, 0.1, 0.09, 0, ny * 0.02, -h / 2, fm)
            B(0.09, 0.1, h, -w / 2, ny * 0.02, 0, fm)
            B(0.09, 0.1, h, w / 2, ny * 0.02, 0, fm)
            B(0.05, 0.09, h, 0, ny * 0.04, 0, tm, 0.005)
            B(w, 0.09, 0.05, 0, ny * 0.04, 0, tm, 0.005)
            if transom:
                B(w, 0.09, 0.05, 0, ny * 0.04, h * 0.32, tm, 0.005)
            # 窗台石 + 滴水线
            B(w + 0.34, 0.24, 0.09, 0, ny * 0.1, -h / 2 - 0.12, self.m('stone_warm'), 0.014)
            B(w + 0.26, 0.1, 0.05, 0, ny * 0.06, -h / 2 - 0.19, self.m('stone'), 0.008)
            if curtain:
                for s in (-1, 1):
                    B(w * 0.3, 0.02, h * 0.86, s * w * 0.3, ny * 0.06, 0, self.m('fabric_cream'), 0.004)
            if shutters:
                for s in (-1, 1):
                    B(0.07, 0.09, h * 1.02, s * (w / 2 + 0.26), ny * 0.03, 0, self.m('fabric_green'))
                    for k in range(3):
                        B(0.05, 0.02, 0.03, s * (w / 2 + 0.26), ny * 0.09,
                          -h * 0.32 + k * h * 0.32, tm, 0.004)
            if flower:
                self.box((w * 1.05, 0.24, 0.26), (cx, cy + ny * 0.18, cz - h / 2 - 0.34),
                         mat=self.m('wood_mid'), bevel=0.02)
                for k in range(int(w / 0.28) + 1):
                    fx = cx - w * 0.45 + w * 0.9 * k / max(1, int(w / 0.28))
                    self.sphere(0.1, (fx, cy + ny * 0.18, cz - h / 2 - 0.18),
                                mat=self.m('leaf_light' if k % 2 else 'leaf'), seg=8, ring=5)
                    self.sphere(0.07, (fx + 0.03, cy + ny * 0.22, cz - h / 2 - 0.06),
                                mat=self.m(['fabric_red', 'wall_pink', 'fabric_cream'][k % 3]), seg=8, ring=5)
            if lamp:
                B(0.14, 0.2, 0.26, 0, ny * 0.12, h / 2 + 0.3, self.m('glow', emit=1.0, emit_strength=2.0), 0.02)
                B(0.06, 0.06, 0.16, 0, ny * 0.06, h / 2 + 0.18, self.m('metal_dark'), 0.006)
        else:
            def B(sx, sy, sz, px, py, pz, mat, bev=0.008):
                self.box((sx, sy, sz), (cx + px, cy + py, cz + pz), mat=mat, bevel=bev)
            B(0.03, w, h, 0, 0, 0, gm, 0.0)
            B(0.1, w + 0.18, 0.09, nx * 0.02, 0, h / 2, fm)
            B(0.1, w + 0.18, 0.09, nx * 0.02, 0, -h / 2, fm)
            B(0.1, 0.09, h, nx * 0.02, -w / 2, 0, fm)
            B(0.1, 0.09, h, nx * 0.02, w / 2, 0, fm)
            B(0.09, 0.05, h, nx * 0.04, 0, 0, tm, 0.005)
            B(0.09, w, 0.05, nx * 0.04, 0, 0, tm, 0.005)
            B(0.24, w + 0.34, 0.09, nx * 0.1, 0, -h / 2 - 0.12, self.m('stone_warm'), 0.014)
            if shutters:
                for s in (-1, 1):
                    B(0.09, 0.07, h * 1.02, nx * 0.03, s * (w / 2 + 0.26), 0, self.m('fabric_green'))

    def door_dressed(self, at, w=1.0, h=2.05, axis='y', mat_key='wood_mid',
                     arched=False, noren=False, lantern=True, step=True, canopy=True):
        """装好的门：门套 + 门板 + 五金 + 门槛 + 雨搭 + 门灯 + 暖帘。"""
        m = self.m(mat_key)
        dm = self.m('wood_dark')
        x, y, z = at
        t = 0.13
        if axis == 'y':
            self.box((w, t, h), (x, y, z + h / 2), mat=m, bevel=0.016)
            for i in range(4):
                self.box((w * 0.2, 0.03, h * 0.9), (x - w * 0.36 + i * w * 0.24, y - t / 2 - 0.02, z + h / 2),
                         mat=dm, bevel=0.006)
            for zz in (h * 0.28, h * 0.72):
                self.box((w * 0.9, 0.03, 0.06), (x, y - t / 2 - 0.03, z + zz), mat=dm, bevel=0.006)
            self.box((w + 0.24, 0.12, 0.14), (x, y - 0.04, z + h + 0.02), mat=dm, bevel=0.014)
            for s in (-1, 1):
                self.box((0.1, 0.12, h + 0.1), (x + s * (w / 2 + 0.06), y - 0.03, z + h / 2), mat=dm, bevel=0.01)
            self.sphere(0.05, (x + w * 0.36, y - 0.1, z + h * 0.46), mat=self.m('gold'), seg=10, ring=6)
            self.box((0.09, 0.05, 0.22), (x + w * 0.3, y - 0.1, z + h * 0.46), mat=self.m('metal_dark'), bevel=0.006)
            if arched:
                self.box((w + 0.34, 0.14, 0.18), (x, y - 0.03, z + h + 0.12), mat=self.m('stone_warm'), bevel=0.03)
            if step:
                self.box((w + 0.44, 0.42, 0.1), (x, y - 0.12, z + 0.05), mat=self.m('stone_warm'), bevel=0.014)
                self.box((w + 0.32, 0.3, 0.06), (x, y - 0.1, z + 0.13), mat=self.m('stone'), bevel=0.01)
            if canopy:
                self.box((w + 0.5, 0.7, 0.08), (x, y - 0.4, z + h + 0.42), rot=(10, 0, 0),
                         mat=self.m('roof_teal'), bevel=0.02)
                for s in (-1, 1):
                    self.box((0.06, 0.06, 0.36), (x + s * (w / 2 + 0.18), y - 0.3, z + h + 0.2),
                             rot=(28, 0, 0), mat=dm, bevel=0.008)
            if lantern:
                for s in (-1, 1):
                    self.box((0.12, 0.16, 0.2), (x + s * (w / 2 + 0.3), y - 0.12, z + h + 0.12),
                             mat=self.m('glow', emit=1.0, emit_strength=2.0), bevel=0.02)
            if noren:
                for i in range(3):
                    self.box((w * 0.3, 0.02, h * 0.42), (x - w * 0.33 + i * w * 0.33,
                             y - t / 2 - 0.1, z + h * 0.62), mat=self.m('fabric_blue'), bevel=0.004)

    # ------------------------------------------------------------ 店铺
    def awning_scallop(self, w, depth, at, mat_key='fabric_red', stripe='fabric_cream', rot=0):
        """带波浪垂边的雨棚。"""
        fm = self.m(mat_key)
        cm = self.m(stripe)
        x, y, z = at
        n = 8
        rows = []
        for i in range(n + 1):
            t = i / n
            rows.append([Vector((x - w / 2, y - depth * t, z + 0.16 * t - 0.18 * depth * t * t)),
                         Vector((x + w / 2, y - depth * t, z + 0.16 * t - 0.18 * depth * t * t))])
        self.quad_strip(rows, mat=fm, smooth=True)
        # 垂边：一排半圆
        cnt = max(4, int(w / 0.42))
        for k in range(cnt):
            xx = x - w / 2 + w * (k + 0.5) / cnt
            yy = y - depth
            zz = z + 0.16 - 0.18 * depth
            self.cyl(w / cnt * 0.42, 0.04, (xx, yy, zz - 0.09), rot=(0, 90, 0), mat=cm, seg=8, bevel=0.0)
        # 条纹
        for k in range(0, cnt, 2):
            xx = x - w / 2 + w * (k + 0.5) / cnt
            self.box((w / cnt * 0.5, depth * 0.96, 0.015),
                     (xx, y - depth * 0.5, z + 0.08 - 0.045 * depth), rot=(11, 0, 0), mat=cm, bevel=0.003)
        for s in (-1, 1):
            self.cyl(0.028, depth, (x + s * w / 2 * 0.94, y - depth / 2, z - 0.1),
                     rot=(90, 0, 0), mat=self.m('metal_dark'), seg=8, bevel=0.0)

    def hanging_sign(self, at, w=0.9, h=0.5, mat_key='wood_light', arm=0.9, emblem=None):
        """挑出去的招牌：铁艺挑臂 + 双面牌 + 吊环。"""
        x, y, z = at
        bm = self.m(mat_key)
        mm = self.m('metal_dark')
        self.box((0.07, 0.07, 0.5), (x, y, z + 0.3), mat=mm, bevel=0.008)
        self.box((0.06, arm, 0.06), (x, y - arm / 2, z + 0.5), mat=mm, bevel=0.008)
        self.box((0.06, 0.06, 0.3), (x, y - arm + 0.05, z + 0.36), mat=mm, bevel=0.006)
        for s in (-1, 1):
            self.box((w, 0.06, h), (x, y - arm + 0.05, z + 0.05), mat=bm, bevel=0.018)
        for s in (-1, 1):
            self.cyl(0.02, 0.16, (x + s * w * 0.34, y - arm + 0.05, z + 0.32), mat=mm, seg=6, bevel=0.0)
        self.box((w + 0.06, 0.08, 0.05), (x, y - arm + 0.05, z + 0.28), mat=mm, bevel=0.008)
        if emblem == 'cup':
            self.cyl(0.09, 0.12, (x, y - arm + 0.09, z + 0.06), mat=self.m('white'), seg=10)
        elif emblem == 'bread':
            self.sphere(0.1, (x, y - arm + 0.09, z + 0.04), mat=self.m('roof_straw'), seg=10, ring=6,
                        scale=(1.3, 0.6, 0.8))
        elif emblem == 'fish':
            self.sphere(0.1, (x, y - arm + 0.09, z + 0.04), mat=self.m('wall_ash'), seg=10, ring=6,
                        scale=(1.6, 0.5, 0.8))
        elif emblem == 'flower':
            for k in range(3):
                self.sphere(0.06, (x - 0.1 + k * 0.1, y - arm + 0.09, z + 0.05),
                            mat=self.m(['fabric_red', 'wall_pink', 'gold'][k]), seg=8, ring=5)

    def noren(self, at, w=1.4, h=0.7, mat_key='fabric_blue'):
        x, y, z = at
        m = self.m(mat_key)
        for i in range(3):
            self.box((w * 0.3, 0.02, h), (x - w * 0.33 + i * w * 0.33, y, z), mat=m, bevel=0.004)
        self.cyl(0.025, w, (x, y, z + h / 2 + 0.03), rot=(0, 90, 0), mat=self.m('wood_dark'), seg=8)

    # ------------------------------------------------------------ 小件结构
    def drawer_front(self, w, h, at, mat_key='wood_light', axis='y', pulls=1):
        """带拉手的抽屉面。"""
        x, y, z = at
        m = self.m(mat_key)
        if axis == 'y':
            self.box((w, 0.04, h), (x, y, z), mat=m, bevel=0.008)
            self.box((w * 0.9, 0.02, 0.02), (x, y - 0.03, z + h * 0.32), mat=self.m('wood_dark'), bevel=0.004)
            for k in range(pulls):
                px = x - w * 0.3 + w * 0.6 * k / max(1, pulls - 1) if pulls > 1 else x
                self.cyl(0.018, 0.1, (px, y - 0.06, z), rot=(90, 0, 0), mat=self.m('gold'), seg=8, bevel=0.0)
        else:
            self.box((0.04, w, h), (x, y, z), mat=m, bevel=0.008)
            self.cyl(0.018, 0.1, (x - 0.06, y, z), rot=(0, 90, 0), mat=self.m('gold'), seg=8, bevel=0.0)

    def legs4(self, w, d, h, at=(0, 0, 0), r=0.045, mat_key='wood_dark', turned=True, brace=True):
        """四条腿 + 横撑；turned 时做出车木的鼓段。"""
        m = self.m(mat_key)
        for sx in (-1, 1):
            for sy in (-1, 1):
                px = at[0] + sx * (w / 2 - r * 1.6)
                py = at[1] + sy * (d / 2 - r * 1.6)
                if turned:
                    self.cyl(r, h * 0.34, (px, py, at[2] + h * 0.17), mat=m, seg=10, bevel=0.004)
                    self.cyl(r * 1.5, h * 0.16, (px, py, at[2] + h * 0.42), mat=m, seg=10, bevel=0.004)
                    self.cyl(r, h * 0.42, (px, py, at[2] + h * 0.71), mat=m, seg=10, bevel=0.004)
                else:
                    self.box((r * 2, r * 2, h), (px, py, at[2] + h / 2), mat=m, bevel=0.006)
        if brace:
            for sy in (-1, 1):
                self.box((w - r * 4, 0.035, 0.035), (at[0], at[1] + sy * (d / 2 - r * 1.6), at[2] + h * 0.24),
                         mat=m, bevel=0.004)
            for sx in (-1, 1):
                self.box((0.035, d - r * 4, 0.035), (at[0] + sx * (w / 2 - r * 1.6), at[1], at[2] + h * 0.24),
                         mat=m, bevel=0.004)

    def cushion(self, w, d, h, at, mat_key='fabric_cream'):
        self.box((w, d, h), at, mat=self.m(mat_key), bevel=min(h * 0.45, 0.05), seg=3)
        self.box((w * 0.86, d * 0.86, h * 0.3), (at[0], at[1], at[2] + h * 0.32),
                 mat=self.m('white'), bevel=h * 0.12)

    def books_row(self, w, h, at, axis='y', count=9):
        for i in range(count):
            bh = h * (0.7 + 0.3 * ((i * 7) % 5) / 4)
            bt = w / count * 0.8
            off = -w / 2 + w * (i + 0.5) / count
            key = ['fabric_red', 'fabric_blue', 'fabric_green', 'wall_pink', 'gold', 'wood_mid'][i % 6]
            if axis == 'y':
                self.box((bt, 0.2, bh), (at[0] + off, at[1], at[2] + bh / 2), mat=self.m(key), bevel=0.006)
            else:
                self.box((0.2, bt, bh), (at[0], at[1] + off, at[2] + bh / 2), mat=self.m(key), bevel=0.006)

    def wheel_spoked(self, r, at, mat_key='wood_dark', spokes=8, rim_key='metal_dark'):
        x, y, z = at
        m = self.m(mat_key)
        self.cyl(r, 0.06, (x, y, z), rot=(90, 0, 0), mat=self.m(rim_key), seg=20, bevel=0.004)
        self.cyl(r * 0.86, 0.09, (x, y, z), rot=(90, 0, 0), mat=m, seg=20, bevel=0.004)
        for i in range(spokes):
            a = TAU * i / spokes
            self.box((r * 0.9, 0.03, 0.03), (x, y, z), rot=(0, 0, 0), mat=m, bevel=0.004)
            # 用旋转表达辐条方向
        self.cyl(r * 0.18, 0.12, (x, y, z), rot=(90, 0, 0), mat=self.m('metal_dark'), seg=10, bevel=0.004)

    def canopy_truss(self, w, d, z, mat_key='metal_dark', posts=4):
        """站台雨棚：立柱 + 桁架 + 檩条。"""
        m = self.m(mat_key)
        for i in range(posts):
            x = -w / 2 + w * i / (posts - 1) if posts > 1 else 0
            for sy in (-1, 1):
                self.cyl(0.1, z, (x, sy * d * 0.4, z / 2), mat=m, seg=10, bevel=0.004)
        for sy in (-1, 1):
            self.box((w, 0.1, 0.14), (0, sy * d * 0.4, z - 0.06), mat=m, bevel=0.01)
        span = w / max(1, posts - 1)
        for i in range(posts - 1):
            x0 = -w / 2 + w * i / (posts - 1)
            for sy in (-1, 1):
                self.box((span * 0.98, 0.05, 0.05),
                         (x0 + span / 2, sy * d * 0.4, z - 0.3), rot=(0, 0, 0), mat=m, bevel=0.006)
                self.box((span * 1.02, 0.04, 0.04), (x0 + span / 2, sy * d * 0.4, z - 0.16),
                         rot=(0, math.degrees(math.atan2(0.28, span)) * 0.9, 0), mat=m, bevel=0.004)
        for k in range(max(5, int(w / 0.8))):
            x = -w / 2 + w * (k + 0.5) / max(5, int(w / 0.8))
            self.box((0.05, d, 0.05), (x, 0, z - 0.02), mat=m, bevel=0.004)

    def leaf_scatter(self, at, r=0.5, mat_key='leaf', n=6, flat=0.7):
        """一丛叶子（用扁球做团块，比单球更像树冠）。"""
        x, y, z = at
        for i in range(n):
            a = TAU * i / n + 0.4
            rr = r * (0.55 + 0.45 * ((i * 3) % 4) / 3)
            self.sphere(r * 0.62, (x + math.cos(a) * rr * 0.7, y + math.sin(a) * rr * 0.7,
                                  z + r * 0.2 * ((i % 3) - 1)),
                        mat=self.m(mat_key if i % 3 else ('leaf_light' if mat_key == 'leaf' else mat_key)),
                        seg=10, ring=6, scale=(1, 1, flat))
        self.sphere(r * 0.8, (x, y, z + r * 0.35), mat=self.m(mat_key), seg=12, ring=7, scale=(1, 1, flat))
    # ------------------------------------------------------------ 生物体（鸟 / 鱼）
    def loft_rings(self, rings, mat=0, mat_top=None, mat_bottom=None, cut=0.0,
                   smooth=True, cap_start=True, cap_end=True):
        """把一串闭合截面环放样成体。mat_top/mat_bottom 做反荫蔽（背深腹浅）。"""
        tmp = bmesh.new()
        vs = [[tmp.verts.new(p) for p in r] for r in rings]
        n = len(rings[0])
        cz = sum(p.z for r in rings for p in r) / (len(rings) * n)
        for i in range(len(vs) - 1):
            for j in range(n):
                k = (j + 1) % n
                quad = (vs[i][j], vs[i][k], vs[i + 1][k], vs[i + 1][j])
                key = {(round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5)) for v in quad}
                if len(key) < 3:
                    continue
                if len(key) == 3:
                    uniq = []
                    for v in quad:
                        if (round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5)) not in [
                                (round(u.co.x, 5), round(u.co.y, 5), round(u.co.z, 5)) for u in uniq]:
                            uniq.append(v)
                    try:
                        f = tmp.faces.new(uniq)
                    except ValueError:
                        continue
                else:
                    try:
                        f = tmp.faces.new(quad)
                    except ValueError:
                        continue
                zc = sum(v.co.z for v in f.verts) / len(f.verts)
                if mat_top is not None and zc > cz + cut:
                    f.material_index = mat_top
                elif mat_bottom is not None and zc <= cz + cut:
                    f.material_index = mat_bottom
                else:
                    f.material_index = mat
                f.smooth = smooth
        if cap_start:
            try:
                tmp.faces.new(list(reversed(vs[0])))
            except ValueError:
                pass
        if cap_end:
            try:
                tmp.faces.new(vs[-1])
            except ValueError:
                pass
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        me = bpy.data.meshes.new('_loft')
        tmp.to_mesh(me)
        tmp.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    def ring(self, cx, cy, cz, ry, rz, n=18, flat_bottom=0.0):
        """椭圆截面环（YZ 平面，沿 X 放样）。flat_bottom 把底部压平（贴地的鸟腹）。"""
        pts = []
        for i in range(n):
            a = TAU * i / n
            y = cy + math.cos(a) * ry
            z = cz + math.sin(a) * rz
            if flat_bottom and z < cz - rz * (1 - flat_bottom):
                z = cz - rz * (1 - flat_bottom)
            pts.append(Vector((cx, y, z)))
        return pts

    def feather(self, root, direction, length, width, mat=0, curve=0.2,
                up=Vector((0, 0, 1)), segs=5):
        """一根羽毛：锥形弧面片（不是平面片，带一点弯曲）。"""
        root = Vector(root)
        d = Vector(direction).normalized()
        u = Vector(up).normalized()
        side = d.cross(u)
        if side.length < 1e-6:
            side = d.cross(Vector((0, 1, 0)))
        side.normalize()
        rows = []
        for i in range(segs + 1):
            t = i / segs
            p = root + d * (length * t) + u * (curve * length * t * t)
            w = width * (1.0 - 0.88 * t) * (0.55 if i == 0 else 1.0)
            rows.append([p - side * w, p + side * w])
        self.quad_strip(rows, mat=mat, smooth=True)

    def blade(self, root, tip, base_w, mat=0, curve=0.0, up=Vector((0, 0, 1)), swell=0.35):
        """一片鳍/大羽：从根部到尖端的锥形面，中间略外凸。"""
        r = Vector(root)
        t = Vector(tip)
        d = (t - r)
        ln = d.length
        d = d.normalized()
        u = Vector(up).normalized()
        side = d.cross(u)
        if side.length < 1e-6:
            side = d.cross(Vector((0, 1, 0)))
        side.normalize()
        rows = []
        segs = 6
        for i in range(segs + 1):
            f = i / segs
            p = r + d * (ln * f) + u * (curve * ln * f * f)
            w = base_w * (1.0 - 0.92 * f) * (1.0 + swell * math.sin(math.pi * f))
            rows.append([p - side * max(w, 0.002), p + side * max(w, 0.002)])
        self.quad_strip(rows, mat=mat, smooth=True)

    def eye(self, at, r=0.03, iris='ink', pupil='ink', spec='white'):
        x, y, z = at
        self.sphere(r, (x, y, z), mat=self.m(iris), seg=12, ring=8)
        self.sphere(r * 0.62, (x + r * 0.55, y, z), mat=self.m(pupil), seg=10, ring=6)
        self.sphere(r * 0.22, (x + r * 0.95, y - r * 0.2, z + r * 0.35),
                    mat=self.m(spec), seg=8, ring=5)
