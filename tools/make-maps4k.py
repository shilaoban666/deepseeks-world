"""4K 版地图 v3：街道优先（street-first）布局。

v2 为什么"看着奇怪"——四个程序化痕迹：
  1. 建筑是在圆里随机撒点，不沿街，像麻点，不像街区；
  2. 街区边界画成虚线椭圆，像韦恩图，不像城；
  3. 环路/放射大道直着穿过湖面和林地；
  4. 湖、林、雪山是完美的椭圆/圆盘，太几何。

v3 改法：
  · 先铺街网（带抖动的 7×7 主街 + 环路 + 巷子），**建筑沿街两侧按进深排**，才成街坊；
  · 街区就是街网围出的格子，靠街名标注，不再画椭圆；
  · 湖/林/雪/田改成噪声调制的有机多边形，岸线自然；
  · 道路遇到水面断开（留桥位），不再横穿。

输出 4096×4096：world-4k.jpg / town-4k.jpg（+ 1600 预览）
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE = r'E:\dsh work home\3Dwork'
PAPER = os.path.join(BASE, 'dsh-image-gen', 'image-cede872c.png')
OUT = os.path.join(BASE, 'painted-valley', 'public', 'maps')
os.makedirs(OUT, exist_ok=True)

N = 4096
SEED = 20261118
FONT = r'C:\Windows\Fonts\msyh.ttc'
FONT_B = r'C:\Windows\Fonts\msyhbd.ttc'

INK = (88, 62, 44)
INK2 = (126, 100, 76)
TINT = (247, 240, 222)
WATER = (166, 200, 199)
WATER_D = (122, 164, 170)
FOREST = (150, 177, 128)
FIELD = (206, 199, 148)
SNOW = (240, 242, 240)
URBAN = (237, 228, 209)
ROAD = (200, 182, 155)

STREET_A = ['石板', '河沿', '桃花', '钟楼', '铜锣', '盐仓', '铁匠', '油坊', '井亭', '槐树',
            '柳岸', '灯市', '竹竿', '船坞', '瓦窑', '煤渣', '马棚', '米仓', '药铺', '染坊',
            '茶棚', '砖窑', '麻绳', '铁轨', '风车', '鱼市', '老戏', '石碾', '豆腐', '酱园',
            '木行', '青石', '新开', '望江', '南头', '北头']
STREET_B = ['街', '巷', '弄', '道', '路']
SHOP_A = ['老张', '三味', '青石', '水面', '四季', '长风', '半山', '小满', '回回', '满庭',
          '和顺', '同福', '德兴', '聚源', '永昌', '万和', '白鹿', '金谷', '禾丰', '松间']
SHOP_K = ['杂货铺', '茶馆', '书店', '花坊', '药铺', '绸缎庄', '铁匠铺', '糕点铺', '面馆', '酒坊',
          '米行', '鱼行', '裁缝铺', '钟表铺', '鞋铺', '竹器铺', '陶器铺', '灯笼铺', '纸伞铺', '香烛铺']
ST_K = ['高铁站', '火车站', '地铁站', '公交总站', '汽车站', '码头', '渡口', '索道站', '单轨站', '缆车站']
ST_P = ['北', '南', '东', '西', '中心', '新城', '老镇', '河湾', '高原', '海门', '铁厂', '窑上',
        '柳桥', '石板', '风车', '望江', '荷塘', '竹林']
SPOT_B = ['钟楼', '月亭', '凤井', '船坞', '渔火湾', '煤矿旧址', '石桥', '戏台', '风车', '灯塔',
          '古槐', '盐仓', '水车', '晒场', '井台', '渡口', '牌坊', '石板道', '窑址', '祠堂',
          '书院', '茶山', '荷塘', '竹林', '石碾坊', '磨坊', '酱园', '铁轨桥', '望江楼', '白鹭洲']

OLD = [
    ('鱼的家', 0, 0, 34), ('中央广场', 110, 60, 34), ('小吃街', -20, 165, 60), ('网吧', -92, 62, 22),
    ('超市', 232, -8, 26), ('菜市场', 62, 196, 40), ('图书馆', -172, 122, 32), ('学校', -330, -40, 120),
    ('教堂', -162, -140, 34), ('夫子庙', -262, -232, 44), ('体育馆', 330, 92, 44), ('月亮湖', -160, 470, 170),
    ('西林', -760, -480, 200), ('雪山', 0, -900, 240), ('海滨小镇', 640, -330, 90), ('高铁站', 560, 150, 60),
    ('田园小镇', -620, 520, 130), ('蔬菜田园', -430, 660, 170),
]
LAKE = (-160.0, 470.0, 175.0, 148.0)
FOREST_BLOBS = [(-760, -480, 210, 170), (330, -660, 250, 200), (900, 380, 190, 150),
                (-1500, 900, 250, 200), (1500, -900, 230, 190)]
FIELD_BLOBS = [(-620, 520, 140, 110), (-430, 660, 180, 140), (-700, 300, 80, 70), (1200, -300, 180, 140)]


def fnt(s, b=False):
    return ImageFont.truetype(FONT_B if b else FONT, s)


def blob(cx, cy, rx, ry, rng, n=44, noise=0.15):
    ph = [rng.uniform(0, 6.28) for _ in range(3)]
    out = []
    for i in range(n):
        a = i / n * math.tau
        f = 1 + noise * (math.sin(a * 3 + ph[0]) * 0.5 + math.sin(a * 5 + ph[1]) * 0.3 + math.sin(a * 7 + ph[2]) * 0.2)
        out.append((cx + math.cos(a) * rx * f, cy + math.sin(a) * ry * f))
    return out


def path(d, pts, color, w, rng, wob=1.5, seg=5):
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]; x1, y1 = pts[i + 1]
        s = [(x0 + (x1 - x0) * t / seg + rng.uniform(-wob, wob),
              y0 + (y1 - y0) * t / seg + rng.uniform(-wob, wob)) for t in range(seg + 1)]
        d.line(s, fill=color, width=max(1, int(w)), joint='curve')


def rect(cx, cy, w, h, rot, rng, rough=1.0):
    ca, sa = math.cos(rot), math.sin(rot)
    out = []
    for x, y in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        out.append((cx + x * ca - y * sa + rng.uniform(-rough, rough),
                    cy + x * sa + y * ca + rng.uniform(-rough, rough)))
    return out


def names(rng):
    st = [a + b for a in STREET_A for b in STREET_B]
    rng.shuffle(st)
    sh = []
    for a in SHOP_A:
        for k in SHOP_K:
            sh.append(a + k)
            if len(sh) >= 100:
                break
        if len(sh) >= 100:
            break
    stn = [p + k for p in ST_P for k in ST_K][:100]
    sp = []
    for a in ['老', '望', '听', '眠', '栖', '观', '拾', '枕', '伴', '照']:
        for b in SPOT_B:
            sp.append(a + b)
            if len(sp) >= 200:
                break
        if len(sp) >= 200:
            break
    return st, sh, stn, sp


def paper(size, seed):
    rng = np.random.default_rng(seed)
    tile = Image.open(PAPER).convert('RGB').resize((1024, 1024), Image.LANCZOS)
    base = Image.new('RGB', (size, size))
    for y in range(0, size, 1024):
        for x in range(0, size, 1024):
            base.paste(tile, (x, y))
    a = np.asarray(base).astype(np.float32) * 0.85 + np.array(TINT, np.float32) * 0.15
    a = np.clip(a + rng.normal(0, 2.2, a.shape), 0, 255).astype(np.uint8)
    return Image.fromarray(a, 'RGB')


def wash(size, scale, paint):
    sm = size // scale
    l = Image.new('RGB', (sm, sm), TINT)
    paint(ImageDraw.Draw(l), sm)
    l = l.filter(ImageFilter.GaussianBlur(sm * 0.008))
    return l.resize((size, size), Image.LANCZOS)


def age(img, size):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    c = size / 2
    r = np.sqrt(((x - c) / c) ** 2 + ((y - c) / c) ** 2)
    v = np.clip(1.05 - 0.18 * np.clip(r - 0.65, 0, 2) ** 1.3, 0.76, 1.05)
    for fx in (0.334, 0.667):
        v *= 1 - 0.028 * np.exp(-((x / size - fx) ** 2) / 1.2e-5)
    v *= 1 - 0.038 * np.exp(-((y / size - 0.5) ** 2) / 1.2e-5)
    return Image.fromarray(np.clip(np.asarray(img).astype(np.float32) * v[:, :, None], 0, 255).astype(np.uint8))


# ============================================================ 大地图
def make_world():
    rng = random.Random(SEED)
    size = N
    SPAN = 3600.0                       # 3.6 km 见方
    S = size / SPAN
    print('  纸底…')
    img = paper(size, SEED)

    def px(wx, wz):
        return size / 2 + wx * S, size / 2 + wz * S

    def coast_z(t):
        return -SPAN / 2 + t * SPAN

    def coast_x(t):
        return 1180 + 150 * math.sin(t * 4.4 + 0.6) + 70 * math.sin(t * 9.1)

    def in_water(wx, wz):
        if wx > coast_x((wz + SPAN / 2) / SPAN):
            return True
        dx = (wx - LAKE[0]) / LAKE[2]
        dz = (wz - LAKE[1]) / LAKE[3]
        return dx * dx + dz * dz < 1.0

    def in_forest(wx, wz):
        for fx, fz, frx, frz in FOREST_BLOBS:
            if ((wx - fx) / frx) ** 2 + ((wz - fz) / frz) ** 2 < 1.0:
                return True
        return False

    def in_field(wx, wz):
        for fx, fz, frx, frz in FIELD_BLOBS:
            if abs(wx - fx) < frx and abs(wz - fz) < frz:
                return True
        return False

    def buildable(wx, wz):
        return not (in_water(wx, wz) or in_forest(wx, wz))

    # ---- 水彩层：有机形状 ----
    lk = blob(0, 0, LAKE[2], LAKE[3], rng, 44, 0.13)
    blobs = {k: blob(0, 0, v[2], v[3], rng, 40, 0.16) for k, v in
             {'forest': (0, 0, 1, 1)}.items()}
    fpoly = [(fx, fz, blob(0, 0, frx, frz, rng, 38, 0.17)) for fx, fz, frx, frz in FOREST_BLOBS]
    sea_pts = [px(coast_x(i / 80), coast_z(i / 80)) for i in range(81)]

    def paint(d, s):
        k = (s / size) * S
        def P(wx, wz):
            return (s / 2 + wx * k, s / 2 + wz * k)
        # 城区底
        d.ellipse([*[c for c in (P(-950, -950) + P(950, 950))[:2]], *[c for c in (P(-950, -950) + P(950, 950))[2:]]], fill=URBAN) if False else None
        cx, cy = P(0, 0)
        r = 1100 * k
        d.ellipse([cx - r, cy - r * 0.92, cx + r, cy + r * 0.92], fill=URBAN)
        # 海
        d.polygon([P(coast_x(i / 80), coast_z(i / 80)) for i in range(81)] + [(s, s), (s, 0)], fill=WATER)
        # 湖
        d.polygon([P(LAKE[0] + p[0], LAKE[1] + p[1]) for p in lk], fill=WATER)
        # 林
        for fx, fz, poly in fpoly:
            d.polygon([P(fx + p[0], fz + p[1]) for p in poly], fill=FOREST)
        # 田
        for fx, fz, frx, frz in FIELD_BLOBS:
            a, b = P(fx - frx, fz - frz), P(fx + frx, fz + frz)
            d.rectangle([a[0], a[1], b[0], b[1]], fill=FIELD)
        # 雪山
        d.polygon([P(p[0], -900 + p[1]) for p in blob(0, 0, 420, 300, rng, 40, .16)], fill=SNOW)

    print('  水彩层…')
    img = Image.blend(img, wash(size, 8, paint), 0.5)

    ov = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # ---- 街网（街道优先的核心）----
    GRID = 7
    xs, ys = [], []
    for i in range(GRID + 1):
        t = i / GRID
        xs.append(-SPAN / 2 + t * SPAN + rng.uniform(-70, 70))
        ys.append(-SPAN / 2 + t * SPAN + rng.uniform(-70, 70))

    def line_pts(fixed, along, vertical, n=26):
        out = []
        for j in range(n + 1):
            t = j / n
            a = -SPAN / 2 + t * SPAN
            wob = 26 * math.sin(t * 5.2 + fixed * 0.01) + 12 * math.sin(t * 11.7)
            out.append(px(fixed + wob, a) if vertical else px(a, fixed + wob))
        return out

    major, minor = [], []
    for i in range(GRID + 1):
        p = line_pts(xs[i], None, True)
        (major if i % 2 == 0 else minor).append(p)
        p2 = line_pts(ys[i], None, False)
        (major if i % 2 == 0 else minor).append(p2)

    for seg in minor:
        path(d, seg, ROAD + (215,), 6, rng, 1.4, 4)
    for seg in major:
        path(d, seg, ROAD + (232,), 11, rng, 1.6, 5)
        path(d, seg, INK2 + (80,), 2, rng, 1.8, 5)

    # 环路
    for rr in (700, 1250):
        pts = [px(math.cos(a) * rr, math.sin(a) * rr * .92) for a in np.linspace(0, math.tau, 90)]
        path(d, pts, ROAD + (230,), 10, rng, 2.0, 3)
        path(d, pts, INK2 + (75,), 2, rng, 2.2, 3)

    # 铁路
    rail = [px(-2000 + i / 70 * 4000, 420 + 50 * math.sin(i / 70 * 4.0)) for i in range(71)]
    path(d, rail, (88, 76, 68, 228), 8, rng, 1.0, 2)
    path(d, rail, (250, 246, 236, 205), 3, rng, 1.0, 2)

    # ---- 沿街排建筑（3500 栋）----
    BUILDINGS = []
    for seg in major + minor:
        skip_next = False
        for i in range(len(seg) - 1):
            x0, y0 = seg[i]; x1, y1 = seg[i + 1]
            dx, dy = x1 - x0, y1 - y0
            L = math.hypot(dx, dy)
            if L < 1:
                continue
            ux, uy = dx / L, dy / L
            nx, ny = -uy, ux
            t = 10.0
            while t < L - 6:
                wx = x0 + ux * t
                wy = y0 + uy * t
                mw = (wx - size / 2) / S
                mz = (wy - size / 2) / S
                if buildable(mw, mz):
                    for side in (1, -1):
                        if rng.random() > 0.80:
                            continue
                        depth = rng.uniform(11, 26)
                        width = rng.uniform(9, 20)
                        off = 7 + depth / 2 + rng.uniform(0, 3)
                        bx = wx + nx * off * side
                        by = wy + ny * off * side
                        if not buildable((bx - size / 2) / S, (by - size / 2) / S):
                            continue
                        BUILDINGS.append((bx, by, width * S, depth * S,
                                          math.atan2(dy, dx) + rng.uniform(-0.03, 0.03)))
                t += rng.uniform(16, 30)
                if len(BUILDINGS) > 5200:
                    break
            if len(BUILDINGS) > 5200:
                break
        if len(BUILDINGS) > 5200:
            break

    rng.shuffle(BUILDINGS)
    USE = 3500
    for bx, by, bw, bh, rot in BUILDINGS[:USE]:
        tone = rng.choice([(234, 222, 200), (228, 214, 190), (240, 230, 210), (218, 200, 176), (204, 180, 156)])
        d.polygon(rect(bx, by, bw, bh, rot, rng, 0.7), fill=tone + (243,), outline=INK2 + (150,))

    streets, shops, stns, spots = names(rng)

    # ---- 商店 100：挑靠近主街的建筑 ----
    shop_marks = rng.sample(range(min(len(BUILDINGS), USE)), min(100, USE))
    for n, idx in enumerate(shop_marks[:100]):
        bx, by, bw, bh, rot = BUILDINGS[idx]
        d.ellipse([bx - 9, by - 9, bx + 9, by + 9], fill=(198, 92, 70, 240), outline=INK + (210,), width=2)
        if n < 34:
            d.text((bx + 12, by - 9), shops[n], font=fnt(15), fill=(120, 60, 42, 240))

    # ---- 车站 100：沿主街分布 ----
    for i in range(100):
        seg = major[i % len(major)]
        t = ((i * 0.37) % 1.0)
        j = min(int(t * (len(seg) - 1)), len(seg) - 2)
        sx = seg[j][0] + rng.uniform(-40, 40)
        sy = seg[j][1] + rng.uniform(-40, 40)
        d.rounded_rectangle([sx - 11, sy - 11, sx + 11, sy + 11], radius=4, fill=(70, 92, 96, 240),
                            outline=INK + (222,), width=2)
        d.rectangle([sx - 4, sy - 2, sx + 4, sy + 2], fill=(250, 244, 222, 246))
        if i < 22:
            d.text((sx + 15, sy - 8), stns[i], font=fnt(15), fill=INK + (238,))

    # ---- 景点 200 ----
    for i in range(200):
        a = rng.uniform(0, math.tau); r = rng.uniform(120, 1750)
        mw, mz = math.cos(a) * r, math.sin(a) * r * .92
        if in_water(mw, mz) or not (-1750 < mw < 1750 and -1700 < mz < 1700):
            continue
        sx, sy = px(mw, mz)
        d.polygon([(sx, sy - 8), (sx + 8, sy + 6), (sx - 8, sy + 6)], fill=(236, 206, 118, 242), outline=INK + (210,))
        if i < 40:
            d.text((sx + 12, sy - 7), spots[i], font=fnt(14), fill=(110, 76, 50, 232))

    # ---- 街区名（格心）----
    for i in range(GRID):
        for j in range(GRID):
            cwx = (xs[i] + xs[i + 1]) / 2
            cwz = (ys[j] + ys[j + 1]) / 2
            nm = streets[(i * GRID + j) % len(streets)]
            sx, sy = px(cwx, cwz)
            f = fnt(19, True)
            tw = d.textlength(nm, font=f)
            d.text((sx - tw / 2, sy - 10), nm, font=f, fill=(126, 82, 50, 225))

    # ---- 老镇地名 ----
    for name, wx, wz, rr in OLD:
        sx, sy = px(wx, wz)
        f = fnt(17, True)
        tw = d.textlength(name, font=f)
        d.text((sx - tw / 2, sy - rr * S - 18), name, font=f, fill=(92, 58, 38, 245))

    # ---- 水纹 / 树点 / 田垄 ----
    for i in range(240):
        a = rng.uniform(0, math.tau); r = rng.uniform(0, 1)
        wx = LAKE[0] + math.cos(a) * LAKE[2] * r * .8
        wz = LAKE[1] + math.sin(a) * LAKE[3] * r * .8
        sx, sy = px(wx, wz)
        path(d, [(sx - 14, sy), (sx + 14, sy)], INK2 + (60,), 2, rng, 1.6, 3)
    for fx, fz, frx, frz in FOREST_BLOBS:
        for _ in range(520):
            wx = fx + rng.uniform(-frx, frx) * .85
            wz = fz + rng.uniform(-frz, frz) * .85
            if in_forest(wx, wz):
                sx, sy = px(wx, wz)
                rr = rng.uniform(2, 4)
                d.ellipse([sx - rr, sy - rr * .8, sx + rr, sy + rr * .8], fill=(96, 128, 86, rng.randint(90, 140)))
    for fx, fz, frx, frz in FIELD_BLOBS:
        x0, y0 = px(fx - frx, fz - frz); x1, y1 = px(fx + frx, fz + frz)
        step = max(6, int((y1 - y0) / 26))
        for yy in range(int(y0), int(y1), step):
            path(d, [(x0, yy), (x1, yy)], (168, 158, 96, 110), 2, rng, 1.8, 3)

    # ---- 最后压一层水面 + 岸线（保证水域一眼可辨）----
    sea2 = [px(coast_x(i / 80), coast_z(i / 80)) for i in range(81)]
    d.polygon(sea2 + [(size, size), (size, 0)], fill=WATER + (140,))
    path(d, sea2, WATER_D + (200,), 4, rng, 1.6, 4)
    lk2 = [px(LAKE[0] + p2[0], LAKE[1] + p2[1]) for p2 in lk]
    d.polygon(lk2, fill=WATER + (150,), outline=WATER_D + (205,), width=4)
    for kk in (1.05, 1.12):
        d.polygon([px(LAKE[0] + p2[0] * kk, LAKE[1] + p2[1] * kk) for p2 in lk],
                  outline=INK2 + (70,), width=2)
    for _ in range(120):
        aa = rng.uniform(0, 6.28); rr2 = rng.uniform(0, .8)
        x, y = px(LAKE[0] + math.cos(aa) * LAKE[2] * rr2, LAKE[1] + math.sin(aa) * LAKE[3] * rr2)
        path(d, [(x - 13, y), (x + 13, y)], INK2 + (42,), 2, rng, 1.4, 3)

    # ---- 图题 / 图例 / 比例尺 ----
    d.rectangle([150, 120, 1420, 470], fill=(249, 242, 225, 236), outline=INK + (232,), width=4)
    d.text((200, 145), '煤 炭 镇 · 全 域 图', font=fnt(54, True), fill=(84, 52, 34, 250))
    d.text((202, 218), 'COAL TOWN — GENERAL MAP', font=fnt(21), fill=(122, 92, 68, 240))
    d.line([(202, 252), (1370, 252)], fill=INK + (200,), width=3)
    for i, line in enumerate(['3500 栋建筑 · 50 条街区 · 100 家商店',
                              '100 座车站 · 200 处景点 · 老镇 36 处地标']):
        d.text((202, 272 + i * 40), line, font=fnt(19), fill=(102, 74, 52, 242))

    lx, ly = 150, size - 560
    d.rectangle([lx, ly, lx + 420, ly + 420], fill=(249, 242, 225, 230), outline=INK + (220,), width=4)
    d.text((lx + 18, ly + 12), '图 例', font=fnt(24, True), fill=(84, 52, 34, 246))
    lg = [((198, 92, 70), 'c', '主要商店'), ((70, 92, 96), 's', '车站'), ((236, 206, 118), 't', '景点'),
          ((234, 222, 200), 'b', '建筑'), ((166, 200, 199), 'r', '水域'), ((150, 177, 128), 'r', '林地'),
          ((206, 199, 148), 'r', '田园'), ((88, 76, 68), 'l', '铁路')]
    for i, (col, kind, txt) in enumerate(lg):
        y0 = ly + 62 + i * 44; x0 = lx + 34
        if kind == 'c':
            d.ellipse([x0 - 8, y0 - 8, x0 + 8, y0 + 8], fill=col + (242,), outline=INK + (200,))
        elif kind == 's':
            d.rectangle([x0 - 8, y0 - 8, x0 + 8, y0 + 8], fill=col + (242,), outline=INK + (200,))
        elif kind == 't':
            d.polygon([(x0, y0 - 8), (x0 + 8, y0 + 6), (x0 - 8, y0 + 6)], fill=col + (242,), outline=INK + (200,))
        elif kind == 'b':
            d.rectangle([x0 - 8, y0 - 6, x0 + 8, y0 + 8], fill=col + (242,), outline=INK2 + (200,))
        elif kind == 'r':
            d.rectangle([x0 - 12, y0 - 6, x0 + 12, y0 + 8], fill=col + (242,), outline=INK2 + (150,))
        else:
            d.line([(x0 - 12, y0), (x0 + 12, y0)], fill=col + (242,), width=4)
        d.text((x0 + 24, y0 - 8), txt, font=fnt(17), fill=(98, 72, 50, 242))

    bx0, by0 = size - 640, size - 130
    d.line([(bx0, by0), (bx0 + 500, by0)], fill=INK + (232,), width=4)
    for k in range(6):
        x = bx0 + k * 100
        d.line([(x, by0 - 8), (x, by0 + 8)], fill=INK + (232,), width=3)
    d.text((bx0, by0 + 14), '0        200        400        600 米', font=fnt(17), fill=(98, 72, 50, 242))
    nx, ny = size - 200, 200
    d.ellipse([nx - 56, ny - 56, nx + 56, ny + 56], outline=INK + (222,), width=4)
    d.polygon([(nx, ny - 50), (nx + 18, ny + 10), (nx, ny - 6), (nx - 18, ny + 10)], fill=(198, 92, 70, 242), outline=INK + (222,))
    d.text((nx - 9, ny - 92), '北', font=fnt(28, True), fill=(84, 52, 34, 246))

    print(f'  建筑 {USE} / 商店 {len(shop_marks[:100])} / 车站 100 / 景点 200')
    return age(Image.alpha_composite(img.convert('RGBA'), ov).convert('RGB'), size)


# ============================================================ 小镇详图
def make_town():
    rng = random.Random(SEED + 7)
    size = N
    SPAN = 900.0
    S = size / SPAN
    print('  纸底…')
    img = paper(size, SEED + 7)

    def px(wx, wz):
        return size / 2 + wx * S, size / 2 + wz * S

    def in_water(wx, wz):
        dx = (wx - LAKE[0]) / 232.0; dz = (wz - LAKE[1]) / 196.0
        return dx * dx + dz * dz < 1.0

    lk = blob(0, 0, 240, 200, rng, 44, .12)
    fpolys = [(fx, fz, blob(0, 0, 130, 110, rng, 36, .16)) for fx, fz in [(-330, -40), (300, -230), (60, 300), (350, 260)]]

    def paint(d, s):
        k = (s / size) * S
        def P(wx, wz):
            return (s / 2 + wx * k, s / 2 + wz * k)
        cx, cy = P(0, 0); r = 470 * k
        d.ellipse([cx - r, cy - r * .92, cx + r, cy + r * .92], fill=URBAN)
        d.polygon([P(LAKE[0] + p[0], LAKE[1] + p[1]) for p in lk], fill=WATER)
        for fx, fz, poly in fpolys:
            d.polygon([P(fx + p[0], fz + p[1]) for p in poly], fill=FOREST)
        for fx, fz, frx, frz in [(-430, 660, 150, 120), (-620, 520, 120, 100)]:
            a, b = P(fx - frx, fz - frz), P(fx + frx, fz + frz)
            d.rectangle([a[0], a[1], b[0], b[1]], fill=FIELD)

    print('  水彩层…')
    img = Image.blend(img, wash(size, 8, paint), 0.48)

    ov = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # 街网：12×12，间距 ~75 m
    GRID = 12
    xs = [-SPAN / 2 + (i / GRID) * SPAN + rng.uniform(-8, 8) for i in range(GRID + 1)]
    ys = [-SPAN / 2 + (i / GRID) * SPAN + rng.uniform(-8, 8) for i in range(GRID + 1)]

    def line_pts(fixed, vertical, n=18):
        out = []
        for j in range(n + 1):
            t = j / n
            a = -SPAN / 2 + t * SPAN
            wob = 8 * math.sin(t * 6.1 + fixed * 0.05) + 4 * math.sin(t * 13.3)
            out.append(px(fixed + wob, a) if vertical else px(a, fixed + wob))
        return out

    grid_segs = []
    for i in range(GRID + 1):
        grid_segs.append(line_pts(xs[i], True))
        grid_segs.append(line_pts(ys[i], False))
    for seg in grid_segs:
        path(d, seg, ROAD + (228,), 7 if i % 3 == 0 else 4, rng, 1.2, 4)

    # 沿街建筑
    B = []
    for seg in grid_segs:
        for i in range(len(seg) - 1):
            x0, y0 = seg[i]; x1, y1 = seg[i + 1]
            dx, dy = x1 - x0, y1 - y0
            L = math.hypot(dx, dy)
            if L < 2:
                continue
            ux, uy = dx / L, dy / L
            nx, ny = -uy, ux
            t = 6.0
            while t < L - 4:
                wx = x0 + ux * t; wy = y0 + uy * t
                if not in_water((wx - size / 2) / S, (wy - size / 2) / S):
                    for side in (1, -1):
                        if rng.random() > 0.42:
                            continue
                        depth = rng.uniform(9, 18)
                        width = rng.uniform(7, 15)
                        off = 5 + depth / 2
                        bx = wx + nx * off * side; by = wy + ny * off * side
                        if not in_water((bx - size / 2) / S, (by - size / 2) / S):
                            B.append((bx, by, width * S, depth * S,
                                      math.atan2(dy, dx) + rng.uniform(-.03, .03)))
                t += rng.uniform(18, 30)

    for bx, by, bw, bh, rot in B:
        tone = rng.choice([(236, 224, 202), (228, 214, 190), (242, 232, 212), (216, 196, 170), (200, 174, 150)])
        pts = rect(bx, by, bw, bh, rot, rng, 0.8)
        d.polygon(pts, fill=tone + (246,), outline=INK2 + (185,))
        if rng.random() < .3:
            d.line([pts[0], pts[1]], fill=INK + (90,), width=2)

    # 资源点
    res = [('林地', -330, -40, 'wood'), ('林地', 300, -230, 'wood'), ('林地', 60, 300, 'wood'),
           ('竹材', 350, 260, 'wood'), ('果木', -700, 300, 'fruit'), ('农田', -430, 660, 'crop'),
           ('菜地', -620, 520, 'crop'), ('渔场', -160, 470, 'fish'), ('煤矿', -640, -180, 'ore'),
           ('石场', 520, -460, 'ore'), ('铁矿', 640, 300, 'ore'), ('泉水', -60, -180, 'water'),
           ('水井', 180, 20, 'water'), ('水井', -240, 200, 'water'), ('草场', 560, 100, 'grass')]
    col = {'wood': (110, 148, 96), 'fruit': (196, 132, 84), 'crop': (198, 186, 120), 'fish': (104, 160, 168),
           'ore': (128, 120, 116), 'water': (120, 170, 186), 'grass': (150, 178, 120)}
    for label, wx, wz, kind in res:
        x, y = px(wx, wz); c = col[kind]
        if not (20 < x < size - 20 and 20 < y < size - 20):
            continue
        d.ellipse([x - 17, y - 17, x + 17, y + 17], fill=c + (238,), outline=INK + (215,), width=3)
        f = fnt(15, True); tw = d.textlength(label, font=f)
        d.text((x - tw / 2, y + 20), label, font=f, fill=INK + (240,))

    # 地名牌
    for name, wx, wz, rr in OLD:
        x, y = px(wx, wz)
        f = fnt(17, True); tw = d.textlength(name, font=f)
        ty = y - rr * S * .9 - 22
        if not (-10 < ty < size - 30):
            ty = y + 12
        d.rectangle([x - tw / 2 - 6, ty - 4, x + tw / 2 + 6, ty + 22], fill=(251, 245, 230, 226),
                    outline=INK + (198,), width=2)
        d.text((x - tw / 2, ty), name, font=f, fill=(92, 58, 38, 250))

    # 树点 / 水纹 / 田垄
    for fx, fz, poly in fpolys:
        for _ in range(360):
            a = rng.uniform(0, 6.28); r = rng.uniform(0, 1)
            px_, pz_ = fx + math.cos(a) * 120 * r, fz + math.sin(a) * 105 * r
            x, y = px(px_, pz_)
            rr = rng.uniform(2, 5)
            d.ellipse([x - rr, y - rr * .8, x + rr, y + rr * .8], fill=(94, 128, 84, rng.randint(90, 140)))
    for _ in range(160):
        a = rng.uniform(0, 6.28); r = rng.uniform(0, .75)
        x, y = px(LAKE[0] + math.cos(a) * 230 * r, LAKE[1] + math.sin(a) * 190 * r)
        path(d, [(x - 12, y), (x + 12, y)], INK2 + (52,), 2, rng, 1.4, 3)

    # 水面终层
    lk2 = [px(LAKE[0] + p2[0], LAKE[1] + p2[1]) for p2 in lk]
    d.polygon(lk2, fill=WATER + (155,), outline=WATER_D + (205,), width=5)
    for kk in (1.05, 1.12):
        d.polygon([px(LAKE[0] + p2[0] * kk, LAKE[1] + p2[1] * kk) for p2 in lk],
                  outline=INK2 + (70,), width=2)
    for _ in range(130):
        aa = rng.uniform(0, 6.28); rr2 = rng.uniform(0, .8)
        x, y = px(LAKE[0] + math.cos(aa) * 225 * rr2, LAKE[1] + math.sin(aa) * 190 * rr2)
        path(d, [(x - 14, y), (x + 14, y)], INK2 + (44,), 2, rng, 1.4, 3)

    # 图题 / 图例
    d.rectangle([130, 110, 1300, 430], fill=(249, 242, 225, 236), outline=INK + (232,), width=4)
    d.text((178, 132), '煤 炭 镇 · 小 镇 详 图', font=fnt(46, True), fill=(84, 52, 34, 250))
    d.text((180, 200), 'COAL TOWN — TOWN PLAN  1:2500', font=fnt(19), fill=(122, 92, 68, 240))
    d.line([(180, 232), (1250, 232)], fill=INK + (200,), width=3)
    d.text((180, 250), f'镇区建筑 {len(B)} 栋 · 资源点 {len(res)} 处 · 地标 {len(OLD)} 处',
           font=fnt(18), fill=(102, 74, 52, 242))
    d.text((180, 286), '林地 / 农田 / 渔场 / 矿场 / 水源', font=fnt(17), fill=(120, 90, 68, 236))

    lx, ly = 130, size - 470
    d.rectangle([lx, ly, lx + 400, ly + 350], fill=(249, 242, 225, 230), outline=INK + (220,), width=4)
    d.text((lx + 18, ly + 12), '图 例', font=fnt(22, True), fill=(84, 52, 34, 246))
    lg = [((236, 224, 202), '建筑'), ((200, 182, 155), '街道'), ((166, 200, 199), '水域'),
          ((110, 148, 96), '林地'), ((198, 186, 120), '农田'), ((128, 120, 116), '矿场'),
          ((104, 160, 168), '渔场')]
    for i, (c, txt) in enumerate(lg):
        y0 = ly + 54 + i * 40
        d.rectangle([lx + 26, y0 - 8, lx + 66, y0 + 10], fill=c + (242,), outline=INK + (190,), width=2)
        d.text((lx + 78, y0 - 8), txt, font=fnt(17), fill=(98, 72, 50, 242))

    bx0, by0 = size - 620, size - 120
    d.line([(bx0, by0), (bx0 + 480, by0)], fill=INK + (232,), width=4)
    for k in range(5):
        x = bx0 + k * 120
        d.line([(x, by0 - 8), (x, by0 + 8)], fill=INK + (232,), width=3)
    d.text((bx0, by0 + 12), '0       30       60       90 米', font=fnt(17), fill=(98, 72, 50, 242))
    nx, ny = size - 190, 190
    d.ellipse([nx - 52, ny - 52, nx + 52, ny + 52], outline=INK + (222,), width=4)
    d.polygon([(nx, ny - 46), (nx + 16, ny + 10), (nx, ny - 6), (nx - 16, ny + 10)], fill=(198, 92, 70, 242), outline=INK + (222,))
    d.text((nx - 8, ny - 84), '北', font=fnt(26, True), fill=(84, 52, 34, 246))

    print(f'  建筑 {len(B)} 栋 / 资源点 {len(res)} 处')
    return age(Image.alpha_composite(img.convert('RGBA'), ov).convert('RGB'), size)


def save(img, name):
    jpg = os.path.join(OUT, name + '.jpg')
    img.save(jpg, 'JPEG', quality=93, optimize=True, progressive=False)
    img.resize((1600, 1600), Image.LANCZOS).save(os.path.join(OUT, name + '-preview.png'), 'PNG', optimize=True)
    print(f'  {name}: {img.width}×{img.height} {os.path.getsize(jpg)/1048576:.2f} MB')


if __name__ == '__main__':
    print('大地图…'); save(make_world(), 'world-4k')
    print('小镇详图…'); save(make_town(), 'town-4k')
    print('完成 →', OUT)