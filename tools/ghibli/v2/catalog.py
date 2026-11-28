"""从贴图层目录生成 2000+ 个模型的规格清单。

数据来源（就是"参照我的贴图层"）：
  assets/sprites/{furniture,stations,transport,infra}/*.png     → 1:1 对应一个 3D 模型
  assets/textures/containers/*                                  → 容器类
  assets/textures/house/*                                       → 墙面/屋顶材质名，用来派生民居风格
  assets/textures/shopfront/*                                   → 店铺类型
输出：design/models-2000.json
"""
import json
import os
import re
import hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
# ROOT = deepseek-world/
NAMES = json.load(open(os.path.join(ROOT, 'design', 'atlas-names.json'), encoding='utf-8'))
TEX = json.load(open(os.path.join(ROOT, 'design', 'atlas-textures.json'), encoding='utf-8'))

WALLS = ['wall_cream', 'wall_butter', 'wall_pink', 'wall_sage', 'wall_blue', 'wall_ash']
ROOFS = ['red', 'teal', 'grey', 'blue', 'straw', 'slate']
WOODS = ['wood_dark', 'wood_mid', 'wood_light']
FABRICS = ['fabric_red', 'fabric_cream', 'fabric_green', 'fabric_blue', 'wall_pink']
CERAMIC = ['white', 'terracotta', 'wall_ash', 'wall_sage']
STONE = ['stone_warm', 'stone', 'stone_dark']


def h(name, salt=''):
    return int(hashlib.md5((name + '|' + salt).encode()).hexdigest()[:8], 16)


def pick(name, arr, salt=''):
    return arr[h(name, salt) % len(arr)]


def rng(name, lo, hi, salt=''):
    v = h(name, salt)
    return round(lo + (hi - lo) * ((v % 1000) / 1000.0), 3)


# ---------------------------------------------------------------- 关键词分类
def classify_furniture(n):
    """furniture 目录 → 家具家族。"""
    if re.search(r'chair|seat(?!er)', n):
        return 'f_chair'
    if 'stool' in n or 'ottoman' in n:
        return 'f_stool'
    if 'bench' in n:
        return 'f_bench'
    if re.search(r'table|dining', n):
        return 'f_table'
    if 'desk' in n or 'lectern' in n or 'podium' in n or 'abacus' in n:
        return 'f_desk'
    if re.search(r'shelf|bookcase|archive|rack-of-shelf', n):
        return 'f_shelf'
    if re.search(r'cabinet|cupboard|armoire|wardrobe|dresser|chest|trunk|vanity|sideboard|hutch', n):
        return 'f_case'
    if re.search(r'\bbed\b|crib|cot\b|bunk|cradle', n):
        return 'f_bed'
    if re.search(r'sofa|settee|couch|divan', n):
        return 'f_sofa'
    if re.search(r'rug|carpet|mat\b|quilt|throw|blanket|cushion|pillow|napkin|tablecloth', n):
        return 'f_soft'
    if re.search(r'lamp|lantern|sconce|chandelier|candle|lampshade', n):
        return 'f_lamp'
    if 'mirror' in n:
        return 'f_mirror'
    if re.search(r'clock|hourglass|sundial', n):
        return 'f_clock'
    if re.search(r'picture|painting|frame|poster|map', n):
        return 'f_picture'
    if re.search(r'\bpot\b|\bpan\b|kettle|teapot|bowl|tray|plate|jar\b|bottle|pitcher|jug\b|cup\b|mug|skillet|cauldron', n):
        return 'f_kitchen'
    if re.search(r'sink|stove|oven|fridge|icebox|washer|boiler|furnace|heater', n):
        return 'f_appliance'
    if re.search(r'basket|barrel|bucket|tub|bath|box\b|crate|sack|bin\b|can\b|chest-of', n):
        return 'f_storage'
    if re.search(r'rack|hooks|hanger|pegs|stand-of', n):
        return 'f_rack'
    if re.search(r'stand|pedestal|plinth|atlas|easel|tripod', n):
        return 'f_stand'
    if 'screen' in n or 'shoji' in n or 'partition' in n:
        return 'f_shelf'
    return 'f_case'


def classify_station(n):
    if re.search(r'gate|turnstile|barrier|access-control|flap', n):
        return 'gate'
    if re.search(r'kiosk|booth|pavilion|stall', n):
        return 'kiosk'
    if re.search(r'machine|dispenser|atm|vending|printer|reader|charger|locker', n):
        return 'machine'
    if re.search(r'screen|board|display|monitor|arrival|departure|advertising|notice|map|timetable|sign', n):
        return 'screen'
    if re.search(r'seat|chair|armrest', n):
        return 'seat_row'
    if 'bench' in n:
        return 'bench'
    if re.search(r'bin|trash|recycle|waste', n):
        return 'bin'
    if re.search(r'fountain|drinking', n):
        return 'fountain'
    if re.search(r'pole|post|pillar|column|lamp|bollard|mast', n):
        return 'post'
    if re.search(r'shelter|canopy|roof|awning', n):
        return 'shelter'
    if re.search(r'cart|trolley|luggage|baggage', n):
        return 'vehicle'
    if re.search(r'planter|flower|plant|green', n):
        return 'planter'
    if re.search(r'stairs|escalator|elevator|lift|ramp|handrail', n):
        return 'bench'
    return 'machine'


def classify_infra(n):
    if re.search(r'arch|gateway', n):
        return 'gate'
    if re.search(r'bench', n):
        return 'bench'
    if re.search(r'lamp|lantern|candelabra|light|bollard', n):
        return 'post'
    if re.search(r'shelter|canopy|awning|gazebo|bandstand', n):
        return 'shelter'
    if re.search(r'tower|clock-tower|belvedere', n):
        return 'tower'
    if re.search(r'bridge|footbridge', n):
        return 'bridge'
    if re.search(r'fountain|drinking', n):
        return 'fountain'
    if re.search(r'planter|flower-bed|hanging-basket', n):
        return 'planter'
    if re.search(r'rack|hoop|goal|climbing|frame', n):
        return 'f_rack'
    if re.search(r'pole|flagpole|post|pillar|hydrant|sign', n):
        return 'post'
    return 'bench'


def classify_transport(n):
    if re.search(r'plane|airliner|cargo-plane|biplane|autogyro|glider|balloon|airship|drone', n):
        return 'plane'
    if re.search(r'boat|ship|canoe|barge|catamaran|tug|ferry|sail|yacht|raft', n):
        return 'boat'
    if re.search(r'bike|bicycle|tricycle|scooter|cycle|motorbike|motorcycle', n):
        return 'car'
    if re.search(r'cart|wagon|carriage|chariot|sled|sleigh|caboose|trailer|handcart|wheelbarrow', n):
        return 'car'
    if re.search(r'train|tram|subway|metro|locomotive|railcar|monorail', n):
        return 'car'
    if re.search(r'cable-car|chairlift|gondola|cabin', n):
        return 'car'
    return 'car'


def classify_container(n):
    if 'barrel' in n:
        return 'storage', 'barrel'
    if 'crate' in n:
        return 'storage', 'crate'
    if re.search(r'basket|burlap|sack|bag\b', n):
        return 'storage', 'basket'
    if re.search(r'ceramic|jar|vase|amphora|porcelain|celadon|stoneware|pottery|earthenware', n):
        return 'storage', 'jar'
    if re.search(r'bucket|tub|churn', n):
        return 'storage', 'bucket'
    return 'storage', 'crate'


# ---------------------------------------------------------------- 参数生成
def furniture_params(n, fam):
    """按名字决定尺寸与配色（家具真实尺度）。"""
    kind = fam[2:]
    base = {
        'chair': (0.48, 0.52, 0.95), 'stool': (0.42, 0.42, 0.46), 'bench': (1.6, 0.55, 0.9),
        'table': (1.3, 0.8, 0.75), 'desk': (1.2, 0.6, 0.76), 'shelf': (1.2, 0.35, 1.8),
        'case': (1.1, 0.55, 1.6), 'bed': (1.4, 2.0, 0.9), 'sofa': (1.9, 0.85, 0.8),
        'soft': (1.8, 1.2, 0.03), 'lamp': (0.4, 0.4, 1.6), 'mirror': (0.7, 0.06, 1.2),
        'clock': (0.5, 0.15, 1.4), 'picture': (0.8, 0.06, 1.0), 'kitchen': (0.4, 0.4, 0.3),
        'appliance': (0.9, 0.6, 1.4), 'storage': (0.6, 0.5, 0.6), 'rack': (1.0, 0.4, 1.6),
        'stand': (0.6, 0.4, 1.1),
    }[kind]
    s = rng(n, 0.82, 1.22, 'scale')
    w, d, hh = [round(v * s, 2) for v in base]
    if re.search(r'small|mini|low|tiny|little', n):
        w, d, hh = [round(v * 0.76, 2) for v in (w, d, hh)]
    if re.search(r'large|big|grand|tall|double|king|queen', n):
        w, hh = round(w * 1.18, 2), round(hh * 1.14, 2)
    p = dict(w=w, d=d, h=hh,
             wood=pick(n, WOODS, 'wood'), wood2=pick(n, WOODS, 'wood2'),
             fabric=pick(n, FABRICS, 'fab'), quilt=pick(n, FABRICS, 'quilt'),
             fabric2=pick(n, FABRICS, 'fab2'), shade=pick(n, FABRICS, 'shade'),
             frame=pick(n, WOODS, 'frame'), canvas=pick(n, WALLS, 'canvas'),
             metal=pick(n, ['metal', 'metal_dark', 'gold'], 'metal'),
             ceramic=pick(n, CERAMIC, 'cer'), base='metal_dark',
             levels=3 + h(n, 'lv') % 3, drawers=1 + h(n, 'dr') % 3,
             seats=3 + h(n, 'st') % 3, cloth=bool(h(n, 'cl') % 2))
    if kind == 'kitchen':
        v = 'pot'
        for k in ('teapot', 'kettle', 'pan', 'bowl', 'tray', 'plate'):
            if k in n:
                v = k
                break
        p.update(variant=v, w=round(rng(n, 0.22, 0.46), 2), h=round(rng(n, 0.14, 0.34), 2),
                 d=round(rng(n, 0.22, 0.46), 2))
    if kind == 'appliance':
        v = 'sink'
        for k in ('stove', 'oven', 'fridge', 'icebox', 'washer', 'boiler'):
            if k in n:
                v = 'stove' if k == 'oven' else ('fridge' if k == 'icebox' else k)
                break
        p['variant'] = v
        p['shell'] = pick(n, ['wall_ash', 'white', 'fabric_cream'], 'shell')
    if kind == 'storage':
        v = 'crate'
        for k in ('barrel', 'basket', 'jar', 'vase', 'bucket', 'tub'):
            if k in n:
                v = k
                break
        p['variant'] = v
        p['mat'] = pick(n, WOODS, 'mat')
    if kind == 'lamp':
        p['shade'] = pick(n, FABRICS, 'shade')
    return p


def station_params(n, fam):
    base = {
        'gate': (1.2, 0.9, 1.1), 'kiosk': (2.0, 1.6, 2.4), 'machine': (0.9, 0.8, 1.9),
        'screen': (1.6, 0.3, 2.2), 'seat_row': (2.4, 0.6, 0.9), 'bench': (1.8, 0.6, 0.9),
        'bin': (0.5, 0.5, 1.0), 'fountain': (0.6, 0.6, 1.1), 'post': (0.24, 0.24, 3.4),
        'shelter': (3.4, 1.8, 2.8), 'vehicle': (1.4, 0.8, 1.0), 'planter': (1.2, 1.2, 0.7),
        'tower': (2.6, 2.6, 9.0), 'bridge': (9.0, 3.2, 3.0), 'tree': (2.0, 2.0, 5.0),
        'tool': (0.3, 0.3, 1.3), 'f_rack': (1.0, 0.4, 1.6), 'f_bench': (1.7, 0.55, 0.9),
        'f_stand': (0.6, 0.4, 1.1), 'f_case': (1.0, 0.5, 1.2),
    }.get(fam, (1.2, 0.8, 1.2))
    s = rng(n, 0.88, 1.3, 'sscale')
    w, d, hh = [round(v * s, 2) for v in base]
    p = dict(w=w, d=d, h=hh,
             metal=pick(n, ['metal', 'metal_dark'], 'met'),
             shell=pick(n, ['fabric_blue', 'fabric_green', 'wall_ash', 'white'], 'sh'),
             roof=pick(n, ROOFS, 'rf'), wood=pick(n, WOODS, 'wd'),
             stone=pick(n, STONE, 'st'), leaf=pick(n, ['leaf', 'leaf_light', 'leaf_dark'], 'lf'),
             seats=2 + h(n, 'se') % 5, lamp=('lamp' in n or 'light' in n),
             sign=('sign' in n or 'board' in n))
    return p


def infra_params(n, fam):
    p = station_params(n, fam)
    if 'bollard' in n or 'post' in n or 'pole' in n:
        p['lamp'] = ('lamp' in n or 'light' in n or 'lantern' in n)
    return p


def transport_params(n, fam):
    if fam == 'plane':
        w, d, hh = rng(n, 8, 30, 'pl'), rng(n, 8, 26, 'pw'), rng(n, 2.5, 7, 'ph')
    elif fam == 'boat':
        w, d, hh = rng(n, 3, 18, 'bl'), rng(n, 1.4, 6, 'bw'), rng(n, 1, 6, 'bh')
    elif re.search(r'train|tram|subway|metro|locomotive|railcar', n):
        w, d, hh = rng(n, 9, 24, 'tl'), rng(n, 2.6, 3.4, 'tw'), rng(n, 3, 4.4, 'th')
    elif re.search(r'bus|coach|articulated', n):
        w, d, hh = rng(n, 7, 13, 'bL'), rng(n, 2.2, 2.8, 'bW'), rng(n, 2.6, 3.4, 'bH')
    else:
        w, d, hh = rng(n, 2.4, 5.6, 'cl'), rng(n, 1.4, 2.4, 'cw'), rng(n, 1.2, 2.4, 'ch')
    return dict(w=round(w, 2), d=round(d, 2), h=round(hh, 2),
                body=pick(n, ['fabric_red', 'fabric_blue', 'fabric_green', 'wall_ash',
                              'roof_red', 'roof_teal'], 'body'),
                variant=fam)


def container_params(n, fam, sub):
    sizes = {'barrel': (0.6, 0.6, 0.9), 'crate': (0.7, 0.5, 0.5), 'basket': (0.5, 0.4, 0.35),
             'jar': (0.4, 0.4, 0.6), 'bucket': (0.4, 0.4, 0.4)}
    w, d, hh = sizes[sub]
    s = rng(n, 0.85, 1.35, 'cs')
    return dict(w=round(w * s, 2), d=round(d * s, 2), h=round(hh * s, 2), variant=sub,
                mat=pick(n, WOODS, 'cm'),
                ceramic=pick(n, ['terracotta', 'white', 'wall_ash', 'wall_sage', 'stone'], 'cc'))


# ---------------------------------------------------------------- 店铺 150 种
SHOP_TYPES = [
    ('bakery', '面包店'), ('patisserie', '西点店'), ('cake-shop', '蛋糕店'), ('rice-shop', '米店'),
    ('noodle', '拉面馆'), ('soba', '荞麦面店'), ('udon', '乌冬面店'), ('dumpling', '饺子馆'),
    ('sushi', '寿司店'), ('tempura', '天妇罗店'), ('yakitori', '串烧店'), ('ramen', '中华面馆'),
    ('tea-house', '茶馆'), ('coffee', '咖啡馆'), ('juice-bar', '果汁店'), ('icecream', '冰淇淋店'),
    ('candy', '糖果店'), ('sweets', '和果子店'), ('chocolate', '巧克力店'), ('tofu', '豆腐店'),
    ('fish', '鱼铺'), ('seafood', '海鲜铺'), ('butcher', '肉铺'), ('greengrocer', '菜摊'),
    ('fruit', '水果店'), ('grocer', '杂货铺'), ('supermarket', '小超市'), ('convenience', '便利店'),
    ('spice', '香料铺'), ('oil-shop', '油盐店'), ('grain', '粮行'), ('pickle', '酱菜铺'),
    ('wine', '酒坊'), ('pub', '酒馆'), ('brewery', '小酒厂'), ('tobacconist', '烟铺'),
    ('pharmacy', '药铺'), ('herbalist', '草药店'), ('clinic-shop', '诊所药房'), ('optician', '眼镜店'),
    ('clothing', '布店'), ('tailor', '裁缝铺'), ('dressmaker', '成衣店'), ('shoe-shop', '鞋铺'),
    ('hat-shop', '帽店'), ('leather', '皮具店'), ('jewelry', '首饰店'), ('watchmaker', '钟表店'),
    ('goldsmith', '金铺'), ('silversmith', '银器铺'), ('bookstore', '书店'), ('stationery', '文具店'),
    ('newspaper', '报刊亭'), ('toyshop', '玩具店'), ('art-supply', '画材店'), ('music-shop', '乐器行'),
    ('photostudio', '照相馆'), ('print-shop', '印刷店'), ('florist', '花店'), ('garden-shop', '园艺店'),
    ('hardware', '五金店'), ('lumber', '木料行'), ('paint-shop', '油漆店'), ('glass-shop', '玻璃店'),
    ('pottery', '陶器店'), ('ceramics', '瓷器店'), ('lacquer', '漆器店'), ('bamboo-craft', '竹器店'),
    ('umbrella', '伞店'), ('fan-shop', '扇子店'), ('lantern-shop', '灯笼铺'), ('candle-shop', '蜡烛铺'),
    ('rope-shop', '绳索铺'), ('net-shop', '渔具店'), ('bike-shop', '自行车行'), ('carriage', '车马行'),
    ('smithy', '铁匠铺'), ('tinsmith', '白铁铺'), ('cooper', '箍桶铺'), ('cobbler', '修鞋铺'),
    ('barber', '理发店'), ('bathhouse', '澡堂'), ('laundry', '洗衣店'), ('dye-shop', '染坊'),
    ('weaver', '织布坊'), ('spinner', '纺线铺'), ('furniture-shop', '家具店'), ('antique', '古董店'),
    ('pawnshop', '当铺'), ('bank', '钱庄'), ('post', '邮局'), ('inn', '旅馆'),
    ('hostel', '民宿'), ('boarding', '寄宿舍'), ('restaurant', '饭馆'), ('diner', '小食店'),
    ('delicatessen', '熟食店'), ('bento', '便当铺'), ('grill', '烧烤摊'), ('hotpot', '火锅店'),
    ('dumpling-house', '包子铺'), ('porridge', '粥铺'), ('dessert', '甜品店'), ('bubble-tea', '奶茶铺'),
    ('pet-shop', '宠物店'), ('seed-shop', '种子铺'), ('farm-supply', '农具行'), ('feed-store', '饲料铺'),
    ('dairy', '奶铺'), ('egg-shop', '蛋铺'), ('honey', '蜂蜜铺'), ('cheese', '乳酪铺'),
    ('sausage', '腊味铺'), ('dried-good', '干货铺'), ('tea-leaf', '茶叶铺'), ('herb-tea', '凉茶铺'),
    ('toy-repair', '玩具修理'), ('clock-repair', '钟表修理'), ('knife-sharpener', '磨刀铺'), ('pot-repair', '补锅铺'),
    ('photo-print', '冲印店'), ('sign-painter', '招牌铺'), ('carpet', '地毯店'), ('curtain-shop', '窗帘店'),
    ('tile-shop', '瓷砖店'), ('stove-shop', '炉具店'), ('lamp-shop', '灯具店'), ('mirror-shop', '镜铺'),
    ('paper-shop', '纸铺'), ('ink-shop', '墨铺'), ('brush-shop', '笔铺'), ('seal-shop', '刻印铺'),
    ('frame-shop', '画框店'), ('trophy', '奖杯店'), ('sport-shop', '体育用品'), ('fishing-shop', '钓具店'),
    ('camping', '户外用品'), ('map-shop', '地图店'), ('travel', '旅行社'), ('ticket-office', '售票处'),
    ('courier', '快递点'), ('phone-shop', '电器行'), ('radio-repair', '电器修理'), ('battery', '电池铺'),
    ('ice-house', '冰铺'), ('water-shop', '水铺'), ('coal-shop', '煤铺'), ('firewood', '柴火铺'),
    ('glass-repair', '玻璃修补'), ('roofing', '瓦匠铺'), ('mason', '石匠铺'), ('carpenter', '木匠铺'),
    ('painter-shop', '漆匠铺'), ('well-digger', '打井铺'), ('chimney-sweep', '烟囱清扫'), ('rat-catcher', '捕鼠铺'),
    ('fortune', '算命摊'), ('souvenir', '纪念品店'), ('secondhand', '二手店'), ('auction', '拍卖行'),
    ('gallery', '画廊'), ('studio', '工作室'), ('school-supply', '学童用品'), ('library-shop', '书屋'),
]

SHOP_GOODS = {
    'bakery': ['roof_straw', 'gold', 'wood_light'], 'fish': ['wall_ash', 'water', 'metal'],
    'florist': ['fabric_red', 'leaf', 'wall_pink'], 'bookstore': ['fabric_blue', 'fabric_red', 'fabric_green'],
    'tea-house': ['wall_sage', 'white', 'wood_light'], 'clothing': ['fabric_blue', 'wall_pink', 'fabric_cream'],
    'jewelry': ['gold', 'white', 'fabric_blue'], 'pottery': ['terracotta', 'wall_ash', 'stone'],
}
SHOP_EMBLEM = {
    'bakery': 'bread', 'noodle': 'cup', 'tea-house': 'cup', 'coffee': 'cup', 'fish': 'fish',
    'seafood': 'fish', 'florist': 'flower', 'greengrocer': 'flower', 'fruit': 'flower',
}


def shop_specs():
    out = []
    for i, (slug, zh) in enumerate(SHOP_TYPES):
        ident = f'shop_{slug}'
        w = rng(ident, 6.4, 9.2, 'w')
        d = rng(ident, 5.4, 8.0, 'd')
        hh = rng(ident, 6.6, 10.5, 'h')
        out.append(dict(
            id=ident, cat='shop', family='shop', name=zh, variant=slug,
            w=round(w, 2), d=round(d, 2), h=round(hh, 2),
            floors=2, wall=pick(ident, WALLS, 'wall'), roof=pick(ident, ROOFS, 'roof'),
            awning=pick(ident, FABRICS, 'awn'), noren=pick(ident, FABRICS, 'nor'),
            sign_wood=pick(ident, WOODS, 'sg'),
            goods=SHOP_GOODS.get(slug, [pick(ident, FABRICS, 'g1'), pick(ident, CERAMIC, 'g2'),
                                        pick(ident, WOODS, 'g3')]),
            emblem=SHOP_EMBLEM.get(slug),
            chimney=bool(h(ident, 'ch') % 3), festoon=bool(h(ident, 'fe') % 2),
        ))
    return out


def house_specs(n=250):
    """用 house 贴图里的墙面/屋顶材质名派生 250 个民居变体。"""
    walls_tex = [x for x in TEX.get('house', []) if x.startswith(('wall', 'plaster', 'paint', 'panel', 'facade'))][:60]
    roofs_tex = [x for x in TEX.get('house', []) if x.startswith(('roof', 'tile', 'slate'))][:40]
    out = []
    styles = [('timber', 'plank'), ('stone', 'stone'), ('cottage', 'plank'),
              ('attached', 'plank'), ('barn', 'plank'), ('stilt', 'plank')]
    for i in range(n):
        wt = walls_tex[i % len(walls_tex)] if walls_tex else 'wall'
        rt = roofs_tex[i % len(roofs_tex)] if roofs_tex else 'roof'
        ident = f'house_{i:03d}_{re.sub(r"[^a-z0-9]+", "-", wt)[:12]}'
        style, siding = styles[i % len(styles)]
        floors = 1 + (i % 3 == 0) + (i % 7 == 0)
        w = rng(ident, 6.0, 10.0, 'w')
        d = rng(ident, 5.2, 8.6, 'd')
        body_h = rng(ident, 2.7, 3.3, 'fh')
        hh = round(body_h * floors + 1.6, 2)
        out.append(dict(
            id=ident, cat='house', family='house', name=f'民居 {i:03d}（{wt}/{rt}）',
            variant=style, w=round(w, 2), d=round(d, 2), h=hh, floors=floors,
            wall=pick(ident, WALLS, 'wall'), roof=RoofFrom(rt, ident), siding=siding,
            timber=(style in ('timber', 'cottage', 'attached')),
            shutters=bool(h(ident, 'sh') % 2), balcony=bool(h(ident, 'ba') % 3 == 0),
            dormer=bool(h(ident, 'do') % 4 == 0), noren=False,
            jetty=floors >= 2, plants=bool(h(ident, 'pl') % 3),
            back_windows=True, chimney=bool(h(ident, 'ch') % 2),
            roof_ratio=rng(ident, 0.24, 0.36, 'rr'), overhang=rng(ident, 0.5, 0.85, 'ov'),
            upturn=rng(ident, 0.06, 0.2, 'up'), nwin=2 + h(ident, 'nw') % 2,
        ))
    return out


def RoofFrom(tex_name, ident):
    m = {'roof': None}
    if 'teal' in tex_name or 'slate' in tex_name or 'blue' in tex_name:
        return 'teal'
    if 'red' in tex_name or 'clay' in tex_name or 'terracotta' in tex_name:
        return 'red'
    if 'grey' in tex_name or 'gray' in tex_name or 'zinc' in tex_name or 'lead' in tex_name:
        return 'grey'
    if 'thatch' in tex_name or 'straw' in tex_name or 'shingle' in tex_name:
        return 'straw'
    return pick(ident, ROOFS, 'roof')


def tool_specs():
    out = []
    kinds = [('hoe', '锄头'), ('rake', '钉耙'), ('sickle', '镰刀'), ('spade', '铁锹'),
             ('watering', '洒水壶'), ('fork', '草叉'), ('shovel', '铲子'), ('can', '水桶')]
    i = 0
    for k, zh in kinds:
        for size in ('small', 'medium', 'large'):
            i += 1
            ident = f'tool_{k}_{size}'
            s = {'small': 0.78, 'medium': 1.0, 'large': 1.24}[size]
            out.append(dict(id=ident, cat='tool', family='tool', name=f'{zh}·{size}',
                            variant=k, w=round(0.3 * s, 2), d=round(0.3 * s, 2), h=round(1.3 * s, 2)))
    return out


def plant_specs():
    out = []
    kinds = [('tree', 'tree', 6), ('bush', 'tree', 6), ('flower', 'planter', 6)]
    for fam, code, n in kinds:
        for i in range(n * 8):
            ident = f'{fam}_{i:02d}'
            if code == 'tree':
                hh = rng(ident, 3.0, 9.0, 'h')
                out.append(dict(id=ident, cat='plant', family='tree', name=f'{fam} {i:02d}',
                                w=round(rng(ident, 1.4, 4.2, 'w'), 2), d=1.0, h=round(hh, 2),
                                leaf=pick(ident, ['leaf', 'leaf_light', 'leaf_dark'], 'lf')))
            else:
                out.append(dict(id=ident, cat='plant', family='planter', name=f'{fam} {i:02d}',
                                w=round(rng(ident, 0.8, 2.2, 'w'), 2), d=round(rng(ident, 0.8, 2.2, 'd'), 2),
                                h=round(rng(ident, 0.5, 1.1, 'h'), 2),
                                stone=pick(ident, STONE, 'st'), leaf=pick(ident, ['leaf', 'leaf_light'], 'lf')))
    return out


def road_specs():
    """roads 贴图层 → 路面/台阶/铺装块（每张路面贴图一块）。"""
    out = []
    for n in TEX.get('roads', []):
        if n.startswith('contact'):
            continue
        kind = n.split('-')[0].split('_')[0]
        v = {'asphalt': 'asphalt', 'brick': 'brick', 'cobble': 'cobble', 'earth': 'earth',
             'heritage': 'heritage', 'industry': 'industry', 'metal': 'metal', 'nature': 'nature',
             'pattern': 'pattern', 'step': 'step', 'stone': 'stone', 'trail': 'trail',
             'urban': 'urban', 'wood': 'wood'}.get(kind, 'stone')
        ident = f'road_{re.sub(r"[^a-z0-9]+", "-", n)}'
        w = 2.4 if v != 'step' else 1.8
        d = 2.4 if v != 'step' else 1.2
        out.append(dict(id=ident, cat='road', family='road', name=n, variant=v,
                        w=w, d=d, h=0.2 if v == 'step' else 0.14,
                        stone=pick(ident, STONE, 'st'), steps=2 + h(ident, 'sp') % 3,
                        kerb=(v not in ('step', 'trail')), stripe=bool(h(ident, 'sr') % 2)))
    return out


def main():
    items = []

    # 1) 家具 504（1:1 对应 sprite）
    for n in NAMES.get('furniture', []):
        if n.startswith('contact'):
            continue
        fam = classify_furniture(n)
        p = furniture_params(n, fam)
        items.append(dict(id=f'fur_{n}', cat='furniture', family=fam, name=n, **p))

    # 2) 站台设备 501
    for n in NAMES.get('stations', []):
        if n.startswith('contact'):
            continue
        fam = classify_station(n)
        p = station_params(n, fam)
        items.append(dict(id=f'st_{n}', cat='station', family=fam, name=n, **p))

    # 3) 载具 201
    for n in NAMES.get('transport', []):
        if n.startswith('contact'):
            continue
        fam = classify_transport(n)
        p = transport_params(n, fam)
        items.append(dict(id=f'veh_{n}', cat='transport', family='vehicle', name=n, **p))

    # 4) 市政设施 101
    for n in NAMES.get('infra', []):
        if n.startswith('contact'):
            continue
        fam = classify_infra(n)
        p = infra_params(n, fam)
        items.append(dict(id=f'inf_{n}', cat='infra', family=fam, name=n, **p))

    # 5) 容器 71
    for n in TEX.get('containers', []):
        if n.startswith('contact'):
            continue
        fam, sub = classify_container(n)
        p = container_params(n, fam, sub)
        items.append(dict(id=f'con_{n}', cat='container', family=fam, name=n, **p))

    # 6) 店铺 150
    items.extend(shop_specs())

    # 7) 民居 250
    items.extend(house_specs(300))

    # 8) 农具 + 植物
    items.extend(tool_specs())
    items.extend(plant_specs())

    # 9) 路面铺装（roads 贴图层）
    items.extend(road_specs())

    # 10) 鸟 301 + 鱼 121（v3 生物精模）
    items.extend(bird_specs())
    items.extend(fish_specs())

    # 去重
    seen = set()
    uniq = []
    for it in items:
        if it['id'] in seen:
            continue
        seen.add(it['id'])
        uniq.append(it)

    out = dict(
        project='deepseeks-world', style='Ghibli / 煤炭镇 手绘水粉（v2 精模）',
        units='m', forward='+Z', origin='底部中心',
        source='assets/sprites + assets/textures 的贴图层目录',
        total=len(uniq),
        by_cat={},
        items=uniq,
    )
    for it in uniq:
        out['by_cat'][it['cat']] = out['by_cat'].get(it['cat'], 0) + 1
    path = os.path.join(ROOT, 'design', 'models-2000.json')
    json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('catalog', out['total'], 'items ->', path)
    print('by_cat', out['by_cat'])
    fams = {}
    for it in uniq:
        fams[it['family']] = fams.get(it['family'], 0) + 1
    print('families', dict(sorted(fams.items(), key=lambda kv: -kv[1])))


# main() 在文件末尾调用（鸟/鱼的规格函数定义在下面）
# ---------------------------------------------------------------- 鸟 / 鱼（v3）
BIRD_SIZE = [
    ('ostrich', 2.2), ('emu', 1.8), ('cassowary', 1.6), ('rhea', 1.4), ('kiwi', 0.45),
    ('swan', 1.35), ('flamingo', 1.3), ('pelican', 1.25), ('crane', 1.2), ('adjutant', 1.3),
    ('marabou', 1.3), ('stork', 1.05), ('heron', 0.95), ('egret', 0.85), ('condor', 1.1),
    ('vulture', 0.95), ('albatross', 0.9), ('eagle', 0.88), ('bustard', 0.95), ('peacock', 0.95),
    ('turkey', 0.85), ('goose', 0.8), ('gannet', 0.9), ('cormorant', 0.8), ('darter', 0.85),
    ('ibis', 0.68), ('spoonbill', 0.8), ('bittern', 0.7), ('hornbill', 0.7), ('raven', 0.6),
    ('macaw', 0.8), ('buzzard', 0.55), ('skua', 0.55), ('kite', 0.6), ('osprey', 0.6),
    ('curlew', 0.52), ('godwit', 0.4), ('gull', 0.5), ('duck', 0.48), ('loon', 0.7),
    ('grebe', 0.45), ('pheasant', 0.75), ('chicken', 0.4), ('toucan', 0.48), ('cockatoo', 0.4),
    ('oystercatcher', 0.42), ('pigeon', 0.32), ('dove', 0.3), ('crow', 0.44), ('magpie', 0.44),
    ('jay', 0.3), ('owl', 0.34), ('parrot', 0.3), ('parakeet', 0.26), ('cockatiel', 0.3),
    ('conure', 0.25), ('budgerigar', 0.18), ('coot', 0.37), ('moorhen', 0.32), ('rail', 0.26),
    ('avocet', 0.38), ('puffin', 0.3), ('auk', 0.28), ('guillemot', 0.42), ('tern', 0.35),
    ('kestrel', 0.33), ('falcon', 0.4), ('hawk', 0.48), ('harrier', 0.5), ('grouse', 0.4),
    ('ptarmigan', 0.34), ('partridge', 0.3), ('quail', 0.18), ('corncrake', 0.24), ('snipe', 0.27),
    ('woodcock', 0.32), ('sandpiper', 0.22), ('redshank', 0.28), ('dunlin', 0.2), ('turnstone', 0.22),
    ('plover', 0.24), ('phalarope', 0.2), ('pratincole', 0.24), ('woodpecker', 0.25), ('kingfisher', 0.24),
    ('hoopoe', 0.27), ('bee-eater', 0.24), ('roller', 0.3), ('barbet', 0.2), ('jacamar', 0.2),
    ('motmot', 0.34), ('puffbird', 0.2), ('trogon', 0.3), ('quetzal', 0.36), ('hornbill', 0.7),
    ('cardinal', 0.21), ('grosbeak', 0.2), ('crossbill', 0.17), ('bullfinch', 0.16), ('chaffinch', 0.15),
    ('goldfinch', 0.13), ('siskin', 0.12), ('greenfinch', 0.15), ('linnet', 0.13), ('redpoll', 0.12),
    ('starling', 0.21), ('blackbird', 0.25), ('thrush', 0.22), ('redwing', 0.21), ('fieldfare', 0.25),
    ('robin', 0.14), ('redstart', 0.13), ('nightingale', 0.16), ('bluethroat', 0.14), ('wheatear', 0.15),
    ('warbler', 0.12), ('chiffchaff', 0.11), ('blackcap', 0.14), ('whitethroat', 0.14), ('wren', 0.1),
    ('nuthatch', 0.13), ('treecreeper', 0.12), ('tit', 0.12), ('long-tailed-tit', 0.14),
    ('sparrow', 0.15), ('bunting', 0.16), ('lark', 0.16), ('pipit', 0.16), ('wagtail', 0.18),
    ('dipper', 0.18), ('shrike', 0.25), ('oriole', 0.22), ('brambling', 0.16), ('serin', 0.12),
    ('swift', 0.16), ('swallow', 0.17), ('martin', 0.15), ('hummingbird', 0.09), ('sunbird', 0.12),
    ('bird-of-paradise', 0.3), ('bowerbird', 0.28), ('bellbird', 0.25), ('cotinga', 0.22),
]
BIRD_SHAPE = [
    ('penguin', 'waterfowl'), ('ostrich', 'wader'), ('emu', 'wader'), ('cassowary', 'wader'),
    ('stork', 'wader'), ('heron', 'wader'), ('egret', 'wader'), ('crane', 'wader'),
    ('flamingo', 'wader'), ('ibis', 'wader'), ('spoonbill', 'wader'), ('bittern', 'wader'),
    ('avocet', 'wader'), ('curlew', 'wader'), ('godwit', 'wader'), ('snipe', 'wader'),
    ('sandpiper', 'wader'), ('redshank', 'wader'), ('plover', 'wader'), ('oystercatcher', 'wader'),
    ('duck', 'waterfowl'), ('goose', 'waterfowl'), ('swan', 'waterfowl'), ('pelican', 'waterfowl'),
    ('cormorant', 'waterfowl'), ('coot', 'waterfowl'), ('moorhen', 'waterfowl'), ('puffin', 'waterfowl'),
    ('auk', 'waterfowl'), ('guillemot', 'waterfowl'), ('gull', 'waterfowl'), ('loon', 'waterfowl'),
    ('eagle', 'raptor'), ('hawk', 'raptor'), ('falcon', 'raptor'), ('kite', 'raptor'),
    ('buzzard', 'raptor'), ('harrier', 'raptor'), ('osprey', 'raptor'), ('vulture', 'raptor'),
    ('condor', 'raptor'), ('kestrel', 'raptor'), ('shrike', 'raptor'),
    ('owl', 'owl'),
    ('parrot', 'parrot'), ('macaw', 'parrot'), ('cockatoo', 'parrot'), ('conure', 'parrot'),
    ('budgerigar', 'parrot'), ('cockatiel', 'parrot'), ('parakeet', 'parrot'), ('lorikeet', 'parrot'),
    ('swift', 'swift'), ('swallow', 'swift'), ('martin', 'swift'), ('tern', 'swift'),
    ('albatross', 'swift'), ('petrel', 'swift'), ('shearwater', 'swift'),
]
BEAK_BY = [
    ('crossbill', 'crossed'), ('hummingbird', 'tiny'), ('sunbird', 'long'), ('swift', 'tiny'),
    ('swallow', 'tiny'),
    ('parrot', 'hooked'), ('macaw', 'hooked'), ('cockatoo', 'hooked'), ('cockatiel', 'hooked'),
    ('eagle', 'hooked'), ('hawk', 'hooked'), ('falcon', 'hooked'), ('kite', 'hooked'),
    ('vulture', 'hooked'), ('condor', 'hooked'), ('owl', 'hooked'), ('shrike', 'hooked'),
    ('stork', 'long'), ('heron', 'long'), ('egret', 'long'), ('crane', 'long'), ('kingfisher', 'long'),
    ('hornbill', 'long'), ('toucan', 'long'), ('ibis', 'long'), ('curlew', 'long'), ('godwit', 'long'),
    ('woodpecker', 'long'), ('hoopoe', 'long'), ('bee-eater', 'long'), ('jacamar', 'long'),
    ('duck', 'flat'), ('goose', 'flat'), ('swan', 'flat'), ('pelican', 'flat'), ('spoonbill', 'flat'),
    ('puffin', 'flat'),
]
COLOR_WORDS = [
    ('azure', 'wall_blue'), ('blue', 'fabric_blue'), ('emerald', 'leaf_light'), ('green', 'leaf'),
    ('olive', 'leaf_dark'), ('scarlet', 'fabric_red'), ('crimson', 'fabric_red'), ('red', 'fabric_red'),
    ('orange', 'terracotta'), ('gold', 'gold'), ('yellow', 'gold'), ('silver', 'wall_ash'),
    ('grey', 'wall_ash'), ('gray', 'wall_ash'), ('slate', 'roof_slate'), ('chestnut', 'wood_mid'),
    ('rufous', 'terracotta'), ('tawny', 'wood_mid'), ('brown', 'wood_mid'), ('copper', 'terracotta'),
    ('purple', 'wall_pink'), ('violet', 'wall_pink'), ('pink', 'wall_pink'), ('rose', 'wall_pink'),
    ('black', 'ink'), ('dusky', 'wood_dark'), ('ruddy', 'brick'), ('white', 'snow'), ('snow', 'snow'),
]


def _lookup(table, name, default):
    for k, v in table:
        if k in name:
            return v
    return default


def _color(name, default='wood_mid'):
    for k, v in COLOR_WORDS:
        if k in name:
            return v
    return default


def bird_specs():
    out = []
    for n in NAMES.get('birds', []):
        if n.startswith('contact'):
            continue
        L = _lookup(BIRD_SIZE, n, 0.28)
        shape = _lookup(BIRD_SHAPE, n, 'songbird')
        beak = _lookup(BEAK_BY, n, 'short')
        if 'long-tailed' in n or 'quetzal' in n or 'bird-of-paradise' in n or 'magpie' in n:
            tail_len, tail_f, spread = 0.55, 9, 0.5
        elif 'peacock' in n or 'turkey' in n or 'grouse' in n or 'bustard' in n:
            tail_len, tail_f, spread = 0.42, 13, 1.4
        elif 'penguin' in n or 'duck' in n or 'puffin' in n:
            tail_len, tail_f, spread = 0.16, 5, 0.4
        else:
            tail_len, tail_f, spread = 0.32, 7, 0.55
        leg = {'wader': 0.34, 'waterfowl': 0.10, 'raptor': 0.17, 'parrot': 0.14,
               'swift': 0.07, 'owl': 0.10, 'songbird': 0.15}.get(shape, 0.15)
        neck = 0.20 if shape == 'wader' else (0.10 if 'swan' in n or 'flamingo' in n else 0.0)
        wing = {'swift': 0.62, 'raptor': 0.55, 'wader': 0.52, 'waterfowl': 0.42,
                'owl': 0.44, 'parrot': 0.38}.get(shape, 0.46)
        top = _color(n, 'wood_mid')
        belly = 'snow' if ('white' in n or 'egret' in n or 'swan' in n) else 'wall_cream'
        out.append(dict(
            id=f'bird_{n}', cat='bird', family='bird', name=n,
            len=round(L, 3), r=round(L * (0.20 if shape in ('swift',) else 0.24), 3),
            shape=shape, beak_type=beak, neck=neck, leg=leg, wing_len=wing,
            tail_len=tail_len, tail_feathers=tail_f, tail_spread=spread,
            feathers=11 if shape == 'raptor' else (7 if L < 0.16 else 9),
            top=top, belly=belly, wing=_color(n, top), beak='gold' if beak != 'hooked' else 'metal_dark',
            accent=_color(n, 'fabric_red'), crest=bool(re.search(r'tit|hoopoe|cockatoo|jay|cardinal|waxwing|quail|crane', n)),
            eye='ink',
        ))
    return out


FISH_LEN = [
    ('whale-shark', 6.0), ('basking-shark', 5.0), ('marlin', 3.4), ('swordfish', 2.8),
    ('sturgeon', 2.4), ('tuna', 2.2), ('shark', 2.0), ('ray', 1.2), ('halibut', 1.6),
    ('sawfish', 2.2), ('tarpon', 1.6), ('arapaima', 1.8), ('eel', 0.85), ('catfish', 0.8),
    ('pike', 0.85), ('salmon', 0.75), ('trout', 0.45), ('carp', 0.5), ('koi', 0.55),
    ('cod', 0.8), ('grouper', 0.9), ('snapper', 0.5), ('bass', 0.45), ('perch', 0.3),
    ('bream', 0.4), ('mullet', 0.4), ('herring', 0.3), ('sardine', 0.2), ('anchovy', 0.15),
    ('flounder', 0.45), ('sole', 0.4), ('turbot', 0.6), ('discus', 0.2), ('angelfish', 0.15),
    ('clownfish', 0.11), ('guppy', 0.05), ('gourami', 0.12), ('betta', 0.07), ('goldfish', 0.15),
    ('bitterling', 0.06), ('gudgeon', 0.12), ('dace', 0.2), ('chub', 0.4), ('minnow', 0.08),
    ('anglerfish', 0.35), ('blobfish', 0.4), ('fangtooth', 0.15), ('hatchetfish', 0.1),
    ('gulper', 0.6), ('seahorse', 0.15), ('puffer', 0.3), ('sunfish', 1.8), ('butterflyfish', 0.2),
    ('damselfish', 0.1), ('wrasse', 0.25), ('parrotfish', 0.5), ('surgeonfish', 0.3),
    ('moray', 1.0), ('conger', 1.2), ('loach', 0.2), ('corydoras', 0.07), ('pleco', 0.3),
    ('arowana', 0.8), ('knifefish', 0.6), ('electric-eel', 1.6), ('coelacanth', 1.5),
    ('hammerhead', 3.0), ('stingray', 1.0), ('skate', 0.8), ('gar', 1.0), ('bowfin', 0.6),
]


def fish_specs():
    out = []
    for n in NAMES.get('fish', []):
        if n.startswith('contact'):
            continue
        L = _lookup(FISH_LEN, n, 0.3)
        if 'eel' in n or 'loach' in n or 'hairtail' in n or 'lamprey' in n:
            shape = 'eel'
        elif 'flounder' in n or 'sole' in n or 'turbot' in n or 'ray' in n or 'skate' in n:
            shape = 'flat'
        elif 'discus' in n or 'angelfish' in n or 'sunfish' in n or 'butterflyfish' in n or 'hatchetfish' in n:
            shape = 'deep'
        elif 'angler' in n or 'blobfish' in n or 'grouper' in n or 'fangtooth' in n or 'gulper' in n or 'catfish' in n:
            shape = 'angler'
        else:
            shape = 'torpedo'
        hgt = L * {'torpedo': 0.30, 'deep': 0.85, 'eel': 0.10, 'flat': 0.62, 'angler': 0.50}[shape]
        wid = L * {'torpedo': 0.13, 'deep': 0.10, 'eel': 0.07, 'flat': 0.05, 'angler': 0.20}[shape]
        top = _color(n, 'metal')
        if top == 'metal' and ('carp' in n or 'goldfish' in n or 'koi' in n):
            top = 'gold'
        out.append(dict(
            id=f'fish_{n}', cat='fish', family='fish', name=n,
            len=round(L, 3), hgt=round(hgt, 3), wid=round(wid, 3), shape=shape,
            top=top, belly='snow' if L < 0.3 else 'wall_ash',
            fin=_color(n, 'fabric_red' if 'goldfish' in n or 'koi' in n else 'roof_red'),
            fork=0.45 if shape in ('torpedo', 'eel') else 0.1,
            dorsal=0.26 if shape != 'eel' else 0.12,
            anal=0.20 if shape != 'eel' else 0.10,
            eye_r=0.13 if shape == 'angler' else 0.10,
            scale_rows=6 if L > 0.2 else 4,
            stripes=3 if re.search(r'clown|tiger|zebra|banded|striped|barred', n) else 0,
            spots=7 if re.search(r'spotted|speckled|dotted', n) else 0,
            whiskers=bool(re.search(r'catfish|sturgeon|barbel|loach|carp', n)),
            eye='white',
        ))
    return out


if __name__ == '__main__':
    main()

