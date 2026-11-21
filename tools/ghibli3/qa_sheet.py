"""模型质检用的对照图：把一批 GLB 各自缩到同样大小，排成格子，中性光、不加雾、不压色，原样渲出来。

  blender -b --factory-startup --python tools/ghibli3/qa_sheet.py -- --list a.glb,b.glb,... --out sheet.jpg [--cols 4] [--res 1600x1200]
  或 --listfile paths.txt（一行一个）

和 tools/ghibli/v2/render_sheets.py 的区别：那一套用 AgX + 很亮的天光，出来的图发灰发白，看不出模型本来的颜色；
这里用 Standard 色彩变换，材质是什么颜色，图上就是什么颜色——质检要看的是模型，不是打光。
"""
import bpy
import math
import os
import sys
from mathutils import Vector


def arg(name, default=None):
    if '--' in sys.argv:
        a = sys.argv[sys.argv.index('--') + 1:]
        if name in a:
            return a[a.index(name) + 1]
    return default


paths = []
if arg('--listfile'):
    paths = [l.strip() for l in open(arg('--listfile'), encoding='utf-8') if l.strip()]
elif arg('--list'):
    paths = arg('--list').split(',')
OUT = arg('--out', 'sheet.jpg')
COLS = int(arg('--cols', '4'))
RES = [int(x) for x in arg('--res', '1600x1200').split('x')]
VIEW = [float(x) for x in arg('--view', '0.75,-1.0,0.6').split(',')]

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

sc = bpy.context.scene
for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'BLENDER_WORKBENCH'):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        continue
sc.render.resolution_x, sc.render.resolution_y = RES
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = 90
sc.view_settings.view_transform = 'Standard'
try:
    sc.view_settings.look = 'None'
except Exception:
    pass

w = bpy.data.worlds.new('W')
sc.world = w
w.use_nodes = True
bg = w.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value = (0.42, 0.56, 0.78, 1.0)
bg.inputs['Strength'].default_value = 0.55

sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sc.collection.objects.link(sun)
sun.data.energy = 3.0
sun.data.color = (1.0, 0.95, 0.86)
sun.data.angle = math.radians(2)
sun.rotation_euler = (math.radians(52), 0, math.radians(40))


def bbox(obs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in obs:
        for v in ob.bound_box:
            p = ob.matrix_world @ Vector(v)
            for i in range(3):
                lo[i] = min(lo[i], p[i])
                hi[i] = max(hi[i], p[i])
    return lo, hi


CELL = 1.25
rows = int(math.ceil(len(paths) / COLS))
allobs = []
for i, path in enumerate(paths):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    if not meshes:
        continue
    bpy.context.view_layer.update()
    lo, hi = bbox(meshes)
    size = max((hi - lo).x, (hi - lo).y, (hi - lo).z, 1e-4)
    root = bpy.data.objects.new(f'cell{i}', None)
    sc.collection.objects.link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
    s = 1.0 / size
    r, c = divmod(i, COLS)
    ctr = (lo + hi) / 2
    root.scale = (s, s, s)
    root.location = (c * CELL - ctr.x * s, -r * CELL - ctr.y * s, -lo.z * s)
    allobs.extend(meshes)

# 地面：一块浅色的板，接影子
bpy.ops.mesh.primitive_plane_add(size=1)
ground = bpy.context.object
ground.scale = (COLS * CELL + 2, rows * CELL + 2, 1)
ground.location = ((COLS - 1) * CELL / 2, -(rows - 1) * CELL / 2, -0.002)
gm = bpy.data.materials.new('ground')
gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.5, 0.5, 0.48, 1)
gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
ground.data.materials.append(gm)

bpy.context.view_layer.update()
ctr = Vector(((COLS - 1) * CELL / 2, -(rows - 1) * CELL / 2, 0.45))
cd = bpy.data.cameras.new('Cam')
cd.type = 'ORTHO'
d = Vector(VIEW).normalized()
# 画面的宽对着格子的列方向；按格子的行列数把整张表装进去
cd.ortho_scale = max(COLS * CELL * 1.25, rows * CELL * 1.25 * RES[0] / RES[1])
cam = bpy.data.objects.new('Cam', cd)
sc.collection.objects.link(cam)
cam.location = ctr + d * 30
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.camera = cam
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('SHEET', OUT, len(paths))
