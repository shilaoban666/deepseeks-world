"""把模型摆成一条小镇街景，出两张图（黄昏 / 夜晚）验证风格是否成片。

  blender -b --factory-startup --python tools/ghibli/render_hero.py
"""
import bpy
import os
import sys
import math
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(ROOT, 'public', 'models')
OUT = os.path.join(ROOT, 'design', 'previews')
os.makedirs(OUT, exist_ok=True)


def clear():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)


def load(cat, name, at, rz=0.0, scale=1.0):
    path = os.path.join(MODELS, cat, name + '.glb')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location = Vector(at)
            o.rotation_euler.z = math.radians(rz)
            o.scale = (scale, scale, scale)
    return new


def mat(name, color, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    return m


def ground():
    me = bpy.data.meshes.new('ground')
    verts = [(-90, -90, 0), (90, -90, 0), (90, 90, 0), (-90, 90, 0)]
    me.from_pydata(verts, [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new('ground', me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat('G_ground', (0.52, 0.50, 0.34)))
    # 一条石板路
    road = bpy.data.objects.new('road', bpy.data.meshes.new('road'))
    bpy.context.collection.objects.link(road)
    road.data.from_pydata([(-4, -60, 0.02), (4, -60, 0.02), (4, 60, 0.02), (-4, 60, 0.02)], [], [(0, 1, 2, 3)])
    road.data.materials.append(mat('G_road', (0.62, 0.60, 0.54), 0.95))


def sky(night=False):
    w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    if night:
        bg.inputs['Color'].default_value = (0.055, 0.075, 0.13, 1)
        bg.inputs['Strength'].default_value = 0.55
    else:
        bg.inputs['Color'].default_value = (0.78, 0.80, 0.76, 1)   # 黄昏的灰绿天光
        bg.inputs['Strength'].default_value = 1.25


def sun(night=False):
    d = bpy.data.lights.new('Sun', 'SUN')
    ob = bpy.data.objects.new('Sun', d)
    bpy.context.collection.objects.link(ob)
    if night:
        d.energy = 0.35
        d.color = (0.62, 0.72, 1.0)
        ob.rotation_euler = (math.radians(72), 0, math.radians(-40))
    else:
        d.energy = 4.6
        d.color = (1.0, 0.86, 0.62)      # 低角度金色光
        d.angle = math.radians(4)
        ob.rotation_euler = (math.radians(66), 0, math.radians(62))
    fill = bpy.data.lights.new('Fill', 'SUN')
    fo = bpy.data.objects.new('Fill', fill)
    bpy.context.collection.objects.link(fo)
    fill.energy = 0.9 if not night else 0.35
    fill.color = (0.68, 0.80, 0.95)
    fo.rotation_euler = (math.radians(58), 0, math.radians(-118))


def camera(loc, look, lens=42):
    cd = bpy.data.cameras.new('Cam')
    cd.lens = lens
    cam = bpy.data.objects.new('Cam', cd)
    bpy.context.collection.objects.link(cam)
    cam.location = Vector(loc)
    direction = (Vector(look) - Vector(loc)).normalized()
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam


def build_scene(night=False):
    clear()
    sky(night)
    sun(night)
    ground()

    # 主街：两侧建筑，中间石板路（路宽 8 m）
    load('landmark', 'lm_church', (-30, -34, 0), rz=198)
    load('landmark', 'lm_temple', (-34, 22, 0), rz=180)
    load('landmark', 'lm_clocktower', (34, -30, 0), rz=200)
    load('house', 'house_stone_three', (-14, -20, 0), rz=180)
    load('house', 'house_wood_two', (-14, -6, 0), rz=180)
    load('house', 'house_balcony', (-14, 8, 0), rz=180)
    load('shop', 'shop_bakery', (14, -22, 0), rz=180)
    load('shop', 'shop_tea', (14, -8, 0), rz=180)
    load('shop', 'shop_flower', (14, 6, 0), rz=180)
    load('shop', 'shop_book', (14, 20, 0), rz=180)
    load('house', 'house_attached_a', (-14, 22, 0), rz=180)
    load('misc', 'misc_boardwalk', (0, -34, 0), rz=90)

    # 街道家具
    for i, z in enumerate((-26, -14, -2, 10, 22)):
        load('prop', 'prop_lamp_classic', (5.2, z, 0))
        load('prop', 'prop_lamp_classic', (-5.2, z, 0))
    for i, z in enumerate((-18, -4, 12)):
        load('prop', 'prop_bench_wood', (5.6, z + 1.2, 0), rz=90)
        load('prop', 'prop_bin_pair', (-5.6, z, 0), rz=-90)
    load('prop', 'prop_stall_veg', (-9.5, -14, 0), rz=90)
    load('prop', 'prop_stall_fruit', (-9.5, 0, 0), rz=90)
    load('prop', 'prop_stall_flower', (9.5, 16, 0), rz=-90)
    load('prop', 'prop_umbrella', (9.5, 26, 0))
    load('prop', 'prop_busstop', (-9, 30, 0), rz=180)
    load('prop', 'prop_kiosk', (9.2, -32, 0), rz=-90)
    load('misc', 'misc_stone_lantern', (-6.6, 30, 0))
    load('misc', 'misc_stone_lantern', (6.6, 30, 0))
    load('farm', 'farm_well', (-9, 12, 0))
    load('misc', 'misc_lantern_str', (0, 16, 5.4), rz=90)
    load('misc', 'misc_lantern_str', (0, 2, 5.4), rz=90)
    load('misc', 'misc_lantern_str', (0, -12, 5.4), rz=90)
    load('prop', 'prop_crate', (11.5, -16, 0), rz=20)
    load('prop', 'prop_barrel', (11.9, -14.4, 0))
    load('vehicle', 'veh_platform', (0, -46, 0), rz=0)

    if night:
        camera((16, 44, 9), (0, -6, 4), lens=38)
    else:
        camera((26, 52, 15), (0, -8, 5), lens=40)


sc = bpy.context.scene
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        continue
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = 93
try:
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass
# 远处雾化，把天际线压进背景里
sc.world.use_nodes = True
try:
    sc.eevee.use_volumetric_lights = False
except Exception:
    pass

for night, name in ((False, 'hero-dusk.jpg'), (True, 'hero-night.jpg')):
    build_scene(night)
    sc.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print('HERO', name, sc.render.engine)

print('DONE', OUT)