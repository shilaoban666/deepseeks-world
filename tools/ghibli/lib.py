"""宫崎骏 / 煤炭镇 手绘水粉风格的参数化建模库。

只用 bmesh + bpy.data，不依赖 GUI context（可直接 blender -b 跑）。
每个模型 = 一个物体 + 多个材质槽，face.material_index 决定材质。
"""
import bpy
import bmesh
import math
from mathutils import Vector, Euler

TAU = math.tau

# ---------------------------------------------------------------- 调色板
# 低饱和、偏暖、像水粉：宫崎骏的墙面是米黄/灰粉/鼠尾草绿，屋顶是陶土红/青灰
P = {
    'wall_cream':  (0.921, 0.870, 0.760),
    'wall_butter': (0.945, 0.878, 0.700),
    'wall_pink':   (0.898, 0.780, 0.720),
    'wall_sage':   (0.788, 0.827, 0.740),
    'wall_blue':   (0.760, 0.827, 0.855),
    'wall_ash':    (0.855, 0.843, 0.820),
    'wood_dark':   (0.372, 0.262, 0.184),
    'wood_mid':    (0.560, 0.392, 0.262),
    'wood_light':  (0.720, 0.564, 0.392),
    'roof_red':    (0.690, 0.360, 0.290),
    'roof_teal':   (0.302, 0.443, 0.451),
    'roof_grey':   (0.443, 0.463, 0.475),
    'roof_blue':   (0.353, 0.427, 0.560),
    'roof_straw':  (0.780, 0.667, 0.435),
    'roof_slate':  (0.376, 0.400, 0.420),
    'stone':       (0.647, 0.627, 0.588),
    'stone_warm':  (0.706, 0.663, 0.588),
    'stone_dark':  (0.478, 0.463, 0.443),
    'plaster':     (0.902, 0.871, 0.804),
    'glass':       (0.510, 0.647, 0.667),
    'glass_warm':  (0.780, 0.729, 0.588),
    'metal':       (0.373, 0.384, 0.400),
    'metal_dark':  (0.255, 0.263, 0.275),
    'fabric_red':  (0.729, 0.318, 0.271),
    'fabric_cream':(0.925, 0.878, 0.780),
    'fabric_green':(0.435, 0.533, 0.408),
    'fabric_blue': (0.400, 0.494, 0.596),
    'leaf':        (0.353, 0.475, 0.298),
    'leaf_light':  (0.510, 0.616, 0.376),
    'leaf_dark':   (0.263, 0.365, 0.243),
    'terracotta':  (0.741, 0.451, 0.318),
    'glow':        (1.000, 0.878, 0.588),
    'water':       (0.400, 0.553, 0.596),
    'ink':         (0.180, 0.180, 0.196),
    'white':       (0.961, 0.945, 0.910),
    'snow':        (0.949, 0.957, 0.973),
    'soil':        (0.435, 0.353, 0.263),
    'brick':       (0.667, 0.478, 0.384),
    'gold':        (0.808, 0.667, 0.325),
}

ROOF_KEYS = {
    'red': 'roof_red', 'teal': 'roof_teal', 'grey': 'roof_grey',
    'blue': 'roof_blue', 'straw': 'roof_straw', 'slate': 'roof_slate',
}


class Model:
    """累加式建模器：所有部件合并成一个带多材质槽的网格。"""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.verify()
        self.mats = []
        self._idx = {}

    # ---------------------------------------------------------- 材质
    def mat(self, key, rough=0.8, metal=0.0, emit=0.0, emit_strength=0.0):
        if key in self._idx:
            return self._idx[key]
        i = len(self.mats)
        self.mats.append((key, rough, metal, emit, emit_strength))
        self._idx[key] = i
        return i

    def m(self, key, **kw):
        return self.mat(key, **kw)

    # ---------------------------------------------------------- 内部
    def _finish(self, tmp, mat_idx, smooth, bevel, seg):
        if bevel > 0:
            geom = list(tmp.edges)
            if geom:
                bmesh.ops.bevel(
                    tmp, geom=geom, offset=bevel, offset_type='OFFSET',
                    segments=seg, profile=0.62, affect='EDGES',
                    clamp_overlap=True, loop_slide=True,
                )
        # 倒角在薄板上可能挤出零面积面：统一清一次
        try:
            bmesh.ops.dissolve_degenerate(tmp, dist=1e-5, edges=tmp.edges)
        except Exception:
            pass
        for f in tmp.faces:
            f.material_index = mat_idx
            f.smooth = smooth
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        me = bpy.data.meshes.new('_tmpmesh')
        tmp.to_mesh(me)
        tmp.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    @staticmethod
    def _xform(tmp, at, rot, scale=None):
        if scale:
            bmesh.ops.scale(tmp, vec=Vector(scale), verts=tmp.verts)
        if rot and any(abs(r) > 1e-9 for r in rot):
            mx = Euler((math.radians(rot[0]), math.radians(rot[1]),
                        math.radians(rot[2])), 'XYZ').to_matrix().to_4x4()
            bmesh.ops.transform(tmp, matrix=mx, verts=tmp.verts)
        if at and any(abs(a) > 1e-9 for a in at):
            bmesh.ops.translate(tmp, vec=Vector(at), verts=tmp.verts)

    # ---------------------------------------------------------- 基本体
    def box(self, size, at=(0, 0, 0), rot=(0, 0, 0), mat=0,
            bevel=0.012, seg=2, smooth=False):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=Vector(size), verts=tmp.verts)
        self._xform(tmp, at, rot)
        self._finish(tmp, mat, smooth, bevel, seg)

    def cyl(self, r, h, at=(0, 0, 0), rot=(0, 0, 0), mat=0,
            r2=None, seg=20, bevel=0.006, smooth=True):
        tmp = bmesh.new()
        bmesh.ops.create_cone(
            tmp, cap_ends=True, cap_tris=False, segments=seg,
            radius1=r, radius2=(r if r2 is None else r2), depth=h,
        )
        self._xform(tmp, at, rot)
        self._finish(tmp, mat, smooth, bevel, 2)

    def sphere(self, r, at=(0, 0, 0), mat=0, seg=16, ring=10, scale=None, smooth=True):
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=seg, v_segments=ring, radius=r)
        self._xform(tmp, at, (0, 0, 0), scale=scale)
        self._finish(tmp, mat, smooth, 0.0, 0)

    def prism(self, pts, height, at=(0, 0, 0), rot=(0, 0, 0), mat=0, bevel=0.008):
        """pts: [(x,y), ...] 逆时针闭合轮廓；沿 +Z 抬起 height。"""
        tmp = bmesh.new()
        vs = [tmp.verts.new((x, y, 0.0)) for x, y in pts]
        tmp.verts.ensure_lookup_table()
        face = tmp.faces.new(vs)
        ext = bmesh.ops.extrude_face_region(tmp, geom=[face])
        up = [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(tmp, vec=Vector((0, 0, height)), verts=up)
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        self._xform(tmp, at, rot)
        self._finish(tmp, mat, False, bevel, 2)

    def quad_strip(self, rows, mat=0, smooth=True, thickness=0.0):
        """rows: [[Vector, ...], ...] 生成网格面（用于曲面屋顶/帆）。
        退化面（相邻点重合）直接跳过，避免零面积三角。"""
        tmp = bmesh.new()
        vs = [[tmp.verts.new(p) for p in row] for row in rows]
        for i in range(len(vs) - 1):
            for j in range(len(vs[i]) - 1):
                quad = (vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j])
                # 有任意两点重合就是退化面
                if len({(round(v.co.x, 6), round(v.co.y, 6), round(v.co.z, 6)) for v in quad}) < 4:
                    if len({(round(v.co.x, 6), round(v.co.y, 6), round(v.co.z, 6)) for v in quad}) < 3:
                        continue
                    try:
                        tmp.faces.new((quad[0], quad[1], quad[2]))
                    except ValueError:
                        pass
                    continue
                try:
                    tmp.faces.new(quad)
                except ValueError:
                    pass
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        self._finish(tmp, mat, smooth, 0.0, 0)

    # ---------------------------------------------------------- 常用细节
    def plinth(self, w, d, h, at=(0, 0, 0), mat_key='stone', bevel=0.03):
        m = self.m(mat_key)
        self.box((w + 0.16, d + 0.16, h), (at[0], at[1], at[2] + h / 2), mat=m, bevel=bevel, seg=2)
        # 压顶线脚
        self.box((w + 0.26, d + 0.26, 0.07), (at[0], at[1], at[2] + h - 0.03), mat=m, bevel=0.014)

    def timber(self, w, d, z0, z1, mat_key='wood_dark', density=1.0, at=(0, 0, 0)):
        """墙面木构架：竖柱 + 横梁 + 斜撑。"""
        m = self.m(mat_key)
        t = 0.09
        h = z1 - z0
        n = max(2, int(w * density / 1.1) + 1)
        for i in range(n):
            x = -w / 2 + i * (w / (n - 1))
            self.box((t, 0.06, h), (at[0] + x, at[1] - d / 2 - 0.02, z0 + h / 2), mat=m, bevel=0.01)
        for z in (z0 + 0.06, z0 + h * 0.55, z1 - 0.06):
            self.box((w, 0.07, t), (at[0], at[1] - d / 2 - 0.02, z), mat=m, bevel=0.01)
        # 斜撑
        for sx in (-1, 1):
            self.box((t * 0.8, 0.06, h * 0.5), (at[0] + sx * w * 0.28, at[1] - d / 2 - 0.02, z0 + h * 0.30),
                     rot=(0, sx * 32, 0), mat=m, bevel=0.008)

    def window(self, at, w=0.9, h=1.1, axis='y', mat_frame='wood_dark',
               shutters=False, bloom=True, mullion_cols=2, mullion_rows=1, sill=True):
        """axis='y' 表示窗开在 -Y 面上；'x' 表示 -X 面。"""
        fm = self.m(mat_frame)
        gm = self.m('glass_warm' if bloom else 'glass', rough=0.25)
        x, y, z = at
        if axis == 'y':
            def put(sx, sy, sz, px, py, pz, mat, bev=0.008):
                self.box((sx, sy, sz), (x + px, y + py, z + pz), mat=mat, bevel=bev)
            put(w, 0.07, h, 0, 0, 0, fm)                 # 玻璃底衬
            put(w + 0.14, 0.1, 0.08, 0, -0.03, h / 2, fm)
            put(w + 0.14, 0.1, 0.08, 0, -0.03, -h / 2, fm)
            put(0.08, 0.1, h, -w / 2, -0.03, 0, fm)
            put(0.08, 0.1, h, w / 2, -0.03, 0, fm)
            for i in range(1, mullion_cols):
                put(0.045, 0.09, h, -w / 2 + w * i / mullion_cols, -0.045, 0, fm, 0.005)
            for i in range(1, mullion_rows + 1):
                put(w, 0.09, 0.045, 0, -0.045, -h / 2 + h * i / (mullion_rows + 1), fm, 0.005)
            if sill:
                put(w + 0.3, 0.22, 0.08, 0, -0.09, -h / 2 - 0.1, self.m('stone_warm'))
            if shutters:
                for sx in (-1, 1):
                    put(0.06, 0.09, h * 1.02, sx * (w / 2 + 0.24), -0.02, 0, self.m('fabric_green'))
        else:
            def put(sx, sy, sz, px, py, pz, mat, bev=0.008):
                self.box((sx, sy, sz), (x + px, y + py, z + pz), mat=mat, bevel=bev)
            put(0.07, w, h, 0, 0, 0, fm)
            put(0.1, w + 0.14, 0.08, -0.03, 0, h / 2, fm)
            put(0.1, w + 0.14, 0.08, -0.03, 0, -h / 2, fm)
            put(0.1, 0.08, h, -0.03, -w / 2, 0, fm)
            put(0.1, 0.08, h, -0.03, w / 2, 0, fm)
            for i in range(1, mullion_cols):
                put(0.09, 0.045, h, -0.045, -w / 2 + w * i / mullion_cols, 0, fm, 0.005)
            for i in range(1, mullion_rows + 1):
                put(0.09, w, 0.045, -0.045, 0, -h / 2 + h * i / (mullion_rows + 1), fm, 0.005)
            if sill:
                put(0.22, w + 0.3, 0.08, -0.09, 0, -h / 2 - 0.1, self.m('stone_warm'))

    def door(self, at, w=0.95, h=2.05, axis='y', mat_key='wood_mid', arched=False):
        m = self.m(mat_key)
        x, y, z = at
        thick = 0.12
        if axis == 'y':
            self.box((w, thick, h), (x, y, z + h / 2), mat=m, bevel=0.014)
            # 门板竖条
            for i in range(3):
                self.box((w * 0.26, 0.03, h * 0.92),
                         (x - w * 0.3 + i * w * 0.3, y - thick / 2 - 0.02, z + h / 2), mat=self.m('wood_dark'), bevel=0.006)
            self.box((w + 0.18, 0.1, 0.1), (x, y - 0.04, z + h - 0.03), mat=self.m('wood_dark'), bevel=0.01)
            self.sphere(0.045, (x + w * 0.32, y - 0.08, z + h * 0.48), mat=self.m('gold'), seg=10, ring=6)
            if arched:
                self.box((w + 0.3, 0.12, 0.16), (x, y - 0.03, z + h + 0.08), mat=self.m('stone_warm'), bevel=0.02)
            # 门槛
            self.box((w + 0.3, 0.34, 0.08), (x, y - 0.08, z + 0.04), mat=self.m('stone_warm'), bevel=0.012)
        else:
            self.box((thick, w, h), (x, y, z + h / 2), mat=m, bevel=0.014)
            self.box((0.1, w + 0.18, 0.1), (x - 0.04, y, z + h - 0.03), mat=self.m('wood_dark'), bevel=0.01)
            self.sphere(0.045, (x - 0.08, y + w * 0.32, z + h * 0.48), mat=self.m('gold'), seg=10, ring=6)

    # ---------------------------------------------------------- 屋顶
    def roof_gable(self, w, d, rise, at_z, roof_key='red', overhang=0.55,
                   thick=0.16, tiles=True, ridge=True, upturn=0.0):
        """双坡屋顶：两块带弧度的板 + 瓦垄 + 屋脊。"""
        rm = self.m(ROOF_KEYS.get(roof_key, roof_key))
        em = self.m('wood_dark')
        half = d / 2 + overhang
        tall = rise
        n = 7
        for side in (-1, 1):
            rows = []
            for i in range(n + 1):
                t = i / n
                zz = at_z + tall * (1 - t) ** 1.35 + upturn * (t ** 3)
                rows.append([
                    Vector((-w / 2 - overhang, side * half * t, zz)),
                    Vector((w / 2 + overhang, side * half * t, zz)),
                ])
            # 板面（两条线 -> 面）
            tmp_rows = rows
            self.quad_strip(tmp_rows, mat=rm, smooth=False)
            # 厚度：沿法线下移
            down = []
            for row in rows:
                down.append([Vector((p.x, p.y, p.z - thick)) for p in row])
            self.quad_strip([[row[0], row[1]] for row in down[::-1]], mat=em, smooth=False)
            # 檐口封边
            e0 = rows[0]
            e1 = down[0]
            self.quad_strip([[e0[0], e1[0]], [e0[1], e1[1]]], mat=em, smooth=False)
            # 瓦垄：顺着坡面的细条
            if tiles:
                cnt = max(6, int((w + 2 * overhang) / 0.42))
                for i in range(cnt + 1):
                    x = -(w / 2 + overhang) + (w + 2 * overhang) * i / cnt
                    pts_up = []
                    pts_dn = []
                    for radius in (0.0, 1.0):
                        for row, sgn in ((rows, 1),):
                            pass
                    # 用两排点做一条窄条
                    strip_top, strip_bot = [], []
                    for k in range(n + 1):
                        t = k / n
                        zz = at_z + tall * (1 - t) ** 1.35 + upturn * (t ** 3)
                        strip_top.append(Vector((x, side * half * t, zz + 0.035)))
                        strip_bot.append(Vector((x, side * half * t, zz + 0.001)))
                    for k in range(n):
                        a, b = strip_bot[k], strip_bot[k + 1]
                        c, dd = strip_top[k + 1], strip_top[k]
                        self.quad_strip([[a, b], [dd, c]], mat=self.m('roof_slate' if roof_key in ('grey', 'slate') else 'wood_dark'),
                                        smooth=False)
        if ridge:
            self.box((w + 2 * overhang + 0.1, 0.26, 0.18), (0, 0, at_z + rise + 0.06), mat=em, bevel=0.03)
            for side in (-1, 1):
                self.box((w + 2 * overhang + 0.05, 0.16, 0.1), (0, side * 0.14, at_z + rise - 0.02),
                         rot=(side * 26, 0, 0), mat=em, bevel=0.02)

    def roof_pagoda(self, w, d, rise, at_z, roof_key='teal', overhang=1.1, thick=0.14, tiers=1):
        """藏式/中式重檐：四坡 + 翘角。"""
        rm = self.m(ROOF_KEYS.get(roof_key, roof_key))
        em = self.m('wood_dark')
        half_w = w / 2 + overhang
        half_d = d / 2 + overhang
        n = 6
        for side_y in (-1, 1):
            for side_x in (-1, 1):
                rows = []
                # 从 t=1/6 起，跳过屋脊那条会退化的零长度行；脊上另有宝顶压住
                for i in range(1, n + 1):
                    t = i / n
                    # 从屋脊(中心)向檐口(t=1)走
                    z = at_z + rise * (1 - t) ** 1.5 + 0.55 * (t ** 3) * overhang / 1.1
                    rows.append([
                        Vector((side_x * half_w * t, -half_d * t, z)),
                        Vector((side_x * half_w * t, half_d * t, z)),
                    ])
                self.quad_strip(rows, mat=rm, smooth=False)
                down = [[Vector((p.x, p.y, p.z - thick)) for p in row] for row in rows]
                self.quad_strip(down[::-1], mat=em, smooth=False)
        # 翘角：四个角上挑的小块
        for sx in (-1, 1):
            for sy in (-1, 1):
                self.box((0.5, 0.4, 0.1), (sx * half_w, sy * half_d, at_z + 0.75 * overhang / 1.1 + 0.16),
                         rot=(sy * -18, sx * 18, 0), mat=rm, bevel=0.02)
        # 屋脊宝顶
        self.cyl(0.12, 0.5, (0, 0, at_z + rise + 0.2), mat=self.m('gold'), seg=10, bevel=0.01)
        self.sphere(0.13, (0, 0, at_z + rise + 0.5), mat=self.m('gold'), seg=12, ring=8)

    def roof_barrel(self, w, d, rise, at_z, roof_key='teal'):
        """拱壳屋顶（体育馆/车站）。"""
        rm = self.m(ROOF_KEYS.get(roof_key, roof_key))
        em = self.m('metal_dark')
        n = 14
        rows = []
        for i in range(n + 1):
            t = i / n
            ang = math.pi * t
            z = at_z + rise * math.sin(ang)
            y = -d / 2 * math.cos(ang)
            rows.append([Vector((-w / 2, y, z)), Vector((w / 2, y, z))])
        self.quad_strip(rows, mat=rm, smooth=True)
        # 拱肋
        ribs = max(5, int(w / 1.6))
        for i in range(ribs + 1):
            x = -w / 2 + w * i / ribs
            pts = []
            for k in range(n + 1):
                t = k / n
                ang = math.pi * t
                pts.append(Vector((x, -d / 2 * math.cos(ang), at_z + rise * math.sin(ang) + 0.05)))
            for k in range(n):
                self.quad_strip([[pts[k], pts[k] + Vector((0.08, 0, 0))],
                                 [pts[k + 1], pts[k + 1] + Vector((0.08, 0, 0))]], mat=em, smooth=True)

    def roof_flat(self, w, d, at_z, roof_key='grey', parapet=0.35):
        rm = self.m(ROOF_KEYS.get(roof_key, roof_key))
        self.box((w + 0.3, d + 0.3, 0.14), (0, 0, at_z + 0.07), mat=rm, bevel=0.02)
        for sx, sy, sw, sd in ((0, -1, w, 0.12), (0, 1, w, 0.12), (-1, 0, 0.12, d), (1, 0, 0.12, d)):
            self.box((sw, sd, parapet), (sx * (w / 2 - 0.06), sy * (d / 2 - 0.06), at_z + parapet / 2),
                     mat=self.m('plaster'), bevel=0.02)

    # ---------------------------------------------------------- 小配件
    def awning(self, w, depth, at, mat_key='fabric_red', stripes=True, rot=18):
        x, y, z = at
        fm = self.m(mat_key)
        n = 6
        rows = []
        for i in range(n + 1):
            t = i / n
            rows.append([
                Vector((x - w / 2, y - depth * t, z + 0.12 * t - 0.5 * depth * 0.35 * t * t)),
                Vector((x + w / 2, y - depth * t, z + 0.12 * t - 0.5 * depth * 0.35 * t * t)),
            ])
        self.quad_strip(rows, mat=fm, smooth=True)
        # 前缘垂边
        self.box((w, 0.04, 0.14), (x, y - depth, z - 0.5 * depth * 0.35 + 0.05), mat=fm, bevel=0.01)
        if stripes:
            cm = self.m('fabric_cream')
            cnt = max(3, int(w / 0.5))
            for i in range(cnt):
                if i % 2:
                    continue
                xx = x - w / 2 + w * (i + 0.5) / cnt
                self.box((w / cnt * 0.55, 0.02, 0.02), (xx, y - depth * 0.55, z - 0.06), mat=cm, bevel=0.004)
        # 支撑杆
        for sx in (-1, 1):
            self.cyl(0.025, depth, (x + sx * w / 2 * 0.92, y - depth / 2, z - 0.12),
                     rot=(90, 0, 0), mat=self.m('metal_dark'), seg=8, bevel=0.0)

    def sign(self, at, w=1.1, h=0.5, rot=(0, 0, 0), mat_key='wood_light', bracket=True):
        x, y, z = at
        bm = self.m(mat_key)
        self.box((w, 0.07, h), (x, y, z), rot=rot, mat=bm, bevel=0.02)
        self.box((w + 0.08, 0.05, 0.06), (x, y, z + h / 2 + 0.02), rot=rot, mat=self.m('wood_dark'), bevel=0.012)
        if bracket:
            self.box((0.05, 0.05, 0.4), (x - w / 2 + 0.08, y + 0.05, z + h / 2 + 0.22), mat=self.m('metal_dark'), bevel=0.006)

    def railing(self, p0, p1, h=1.0, mat_key='wood_mid', style='wood', spacing=0.42):
        m = self.m(mat_key)
        x0, z0 = p0
        x1, z1 = p1
        length = math.hypot(x1 - x0, z1 - z0)
        if length < 1e-6:
            return
        ax = (x1 - x0) / length
        az = (z1 - z0) / length
        rot_z = math.degrees(math.atan2(az, ax))
        cnt = max(2, int(length / spacing))
        for i in range(cnt + 1):
            t = i / cnt
            px, pz = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            if style == 'stone':
                self.box((0.14, 0.14, h), (px, pz, h / 2), rot=(0, 0, rot_z), mat=m, bevel=0.015)
            else:
                self.cyl(0.045, h, (px, pz, h / 2), mat=m, seg=8, bevel=0.0)
        for zz in (h - 0.06, h * 0.45):
            self.box((length, 0.09 if style == 'stone' else 0.06, 0.09), 
                     ((x0 + x1) / 2, (z0 + z1) / 2, zz), rot=(0, 0, rot_z), mat=m, bevel=0.01)

    def stairs(self, w, run, rise, n, at=(0, 0, 0), mat_key='stone_warm'):
        m = self.m(mat_key)
        for i in range(n):
            h = rise * (i + 1)
            self.box((w, run / n + 0.02, h), (at[0], at[1] - run / 2 + run * (i + 0.5) / n, at[2] + h / 2),
                     mat=m, bevel=0.012)

    def bush(self, at, r=0.45, mat_key='leaf', squash=0.8, count=3):
        x, y, z = at
        m = self.m(mat_key)
        self.sphere(r, (x, y, z + r * squash * 0.6), mat=m, seg=10, ring=6, scale=(1, 1, squash))
        for i in range(count - 1):
            ang = TAU * (i + 1) / count
            self.sphere(r * 0.72,
                        (x + math.cos(ang) * r * 0.7, y + math.sin(ang) * r * 0.7, z + r * squash * 0.4),
                        mat=self.m('leaf_light' if i % 2 else 'leaf_dark'), seg=10, ring=6, scale=(1, 1, squash))

    def pot(self, at, r=0.22, h=0.32, mat_key='terracotta'):
        x, y, z = at
        m = self.m(mat_key)
        self.cyl(r * 0.86, h, (x, y, z + h / 2), r2=r, mat=m, seg=16, bevel=0.008)
        self.cyl(r * 1.04, 0.05, (x, y, z + h - 0.02), mat=m, seg=16, bevel=0.006)
        self.cyl(r * 0.7, 0.03, (x, y, z + h - 0.03), mat=self.m('soil'), seg=14, bevel=0.0)

    # ---------------------------------------------------------- 成体
    def build(self):
        if not self.bm.faces:
            raise RuntimeError(f'{self.name}: 空模型')
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        # 约定：底部贴地（zmin = 0）
        zmin = min(v.co.z for v in self.bm.verts)
        if abs(zmin) > 1e-4:
            bmesh.ops.translate(self.bm, vec=Vector((0, 0, -zmin)), verts=self.bm.verts)
        # 箱式投影 UV（够 three.js 采样纯色/贴图用）
        uv = self.bm.loops.layers.uv.verify()
        for f in self.bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for loop in f.loops:
                co = loop.vert.co
                if ax == 0:
                    loop[uv].uv = (co.y, co.z)
                elif ax == 1:
                    loop[uv].uv = (co.x, co.z)
                else:
                    loop[uv].uv = (co.x, co.y)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        for key, rough, metal, emit, es in self.mats:
            mat = bpy.data.materials.get(f'G_{key}')
            if mat is None:
                mat = bpy.data.materials.new(f'G_{key}')
                mat.use_nodes = True
                nt = mat.node_tree
                bsdf = nt.nodes.get('Principled BSDF')
                c = P.get(key, (0.8, 0.8, 0.8))
                bsdf.inputs['Base Color'].default_value = (*c, 1.0)
                bsdf.inputs['Roughness'].default_value = rough
                bsdf.inputs['Metallic'].default_value = metal
                if 'Specular IOR Level' in bsdf.inputs:
                    bsdf.inputs['Specular IOR Level'].default_value = 0.22
                if emit > 0 or es > 0:
                    bsdf.inputs['Emission Color'].default_value = (*P.get(key, c), 1.0)
                    bsdf.inputs['Emission Strength'].default_value = es or emit
                mat.diffuse_color = (*c, 1.0)
            me.materials.append(mat)
        return ob