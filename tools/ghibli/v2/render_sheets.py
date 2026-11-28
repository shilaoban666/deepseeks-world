"""models2 的分类预览图（宫崎骏暖光）。

  blender -b --factory-startup --python tools/ghibli/v2/render_sheets.py -- --cat shop,house --per-sheet 12
"""
import bpy
import os
import sys
import math
import json
from mathutils import Vector


def arg(name, default=None):
    if '--' in sys.argv:
        a = sys.argv[sys.argv.index('--') + 1:]
        if name in a:
            return a[a.index(name) + 1]
    return default


HERE = os.path.dirname(os.path.abspath(__file__))
GHIBLI = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(GHIBLI))
MODELS = arg('--models', os.path.join(ROOT, 'public', 'models2'))
OUT = arg('--out', os.path.join(ROOT, 'design', 'previews2'))
CATS = (arg('--cat') or 'shop,house,furniture,station,transport,infra,container,tool,plant').split(',')
RES = [int(x) for x in (arg('--res', '1800x1000')).split('x')]
PER = int(arg('--per-sheet', '12'))
MAX_SHEETS = int(arg('--max-sheets', '2'))
os.makedirs(OUT, exist_ok=True)


def clear():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)


def set_engine():
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH'):
        try:
            sc.render.engine = eng
            return eng
        except TypeError:
            continue
    return sc.render.engine


def bbox(obs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in obs:
        for v in ob.bound_box:
            w = ob.matrix_world @ Vector(v)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    return lo, hi


def world():
    w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.63, 0.74, 0.81, 1.0)
    bg.inputs['Strength'].default_value = 1.15


def lights():
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    bpy.context.collection.objects.link(sun)
    sun.data.energy = 4.2
    sun.data.color = (1.0, 0.93, 0.80)
    sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(54), 0, math.radians(38))
    fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'SUN'))
    bpy.context.collection.objects.link(fill)
    fill.data.energy = 1.0
    fill.data.color = (0.72, 0.82, 0.95)
    fill.rotation_euler = (math.radians(62), 0, math.radians(-120))


def camera(lo, hi):
    ctr = (lo + hi) / 2
    diag = max((hi - lo).length, 0.5)
    cd = bpy.data.cameras.new('Cam')
    cd.type = 'ORTHO'
    cd.ortho_scale = diag * 1.1
    cam = bpy.data.objects.new('Cam', cd)
    bpy.context.collection.objects.link(cam)
    d = Vector((0.8, -1.0, 0.55)).normalized()
    cam.location = ctr + d * diag * 2.5
    cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam


spec = json.load(open(os.path.join(MODELS, '_manifest.json'), encoding='utf-8'))
by_cat = {}
for it in spec['items']:
    if 'glb' in it:
        by_cat.setdefault(it['cat'], []).append(it)
for k in by_cat:
    by_cat[k].sort(key=lambda r: r['id'])

engine = set_engine()
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y = RES
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = 92
try:
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass

for cat in CATS:
    group = by_cat.get(cat, [])
    if not group:
        continue
    chunks = [group[i:i + PER] for i in range(0, len(group), PER)]
    for ci, chunk in enumerate(chunks[:MAX_SHEETS]):      # 每类最多 N 张，够看风格
        clear()
        world()
        lights()
        obs = []
        for it in chunk:
            path = os.path.join(MODELS, it['glb'].replace('models2/', '', 1))
            if not os.path.exists(path):
                continue
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=path)
            new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
            obs.extend(new)
        if not obs:
            continue
        cell = 0.0
        for ob in obs:
            lo, hi = bbox([ob])
            cell = max(cell, (hi - lo).x, (hi - lo).y)
        cell = max(cell, 0.8)
        gap = cell * 0.14
        cols = min(6, max(3, int(math.ceil(math.sqrt(len(obs) * 1.7)))))
        rows = int(math.ceil(len(obs) / cols))
        for i, ob in enumerate(obs):
            r, c = divmod(i, cols)
            lo, hi = bbox([ob])
            ob.location.x += (c - (cols - 1) / 2) * (cell + gap) - (lo.x + hi.x) / 2
            ob.location.y += (r - (rows - 1) / 2) * (cell + gap) - (lo.y + hi.y) / 2
            ob.location.z -= lo.z
        lo, hi = bbox(obs)
        camera(lo, hi)
        out = os.path.join(OUT, f'{cat}-{ci + 1}.jpg')
        sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
        print(f'SHEET {out} ({len(obs)} 件)')

print('DONE', OUT)