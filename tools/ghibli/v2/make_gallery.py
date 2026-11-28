"""把 models2 的某一类摆成一个可浏览的 .blend 展台（带标签、相机、灯光、分类集合）。

  blender -b --factory-startup --python tools/ghibli/v2/make_gallery.py -- \
      --cat bird --out design/models2-birds.blend [--limit 300]
"""
import bpy
import json
import os
import sys
import math
from mathutils import Vector


def arg(name, default=None):
    if '--' in sys.argv:
        a = sys.argv[sys.argv.index('--') + 1:]
        if name in a:
            i = a.index(name) + 1
            if i >= len(a) or a[i].startswith('--'):
                return '1'
            return a[i]
    return default


HERE = os.path.dirname(os.path.abspath(__file__))
GHIBLI = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(GHIBLI))
MODELS = os.path.join(ROOT, 'public', 'models2')
CATS = (arg('--cat') or 'bird').split(',')
OUT = arg('--out', os.path.join(ROOT, 'design', 'models2-gallery.blend'))
LIMIT = int(arg('--limit', '0'))
COLS = int(arg('--cols', '0'))

spec = json.load(open(os.path.join(MODELS, '_manifest.json'), encoding='utf-8'))
items = [i for i in spec['items'] if i['cat'] in CATS and 'glb' in i]
items.sort(key=lambda r: r['id'])
if LIMIT:
    items = items[:LIMIT]

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

col = bpy.data.collections.new('_'.join(CATS))
bpy.context.scene.collection.children.link(col)


def label(text, loc, size):
    cu = bpy.data.curves.new('lbl_' + text, type='FONT')
    cu.body = text
    cu.size = size
    cu.align_x = 'CENTER'
    ob = bpy.data.objects.new('LBL_' + text, cu)
    col.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (math.radians(90), 0, 0)
    return ob


cell = max(max(i['size'][0], i['size'][1]) for i in items) * 1.3
cell = max(cell, 0.4)
cols = COLS or min(10, max(4, int(math.ceil(math.sqrt(len(items) * 1.2)))))
rows = int(math.ceil(len(items) / cols))
placed = 0
for idx, it in enumerate(items):
    r, c = divmod(idx, cols)
    x = (c - (cols - 1) / 2) * cell
    y = -(r - (rows - 1) / 2) * cell
    path = os.path.join(MODELS, it['cat'], it['id'] + '.glb')
    if not os.path.exists(path):
        continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location = (o.location.x + x, o.location.y + y, o.location.z)
        for cl in list(o.users_collection):
            cl.objects.unlink(o)
        col.objects.link(o)
    sz = it['size']
    label(it['id'].replace(f'{it["cat"]}_', ''), (x, y - cell * 0.42, sz[2] + cell * 0.10),
          size=cell * 0.055)
    placed += 1

sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
bpy.context.scene.collection.objects.link(sun)
sun.data.energy = 3.8
sun.data.color = (1.0, 0.93, 0.80)
sun.data.angle = math.radians(4)
sun.rotation_euler = (math.radians(56), 0, math.radians(36))

fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'SUN'))
bpy.context.scene.collection.objects.link(fill)
fill.data.energy = 0.9
fill.data.color = (0.72, 0.82, 0.95)
fill.rotation_euler = (math.radians(62), 0, math.radians(-120))

w = bpy.context.scene.world or bpy.data.worlds.new('World')
bpy.context.scene.world = w
w.use_nodes = True
bg = w.node_tree.nodes.get('Background')
if bg:
    bg.inputs['Color'].default_value = (0.62, 0.72, 0.80, 1.0)
    bg.inputs['Strength'].default_value = 1.1

lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for ob in bpy.data.objects:
    if ob.type != 'MESH':
        continue
    for v in ob.bound_box:
        p = ob.matrix_world @ Vector(v)
        for k in range(3):
            lo[k] = min(lo[k], p[k])
            hi[k] = max(hi[k], p[k])
ctr = (lo + hi) / 2
diag = max((hi - lo).length, 1.0)

cd = bpy.data.cameras.new('GalleryCam')
cd.lens = 50
cd.clip_end = 20000
cam = bpy.data.objects.new('GalleryCam', cd)
bpy.context.scene.collection.objects.link(cam)
cam.location = ctr + Vector((0.35, -1.0, 0.55)).normalized() * diag * 0.85
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.camera = cam
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print(f'GALLERY {CATS} {placed} 件 -> {OUT} ({round(os.path.getsize(OUT) / 1048576, 1)} MB) '
      f'cell={round(cell, 2)} grid={rows}x{cols}')