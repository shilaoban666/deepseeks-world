"""150 件的具体造型。每个 builder(M, params) 往 Model 里堆部件。"""
import math
from mathutils import Vector
from lib import Model, P, ROOF_KEYS

TAU = math.tau


# ------------------------------------------------------------------ 通用墙窗
def win_face(M, cx, cy, cz, w, h, nx, ny, frame='wood_dark', glass='glass_warm',
             shutters=False, cols=2, rows=1, sill=True, bar=False):
    """在朝 (nx,ny) 的墙面上开一扇带框、中挺、窗台的窗。"""
    fm = M.m(frame)
    gm = M.m(glass, rough=0.25)
    t = 0.08
    # 玻璃
    if ny:
        M.box((w, 0.03, h), (cx, cy, cz), mat=gm, bevel=0.0)
        M.box((w + 0.16, 0.09, 0.08), (cx, cy + ny * 0.02, cz + h / 2), mat=fm, bevel=0.01)
        M.box((w + 0.16, 0.09, 0.08), (cx, cy + ny * 0.02, cz - h / 2), mat=fm, bevel=0.01)
        M.box((0.08, 0.09, h), (cx - w / 2, cy + ny * 0.02, cz), mat=fm, bevel=0.01)
        M.box((0.08, 0.09, h), (cx + w / 2, cy + ny * 0.02, cz), mat=fm, bevel=0.01)
        for i in range(1, cols):
            M.box((0.045, 0.08, h), (cx - w / 2 + w * i / cols, cy + ny * 0.035, cz), mat=fm, bevel=0.006)
        for i in range(1, rows + 1):
            M.box((w, 0.08, 0.045), (cx, cy + ny * 0.035, cz - h / 2 + h * i / (rows + 1)), mat=fm, bevel=0.006)
        if sill:
            M.box((w + 0.32, 0.2, 0.08), (cx, cy + ny * 0.1, cz - h / 2 - 0.11), mat=M.m('stone_warm'), bevel=0.012)
        if shutters:
            for s in (-1, 1):
                M.box((0.06, 0.08, h * 1.02), (cx + s * (w / 2 + 0.25), cy + ny * 0.03, cz),
                      mat=M.m('fabric_green'), bevel=0.008)
        if bar:
            for i in range(4):
                M.box((0.03, 0.03, h), (cx - w / 2 + w * (i + 0.5) / 4, cy + ny * 0.06, cz), mat=M.m('metal_dark'), bevel=0.0)
    else:
        M.box((0.03, w, h), (cx, cy, cz), mat=gm, bevel=0.0)
        M.box((0.09, w + 0.16, 0.08), (cx + nx * 0.02, cy, cz + h / 2), mat=fm, bevel=0.01)
        M.box((0.09, w + 0.16, 0.08), (cx + nx * 0.02, cy, cz - h / 2), mat=fm, bevel=0.01)
        M.box((0.09, 0.08, h), (cx + nx * 0.02, cy - w / 2, cz), mat=fm, bevel=0.01)
        M.box((0.09, 0.08, h), (cx + nx * 0.02, cy + w / 2, cz), mat=fm, bevel=0.01)
        for i in range(1, cols):
            M.box((0.08, 0.045, h), (cx + nx * 0.035, cy - w / 2 + w * i / cols, cz), mat=fm, bevel=0.006)
        for i in range(1, rows + 1):
            M.box((0.08, w, 0.045), (cx + nx * 0.035, cy, cz - h / 2 + h * i / (rows + 1)), mat=fm, bevel=0.006)
        if sill:
            M.box((0.2, w + 0.32, 0.08), (cx + nx * 0.1, cy, cz - h / 2 - 0.11), mat=M.m('stone_warm'), bevel=0.012)
        if shutters:
            for s in (-1, 1):
                M.box((0.08, 0.06, h * 1.02), (cx + nx * 0.03, cy + s * (w / 2 + 0.25), cz),
                      mat=M.m('fabric_green'), bevel=0.008)


def chimney(M, x, y, z0, h=1.6, w=0.55):
    M.box((w, w, h), (x, y, z0 + h / 2), mat=M.m('brick'), bevel=0.02)
    M.box((w + 0.14, w + 0.14, 0.12), (x, y, z0 + h), mat=M.m('stone_dark'), bevel=0.02)
    M.box((w * 0.5, w * 0.5, 0.1), (x, y, z0 + h + 0.1), mat=M.m('ink'), bevel=0.01)


def flower_box(M, x, y, z, w=1.0, nx=0, ny=-1):
    M.box((w, 0.22 if ny else 0.24, 0.26), (x, y, z), mat=M.m('wood_mid'), bevel=0.02)
    for i in range(int(w / 0.26)):
        fx = x - w / 2 + w * (i + 0.5) / max(1, int(w / 0.26))
        M.sphere(0.1, (fx, y + ny * 0.02, z + 0.16), mat=M.m('leaf_light' if i % 2 else 'leaf'), seg=8, ring=5)
        M.sphere(0.07, (fx + 0.05, y + ny * 0.05, z + 0.24),
                 mat=M.m(['fabric_red', 'fabric_cream', 'wall_pink'][i % 3]), seg=8, ring=5)


# ------------------------------------------------------------------ 建筑
def building(M, p):
    w, d, h = p['dims']
    floors = p.get('floors', 1)
    roofk = p.get('roof', 'red')
    variant = p.get('variant', 'timber')
    wall = {'cottage': 'wall_cream', 'timber': 'wall_butter', 'stone': 'stone_warm',
            'stilt': 'wood_light', 'attached': 'wall_pink', 'barn': 'wood_mid',
            'tower_house': 'stone_warm', 'shopfront': 'wall_cream'}.get(variant, 'wall_cream')
    wm = M.m(wall, rough=0.88)

    base_h = 0.35
    M.plinth(w, d, base_h)
    # 屋顶占整体高度的约 30%，墙身吃掉剩下的——保证总高 = dims[2]
    roof_rise = (h - base_h) * 0.30
    body_h = (h - base_h) - roof_rise
    # 墙体
    M.box((w, d, body_h), (0, 0, base_h + body_h / 2), mat=wm, bevel=0.02)
    # 二层挑出（宫崎骏式的木构挑楼）
    story = body_h / floors
    if variant == 'timber' and floors >= 2:
        M.box((w + 0.22, d + 0.22, story * 0.96), (0, 0, base_h + story * 1.5), mat=wm, bevel=0.02)
        for sx in (-1, 1):
            M.box((0.1, d + 0.26, 0.1), (sx * (w / 2 + 0.1), 0, base_h + story), mat=M.m('wood_dark'), bevel=0.01)

    if variant in ('timber', 'shopfront', 'cottage', 'attached'):
        M.timber(w, d, base_h + 0.05, h - 0.05, 'wood_dark', density=0.8)
    if variant == 'stone':
        for i in range(5):
            M.box((w + 0.02, 0.04, 0.1), (0, -d / 2 - 0.02, base_h + body_h * (i + 1) / 5.6),
                  mat=M.m('stone_dark'), bevel=0.006)
        for i in range(4):
            M.box((0.04, d + 0.02, 0.1), (-w / 2 - 0.02, 0, base_h + body_h * (i + 1) / 5.6),
                  mat=M.m('stone_dark'), bevel=0.006)
    if variant == 'stilt':
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.cyl(0.11, 1.0, (sx * (w / 2 - 0.4), sy * (d / 2 - 0.4), 0.5 - base_h), mat=M.m('wood_dark'), seg=10)

    # 门窗
    nwin = 3 if w > 7 else 2
    for f in range(floors):
        zc = base_h + story * f + story * 0.58
        for i in range(nwin):
            x = -w / 2 + w * (i + 0.5) / nwin
            if f == 0 and abs(x) < 1.3:
                continue
            win_face(M, x, -d / 2 - 0.02, zc, min(1.05, w / (nwin + 1.4)), min(1.3, story * 0.52),
                     0, -1, shutters=(variant in ('cottage', 'attached')),
                     glass='glass_warm' if not p.get('snow') else 'glass')
        if floors >= 2 and f > 0:
            for i in range(2):
                win_face(M, -w / 2 - 0.02, -d / 2 + d * (i + 0.5) / 2, zc, 0.8, min(1.1, story * 0.5),
                         -1, 0, shutters=False)
    # 门 + 雨棚
    M.door((0, -d / 2 - 0.06, base_h), 0.98, min(2.1, story * 0.86), 'y', 'wood_mid')
    M.awning(2.0, 0.85, (0, -d / 2, base_h + min(2.1, story * 0.86) + 0.35),
             'fabric_green' if variant in ('cottage', 'stilt') else 'fabric_red')

    # 屋顶
    zb = base_h + body_h
    if variant == 'barn':
        M.roof_gable(w + 0.2, d + 0.2, roof_rise * 1.15, zb, roofk, overhang=0.7, upturn=0.12)
    elif variant == 'tower_house':
        M.roof_pagoda(w + 0.3, d + 0.3, roof_rise, zb, roofk, overhang=0.8)
    else:
        M.roof_gable(w, d, roof_rise, zb, roofk, overhang=0.55, upturn=0.1)

    # 配件
    if p.get('balcony') and floors >= 2:
        zb = base_h + story
        M.box((w * 0.7, 1.0, 0.12), (0, -d / 2 - 0.5, zb), mat=M.m('wood_light'), bevel=0.02)
        M.railing((-w * 0.35, -d / 2 - 0.98), (w * 0.35, -d / 2 - 0.98), 0.95, 'wood_dark', 'wood', 0.3)
        for sx in (-1, 1):
            M.box((0.09, 1.0, 0.9), (sx * w * 0.35, -d / 2 - 0.5, zb + 0.45), mat=M.m('wood_dark'), bevel=0.01)
    if p.get('dormer'):
        M.box((1.5, 1.2, 1.1), (0, -d / 4 - 0.3, zb + roof_rise * 0.45), mat=wm, bevel=0.02)
        M.roof_gable(1.5, 1.2, 0.45, zb + roof_rise * 0.9, roofk, overhang=0.22, tiles=False, ridge=False)
        win_face(M, 0, -d / 4 - 0.92, zb + roof_rise * 0.5, 0.7, 0.6, 0, -1, cols=1, rows=0)
    if p.get('deck'):
        for sx in (-1, 1):
            M.cyl(0.09, 1.2, (sx * (w / 2 - 0.3), -d / 2 - 1.1, 0.2), mat=M.m('wood_dark'), seg=8)
        M.box((w * 0.9, 1.8, 0.12), (0, -d / 2 - 1.0, 0.72), mat=M.m('wood_light'), bevel=0.02)
        M.railing((-w * 0.45, -d / 2 - 1.9), (w * 0.45, -d / 2 - 1.9), 0.9, 'wood_mid', 'wood', 0.32)
    if p.get('snow'):
        M.box((w + 0.5, d + 0.5, 0.16), (0, 0, zb + roof_rise * 0.55), mat=M.m('snow'), bevel=0.06)
    if 'cottage' in variant or variant == 'farmstead':
        for sx in (-1, 1):
            flower_box(M, sx * w * 0.32, -d / 2 - 0.2, base_h + 1.15, 0.8, 0, -1)
    if variant != 'barn':
        chimney(M, w * 0.3, d * 0.22, zb + roof_rise * 0.5)
    # 侧墙灯
    M.box((0.12, 0.2, 0.3), (-w / 2 - 0.05, -d / 2 + 0.5, base_h + min(2.1, story * 0.86) + 0.2),
          mat=M.m('glow', emit=1.0, emit_strength=1.6), bevel=0.02)


def shop(M, p):
    w, d, h = p['dims']
    v = p.get('variant', 'grocery')
    body = building(M, dict(dims=[w, d, h], floors=2, roof='red' if v in
                            ('bakery', 'book', 'tea', 'inn', 'pub') else 'teal',
                            variant='shopfront', name=p.get('name', '')))
    # 店招 + 橱窗 + 台阶
    M.awning(w * 0.72, 1.25, (0, -d / 2, 3.05), 'fabric_red' if v in ('bakery', 'icecream', 'pub') else 'fabric_green')
    M.sign((0, -d / 2 - 0.14, 3.75), w * 0.45, 0.55, mat_key='wood_light')
    # 大橱窗
    M.box((w * 0.66, 0.06, 1.5), (0, -d / 2 - 0.05, 1.55), mat=M.m('glass_warm', rough=0.22), bevel=0.0)
    for i in range(2):
        M.box((0.07, 0.09, 1.5), (-w * 0.33 + w * 0.33 * i, -d / 2 - 0.09, 1.55), mat=M.m('wood_dark'), bevel=0.008)
    M.box((w * 0.7, 0.12, 0.1), (0, -d / 2 - 0.06, 0.82), mat=M.m('wood_dark'), bevel=0.012)
    M.box((w * 0.7, 0.35, 0.18), (0, -d / 2 - 0.2, 0.72), mat=M.m('stone_warm'), bevel=0.02)
    # 门口吊旗
    for sx in (-1, 1):
        M.box((0.16, 0.03, 0.7), (sx * w * 0.4, -d / 2 - 0.55, 3.0), mat=M.m('fabric_cream'), bevel=0.01)
    # 行业标识物
    extras = {
        'bakery': lambda: [M.sphere(0.16, (-0.5, -d / 2 - 0.5, 2.55), mat=M.m('roof_straw'), seg=10, ring=6),
                           M.box((0.5, 0.12, 0.08), (-0.5, -d / 2 - 0.5, 2.72), mat=M.m('wood_dark'))],
        'fish': lambda: [M.cyl(0.22, 0.3, (0.6, -d / 2 - 0.25, 0.3), mat=M.m('metal_dark'), seg=12),
                         M.cyl(0.1, 0.12, (0.6, -d / 2 - 0.25, 0.55), mat=M.m('water'), seg=10)],
        'flower': lambda: [M.pot((sx * 0.7, -d / 2 - 0.35, 0), 0.2, 0.28) for sx in (-1, 1)]
                          + [M.bush((sx * 0.7, -d / 2 - 0.35, 0.3), 0.26, 'leaf_light') for sx in (-1, 1)],
        'book': lambda: [M.box((0.12, 0.16, 0.5), (0.6, -d / 2 - 0.2, 0.9), mat=M.m(['fabric_red', 'fabric_blue', 'fabric_green'][i % 3])) for i in range(3)],
        'tea': lambda: [M.box((1.1, 0.6, 0.75), (0, -d / 2 - 0.55, 0.38), mat=M.m('wood_mid'), bevel=0.02),
                        M.cyl(0.16, 0.18, (0, -d / 2 - 0.55, 0.8), mat=M.m('white'), seg=12)],
        'noodle': lambda: [M.cyl(0.2, 0.1, (0.55, -d / 2 - 0.3, 1.0), mat=M.m('fabric_red'), seg=12)],
        'barber': lambda: [M.cyl(0.09, 1.0, (w * 0.42, -d / 2 - 0.12, 1.6), mat=M.m('fabric_cream'), seg=10),
                           M.cyl(0.095, 0.1, (w * 0.42, -d / 2 - 0.12, 1.3), mat=M.m('fabric_red'), seg=10),
                           M.cyl(0.095, 0.1, (w * 0.42, -d / 2 - 0.12, 1.9), mat=M.m('fabric_blue'), seg=10)],
        'clock': lambda: [M.cyl(0.34, 0.08, (0, -d / 2 - 0.1, 4.2), rot=(90, 0, 0), mat=M.m('white'), seg=20),
                          M.box((0.03, 0.05, 0.24), (0, -d / 2 - 0.14, 4.3), mat=M.m('ink')),
                          M.box((0.16, 0.05, 0.03), (0.07, -d / 2 - 0.14, 4.2), mat=M.m('ink'))],
        'pharmacy': lambda: [M.box((0.4, 0.05, 0.4), (-w * 0.42, -d / 2 - 0.1, 3.1), mat=M.m('fabric_green')),
                             M.box((0.12, 0.06, 0.4), (-w * 0.42, -d / 2 - 0.13, 3.1), mat=M.m('white')),
                             M.box((0.4, 0.06, 0.12), (-w * 0.42, -d / 2 - 0.13, 3.1), mat=M.m('white'))],
        'inn': lambda: [M.sign((0, -d / 2 - 0.2, 6.2), 1.4, 0.6, mat_key='wood_dark'),
                        M.box((1.2, 0.08, 0.1), (0, -d / 2 - 0.2, 6.55), mat=M.m('gold'))],
        'pub': lambda: [M.cyl(0.3, 0.5, (w * 0.4, -d / 2 - 0.2, 2.3), mat=M.m('wood_dark'), seg=12),
                        M.box((0.06, 0.06, 0.5), (w * 0.4, -d / 2 - 0.5, 2.55), mat=M.m('metal_dark'))],
        'icecream': lambda: [M.cyl(0.22, 0.9, (0.65, -d / 2 - 0.25, 0.45), mat=M.m('fabric_cream'), seg=12),
                             M.sphere(0.24, (0.65, -d / 2 - 0.25, 1.0), mat=M.m('wall_pink'), seg=12, ring=8)],
        'grocery': lambda: [M.box((0.5, 0.4, 0.4), (-w * 0.4, -d / 2 - 0.35, 0.2), mat=M.m('wood_light'), bevel=0.02),
                            M.box((0.4, 0.4, 0.35), (w * 0.36, -d / 2 - 0.35, 0.18), mat=M.m('wood_mid'), bevel=0.02)],
    }
    fn = extras.get(v)
    if fn:
        fn()


def landmark(M, p):
    v = p['variant']
    w, d, h = p['dims']
    if v == 'church':
        M.plinth(w, d, 0.5, mat_key='stone')
        M.box((w, d, h * 0.55), (0, 0, 0.5 + h * 0.275), mat=M.m('stone_warm', rough=0.88), bevel=0.03)
        M.roof_gable(w, d, h * 0.2, 0.5 + h * 0.55, 'slate', overhang=0.7)
        # 尖塔
        M.box((3.2, 3.2, h * 0.42), (0, -d / 2 - 0.4, h * 0.42), mat=M.m('stone_warm'), bevel=0.03)
        M.cyl(2.3, 2.2, (0, -d / 2 - 0.4, h * 0.42 + h * 0.42), r2=0.4, mat=M.m('roof_slate'), seg=8, bevel=0.02)
        M.cyl(0.12, 1.0, (0, -d / 2 - 0.4, h * 0.42 + h * 0.42 + 1.6), mat=M.m('gold'), seg=8)
        M.box((0.5, 0.5, 0.5), (0, -d / 2 - 0.4, h * 0.42 + h * 0.42 + 2.1), rot=(45, 0, 45),
              mat=M.m('glow', emit=1.0, emit_strength=1.2))
        # 玫瑰窗
        M.cyl(1.35, 0.12, (0, -d / 2 - 0.06, 0.5 + h * 0.36), rot=(90, 0, 0), mat=M.m('glass_warm', rough=0.2), seg=24)
        M.cyl(1.5, 0.1, (0, -d / 2 - 0.02, 0.5 + h * 0.36), rot=(90, 0, 0), mat=M.m('stone'), seg=24)
        for i in range(6):
            a = TAU * i / 6
            M.box((1.3, 0.07, 0.1), (0, -d / 2 - 0.1, 0.5 + h * 0.36), rot=(0, math.degrees(a), 0),
                  mat=M.m('stone_dark'), bevel=0.008)
        M.door((0, -d / 2 - 0.08, 0.5), 1.8, 3.0, 'y', 'wood_dark', arched=True)
        for sx in (-1, 1):
            M.cyl(0.22, h * 0.5, (sx * (w / 2 + 0.1), -d / 2 + 0.6, 0.5 + h * 0.25), mat=M.m('stone'), seg=12)
    elif v == 'temple':
        M.plinth(w, d, 0.9, mat_key='stone_dark')
        M.box((w, d, h * 0.34), (0, 0, 0.9 + h * 0.17), mat=M.m('wall_pink' if False else 'wood_mid'), bevel=0.03)
        M.timber(w, d, 1.0, h * 0.34 + 0.7, 'wood_dark', 1.0)
        M.roof_pagoda(w, d, h * 0.22, 0.9 + h * 0.34, 'teal', overhang=1.3)
        # 二层
        M.box((w * 0.72, d * 0.72, h * 0.24), (0, 0, 0.9 + h * 0.34 + h * 0.22 + h * 0.12),
              mat=M.m('wall_cream'), bevel=0.03)
        M.roof_pagoda(w * 0.72, d * 0.72, h * 0.2, 0.9 + h * 0.34 + h * 0.22 + h * 0.24, 'teal', overhang=1.15)
        for i in range(4):
            M.cyl(0.18, h * 0.3, (-w / 2 + w * (i + 0.5) / 4, -d / 2 - 0.1, 0.9 + h * 0.15),
                  mat=M.m('roof_red'), seg=12)
        M.door((0, -d / 2 - 0.1, 0.9), 2.2, 2.6, 'y', 'wood_dark', arched=True)
        for sx in (-1, 1):
            M.box((0.5, 0.5, 1.6), (sx * (w / 2 + 0.3), -d / 2 - 0.3, 0.9 + 0.8), mat=M.m('stone_dark'), bevel=0.04)
        M.stairs(3.4, 1.2, 0.9, 4, (0, -d / 2 - 0.9, 0))
    elif v == 'library':
        M.plinth(w, d, 0.6, mat_key='stone')
        M.box((w, d, h * 0.6), (0, 0, 0.6 + h * 0.3), mat=M.m('wall_cream'), bevel=0.03)
        # 柱廊
        for i in range(5):
            M.cyl(0.3, h * 0.5, (-w / 2 + w * (i + 0.5) / 5, -d / 2 - 0.55, 0.6 + h * 0.25),
                  mat=M.m('stone_warm'), seg=14)
        M.box((w + 0.4, 0.5, 0.4), (0, -d / 2 - 0.55, 0.6 + h * 0.5), mat=M.m('stone_warm'), bevel=0.03)
        M.box((w, d, 0.35), (0, 0, 0.6 + h * 0.6), mat=M.m('stone_warm'), bevel=0.03)
        # 穹顶
        M.sphere(h * 0.28, (0, 0, 0.6 + h * 0.6 + 0.1), mat=M.m('roof_teal'), seg=20, ring=12,
                 scale=(1.25, 1.0, 0.8))
        M.cyl(0.18, 0.8, (0, 0, 0.6 + h * 0.6 + h * 0.28), mat=M.m('gold'), seg=10)
        M.stairs(4.0, 1.4, 0.6, 3, (0, -d / 2 - 1.0, 0))
        M.door((0, -d / 2 - 0.08, 0.6), 2.4, 3.2, 'y', 'wood_dark', arched=True)
    elif v == 'gym':
        M.plinth(w, d, 0.5, mat_key='stone')
        M.box((w, d, h * 0.45), (0, 0, 0.5 + h * 0.225), mat=M.m('wall_ash'), bevel=0.03)
        M.roof_barrel(w, d, h * 0.55, 0.5 + h * 0.45, 'roof_blue')
        for i in range(6):
            win_face(M, -w / 2 + w * (i + 0.5) / 6, -d / 2 - 0.02, 0.5 + h * 0.26, 1.3, h * 0.3, 0, -1, cols=2)
        M.door((0, -d / 2 - 0.08, 0.5), 3.2, 3.4, 'y', 'wood_dark')
        M.stairs(5.0, 1.6, 0.5, 3, (0, -d / 2 - 1.0, 0))
    elif v == 'lighthouse':
        M.plinth(w, d, 0.7, mat_key='stone_dark')
        rings = 7
        for i in range(rings):
            t = i / rings
            r = w / 2 * (1 - 0.42 * t)
            z0 = 0.7 + (h * 0.72) * t
            seg_h = (h * 0.72) / rings
            M.cyl(r, seg_h, (0, 0, z0 + seg_h / 2), r2=w / 2 * (1 - 0.42 * (t + 1 / rings)),
                  mat=M.m('white' if i % 2 == 0 else 'roof_red'), seg=20, bevel=0.01)
        zt = 0.7 + h * 0.72
        M.cyl(w * 0.36, 0.3, (0, 0, zt + 0.15), mat=M.m('stone_dark'), seg=20, bevel=0.02)
        M.cyl(w * 0.26, 1.5, (0, 0, zt + 1.05), mat=M.m('glow', emit=1.0, emit_strength=2.6), seg=16, bevel=0.01)
        M.cyl(w * 0.3, 0.12, (0, 0, zt + 1.85), mat=M.m('metal_dark'), seg=16)
        M.cyl(w * 0.34, 0.7, (0, 0, zt + 2.2), r2=0.12, mat=M.m('roof_red'), seg=16, bevel=0.02)
        M.sphere(0.14, (0, 0, zt + 2.6), mat=M.m('gold'), seg=10, ring=6)
        # 环绕栏杆
        M.railing((-w * 0.3, 0), (w * 0.3, 0), 0.7, 'metal_dark', 'wood', 0.28)
        M.door((0, -w / 2 - 0.02, 0.7), 0.9, 2.0, 'y', 'wood_dark')
        win_face(M, 0, -w * 0.34, zt + 1.05, 0.5, 1.0, 0, -1, frame='metal_dark', cols=1, rows=0, sill=False)
    elif v == 'station':
        M.plinth(w, d, 0.4, mat_key='stone')
        M.box((w, d * 0.6, h * 0.55), (0, -d * 0.18, 0.4 + h * 0.275), mat=M.m('wall_ash'), bevel=0.03)
        for i in range(9):
            win_face(M, -w * 0.45 + w * 0.9 * i / 8, -d * 0.6 * 0.5 - d * 0.18 - 0.02, 0.4 + h * 0.3, 1.6, h * 0.3, 0, -1, cols=3)
        # 大跨雨棚
        M.box((w + 1.0, d * 0.5, 0.25), (0, d * 0.42, h * 0.78), rot=(6, 0, 0), mat=M.m('roof_teal'), bevel=0.03)
        for i in range(5):
            M.cyl(0.16, h * 0.78, (-w / 2 + w * i / 4, d * 0.55, h * 0.39), mat=M.m('metal_dark'), seg=10)
        # 钟楼
        M.box((2.6, 2.6, h * 0.9), (w * 0.34, -d * 0.2, h * 0.45), mat=M.m('wall_cream'), bevel=0.03)
        M.roof_gable(2.6, 2.6, 1.2, h * 0.9, 'teal', overhang=0.4)
        M.cyl(0.75, 0.1, (w * 0.34, -d * 0.2 - 1.32, h * 0.72), rot=(90, 0, 0), mat=M.m('white'), seg=20)
        M.box((0.05, 0.06, 0.5), (w * 0.34, -d * 0.2 - 1.4, h * 0.75), mat=M.m('ink'))
        M.box((0.36, 0.06, 0.05), (w * 0.34 + 0.15, -d * 0.2 - 1.4, h * 0.72), mat=M.m('ink'))
        M.stairs(6.0, 1.6, 0.4, 3, (0, -d * 0.52, 0))
    elif v == 'gate':
        M.box((w, d, h * 0.62), (0, 0, h * 0.31), mat=M.m('stone'), bevel=0.04)
        for i in range(int(w / 0.9)):
            M.box((0.9, 0.1, 0.35), (-w / 2 + w * (i + 0.5) / int(w / 0.9), -d / 2 - 0.05, h * 0.62 - 0.2),
                  mat=M.m('stone_dark'), bevel=0.05)
        # 门洞
        M.box((3.0, 0.4, 3.6), (0, -d / 2 - 0.1, 1.8), mat=M.m('ink'), bevel=0.0)
        M.box((3.4, 0.5, 0.35), (0, -d / 2 - 0.15, 3.7), mat=M.m('stone_dark'), bevel=0.03)
        # 城楼
        M.box((w * 0.7, d * 0.8, h * 0.26), (0, 0, h * 0.62 + h * 0.13), mat=M.m('wood_mid'), bevel=0.03)
        M.roof_pagoda(w * 0.7, d * 0.8, h * 0.16, h * 0.62 + h * 0.26, 'roof_teal', overhang=1.2)
        for i in range(5):
            M.box((0.5, 0.5, 0.5), (-w * 0.3 + w * 0.6 * i / 4, -d * 0.4 - 0.2, h * 0.62 + h * 0.26 + 0.25),
                  mat=M.m('stone_dark'), bevel=0.03)
        M.stairs(4.0, 1.5, 0.5, 3, (0, -d / 2 - 1.0, 0))
    elif v == 'guild':
        M.plinth(w, d, 0.5, mat_key='stone')
        M.box((w, d, h * 0.5), (0, 0, 0.5 + h * 0.25), mat=M.m('wood_mid'), bevel=0.03)
        M.timber(w, d, 0.6, h * 0.5, 'wood_dark', 1.0)
        M.roof_gable(w, d, h * 0.18, 0.5 + h * 0.5, 'roof_red', overhang=0.7)
        # 塔楼
        M.box((3.4, 3.4, h * 0.62), (0, -d / 2 + 0.2, h * 0.42), mat=M.m('stone_warm'), bevel=0.03)
        M.roof_pagoda(3.4, 3.4, h * 0.14, h * 0.72, 'roof_teal', overhang=0.75)
        # 旗
        M.cyl(0.06, 3.2, (0, -d / 2 - 0.2, h * 0.72 + 1.6), mat=M.m('wood_dark'), seg=8)
        M.box((1.1, 0.04, 0.7), (0.55, -d / 2 - 0.2, h * 0.72 + 2.7), mat=M.m('fabric_red'), bevel=0.006)
        M.door((0, -d / 2 - 0.06, 0.5), 1.4, 2.4, 'y', 'wood_dark', arched=True)
        for sx in (-1, 1):
            flower_box(M, sx * w * 0.3, -d / 2 - 0.2, 1.4, 1.2, 0, -1)
    elif v == 'watertower':
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.box((0.22, 0.22, h * 0.6), (sx * (w / 2 - 0.4), sy * (d / 2 - 0.4), h * 0.3),
                      rot=(sy * 3, sx * 3, 0), mat=M.m('wood_dark'), bevel=0.015)
        for z in (h * 0.2, h * 0.42):
            M.box((w, 0.1, 0.1), (0, -d / 2 + 0.4, z), mat=M.m('metal_dark'), bevel=0.01)
            M.box((w, 0.1, 0.1), (0, d / 2 - 0.4, z), mat=M.m('metal_dark'), bevel=0.01)
        M.cyl(w / 2, h * 0.3, (0, 0, h * 0.6 + h * 0.15), mat=M.m('wood_mid'), seg=18, bevel=0.02)
        M.cyl(w / 2 + 0.06, 0.1, (0, 0, h * 0.6 + h * 0.06), mat=M.m('metal_dark'), seg=18)
        M.cyl(w / 2 + 0.06, 0.1, (0, 0, h * 0.6 + h * 0.29), mat=M.m('metal_dark'), seg=18)
        M.cyl(w * 0.5, 0.6, (0, 0, h * 0.93), r2=0.1, mat=M.m('roof_red'), seg=14, bevel=0.02)
    elif v == 'clocktower':
        M.plinth(w, d, 0.6, mat_key='stone')
        M.box((w, d, h * 0.78), (0, 0, 0.6 + h * 0.39), mat=M.m('brick'), bevel=0.03)
        for f in range(3):
            win_face(M, 0, -d / 2 - 0.02, 0.6 + h * 0.16 + h * 0.22 * f, 0.8, 1.4, 0, -1, cols=1, rows=1)
        # 钟面
        zc = 0.6 + h * 0.68
        M.cyl(1.15, 0.14, (0, -d / 2 - 0.1, zc), rot=(90, 0, 0), mat=M.m('wall_cream'), seg=24)
        M.cyl(1.3, 0.1, (0, -d / 2 - 0.04, zc), rot=(90, 0, 0), mat=M.m('stone_dark'), seg=24)
        M.box((0.07, 0.08, 0.85), (0, -d / 2 - 0.2, zc + 0.35), mat=M.m('ink'))
        M.box((0.6, 0.08, 0.07), (0.24, -d / 2 - 0.2, zc), mat=M.m('ink'))
        M.roof_pagoda(w, d, h * 0.16, 0.6 + h * 0.78, 'roof_teal', overhang=0.9)
        M.cyl(0.08, 1.2, (0, 0, 0.6 + h * 0.78 + 1.0), mat=M.m('gold'), seg=8)
        M.stairs(2.6, 1.0, 0.6, 3, (0, -d / 2 - 0.8, 0))
    elif v == 'windmill':
        M.plinth(w, d, 0.5, mat_key='stone_dark')
        M.cyl(w * 0.42, h * 0.62, (0, 0, 0.5 + h * 0.31), r2=w * 0.30, mat=M.m('wall_cream'), seg=16, bevel=0.02)
        M.cyl(w * 0.34, h * 0.2, (0, 0, 0.5 + h * 0.72), r2=0.5, mat=M.m('roof_red'), seg=16, bevel=0.02)
        M.door((0, -w * 0.42 - 0.02, 0.5), 1.0, 2.0, 'y', 'wood_mid')
        win_face(M, 0, -w * 0.36, 0.5 + h * 0.45, 0.7, 0.9, 0, -1, cols=1, rows=0)
        # 风车叶
        cy = -0.55
        M.cyl(0.2, 0.6, (0, cy, h * 0.78), rot=(90, 0, 0), mat=M.m('wood_dark'), seg=10)
        for i in range(4):
            a = 90 * i + 20
            M.box((0.28, 0.1, 4.2), (math.sin(math.radians(a)) * 2.1, cy - 0.1,
                                     h * 0.78 + math.cos(math.radians(a)) * 2.1), rot=(0, a, 0),
                  mat=M.m('wood_light'), bevel=0.02)
            M.box((1.0, 0.05, 3.6), (math.sin(math.radians(a)) * 2.1, cy - 0.16,
                                     h * 0.78 + math.cos(math.radians(a)) * 2.1), rot=(0, a, 0),
                  mat=M.m('fabric_cream'), bevel=0.01)
    elif v == 'torii':
        for sx in (-1, 1):
            M.cyl(0.22, h * 0.85, (sx * w * 0.36, 0, h * 0.425), r2=0.18, mat=M.m('roof_red'), seg=14, bevel=0.01)
            M.cyl(0.3, 0.25, (sx * w * 0.36, 0, 0.12), mat=M.m('stone_dark'), seg=14)
        M.box((w * 1.02, 0.42, 0.34), (0, 0, h * 0.86), mat=M.m('roof_red'), bevel=0.03)
        M.box((w * 0.86, 0.3, 0.24), (0, 0, h * 0.74), mat=M.m('roof_red'), bevel=0.03)
        M.box((w * 1.06, 0.5, 0.18), (0, 0, h * 0.95), rot=(0, 0, 0), mat=M.m('ink'), bevel=0.05)


# ------------------------------------------------------------------ 街道家具
def prop(M, p):
    v = p['variant']
    if v.startswith('lamp'):
        style = v.split('_')[1]
        if style == 'classic':
            M.cyl(0.19, 0.28, (0, 0, 0.14), mat=M.m('metal_dark'), seg=12)
            M.cyl(0.09, 2.9, (0, 0, 1.6), r2=0.07, mat=M.m('metal_dark'), seg=10)
            for z in (0.5, 2.5):
                M.cyl(0.13, 0.09, (0, 0, z), mat=M.m('gold'), seg=10)
            M.cyl(0.26, 0.5, (0, 0, 3.25), r2=0.16, mat=M.m('glow', emit=1.0, emit_strength=2.2), seg=12)
            M.cyl(0.32, 0.12, (0, 0, 3.55), mat=M.m('metal_dark'), seg=12)
            M.sphere(0.1, (0, 0, 3.66), mat=M.m('metal_dark'), seg=8, ring=5)
        elif style == 'industrial':
            M.cyl(0.24, 0.3, (0, 0, 0.15), mat=M.m('metal_dark'), seg=12)
            M.box((0.14, 0.14, 3.9), (0, 0, 2.1), mat=M.m('metal_dark'), bevel=0.012)
            M.box((0.9, 0.24, 0.16), (0.42, 0, 4.0), mat=M.m('metal_dark'), bevel=0.02)
            M.box((0.5, 0.4, 0.3), (0.82, 0, 3.86), mat=M.m('glow', emit=1.0, emit_strength=2.4), bevel=0.02)
            M.box((0.56, 0.46, 0.06), (0.82, 0, 4.04), mat=M.m('metal_dark'), bevel=0.015)
        elif style == 'garden':
            M.cyl(0.3, 0.12, (0, 0, 0.06), mat=M.m('stone_dark'), seg=12)
            M.cyl(0.09, 1.5, (0, 0, 0.8), mat=M.m('metal_dark'), seg=10)
            M.cyl(0.24, 0.34, (0, 0, 1.75), r2=0.14, mat=M.m('glow', emit=1.0, emit_strength=1.8), seg=12)
            M.cyl(0.3, 0.08, (0, 0, 1.94), mat=M.m('metal_dark'), seg=12)
        else:  # string
            M.cyl(0.26, 0.24, (0, 0, 0.12), mat=M.m('stone'), seg=12)
            M.cyl(0.07, 5.0, (0, 0, 2.6), r2=0.05, mat=M.m('wood_dark'), seg=10)
            M.cyl(0.05, 0.5, (0, 0, 5.1), mat=M.m('metal_dark'), seg=8)
            for i in range(5):
                M.sphere(0.075, (0.16, 0, 3.2 + i * 0.42), mat=M.m('glow', emit=1.0, emit_strength=2.6), seg=8, ring=5)
            M.box((0.5, 0.05, 0.05), (0.25, 0, 5.05), mat=M.m('metal_dark'), bevel=0.006)
    elif v.startswith('bench'):
        wood = v.endswith('wood')
        seat = M.m('wood_light' if wood else 'wood_mid')
        for sx in (-1, 1):
            for sz in (-1, 1):
                M.box((0.1, 0.1, 0.45), (sx * 0.75, sz * 0.22, 0.225),
                      mat=M.m('wood_dark' if wood else 'metal_dark'), bevel=0.008)
        for i in range(4):
            M.box((1.75, 0.11, 0.035), (0, -0.2 + i * 0.13, 0.46), mat=seat, bevel=0.006)
        for i in range(3):
            M.box((1.75, 0.035, 0.1), (0, 0.3, 0.58 + i * 0.12), rot=(12, 0, 0),
                  mat=seat, bevel=0.006)
        M.box((1.75, 0.05, 0.05), (0, 0.3, 0.55), mat=M.m('wood_dark' if wood else 'metal_dark'), bevel=0.006)
    elif v.startswith('bin'):
        if v == 'bin_pair':
            for i, key in enumerate(('fabric_green', 'fabric_blue')):
                M.cyl(0.24, 0.78, (-0.28 + i * 0.56, 0, 0.4), mat=M.m(key), seg=14, bevel=0.012)
                M.cyl(0.26, 0.06, (-0.28 + i * 0.56, 0, 0.78), mat=M.m('metal_dark'), seg=14)
                M.box((0.2, 0.1, 0.06), (-0.28 + i * 0.56, -0.22, 0.72), mat=M.m('ink'), bevel=0.008)
        else:
            M.cyl(0.3, 0.8, (0, 0, 0.4), mat=M.m('wood_mid'), seg=16, bevel=0.015)
            for z in (0.15, 0.65):
                M.cyl(0.315, 0.07, (0, 0, z), mat=M.m('metal_dark'), seg=16)
            M.cyl(0.28, 0.05, (0, 0, 0.8), mat=M.m('ink'), seg=16)
    elif v == 'mailbox':
        M.cyl(0.11, 1.2, (0, 0, 0.6), mat=M.m('metal_dark'), seg=10)
        M.box((0.5, 0.42, 0.62), (0, 0, 1.45), mat=M.m('fabric_red'), bevel=0.04)
        M.cyl(0.25, 0.16, (0, 0, 1.78), rot=(90, 0, 0), mat=M.m('fabric_red'), seg=14)
        M.box((0.26, 0.04, 0.06), (0, -0.22, 1.55), mat=M.m('ink'), bevel=0.006)
        M.box((0.3, 0.03, 0.16), (0, -0.22, 1.32), mat=M.m('wall_cream'), bevel=0.004)
        M.cyl(0.2, 0.08, (0, 0, 0.04), mat=M.m('stone_dark'), seg=12)
    elif v == 'phonebooth':
        M.box((1.0, 1.0, 0.14), (0, 0, 0.07), mat=M.m('stone_dark'), bevel=0.02)
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.box((0.09, 0.09, 2.2), (sx * 0.44, sy * 0.44, 1.2), mat=M.m('fabric_red'), bevel=0.012)
        for sy in (-1, 1):
            M.box((0.86, 0.05, 1.5), (0, sy * 0.44, 1.5), mat=M.m('glass', rough=0.2), bevel=0.0)
        M.box((1.06, 1.06, 0.18), (0, 0, 2.34), mat=M.m('fabric_red'), bevel=0.03)
        M.box((0.9, 0.9, 0.1), (0, 0, 2.22), mat=M.m('glow', emit=1.0, emit_strength=1.8), bevel=0.02)
        M.box((0.3, 0.2, 0.4), (0, 0.3, 1.3), mat=M.m('metal_dark'), bevel=0.02)
        M.box((0.7, 0.5, 0.08), (0, 0, 2.0), mat=M.m('fabric_cream'), bevel=0.01)
    elif v == 'kiosk':
        M.box((2.0, 1.4, 0.12), (0, 0, 0.06), mat=M.m('stone_dark'), bevel=0.02)
        M.box((2.0, 1.4, 2.0), (0, 0, 1.1), mat=M.m('wood_mid'), bevel=0.03)
        M.box((2.2, 1.6, 0.16), (0, 0, 2.2), mat=M.m('roof_red'), bevel=0.03)
        M.roof_gable(2.0, 1.4, 0.5, 2.26, 'red', overhang=0.3, tiles=False)
        M.box((1.4, 0.06, 1.0), (0, -0.72, 1.6), mat=M.m('glass_warm', rough=0.2), bevel=0.0)
        M.box((1.6, 0.12, 0.1), (0, -0.74, 1.05), mat=M.m('wood_dark'), bevel=0.01)
        for i in range(3):
            M.box((0.3, 0.06, 0.4), (-0.55 + i * 0.5, -0.76, 1.75), mat=M.m(['fabric_red', 'fabric_blue', 'fabric_green'][i]))
        M.sign((0, -0.8, 2.0), 1.2, 0.34, mat_key='wood_light', bracket=False)
    elif v == 'busstop':
        M.box((3.0, 1.4, 0.12), (0, 0, 0.06), mat=M.m('stone_warm'), bevel=0.02)
        for sx in (-1, 1):
            M.box((0.1, 0.1, 2.5), (sx * 1.4, 0.6, 1.25), mat=M.m('metal_dark'), bevel=0.01)
            M.box((0.1, 0.1, 2.5), (sx * 1.4, -0.6, 1.25), mat=M.m('metal_dark'), bevel=0.01)
        M.box((3.1, 1.7, 0.12), (0, 0, 2.55), rot=(-4, 0, 0), mat=M.m('roof_teal'), bevel=0.03)
        M.box((2.8, 0.06, 1.9), (0, 0.62, 1.4), mat=M.m('glass', rough=0.2), bevel=0.0)
        M.box((2.9, 0.12, 0.1), (0, 0.62, 0.5), mat=M.m('metal_dark'))
        for i in range(3):
            M.box((2.6, 0.4, 0.07), (0, 0.35, 0.5 + i * 0.0), mat=M.m('wood_light'))
        M.box((2.6, 0.42, 0.09), (0, 0.32, 0.52), mat=M.m('wood_light'), bevel=0.01)
        M.box((1.0, 0.08, 0.5), (-0.8, -0.66, 2.1), mat=M.m('fabric_blue'), bevel=0.01)
        M.cyl(0.05, 2.2, (1.75, -0.7, 1.1), mat=M.m('metal_dark'), seg=8)
        M.box((0.6, 0.08, 0.34), (1.75, -0.74, 2.1), mat=M.m('fabric_blue'), bevel=0.01)
    elif v == 'hydrant':
        M.cyl(0.13, 0.55, (0, 0, 0.28), mat=M.m('fabric_red'), seg=12, bevel=0.012)
        M.sphere(0.13, (0, 0, 0.58), mat=M.m('fabric_red'), seg=12, ring=8, scale=(1, 1, 0.7))
        M.cyl(0.05, 0.1, (0, 0, 0.66), mat=M.m('metal_dark'), seg=8)
        for sx in (-1, 1):
            M.cyl(0.055, 0.18, (sx * 0.14, 0, 0.42), rot=(0, 90, 0), mat=M.m('metal_dark'), seg=10)
        M.cyl(0.19, 0.06, (0, 0, 0.03), mat=M.m('metal_dark'), seg=12)
    elif v == 'sign_street':
        M.cyl(0.05, 2.4, (0, 0, 1.2), mat=M.m('metal_dark'), seg=8)
        for i, (ang, key) in enumerate(((0, 'fabric_blue'), (90, 'fabric_green'))):
            M.box((0.8, 0.05, 0.24), (0, 0, 2.28 - i * 0.3), rot=(0, 0, ang), mat=M.m(key), bevel=0.01)
            M.box((0.82, 0.06, 0.05), (0, 0, 2.28 - i * 0.3), rot=(0, 0, ang), mat=M.m('white'), bevel=0.006)
        M.cyl(0.14, 0.1, (0, 0, 0.05), mat=M.m('stone_dark'), seg=10)
    elif v.startswith('railing'):
        M.railing((-1.5, 0), (1.5, 0), 0.95, 'stone_warm' if 'stone' in v else 'wood_mid',
                  'stone' if 'stone' in v else 'wood', 0.44)
    elif v.startswith('planter'):
        if 'stone' in v:
            M.box((2.0, 2.0, 0.62), (0, 0, 0.31), mat=M.m('stone_warm'), bevel=0.05)
            M.box((1.78, 1.78, 0.06), (0, 0, 0.6), mat=M.m('soil'), bevel=0.01)
            for sx in (-1, 1):
                for sy in (-1, 1):
                    M.bush((sx * 0.42, sy * 0.42, 0.6), 0.36, 'leaf')
            M.bush((0, 0, 0.6), 0.3, 'leaf_light')
        else:
            M.box((1.4, 0.66, 0.56), (0, 0, 0.3), mat=M.m('wood_mid'), bevel=0.02)
            for i in range(5):
                M.box((1.44, 0.05, 0.1), (0, -0.3 + i * 0.15, 0.58), mat=M.m('wood_dark'), bevel=0.008)
            M.box((1.3, 0.56, 0.05), (0, 0, 0.54), mat=M.m('soil'))
            for i in range(3):
                M.bush((-0.42 + i * 0.42, 0, 0.56), 0.24, 'leaf_light' if i % 2 else 'leaf')
    elif v == 'treegrate':
        M.box((1.6, 1.6, 0.06), (0, 0, 0.03), mat=M.m('metal_dark'), bevel=0.01)
        for i in range(5):
            M.box((1.4, 0.1, 0.03), (0, -0.6 + i * 0.3, 0.07), mat=M.m('stone_dark'), bevel=0.004)
        M.cyl(0.22, 0.1, (0, 0, 0.06), mat=M.m('ink'), seg=12)
    elif v == 'pergola':
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.box((0.14, 0.14, 2.5), (sx * 1.5, sy * 1.1, 1.25), mat=M.m('wood_mid'), bevel=0.015)
            M.box((3.4, 0.14, 0.14), (0, sy * 1.1, 2.55), mat=M.m('wood_mid'), bevel=0.015)
        for i in range(7):
            M.box((0.1, 2.4, 0.1), (-1.5 + i * 0.5, 0, 2.62), mat=M.m('wood_light'), bevel=0.01)
        for i in range(4):
            M.bush((-1.2 + i * 0.8, 0, 2.66), 0.3, 'leaf_dark' if i % 2 else 'leaf')
    elif v == 'umbrella':
        M.cyl(0.06, 2.3, (0, 0, 1.15), mat=M.m('wood_dark'), seg=8)
        M.cyl(0.16, 0.1, (0, 0, 0.05), mat=M.m('stone_dark'), seg=10)
        for i in range(8):
            a = TAU * i / 8
            M.box((1.3, 0.05, 0.04), (math.cos(a) * 0.6, math.sin(a) * 0.6, 2.2 - 0.05),
                  rot=(0, 12, math.degrees(a)), mat=M.m('wood_dark'), bevel=0.006)
        M.cyl(1.32, 0.36, (0, 0, 2.18), r2=0.06, mat=M.m('fabric_red'), seg=16, bevel=0.01)
        M.cyl(0.08, 0.14, (0, 0, 2.36), mat=M.m('wood_dark'), seg=8)
    elif v.startswith('stall'):
        kind = v.split('_')[1]
        M.box((2.2, 0.9, 0.12), (0, 0, 0.85), mat=M.m('wood_light'), bevel=0.02)
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.box((0.09, 0.09, 0.85), (sx * 1.0, sy * 0.38, 0.42), mat=M.m('wood_dark'), bevel=0.01)
        M.box((2.3, 1.0, 0.06), (0, 0, 0.9), mat=M.m('wood_mid'), bevel=0.01)
        for sx in (-1, 1):
            M.box((0.08, 0.08, 1.3), (sx * 1.05, 0.45, 1.55), mat=M.m('wood_dark'), bevel=0.01)
        M.box((2.3, 1.1, 0.1), (0, 0, 2.2), rot=(8, 0, 0), mat=M.m('fabric_cream'), bevel=0.02)
        for i in range(3):
            M.box((0.7, 0.02, 0.06), (-0.75 + i * 0.75, -0.56, 2.16), mat=M.m(['fabric_red', 'fabric_green', 'fabric_blue'][i]), bevel=0.006)
        if kind == 'veg':
            for i in range(6):
                M.sphere(0.12, (-0.8 + i * 0.32, 0, 1.02), mat=M.m(['fabric_green', 'roof_red', 'gold', 'leaf'][i % 4]), seg=8, ring=5)
        elif kind == 'flower':
            for i in range(4):
                M.pot((-0.75 + i * 0.5, 0, 0.92), 0.16, 0.2)
                M.bush((-0.75 + i * 0.5, 0, 1.12), 0.2, 'leaf_light', count=2)
                M.sphere(0.09, (-0.75 + i * 0.5, 0, 1.34), mat=M.m(['fabric_red', 'wall_pink', 'fabric_cream'][i % 3]), seg=8, ring=5)
        elif kind == 'fish':
            M.box((2.0, 0.7, 0.14), (0, 0, 0.95), mat=M.m('water'), bevel=0.02)
            for i in range(4):
                M.sphere(0.11, (-0.7 + i * 0.45, 0, 0.98), mat=M.m('wall_ash'), seg=8, ring=5, scale=(1.6, 0.7, 0.7))
        else:
            for i in range(5):
                M.sphere(0.13, (-0.85 + i * 0.42, 0, 1.02), mat=M.m(['fabric_red', 'gold', 'fabric_green', 'roof_red'][i % 4]), seg=8, ring=5)
        M.sign((0, -0.5, 1.75), 1.3, 0.4, mat_key='wood_light', bracket=False)
    elif v == 'crate':
        M.box((0.7, 0.5, 0.5), (0, 0, 0.25), mat=M.m('wood_light'), bevel=0.014)
        for i in range(2):
            M.box((0.72, 0.52, 0.05), (0, 0, 0.12 + i * 0.26), mat=M.m('wood_mid'), bevel=0.008)
        for sx in (-1, 1):
            M.box((0.04, 0.52, 0.5), (sx * 0.36, 0, 0.25), mat=M.m('wood_dark'), bevel=0.006)
    elif v == 'barrel':
        M.cyl(0.28, 0.72, (0, 0, 0.36), r2=0.3, mat=M.m('wood_mid'), seg=16, bevel=0.01)
        for z in (0.12, 0.3, 0.6):
            M.cyl(0.305, 0.06, (0, 0, z), mat=M.m('metal_dark'), seg=16)
        M.cyl(0.24, 0.04, (0, 0, 0.72), mat=M.m('wood_dark'), seg=16)
    elif v == 'handcart':
        M.box((1.6, 0.8, 0.1), (0, 0, 0.62), mat=M.m('wood_light'), bevel=0.02)
        for sx in (-1, 1):
            M.box((0.08, 0.9, 0.35), (sx * 0.78, 0, 0.78), mat=M.m('wood_mid'), bevel=0.012)
            M.cyl(0.26, 0.1, (sx * 0.62, 0, 0.28), rot=(90, 0, 0), mat=M.m('wood_dark'), seg=14)
        M.cyl(0.04, 1.5, (-1.1, 0.35, 0.9), rot=(0, 12, 0), mat=M.m('wood_dark'), seg=8)
        for i in range(2):
            M.box((1.5, 0.06, 0.05), (0, -0.35 + i * 0.7, 0.68), mat=M.m('wood_dark'), bevel=0.006)
        M.box((0.5, 0.4, 0.3), (0.1, 0, 0.85), mat=M.m('roof_straw'), bevel=0.03)
    elif v == 'ladder':
        for sx in (-1, 1):
            M.box((0.07, 0.07, 2.5), (sx * 0.28, 0, 1.25), rot=(0, sx * 5, 0), mat=M.m('wood_mid'), bevel=0.008)
        for i in range(7):
            M.box((0.62, 0.06, 0.05), (0, 0, 0.18 + i * 0.34), mat=M.m('wood_light'), bevel=0.006)
    elif v == 'laundry_rack':
        for sx in (-1, 1):
            M.box((0.08, 0.08, 1.7), (sx * 0.95, 0, 0.85), mat=M.m('wood_dark'), bevel=0.01)
            M.box((0.5, 0.06, 0.06), (sx * 0.95, 0.2, 0.06), rot=(0, 0, 90), mat=M.m('wood_dark'), bevel=0.008)
        for i in range(3):
            M.box((2.0, 0.02, 0.02), (0, -0.1 + i * 0.1, 1.6 - i * 0.05), mat=M.m('metal'), bevel=0.0)
        for i, (px, key) in enumerate(((-0.6, 'fabric_cream'), (0.1, 'fabric_blue'), (0.6, 'wall_pink'))):
            M.box((0.42, 0.02, 0.5), (px, -0.05, 1.33), mat=M.m(key), bevel=0.004)


# ------------------------------------------------------------------ 载具 / 桥
def vehicle(M, p):
    v = p['variant']
    w, d, h = p['dims']
    if v == 'bus':
        M.box((w, d, h * 0.78), (0, 0, h * 0.5), mat=M.m('fabric_cream'), bevel=0.09)
        M.box((w * 0.98, d * 0.94, 0.2), (0, 0, h * 0.9), mat=M.m('fabric_blue'), bevel=0.06)
        for i in range(5):
            win_face(M, -w / 2 + w * (i + 0.5) / 5, -d / 2 - 0.02, h * 0.62, w / 5 * 0.7, h * 0.3, 0, -1, cols=1, rows=0, sill=False)
            win_face(M, -w / 2 + w * (i + 0.5) / 5, d / 2 + 0.02, h * 0.62, w / 5 * 0.7, h * 0.3, 0, 1, cols=1, rows=0, sill=False)
        M.box((w * 0.9, 0.06, h * 0.34), (0, -d / 2 - 0.03, h * 0.42), mat=M.m('glass', rough=0.2), bevel=0.0)
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.cyl(0.42, 0.24, (sx * w * 0.3, sy * d * 0.42, 0.42), rot=(90, 0, 0), mat=M.m('ink'), seg=14)
        M.box((0.3, 0.06, 0.16), (-w * 0.42, -d / 2 - 0.04, h * 0.32), mat=M.m('glow', emit=1.0, emit_strength=2.0), bevel=0.02)
        M.box((0.3, 0.06, 0.16), (w * 0.42, -d / 2 - 0.04, h * 0.32), mat=M.m('glow', emit=1.0, emit_strength=2.0), bevel=0.02)
        M.box((w * 0.5, 0.05, 0.24), (0, -d / 2 - 0.03, h * 0.86), mat=M.m('ink'), bevel=0.01)
        M.box((0.5, 0.4, 0.12), (0, -d / 2 - 0.02, h * 0.96), mat=M.m('gold'), bevel=0.02)
    elif v in ('fishing_boat', 'sailboat', 'rowboat'):
        hull_len = w if v != 'rowboat' else w
        M.prism([(-hull_len / 2, -d / 2), (hull_len / 2, -d * 0.3), (hull_len * 0.42, d / 2),
                 (-hull_len * 0.42, d / 2), (-hull_len / 2, -d * 0.3)],
                h * 0.55, at=(0, 0, 0.1), mat=M.m('wood_mid'), bevel=0.02)
        M.prism([(-hull_len * 0.44, -d * 0.36), (hull_len * 0.44, -d * 0.22), (hull_len * 0.36, d * 0.42),
                 (-hull_len * 0.36, d * 0.42)], h * 0.08, at=(0, 0, h * 0.6), mat=M.m('wood_light'), bevel=0.01)
        if v == 'fishing_boat':
            M.box((hull_len * 0.3, d * 0.6, h * 0.5), (hull_len * 0.12, 0, h * 0.85), mat=M.m('fabric_cream'), bevel=0.03)
            M.box((hull_len * 0.32, d * 0.66, 0.1), (hull_len * 0.12, 0, h * 1.12), mat=M.m('roof_teal'), bevel=0.02)
            M.cyl(0.06, h * 1.2, (-hull_len * 0.28, 0, h * 0.9), mat=M.m('wood_dark'), seg=8)
            M.box((hull_len * 0.16, 0.04, h * 0.3), (-hull_len * 0.34, 0, h * 1.1), mat=M.m('fabric_cream'), bevel=0.01)
            for i in range(3):
                M.cyl(0.09, 0.3, (-hull_len * 0.1 + i * 0.5, d * 0.3, h * 0.68), mat=M.m('metal_dark'), seg=10)
        elif v == 'sailboat':
            M.cyl(0.07, h * 1.6, (0, 0, h * 0.9), mat=M.m('wood_dark'), seg=8)
            rows = []
            for i in range(7):
                t = i / 6
                rows.append([Vector((-0.0, 0, h * (0.85 + t * 1.5))),
                             Vector((w * 0.42 * (1 - t * 0.35), 0, h * (0.8 + t * 1.5)))])
            M.quad_strip(rows, mat=M.m('fabric_cream'), smooth=True)
            M.box((0.06, d * 0.5, 0.06), (0, 0, h * 0.35), mat=M.m('wood_dark'), bevel=0.006)
        else:
            M.box((hull_len * 0.2, d * 0.5, 0.1), (0, 0, h * 0.6), mat=M.m('wood_light'), bevel=0.01)
            for sx in (-1, 1):
                M.box((hull_len * 0.4, 0.05, 0.05), (sx * hull_len * 0.18, 0, h * 0.66), rot=(0, 0, 90 * (sx > 0)),
                      mat=M.m('wood_dark'), bevel=0.006)
    elif v == 'pier':
        for i in range(6):
            for sy in (-1, 1):
                M.cyl(0.13, 2.2, (-w / 2 + w * i / 5, sy * d * 0.4, 1.0), mat=M.m('wood_dark'), seg=10)
        for i in range(11):
            M.box((w / 10 * 0.94, d, 0.08), (-w / 2 + w * (i + 0.5) / 11, 0, 2.06), mat=M.m('wood_light'), bevel=0.008)
        M.railing((-w / 2, d * 0.46), (w / 2, d * 0.46), 0.9, 'wood_mid', 'wood', 0.5)
        for i in range(3):
            M.cyl(0.14, 0.5, (w * 0.3 + i * 0.4, d * 0.5, 2.35), mat=M.m('metal_dark'), seg=10)
    elif v in ('bridge_arch', 'bridge_flat'):
        arch = v == 'bridge_arch'
        M.box((w, d, 0.22), (0, 0, h * 0.72), mat=M.m('stone_warm'), bevel=0.03)
        for sy in (-1, 1):
            M.box((w, 0.18, 0.5), (0, sy * d * 0.46, h * 0.95), mat=M.m('stone'), bevel=0.02)
        if arch:
            for i in range(9):
                t = i / 8
                ang = math.pi * t
                x = -w * 0.34 + w * 0.68 * t
                z = h * 0.72 - h * 0.5 * math.sin(ang) + 0.1
                M.box((0.5, d * 0.9, 0.34), (x, 0, z), rot=(0, math.degrees(-math.cos(ang)) * 0.9, 0),
                      mat=M.m('stone_dark'), bevel=0.02)
            for sx in (-1, 1):
                M.box((w * 0.16, d * 0.94, h * 0.6), (sx * w * 0.42, 0, h * 0.3), mat=M.m('stone'), bevel=0.03)
        else:
            for sx in (-1, 1):
                M.box((w * 0.14, d * 0.94, h * 0.7), (sx * w * 0.43, 0, h * 0.35), mat=M.m('stone'), bevel=0.03)
        for i in range(int(w / 0.5)):
            M.box((0.06, d * 0.9, 0.03), (-w / 2 + w * (i + 0.5) / int(w / 0.5), 0, h * 0.84), mat=M.m('stone_dark'), bevel=0.0)
    elif v == 'platform':
        M.box((w, d, 0.3), (0, 0, h * 0.15), mat=M.m('stone_warm'), bevel=0.03)
        M.box((w, 0.12, 0.16), (0, -d / 2 + 0.1, h * 0.3), mat=M.m('gold'), bevel=0.02)
        for i in range(5):
            M.box((0.12, 0.12, h * 0.8), (-w / 2 + w * i / 4, d * 0.36, h * 0.55), mat=M.m('metal_dark'), bevel=0.01)
        M.box((w, 1.6, 0.1), (0, d * 0.36, h * 0.95), rot=(-6, 0, 0), mat=M.m('roof_teal'), bevel=0.02)
        for i in range(3):
            M.box((1.4, 0.4, 0.5), (-w * 0.3 + i * 4.5, d * 0.1, h * 0.55), mat=M.m('wood_mid'), bevel=0.02)
        for i in range(2):
            M.box((0.2, 0.2, 1.6), (-w * 0.4 + i * w * 0.8, -d * 0.2, h * 1.1), mat=M.m('metal_dark'), bevel=0.01)
            M.box((0.6, 0.06, 0.5), (-w * 0.4 + i * w * 0.8, -d * 0.2 - 0.12, h * 1.7), mat=M.m('fabric_blue'), bevel=0.01)
    elif v == 'bicycle':
        for sx in (-1, 1):
            M.cyl(0.34, 0.05, (sx * 0.55, 0, 0.34), rot=(90, 0, 0), mat=M.m('ink'), seg=18)
            M.cyl(0.3, 0.02, (sx * 0.55, 0, 0.34), rot=(90, 0, 0), mat=M.m('metal'), seg=18)
        for a, b in (((-0.55, 0.34), (0, 0.62)), ((0, 0.62), (0.55, 0.34)), ((-0.55, 0.34), (-0.1, 0.34)),
                     ((-0.1, 0.34), (0, 0.62)), ((0, 0.62), (0.12, 0.34)), ((0.12, 0.34), (0.55, 0.34))):
            mx = (a[0] + b[0]) / 2
            mz = (a[1] + b[1]) / 2
            ln = math.hypot(b[0] - a[0], b[1] - a[1])
            ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
            M.box((ln, 0.04, 0.04), (mx, 0, mz), rot=(0, ang, 0), mat=M.m('fabric_red'), bevel=0.006)
        M.box((0.3, 0.12, 0.05), (-0.15, 0, 0.66), mat=M.m('ink'), bevel=0.01)
        M.box((0.05, 0.32, 0.05), (0.5, 0, 0.66), rot=(0, 0, 0), mat=M.m('ink'), bevel=0.006)
        M.box((0.4, 0.04, 0.04), (0.52, 0, 0.72), rot=(0, 0, 0), mat=M.m('wood_dark'), bevel=0.004)
    elif v == 'wheelbarrow':
        M.box((1.1, 0.62, 0.1), (0, 0, 0.52), mat=M.m('wood_light'), bevel=0.02)
        for sx in (-1, 1):
            M.box((0.06, 0.62, 0.3), (sx * 0.5, 0, 0.68), rot=(0, sx * 10, 0), mat=M.m('wood_mid'), bevel=0.01)
        M.cyl(0.24, 0.1, (-0.5, 0, 0.24), rot=(90, 0, 0), mat=M.m('ink'), seg=14)
        for sy in (-1, 1):
            M.box((1.2, 0.05, 0.05), (0.1, sy * 0.26, 0.42), rot=(0, -12, 0), mat=M.m('wood_dark'), bevel=0.006)
        M.box((0.5, 0.1, 0.08), (0.62, 0, 0.9), rot=(0, 20, 0), mat=M.m('wood_dark'), bevel=0.01)


# ------------------------------------------------------------------ 田园
def farm(M, p):
    v = p['variant']
    w, d, h = p['dims']
    if v == 'scarecrow':
        M.cyl(0.06, 2.0, (0, 0, 1.0), mat=M.m('wood_dark'), seg=8)
        M.box((1.1, 0.06, 0.06), (0, 0, 1.45), mat=M.m('wood_dark'), bevel=0.008)
        M.cyl(0.2, 0.5, (0, 0, 1.35), r2=0.26, mat=M.m('fabric_blue'), seg=12)
        M.sphere(0.19, (0, 0, 1.72), mat=M.m('roof_straw'), seg=12, ring=8)
        M.cyl(0.28, 0.1, (0, 0, 1.86), mat=M.m('wood_light'), seg=14)
        for sx in (-1, 1):
            M.box((0.34, 0.1, 0.1), (sx * 0.52, 0, 1.44), mat=M.m('roof_straw'), bevel=0.01)
        M.box((0.06, 0.06, 0.3), (0.1, 0, 1.55), mat=M.m('fabric_red'), bevel=0.006)
    elif v == 'barn':
        M.box((w, d, h * 0.62), (0, 0, h * 0.31), mat=M.m('roof_red'), bevel=0.03)
        M.roof_gable(w, d, h * 0.34, h * 0.62, 'red', overhang=0.6)
        M.box((w * 0.4, 0.12, h * 0.42), (0, -d / 2 - 0.05, h * 0.21), mat=M.m('wood_light'), bevel=0.02)
        for i in range(2):
            M.box((w * 0.42, 0.06, 0.06), (0, -d / 2 - 0.12, h * (0.12 + i * 0.2)), rot=(0, 0, 38),
                  mat=M.m('wood_dark'), bevel=0.008)
        M.box((1.6, 1.2, 0.1), (0, -d / 2 - 0.04, h * 0.52), mat=M.m('wood_dark'), bevel=0.02)
        M.sphere(0.2, (0, -d / 2 - 0.1, h * 0.52 + 0.5), mat=M.m('white'), seg=10, ring=6)
        for i in range(3):
            M.box((0.5, 0.5, 0.5), (-w * 0.3 + i * w * 0.3, d * 0.3, h * 0.66), rot=(0, 20, 0), mat=M.m('roof_straw'), bevel=0.03)
        chimney(M, w * 0.3, d * 0.2, h * 0.8, 1.2, 0.5)
    elif v == 'windmill':
        M.cyl(1.2, h * 0.6, (0, 0, h * 0.3), r2=0.9, mat=M.m('wall_cream'), seg=16, bevel=0.02)
        M.cyl(1.0, h * 0.24, (0, 0, h * 0.72), r2=0.2, mat=M.m('roof_red'), seg=16, bevel=0.02)
        M.cyl(0.14, 0.4, (0, -1.1, h * 0.7), rot=(90, 0, 0), mat=M.m('wood_dark'), seg=10)
        for i in range(4):
            a = 90 * i
            M.box((0.2, 0.08, 3.0), (math.sin(math.radians(a)) * 1.5, -1.3,
                                     h * 0.7 + math.cos(math.radians(a)) * 1.5), rot=(0, a, 0),
                  mat=M.m('wood_light'), bevel=0.015)
            M.box((0.7, 0.03, 2.6), (math.sin(math.radians(a)) * 1.5, -1.34,
                                     h * 0.7 + math.cos(math.radians(a)) * 1.5), rot=(0, a, 0),
                  mat=M.m('fabric_cream'), bevel=0.008)
        M.door((0, -1.16, 0), 0.9, 1.9, 'y', 'wood_mid')
    elif v == 'beehive':
        M.box((1.0, 1.0, 0.1), (0, 0, 0.05), mat=M.m('wood_mid'), bevel=0.02)
        for i in range(3):
            M.box((0.8, 0.8, 0.22), (0, 0, 0.22 + i * 0.25), mat=M.m('wall_butter'), bevel=0.02)
        M.box((0.9, 0.9, 0.06), (0, 0, 0.94), mat=M.m('wood_dark'), bevel=0.02)
        M.box((0.3, 0.02, 0.08), (0, -0.42, 0.2), mat=M.m('ink'), bevel=0.006)
        for sx in (-1, 1):
            for i in range(2):
                M.sphere(0.07, (sx * 0.5, 0.3 + i * 0.2, 1.1 + i * 0.1), mat=M.m('gold'), seg=8, ring=5)
    elif v == 'chicken_coop':
        M.box((w, d, h * 0.6), (0, 0, h * 0.3 + 0.25), mat=M.m('wood_light'), bevel=0.02)
        M.roof_gable(w, d, h * 0.28, h * 0.6 + 0.25, 'straw', overhang=0.3, tiles=False)
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.cyl(0.07, 0.6, (sx * (w / 2 - 0.15), sy * (d / 2 - 0.15), 0.15), mat=M.m('wood_dark'), seg=8)
        M.box((0.5, 0.06, 0.5), (0, -d / 2 - 0.03, 0.55), mat=M.m('ink'), bevel=0.01)
        M.box((0.7, 1.2, 0.06), (0, -d / 2 - 0.4, 0.62), rot=(22, 0, 0), mat=M.m('wood_mid'), bevel=0.01)
        M.railing((-w * 0.6, -d / 2 - 0.9), (w * 0.6, -d / 2 - 0.9), 0.5, 'wood_mid', 'wood', 0.3)
        for i in range(3):
            M.sphere(0.14, (-0.4 + i * 0.35, -d / 2 - 1.1, 0.3), mat=M.m('white' if i % 2 else 'roof_straw'), seg=8, ring=6)
    elif v == 'waterwheel':
        M.box((w, 0.3, h * 0.85), (0, 0.3, h * 0.42), mat=M.m('wood_mid'), bevel=0.03)
        M.cyl(0.9, 0.24, (0, 0, 2.2), rot=(90, 0, 0), mat=M.m('wood_dark'), seg=16)
        for i in range(12):
            a = TAU * i / 12
            M.box((0.16, 0.16, 0.9), (math.cos(a) * 0.75, -0.1, 2.2 + math.sin(a) * 0.75),
                  rot=(0, math.degrees(a), 0), mat=M.m('wood_mid'), bevel=0.01)
            M.box((0.5, 0.06, 0.42), (math.cos(a) * 0.95, -0.1, 2.2 + math.sin(a) * 0.95),
                  rot=(0, math.degrees(a), 0), mat=M.m('wood_light'), bevel=0.008)
        M.cyl(1.0, 0.08, (0, -0.14, 2.2), rot=(90, 0, 0), mat=M.m('metal_dark'), seg=18)
        M.box((0.4, 0.6, 0.4), (0, 0.3, 3.15), mat=M.m('wood_dark'), bevel=0.02)
        M.cyl(0.16, 1.4, (0, 0.3, 2.4), rot=(0, 0, 0), mat=M.m('metal_dark'), seg=10)
    elif v == 'mill':
        M.box((w, d, h * 0.6), (0, 0, h * 0.3), mat=M.m('wall_cream'), bevel=0.03)
        M.timber(w, d, 0.2, h * 0.6, 'wood_dark', 0.9)
        M.roof_gable(w, d, h * 0.3, h * 0.6, 'red', overhang=0.6)
        M.cyl(1.5, 0.18, (0, 0, h * 0.7), rot=(90, 0, 0), mat=M.m('stone_warm'), seg=20)
        M.door((0, -d / 2 - 0.06, 0), 1.0, 2.0, 'y', 'wood_mid')
        for sx in (-1, 1):
            M.box((0.5, 0.06, 0.3), (sx * w * 0.3, -d / 2 - 0.04, h * 0.42), mat=M.m('fabric_cream'), bevel=0.01)
        chimney(M, -w * 0.3, d * 0.2, h * 0.75, 1.2, 0.45)
    elif v in ('fence_a', 'fence_b'):
        spacing = 0.5 if v == 'fence_a' else 0.9
        n = max(2, int(w / spacing))
        for i in range(n + 1):
            x = -w / 2 + w * i / n
            M.box((0.09, 0.09, h), (x, 0, h / 2), mat=M.m('wood_mid'), bevel=0.01)
            M.cyl(0.09, 0.06, (x, 0, h), mat=M.m('wood_dark'), seg=8)
        if v == 'fence_a':
            for z in (h * 0.7, h * 0.4):
                M.box((w, 0.05, 0.08), (0, 0, z), mat=M.m('wood_light'), bevel=0.008)
            for i in range(n):
                x = -w / 2 + w * (i + 0.5) / n
                M.box((0.06, 0.04, h * 0.5), (x, 0, h * 0.32), mat=M.m('wood_light'), bevel=0.006)
        else:
            for z in (h * 0.75, h * 0.45):
                M.box((w, 0.06, 0.1), (0, 0, z), mat=M.m('wood_light'), bevel=0.01)
    elif v == 'fence_gate':
        for sx in (-1, 1):
            M.box((0.14, 0.14, h), (sx * w * 0.42, 0, h / 2), mat=M.m('wood_dark'), bevel=0.012)
        for i in range(3):
            M.box((w * 0.8, 0.07, 0.1), (0, 0, h * (0.32 + i * 0.22)), rot=(0, 0, 0), mat=M.m('wood_light'), bevel=0.01)
        M.box((0.08, 0.08, h * 0.9), (0, 0, h * 0.45), rot=(0, 40, 0), mat=M.m('wood_mid'), bevel=0.008)
        M.box((0.08, 0.08, h * 0.9), (0, 0, h * 0.45), rot=(0, -40, 0), mat=M.m('wood_mid'), bevel=0.008)
        M.cyl(0.06, 0.1, (w * 0.36, 0.1, h * 0.55), mat=M.m('metal_dark'), seg=8)
    elif v == 'trellis':
        for sx in (-1, 1):
            M.box((0.08, 0.08, h), (sx * w * 0.42, 0, h / 2), mat=M.m('wood_mid'), bevel=0.01)
        for i in range(4):
            M.box((w * 0.84, 0.05, 0.06), (0, 0, h * (0.2 + i * 0.25)), mat=M.m('wood_light'), bevel=0.006)
        for i in range(3):
            M.box((0.05, 0.05, h * 0.8), (-w * 0.25 + i * w * 0.25, 0, h * 0.5), mat=M.m('wood_light'), bevel=0.006)
        for i in range(4):
            M.bush((-w * 0.3 + i * w * 0.2, 0, h * 0.5), 0.16, 'leaf_light' if i % 2 else 'leaf')
    elif v == 'grape_arbor':
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.box((0.12, 0.12, h), (sx * w * 0.42, sy * d * 0.42, h / 2), mat=M.m('wood_mid'), bevel=0.012)
            M.box((w * 0.95, 0.1, 0.1), (0, sy * d * 0.42, h), mat=M.m('wood_mid'), bevel=0.01)
        for i in range(6):
            M.box((0.08, d * 0.9, 0.08), (-w * 0.4 + i * w * 0.16, 0, h + 0.06), mat=M.m('wood_light'), bevel=0.008)
        for i in range(5):
            M.bush((-w * 0.35 + i * w * 0.18, 0, h + 0.1), 0.32, 'leaf_dark' if i % 2 else 'leaf')
        for i in range(4):
            M.sphere(0.09, (-w * 0.3 + i * w * 0.2, 0.1, h - 0.2), mat=M.m('roof_blue'), seg=8, ring=5)
    elif v == 'haystack':
        M.cyl(1.1, 1.5, (0, 0, 0.75), r2=0.9, mat=M.m('roof_straw'), seg=16, bevel=0.02)
        M.cyl(0.9, 0.5, (0, 0, 1.6), r2=0.25, mat=M.m('roof_straw'), seg=16, bevel=0.02)
        for i in range(6):
            a = TAU * i / 6
            M.box((0.06, 0.06, 0.6), (math.cos(a) * 1.0, math.sin(a) * 1.0, 0.5), rot=(0, 0, math.degrees(a)),
                  mat=M.m('wood_dark'), bevel=0.006)
    elif v == 'well':
        M.cyl(0.85, 0.85, (0, 0, 0.42), mat=M.m('stone'), seg=18, bevel=0.02)
        M.cyl(0.72, 0.05, (0, 0, 0.84), mat=M.m('ink'), seg=18)
        for sx in (-1, 1):
            M.box((0.12, 0.12, 1.5), (sx * 0.7, 0, 1.4), mat=M.m('wood_mid'), bevel=0.012)
        M.box((1.6, 0.1, 0.1), (0, 0, 2.15), mat=M.m('wood_dark'), bevel=0.01)
        M.roof_gable(1.7, 1.2, 0.35, 2.2, 'straw', overhang=0.2, tiles=False)
        M.cyl(0.12, 0.9, (0, 0, 1.75), rot=(0, 90, 0), mat=M.m('wood_light'), seg=10)
        M.cyl(0.22, 0.28, (0, 0, 1.2), r2=0.2, mat=M.m('wood_mid'), seg=12, bevel=0.01)
        M.cyl(0.03, 0.5, (0, 0, 1.5), mat=M.m('metal_dark'), seg=6)
    elif v == 'trough':
        M.box((w, d, h * 0.8), (0, 0, h * 0.4), mat=M.m('wood_mid'), bevel=0.02)
        M.box((w * 0.9, d * 0.8, 0.06), (0, 0, h * 0.72), mat=M.m('water'), bevel=0.01)
        for sx in (-1, 1):
            M.box((0.08, d, h * 0.85), (sx * w / 2, 0, h * 0.42), mat=M.m('wood_dark'), bevel=0.01)
        for i in range(3):
            M.sphere(0.07, (-0.4 + i * 0.4, 0.1, h * 0.78), mat=M.m('roof_straw'), seg=8, ring=5)
    elif v == 'toolrack':
        M.box((w, 0.08, 0.08), (0, 0, h * 0.85), mat=M.m('wood_dark'), bevel=0.01)
        for sx in (-1, 1):
            M.box((0.08, 0.08, h), (sx * w * 0.46, 0, h / 2), mat=M.m('wood_mid'), bevel=0.01)
        # 锄头/铲子/耙
        for i, (px, key) in enumerate(((-0.5, 'metal'), (0.0, 'wood_light'), (0.5, 'stone_dark'))):
            M.box((0.05, 0.05, h * 0.7), (px, 0, h * 0.5), mat=M.m('wood_light'), bevel=0.006)
            M.box((0.18, 0.05, 0.22), (px, 0, h * 0.18), mat=M.m(key), bevel=0.01)
        M.box((0.4, 0.1, 0.3), (0, -0.1, h * 0.95), mat=M.m('wood_light'), bevel=0.02)
    elif v == 'greenhouse':
        M.box((w, d, 0.3), (0, 0, 0.15), mat=M.m('stone_warm'), bevel=0.02)
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.box((0.08, 0.08, h), (sx * w * 0.46, sy * d * 0.44, h / 2 + 0.3), mat=M.m('metal_dark'), bevel=0.008)
        M.roof_gable(w * 0.96, d * 0.92, h * 0.4, h + 0.3, 'glass', overhang=0.1, tiles=False)
        for sy in (-1, 1):
            M.box((w * 0.9, 0.05, h * 0.8), (0, sy * d * 0.44, h * 0.55), mat=M.m('glass', rough=0.15))
        for i in range(3):
            M.box((w * 0.8, d * 0.6, 0.28), (0, 0, 0.45 + i * 0.0), mat=M.m('soil'), bevel=0.02)
        for i in range(4):
            M.bush((-w * 0.3 + i * w * 0.2, 0, 0.6), 0.18, 'leaf_light')
    elif v == 'silo':
        M.cyl(w / 2, h * 0.82, (0, 0, h * 0.41), mat=M.m('wall_ash'), seg=20, bevel=0.02)
        for i in range(4):
            M.cyl(w / 2 + 0.04, 0.1, (0, 0, h * (0.15 + i * 0.17)), mat=M.m('metal_dark'), seg=20)
        M.sphere(w / 2, (0, 0, h * 0.82), mat=M.m('roof_teal'), seg=20, ring=10, scale=(1, 1, 0.55))
        M.cyl(0.1, 1.0, (0, 0, h * 0.9), mat=M.m('metal_dark'), seg=8)
        M.door((0, -w / 2 - 0.02, 0), 0.9, 1.9, 'y', 'metal_dark')


# ------------------------------------------------------------------ 家具
def furniture(M, p):
    v = p['variant']
    w, d, h = p['dims']
    wood = M.m('wood_mid')
    wood_l = M.m('wood_light')
    if v in ('sofa', 'armchair'):
        M.box((w, d, h * 0.42), (0, 0, h * 0.32), mat=M.m('fabric_green'), bevel=0.06)
        M.box((w, d * 0.28, h * 0.6), (0, d * 0.34, h * 0.5), mat=M.m('fabric_green'), bevel=0.06)
        for sx in (-1, 1):
            M.box((w * 0.12, d, h * 0.5), (sx * (w / 2 - w * 0.06), 0, h * 0.42), mat=M.m('fabric_green'), bevel=0.05)
        for i in range(3):
            M.box((w * 0.3, d * 0.6, h * 0.14), (-w * 0.3 + i * w * 0.3, -d * 0.06, h * 0.56),
                  mat=M.m('fabric_cream'), bevel=0.05)
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.cyl(0.035, 0.12, (sx * w * 0.42, sy * d * 0.38, 0.06), mat=M.m('wood_dark'), seg=8)
    elif v == 'coffee_table':
        M.box((w, d, 0.05), (0, 0, h - 0.02), mat=wood_l, bevel=0.012)
        M.box((w * 0.9, d * 0.8, 0.03), (0, 0, h * 0.5), mat=wood, bevel=0.008)
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.box((0.05, 0.05, h), (sx * w * 0.44, sy * d * 0.4, h / 2), mat=wood, bevel=0.008)
        M.cyl(0.09, 0.14, (0.2, 0, h + 0.06), mat=M.m('white'), seg=12)
        M.box((0.2, 0.16, 0.03), (-0.2, 0, h + 0.01), mat=M.m('fabric_red'), bevel=0.006)
    elif v == 'tv_stand':
        M.box((w, d, h), (0, 0, h / 2), mat=wood, bevel=0.015)
        for i in range(2):
            M.box((w * 0.46, 0.03, h * 0.5), (-w * 0.24 + i * w * 0.48, -d / 2 - 0.01, h * 0.62),
                  mat=wood_l, bevel=0.008)
        M.box((w * 0.66, 0.06, 0.42), (0, 0, h + 0.22), mat=M.m('ink'), bevel=0.02)
        M.box((w * 0.6, 0.02, 0.34), (0, -0.03, h + 0.22), mat=M.m('glass', rough=0.15))
        M.box((0.3, 0.14, 0.04), (0, 0.02, h + 0.02), mat=M.m('metal_dark'), bevel=0.006)
    elif v == 'bookshelf':
        M.box((w, d, h), (0, 0, h / 2), mat=wood, bevel=0.012)
        for i in range(5):
            z = h * (0.1 + i * 0.19)
            M.box((w * 0.92, d * 0.94, 0.03), (0, 0, z), mat=wood_l, bevel=0.006)
            for j in range(7):
                if (i + j) % 3 == 0:
                    continue
                bh = 0.22 + 0.03 * ((i * j) % 3)
                M.box((w * 0.1, d * 0.6, bh), (-w * 0.4 + j * w * 0.13, 0, z + bh / 2 + 0.02),
                      mat=M.m(['fabric_red', 'fabric_blue', 'fabric_green', 'wall_pink', 'gold'][(i + j) % 5]),
                      bevel=0.006)
    elif v == 'dining_table':
        M.box((w, d, 0.06), (0, 0, h - 0.03), mat=wood_l, bevel=0.014)
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.box((0.07, 0.07, h - 0.06), (sx * w * 0.42, sy * d * 0.4, (h - 0.06) / 2), mat=wood, bevel=0.008)
        M.box((w * 0.8, 0.05, 0.06), (0, 0, h * 0.42), mat=wood, bevel=0.008)
    elif v == 'dining_chair':
        M.box((w, d, 0.05), (0, 0, h * 0.46), mat=wood_l, bevel=0.012)
        M.box((w, 0.05, h * 0.5), (0, d * 0.44, h * 0.72), mat=wood, bevel=0.01)
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.box((0.045, 0.045, h * 0.46), (sx * w * 0.42, sy * d * 0.4, h * 0.23), mat=wood, bevel=0.006)
        M.box((w * 0.8, d * 0.7, 0.05), (0, 0, h * 0.5), mat=M.m('fabric_cream'), bevel=0.014)
    elif v in ('bed_double', 'bed_single'):
        M.box((w, d, h * 0.4), (0, 0, h * 0.28), mat=wood, bevel=0.02)
        M.box((w * 0.94, d * 0.94, h * 0.2), (0, 0, h * 0.5), mat=M.m('white'), bevel=0.03)
        M.box((w * 0.9, d * 0.5, h * 0.1), (0, -d * 0.2, h * 0.62), mat=M.m('fabric_blue'), bevel=0.02)
        for i in range(2):
            M.box((w * (0.34 if v == 'bed_double' else 0.6), d * 0.22, h * 0.1),
                  (-w * (0.22 if v == 'bed_double' else 0) + i * w * 0.44 * (v == 'bed_double'), d * 0.3, h * 0.66),
                  mat=M.m('white'), bevel=0.03)
        M.box((w, 0.08, h * 0.9), (0, d / 2 - 0.04, h * 0.45), mat=wood_l, bevel=0.02)
        for sx in (-1, 1):
            M.box((0.08, d * 0.9, h * 0.3), (sx * (w / 2 - 0.04), 0, h * 0.25), mat=wood, bevel=0.01)
    elif v == 'wardrobe':
        M.box((w, d, h), (0, 0, h / 2), mat=wood, bevel=0.02)
        for i in range(2):
            M.box((w * 0.46, 0.04, h * 0.9), (-w * 0.24 + i * w * 0.48, -d / 2 - 0.02, h * 0.54), mat=wood_l, bevel=0.01)
            M.cyl(0.02, 0.12, (-w * 0.03 + i * w * 0.06, -d / 2 - 0.06, h * 0.5), mat=M.m('gold'), seg=8)
        M.box((w + 0.06, d + 0.04, 0.08), (0, 0, h - 0.04), mat=wood_l, bevel=0.012)
        M.box((w, 0.06, h * 0.06), (0, 0, 0.05), mat=wood_l, bevel=0.01)
    elif v == 'nightstand':
        M.box((w, d, h), (0, 0, h / 2), mat=wood, bevel=0.014)
        M.box((w * 0.9, 0.03, h * 0.4), (0, -d / 2 - 0.01, h * 0.62), mat=wood_l, bevel=0.008)
        M.box((w * 0.9, 0.03, h * 0.34), (0, -d / 2 - 0.01, h * 0.3), mat=wood_l, bevel=0.008)
        M.cyl(0.015, 0.04, (0, -d / 2 - 0.03, h * 0.62), mat=M.m('gold'), seg=8)
        M.cyl(0.1, 0.22, (0, 0, h + 0.11), mat=M.m('fabric_cream'), seg=12)
        M.cyl(0.02, 0.3, (0, 0, h + 0.05), mat=M.m('metal'), seg=6)
    elif v == 'dresser':
        M.box((w, d, h * 0.45), (0, 0, h * 0.225), mat=wood, bevel=0.016)
        for i in range(3):
            M.box((w * 0.9, 0.03, h * 0.12), (0, -d / 2 - 0.01, h * (0.08 + i * 0.14)), mat=wood_l, bevel=0.008)
        M.box((w * 0.9, d * 0.8, 0.05), (0, 0, h * 0.46), mat=wood_l, bevel=0.01)
        M.box((w * 0.8, 0.05, h * 0.44), (0, d * 0.36, h * 0.7), mat=wood_l, bevel=0.012)
        M.cyl(0.06, 0.5, (0, d * 0.36, h * 0.95), mat=M.m('gold'), seg=8)
        M.sphere(0.1, (0, d * 0.36, h * 1.25), mat=M.m('glow', emit=1.0, emit_strength=1.2), seg=10, ring=6)
    elif v == 'desk':
        M.box((w, d, 0.06), (0, 0, h - 0.03), mat=wood_l, bevel=0.014)
        for sx in (-1, 1):
            M.box((0.06, d * 0.94, h - 0.06), (sx * w * 0.46, 0, (h - 0.06) / 2), mat=wood, bevel=0.01)
        M.box((w * 0.3, d * 0.9, h * 0.5), (w * 0.3, 0, h * 0.28), mat=wood, bevel=0.01)
        for i in range(2):
            M.box((w * 0.26, 0.03, h * 0.18), (w * 0.3, -d / 2 - 0.01, h * (0.2 + i * 0.22)), mat=wood_l, bevel=0.006)
        M.box((0.42, 0.28, 0.03), (-w * 0.1, 0, h + 0.01), mat=M.m('wall_ash'), bevel=0.01)
        M.cyl(0.07, 0.16, (-w * 0.32, 0.05, h + 0.08), mat=M.m('white'), seg=10)
    elif v == 'stove':
        M.box((w, d, h * 0.9), (0, 0, h * 0.45), mat=M.m('wall_ash'), bevel=0.02)
        M.box((w * 0.94, d * 0.94, 0.05), (0, 0, h * 0.9), mat=M.m('metal_dark'), bevel=0.012)
        for i in range(2):
            M.cyl(0.16, 0.03, (-w * 0.22 + i * w * 0.44, 0, h * 0.92), mat=M.m('ink'), seg=16)
        for i in range(3):
            M.cyl(0.035, 0.06, (-w * 0.3 + i * w * 0.3, -d / 2 - 0.03, h * 0.7), mat=M.m('metal'), seg=8)
        M.box((w * 0.9, 0.05, h * 0.3), (0, -d / 2 - 0.02, h * 0.34), mat=M.m('glass', rough=0.2))
        M.box((w * 0.9, 0.7, 0.35), (0, 0, h * 1.05), mat=M.m('metal'), bevel=0.02)
        M.cyl(0.16, 0.5, (0, 0, h * 1.42), mat=M.m('metal_dark'), seg=12)
    elif v == 'fridge':
        M.box((w, d, h), (0, 0, h / 2), mat=M.m('wall_ash'), bevel=0.03)
        M.box((w + 0.02, d * 0.98, 0.02), (0, 0, h * 0.66), mat=M.m('metal_dark'), bevel=0.0)
        for i in range(2):
            M.box((0.03, 0.04, h * 0.22), (w * 0.34, -d / 2 - 0.02, h * (0.82 if i == 0 else 0.5)),
                  mat=M.m('metal'), bevel=0.006)
    elif v == 'sink':
        M.box((w, d, h * 0.9), (0, 0, h * 0.45), mat=wood, bevel=0.016)
        M.box((w * 0.86, d * 0.8, 0.04), (0, 0, h * 0.9), mat=M.m('metal'), bevel=0.01)
        M.box((w * 0.5, d * 0.5, 0.12), (0, 0, h * 0.86), mat=M.m('metal_dark'), bevel=0.02)
        M.cyl(0.03, 0.3, (0, d * 0.3, h * 1.05), mat=M.m('metal'), seg=8)
        M.cyl(0.03, 0.16, (0, d * 0.3 - 0.08, h * 1.19), rot=(90, 0, 0), mat=M.m('metal'), seg=8)
        for i in range(2):
            M.box((w * 0.46, 0.03, h * 0.4), (-w * 0.24 + i * w * 0.48, -d / 2 - 0.01, h * 0.5), mat=wood_l, bevel=0.008)
    elif v == 'bathtub':
        for sx in (-1, 1):
            for sy in (-1, 1):
                M.cyl(0.05, h * 0.9, (sx * w * 0.42, sy * d * 0.4, h * 0.45), mat=M.m('gold'), seg=8)
        M.box((w, d, h * 0.5), (0, 0, h * 0.7), mat=M.m('white'), bevel=0.08)
        M.box((w * 0.86, d * 0.82, h * 0.36), (0, 0, h * 0.76), mat=M.m('water'), bevel=0.06)
        M.cyl(0.03, 0.3, (w * 0.4, 0, h * 1.05), mat=M.m('metal'), seg=8)
        M.cyl(0.03, 0.14, (w * 0.4 - 0.07, 0, h * 1.2), rot=(90, 0, 0), mat=M.m('metal'), seg=8)
    elif v == 'basin':
        M.box((w, d, h * 0.85), (0, 0, h * 0.42), mat=M.m('wall_ash'), bevel=0.02)
        M.box((w * 0.9, d * 0.9, 0.1), (0, 0, h * 0.88), mat=M.m('white'), bevel=0.03)
        M.cyl(0.03, 0.24, (0, d * 0.32, h * 1.02), mat=M.m('metal'), seg=8)
        M.box((w * 0.7, 0.02, h * 0.7), (0, -d / 2 - 0.01, h * 0.55), mat=M.m('glass', rough=0.05))
    elif v == 'toilet':
        M.box((w, d * 0.7, h * 0.5), (0, -d * 0.1, h * 0.25), mat=M.m('white'), bevel=0.06)
        M.box((w * 0.98, d * 0.62, 0.1), (0, -d * 0.1, h * 0.52), mat=M.m('white'), bevel=0.04)
        M.box((w * 0.9, d * 0.28, h * 0.55), (0, d * 0.34, h * 0.62), mat=M.m('white'), bevel=0.04)
        M.cyl(0.05, 0.06, (w * 0.3, d * 0.1, h * 0.56), mat=M.m('metal'), seg=8)
    elif v == 'washer':
        M.box((w, d, h), (0, 0, h / 2), mat=M.m('white'), bevel=0.03)
        M.cyl(0.2, 0.03, (0, -d / 2 - 0.01, h * 0.52), rot=(90, 0, 0), mat=M.m('ink'), seg=18)
        M.cyl(0.15, 0.02, (0, -d / 2 - 0.02, h * 0.52), rot=(90, 0, 0), mat=M.m('glass', rough=0.1), seg=18)
        M.box((w * 0.9, 0.02, h * 0.18), (0, -d / 2 - 0.01, h * 0.84), mat=M.m('wall_ash'), bevel=0.01)
        for i in range(3):
            M.cyl(0.03, 0.03, (-w * 0.25 + i * w * 0.25, -d / 2 - 0.02, h * 0.2), mat=M.m('metal'), seg=8)
    elif v == 'floor_lamp':
        M.cyl(0.22, 0.05, (0, 0, 0.025), mat=M.m('metal_dark'), seg=16)
        M.cyl(0.035, h * 0.8, (0, 0, h * 0.4), mat=M.m('gold'), seg=8)
        M.cyl(0.26, 0.34, (0, 0, h * 0.9), r2=0.16, mat=M.m('fabric_cream'), seg=16, bevel=0.01)
        M.cyl(0.24, 0.2, (0, 0, h * 0.88), r2=0.2, mat=M.m('glow', emit=1.0, emit_strength=1.8), seg=16)
    elif v == 'rug':
        M.box((w, d, 0.02), (0, 0, 0.01), mat=M.m('fabric_red'), bevel=0.01)
        M.box((w * 0.86, d * 0.84, 0.008), (0, 0, 0.024), mat=M.m('fabric_cream'), bevel=0.006)
        M.box((w * 0.7, d * 0.68, 0.006), (0, 0, 0.03), mat=M.m('fabric_green'), bevel=0.004)
    elif v == 'door':
        M.box((w, d, h), (0, 0, h / 2), mat=M.m('wood_mid'), bevel=0.014)
        for i in range(3):
            M.box((w * 0.26, 0.03, h * 0.9), (-w * 0.3 + i * w * 0.3, -d / 2 - 0.02, h / 2), mat=M.m('wood_dark'), bevel=0.006)
        M.sphere(0.04, (w * 0.34, -d / 2 - 0.05, h * 0.46), mat=M.m('gold'), seg=10, ring=6)
        M.box((w * 0.94, d * 0.8, 0.06), (0, 0, h * 0.02), mat=M.m('wood_dark'), bevel=0.008)
    elif v == 'window':
        M.box((w, d, h), (0, 0, h / 2), mat=M.m('wood_dark'), bevel=0.02)
        M.box((w * 0.86, d * 0.6, h * 0.86), (0, 0, h / 2), mat=M.m('glass', rough=0.2), bevel=0.0)
        for i in range(1, 3):
            M.box((0.05, d * 1.1, h * 0.86), (-w / 2 + w * i / 3, 0, h / 2), mat=M.m('wood_dark'), bevel=0.006)
        M.box((w * 0.9, d * 1.6, 0.08), (0, 0, h * 0.5), mat=M.m('wood_dark'), bevel=0.01)
        M.box((w * 1.1, d * 1.8, 0.1), (0, 0, 0.05), mat=M.m('wood_light'), bevel=0.014)
    elif v == 'stairs':
        n = 14
        for i in range(n):
            M.box((w, d / n + 0.02, 0.05), (0, -d / 2 + d * (i + 0.5) / n, h * (i + 1) / n),
                  mat=M.m('wood_light'), bevel=0.008)
            M.box((w * 0.96, d / n, h * (i + 1) / n), (0, -d / 2 + d * (i + 0.5) / n, h * (i + 1) / n / 2),
                  mat=M.m('wood_mid'), bevel=0.006)
        for sx in (-1, 1):
            M.box((0.06, 0.06, h * 0.55), (sx * w / 2, -d / 2 + 0.3, h * 0.85),
                  rot=(0, 0, 0), mat=M.m('wood_dark'), bevel=0.008)


# ------------------------------------------------------------------ 小品
def misc(M, p):
    v = p['variant']
    w, d, h = p['dims']
    if v == 'stone_lantern':
        M.box((0.62, 0.62, 0.16), (0, 0, 0.08), mat=M.m('stone_dark'), bevel=0.03)
        M.cyl(0.16, 0.7, (0, 0, 0.5), mat=M.m('stone'), seg=8, bevel=0.02)
        M.box((0.5, 0.5, 0.14), (0, 0, 0.92), mat=M.m('stone'), bevel=0.03)
        M.box((0.4, 0.4, 0.3), (0, 0, 1.14), mat=M.m('glow', emit=1.0, emit_strength=1.6), bevel=0.02)
        for i in range(4):
            a = TAU * i / 4
            M.box((0.07, 0.07, 0.34), (math.cos(a) * 0.19, math.sin(a) * 0.19, 1.14), mat=M.m('stone'), bevel=0.008)
        M.cyl(0.42, 0.14, (0, 0, 1.36), r2=0.1, mat=M.m('stone_dark'), seg=8, bevel=0.02)
        M.sphere(0.08, (0, 0, 1.46), mat=M.m('stone'), seg=10, ring=6)
    elif v == 'birdhouse':
        M.cyl(0.05, h * 0.75, (0, 0, h * 0.375), mat=M.m('wood_dark'), seg=8)
        M.box((0.36, 0.32, 0.34), (0, 0, h * 0.86), mat=M.m('wood_light'), bevel=0.02)
        M.roof_gable(0.4, 0.36, 0.16, h * 0.86 + 0.17, 'red', overhang=0.06, tiles=False)
        M.cyl(0.07, 0.04, (0, -0.17, h * 0.86), rot=(90, 0, 0), mat=M.m('ink'), seg=10)
        M.cyl(0.06, 0.1, (0, -0.24, h * 0.78), mat=M.m('wood_dark'), seg=8)
    elif v == 'signpost':
        M.cyl(0.07, h, (0, 0, h / 2), mat=M.m('wood_dark'), seg=8)
        for i, (ang, key, ww) in enumerate(((20, 'wood_light', 0.9), (-25, 'wood_light', 0.75), (70, 'wood_mid', 0.6))):
            M.box((ww, 0.06, 0.22), (0.1, 0, h * (0.86 - i * 0.12)), rot=(0, 0, ang), mat=M.m(key), bevel=0.01)
            M.box((ww * 0.9, 0.02, 0.03), (0.1, -0.04, h * (0.86 - i * 0.12) + 0.05), rot=(0, 0, ang),
                  mat=M.m('ink'), bevel=0.004)
        M.bush((0, 0, 0), 0.16, 'leaf', count=2)
    elif v == 'wood_sign':
        for sx in (-1, 1):
            M.cyl(0.06, h, (sx * w * 0.42, 0, h / 2), mat=M.m('wood_dark'), seg=8)
        M.box((w, 0.08, 0.5), (0, 0, h * 0.78), mat=M.m('wood_light'), bevel=0.02)
        M.box((w * 0.9, 0.02, 0.42), (0, -0.05, h * 0.78), mat=M.m('wood_mid'), bevel=0.008)
        M.box((w * 0.7, 0.03, 0.06), (0, -0.07, h * 0.82), mat=M.m('ink'), bevel=0.004)
        M.box((w * 0.5, 0.03, 0.05), (0, -0.07, h * 0.74), mat=M.m('ink'), bevel=0.004)
    elif v == 'flag':
        M.cyl(0.06, h, (0, 0, h / 2), mat=M.m('wood_dark'), seg=8)
        rows = []
        for i in range(6):
            t = i / 5
            rows.append([Vector((0.02, -0.35 * t, h * 0.92 - 0.9 * t)),
                         Vector((0.9, -0.42 * t, h * 0.92 - 0.95 * t))])
        M.quad_strip(rows, mat=M.m('fabric_red'), smooth=True)
        M.sphere(0.09, (0, 0, h + 0.05), mat=M.m('gold'), seg=10, ring=6)
        M.cyl(0.16, 0.08, (0, 0, 0.04), mat=M.m('stone_dark'), seg=12)
    elif v == 'rope_knot':
        M.cyl(0.24, 0.14, (0, 0, 0.07), mat=M.m('stone_dark'), seg=14)
        M.cyl(0.16, 0.5, (0, 0, 0.35), mat=M.m('wood_dark'), seg=10, bevel=0.02)
        for i in range(4):
            a = TAU * i / 4
            M.box((0.08, 0.08, 0.3), (math.cos(a) * 0.14, math.sin(a) * 0.14, 0.62),
                  rot=(0, 12, math.degrees(a)), mat=M.m('roof_straw'), bevel=0.01)
        M.sphere(0.14, (0, 0, 0.62), mat=M.m('roof_straw'), seg=12, ring=8)
        M.cyl(0.04, 0.4, (0.22, 0, 0.5), rot=(0, 30, 0), mat=M.m('roof_straw'), seg=8)
    elif v == 'net_rack':
        for sx in (-1, 1):
            M.box((0.1, 0.1, h), (sx * w * 0.45, 0, h / 2), mat=M.m('wood_dark'), bevel=0.01)
        M.box((w, 0.08, 0.08), (0, 0, h * 0.96), mat=M.m('wood_mid'), bevel=0.008)
        M.box((w * 0.9, 0.08, 0.06), (0, 0, h * 0.3), mat=M.m('wood_mid'), bevel=0.008)
        for i in range(7):
            M.box((0.02, 0.02, h * 0.62), (-w * 0.42 + i * w * 0.14, 0.05, h * 0.63), mat=M.m('roof_straw'), bevel=0.0)
        for i in range(6):
            M.box((w * 0.86, 0.02, 0.02), (0, 0.05, h * (0.34 + i * 0.1)), mat=M.m('roof_straw'), bevel=0.0)
    elif v == 'lantern_string':
        M.box((w * 0.94, 0.03, 0.03), (0, 0, 0), mat=M.m('metal_dark'), bevel=0.006)
        n = 7
        for i in range(n):
            t = (i + 0.5) / n
            x = -w / 2 + w * t
            sag = 0.3 * math.sin(math.pi * t)
            M.cyl(0.03, 0.12, (x, 0, -0.1 - sag), mat=M.m('metal_dark'), seg=6)
            M.sphere(0.11, (x, 0, -0.26 - sag), mat=M.m('glow', emit=1.0, emit_strength=2.2), seg=10, ring=6,
                     scale=(1, 1, 1.2))
            M.cyl(0.1, 0.05, (x, 0, -0.14 - sag), mat=M.m('fabric_red'), seg=10)
    elif v == 'stone_steps':
        n = 4
        for i in range(n):
            M.box((w, d / n, h * (i + 1) / n), (0, -d / 2 + d * (i + 0.5) / n, h * (i + 1) / n / 2),
                  mat=M.m('stone_warm' if i % 2 == 0 else 'stone'), bevel=0.02)
        for sx in (-1, 1):
            M.box((0.16, d, h * 0.5), (sx * (w / 2 + 0.08), 0, h * 0.25), mat=M.m('stone_dark'), bevel=0.02)
    elif v == 'rock_garden':
        M.box((w, d, 0.16), (0, 0, 0.08), mat=M.m('wall_ash'), bevel=0.02)
        for i in range(5):
            a = TAU * i / 5
            r = 0.4 + 0.2 * (i % 3)
            M.sphere(0.24 + 0.06 * (i % 3),
                     (math.cos(a) * r, math.sin(a) * r * 0.7, 0.2), mat=M.m('stone' if i % 2 else 'stone_dark'),
                     seg=10, ring=6, scale=(1, 0.9, 0.7))
        M.box((w * 0.9, d * 0.86, 0.02), (0, 0, 0.17), mat=M.m('snow'), bevel=0.01)
    elif v == 'bamboo_fence':
        n = int(w / 0.14)
        for i in range(n):
            x = -w / 2 + w * (i + 0.5) / n
            M.cyl(0.055, h * (0.9 + 0.08 * (i % 3)), (x, 0, h * 0.5), mat=M.m('leaf_light' if i % 2 else 'roof_straw'), seg=8)
        for z in (h * 0.3, h * 0.7):
            M.cyl(0.04, w, (0, 0.05, z), rot=(0, 90, 0), mat=M.m('wood_dark'), seg=6)
    elif v == 'eave_awning':
        M.box((w, d * 0.5, 0.08), (0, 0, 0), rot=(12, 0, 0), mat=M.m('roof_teal'), bevel=0.02)
        M.box((w, 0.24, 0.1), (0, -d * 0.5 + 0.1, 0), rot=(12, 0, 0), mat=M.m('roof_slate'), bevel=0.02)
        for sx in (-1, 1):
            M.box((0.06, 0.06, 0.3), (sx * w * 0.45, -d * 0.3, -0.2), rot=(30, 0, 0), mat=M.m('wood_dark'), bevel=0.008)
        for i in range(int(w / 0.6)):
            M.box((w / int(w / 0.6) * 0.9, 0.02, 0.02), (-w / 2 + w * (i + 0.5) / int(w / 0.6), 0, 0.06),
                  rot=(12, 0, 0), mat=M.m('wood_dark'), bevel=0.0)
    elif v == 'chimney':
        M.box((w, d, h * 0.9), (0, 0, h * 0.45), mat=M.m('brick'), bevel=0.02)
        for i in range(4):
            M.box((w + 0.04, d + 0.04, 0.07), (0, 0, h * (0.1 + i * 0.22)), mat=M.m('stone_dark'), bevel=0.01)
        M.box((w + 0.16, d + 0.16, 0.12), (0, 0, h * 0.9), mat=M.m('stone_warm'), bevel=0.02)
        M.cyl(0.1, 0.16, (0, 0, h * 0.98), r2=0.13, mat=M.m('ink'), seg=10)
    elif v == 'skylight':
        M.box((w + 0.16, d + 0.16, 0.1), (0, 0, 0.05), mat=M.m('wood_dark'), bevel=0.02)
        M.box((w, d, 0.08), (0, 0, 0.12), mat=M.m('glass_warm', rough=0.2), bevel=0.02)
        M.roof_gable(w + 0.1, d + 0.1, h * 0.5, 0.16, 'glass', overhang=0.04, tiles=False, ridge=False)
        for i in range(3):
            M.box((0.04, d + 0.2, 0.04), (-w / 2 + w * (i + 0.5) / 3, 0, 0.2), mat=M.m('wood_dark'), bevel=0.0)
    elif v == 'boardwalk':
        n = int(w / 0.34)
        for i in range(n):
            M.box((w / n * 0.9, d, 0.06), (-w / 2 + w * (i + 0.5) / n, 0, h - 0.03), mat=M.m('wood_light'), bevel=0.008)
        for sx in (-1, 1):
            M.box((0.1, 0.1, h), (sx * w * 0.45, d * 0.4, h / 2), mat=M.m('wood_dark'), bevel=0.01)
            M.box((0.1, 0.1, h), (sx * w * 0.45, -d * 0.4, h / 2), mat=M.m('wood_dark'), bevel=0.01)
        for i in range(4):
            M.box((0.08, 0.08, h * 0.8), (-w * 0.3 + i * w * 0.2, 0, h * 0.4), mat=M.m('wood_mid'), bevel=0.008)
    elif v == 'waterjar':
        M.cyl(0.3, 0.8, (0, 0, 0.4), r2=0.42, mat=M.m('stone'), seg=18, bevel=0.02)
        M.cyl(0.4, 0.06, (0, 0, 0.8), mat=M.m('stone_dark'), seg=18)
        M.cyl(0.34, 0.02, (0, 0, 0.79), mat=M.m('water'), seg=18)
        M.cyl(0.1, 0.5, (0.32, 0, 0.9), rot=(10, 0, 0), mat=M.m('wood_light'), seg=8)
        M.bush((-0.35, 0.2, 0), 0.18, 'leaf', count=2)
    elif v == 'pottery_jar':
        M.cyl(0.18, 0.3, (0, 0, 0.15), r2=0.24, mat=M.m('terracotta'), seg=16, bevel=0.01)
        M.cyl(0.24, 0.24, (0, 0, 0.42), r2=0.14, mat=M.m('terracotta'), seg=16, bevel=0.01)
        M.cyl(0.13, 0.06, (0, 0, 0.57), mat=M.m('stone_dark'), seg=16)
        for i in range(3):
            a = TAU * i / 3
            M.box((0.03, 0.03, 0.22), (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.34),
                  mat=M.m('wood_dark'), bevel=0.0)


BUILDERS = {
    'landmark': landmark,
    'building': building,
    'shop': shop,
    'prop': prop,
    'vehicle': vehicle,
    'farm': farm,
    'furniture': furniture,
    'misc': misc,
}