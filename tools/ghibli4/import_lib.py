"""把模型库（public/models 的 150 件、public/models2 的 2575 件）里能用的模型，转成和房屋套件同一种格式。

  blender -b --factory-startup --python tools/ghibli4/import_lib.py -- --lib "D:/DSH DEMO/deepseek-world/public" [--out public/models4] [--only id,id] [--sheet shots/library/lib.jpg]

为什么要转：库里的模型是 Principled 纯色材质（发灰的粉彩），直接摆进来和画出来的世界是两种画法。转过之后——
  · 每个面按材质名记成部件（墙 / 瓦 / 木 / 石 / 玻璃 / 布 / 叶 / 灯 / 原色），到了游戏里走套件那一个着色器：
    瓦有行、木有纹、石有缝、玻璃夜里亮、吃这座城的光和天气，轮廓线也是同一种描法；
  · 颜色换成套件那一套颜料（库里的平均饱和度只有 0.32）；
  · 顶点色里烘进檐下和墙根的影子；
  · 面数太高的减面（models2 的房子两万到五万面一栋，鸟一万面一只），同形换色的只留一份（颜色在游戏里按每一件调）。

选哪些、不选哪些，见 select()。产物：lib.glb + lib.json（和 kit.json 同样的字段，多了 cat / fam / tint / lib）。
"""
import json
import math
import os
import struct
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kitlib  # noqa: E402
from kitlib import PART, lin  # noqa: E402


def arg(name, default=None):
    if '--' in sys.argv:
        a = sys.argv[sys.argv.index('--') + 1:]
        if name in a:
            return a[a.index(name) + 1]
    return default


ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
LIB = arg('--lib', os.path.join(ROOT, 'public'))
OUT = os.path.join(ROOT, arg('--out', 'public/models4'))
ONLY = set(arg('--only', '').split(',')) - {''}

# ---------------------------------------------------------------------------------------------- 颜料（sRGB）
PAINT = {
    'metal_dark': (0.2, 0.21, 0.25), 'ink': (0.16, 0.15, 0.17), 'metal': (0.56, 0.6, 0.64), 'gold': (0.86, 0.66, 0.26),
    'fabric_cream': (0.96, 0.92, 0.82), 'fabric_red': (0.82, 0.27, 0.22), 'fabric_blue': (0.3, 0.5, 0.78), 'fabric_green': (0.33, 0.58, 0.36),
    'white': (0.97, 0.95, 0.9), 'snow': (1.0, 1.0, 1.0), 'water': (0.42, 0.68, 0.8), 'soil': (0.38, 0.27, 0.18), 'terracotta': (0.78, 0.44, 0.28),
    'wall_cream': (0.95, 0.9, 0.78), 'wall_butter': (0.96, 0.87, 0.62), 'wall_pink': (0.93, 0.74, 0.68), 'wall_sage': (0.72, 0.82, 0.66),
    'wall_blue': (0.68, 0.8, 0.88), 'wall_ash': (0.86, 0.84, 0.8),
    'roof_red': (0.74, 0.3, 0.2), 'roof_teal': (0.2, 0.46, 0.44), 'roof_grey': (0.36, 0.4, 0.46), 'roof_blue': (0.24, 0.4, 0.64),
    'roof_straw': (0.82, 0.68, 0.36), 'roof_slate': (0.28, 0.33, 0.4),
    'brick': (0.7, 0.4, 0.3), 'leaf': (0.2, 0.46, 0.17), 'leaf_light': (0.36, 0.6, 0.2), 'leaf_dark': (0.12, 0.34, 0.16),
    'wood_light': (0.7, 0.55, 0.38), 'wood_mid': (0.62, 0.46, 0.3), 'wood_dark': (0.33, 0.22, 0.15), 'wood_gap': (0.24, 0.16, 0.11),
    'stone': (0.66, 0.63, 0.56), 'stone_warm': (0.74, 0.69, 0.58), 'stone_dark': (0.56, 0.55, 0.52),
    'glass': (1.0, 1.0, 1.0), 'glass_warm': (1.0, 1.0, 1.0), 'glow': (1.0, 0.82, 0.5),
}
for short in ('red', 'teal', 'grey', 'blue', 'straw', 'slate'):
    PAINT[short] = PAINT['roof_' + short]
# 鸟和鱼：羽毛、鳞不是木头
CREATURE = dict(PAINT, wood_light=(0.8, 0.62, 0.42), wood_mid=(0.6, 0.42, 0.28), wood_dark=(0.34, 0.24, 0.18), stone=(0.7, 0.72, 0.76),
                stone_dark=(0.4, 0.42, 0.48), stone_warm=(0.86, 0.8, 0.68), metal=(0.62, 0.68, 0.76), glow=(1.0, 0.95, 0.8))
WHITE = (1.0, 1.0, 1.0)


def part_of(name, mode, primary_wall):
    """材质名 → (部件, 颜色 sRGB)。mode: building（墙瓦布跟每栋自己的颜色走）/ prop（带着自己的颜色）/ creature。"""
    if mode == 'creature':
        if name.startswith('glass'):
            return 'plain', (0.08, 0.08, 0.1)
        return 'plain', CREATURE.get(name, (0.7, 0.7, 0.7))
    c = PAINT.get(name, (0.7, 0.7, 0.7))
    if name.startswith('wall_'):
        if mode == 'building':
            return 'wall', WHITE if name == primary_wall else (0.86, 0.84, 0.82)
        return 'wall', c
    if name.startswith('roof_') or name in ('red', 'teal', 'grey', 'blue', 'straw', 'slate'):
        return 'roof', WHITE if mode == 'building' else c
    if name.startswith('wood_'):
        return 'wood', c
    if name.startswith('stone') or name == 'brick':
        return 'stone', c
    if name.startswith('glass'):
        return 'glass', WHITE
    if name == 'glow':
        return 'lamp', c
    if name.startswith('leaf'):
        return 'leaf', c
    if name in ('fabric_red', 'fabric_green', 'fabric_blue') and mode == 'building':
        return 'cloth', WHITE
    return 'plain', c


# ---------------------------------------------------------------------------------------------- 选哪些
REBUILT = '精度不够（方盒子的船、两个圆片的自行车）：在 tools/ghibli4/life_kit.py 里重建了'
V1_SKIP = {
    'veh_bus': REBUILT, 'veh_fishing_boat': REBUILT, 'veh_sailboat': REBUILT, 'veh_rowboat': REBUILT, 'veh_pier': REBUILT, 'veh_bicycle': REBUILT,
    'bridge_arch': '跨度 12 m，河宽 14 m 以上，而且模型的桥面走不了人（地形碰撞是另一回事）：桥还用游戏里顺着路生成的那几座',
    'bridge_flat': '同上',
    'misc_eave_awning': '是房子上的一个零件，单摆不成物', 'misc_chimney': '同上', 'misc_skylight': '同上',
}
V1_SHOPS = ['shop_bakery', 'shop_fish', 'shop_flower', 'shop_tea', 'shop_inn', 'shop_pub', 'shop_book', 'shop_noodle']
M2_SKIP_CAT = {
    'road': '一块块的铺地砖：地面是着色器画的，再铺模型砖会两层打架',
    'house': None, 'shop': None, 'furniture': None,  # 另算
}
M2_SKIP_ID = {'veh_airliner': '一根圆柱加两片翼，精度不够，而且地图上没有机场', 'bush_00': '一团球的树，不如游戏里会长的那种树'}


def select():
    out, skipped = [], []
    d1 = json.load(open(os.path.join(LIB, 'models/_manifest.json'), encoding='utf8'))['items']
    for it in d1:
        cat = it['cat']
        if it['id'] in V1_SKIP:
            skipped.append((it['id'], V1_SKIP[it['id']]))
            continue
        if cat == 'shop' and it['id'] not in V1_SHOPS:
            skipped.append((it['id'], '二十家店是同一个壳子换招牌：留八家'))
            continue
        mode = 'building' if cat in ('house', 'shop') else 'prop'
        out.append({'id': it['id'], 'glb': it['glb'], 'cat': cat, 'fam': cat, 'mode': mode, 'src': 'models'})
    d2 = json.load(open(os.path.join(LIB, 'models2/_manifest.json'), encoding='utf8'))['items']
    groups = {}
    for it in d2:
        groups.setdefault((it['cat'], it['family'], it['tris'], it['verts']), []).append(it)
    for (cat, fam, tris, verts), its in groups.items():
        if cat in ('house', 'shop'):
            continue
        if cat == 'road':
            skipped.append((its[0]['id'], M2_SKIP_CAT['road']))
            continue
        if cat == 'transport':
            skipped.append((its[0]['id'], '二百件"交通工具"只有三个造型（方盒子车、一根圆柱的飞机、一个盒子的船），精度不够：车和船在 lm_kit.py 里重建'))
            continue
        if cat in ('bird', 'fish'):
            skipped.append((its[0]['id'], '三百只鸟是同一个横着的棕色身子换嘴、一百二十条鱼是同一条灰鱼：在 life_kit.py 里重建了十二种鸟和鱼摊'))
            continue
        if fam == 'tree':
            skipped.append((its[0]['id'], '一团球的树，不如游戏里会长的那种树'))
            continue
        # 同一个网格、不同大小：留最小、最大（差得多的话）
        its = sorted(its, key=lambda i: i['size'][0] * i['size'][1] * i['size'][2])
        keep = [its[0]]
        if len(its) > 1:
            a, b = its[0]['size'], its[-1]['size']
            if max(abs(b[k] - a[k]) / max(a[k], 0.05) for k in range(3)) > 0.18:
                keep.append(its[-1])
        mode = 'creature' if cat in ('bird', 'fish') else 'prop'
        for it in keep:
            if any(o['id'] == it['id'] for o in out):
                it = dict(it, id=it['id'] + '_2')
            out.append({'id': it['id'], 'glb': it['glb'], 'cat': cat, 'fam': fam, 'mode': mode, 'src': 'models2', 'same': len(its)})
    # models2 的房子和店：三百栋、一百六十家都是"山墙盒子 + 铺面"一个配方，挑轮廓差得开的
    for cat, n in (('house', 12), ('shop', 12)):
        its = sorted([i for i in d2 if i['cat'] == cat], key=lambda i: i['id'])
        step = len(its) / n
        for k in range(n):
            it = its[int(k * step)]
            if any(o['id'] == it['id'] for o in out):
                it = dict(it, id=it['id'] + '_2')
            out.append({'id': it['id'], 'glb': it['glb'], 'cat': cat, 'fam': cat, 'mode': 'building', 'src': 'models2'})
    return out, skipped


def PACK(e):
    return 'lib-bld.glb' if e['mode'] == 'building' else 'lib-fur.glb' if e['cat'] == 'furniture' else 'lib.glb'


BUDGET = {'building': 6500, 'bird': 1500, 'fish': 900, 'prop': 3600}


# ---------------------------------------------------------------------------------------------- 读一件
def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def load(entry):
    """→ Kit（faces 已经按部件和颜料填好）。"""
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(LIB, entry['glb']))
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bm = bmesh.new()
    names = []
    for ob in obs:
        me = ob.data
        base = len(names)
        names.extend((m.name.split('.')[0][2:] if m and m.name.startswith('G_') else (m.name if m else 'white')) for m in (me.materials or [None]))
        tmp = bmesh.new()
        tmp.from_mesh(me)
        tmp.transform(ob.matrix_world)
        for f in tmp.faces:
            f.material_index += base
        tmp_me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(tmp_me)
        tmp.free()
        bm.from_mesh(tmp_me)
        bpy.data.meshes.remove(tmp_me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    budget = BUDGET.get(entry['cat'], BUDGET[entry['mode']] if entry['mode'] in BUDGET else BUDGET['prop'])
    me = bpy.data.meshes.new('joined')
    bm.to_mesh(me)
    bm.free()
    for n in names:
        me.materials.append(bpy.data.materials.get('G_' + n) or bpy.data.materials.new('G_' + n))
    if tris > budget:
        ob = bpy.data.objects.new('joined', me)
        bpy.context.scene.collection.objects.link(ob)
        mod = ob.modifiers.new('dec', 'DECIMATE')
        mod.ratio = budget / tris
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    # 主墙色：面积最大的那种墙
    area = {}
    for p in me.polygons:
        n = names[p.material_index] if p.material_index < len(names) else 'white'
        if n.startswith('wall_'):
            area[n] = area.get(n, 0.0) + p.area
    primary = max(area, key=area.get) if area else None
    k = kitlib.Kit(seed=1)
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for p in me.polygons:
        if p.area < 1e-7:
            continue
        n = names[p.material_index] if p.material_index < len(names) else 'white'
        part, col = part_of(n, entry['mode'], primary)
        pts = [me.vertices[v].co.copy() for v in p.vertices]
        wid = 0.0
        if part == 'glass':
            c = p.center
            wid = 1.0 + (round(c.x / 0.9) * 7 + round(c.y / 0.9) * 13 + round(c.z / 1.4) * 29) % 97
        k.faces.append((pts, p.normal.copy(), PART[part], lin(col), wid))
        for q in pts:
            for i in range(3):
                lo[i] = min(lo[i], q[i])
                hi[i] = max(hi[i], q[i])
    if entry['mode'] == 'building':
        # 坡地上不露底：沿着墙脚往下埋一圈石基
        base = [q for pts, *_ in k.faces for q in pts if q.z < 0.35]
        if base:
            x0, x1 = min(q.x for q in base), max(q.x for q in base)
            y0, y1 = min(q.y for q in base), max(q.y for q in base)
            k.walls((x0, x1, y0, y1), -1.2, 0.02, part='stone', col=kitlib.C['stone2'])
    return k, lo, hi, tris


def shape_of(lo, hi):
    w, d, h = hi.x - lo.x, hi.y - lo.y, hi.z
    if h > 11.0:
        return 'tall'
    if w > 11.5:
        return 'long'
    if h < 7.4:
        return 'cottage'
    return 'house'


# ---------------------------------------------------------------------------------------------- 写 GLB（带索引）
def write_glb(path, meshes):
    """meshes: [(name, corners)]。Blender (x, y, z) → glTF (x, z, -y)。相同的顶点并成一个、带索引。"""
    blob = bytearray()
    views, accessors, gmeshes, nodes = [], [], [], []

    def add(arr, comp, kind, normalized=False, minmax=False, target=34962, stride=None):
        nonlocal blob
        while len(blob) % 4:
            blob += b'\0'
        v = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': arr.nbytes, 'target': target}
        if stride:
            v['byteStride'] = stride
        views.append(v)
        blob += arr.tobytes()
        acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': kind}
        if normalized:
            acc['normalized'] = True
        if minmax:
            acc['min'], acc['max'] = arr.min(axis=0).tolist(), arr.max(axis=0).tolist()
        accessors.append(acc)
        return len(accessors) - 1

    for name, corners in meshes:
        n = len(corners)
        pos = np.array([(p.x, p.z, -p.y) for p, *_ in corners], dtype=np.float32)
        nor = np.zeros((n, 4), dtype=np.int8)
        nor[:, :3] = np.round(np.array([(c[1].x, c[1].z, -c[1].y) for c in corners]) * 127)
        col = np.full((n, 4), 255, dtype=np.uint8)
        col[:, :3] = np.round(np.clip(np.array([c[2] for c in corners]), 0, 1) * 255)
        uv = np.array([c[3] for c in corners], dtype=np.float32)
        uv[:, 1] = -uv[:, 1]
        aux = np.zeros((n, 4), dtype=np.uint8)
        aux[:, 0] = [c[4] * 16 for c in corners]
        aux[:, 1] = [int((c[5] * 0.618034) % 1.0 * 255) if c[5] else 0 for c in corners]
        rec = np.concatenate([np.round(pos * 2000).astype(np.int64), nor.astype(np.int64), col.astype(np.int64), np.round(uv * 500).astype(np.int64), aux.astype(np.int64)], axis=1)
        _, first, inverse = np.unique(rec, axis=0, return_index=True, return_inverse=True)
        pos, nor, col, uv, aux = pos[first], nor[first], col[first], uv[first], aux[first]
        index = inverse.reshape(-1).astype(np.uint32 if len(first) > 65535 else np.uint16)
        attrs = {'POSITION': add(pos, 5126, 'VEC3', minmax=True), 'NORMAL': add(nor, 5120, 'VEC3', normalized=True, stride=4),
                 'COLOR_0': add(col, 5121, 'VEC4', normalized=True), 'TEXCOORD_0': add(uv, 5126, 'VEC2'), 'TEXCOORD_1': add(aux, 5121, 'VEC2', normalized=True, stride=4)}
        ia = add(index, 5125 if index.dtype == np.uint32 else 5123, 'SCALAR', target=34963)
        gmeshes.append({'name': name, 'primitives': [{'attributes': attrs, 'indices': ia, 'mode': 4}]})
        nodes.append({'name': name, 'mesh': len(gmeshes) - 1})
    g = {'asset': {'version': '2.0', 'generator': 'deepseek-world tools/ghibli4/import_lib (Blender %s)' % bpy.app.version_string},
         'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
         'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': gmeshes, 'accessors': accessors, 'bufferViews': views,
         'buffers': [{'byteLength': len(blob)}]}
    js = json.dumps(g, separators=(',', ':')).encode('utf-8')
    js += b' ' * (-len(js) % 4)
    blob += b'\0' * (-len(blob) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(blob), b'BIN\0') + bytes(blob))


# ---------------------------------------------------------------------------------------------- 主流程
if __name__ == '__main__':
    entries, skipped = select()
    if ONLY:
        entries = [e for e in entries if e['id'] in ONLY]
    meshes, manifest = [], []
    for n, e in enumerate(entries):
        try:
            k, lo, hi, src_tris = load(e)
            corners = k.bake()
        except Exception as err:  # noqa: BLE001
            skipped.append((e['id'], '读不进来：%s' % err))
            continue
        if not corners:
            skipped.append((e['id'], '空网格'))
            continue
        item = {'id': e['id'], 'pack': PACK(e), 'cat': e['cat'], 'fam': e['fam'], 'src': e['src'], 'lib': True,
                'w': round(hi.x - lo.x, 2), 'd': round(hi.y - lo.y, 2), 'h': round(hi.z, 2), 'tris': len(corners) // 3, 'src_tris': src_tris,
                'bounds': [round(lo.x, 2), round(hi.x, 2), round(lo.y, 2), round(hi.y, 2)]}
        if e['mode'] == 'building':
            item.update(shape=shape_of(lo, hi), style='euro', tint='inst', front=round(-lo.y, 2))
        else:
            item.update(shape=e['cat'], style='lib', tint='self')
        if e.get('same', 1) > 1:
            item['same'] = e['same']
        meshes.append((e['id'], corners))
        manifest.append(item)
        if n % 20 == 0:
            print('IMPORT', n, '/', len(entries), e['id'], src_tris, '→', item['tris'], flush=True)
    os.makedirs(OUT, exist_ok=True)
    suffix = '-part' if ONLY else ''
    for pack in sorted({m['pack'] for m in manifest}):
        names = {m['id'] for m in manifest if m['pack'] == pack}
        path = os.path.join(OUT, pack.replace('.glb', suffix + '.glb'))
        write_glb(path, [m for m in meshes if m[0] in names])
        print('PACK', pack, round(os.path.getsize(path) / 1048576, 2), 'MB', len(names), 'models', sum(m['tris'] for m in manifest if m['pack'] == pack), 'tris')
    with open(os.path.join(OUT, 'lib%s.json' % suffix), 'w', encoding='utf-8') as f:
        json.dump({'style': '模型库转过来的（tools/ghibli4/import_lib.py）', 'parts': PART, 'total_tris': sum(m['tris'] for m in manifest),
                   'items': manifest, 'skipped': [{'id': i, 'why': w} for i, w in skipped]}, f, ensure_ascii=False, indent=1)
    print('WROTE', len(manifest), 'models,', sum(m['tris'] for m in manifest), 'tris; skipped', len(skipped))
