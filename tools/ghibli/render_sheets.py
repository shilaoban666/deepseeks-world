"""把 public/models 下的 GLB 按分类排成预览图（宫崎骏式暖光）。

  blender -b --factory-startup --python tools/ghibli/render_sheets.py -- --cat prop --out design/previews
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
ROOT = os.path.dirname(os.path.dirname(HERE))
MODELS = arg('--models', os.path.join(ROOT, 'public', 'models'))
OUT = arg('--out', os.path.join(ROOT, 'design', 'previews'))
CATS = (arg('--cat') or 'landmark,house,shop,prop,vehicle,farm,furniture,misc').split(',')
RES = [int(x) for x in (arg('--res', '1800x1000')).split('x')]
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


def setup_world():
    w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.62, 0.74, 0.82, 1.0)   # 水粉天空蓝
    bg.inputs['Strength'].default_value = 1.15


def add_lights():
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    bpy.context.collection.objects.link(sun)
    sun.data.energy = 4.2
    sun.data.color = (1.0, 0.94, 0.82)
    sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(54), 0, math.radians(38))

    fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'SUN'))
    bpy.context.collection.objects.link(fill)
    fill.data.energy = 1.1
    fill.data.color = (0.72, 0.82, 0.95)
    fill.rotation_euler = (math.radians(62), 0, math.radians(-120))


def frame_camera(lo, hi, name=None):
    ctr = (lo + hi) / 2
    size = hi - lo
    diag = max(size.length, 0.5)
    cam_data = bpy.data.cameras.new('Cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = diag * 1.12
    cam = bpy.data.objects.new('Cam', cam_data)
    bpy.context.collection.objects.link(cam)
    d = Vector((0.86, -1.0, 0.52)).normalized()
    cam.location = ctr + d * diag * 2.6
    direction = (ctr - cam.location).normalized()
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    return cam


spec = json.load(open(os.path.join(MODELS, '_manifest.json'), encoding='utf-8'))
by_cat = {}
for it in spec['items']:
    if 'glb' in it:
        by_cat.setdefault(it['cat'], []).append(it)

engine = set_engine()
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y = RES
sc.render.film_transparent = False
try:
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass

for cat in CATS:
    group = by_cat.get(cat, [])
    if not group:
        continue
    clear()
    setup_world()
    add_lights()
    obs = []
    for it in group:
        path = os.path.join(MODELS, it['glb'].replace('models/', '', 1))
        if not os.path.exists(path):
            path = os.path.join(MODELS, it['cat'], it['id'] + '.glb')
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        obs.extend(new)

    # 网格排布：按各自平面尺寸占格
    cell = 0.0
    for ob in obs:
        lo, hi = bbox([ob])
        cell = max(cell, (hi - lo).x, (hi - lo).y)
    cell = max(cell, 1.0)
    gap = cell * 0.16
    cols = min(8, max(3, int(math.ceil(math.sqrt(len(obs) * 1.8)))))
    rows = int(math.ceil(len(obs) / cols))
    for i, ob in enumerate(obs):
        r, c = divmod(i, cols)
        lo, hi = bbox([ob])
        ob.location.x += (c - (cols - 1) / 2) * (cell + gap) - (lo.x + hi.x) / 2
        ob.location.y += (r - (rows - 1) / 2) * (cell + gap) - (lo.y + hi.y) / 2
        ob.location.z -= lo.z

    lo, hi = bbox(obs)
    frame_camera(lo, hi)
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 92
    out = os.path.join(OUT, f'{cat}.jpg')
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(f'SHEET {cat}: {len(obs)} 件 ({rows}x{cols}) engine={engine} -> {out}')

print('DONE', OUT)