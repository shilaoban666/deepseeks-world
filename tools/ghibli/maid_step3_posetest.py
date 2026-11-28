"""给绑定好的女仆摆几个姿势并渲染，检查蒙皮权重。"""
import bpy
import math
import os
from mathutils import Vector

ROOT = r"D:\DSH DEMO\deepseek-world"
OUTDIR = os.path.join(ROOT, "public", "characters", "maid")
PREV = os.path.join(ROOT, "design", "previews_maid")
os.makedirs(PREV, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=os.path.join(OUTDIR, "maid-rigged.blend"))
ob = bpy.data.objects["MAID"]
rig = bpy.data.objects["MAID_RIG"]

# 朝向判定：脚（z<0.08）的 y 范围，脚尖朝哪边
ys = [(ob.matrix_world @ v.co).y for v in ob.data.vertices if (ob.matrix_world @ v.co).z < 0.08]
print("FOOT_Y", round(min(ys), 3), round(max(ys), 3))

# 灯光
w = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.72, 0.82, 1.0)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.2
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
bpy.context.collection.objects.link(sun)
sun.data.energy = 4.2
sun.data.color = (1.0, 0.94, 0.84)
sun.rotation_euler = (math.radians(56), 0, math.radians(36))
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
bpy.context.collection.objects.link(fill)
fill.data.energy = 1.0
fill.data.color = (0.72, 0.82, 0.96)
fill.rotation_euler = (math.radians(66), 0, math.radians(-118))

cd = bpy.data.cameras.new("Cam")
cd.lens = 60
cam = bpy.data.objects.new("Cam", cd)
bpy.context.collection.objects.link(cam)
bpy.context.scene.camera = cam


def aim(loc, target):
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = 720, 1080
sc.render.image_settings.file_format = "JPEG"
sc.render.image_settings.quality = 90
try:
    sc.view_settings.view_transform = "AgX"
except Exception:
    pass


def shot(name, loc=(2.0, -3.2, 1.15), target=(0, 0, 0.85)):
    aim(loc, target)
    sc.render.filepath = os.path.join(PREV, name)
    bpy.ops.render.render(write_still=True)
    print("SHOT", name)


def clear_pose():
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)


def rot(bone, x=0, y=0, z=0):
    pb = rig.pose.bones.get(bone)
    if not pb:
        print("MISSING BONE", bone)
        return
    pb.rotation_mode = 'XYZ'
    pb.rotation_euler = (math.radians(x), math.radians(y), math.radians(z))


clear_pose()
bpy.context.view_layer.update()
shot("pose-bind-front.jpg")
shot("pose-bind-side.jpg", loc=(3.6, 0.2, 1.15))

# 测试姿势：抬左臂、屈左腿、转腰、低头
clear_pose()
rot("upperarm_l", z=-55)
rot("lowerarm_l", z=-45)
rot("upperarm_r", z=20)
rot("thigh_l", x=-45)
rot("calf_l", x=70)
rot("spine_02", x=12, z=10)
rot("neck", x=-10)
bpy.context.view_layer.update()
shot("pose-test-front.jpg")
shot("pose-test-side.jpg", loc=(3.6, 0.2, 1.15))

clear_pose()
bpy.context.view_layer.update()
print("DONE", PREV)