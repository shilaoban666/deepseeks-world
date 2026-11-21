"""把 models2 的建筑"重画"一遍：配色、手绘笔触贴图、檐下的影子。原文件不动，结果写到新目录。

  blender -b --factory-startup --python tools/ghibli3/repaint.py -- --listfile paths.txt --out public/models3

原来的模型为什么不好看（tools/ghibli3/qa_sheet.py 渲出来就能看到）：
  1. 颜色发白。调色板（tools/ghibli/lib.py 的 P）是按 sRGB 写的，却原样填进了 Principled 的 Base Color——
     那里要的是线性值。0.69 的红当成线性值，显示出来是 0.85：所有颜色都被冲淡了一截。
  2. 没有贴图，也没有顶点色：每个面是一个纯色，没有笔触，没有脏，没有明暗过渡。
  3. 没有"画出来的影子"：吉卜力的房子，屋檐底下、窗台底下、墙根都压着一层偏蓝紫的影子。

这里做三件事：
  · 换色：每种材质换成按颜料调的颜色（下面的 PAINT，sRGB 写、线性存）。
  · 贴图：游戏自己那套手绘 albedo（public/textures/albedo）只借它的笔触和花纹——除以它的平均色、
    再乘上这里的颜色，烘成一张张小图，放在 <out>/tex/ 里，所有模型共用（GLB 里只写相对路径，不内嵌）。
    UV 按世界坐标三平面展开，一米就是一米，墙和墙、屋顶和屋顶的笔触一样大。
  · 影子：从每个顶点往上打几条射线，被挡住的就是檐下；连同墙根、大片的深浅斑，一起写进顶点色（COLOR_0）。
    墙面先横着切几刀，影子才有地方过渡。
"""
import bpy
import bmesh
import json
import math
import os
import random
import struct
import sys
import numpy as np
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree


def arg(name, default=None):
    if '--' in sys.argv:
        a = sys.argv[sys.argv.index('--') + 1:]
        if name in a:
            return a[a.index(name) + 1]
    return default


HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.abspath(arg('--out', os.path.join(ROOT, 'public', 'models3')))
ALBEDO = os.path.abspath(arg('--albedo', os.path.join(ROOT, 'public', 'textures', 'albedo')))
PATHS = [l.strip() for l in open(arg('--listfile'), encoding='utf-8') if l.strip()]
TEX = os.path.join(OUT, 'tex')
os.makedirs(TEX, exist_ok=True)

# ---- 颜料 ----------------------------------------------------------------------------------------------------
# 键是原模型的材质名去掉 G_。值：(sRGB 颜色, 笔触来源, 每米几个循环, 笔触强度, 粗糙度)。笔触来源 None = 平涂。
PAINT = {
    'wall_cream': ((0.96, 0.91, 0.78), 'wash', 0.22, 0.04, 0.95),
    'wall_butter': ((0.97, 0.88, 0.64), 'wash', 0.22, 0.04, 0.95),
    'wall_pink': ((0.94, 0.76, 0.66), 'wash', 0.22, 0.04, 0.95),
    'wall_sage': ((0.78, 0.85, 0.68), 'wash', 0.22, 0.04, 0.95),
    'wall_blue': ((0.72, 0.83, 0.89), 'wash', 0.22, 0.04, 0.95),
    'wall_ash': ((0.90, 0.87, 0.81), 'wash', 0.22, 0.04, 0.95),
    'white': ((0.97, 0.95, 0.90), 'wash', 0.22, 0.03, 0.95),
    'roof_red': ((0.82, 0.37, 0.20), 'wash', 0.4, 0.07, 0.9),
    'roof_teal': ((0.17, 0.47, 0.46), 'wash', 0.4, 0.07, 0.9),
    'roof_grey': ((0.41, 0.46, 0.51), 'wash', 0.4, 0.07, 0.9),
    'roof_blue': ((0.24, 0.40, 0.63), 'wash', 0.4, 0.07, 0.9),
    'roof_slate': ((0.31, 0.37, 0.44), 'wash', 0.4, 0.07, 0.9),
    'roof_straw': ((0.84, 0.69, 0.34), 'roof3', 0.45, 0.12, 1.0),
    'wood_dark': ((0.36, 0.23, 0.14), 'wood1', 0.7, 0.10, 0.9),
    'wood_mid': ((0.56, 0.37, 0.21), 'wood1', 0.7, 0.10, 0.9),
    'wood_light': ((0.76, 0.57, 0.35), 'wood1', 0.7, 0.10, 0.9),
    'wood_gap': ((0.27, 0.18, 0.12), None, 1, 0, 0.95),
    'stone': ((0.67, 0.65, 0.58), 'stone1', 0.45, 0.10, 0.95),
    'stone_warm': ((0.76, 0.69, 0.56), 'stone1', 0.45, 0.10, 0.95),
    'stone_dark': ((0.45, 0.45, 0.45), 'stone1', 0.45, 0.10, 0.95),
    'brick': ((0.72, 0.40, 0.27), 'wall3', 0.5, 0.10, 0.95),
    'terracotta': ((0.80, 0.44, 0.26), 'wash', 0.6, 0.035, 0.9),
    'soil': ((0.38, 0.27, 0.18), None, 1, 0, 1.0),
    'fabric_red': ((0.82, 0.27, 0.20), 'wash', 0.6, 0.035, 0.95),
    'fabric_cream': ((0.96, 0.91, 0.79), 'wash', 0.6, 0.035, 0.95),
    'fabric_green': ((0.33, 0.57, 0.35), 'wash', 0.6, 0.035, 0.95),
    'fabric_blue': ((0.27, 0.48, 0.72), 'wash', 0.6, 0.035, 0.95),
    'leaf': ((0.25, 0.52, 0.20), None, 1, 0, 0.9),
    'leaf_light': ((0.52, 0.70, 0.24), None, 1, 0, 0.9),
    # 窗：白天的窗是映着天的深蓝灰，不是一块奶黄
    'glass_warm': ((0.27, 0.38, 0.50), None, 1, 0, 0.25),
    'glass': ((0.27, 0.38, 0.50), None, 1, 0, 0.25),
    'metal': ((0.40, 0.42, 0.46), None, 1, 0, 0.6),
    'metal_dark': ((0.20, 0.22, 0.26), None, 1, 0, 0.6),
    'gold': ((0.88, 0.67, 0.20), None, 1, 0, 0.5),
    'ink': ((0.16, 0.14, 0.17), None, 1, 0, 0.9),
    'glow': ((1.0, 0.86, 0.52), None, 1, 0, 0.6),
    'water': ((0.28, 0.55, 0.72), None, 1, 0, 0.2),
}
# 哪些材质吃影子、切墙、带深浅斑
WALLS = {k for k in PAINT if k.startswith('wall_')} | {'white', 'brick', 'stone', 'stone_warm', 'stone_dark'}
MOTTLED = WALLS | {k for k in PAINT if k.startswith(('roof_', 'wood_', 'fabric_'))} | {'terracotta'}
# 影子的颜色：偏蓝紫，不是灰（乘在底色上）
SHADOW = np.array([0.56, 0.60, 0.82])


def to_linear(c):
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


# ---- 笔触贴图：借手绘 albedo 的花纹，颜色换成这里的 ----------------------------------------------------------
_detail = {}
_baked = {}


def wash(size=512, seed=7):
    """一层水彩的"晕"：大块的深浅、小一点的斑、顺着墙往下的几道水痕。可以无缝平铺，没有方向明显的花纹。"""
    rng = np.random.default_rng(seed)

    def layer(ny, nx):
        g = rng.random((ny, nx))
        out = []
        for n, axis in ((ny, 0), (nx, 1)):
            x = (np.arange(size) + 0.5) / size * n
            i = np.floor(x).astype(int)
            f = x - i
            out.append((i % n, (i + 1) % n, f * f * (3 - 2 * f)))
        (y0, y1, fy), (x0, x1, fx) = out
        top = g[y0][:, x0] * (1 - fx) + g[y0][:, x1] * fx
        bot = g[y1][:, x0] * (1 - fx) + g[y1][:, x1] * fx
        return top * (1 - fy)[:, None] + bot * fy[:, None]

    d = 0.5 * layer(4, 4) + 0.3 * layer(9, 9) + 0.14 * layer(26, 26) + 0.22 * layer(3, 42)
    d = d - d.mean()
    return (d / d.std())[:, :, None] * np.ones(3)


def detail_of(source):
    """手绘 albedo 相对它自己平均色的偏差（1 = 平均），明暗为主、留三成色相；归一到标准差 1。"""
    if source == 'wash' and source not in _detail:
        _detail[source] = (wash(), 512, 512)
    if source not in _detail:
        img = bpy.data.images.load(os.path.join(ALBEDO, source + '.png'))
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        rgb = px.reshape(h, w, 4)[:, :, :3].astype(np.float64)
        bpy.data.images.remove(img)
        mean = rgb.reshape(-1, 3).mean(axis=0)
        d = rgb / np.maximum(mean, 0.04)
        lum = (d * np.array([0.299, 0.587, 0.114])).sum(axis=2, keepdims=True)
        d = 0.7 * lum + 0.3 * d - 1.0
        _detail[source] = (d / max(float(lum.std()), 1e-4), w, h)
    return _detail[source]


def baked_texture(key):
    """这种材质的贴图（一张 JPEG，放在 <out>/tex/ 里，所有模型共用）。平涂的材质返回 None。"""
    colour, source, _, strength, _ = PAINT[key]
    if not source:
        return None
    if key not in _baked:
        d, w, h = detail_of(source)
        rgb = np.clip(np.array(colour) * (1.0 + d * strength), 0.0, 1.0)
        out = np.ones((h, w, 4), dtype=np.float32)
        out[:, :, :3] = rgb
        path = os.path.join(TEX, f'{key}.jpg')
        img = bpy.data.images.new(f'paint_{key}', w, h, alpha=False)
        img.pixels.foreach_set(out.ravel())
        img.filepath_raw = path
        img.file_format = 'JPEG'
        img.save()
        bpy.data.images.remove(img)
        _baked[key] = bpy.data.images.load(path)
    return _baked[key]


def material_for(key):
    """Principled：底色 = 贴图（或平涂色）× 顶点色。glTF 导出器认得这个接法。"""
    colour, source, _, _, rough = PAINT[key]
    mat = bpy.data.materials.new('P_' + key)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1.0
    a, b = mix.inputs[6], mix.inputs[7]
    tex = baked_texture(key)
    if tex:
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = tex
        nt.links.new(node.outputs['Color'], a)
    else:
        a.default_value = (*to_linear(colour), 1.0)
    nt.links.new(vc.outputs['Color'], b)
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    if key == 'glow':
        bsdf.inputs['Emission Color'].default_value = (*to_linear(colour), 1.0)
        bsdf.inputs['Emission Strength'].default_value = 1.5
    mat.use_backface_culling = False
    return mat


_materials = {}


def repaint(path):
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in bpy.data.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = ob.data

    keys = [(s.material.name.split('.')[0][2:] if s.material else 'white') for s in ob.material_slots]
    unknown = sorted({k for k in keys if k not in PAINT})
    keys = [k if k in PAINT else 'white' for k in keys]
    for i, k in enumerate(keys):
        if k not in _materials:
            _materials[k] = material_for(k)
        ob.material_slots[i].material = _materials[k]

    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()

    # 山墙：原模型的屋顶只有两片坡，两头是空的——站在地上能从这头看穿到那头。
    # 从墙顶往上探屋顶底面的轮廓，照着补一片墙（屋脊顺着 x，所以山墙在 x 的两头）。
    plaster = [f for f in bm.faces if keys[f.material_index].startswith('wall_')]
    gables = 0
    if plaster:
        vs = {v for f in plaster for v in f.verts}
        # 墙顶：最高的那一圈"够大"的墙——屋顶上的老虎窗也是墙的颜色，但它只占一小块；
        # 上下两层不一样宽的房子，量的是上面那层
        levels = {}
        for v in vs:
            levels.setdefault(round(v.co.z / 0.05), []).append(v.co)
        span = {k: (max(c.x for c in cs) - min(c.x for c in cs)) * (max(c.y for c in cs) - min(c.y for c in cs)) for k, cs in levels.items()}
        big = max(span.values())
        level = max((k for k in span if span[k] >= 0.5 * big), default=None)
        eave = None
        if level is not None and big > 4.0:
            cs = levels[level]
            eave = max(c.z for c in cs)
            x0, x1 = min(c.x for c in cs), max(c.x for c in cs)
            y0, y1 = min(c.y for c in cs), max(c.y for c in cs)
        area = {}
        for f in plaster:
            area[f.material_index] = area.get(f.material_index, 0.0) + f.calc_area()
        wall_mat = max(area, key=area.get)
        probe = BVHTree.FromBMesh(bm)
        STEPS = 16
        for xg, sign in ((x0, -1.0), (x1, 1.0)) if eave is not None else ():
            profile = []
            for i in range(STEPS + 1):
                y = y0 + (y1 - y0) * (0.002 + 0.996 * i / STEPS)
                hit = probe.ray_cast(Vector((xg - sign * 0.04, y, eave + 0.03)), Vector((0, 0, 1)), 14.0)
                profile.append((y, eave + 0.03 + hit[3] if hit[0] is not None else eave))
            if max(z for _, z in profile) - eave < 0.3:
                continue
            low = [bm.verts.new((xg, y, eave)) for y, _ in profile]
            high = [bm.verts.new((xg, y, z)) for y, z in profile]
            for i in range(STEPS):
                if max(profile[i][1], profile[i + 1][1]) - eave < 0.03:
                    continue
                quad = [low[i], low[i + 1], high[i + 1], high[i]] if sign > 0 else [low[i + 1], low[i], high[i], high[i + 1]]
                quad = [v for k, v in enumerate(quad) if all((v.co - w.co).length > 1e-4 for w in quad[:k])]
                if len(quad) >= 3:
                    bm.faces.new(quad).material_index = wall_mat
            gables += 1
        bm.verts.index_update()
        bm.faces.index_update()
        bm.faces.ensure_lookup_table()

    # 墙面横着切几刀：檐下的影子、墙根的深色才有顶点可以落
    wall_idx = {i for i, k in enumerate(keys) if k in WALLS}
    top = max((v.co.z for f in bm.faces if f.material_index in wall_idx for v in f.verts), default=0.0)
    z = 0.45
    while z < top - 0.2:
        faces = [f for f in bm.faces if f.material_index in wall_idx and f.calc_area() > 0.6]
        geom = list({e for f in faces for e in f.edges}) + faces + list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1), dist=1e-4)
        z += 0.8
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    # 影子：每个顶点往上打五条线，被挡住得越近越深
    tree = BVHTree.FromBMesh(bm)
    flat_rays = [Vector(d).normalized() for d in ((0, 0, 1), (0.6, 0, 0.8), (-0.6, 0, 0.8), (0, 0.6, 0.8), (0, -0.6, 0.8))]
    REACH = 2.0
    seen = {}

    def occlusion(vert, n):
        """这个顶点、朝 n 的这一面，头顶被挡了多少（0~1）。朝下的面（檐底、阳台底）整个在影子里。"""
        if n.z < -0.6:
            return 1.0
        key = (vert.index, round(n.x, 1), round(n.y, 1), round(n.z, 1))
        if key not in seen:
            if abs(n.z) < 0.7:
                h = Vector((n.x, n.y, 0)).normalized()
                side = Vector((-h.y, h.x, 0))
                up = Vector((0, 0, 1))
                rays = [up, (up * 0.8 + h * 0.6).normalized(), (up * 0.8 + h * 0.3 + side * 0.5).normalized(), (up * 0.8 + h * 0.3 - side * 0.5).normalized()]
            else:
                rays = flat_rays
            o = vert.co + n * 0.04
            s = 0.0
            for d in rays:
                hit = tree.ray_cast(o, d, REACH)
                if hit[0] is not None:
                    s += 1.0 - hit[3] / REACH
            seen[key] = s / len(rays)
        return seen[key]

    # 一块块的深浅：同一片瓦、同一根木头是一个调子，和旁边的略有不同
    rnd = random.Random(hash(os.path.basename(path)) & 0xFFFF)
    island = {}
    for f in bm.faces:
        if f.index in island:
            continue
        tone = rnd.uniform(-1.0, 1.0)
        stack = [f]
        island[f.index] = tone
        while stack:
            g = stack.pop()
            for v in g.verts:
                for h in v.link_faces:
                    if h.index not in island:
                        island[h.index] = tone
                        stack.append(h)

    uv = bm.loops.layers.uv.verify()
    col = bm.loops.layers.color.get('Col') or bm.loops.layers.color.new('Col')
    for f in bm.faces:
        key = keys[f.material_index]
        scale = PAINT[key][2]
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        mottled = key in MOTTLED
        wall = key in WALLS
        for loop in f.loops:
            p = loop.vert.co
            # 三平面：朝上的面用 xy，朝左右的用 yz，朝前后的用 xz——一米就是一米
            loop[uv].uv = ((p.y, p.z) if ax == 0 else (p.x, p.z) if ax == 1 else (p.x, p.y))
            loop[uv].uv *= scale
            shade = min(1.0, occlusion(loop.vert, n) * 1.4) * 0.5
            if wall:
                shade = max(shade, 0.3 * max(0.0, 1.0 - p.z / 0.5))
            c = 1.0 + (SHADOW - 1.0) * shade
            if mottled:
                # 大片的斑（两米一块）加每块自己的调子：偏暖的亮、偏冷的暗
                t = 0.6 * noise.noise(p * 0.45) + 0.35 * island[f.index]
                c = c * (1.0 + np.array([0.075, 0.06, 0.035]) * t)
            c = np.clip(c, 0.0, 1.0)
            loop[col] = (c[0], c[1], c[2], 1.0)
    bm.to_mesh(me)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    bm.free()
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = me.color_attributes.find('Col')

    # 导出：贴图不内嵌，GLB 里只留相对路径（<out>/tex/ 里的图所有模型共用）
    cat = os.path.basename(os.path.dirname(path))
    name = os.path.splitext(os.path.basename(path))[0]
    folder = os.path.join(OUT, cat)
    os.makedirs(folder, exist_ok=True)
    tmp = os.path.join(folder, '_tmp_' + name)
    ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=tmp + '.gltf', export_format='GLTF_SEPARATE', use_selection=True, export_keep_originals=True,
        export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_yup=True, export_apply=True,
        export_animations=False, export_cameras=False, export_lights=False,
    )
    g = json.load(open(tmp + '.gltf', encoding='utf-8'))
    blob = open(os.path.join(folder, g['buffers'][0]['uri']), 'rb').read()
    os.remove(os.path.join(folder, g['buffers'][0]['uri']))
    os.remove(tmp + '.gltf')
    del g['buffers'][0]['uri']
    for im in g.get('images', []):
        im['uri'] = '../tex/' + os.path.basename(im['uri'])
    for s in g.get('samplers', []):
        s['wrapS'] = s['wrapT'] = 10497
    js = json.dumps(g, separators=(',', ':')).encode('utf-8')
    js += b' ' * (-len(js) % 4)
    blob += b'\0' * (-len(blob) % 4)
    glb = os.path.join(folder, name + '.glb')
    with open(glb, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(blob), b'BIN\0') + blob)
    prim = g['meshes'][0]['primitives']
    return {
        'id': name, 'cat': cat, 'glb': f'models3/{cat}/{name}.glb', 'glb_kb': round(os.path.getsize(glb) / 1024, 1), 'tris': tris,
        'mats': len(g['materials']), 'textures': sorted({os.path.basename(im['uri']) for im in g.get('images', [])}),
        'colour': all('COLOR_0' in p['attributes'] for p in prim), 'uv': all('TEXCOORD_0' in p['attributes'] for p in prim),
        'unknown': unknown, 'gables': gables,
    }


items = []
for i, path in enumerate(PATHS):
    try:
        r = repaint(path)
        items.append(r)
        print(f"REPAINT {i + 1}/{len(PATHS)} {r['id']} tris {r['tris']} {r['glb_kb']} KB mats {r['mats']} tex {len(r['textures'])} colour {r['colour']} gables {r['gables']} unknown {r['unknown']}")
    except Exception as e:  # 一件坏了不耽误其它的；最后的清单里记着
        import traceback
        traceback.print_exc()
        items.append({'id': os.path.basename(path), 'error': str(e)})
        print(f'REPAINT FAILED {path}: {e}')

manifest = os.path.join(OUT, '_manifest.json')
old = json.load(open(manifest, encoding='utf-8'))['items'] if os.path.exists(manifest) else []
done = {r['id'] for r in items}
items = [r for r in old if r['id'] not in done] + items
json.dump({'style': '吉卜力手绘 · 重绘版', 'from': 'public/models2', 'total': len(items), 'failed': sum('error' in r for r in items), 'items': items},
          open(manifest, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('MANIFEST', manifest, len(items))
