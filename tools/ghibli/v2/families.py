"""v2 各家族的造型实现（精模版）。

每个 builder(M, p)：p 是 catalog 生成的参数（尺寸、风格、配色、构造细节）。
"""
import math
from mathutils import Vector

from lib import P, ROOF_KEYS
from lib2 import Model2

TAU = math.tau

WALL_KEYS = ['wall_cream', 'wall_butter', 'wall_pink', 'wall_sage', 'wall_blue', 'wall_ash']
ROOF_KEYS_LIST = ['red', 'teal', 'grey', 'blue', 'straw', 'slate']
WOOD_KEYS = ['wood_dark', 'wood_mid', 'wood_light']


# ==================================================================== 建筑
def house(M, p):
    w, d, h = p['w'], p['d'], p['h']
    floors = p.get('floors', 1)
    wall = p.get('wall', 'wall_cream')
    roof = p.get('roof', 'red')
    base_h = 0.4
    roof_rise = (h - base_h) * p.get('roof_ratio', 0.30)
    body_h = (h - base_h) - roof_rise
    story = body_h / floors
    wm = M.m(wall, rough=0.9)

    # 勒脚 + 压顶线脚 + 散水
    M.plinth(w, d, base_h)
    M.moulding(w, d, base_h + 0.06, thick=0.07, out=0.06, mat_key='stone_warm')
    M.moulding(w, d, base_h + body_h - 0.04, thick=0.1, out=0.08, mat_key='wood_mid')
    M.box((w, d, body_h), (0, 0, base_h + body_h / 2), mat=wm, bevel=0.025)

    # 墙面做法
    if p.get('siding') == 'plank':
        M.plank_lines(w, body_h, (0, -d / 2 - 0.02, base_h + body_h / 2), n=int(body_h / 0.32),
                      mat_key='wood_dark', thick=0.02)
    elif p.get('siding') == 'stone':
        M.courses(w, d, base_h + 0.1, base_h + body_h - 0.1, 'stone_dark', rows=int(body_h / 0.5))
    if p.get('timber', True):
        M.timber(w, d, base_h + 0.12, base_h + body_h - 0.12, 'wood_dark', density=0.75)
    # 角柱
    for sx in (-1, 1):
        for sy in (-1, 1):
            M.box((0.13, 0.13, body_h), (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), base_h + body_h / 2),
                  mat=M.m('wood_dark'), bevel=0.012)

    # 二层挑楼（宫崎骏式）
    if floors >= 2 and p.get('jetty', True):
        M.box((w + 0.26, d + 0.26, story * 0.92), (0, 0, base_h + story * 1.5), mat=wm, bevel=0.02)
        for sx in (-1, 1):
            M.box((0.1, d + 0.3, 0.1), (sx * (w / 2 + 0.12), 0, base_h + story), mat=M.m('wood_dark'), bevel=0.01)
        # 挑楼下的斜撑
        for sx in (-1, 1):
            M.box((0.08, 0.08, 0.6), (sx * (w / 2 - 0.2), -d / 2 - 0.12, base_h + story - 0.3),
                  rot=(0, 0, 0), mat=M.m('wood_dark'), bevel=0.008)

    # 门窗（每层）
    nwin = p.get('nwin', 3 if w > 7 else 2)
    for f in range(floors):
        zc = base_h + story * f + story * 0.56
        for i in range(nwin):
            x = -w / 2 + w * (i + 0.5) / nwin
            if f == 0 and abs(x) < 1.35:
                continue
            M.window_dressed(x, -d / 2 - 0.02, zc, w=min(1.0, w / (nwin + 1.6)),
                             h=min(1.25, story * 0.5), nx=0, ny=-1,
                             shutters=p.get('shutters', False),
                             flower=(f == 0 and i % 2 == 0),
                             lamp=(f == 0 and i == 0),
                             curtain=True)
        for i in range(2):
            M.window_dressed(-w / 2 - 0.02, -d / 2 + d * (i + 0.5) / 2, zc,
                             w=0.8, h=min(1.1, story * 0.48), nx=-1, ny=0, shutters=False)
        # 背面也开窗（远处的房子会转过身来）
        if p.get('back_windows', True):
            for i in range(max(1, nwin - 1)):
                x = -w / 2 + w * (i + 0.5) / max(1, nwin - 1)
                M.window_dressed(x, d / 2 + 0.02, zc, w=0.85, h=min(1.1, story * 0.46),
                                 nx=0, ny=1, shutters=False, flower=False, lamp=False)

    M.door_dressed((0, -d / 2 - 0.07, base_h), 1.0, min(2.1, story * 0.84), 'y', 'wood_mid',
                   noren=p.get('noren', False), canopy=True)

    # 屋顶
    zb = base_h + body_h
    M.tile_roof(w, d, roof_rise, zb, roof, overhang=p.get('overhang', 0.62),
                upturn=p.get('upturn', 0.12))
    if p.get('dormer'):
        M.box((1.5, 1.2, 1.1), (0, -d / 4 - 0.3, zb + roof_rise * 0.45), mat=wm, bevel=0.02)
        M.tile_roof(1.5, 1.2, 0.45, zb + roof_rise * 0.9, roof, overhang=0.2, rafter=False, gutter=False)
        M.window_dressed(0, -d / 4 - 0.92, zb + roof_rise * 0.5, 0.7, 0.6, 0, -1, shutters=False, flower=False)
    if p.get('balcony'):
        zbal = base_h + story
        M.box((w * 0.72, 1.05, 0.12), (0, -d / 2 - 0.52, zbal), mat=M.m('wood_light'), bevel=0.02)
        for i in range(int(w * 0.72 / 0.18)):
            M.box((0.05, 0.05, 0.85), (-w * 0.35 + i * 0.18, -d / 2 - 1.0, zbal + 0.48),
                  mat=M.m('wood_dark'), bevel=0.006)
        M.box((w * 0.72, 0.09, 0.07), (0, -d / 2 - 1.0, zbal + 0.92), mat=M.m('wood_dark'), bevel=0.008)
        for sx in (-1, 1):
            M.box((0.08, 1.05, 0.08), (sx * w * 0.36, -d / 2 - 0.52, zbal + 0.45), mat=M.m('wood_dark'), bevel=0.008)
        # 晾衣绳
        M.cyl(0.012, w * 0.6, (0, -d / 2 - 1.2, zbal + 1.1), rot=(0, 90, 0), mat=M.m('roof_straw'), seg=6)
        for k, key in enumerate(('fabric_cream', 'fabric_blue', 'wall_pink')):
            M.box((0.3, 0.015, 0.4), (-w * 0.2 + k * w * 0.2, -d / 2 - 1.2, zbal + 0.9), mat=M.m(key), bevel=0.004)
    if p.get('chimney', True):
        cx, cy = w * 0.3, d * 0.22
        z0 = zb + roof_rise * 0.55
        M.box((0.55, 0.55, 1.5), (cx, cy, z0 + 0.75), mat=M.m('brick'), bevel=0.02)
        for k in range(3):
            M.box((0.6, 0.6, 0.07), (cx, cy, z0 + 0.3 + k * 0.42), mat=M.m('stone_dark'), bevel=0.01)
        M.box((0.7, 0.7, 0.13), (cx, cy, z0 + 1.52), mat=M.m('stone_warm'), bevel=0.02)
        M.cyl(0.1, 0.2, (cx, cy, z0 + 1.66), r2=0.13, mat=M.m('ink'), seg=10)
    # 墙脚灌木 + 门牌
    if p.get('plants', True):
        for sx in (-1, 1):
            M.pot((sx * w * 0.34, -d / 2 - 0.28, 0), 0.19, 0.26)
            M.leaf_scatter((sx * w * 0.34, -d / 2 - 0.28, 0.32), 0.3, 'leaf', 4, 0.65)
    M.box((0.34, 0.05, 0.18), (w * 0.28, -d / 2 - 0.12, base_h + 1.75), mat=M.m('wood_light'), bevel=0.008)
    if p.get('gutter_down'):
        M.cyl(0.05, body_h, (w / 2 - 0.1, -d / 2 - 0.1, base_h + body_h / 2), mat=M.m('metal_dark'), seg=8, bevel=0.0)
    return None


def shop(M, p):
    """店铺：住宅的体 + 完整店面（雨棚/招牌/橱窗/陈列/台阶）。"""
    w, d, h = p['w'], p['d'], p['h']
    base_h = 0.4
    roof_rise = (h - base_h) * 0.26
    body_h = (h - base_h) - roof_rise
    story = body_h / 2
    wm = M.m(p.get('wall', 'wall_cream'), rough=0.9)
    M.plinth(w, d, base_h)
    M.moulding(w, d, base_h + 0.06, thick=0.07, out=0.06, mat_key='stone_warm')
    M.box((w, d, body_h), (0, 0, base_h + body_h / 2), mat=wm, bevel=0.025)
    M.plank_lines(w, body_h, (0, -d / 2 - 0.02, base_h + body_h / 2), n=int(body_h / 0.36),
                  mat_key='wood_dark', thick=0.018)
    M.timber(w, d, base_h + 0.12, base_h + body_h - 0.12, 'wood_dark', 0.7)
    # 二楼窗（带花箱）
    for i in range(2 if w < 8 else 3):
        M.window_dressed(-w / 2 + w * (i + 0.5) / (2 if w < 8 else 3), -d / 2 - 0.02,
                         base_h + story * 1.55, min(0.95, w / 3.4), 1.15, 0, -1,
                         shutters=True, flower=(i % 2 == 0), curtain=True)
    # 店面：内凹门洞
    inset = 0.35
    M.box((w * 0.62, inset, story * 0.92), (0, -d / 2 + inset / 2 - 0.02, base_h + story * 0.46),
          mat=M.m('wood_dark'), bevel=0.0)
    M.box((w * 0.62, 0.06, story * 0.92), (0, -d / 2 + inset - 0.03, base_h + story * 0.46),
          mat=M.m('wall_ash'), bevel=0.0)
    M.door_dressed((0, -d / 2 + inset - 0.06, base_h), 1.0, min(2.1, story * 0.82), 'y', 'wood_mid',
                   canopy=False, lantern=False, step=False)
    # 橱窗（两侧）+ 陈列
    for sx in (-1, 1):
        wx = sx * w * 0.28
        M.box((w * 0.3, 0.05, story * 0.62), (wx, -d / 2 - 0.02, base_h + story * 0.5),
              mat=M.m('glass_warm', rough=0.18), bevel=0.0)
        M.box((w * 0.32, 0.09, 0.09), (wx, -d / 2 - 0.04, base_h + story * 0.5 + story * 0.31),
              mat=M.m('wood_dark'), bevel=0.01)
        M.box((w * 0.32, 0.09, 0.09), (wx, -d / 2 - 0.04, base_h + story * 0.5 - story * 0.31),
              mat=M.m('wood_dark'), bevel=0.01)
        M.box((w * 0.32, 0.1, 0.07), (wx, -d / 2 - 0.05, base_h + story * 0.19), mat=M.m('wood_dark'), bevel=0.008)
        # 橱窗里的陈列
        for k in range(3):
            px = wx - w * 0.1 + k * w * 0.1
            key = p.get('goods', ['fabric_red', 'gold', 'wall_ash'])[k % 3]
            M.cyl(0.07, 0.18, (px, -d / 2 + 0.16, base_h + story * 0.23), mat=M.m(key), seg=10, bevel=0.006)
    # 雨棚 + 招牌 + 暖帘
    M.awning_scallop(w * 0.84, 1.25, (0, -d / 2 - 0.02, base_h + story * 0.95),
                     p.get('awning', 'fabric_red'), 'fabric_cream')
    M.hanging_sign((w * 0.3, -d / 2 - 0.05, base_h + story * 1.05), 0.95, 0.52,
                   p.get('sign_wood', 'wood_light'), arm=0.85, emblem=p.get('emblem'))
    M.sign((0, -d / 2 - 0.12, base_h + story * 1.32), w * 0.4, 0.42, mat_key='wood_gap')
    M.noren((0, -d / 2 - 0.05, base_h + story * 0.9), w * 0.2, 0.55, p.get('noren', 'fabric_blue'))
    # 台阶 + 门口木箱/花盆
    M.box((w * 0.6, 0.5, 0.12), (0, -d / 2 - 0.25, 0.06), mat=M.m('stone_warm'), bevel=0.014)
    M.box((w * 0.55, 0.34, 0.08), (0, -d / 2 - 0.18, 0.15), mat=M.m('stone'), bevel=0.01)
    for sx in (-1, 1):
        if sx < 0:
            M.box((0.55, 0.4, 0.38), (sx * w * 0.42, -d / 2 - 0.45, 0.19), mat=M.m('wood_light'), bevel=0.014)
            for k in range(3):
                M.sphere(0.09, (sx * w * 0.42 - 0.12 + k * 0.12, -d / 2 - 0.45, 0.42),
                         mat=M.m(['gold', 'fabric_red', 'leaf'][k]), seg=8, ring=5)
        else:
            M.pot((sx * w * 0.42, -d / 2 - 0.4, 0), 0.22, 0.3)
            M.leaf_scatter((sx * w * 0.42, -d / 2 - 0.4, 0.36), 0.34, 'leaf', 5, 0.7)
    # 屋顶
    zb = base_h + body_h
    M.tile_roof(w, d, roof_rise, zb, p.get('roof', 'teal'), overhang=0.66, upturn=0.14)
    M.chimney if False else None
    if p.get('chimney', True):
        cx, cy = w * 0.32, d * 0.2
        z0 = zb + roof_rise * 0.5
        M.box((0.5, 0.5, 1.3), (cx, cy, z0 + 0.65), mat=M.m('brick'), bevel=0.02)
        M.box((0.64, 0.64, 0.12), (cx, cy, z0 + 1.32), mat=M.m('stone_warm'), bevel=0.02)
        M.cyl(0.1, 0.18, (cx, cy, z0 + 1.45), r2=0.12, mat=M.m('ink'), seg=10)
    # 招牌灯串
    if p.get('festoon', True):
        for k in range(4):
            M.sphere(0.07, (-w * 0.3 + k * w * 0.2, -d / 2 - 0.9, base_h + story * 1.12),
                     mat=M.m('glow', emit=1.0, emit_strength=2.4), seg=8, ring=5)
    return None


# ==================================================================== 家具
def _case(M, p):
    """柜类：柜体 + 柜门/抽屉 + 拉手 + 顶板 + 脚。"""
    w, d, h = p['w'], p['d'], p['h']
    wood = M.m(p.get('wood', 'wood_mid'))
    light = M.m(p.get('wood2', 'wood_light'))
    M.box((w, d, h * 0.92), (0, 0, h * 0.46), mat=wood, bevel=0.014)
    M.box((w + 0.06, d + 0.04, 0.06), (0, 0, h * 0.95), mat=light, bevel=0.012)
    M.box((w - 0.04, d - 0.02, 0.08), (0, 0, 0.05), mat=light, bevel=0.01)
    door_w = (w - 0.12) / 2
    for i in range(2):
        cx = -door_w / 2 - 0.01 + i * (door_w + 0.02)
        M.box((door_w, 0.045, h * 0.8), (cx, -d / 2 - 0.02, h * 0.52), mat=light, bevel=0.01)
        M.box((door_w * 0.82, 0.02, h * 0.66), (cx, -d / 2 - 0.05, h * 0.52), mat=wood, bevel=0.006)
        M.cyl(0.016, 0.09, (cx + (0.05 if i == 0 else -0.05), -d / 2 - 0.08, h * 0.52),
              rot=(90, 0, 0), mat=M.m('gold'), seg=8, bevel=0.0)
    # 抽屉（下部）
    if p.get('drawers', 2):
        for k in range(p.get('drawers', 2)):
            M.drawer_front(w * 0.9, h * 0.13, (0, -d / 2 - 0.02, h * (0.16 + k * 0.15)), 'wood_light')
    return None


def _chair(M, p):
    w, d, h = p['w'], p['d'], p['h']
    seat_h = h * 0.46
    wood = M.m(p.get('wood', 'wood_dark'))
    M.box((w, d * 0.94, 0.055), (0, 0, seat_h), mat=wood, bevel=0.012)
    M.cushion(w * 0.88, d * 0.8, 0.07, (0, 0, seat_h + 0.06), p.get('fabric', 'fabric_cream'))
    M.legs4(w, d, seat_h - 0.03, (0, 0, 0.02), 0.04, p.get('wood', 'wood_dark'), turned=True)
    # 靠背：两根立柱 + 横档 + 中间竖条
    for sx in (-1, 1):
        M.cyl(0.035, h - seat_h, (sx * (w / 2 - 0.05), d * 0.42, seat_h + (h - seat_h) / 2),
              mat=wood, seg=10, bevel=0.004)
    for k in range(3):
        z = seat_h + 0.16 + k * (h - seat_h - 0.2) / 2
        M.box((w - 0.08, 0.045, 0.07), (0, d * 0.42, z), mat=M.m('wood_light'), bevel=0.008)
    for k in range(3):
        M.cyl(0.018, h - seat_h - 0.16, (-w * 0.2 + k * w * 0.2, d * 0.42, seat_h + (h - seat_h) / 2),
              mat=wood, seg=8, bevel=0.0)
    return None


def _stool(M, p):
    w, d, h = p['w'], p['d'], p['h']
    wood = M.m(p.get('wood', 'wood_mid'))
    M.cyl(w / 2, 0.06, (0, 0, h), mat=wood, seg=18, bevel=0.01)
    M.cyl(w / 2 * 0.94, 0.05, (0, 0, h + 0.05), mat=M.m(p.get('fabric', 'fabric_red')), seg=18, bevel=0.012)
    for i in range(3):
        a = TAU * i / 3
        M.cyl(0.028, h, (math.cos(a) * w * 0.3, math.sin(a) * w * 0.3, h / 2), mat=wood, seg=8, bevel=0.004)
    return None


def _table(M, p):
    w, d, h = p['w'], p['d'], p['h']
    wood = M.m(p.get('wood', 'wood_mid'))
    light = M.m(p.get('wood2', 'wood_light'))
    M.box((w, d, 0.07), (0, 0, h), mat=light, bevel=0.012)
    M.box((w + 0.05, d + 0.05, 0.035), (0, 0, h - 0.045), mat=wood, bevel=0.012)
    M.legs4(w, d, h - 0.08, (0, 0, 0.0), 0.045, p.get('wood', 'wood_mid'), turned=True)
    if p.get('cloth'):
        M.box((w * 0.98, d * 0.98, 0.02), (0, 0, h + 0.05), mat=M.m('fabric_cream'), bevel=0.008)
        M.box((w * 0.2, d * 0.2, 0.14), (0, 0, h + 0.12), mat=M.m('white'), bevel=0.01)
    else:
        M.cyl(0.1, 0.16, (w * 0.2, 0, h + 0.1), mat=M.m('white'), seg=12, bevel=0.01)
        M.cyl(0.07, 0.02, (w * 0.2, 0, h + 0.19), mat=M.m('gold'), seg=12)
    return None


def _desk(M, p):
    w, d, h = p['w'], p['d'], p['h']
    wood = M.m(p.get('wood', 'wood_mid'))
    M.box((w, d, 0.06), (0, 0, h), mat=M.m('wood_light'), bevel=0.012)
    M.box((w * 0.42, d * 0.9, h * 0.62), (w * 0.26, 0, h * 0.31), mat=wood, bevel=0.012)
    for k in range(3):
        M.drawer_front(w * 0.38, h * 0.16, (w * 0.26, -d / 2 - 0.02, h * (0.16 + k * 0.2)), 'wood_light')
    M.box((0.05, d * 0.9, h - 0.06), (-w * 0.44, 0, (h - 0.06) / 2), mat=wood, bevel=0.008)
    # 桌上的东西
    M.box((0.42, 0.3, 0.025), (-w * 0.1, 0, h + 0.02), mat=M.m('wall_ash'), bevel=0.008)
    M.cyl(0.06, 0.14, (-w * 0.34, 0.06, h + 0.07), mat=M.m('white'), seg=10)
    M.books_row(w * 0.3, h * 0.12, (w * 0.05, d * 0.22, h + 0.03), 'y', 5)
    return None


def _shelf(M, p):
    w, d, h = p['w'], p['d'], p['h']
    wood = M.m(p.get('wood', 'wood_mid'))
    M.box((0.05, d, h), (-w / 2, 0, h / 2), mat=wood, bevel=0.008)
    M.box((0.05, d, h), (w / 2, 0, h / 2), mat=wood, bevel=0.008)
    M.box((w, d, 0.04), (0, 0, h), mat=wood, bevel=0.008)
    n = p.get('levels', 4)
    for k in range(n):
        z = h * (0.08 + 0.86 * k / max(1, n - 1))
        M.box((w - 0.05, d * 0.96, 0.035), (0, 0, z), mat=M.m('wood_light'), bevel=0.006)
        if k < n - 1:
            M.books_row(w * 0.86, h * 0.16, (0, 0, z + 0.02), 'y', max(4, int(w / 0.12)))
    return None


def _bed(M, p):
    w, d, h = p['w'], p['d'], p['h']
    wood = M.m(p.get('wood', 'wood_mid'))
    M.box((w, d, h * 0.36), (0, 0, h * 0.3), mat=wood, bevel=0.016)
    M.box((w * 0.96, d * 0.96, h * 0.16), (0, 0, h * 0.52), mat=M.m('white'), bevel=0.03)
    M.box((w * 0.92, d * 0.62, 0.05), (0, -d * 0.12, h * 0.6), mat=M.m(p.get('quilt', 'fabric_blue')), bevel=0.02)
    M.box((w, 0.08, h * 0.95), (0, d / 2 - 0.04, h * 0.5), mat=M.m('wood_light'), bevel=0.016)
    M.box((w * 0.9, 0.06, h * 0.2), (0, d / 2 - 0.1, h * 1.02), mat=wood, bevel=0.012)
    n = 2 if w > 1.3 else 1
    for i in range(n):
        M.cushion(w * (0.34 if n == 2 else 0.6), d * 0.16, 0.13,
                  (-w * 0.22 + i * w * 0.44 if n == 2 else 0, d * 0.3, h * 0.66), 'white')
    for sx in (-1, 1):
        M.box((0.07, d * 0.9, h * 0.26), (sx * (w / 2 - 0.035), 0, h * 0.24), mat=wood, bevel=0.01)
    return None


def _sofa(M, p):
    w, d, h = p['w'], p['d'], p['h']
    fab = M.m(p.get('fabric', 'fabric_green'))
    M.box((w, d, h * 0.4), (0, 0, h * 0.3), mat=fab, bevel=0.07)
    M.box((w, d * 0.26, h * 0.62), (0, d * 0.36, h * 0.48), mat=fab, bevel=0.07)
    for sx in (-1, 1):
        M.box((w * 0.11, d, h * 0.52), (sx * (w / 2 - w * 0.055), 0, h * 0.42), mat=fab, bevel=0.05)
    n = 3 if w > 1.6 else 2
    for i in range(n):
        M.cushion(w * 0.3, d * 0.62, 0.13, (-w * 0.3 + i * w * 0.3, -d * 0.04, h * 0.52), 'fabric_cream')
        M.cushion(w * 0.24, 0.12, 0.2, (-w * 0.3 + i * w * 0.3, d * 0.28, h * 0.62), 'wall_pink' if i % 2 else 'wall_ash')
    for sx in (-1, 1):
        for sy in (-1, 1):
            M.cyl(0.03, 0.14, (sx * w * 0.42, sy * d * 0.38, 0.07), mat=M.m('wood_dark'), seg=8)
    return None


def _soft(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m(p.get('fabric', 'fabric_red'))
    M.box((w, d, max(h, 0.02)), (0, 0, max(h, 0.02) / 2), mat=m, bevel=0.01)
    M.box((w * 0.86, d * 0.84, 0.008), (0, 0, max(h, 0.02) + 0.006), mat=M.m('fabric_cream'), bevel=0.006)
    M.box((w * 0.6, d * 0.6, 0.006), (0, 0, max(h, 0.02) + 0.012), mat=M.m(p.get('fabric2', 'fabric_green')), bevel=0.004)
    return None


def _lamp(M, p):
    h = p['h']
    base = p.get('base', 'metal_dark')
    M.cyl(0.16, 0.05, (0, 0, 0.025), mat=M.m(base), seg=14, bevel=0.006)
    M.cyl(0.03, h * 0.78, (0, 0, h * 0.02 + h * 0.39), mat=M.m('gold'), seg=8, bevel=0.0)
    M.cyl(0.2, 0.3, (0, 0, h * 0.9), r2=0.25, mat=M.m(p.get('shade', 'fabric_cream')), seg=14, bevel=0.008)
    M.cyl(0.19, 0.22, (0, 0, h * 0.88), r2=0.23, mat=M.m('glow', emit=1.0, emit_strength=2.2), seg=14, bevel=0.0)
    return None


def _mirror(M, p):
    w, h = p['w'], p['h']
    M.box((w, 0.06, h), (0, 0, h / 2), mat=M.m(p.get('frame', 'wood_light')), bevel=0.02)
    M.box((w * 0.86, 0.03, h * 0.88), (0, -0.04, h / 2), mat=M.m('glass', rough=0.05), bevel=0.0)
    M.box((w * 0.94, 0.05, 0.05), (0, -0.02, h * 0.96), mat=M.m('gold'), bevel=0.008)
    return None


def _clock(M, p):
    h = p['h']
    M.box((p['w'], 0.1, h), (0, 0, h / 2), mat=M.m('wood_dark'), bevel=0.02)
    r = min(p['w'], h) * 0.32
    M.cyl(r, 0.05, (0, -0.07, h * 0.66), rot=(90, 0, 0), mat=M.m('white'), seg=20, bevel=0.006)
    M.box((0.02, 0.04, r * 0.8), (0, -0.1, h * 0.66 + r * 0.3), mat=M.m('ink'))
    M.box((r * 0.6, 0.04, 0.02), (r * 0.24, -0.1, h * 0.66), mat=M.m('ink'))
    M.cyl(0.05, 0.06, (0, -0.1, h * 0.66), rot=(90, 0, 0), mat=M.m('gold'), seg=10)
    M.cyl(r * 0.5, 0.06, (0, -0.07, h * 0.2), rot=(90, 0, 0), mat=M.m('gold'), seg=16)
    return None


def _picture(M, p):
    w, h = p['w'], p['h']
    M.box((w, 0.05, h), (0, 0, h / 2), mat=M.m(p.get('frame', 'wood_mid')), bevel=0.014)
    M.box((w * 0.86, 0.02, h * 0.86), (0, -0.035, h / 2), mat=M.m(p.get('canvas', 'wall_sage')), bevel=0.0)
    M.sphere(0.06, (-w * 0.15, -0.05, h * 0.6), mat=M.m('leaf'), seg=8, ring=5, scale=(1, 0.4, 0.8))
    M.box((w * 0.4, 0.01, h * 0.06), (-w * 0.05, -0.05, h * 0.3), mat=M.m('wall_blue'), bevel=0.002)
    return None


def _kitchen(M, p):
    """锅碗瓢盆炉：小件也做结构。"""
    v = p.get('variant', 'pot')
    r = p['w'] / 2
    h = p['h']
    if v in ('pot', 'pan', 'kettle', 'teapot'):
        m = M.m(p.get('metal', 'metal_dark'))
        M.cyl(r * 0.92, h * 0.7, (0, 0, h * 0.45), r2=r, mat=m, seg=18, bevel=0.008)
        M.cyl(r * 1.02, 0.04, (0, 0, h * 0.8), mat=m, seg=18, bevel=0.006)
        M.cyl(r * 0.15, 0.1, (0, 0, h * 0.86), mat=M.m('wood_dark'), seg=8)
        for i in range(2):
            s = -1 if i == 0 else 1
            M.box((r * 0.9, 0.04, 0.03), (s * r * 0.9, 0, h * 0.72), rot=(0, 0, 0), mat=m, bevel=0.006)
        if v == 'kettle':
            M.cyl(0.03, r * 0.9, (r * 1.1, 0, h * 0.62), rot=(0, 55, 0), mat=m, seg=8, bevel=0.0)
        if v == 'teapot':
            M.cyl(0.03, r * 0.8, (r * 1.05, 0, h * 0.6), rot=(0, 45, 0), mat=m, seg=8, bevel=0.0)
            M.sphere(r * 0.9, (0, 0, h * 0.85), mat=m, seg=14, ring=8, scale=(1, 1, 0.6))
    elif v in ('bowl', 'tray', 'plate'):
        m = M.m(p.get('ceramic', 'white'))
        M.cyl(r, h * 0.6, (0, 0, h * 0.3), r2=r * 0.8, mat=m, seg=20, bevel=0.008)
        M.cyl(r * 0.94, 0.02, (0, 0, h * 0.6), mat=M.m('gold'), seg=20, bevel=0.0)
    else:
        m = M.m(p.get('metal', 'metal'))
        M.box((r * 2, r * 1.4, h * 0.2), (0, 0, h * 0.1), mat=m, bevel=0.01)
        M.cyl(0.04, r * 1.6, (0, 0, h * 0.5), rot=(90, 0, 0), mat=m, seg=8, bevel=0.0)
    return None


def _appliance(M, p):
    v = p.get('variant', 'sink')
    w, d, h = p['w'], p['d'], p['h']
    body = M.m(p.get('shell', 'wall_ash'))
    M.box((w, d, h * 0.86), (0, 0, h * 0.43), mat=body, bevel=0.02)
    if v == 'sink':
        M.box((w * 0.94, d * 0.94, 0.05), (0, 0, h * 0.86), mat=M.m('metal'), bevel=0.01)
        M.box((w * 0.5, d * 0.5, 0.12), (0, 0, h * 0.82), mat=M.m('metal_dark'), bevel=0.02)
        M.cyl(0.028, 0.3, (0, d * 0.3, h * 0.98), mat=M.m('metal'), seg=8, bevel=0.0)
        M.cyl(0.028, 0.16, (0, d * 0.3 - 0.08, h * 1.12), rot=(90, 0, 0), mat=M.m('metal'), seg=8, bevel=0.0)
        for i in range(2):
            M.drawer_front(w * 0.44, h * 0.4, (-w * 0.24 + i * w * 0.48, -d / 2 - 0.02, h * 0.42), 'wood_light')
    elif v in ('stove', 'oven'):
        M.box((w * 0.96, d * 0.96, 0.05), (0, 0, h * 0.88), mat=M.m('metal_dark'), bevel=0.012)
        for i in range(2):
            M.cyl(0.14, 0.03, (-w * 0.22 + i * w * 0.44, 0, h * 0.9), mat=M.m('ink'), seg=16)
        M.box((w * 0.9, 0.04, h * 0.34), (0, -d / 2 - 0.02, h * 0.4), mat=M.m('glass', rough=0.2))
        for k in range(3):
            M.cyl(0.03, 0.05, (-w * 0.3 + k * w * 0.3, -d / 2 - 0.03, h * 0.68), mat=M.m('metal'), seg=8)
        M.box((w * 0.9, d * 0.7, 0.3), (0, 0, h * 1.03), mat=M.m('metal'), bevel=0.02)
        M.cyl(0.12, 0.4, (0, 0, h * 1.35), mat=M.m('metal_dark'), seg=12)
    elif v in ('fridge', 'icebox'):
        M.box((w + 0.02, d * 0.98, 0.02), (0, 0, h * 0.66), mat=M.m('metal_dark'), bevel=0.0)
        for i in range(2):
            M.cyl(0.016, h * 0.2, (w * 0.34, -d / 2 - 0.03, h * (0.82 if i == 0 else 0.5)),
                  mat=M.m('metal'), seg=8, bevel=0.0)
        M.box((w * 0.3, 0.02, h * 0.1), (-w * 0.2, -d / 2 - 0.02, h * 0.9), mat=M.m('gold'), bevel=0.004)
    else:
        M.box((w * 0.9, 0.04, h * 0.3), (0, -d / 2 - 0.02, h * 0.5), mat=M.m('glass', rough=0.15))
        M.cyl(0.1, 0.03, (0, 0, h * 1.02), mat=M.m('metal'), seg=12)
    return None


def _storage(M, p):
    v = p.get('variant', 'crate')
    w, d, h = p['w'], p['d'], p['h']
    if v in ('barrel',):
        m = M.m(p.get('mat', 'wood_mid'))
        M.cyl(w / 2 * 0.92, h * 0.9, (0, 0, h * 0.45), r2=w / 2, mat=m, seg=18, bevel=0.01)
        for z in (h * 0.15, h * 0.5, h * 0.85):
            M.cyl(w / 2 + 0.02, 0.05, (0, 0, z), mat=M.m('metal_dark'), seg=18, bevel=0.004)
        M.cyl(w / 2 * 0.86, 0.04, (0, 0, h * 0.9), mat=M.m('wood_dark'), seg=18)
    elif v in ('crate', 'box', 'basket'):
        m = M.m(p.get('mat', 'wood_light'))
        M.box((w, d, h), (0, 0, h / 2), mat=m, bevel=0.012)
        for z in (h * 0.22, h * 0.78):
            M.box((w + 0.02, d + 0.02, 0.05), (0, 0, z), mat=M.m('wood_mid'), bevel=0.006)
        for sx in (-1, 1):
            M.box((0.03, d + 0.01, h), (sx * w / 2, 0, h / 2), mat=M.m('wood_dark'), bevel=0.004)
        for sy in (-1, 1):
            M.box((w + 0.01, 0.03, h), (0, sy * d / 2, h / 2), mat=M.m('wood_dark'), bevel=0.004)
        if v == 'basket':
            M.cyl(w * 0.06, 0.16, (w * 0.3, 0, h + 0.08), rot=(0, 0, 0), mat=M.m('roof_straw'), seg=8)
    elif v in ('jar', 'vase', 'amphora'):
        m = M.m(p.get('ceramic', 'terracotta'))
        M.cyl(w * 0.34, h * 0.5, (0, 0, h * 0.25), r2=w * 0.5, mat=m, seg=18, bevel=0.01)
        M.cyl(w * 0.5, h * 0.32, (0, 0, h * 0.66), r2=w * 0.3, mat=m, seg=18, bevel=0.01)
        M.cyl(w * 0.34, h * 0.08, (0, 0, h * 0.86), mat=M.m('stone_dark'), seg=18)
        M.cyl(w * 0.52, 0.03, (0, 0, h * 0.42), mat=M.m('gold'), seg=18, bevel=0.0)
    elif v in ('bucket', 'tub'):
        m = M.m(p.get('mat', 'metal_dark'))
        M.cyl(w / 2, h, (0, 0, h / 2), r2=w / 2 * 0.86, mat=m, seg=16, bevel=0.008)
        M.cyl(w / 2 * 0.92, 0.03, (0, 0, h * 0.95), mat=M.m('metal'), seg=16)
        M.box((w * 0.9, 0.03, 0.03), (0, 0, h * 0.98), rot=(0, 90, 0), mat=M.m('metal'), bevel=0.004)
    else:
        m = M.m(p.get('mat', 'wood_mid'))
        M.box((w, d, h), (0, 0, h / 2), mat=m, bevel=0.014)
        M.box((w * 0.9, d * 0.9, 0.02), (0, 0, h + 0.01), mat=M.m('roof_straw'), bevel=0.004)
    return None


def _rack(M, p):
    w, d, h = p['w'], p['d'], p['h']
    wood = M.m(p.get('wood', 'wood_dark'))
    for sx in (-1, 1):
        for sy in (-1, 1):
            M.cyl(0.03, h, (sx * w * 0.44, sy * d * 0.4, h / 2), mat=wood, seg=8, bevel=0.004)
    for k in range(3):
        z = h * (0.3 + k * 0.28)
        M.cyl(0.025, w, (0, -d * 0.4, z), rot=(0, 90, 0), mat=wood, seg=8, bevel=0.0)
        M.cyl(0.025, w, (0, d * 0.4, z), rot=(0, 90, 0), mat=wood, seg=8, bevel=0.0)
    # 挂的东西
    for k in range(4):
        M.box((w * 0.16, 0.03, h * 0.22), (-w * 0.3 + k * w * 0.2, -d * 0.4, h * 0.4),
              mat=M.m(['fabric_cream', 'fabric_blue', 'wall_pink', 'fabric_green'][k]), bevel=0.004)
    return None


def _stand(M, p):
    w, d, h = p['w'], p['d'], p['h']
    wood = M.m(p.get('wood', 'wood_mid'))
    M.box((w, d, 0.05), (0, 0, h), mat=M.m('wood_light'), bevel=0.01)
    for sx in (-1, 1):
        M.box((0.05, d * 0.9, h), (sx * w * 0.4, 0, h / 2), mat=wood, bevel=0.008)
    M.box((w * 0.9, d * 0.9, 0.04), (0, 0, h * 0.32), mat=wood, bevel=0.008)
    M.cyl(0.12, 0.18, (0, 0, h + 0.1), mat=M.m(p.get('ceramic', 'white')), seg=12, bevel=0.01)
    return None


def _road(M, p):
    """路面块：板块 + 表层铺装（石/砖/木/沥青/台阶/排水）。对应 roads 贴图层。"""
    v = p.get('variant', 'stone')
    w, d, h = p['w'], p['d'], p.get('h', 0.14)
    base = M.m('stone_dark')
    M.box((w, d, h * 0.7), (0, 0, h * 0.35), mat=base, bevel=0.012)
    top = h * 0.7
    if v in ('stone', 'cobble', 'heritage', 'pattern', 'nature'):
        # 一块块铺石：错缝网格
        rows = max(2, int(d / 0.34))
        cols = max(2, int(w / 0.4))
        key = p.get('stone', 'stone_warm')
        for r in range(rows):
            off = 0.5 if r % 2 else 0.0
            for c in range(cols):
                x = -w / 2 + w * (c + off + 0.5) / (cols + 1)
                y = -d / 2 + d * (r + 0.5) / rows
                sw = w / (cols + 1) * (0.72 + 0.16 * ((r * 3 + c) % 3) / 2)
                M.box((sw, d / rows * 0.82, h * 0.3),
                      (x, y, top + h * 0.13),
                      mat=M.m([key, 'stone', 'stone_dark'][(r + c) % 3]), bevel=0.014)
    elif v in ('brick', 'urban', 'industry'):
        rows = max(3, int(d / 0.16))
        cols = max(3, int(w / 0.3))
        for r in range(rows):
            off = 0.5 if r % 2 else 0.0
            for c in range(cols):
                x = -w / 2 + w * (c + off + 0.5) / (cols + 1)
                y = -d / 2 + d * (r + 0.5) / rows
                M.box((w / (cols + 1) * 0.86, d / rows * 0.78, h * 0.22),
                      (x, y, top + h * 0.1), mat=M.m('brick'), bevel=0.006)
    elif v in ('wood', 'trail'):
        n = max(4, int(d / 0.22))
        for i in range(n):
            y = -d / 2 + d * (i + 0.5) / n
            M.box((w * 0.98, d / n * 0.9, h * 0.26), (0, y, top + h * 0.12),
                  mat=M.m('wood_light' if i % 2 else 'wood_mid'), bevel=0.008)
        for sx in (-1, 1):
            M.box((0.1, d, h * 0.2), (sx * w * 0.47, 0, top + h * 0.08), mat=M.m('wood_dark'), bevel=0.008)
    elif v == 'step':
        n = p.get('steps', 3)
        for i in range(n):
            M.box((w, d, h * 0.3), (0, 0, top + h * 0.15 + i * h * 0.28),
                  mat=M.m(p.get('stone', 'stone_warm')), bevel=0.014)
            M.box((w * 0.98, d * 0.3, h * 0.06), (0, -d * 0.3, top + h * 0.3 + i * h * 0.28),
                  mat=M.m('stone_dark'), bevel=0.006)
    elif v == 'metal':
        M.box((w, d, h * 0.22), (0, 0, top + h * 0.1), mat=M.m('metal_dark'), bevel=0.01)
        for i in range(int(d / 0.14)):
            M.box((w * 0.9, 0.04, h * 0.1), (0, -d / 2 + d * (i + 0.5) / int(d / 0.14),
                                            top + h * 0.2), mat=M.m('metal'), bevel=0.004)
    else:  # asphalt / earth / 其它
        M.box((w, d, h * 0.24), (0, 0, top + h * 0.1),
              mat=M.m('ink' if v == 'asphalt' else 'soil'), bevel=0.008)
        if v == 'asphalt' and p.get('stripe', True):
            for i in range(int(w / 0.6)):
                if i % 2:
                    continue
                M.box((w / int(w / 0.6) * 0.5, 0.1, h * 0.05),
                      (-w / 2 + w * (i + 0.5) / int(w / 0.6), 0, top + h * 0.24),
                      mat=M.m('white'), bevel=0.0)
    # 侧缘石
    if p.get('kerb', True):
        for sy in (-1, 1):
            M.box((w, 0.16, h * 0.5), (0, sy * (d / 2 - 0.02), h * 0.5),
                  mat=M.m('stone_warm'), bevel=0.012)
    return None


FURNITURE = {
    'chair': _chair, 'stool': _stool, 'table': _table, 'desk': _desk, 'shelf': _shelf,
    'case': _case, 'bed': _bed, 'sofa': _sofa, 'soft': _soft, 'lamp': _lamp,
    'mirror': _mirror, 'clock': _clock, 'picture': _picture, 'kitchen': _kitchen,
    'appliance': _appliance, 'storage': _storage, 'rack': _rack, 'stand': _stand,
}


# ==================================================================== 站台/基建
def _gate(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m(p.get('metal', 'metal'))
    for sx in (-1, 1):
        M.box((0.24, d, h), (sx * w * 0.4, 0, h / 2), mat=m, bevel=0.02)
        M.box((0.3, d + 0.06, 0.12), (sx * w * 0.4, 0, h), mat=M.m('metal_dark'), bevel=0.012)
    M.box((w * 0.5, 0.06, 0.3), (0, 0, h * 0.72), mat=M.m('glass_warm', rough=0.2), bevel=0.0)
    for sx in (-1, 1):
        M.box((0.04, d * 0.8, h * 0.42), (sx * w * 0.16, 0, h * 0.5), rot=(0, 0, 0),
              mat=M.m('glow', emit=1.0, emit_strength=1.4), bevel=0.006)
    M.box((w * 0.9, 0.06, 0.24), (0, -d / 2 - 0.04, h * 0.86), mat=M.m('fabric_blue'), bevel=0.01)
    return None


def _kiosk(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m(p.get('wood', 'wood_mid'))
    M.box((w, d, h * 0.86), (0, 0, h * 0.43), mat=m, bevel=0.02)
    M.tile_roof(w * 1.06, d * 1.06, h * 0.16, h * 0.86, p.get('roof', 'red'), overhang=0.3,
                rafter=False, gutter=False)
    M.box((w * 0.7, 0.05, h * 0.36), (0, -d / 2 - 0.02, h * 0.6), mat=M.m('glass_warm', rough=0.18))
    M.box((w * 0.76, 0.12, 0.06), (0, -d / 2 - 0.05, h * 0.4), mat=M.m('wood_dark'), bevel=0.008)
    M.sign((0, -d / 2 - 0.06, h * 0.92), w * 0.6, 0.3, mat_key='wood_light')
    for k in range(3):
        M.box((w * 0.16, 0.03, h * 0.14), (-w * 0.25 + k * w * 0.25, -d / 2 - 0.05, h * 0.66),
              mat=M.m(['fabric_red', 'fabric_blue', 'fabric_green'][k]), bevel=0.004)
    return None


def _machine(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m(p.get('metal', 'wall_ash'))
    M.box((w, d, h), (0, 0, h / 2), mat=m, bevel=0.03)
    M.box((w * 0.78, 0.05, h * 0.36), (0, -d / 2 - 0.02, h * 0.62), mat=M.m('glass', rough=0.15), bevel=0.0)
    M.box((w * 0.5, 0.04, h * 0.14), (0, -d / 2 - 0.03, h * 0.34), mat=M.m('metal_dark'), bevel=0.008)
    for k in range(4):
        M.cyl(0.03, 0.03, (-w * 0.24 + k * w * 0.16, -d / 2 - 0.04, h * 0.18), mat=M.m('gold'), seg=8)
    M.box((w * 0.86, 0.03, h * 0.1), (0, -d / 2 - 0.03, h * 0.88), mat=M.m('fabric_blue'), bevel=0.004)
    return None


def _screen(M, p):
    w, d, h = p['w'], p['d'], p['h']
    M.box((0.1, 0.1, h * 0.5), (0, 0, h * 0.25), mat=M.m('metal_dark'), bevel=0.01)
    M.box((w, d, h * 0.5), (0, 0, h * 0.75), mat=M.m('metal_dark'), bevel=0.02)
    M.box((w * 0.92, 0.04, h * 0.42), (0, -d / 2 - 0.03, h * 0.75), mat=M.m('glass_warm', rough=0.12), bevel=0.0)
    for k in range(4):
        M.box((w * 0.7, 0.01, 0.03), (0, -d / 2 - 0.06, h * (0.6 + k * 0.09)), mat=M.m('ink'), bevel=0.0)
    return None


def _bench(M, p):
    w, d, h = p['w'], p['d'], p['h']
    wood = M.m(p.get('wood', 'wood_light'))
    for i in range(4):
        M.box((w * 0.94, d * 0.12, 0.04), (0, -d * 0.36 + i * d * 0.24, h), mat=wood, bevel=0.008)
    for sx in (-1, 1):
        M.box((0.09, d * 0.9, 0.06), (sx * w * 0.4, 0, h - 0.05), mat=M.m('metal_dark'), bevel=0.008)
        M.box((0.09, 0.09, h - 0.05), (sx * w * 0.4, -d * 0.36, (h - 0.05) / 2), mat=M.m('metal_dark'), bevel=0.008)
        M.box((0.09, 0.09, h - 0.05), (sx * w * 0.4, d * 0.36, (h - 0.05) / 2), mat=M.m('metal_dark'), bevel=0.008)
    for k in range(3):
        M.box((w * 0.94, 0.04, 0.08), (0, d * 0.34, h + 0.14 + k * 0.12), rot=(10, 0, 0), mat=wood, bevel=0.008)
    return None


def _seat_row(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m(p.get('shell', 'fabric_blue'))
    n = p.get('seats', 4)
    M.box((w, d, 0.08), (0, 0, h * 0.52), mat=m, bevel=0.03)
    for i in range(n):
        x = -w / 2 + w * (i + 0.5) / n
        M.box((w / n * 0.84, d * 0.9, 0.1), (x, 0, h * 0.6), mat=m, bevel=0.03)
        M.box((w / n * 0.84, 0.08, h * 0.3), (x, d * 0.4, h * 0.76), mat=m, bevel=0.02)
        M.box((w / n * 0.8, d * 0.86, 0.06), (x, 0, h * 0.52), mat=M.m('metal_dark'), bevel=0.02)
    for sx in (-1, 1):
        M.box((0.06, d * 0.8, h * 0.52), (sx * w * 0.48, 0, h * 0.26), mat=M.m('metal_dark'), bevel=0.008)
    return None


def _bin(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m(p.get('shell', 'fabric_green'))
    M.cyl(w / 2, h * 0.9, (0, 0, h * 0.45), mat=m, seg=16, bevel=0.01)
    M.cyl(w / 2 + 0.02, 0.06, (0, 0, h * 0.9), mat=M.m('metal_dark'), seg=16, bevel=0.006)
    M.cyl(w / 2 * 0.8, 0.03, (0, 0, h * 0.94), mat=M.m('ink'), seg=16)
    M.box((w * 0.3, 0.06, h * 0.1), (0, -w / 2 * 0.9, h * 0.72), mat=M.m('ink'), bevel=0.008)
    return None


def _fountain(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m('stone_warm')
    M.cyl(w / 2, h * 0.5, (0, 0, h * 0.25), mat=m, seg=20, bevel=0.016)
    M.cyl(w / 2 * 0.86, 0.04, (0, 0, h * 0.5), mat=M.m('water'), seg=20)
    M.cyl(w * 0.06, h * 0.6, (0, 0, h * 0.8), mat=m, seg=12, bevel=0.01)
    M.cyl(w * 0.24, 0.1, (0, 0, h * 1.08), mat=m, seg=16, bevel=0.014)
    M.cyl(w * 0.04, h * 0.12, (0, 0, h * 1.14), mat=M.m('water'), seg=10)
    return None


def _post(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m(p.get('metal', 'metal_dark'))
    M.cyl(w / 2 * 0.9, 0.14, (0, 0, 0.07), mat=M.m('stone_dark'), seg=12)
    M.cyl(w / 2 * 0.6, h * 0.9, (0, 0, h * 0.45), mat=m, seg=10, bevel=0.006)
    if p.get('lamp'):
        M.cyl(w * 0.9, h * 0.12, (0, 0, h * 0.94), r2=w * 0.5, mat=M.m('glow', emit=1.0, emit_strength=2.4), seg=12)
        M.cyl(w * 1.1, 0.06, (0, 0, h * 1.01), mat=m, seg=12)
    if p.get('sign'):
        M.box((w * 3, 0.05, h * 0.12), (0, -w * 0.6, h * 0.78), mat=M.m('fabric_blue'), bevel=0.008)
    return None


def _shelter(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m('metal_dark')
    M.box((w, d, 0.1), (0, 0, 0.05), mat=M.m('stone_warm'), bevel=0.014)
    for sx in (-1, 1):
        for sy in (-1, 1):
            M.cyl(0.06, h, (sx * w * 0.44, sy * d * 0.4, h / 2), mat=m, seg=8, bevel=0.004)
    M.box((w * 1.04, d * 1.1, 0.1), (0, 0, h), rot=(-3, 0, 0), mat=M.m(p.get('roof', 'roof_teal')), bevel=0.02)
    M.box((w * 0.92, 0.05, h * 0.72), (0, d * 0.42, h * 0.6), mat=M.m('glass', rough=0.15))
    M.box((w * 0.6, 0.42, 0.07), (0, -d * 0.1, h * 0.42), mat=M.m('wood_light'), bevel=0.01)
    for sx in (-1, 1):
        M.box((0.06, 0.42, h * 0.36), (sx * w * 0.3, -d * 0.1, h * 0.24), mat=m, bevel=0.006)
    return None


def _tower(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m(p.get('stone', 'stone_warm'))
    M.cyl(w / 2, h * 0.72, (0, 0, h * 0.36), mat=m, seg=16, bevel=0.02)
    M.cyl(w / 2 * 1.1, 0.16, (0, 0, h * 0.72), mat=M.m('stone_dark'), seg=16, bevel=0.02)
    M.cyl(w / 2 * 0.8, h * 0.16, (0, 0, h * 0.8), mat=M.m('wood_mid'), seg=16, bevel=0.01)
    M.cyl(w / 2 * 0.9, h * 0.12, (0, 0, h * 1.0), r2=0.12, mat=M.m(p.get('roof', 'roof_teal')), seg=16, bevel=0.014)
    for k in range(4):
        a = TAU * k / 4 + 0.4
        M.box((w * 0.1, 0.06, h * 0.1), (math.cos(a) * w * 0.3, math.sin(a) * w * 0.3, h * 0.78),
              mat=M.m('ink'), bevel=0.006)
    return None


def _bridge(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m('stone_warm')
    M.box((w, d, 0.22), (0, 0, h * 0.8), mat=m, bevel=0.02)
    n = 7
    for i in range(n):
        t = i / (n - 1)
        ang = math.pi * t
        x = -w * 0.36 + w * 0.72 * t
        z = h * 0.8 - h * 0.62 * math.sin(ang)
        M.box((w * 0.08, d * 0.94, 0.3), (x, 0, z), rot=(0, math.degrees(-math.cos(ang)) * 0.8, 0),
              mat=M.m('stone'), bevel=0.018)
    for sx in (-1, 1):
        M.box((w * 0.1, d * 0.96, h * 0.7), (sx * w * 0.45, 0, h * 0.36), mat=m, bevel=0.03)
    for k in range(int(w / 0.5)):
        M.box((0.05, d * 0.9, 0.03), (-w / 2 + w * (k + 0.5) / int(w / 0.5), 0, h * 0.92),
              mat=M.m('stone_dark'), bevel=0.0)
    return None


def _planter(M, p):
    w, d, h = p['w'], p['d'], p['h']
    m = M.m(p.get('stone', 'stone_warm'))
    M.box((w, d, h), (0, 0, h / 2), mat=m, bevel=0.04)
    M.box((w * 0.9, d * 0.9, 0.04), (0, 0, h - 0.02), mat=M.m('soil'), bevel=0.006)
    M.leaf_scatter((0, 0, h), min(w, d) * 0.32, p.get('leaf', 'leaf'), 5, 0.7)
    for k in range(3):
        a = TAU * k / 3
        M.sphere(0.07, (math.cos(a) * w * 0.2, math.sin(a) * d * 0.2, h + 0.16),
                 mat=M.m(['fabric_red', 'wall_pink', 'gold'][k]), seg=8, ring=5)
    return None


def _tree(M, p):
    w, h = p['w'], p['h']
    M.cyl(w * 0.06, h * 0.45, (0, 0, h * 0.22), r2=w * 0.045, mat=M.m('wood_dark'), seg=10, bevel=0.006)
    for k in range(3):
        a = TAU * k / 3 + 0.5
        M.cyl(w * 0.03, h * 0.3, (math.cos(a) * w * 0.12, math.sin(a) * w * 0.12, h * 0.5),
              rot=(0, 35 * math.cos(a), 0), mat=M.m('wood_mid'), seg=8, bevel=0.0)
    M.leaf_scatter((0, 0, h * 0.62), w * 0.5, p.get('leaf', 'leaf'), 6, 0.85)
    return None


def _tool(M, p):
    v = p.get('variant', 'hoe')
    h = p['h']
    M.cyl(0.028, h * 0.86, (0, 0, h * 0.43), mat=M.m('wood_light'), seg=8, bevel=0.004)
    hm = M.m('metal')
    if v in ('hoe', 'sickle'):
        M.box((0.2, 0.05, 0.22), (0.06, 0, h * 0.06), rot=(0, 20 if v == 'sickle' else 0, 0), mat=hm, bevel=0.008)
    elif v in ('rake', 'fork'):
        M.box((0.32, 0.04, 0.05), (0, 0, h * 0.08), mat=hm, bevel=0.006)
        for k in range(4):
            M.box((0.02, 0.02, 0.14), (-0.12 + k * 0.08, 0, h * 0.03), mat=hm, bevel=0.0)
    elif v in ('spade', 'shovel'):
        M.box((0.2, 0.03, 0.26), (0, 0, h * 0.08), mat=hm, bevel=0.01)
        M.box((0.06, 0.03, 0.1), (0, 0, h * 0.22), mat=hm, bevel=0.004)
    elif v in ('watering', 'can'):
        M.cyl(0.12, 0.24, (0, 0, h * 0.16), mat=hm, seg=14, bevel=0.01)
        M.cyl(0.03, 0.3, (0.18, 0, h * 0.3), rot=(0, 50, 0), mat=hm, seg=8, bevel=0.0)
        M.box((0.03, 0.03, 0.12), (-0.12, 0, h * 0.26), mat=hm, bevel=0.004)
    else:
        M.box((0.18, 0.04, 0.12), (0, 0, h * 0.08), mat=hm, bevel=0.008)
    return None


# ==================================================================== 载具
def _vehicle(M, p):
    v = p.get('variant', 'car')
    w, d, h = p['w'], p['d'], p['h']
    body = M.m(p.get('body', 'fabric_red'))
    glass = M.m('glass', rough=0.18)
    dark = M.m('metal_dark')
    if v in ('boat', 'ship', 'canoe', 'barge'):
        M.prism([(-w / 2, -d / 2), (w / 2, -d * 0.28), (w * 0.4, d / 2), (-w * 0.4, d / 2),
                 (-w / 2, -d * 0.28)], h * 0.55, (0, 0, 0), mat=body, bevel=0.02)
        M.prism([(-w * 0.44, -d * 0.34), (w * 0.44, -d * 0.2), (w * 0.36, d * 0.42),
                 (-w * 0.36, d * 0.42)], 0.06, (0, 0, h * 0.6), mat=M.m('wood_light'), bevel=0.01)
        if v in ('boat', 'ship'):
            M.box((w * 0.28, d * 0.56, h * 0.42), (w * 0.1, 0, h * 0.82), mat=M.m('wall_cream'), bevel=0.02)
            M.box((w * 0.3, d * 0.6, 0.08), (w * 0.1, 0, h * 1.05), mat=body, bevel=0.012)
            M.cyl(0.05, h * 1.2, (-w * 0.24, 0, h * 0.9), mat=dark, seg=8)
            for k in range(3):
                M.sphere(0.06, (-w * 0.24, 0, h * (0.9 + k * 0.12)), mat=M.m('glow', emit=1.0, emit_strength=1.6),
                         seg=8, ring=5)
    elif v in ('plane', 'airship', 'balloon'):
        M.cyl(w * 0.12, w * 0.8, (0, 0, h * 0.5), rot=(0, 90, 0), mat=body, seg=14, bevel=0.02)
        M.box((w * 0.24, d * 0.9, 0.06), (0, 0, h * 0.5), mat=body, bevel=0.01)
        M.box((w * 0.16, 0.06, h * 0.22), (-w * 0.36, 0, h * 0.62), mat=body, bevel=0.01)
        M.cyl(0.14, 0.1, (-w * 0.3, 0, h * 0.5), rot=(90, 0, 0), mat=glass, seg=12)
    else:
        # 轮式：车身 + 车窗 + 灯 + 轮
        M.box((w, d, h * 0.52), (0, 0, h * 0.42), mat=body, bevel=0.05)
        M.box((w * 0.62, d * 0.9, h * 0.34), (-w * 0.05, 0, h * 0.75), mat=body, bevel=0.05)
        for sx in (-1, 1):
            M.box((w * 0.56, 0.03, h * 0.24), (-w * 0.05, sx * d * 0.44, h * 0.78), mat=glass, bevel=0.0)
        M.box((0.04, d * 0.86, h * 0.22), (w * 0.28, 0, h * 0.78), mat=glass, bevel=0.0)
        for sy in (-1, 1):
            M.box((0.12, 0.08, 0.1), (w * 0.46, sy * d * 0.3, h * 0.42),
                  mat=M.m('glow', emit=1.0, emit_strength=2.0), bevel=0.016)
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.cyl(h * 0.16, 0.14, (sx * w * 0.32, sy * (d / 2 - 0.04), h * 0.16),
                      rot=(90, 0, 0), mat=M.m('ink'), seg=14, bevel=0.01)
                M.cyl(h * 0.09, 0.16, (sx * w * 0.32, sy * (d / 2 - 0.04), h * 0.16),
                      rot=(90, 0, 0), mat=M.m('metal'), seg=12, bevel=0.006)
        M.box((w * 0.98, d * 0.9, 0.06), (0, 0, h * 0.16), mat=dark, bevel=0.014)
    return None


BUILDINGS = {'house': house, 'shop': shop}
MISC = {
    'gate': _gate, 'kiosk': _kiosk, 'machine': _machine, 'screen': _screen,
    'bench': _bench, 'seat_row': _seat_row, 'bin': _bin, 'fountain': _fountain,
    'post': _post, 'shelter': _shelter, 'tower': _tower, 'bridge': _bridge,
    'planter': _planter, 'tree': _tree, 'tool': _tool, 'vehicle': _vehicle,
}
MISC.update({f'f_{k}': v for k, v in FURNITURE.items()})
# 别名：catalog 里有些家族名不带前缀 / 与家具同名
MISC['f_bench'] = _bench
MISC['storage'] = _storage
MISC['f_storage'] = _storage
MISC['f_bench_furniture'] = _bench
MISC['road'] = _road


def build(M, p):
    fam = p['family']
    if fam in BUILDINGS:
        return BUILDINGS[fam](M, p)
    if fam in MISC:
        return MISC[fam](M, p)
    raise KeyError(f'未知 family: {fam}')
# ==================================================================== 鸟 / 鱼（v3 生物）
BODY_SHAPES = {
    # (t, ry, rz, z_off) 相对体长 / 体半径
    'songbird': [(0.00, 0.16, 0.18, 0.00), (0.10, 0.52, 0.58, 0.02), (0.28, 0.92, 0.94, 0.03),
                 (0.50, 1.00, 1.00, 0.02), (0.70, 0.88, 0.90, 0.02), (0.86, 0.64, 0.70, 0.06),
                 (1.00, 0.44, 0.52, 0.10)],
    'wader':    [(0.00, 0.12, 0.14, 0.00), (0.12, 0.42, 0.46, 0.02), (0.34, 0.78, 0.82, 0.02),
                 (0.58, 0.86, 0.90, 0.02), (0.78, 0.70, 0.74, 0.04), (0.90, 0.52, 0.58, 0.08),
                 (1.00, 0.40, 0.46, 0.12)],
    'waterfowl':[(0.00, 0.18, 0.16, 0.00), (0.10, 0.60, 0.50, 0.02), (0.30, 0.98, 0.82, 0.03),
                 (0.52, 1.00, 0.86, 0.02), (0.72, 0.86, 0.80, 0.02), (0.88, 0.62, 0.62, 0.06),
                 (1.00, 0.42, 0.48, 0.10)],
    'raptor':   [(0.00, 0.16, 0.18, 0.00), (0.12, 0.54, 0.60, 0.02), (0.32, 0.94, 1.00, 0.03),
                 (0.54, 1.00, 1.02, 0.02), (0.74, 0.84, 0.88, 0.02), (0.88, 0.62, 0.68, 0.06),
                 (1.00, 0.46, 0.54, 0.10)],
    'parrot':   [(0.00, 0.18, 0.20, 0.00), (0.12, 0.58, 0.64, 0.02), (0.32, 0.96, 1.00, 0.03),
                 (0.54, 1.00, 1.00, 0.02), (0.74, 0.86, 0.90, 0.02), (0.88, 0.66, 0.72, 0.08),
                 (1.00, 0.50, 0.58, 0.14)],
    'swift':    [(0.00, 0.10, 0.12, 0.00), (0.12, 0.40, 0.44, 0.01), (0.32, 0.78, 0.82, 0.02),
                 (0.56, 0.92, 0.94, 0.02), (0.76, 0.80, 0.84, 0.02), (0.90, 0.56, 0.62, 0.04),
                 (1.00, 0.38, 0.44, 0.06)],
    'owl':      [(0.00, 0.20, 0.22, 0.00), (0.12, 0.62, 0.66, 0.02), (0.32, 1.00, 1.00, 0.03),
                 (0.56, 1.00, 1.00, 0.02), (0.76, 0.90, 0.92, 0.02), (0.90, 0.80, 0.84, 0.06),
                 (1.00, 0.72, 0.78, 0.10)],
}

BEAK = {'short': (0.20, 0.16), 'long': (0.62, 0.09), 'hooked': (0.24, 0.26),
        'flat': (0.34, 0.20), 'tiny': (0.10, 0.10), 'crossed': (0.18, 0.14)}


def _bird(M, p):
    """精模鸟：放样身体 + 反荫蔽 + 头/喙/眼 + 分层翼羽 + 扇尾 + 腿爪 + 冠羽。"""
    L = p['len']
    R = p['r']
    shape = p.get('shape', 'songbird')
    prof = BODY_SHAPES.get(shape, BODY_SHAPES['songbird'])
    top = p.get('top', 'wood_mid')
    belly = p.get('belly', 'wall_cream')
    wing_c = p.get('wing', top)
    beak_c = p.get('beak', 'gold')
    mt = M.m(top)
    mb = M.m(belly)
    mw = M.m(wing_c)
    mr = M.m('fabric_red') if p.get('accent') is None else M.m(p['accent'])

    # 身体
    rings = []
    for (t, ry, rz, zo) in prof:
        x = -0.5 * L + t * L * 0.92
        rings.append(M.ring(x, 0.0, zo * R, R * ry, R * rz, n=18,
                            flat_bottom=(0.55 if shape == 'waterfowl' else 0.0)))
    M.loft_rings(rings, mat=mt, mat_top=mt, mat_bottom=mb, cut=0.0, cap_start=True, cap_end=True)

    head_r = R * (0.62 if shape == 'owl' else 0.52)
    head_x = 0.5 * L * 0.92 + head_r * 0.15
    head_z = R * (0.30 if shape in ('wader',) else 0.20) + (0.10 * R if shape == 'owl' else 0)
    neck_len = p.get('neck', 0.0)
    if neck_len > 0.02:
        # 长颈：从胸部到头的放样
        nring = []
        for k in range(5):
            t = k / 4
            x = (0.5 * L * 0.90) * (1 - t) + head_x * t
            z = R * 0.1 * (1 - t) + (head_z + neck_len) * t
            rr = R * (0.34 - 0.16 * t)
            nring.append(M.ring(x, 0, z, rr, rr * 0.94, n=14))
        M.loft_rings(nring, mat=mt, mat_top=mt, mat_bottom=mb, cut=0.0)
    M.sphere(head_r, (head_x, 0, head_z + neck_len), mat=mt, seg=16, ring=10)
    # 脸颊/喉部浅色
    M.sphere(head_r * 0.72, (head_x + head_r * 0.28, 0, head_z + neck_len - head_r * 0.42),
             mat=mb, seg=12, ring=8, scale=(1, 0.9, 0.7))

    # 喙（上下两片）
    btype = p.get('beak_type', 'short')
    bl, bh = BEAK.get(btype, BEAK['short'])
    bx = head_x + head_r * 0.85
    bz = head_z + neck_len + head_r * 0.08
    mbeak = M.m(beak_c)
    M.cyl(bh * R * 1.1, bl * L, (bx + bl * L * 0.5, 0, bz + bh * R * 0.18),
          r2=bh * R * 0.12, rot=(0, 90, 0), mat=mbeak, seg=12, bevel=0.0)
    M.cyl(bh * R * 0.9, bl * L * 0.94, (bx + bl * L * 0.48, 0, bz - bh * R * 0.34),
          r2=bh * R * 0.1, rot=(0, 90, 0), mat=mbeak, seg=12, bevel=0.0)
    if btype == 'hooked':
        M.cyl(bh * R * 0.7, bl * L * 0.5, (bx + bl * L * 0.86, 0, bz - bh * R * 0.45),
              r2=0.006, rot=(0, 150, 0), mat=mbeak, seg=10, bevel=0.0)

    # 眼（带高光）
    for sy in (-1, 1):
        M.eye((head_x + head_r * 0.42, sy * head_r * 0.62, head_z + neck_len + head_r * 0.22),
              head_r * 0.26, iris=p.get('eye', 'ink'))

    # 翼：肩 → 翼尖的薄板 + 三层飞羽
    for sy in (-1, 1):
        sx = 0.06 * L
        sh = Vector((sx, sy * R * 0.78, R * 0.16))
        tip = Vector((sx - L * p.get('wing_len', 0.46), sy * R * 1.05, R * 0.16 + L * 0.10))
        M.blade(sh, tip, R * 0.42, mat=mw, curve=0.06, up=Vector((0, 0, 1)), swell=0.22)
        # 飞羽：沿翼后缘排开
        nf = p.get('feathers', 9)
        d = (tip - sh).normalized()
        side = Vector((0, sy, 0))
        for i in range(nf):
            f = i / max(1, nf - 1)
            root = sh + d * (L * p.get('wing_len', 0.46) * (0.25 + 0.7 * f))
            ln = L * (0.30 - 0.12 * f)
            M.feather(root, (d * 0.5 - side * 0.55 - Vector((0, 0, 0.05))).normalized(),
                      ln, L * 0.045, mat=mw, curve=-0.10, segs=3)
    # 尾羽
    nt = p.get('tail_feathers', 7)
    tlen = L * p.get('tail_len', 0.34)
    for i in range(nt):
        a = (i / max(1, nt - 1) - 0.5) * p.get('tail_spread', 0.5)
        root = Vector((-0.5 * L * 0.92, 0, R * 0.08))
        d = Vector((-1, math.sin(a), 0.02 + abs(a) * 0.12)).normalized()
        M.feather(root, d, tlen * (1 - 0.18 * abs(a)), L * 0.05, mat=mw, curve=0.05, segs=3)

    # 腿爪
    leg = p.get('leg', 0.22) * L
    if leg > 0.01:
        for sy in (-1, 1):
            hx = 0.12 * L
            hz = -R * 0.55
            M.cyl(R * 0.055, leg, (hx, sy * R * 0.34, hz - leg * 0.5), mat=M.m('gold'), seg=8, bevel=0.0)
            for k in range(3):
                ang = -0.5 + k * 0.5
                M.cyl(R * 0.035, L * 0.09, (hx + L * 0.05 + math.cos(ang) * L * 0.03,
                                            sy * R * 0.34 + math.sin(ang) * L * 0.03,
                                            hz - leg + 0.004),
                      rot=(0, 90, 0), mat=M.m('gold'), seg=6, bevel=0.0)
    # 冠羽
    if p.get('crest'):
        for k in range(4):
            M.feather((head_x + head_r * 0.1, (k - 1.5) * head_r * 0.24, head_z + neck_len + head_r * 0.85),
                      Vector((0.25, 0, 1)).normalized(), head_r * (1.5 + 0.3 * (k % 2)),
                      head_r * 0.18, mat=mr, curve=0.2, segs=3)
    return None


FISH_PROFILE = {
    # (t, 高比, 宽比)  t: 0 尾 → 1 头
    'torpedo': [(0.00, 0.10, 0.06), (0.10, 0.34, 0.16), (0.28, 0.62, 0.26), (0.48, 0.76, 0.30),
                (0.68, 0.72, 0.28), (0.84, 0.58, 0.22), (0.94, 0.40, 0.16), (1.00, 0.26, 0.10)],
    'deep':    [(0.00, 0.08, 0.04), (0.10, 0.30, 0.10), (0.30, 0.78, 0.16), (0.50, 1.00, 0.18),
                (0.70, 0.94, 0.16), (0.86, 0.68, 0.12), (0.95, 0.42, 0.08), (1.00, 0.28, 0.06)],
    'eel':     [(0.00, 0.06, 0.05), (0.12, 0.16, 0.12), (0.32, 0.22, 0.16), (0.52, 0.24, 0.17),
                (0.72, 0.22, 0.15), (0.88, 0.18, 0.12), (0.96, 0.14, 0.09), (1.00, 0.10, 0.06)],
    'flat':    [(0.00, 0.10, 0.03), (0.12, 0.36, 0.05), (0.32, 0.70, 0.07), (0.52, 0.86, 0.08),
                (0.72, 0.80, 0.07), (0.86, 0.58, 0.06), (0.95, 0.38, 0.04), (1.00, 0.24, 0.03)],
    'angler':  [(0.00, 0.08, 0.06), (0.12, 0.30, 0.18), (0.30, 0.52, 0.26), (0.50, 0.76, 0.32),
                (0.68, 0.92, 0.34), (0.82, 0.86, 0.30), (0.92, 0.62, 0.22), (1.00, 0.40, 0.14)],
}


def _fish(M, p):
    """精模鱼：放样身体 + 反荫蔽 + 背/臀/尾/胸/腹鳍 + 眼 + 鳃 + 鳞列 + 斑纹。"""
    L = p['len']
    H = p['hgt']
    W = p.get('wid', H * 0.42)
    shape = p.get('shape', 'torpedo')
    prof = FISH_PROFILE.get(shape, FISH_PROFILE['torpedo'])
    top = p.get('top', 'metal')
    belly = p.get('belly', 'wall_ash')
    fin_c = p.get('fin', 'fabric_red')
    mt = M.m(top)
    mb = M.m(belly)
    mf = M.m(fin_c)

    rings = []
    for (t, hr, wr) in prof:
        x = -0.5 * L + t * L
        rings.append(M.ring(x, 0.0, 0.0, W * wr, H * hr * 0.5, n=20))
    M.loft_rings(rings, mat=mt, mat_top=mt, mat_bottom=mb, cut=-H * 0.02,
                 cap_start=True, cap_end=True)

    # 尾鳍（分叉两片 / 扇形）
    tail_x = -0.5 * L
    fork = p.get('fork', 0.4)
    if fork > 0.2:
        for sz in (-1, 1):
            M.blade((tail_x, 0, 0),
                    (tail_x - L * 0.16, 0, sz * H * (0.30 + fork * 0.35)),
                    H * 0.05, mat=mf, curve=0.04, up=Vector((0, 0, 1)), swell=0.1)
    else:
        M.blade((tail_x, 0, 0), (tail_x - L * 0.18, 0, 0), H * 0.30, mat=mf,
                curve=0.0, up=Vector((1, 0, 0)), swell=0.4)
        M.blade((tail_x, 0, 0), (tail_x - L * 0.16, 0, H * 0.22), H * 0.12, mat=mf)
        M.blade((tail_x, 0, 0), (tail_x - L * 0.16, 0, -H * 0.22), H * 0.12, mat=mf)

    # 背鳍 / 臀鳍
    M.blade((-0.02 * L, 0, H * 0.44), (0.16 * L, 0, H * (0.44 + p.get('dorsal', 0.26))),
            H * 0.14, mat=mf, curve=0.03, up=Vector((0, 0, 1)), swell=0.3)
    M.blade((-0.10 * L, 0, -H * 0.36), (-0.22 * L, 0, -H * (0.36 + p.get('anal', 0.22))),
            H * 0.11, mat=mf, curve=-0.02, up=Vector((0, 0, 1)), swell=0.25)
    # 胸鳍 / 腹鳍
    for sy in (-1, 1):
        M.blade((0.18 * L, sy * W * 0.42, -H * 0.10),
                (0.06 * L, sy * W * 0.62, -H * 0.20), H * 0.10, mat=mf,
                curve=0.02, up=Vector((0, 0, 1)), swell=0.2)
        M.blade((0.02 * L, sy * W * 0.34, -H * 0.30),
                (-0.08 * L, sy * W * 0.42, -H * 0.42), H * 0.07, mat=mf,
                curve=0.01, up=Vector((0, 0, 1)), swell=0.15)

    # 眼（大眼、带高光）
    for sy in (-1, 1):
        M.eye((0.34 * L, sy * W * 0.34, H * 0.12),
              H * p.get('eye_r', 0.11), iris=p.get('eye', 'white'))
    # 鳃盖弧
    for sy in (-1, 1):
        for k in range(3):
            M.box((H * 0.012, H * 0.012, H * 0.22),
                  (0.24 * L - k * H * 0.012, sy * W * 0.30, 0),
                  rot=(k * 3 - 3, 0, 0), mat=M.m('metal_dark'), bevel=0.0)
    # 嘴
    M.cyl(H * 0.05, H * 0.06, (0.5 * L - H * 0.02, 0, -H * 0.04), r2=H * 0.035,
          rot=(0, 90, 0), mat=M.m('ink'), seg=10, bevel=0.0)
    # 鳞列（沿体侧的细棱，也是最费面的一块细节）
    rows = p.get('scale_rows', 5)
    for r in range(rows):
        zc = -H * 0.22 + r * H * 0.11
        for sy in (-1, 1):
            pts = []
            for k in range(9):
                t = 0.12 + 0.72 * k / 8
                x = -0.5 * L + t * L
                hr = H * 0.5 * (0.55 + 0.35 * math.sin(math.pi * t))
                z = zc + H * 0.02 * math.sin(math.pi * t)
                yy = sy * (W * 0.30 * (0.6 + 0.4 * math.sin(math.pi * t)))
                pts.append(Vector((x, yy, z)))
            M.quad_strip([[pt, pt + Vector((0, 0, H * 0.012))] for pt in pts],
                         mat=M.m(top), smooth=True)
    # 斑纹（条纹 / 斑点）
    if p.get('stripes'):
        for k in range(p.get('stripes', 0)):
            t = 0.28 + 0.11 * k
            M.cyl(W * 0.34, H * 0.012, (-0.5 * L + t * L, 0, 0), rot=(90, 0, 0),
                  mat=M.m('wall_cream'), seg=16, bevel=0.0)
    if p.get('spots'):
        for k in range(p.get('spots', 0)):
            a = TAU * k / max(1, p.get('spots', 1))
            M.sphere(H * 0.045, (-0.05 * L + math.cos(a) * L * 0.14, 0,
                                 math.sin(a) * H * 0.2), mat=M.m('white'), seg=8, ring=5)
    # 触须（鲇/鲟）
    if p.get('whiskers'):
        for sy in (-1, 1):
            M.cyl(H * 0.008, L * 0.14, (0.46 * L, sy * W * 0.16, -H * 0.10),
                  rot=(0, 150, sy * 12), mat=M.m('ink'), seg=6, bevel=0.0)
    return None


MISC['bird'] = _bird
MISC['fish'] = _fish

# 高细节生物（覆盖前面注册的简版）
from creatures import build_bird as _bird_hi, build_fish as _fish_hi
MISC['bird'] = _bird_hi
MISC['fish'] = _fish_hi
