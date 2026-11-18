"""生成两张 8192×8192 的吉卜力／煤炭镇小白风格地图（v2：内容铺满画布）。

  public/maps/world-8k.jpg   全域大地图：老镇（plan.js 真实地理）+ 新城
                             3500 栋建筑 / 50 街区 / 100 商店 / 100 车站 / 200 景点
  public/maps/town-8k.jpg    小镇详图：镇区详图 + 资源点，铺满画幅

v1 的问题：坐标尺度太保守，细节挤在中心、四角是空白纸。
v2：城市分布扩到半径 3.6 km，外围补村镇/林地/田园，全画幅都有内容；
    水面加水纹、林地加树点画、农田加垄线。
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE = r'E:\dsh work home\3Dwork'
PAPER = os.path.join(BASE, 'dsh-image-gen', 'image-cede872c.png')
FOLIAGE = os.path.join(BASE, 'dsh-image-gen', 'image-1b58df51.png')
OUT = os.path.join(BASE, 'painted-valley', 'public', 'maps')
os.makedirs(OUT, exist_ok=True)

N = 8192
SEED = 20261118
FONT = r'C:\Windows\Fonts\msyh.ttc'
FONT_B = r'C:\Windows\Fonts\msyhbd.ttc'

INK = (92, 66, 48)
INK2 = (124, 98, 76)
TINT = (246, 238, 220)
WATER = (170, 202, 200)
WATER_D = (128, 168, 172)
FOREST = (152, 178, 130)
FIELD = (208, 202, 152)
SNOW = (240, 242, 240)
URBAN = (236, 226, 206)
ROAD = (198, 180, 152)

STREET_A = ['石板', '河沿', '桃花', '钟楼', '铜锣', '盐仓', '铁匠', '油坊', '井亭', '槐树',
            '柳岸', '灯市', '竹竿', '船坞', '瓦窑', '煤渣', '马棚', '米仓', '药铺', '染坊',
            '茶棚', '砖窑', '麻绳', '铁轨', '风车', '鱼市', '老戏', '石碾', '豆腐', '酱园']
STREET_B = ['街', '巷', '弄', '道', '路']
STREET_X = ['新街', '老街', '南街', '北街', '东街', '西街', '上街', '下街', '横街', '斜街',
            '前街', '后街', '中街', '大巷', '小巷', '长巷', '窄巷', '石板巷', '河沿巷', '煤港街']
SHOP_A = ['老张', '三味', '青石', '水面', '四季', '长风', '半山', '小满', '回回', '满庭',
          '和顺', '同福', '德兴', '聚源', '永昌', '万和', '白鹿', '金谷', '禾丰', '松间']
SHOP_K = ['杂货铺', '茶馆', '书店', '花坊', '药铺', '绸缎庄', '铁匠铺', '糕点铺', '面馆', '酒坊',
          '米行', '鱼行', '裁缝铺', '钟表铺', '鞋铺', '竹器铺', '陶器铺', '灯笼铺', '纸伞铺', '香烛铺',
          '照相馆', '文具店', '糖果铺', '五金行', '木匠铺', '豆腐坊', '当铺', '染坊', '帐房', '油坊']
ST_K = ['高铁站', '火车站', '地铁站', '公交总站', '汽车站', '码头', '渡口', '索道站',
        '单轨站', '缆车站', '轻轨站', '摆渡站']
ST_P = ['北', '南', '东', '西', '中心', '新城', '老镇', '河湾', '高原', '海门', '铁厂', '窑上',
        '柳桥', '石板', '风车', '望江', '荷塘', '竹林', '青龙', '白虎', '灯市', '盐仓', '矿口',
        '果园', '田园', '雪岭', '灯塔', '沙滩', '铜锣', '槐树']
SPOT_A = ['老', '望', '听', '眠', '栖', '观', '拾', '枕', '伴', '照', '问', '坐', '看', '藏', '迎']
SPOT_B = ['钟楼', '月亭', '凤井', '船坞', '渔火湾', '煤矿旧址', '石桥', '戏台', '风车', '灯塔',
          '古槐', '盐仓', '水车', '晒场', '井台', '渡口', '牌坊', '石板道', '窑址', '祠堂',
          '书院', '茶山', '荷塘', '竹林', '石碾坊', '磨坊', '酱园', '铁轨桥', '望江楼', '白鹭洲',
          '芦苇荡', '老码头', '鹰嘴崖', '瀑布', '温泉', '梯田', '古井', '木桥', '石阶', '土楼']

WATERISH = {'月亮湖', '西林', '高山森林', '雪山', '蔬菜田园', '沙滩', '西林 '}

OLD = [
    ('鱼的家', 0, 0, 34), ('中央广场', 110, 60, 34), ('小吃街', -20, 165, 60), ('网吧', -92, 62, 22),
    ('超市', 232, -8, 26), ('菜市场', 62, 196, 40), ('花鸟市场', -10, 252, 40), ('图书馆', -172, 122, 32),
    ('学校', -330, -40, 120), ('教堂', -162, -140, 34), ('夫子庙', -262, -232, 44), ('电玩厅', 12, -100, 24),
    ('体育馆', 330, 92, 44), ('冒险者协会', 152, -162, 30), ('居民区·东', 226, 226, 70),
    ('居民区·西', -300, 258, 66), ('居民区·北', 60, -300, 62), ('清镇市', 110, -336, 40),
    ('河鲜集市', 178, -98, 30), ('田园小镇', -620, 520, 130), ('果园', -700, 300, 60),
    ('蔬菜田园', -430, 660, 170), ('雪山小镇', -620, -250, 80), ('海滨小镇', 640, -330, 90),
    ('灯塔', 742, -372, 26), ('高铁站', 560, 150, 60), ('高铁新城', 340, 560, 90),
    ('沙滩', 760, 60, 120), ('西林', -760, -480, 200), ('高山森林', 330, -660, 250),
    ('月亮湖', -160, 470, 170), ('雪山', 0, -900, 240),
]
OLD_ST = [('AI 小镇站', 150, 70), ('高铁站', 520, 146), ('海滨小镇站', 634, -300)]


LAKE_C = (-160.0, 470.0)
LAKE_R = (252.0, 222.0)


def avoid_water(wx, wz):
    """把落在月亮湖里的点推到湖外（按椭圆比例外推）。"""
    for _ in range(8):
        dx = (wx - LAKE_C[0]) / LAKE_R[0]
        dz = (wz - LAKE_C[1]) / LAKE_R[1]
        if dx * dx + dz * dz >= 1.0:
            break
        wx = LAKE_C[0] + (wx - LAKE_C[0]) * 1.3
        wz = LAKE_C[1] + (wz - LAKE_C[1]) * 1.3
    if wx > 820:                      # 东侧是海
        wx = 820 - abs(wx - 820) * 0.4
    return wx, wz


def fnt(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT, size)


def jitter(pts, amount, rng):
    out = []
    for i, (x, y) in enumerate(pts):
        out.append((x, y) if i in (0, len(pts) - 1)
                   else (x + rng.uniform(-amount, amount), y + rng.uniform(-amount, amount)))
    return out


def path(d, pts, color, width, rng, wob=1.6, seg=6):
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        s = [(x0 + (x1 - x0) * t / seg, y0 + (y1 - y0) * t / seg) for t in range(seg + 1)]
        d.line(jitter(s, wob, rng), fill=color, width=max(1, int(width)), joint='curve')


def rect(cx, cy, w, h, rot, rng, rough=1.2):
    hw, hh = w / 2, h / 2
    ca, sa = math.cos(rot), math.sin(rot)
    return [(cx + x * ca - y * sa + rng.uniform(-rough, rough),
             cy + x * sa + y * ca + rng.uniform(-rough, rough))
            for x, y in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))]


def names(rng):
    streets, seen = [], set()
    for a in STREET_A:
        for b in STREET_B:
            n = a + b
            if n not in seen:
                seen.add(n); streets.append(n)
    for n in STREET_X:
        if n not in seen:
            seen.add(n); streets.append(n)
    rng.shuffle(streets)

    shops, seen = [], set()
    for a in SHOP_A:
        for k in SHOP_K:
            n = a + k
            if n in seen:
                continue
            seen.add(n); shops.append(n)
            if len(shops) >= 100:
                break
        if len(shops) >= 100:
            break

    st, seen = [], set()
    for p in ST_P:
        for k in ST_K:
            n = p + k
            if n in seen:
                continue
            seen.add(n); st.append(n)
            if len(st) >= 100:
                break
        if len(st) >= 100:
            break

    spots, seen = [], set()
    for a in SPOT_A:
        for b in SPOT_B:
            n = a + b
            if n in seen:
                continue
            seen.add(n); spots.append(n)
            if len(spots) >= 200:
                break
        if len(spots) >= 200:
            break
    for b in SPOT_B:
        if len(spots) >= 200:
            break
        if b not in seen:
            seen.add(b); spots.append(b)
    return streets[:50], shops, st, spots


def paper(size, seed):
    rng = np.random.default_rng(seed)
    tile = Image.open(PAPER).convert('RGB').resize((2048, 2048), Image.LANCZOS)
    base = Image.new('RGB', (size, size))
    for y in range(0, size, 2048):
        for x in range(0, size, 2048):
            base.paste(tile, (x, y))
    a = np.asarray(base).astype(np.float32) * 0.84 + np.array(TINT, np.float32) * 0.16
    a = np.clip(a + rng.normal(0, 2.6, a.shape), 0, 255).astype(np.uint8)
    return Image.fromarray(a, 'RGB')


def wash(size, scale, paint):
    small = size // scale
    layer = Image.new('RGB', (small, small), TINT)
    paint(ImageDraw.Draw(layer), small)
    layer = layer.filter(ImageFilter.GaussianBlur(small * 0.010))
    return layer.resize((size, size), Image.LANCZOS)


def age(img, size):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    c = size / 2
    r = np.sqrt(((x - c) / c) ** 2 + ((y - c) / c) ** 2)
    v = np.clip(1.05 - 0.20 * np.clip(r - 0.62, 0, 2) ** 1.3, 0.74, 1.05)
    for fx in (0.334, 0.667):
        v *= 1 - 0.030 * np.exp(-((x / size - fx) ** 2) / 1.2e-5)
    v *= 1 - 0.040 * np.exp(-((y / size - 0.5) ** 2) / 1.2e-5)
    a = np.asarray(img).astype(np.float32) * v[:, :, None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def foliage_dots(d, pts, rng, n, radius, col):
    for _ in range(n):
        x, y = rng.choice(pts)
        rr = rng.uniform(4, radius)
        d.ellipse([x - rr, y - rr * 0.8, x + rr, y + rr * 0.8],
                  fill=(col[0], col[1], col[2], rng.randint(90, 150)))


def water_mask(wash_img, size):
    """从水彩层反推水面掩膜（0=陆地，1=水），用于让底纹避开水面。"""
    small = np.asarray(wash_img.resize((512, 512), Image.LANCZOS)).astype(np.float32)
    d = np.abs(small - np.array(WATER, np.float32)).mean(axis=2)
    m = (d < 26).astype(np.float32)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32) / 255.0
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((size, size), Image.BILINEAR)).astype(np.float32) / 255.0


def backdrop(rng, size):
    """全区底纹：等高线、树丛、田块、小村落 —— 让画幅任何角落都有地图该有的东西。"""
    ov = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    # 等高线：一堆随机中心的同心圈
    for _ in range(90):
        cx, cy = rng.uniform(0, size), rng.uniform(0, size)
        for k in range(3):
            rr = rng.uniform(140, 760) + k * 96
            pts = [(cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.78)
                   for a in np.linspace(0, math.tau, 44)]
            path(d, pts, (172, 152, 122, 62), 2, rng, 3.2, 3)
    # 树丛
    pts = [(rng.uniform(0, size), rng.uniform(0, size)) for _ in range(1600)]
    foliage_dots(d, pts, rng, 3600, 6, (124, 152, 106))
    # 田块垄线
    for _ in range(150):
        x, y = rng.uniform(0, size), rng.uniform(0, size)
        w, h = rng.uniform(90, 320), rng.uniform(70, 240)
        n = max(2, int(h / 18))
        for k in range(n):
            path(d, [(x - w / 2, y - h / 2 + k * 18), (x + w / 2, y - h / 2 + k * 18)],
                 (178, 168, 112, 74), 2, rng, 2.0, 3)
    # 小村落
    for _ in range(240):
        cx, cy = rng.uniform(0, size), rng.uniform(0, size)
        for _ in range(rng.randint(3, 8)):
            d.polygon(rect(cx + rng.uniform(-46, 46), cy + rng.uniform(-46, 46),
                           rng.uniform(6, 15), rng.uniform(6, 13), rng.uniform(-.3, .3), rng, .7),
                      fill=(228, 216, 194, 228), outline=INK2 + (135,))
    return ov


def apply_backdrop(img, rng, size):
    w = wash(size, 8, lambda d, s: None)  # 仅用于拿掩膜的水彩层在前面单独算，这里复用不了
    return img


# ============================================================ 大地图
def make_world():
    rng = random.Random(SEED)
    size = N
    print('  纸底…')
    img = paper(size, SEED)
    # 1 px = 1.04 m，城市铺到半径 ~3.7 km
    S = size / 7700.0

    def px(wx, wz):
        return size / 2 + wx * S, size / 2 + wz * S

    def paint(d, s):
        k = (s / size) * S
        def P(wx, wz):
            return (s / 2 + wx * k, s / 2 + wz * k)
        # 城区（先铺，后面水面/林地/田园再画上去，免得把湖盖住）
        for wx, wz, rr in [(60, 120, 390), (-1500, 900, 200), (1200, 1150, 180), (-900, -800, 170),
                           (900, -700, 170), (-2200, 300, 180), (2200, 500, 170), (100, 1800, 190)]:
            cx, cz = P(wx, wz); r = rr * k
            d.ellipse([cx - r, cz - r * .9, cx + r, cz + r * .9], fill=URBAN)
        # 海（东）
        sea = [(s, 0), (s, s)]
        for i in range(61):
            t = i / 60
            sea.append(P(880 + 190 * math.sin(t * 5.0) + 80 * math.sin(t * 11.0), -size / 2 / S + t * (size / S)))
        d.polygon(sea, fill=WATER)
        # 湖
        cx, cz = P(-160, 470); r = 170 * k
        d.ellipse([cx - r, cz - r * .86, cx + r, cz + r * .86], fill=WATER)
        # 林
        for wx, wz, rr in [(-760, -480, 200), (330, -660, 250), (900, 380, 190), (-1500, 900, 240),
                           (1500, -900, 220), (-2100, -500, 260), (2100, 800, 240), (-900, 1400, 210),
                           (600, 1500, 200), (-2600, 600, 230), (2600, -300, 220)]:
            cx, cz = P(wx, wz); r = rr * k
            d.ellipse([cx - r, cz - r * .8, cx + r, cz + r * .8], fill=FOREST)
        # 田
        for wx, wz, rr in [(-620, 520, 130), (-430, 660, 170), (-700, 300, 60), (-1600, -250, 200),
                           (1200, 1150, 220), (-1250, 1150, 190), (1850, -150, 170), (250, -1150, 200)]:
            cx, cz = P(wx, wz); r = rr * k
            d.rectangle([cx - r, cz - r * .7, cx + r, cz + r * .7], fill=FIELD)
        # 雪山
        cx, cz = P(0, -900); r = 330 * k
        d.ellipse([cx - r, cz - r * .6, cx + r, cz + r * .6], fill=SNOW)

    print('  水彩层…')
    wr = wash(size, 8, paint)
    img = Image.blend(img, wr, 0.5)

    print('  底纹（等高线/树丛/田块/村落）…')
    wm = water_mask(wr, size)
    bd = backdrop(rng, size)
    ba = np.asarray(bd.getchannel('A')).astype(np.float32) / 255.0
    bd.putalpha(Image.fromarray((ba * (1.0 - 0.96 * wm) * 255).astype(np.uint8)))
    img = Image.alpha_composite(img.convert('RGBA'), bd).convert('RGB')

    ov = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # 海岸线 + 水纹
    coast = [px(880 + 190 * math.sin(i / 60 * 5.0) + 80 * math.sin(i / 60 * 11.0), -size / 2 / S + i / 60 * (size / S))
             for i in range(61)]
    path(d, coast, INK + (215,), 5, rng, 2.4, 4)
    for k in range(3):
        off = coast and [px(880 + 190 * math.sin(i / 60 * 5.0) + 80 * math.sin(i / 60 * 11.0) + 40 + k * 55,
                            -size / 2 / S + i / 60 * (size / S)) for i in range(61)]
        path(d, off, INK2 + (80,), 2, rng, 2.6, 5)

    # 河
    for pts in [
        [px(-1200, -300), px(-700, -160), px(-430, -60), px(-300, 60), px(-160, 300), px(-120, 470)],
        [px(120, -1200), px(160, -560), px(150, -300), px(150, 70), px(210, 240), px(330, 420)],
        [px(-2200, 400), px(-1600, 520), px(-1000, 640), px(-620, 560)],
    ]:
        cur = []
        for i in range(len(pts) - 1):
            for t in range(11):
                f = t / 10
                cur.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f,
                            pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f))
        path(d, cur, WATER_D + (205,), 16, rng, 3.0, 3)
        path(d, cur, INK2 + (110,), 3, rng, 3.4, 3)

    # 铁路（东西主轴 + 南北支线）
    for wy in (150, -520):
        rail = []
        for i in range(101):
            t = i / 100
            rail.append(px(-3800 + t * 7600, wy + 70 * math.sin(t * 4.2) + 26 * math.sin(t * 9.7)))
        path(d, rail, (86, 74, 66, 230), 9, rng, 1.0, 2)
        path(d, rail, (250, 246, 236, 205), 4, rng, 1.0, 2)
        for i in range(3, len(rail) - 3, 3):
            x, y = rail[i]
            d.line([(x - 7, y + 3), (x + 7, y - 3)], fill=(120, 100, 80, 150), width=2)
    rail2 = [px(150 + 60 * math.sin(i / 40 * 3.2), -3800 + i / 80 * 7600) for i in range(81)]
    path(d, rail2, (86, 74, 66, 215), 7, rng, 1.0, 2)

    # 环路（两条）与放射大道
    cx0, cy0 = px(60, 120)
    for rr in (1500, 2700):
        ring = [(cx0 + math.cos(a) * rr * S, cy0 + math.sin(a) * rr * 0.88 * S)
                for a in np.linspace(0, math.tau, 97)]
        path(d, ring, ROAD + (225,), 16, rng, 2.4, 2)
        path(d, ring, INK2 + (95,), 3, rng, 2.6, 2)
    for k in range(10):
        a = k / 10 * math.tau + 0.12
        p0 = (cx0 + math.cos(a) * 200 * S, cy0 + math.sin(a) * 200 * S)
        p1 = (cx0 + math.cos(a) * 3700 * S, cy0 + math.sin(a) * 3700 * S)
        path(d, [p0, p1], ROAD + (205,), 11, rng, 2.4, 6)
        path(d, [p0, p1], INK2 + (70,), 2, rng, 2.6, 6)

    # ---- 水面再压一层（盖住穿湖而过的道路，岸线加深）----
    sea2 = [px(880 + 190 * math.sin(i / 60 * 5.0) + 80 * math.sin(i / 60 * 11.0),
               -size / 2 / S + i / 60 * (size / S)) for i in range(61)]
    sea_poly = [(size, 0), (size, size)] + sea2
    d.polygon(sea_poly, fill=WATER + (150,))
    lx, ly = px(*LAKE_C)
    lrx, lrz = 172 * S, 150 * S
    d.ellipse([lx - lrx, ly - lrz, lx + lrx, ly + lrz], fill=WATER + (165,), outline=WATER_D + (200,), width=5)
    # 湖岸第二道，手绘感
    for kk in (1.04, 1.10):
        d.ellipse([lx - lrx * kk, ly - lrz * kk, lx + lrx * kk, ly + lrz * kk],
                  outline=INK2 + (70,), width=2)
    # 湖上的水纹
    for k2 in range(5):
        yy = ly - lrz * 0.6 + k2 * lrz * 0.3
        path(d, [(lx - lrx * 0.72, yy), (lx + lrx * 0.72, yy)], INK2 + (48,), 2, rng, 3.0, 4)
    # 河面也压一层（沿主河）
    for pts in [
        [px(-1200, -300), px(-700, -160), px(-430, -60), px(-300, 60), px(-160, 300), px(-120, 470)],
        [px(120, -1200), px(160, -560), px(150, -300), px(150, 70), px(210, 240), px(330, 420)],
    ]:
        cur = []
        for i in range(len(pts) - 1):
            for k3 in range(9):
                f = k3 / 8
                cur.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f,
                            pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f))
        path(d, cur, WATER + (140,), 13, rng, 2.6, 3)

    # 老镇 36 区
    for name, wx, wz, rr in OLD:
        if name in WATERISH:
            continue
        cx, cy = px(wx, wz); R = rr * S
        n = 16 if rr < 60 else 26
        for _ in range(n):
            a = rng.uniform(0, math.tau); rad = rng.uniform(0, R * .9)
            bw = rng.uniform(9, 22); bh = rng.uniform(9, 20)
            d.polygon(rect(cx + math.cos(a) * rad, cy + math.sin(a) * rad, bw, bh,
                           rng.choice([0, math.pi / 2]) + rng.uniform(-.08, .08), rng, .9),
                      fill=(232, 220, 198, 235), outline=INK2 + (165,))

    streets, shops, sts, spots = names(rng)

    # 50 街区：6 圈铺到全画幅
    rings = [(560, 12), (1080, 10), (1620, 9), (2180, 8), (2780, 6), (3400, 5)]
    blocks = []
    bi = 0
    for ri, (rad, cnt) in enumerate(rings):
        for j in range(cnt):
            a = (j / cnt) * math.tau + ri * 0.21 + rng.uniform(-.05, .05)
            r = rad + rng.uniform(-70, 70)
            wx, wz = math.cos(a) * r, math.sin(a) * r * 0.88
            wx, wz = avoid_water(wx, wz)
            if wz < -900:
                wz = -900
            nm = streets[bi % len(streets)]
            blocks.append({'name': nm, 'x': wx, 'y': wz, 'r': [150, 175, 195, 205, 215, 220][ri], 'ring': ri})
            bi += 1

    # 建筑总数控制到 3500
    per = 3500 // len(blocks)
    rem = 3500 - per * len(blocks)
    placements = []
    for k, b in enumerate(blocks):
        cx, cy = px(b['x'], b['y'])
        R = b['r'] * S
        cnt = per + (1 if k < rem else 0)
        for _ in range(cnt):
            a = rng.uniform(0, math.tau); rad = rng.uniform(14, R * .92)
            placements.append((cx + math.cos(a) * rad, cy + math.sin(a) * rad * .88,
                               rng.uniform(8, 22), rng.uniform(8, 20),
                               rng.choice([0, math.pi / 2, rng.uniform(-.4, .4)]), b['ring']))

    # 街区边界 + 街道 + 建筑
    shop_i = 0
    for k, b in enumerate(blocks):
        cx, cy = px(b['x'], b['y']); R = b['r'] * S
        for s in range(0, 28, 2):
            a0, a1 = s / 28 * math.tau, (s + 1) / 28 * math.tau
            path(d, [(cx + math.cos(a0) * R, cy + math.sin(a0) * R * .88),
                     (cx + math.cos(a1) * R, cy + math.sin(a1) * R * .88)], INK2 + (115,), 3, rng, 1.2, 3)
        path(d, [(cx + math.cos(a) * R, cy + math.sin(a) * R * .88) for a in np.linspace(0, math.tau, 9)],
             ROAD + (200,), 7, rng, 1.8, 4)
        for _ in range(4):
            ang = rng.uniform(0, math.tau); ln = R * rng.uniform(.4, .95)
            path(d, [(cx, cy), (cx + math.cos(ang) * ln, cy + math.sin(ang) * ln * .88)],
                 ROAD + (170,), 4, rng, 1.8, 3)
        for _ in range(2):
            if shop_i >= len(shops):
                break
            a = rng.uniform(0, math.tau); rad = rng.uniform(R * .15, R * .8)
            sx, sy = cx + math.cos(a) * rad, cy + math.sin(a) * rad * .88
            d.ellipse([sx - 13, sy - 13, sx + 13, sy + 13], fill=(198, 96, 74, 238), outline=INK + (205,), width=3)
            d.ellipse([sx - 6, sy - 6, sx + 6, sy + 6], fill=(250, 240, 214, 242))
            shop_i += 1

    for x, y, w, h, rot, ring in placements:
        tone = rng.choice([(232, 220, 198), (226, 212, 188), (238, 228, 208), (220, 208, 184)])
        d.polygon(rect(x, y, w, h, rot, rng, .8), fill=tone + (240,), outline=INK2 + (148,))

    # 外围卫星镇（带街网与小站，铺满四角；不计入 3500）
    towns = [(-3050, -2680, '西岭'), (3050, -2560, '东海'), (-3180, 2520, '南坡'), (3080, 2620, '海边'),
             (-1900, -3050, '北沟'), (1900, -3020, '雪口'), (2520, 3050, '滩头'), (-2560, 3020, '田心'),
             (3520, 300, '海门'), (-3520, -300, '西关'), (3560, -1500, '东港'), (-3560, 1500, '南窑'),
             (0, 3500, '新村'), (-1200, 3300, '柳林')]
    for vx, vy, vname in towns:
        cx, cy = px(vx, vy)
        R = 190 * S
        # 街网：3 横 3 纵
        for g in range(-2, 3):
            path(d, [(cx - R, cy + g * R / 2.6), (cx + R, cy + g * R / 2.6)], ROAD + (215,), 6, rng, 2.0, 4)
            path(d, [(cx + g * R / 2.6, cy - R), (cx + g * R / 2.6, cy + R)], ROAD + (215,), 6, rng, 2.0, 4)
        # 街区建筑
        for gx in range(-2, 3):
            for gy in range(-2, 3):
                bx = cx + gx * R / 2.6
                by = cy + gy * R / 2.6
                for _ in range(rng.randint(2, 5)):
                    d.polygon(rect(bx + rng.uniform(-R / 6, R / 6), by + rng.uniform(-R / 6, R / 6),
                                   rng.uniform(9, 20), rng.uniform(9, 18), rng.uniform(-.2, .2), rng, .8),
                              fill=(230, 218, 196, 234), outline=INK2 + (150,))
        # 小镇站
        d.rounded_rectangle([cx - 12, cy - 12, cx + 12, cy + 12], radius=4, fill=(72, 92, 96, 238),
                            outline=INK + (220,), width=3)
        f = fnt(30, True)
        tw = d.textlength(vname, font=f)
        d.text((cx - tw / 2, cy - R - 52), vname, font=f, fill=(112, 70, 42, 244))

    # 卫星镇之间的乡道，把画幅边缘连成一张网
    for a_i in range(len(towns)):
        x0, y0, _ = towns[a_i]
        x1, y1, _ = towns[(a_i + 1) % len(towns)]
        if abs(x0 - x1) > 2600:
            continue
        path(d, [px(x0, y0), px((x0 + x1) / 2, (y0 + y1) / 2 + 260), px(x1, y1)],
             ROAD + (185,), 5, rng, 2.6, 6)

    # 林地树点画 / 农田垄线
    forest_pts = [px(wx + rng.uniform(-rr, rr), wz + rng.uniform(-rr, rr) * .8)
                  for wx, wz, rr in [(-760, -480, 200), (330, -660, 250), (900, 380, 190), (-1500, 900, 240),
                                     (1500, -900, 220), (-2100, -500, 260), (2100, 800, 240), (-900, 1400, 210),
                                     (600, 1500, 200), (-2600, 600, 230), (2600, -300, 220)]
                  for _ in range(320)]
    foliage_dots(d, forest_pts, rng, 4200, 7, (96, 128, 84))
    for wx, wz, rr in [(-620, 520, 130), (-430, 660, 170), (-1600, -250, 200), (1200, 1150, 220),
                       (-1250, 1150, 190), (1850, -150, 170), (250, -1150, 200)]:
        x0, y0 = px(wx, wz)
        for k in range(-int(rr * S / 26), int(rr * S / 26)):
            yy = y0 + k * 26
            path(d, [(x0 - rr * S * .9, yy), (x0 + rr * S * .9, yy)], (168, 158, 96, 120), 2, rng, 2.2, 3)

    # 车站 100
    st_pts = [(n, px(wx, wz)) for n, wx, wz in OLD_ST]
    for i in range(97):
        a = i / 97 * math.tau * 1.06
        r = 700 + (i % 5) * 620 + rng.uniform(-80, 80)
        wx, wz = math.cos(a) * r, math.sin(a) * r * .88
        wx, wz = avoid_water(wx, wz)
        if wz < -950:
            wz = -950
        st_pts.append((sts[i], px(wx, wz)))
    for i, (nm, (sx, sy)) in enumerate(st_pts):
        s = 15
        d.rounded_rectangle([sx - s, sy - s, sx + s, sy + s], radius=5, fill=(72, 92, 96, 242),
                            outline=INK + (222,), width=3)
        d.rectangle([sx - 6, sy - 3, sx + 6, sy + 3], fill=(248, 242, 220, 246))
        if i < 30:
            d.text((sx + 20, sy - 12), nm, font=fnt(21), fill=INK + (238,))

    # 景点 200
    for i in range(200):
        a = rng.uniform(0, math.tau); r = rng.uniform(300, 3600)
        _wx, _wz = avoid_water(math.cos(a) * r, math.sin(a) * r * .88)
        sx, sy = px(_wx, _wz)
        if not (40 <= sx < size - 40 and 40 <= sy < size - 40):
            continue
        rr = 11
        d.polygon([(sx, sy - rr), (sx + rr, sy + rr * .8), (sx - rr, sy + rr * .8)],
                  fill=(238, 208, 120, 242), outline=INK + (215,))
        if i < 44:
            d.text((sx + 17, sy - 10), spots[i], font=fnt(19), fill=INK + (232,))

    # 街区名
    for b in blocks:
        cx, cy = px(b['x'], b['y'])
        f = fnt(26, True)
        tw = d.textlength(b['name'], font=f)
        d.text((cx - tw / 2, cy - b['r'] * S * .95 - 34), b['name'], font=f, fill=(118, 74, 44, 242))

    # 老镇地名
    for name, wx, wz, rr in OLD:
        cx, cy = px(wx, wz)
        f = fnt(24, True)
        tw = d.textlength(name, font=f)
        d.text((cx - tw / 2, cy + rr * S * .55 + 8), name, font=f, fill=(96, 62, 40, 246))

    # 图题
    d.rectangle([300, 250, 2260, 900], fill=(248, 241, 224, 234), outline=INK + (232,), width=6)
    d.text((390, 300), '煤 炭 镇 · 全 域 图', font=fnt(96, True), fill=(84, 52, 34, 250))
    d.text((392, 436), 'COAL TOWN — GENERAL MAP', font=fnt(38), fill=(120, 90, 66, 240))
    d.line([(392, 508), (2170, 508)], fill=INK + (200,), width=4)
    for i, line in enumerate(['城  3500 栋建筑 · 50 条街区 · 100 家主要商店',
                              '站  100 座车站（高铁·铁路·地铁·公交·码头·索道）',
                              '景  200 处景点 · 老镇 36 处原有地标']):
        d.text((392, 548 + i * 62), line, font=fnt(34), fill=(100, 72, 50, 242))

    # 图例
    lx, ly = 320, size - 940
    d.rectangle([lx, ly, lx + 780, ly + 740], fill=(248, 241, 224, 228), outline=INK + (220,), width=5)
    d.text((lx + 34, ly + 26), '图 例', font=fnt(44, True), fill=(84, 52, 34, 246))
    items = [((198, 96, 74), 'circle', '主要商店'), ((72, 92, 96), 'square', '车站'),
             ((238, 208, 120), 'tri', '景点'), ((232, 220, 198), 'square2', '建筑'),
             ((170, 202, 200), 'rect', '水域'), ((152, 178, 130), 'rect', '林地'),
             ((208, 202, 152), 'rect', '田园'), ((86, 74, 66), 'line', '铁路')]
    for i, (col, kind, txt) in enumerate(items):
        y0 = ly + 116 + i * 74; x0 = lx + 62
        if kind == 'circle':
            d.ellipse([x0 - 16, y0 - 12, x0 + 16, y0 + 20], fill=col + (242,), outline=INK + (200,), width=2)
        elif kind == 'square':
            d.rectangle([x0 - 15, y0 - 11, x0 + 15, y0 + 19], fill=col + (242,), outline=INK + (200,), width=2)
        elif kind == 'tri':
            d.polygon([(x0, y0 - 14), (x0 + 16, y0 + 18), (x0 - 16, y0 + 18)], fill=col + (242,), outline=INK + (200,))
        elif kind == 'square2':
            d.rectangle([x0 - 14, y0 - 10, x0 + 14, y0 + 18], fill=col + (242,), outline=INK2 + (200,), width=2)
        elif kind == 'rect':
            d.rectangle([x0 - 22, y0 - 10, x0 + 22, y0 + 18], fill=col + (242,), outline=INK2 + (160,), width=2)
        else:
            d.line([(x0 - 24, y0 + 6), (x0 + 24, y0 + 6)], fill=col + (242,), width=6)
        d.text((x0 + 40, y0 - 12), txt, font=fnt(30), fill=(96, 70, 48, 242))

    # 比例尺 / 指北针
    bx0, by0 = size - 1560, size - 320
    d.line([(bx0, by0), (bx0 + 1240, by0)], fill=INK + (232,), width=5)
    for k in range(6):
        x = bx0 + k * 248
        d.line([(x, by0 - 12), (x, by0 + 12)], fill=INK + (232,), width=4)
    d.text((bx0, by0 + 26), '0      500      1000      1500      2000  米', font=fnt(28), fill=(96, 70, 48, 242))
    nx, ny = size - 520, 430
    d.ellipse([nx - 130, ny - 130, nx + 130, ny + 130], outline=INK + (222,), width=5)
    d.polygon([(nx, ny - 120), (nx + 38, ny + 20), (nx, ny - 10), (nx - 38, ny + 20)],
              fill=(198, 96, 74, 242), outline=INK + (222,))
    d.text((nx - 14, ny - 196), '北', font=fnt(52, True), fill=(84, 52, 34, 246))

    print('  合成…')
    return age(Image.alpha_composite(img.convert('RGBA'), ov).convert('RGB'), size)


# ============================================================ 小镇详图
def make_town():
    rng = random.Random(SEED + 7)
    size = N
    print('  纸底…')
    img = paper(size, SEED + 7)
    SPAN = 1150.0                     # 覆盖 1.15 km，镇区铺满画幅
    S = size / SPAN

    def px(wx, wz):
        return size / 2 + wx * S, size / 2 + wz * S

    def paint(d, s):
        k = (s / size) * S
        def P(wx, wz):
            return (s / 2 + wx * k, s / 2 + wz * k)
        for wx, wz, rr, col, shape in [
            (-160, 470, 170, WATER, 'o'), (120, -60, 62, WATER, 'line'),
            (-330, -40, 150, FOREST, 'o'), (330, -180, 130, FOREST, 'o'), (60, 300, 95, FOREST, 'o'),
            (-300, 380, 80, FOREST, 'o'), (250, -330, 90, FOREST, 'o'),
            (-430, 660, 170, FIELD, 'r'), (-620, 520, 130, FIELD, 'r'), (-700, 300, 60, FIELD, 'r'),
            (-500, -300, 110, FIELD, 'r'),
        ]:
            cx, cz = P(wx, wz); r = rr * k
            if shape == 'o':
                d.ellipse([cx - r, cz - r * .82, cx + r, cz + r * .82], fill=col)
            else:
                d.rectangle([cx - r, cz - r * .7, cx + r, cz + r * .7], fill=col)
        cx, cz = P(60, 120); r = 430 * k
        d.ellipse([cx - r, cz - r * .9, cx + r, cz + r * .9], fill=URBAN)

    print('  水彩层…')
    img = Image.blend(img, wash(size, 8, paint), 0.48)

    ov = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # 道路：环 + 放射
    cx, cy = px(110, 60)
    for rr in (90, 190, 300, 430, 560):
        pts = [(cx + math.cos(a) * rr * S, cy + math.sin(a) * rr * 0.9 * S) for a in np.linspace(0, math.tau, 121)]
        path(d, pts, ROAD + (228,), 14, rng, 2.2, 2)
        path(d, pts, INK2 + (92,), 3, rng, 2.4, 2)
    for k in range(8):
        a = k / 8 * math.tau + 0.18
        path(d, [(cx + math.cos(a) * 60 * S, cy + math.sin(a) * 60 * S),
                 (cx + math.cos(a) * 760 * S, cy + math.sin(a) * 760 * S)], ROAD + (228,), 13, rng, 2.2, 6)

    # 建筑：36 个区按网格铺，边界外延伸到画幅
    total = 0
    for name, wx, wz, rr in OLD:
        if name in WATERISH:
            continue
        bx, by = px(wx, wz); R = rr * S
        grid = max(12, int(rr / 6))
        step = (R * 2) / grid
        for ix in range(grid):
            for iy in range(grid):
                if rng.random() > 0.66:
                    continue
                x = bx - R + (ix + .5) * step + rng.uniform(-step * .15, step * .15)
                y = by - R * .9 + (iy + .5) * step * .9 + rng.uniform(-step * .15, step * .15)
                if (x - bx) ** 2 / R ** 2 + (y - by) ** 2 / (R * .9) ** 2 > .94:
                    continue
                w = step * rng.uniform(.42, .74); h = step * rng.uniform(.38, .68)
                rot = (0 if rng.random() < .72 else math.pi / 2) + rng.uniform(-.05, .05)
                tone = rng.choice([(236, 224, 202), (228, 214, 190), (242, 232, 212),
                                   (216, 196, 172), (198, 172, 148)])
                pts = rect(x, y, w, h, rot, rng, 1.5)
                d.polygon(pts, fill=tone + (246,), outline=INK2 + (185,))
                if rng.random() < .32:
                    d.line([pts[0], pts[1]], fill=INK + (95,), width=3)
                total += 1

    # 镇区外的散落农舍（补满画幅四角）
    for _ in range(420):
        a = rng.uniform(0, math.tau)
        rr = rng.uniform(430, 760)
        x, y = px(math.cos(a) * rr, math.sin(a) * rr * .9)
        if not (0 <= x < size and 0 <= y < size):
            continue
        w = rng.uniform(18, 40); h = rng.uniform(16, 34)
        d.polygon(rect(x, y, w, h, rng.uniform(-.3, .3), rng, 1.2),
                  fill=(230, 218, 196, 232), outline=INK2 + (155,))
        total += 1

    # 树点画
    fp = []
    for wx, wz, rr in [(-330, -40, 150), (330, -180, 130), (60, 300, 95), (-300, 380, 80), (250, -330, 90)]:
        for _ in range(240):
            fp.append(px(wx + rng.uniform(-rr, rr), wz + rng.uniform(-rr, rr) * .8))
    foliage_dots(d, fp, rng, 3400, 9, (94, 126, 82))
    # 农田垄线
    for wx, wz, rr in [(-430, 660, 170), (-620, 520, 130), (-700, 300, 60), (-500, -300, 110)]:
        x0, y0 = px(wx, wz)
        for k in range(-int(rr * S / 40), int(rr * S / 40)):
            path(d, [(x0 - rr * S * .9, y0 + k * 40), (x0 + rr * S * .9, y0 + k * 40)],
                 (170, 160, 98, 125), 3, rng, 2.4, 3)
    # 水纹
    for wx, wz, rr in [(-160, 470, 170)]:
        x0, y0 = px(wx, wz)
        for k in range(7):
            path(d, [(x0 - rr * S * .8, y0 - rr * S * .5 + k * rr * S * .17),
                     (x0 + rr * S * .8, y0 - rr * S * .5 + k * rr * S * .17)],
                 INK2 + (55,), 2, rng, 3.0, 4)

    # 资源点
    res = [('林地', -330, -40, 'wood'), ('林地', 330, -180, 'wood'), ('林地', 60, 300, 'wood'),
           ('竹材', -520, 120, 'wood'), ('果树', -700, 300, 'fruit'), ('果园', 420, 380, 'fruit'),
           ('麦田', -430, 660, 'crop'), ('菜地', -620, 520, 'crop'), ('稻田', 260, 520, 'crop'),
           ('渔场', -160, 470, 'fish'), ('渔场', 420, 620, 'fish'), ('煤矿', -640, -180, 'ore'),
           ('石场', 520, -460, 'ore'), ('铁矿', 640, 300, 'ore'), ('泉水', -60, -180, 'water'),
           ('水井', 180, 20, 'water'), ('水井', -240, 200, 'water'), ('草场', 560, 100, 'grass'),
           ('盐田', 640, 420, 'crop'), ('蜂场', -300, 300, 'grass')]
    col = {'wood': (110, 148, 96), 'fruit': (196, 132, 84), 'crop': (198, 186, 120),
           'fish': (104, 160, 168), 'ore': (128, 120, 116), 'water': (120, 170, 186), 'grass': (150, 178, 120)}
    for label, wx, wz, kind in res:
        x, y = px(wx, wz); c = col[kind]; r = 34
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (236,), outline=INK + (216,), width=4)
        f = fnt(26, True)
        tw = d.textlength(label, font=f)
        d.text((x - tw / 2, y + r + 8), label, font=f, fill=INK + (242,))

    # 地名牌
    for name, wx, wz, rr in OLD:
        if rr < 26:
            continue
        x, y = px(wx, wz)
        f = fnt(34, True)
        tw = d.textlength(name, font=f)
        ty = y - rr * S * .95 - 48
        d.rectangle([x - tw / 2 - 12, ty - 8, x + tw / 2 + 12, ty + 46], fill=(250, 244, 228, 228),
                    outline=INK + (200,), width=3)
        d.text((x - tw / 2, ty), name, font=f, fill=(92, 58, 38, 250))
    for name, wx, wz in OLD_ST:
        x, y = px(wx, wz)
        d.rounded_rectangle([x - 40, y - 30, x + 40, y + 30], radius=8, fill=(72, 92, 96, 242),
                            outline=INK + (226,), width=4)
        f = fnt(26, True); tw = d.textlength(name, font=f)
        d.text((x - tw / 2, y + 40), name, font=f, fill=(88, 60, 40, 246))

    # 图题
    d.rectangle([260, 220, 2280, 830], fill=(248, 241, 224, 236), outline=INK + (232,), width=6)
    d.text((330, 270), '煤 炭 镇 · 小镇详图', font=fnt(92, True), fill=(84, 52, 34, 250))
    d.text((332, 402), 'COAL TOWN — TOWN PLAN   1 : 2000', font=fnt(36), fill=(120, 90, 66, 240))
    d.line([(332, 462), (2190, 462)], fill=INK + (200,), width=4)
    d.text((332, 498), f'镇区建筑 {total} 栋 · 资源点 {len(res)} 处 · 车站 3 座 · 地标 36 处',
           font=fnt(32), fill=(100, 72, 50, 242))
    d.text((332, 552), '林地 / 田园 / 渔场 / 矿场 / 水源 · 供采集与建造查阅',
           font=fnt(30), fill=(118, 88, 66, 236))

    # 图例
    lx, ly = 300, size - 800
    d.rectangle([lx, ly, lx + 720, ly + 620], fill=(248, 241, 224, 228), outline=INK + (220,), width=5)
    d.text((lx + 32, ly + 24), '图 例', font=fnt(42, True), fill=(84, 52, 34, 246))
    lg = [((236, 224, 202), '建筑'), ((198, 180, 152), '街道'), ((170, 202, 200), '水域'),
          ((110, 148, 96), '林地'), ((196, 132, 84), '果木'), ((198, 186, 120), '农田'),
          ((128, 120, 116), '矿场'), ((104, 160, 168), '渔场')]
    for i, (c, txt) in enumerate(lg):
        y0 = ly + 104 + i * 62
        d.rectangle([lx + 44, y0 - 12, lx + 110, y0 + 20], fill=c + (242,), outline=INK + (190,), width=2)
        d.text((lx + 132, y0 - 12), txt, font=fnt(30), fill=(96, 70, 48, 242))

    bx0, by0 = size - 1560, size - 300
    d.line([(bx0, by0), (bx0 + 1240, by0)], fill=INK + (232,), width=5)
    for k in range(6):
        x = bx0 + k * 248
        d.line([(x, by0 - 12), (x, by0 + 12)], fill=INK + (232,), width=4)
    d.text((bx0, by0 + 24), '0      50      100      150      200  米', font=fnt(28), fill=(96, 70, 48, 242))
    nx, ny = size - 520, 430
    d.ellipse([nx - 120, ny - 120, nx + 120, ny + 120], outline=INK + (222,), width=5)
    d.polygon([(nx, ny - 110), (nx + 34, ny + 18), (nx, ny - 8), (nx - 34, ny + 18)],
              fill=(198, 96, 74, 242), outline=INK + (222,))
    d.text((nx - 12, ny - 178), '北', font=fnt(50, True), fill=(84, 52, 34, 246))

    print('  合成…')
    return age(Image.alpha_composite(img.convert('RGBA'), ov).convert('RGB'), size)


def save(img, name):
    jpg = os.path.join(OUT, name + '.jpg')
    img.save(jpg, 'JPEG', quality=90, optimize=True, progressive=True)
    img.resize((2048, 2048), Image.LANCZOS).save(os.path.join(OUT, name + '-preview.png'), 'PNG', optimize=True)
    print(f'  {name}: {img.width}×{img.height}  {os.path.getsize(jpg)/1048576:.1f} MB')


if __name__ == '__main__':
    print('大地图…'); save(make_world(), 'world-8k')
    print('小镇详图…'); save(make_town(), 'town-8k')
    print('完成 →', OUT)