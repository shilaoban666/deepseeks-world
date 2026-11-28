import bpy, math, os
from mathutils import Vector
ROOT = r"D:\DSH DEMO\deepseek-world"
OUTDIR = os.path.join(ROOT, "public", "characters", "maid")
PREV = os.path.join(ROOT, "design", "previews_maid")
os.makedirs(PREV, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUTDIR, "maid-animated.blend"))
rig = bpy.data.objects["MAID_RIG"]
sc = bpy.context.scene
w = sc.world or bpy.data.worlds.new("World"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.72, 0.82, 1.0)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.2
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
bpy.context.collection.objects.link(sun)
sun.data.energy = 4.2; sun.data.color = (1.0, 0.94, 0.84)
sun.rotation_euler = (math.radians(56), 0, math.radians(36))
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
bpy.context.collection.objects.link(fill)
fill.data.energy = 1.0; fill.data.color = (0.72, 0.82, 0.96)
fill.rotation_euler = (math.radians(66), 0, math.radians(-118))
cd = bpy.data.cameras.new("Cam"); cd.lens = 62
cam = bpy.data.objects.new("Cam", cd); bpy.context.collection.objects.link(cam)
sc.camera = cam
cam.location = Vector((1.9, -3.0, 1.05))
cam.rotation_euler = (Vector((0, 0, 0.85)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = 640, 960
sc.render.image_settings.file_format = "JPEG"
sc.render.image_settings.quality = 90
try: sc.view_settings.view_transform = "AgX"
except Exception: pass
rig.animation_data_create()
for name, frame in [("Idle", 45), ("Walk", 9), ("Run", 6), ("Sprint", 5), ("Jump", 18), ("Fishing", 30)]:
    act = bpy.data.actions.get(name)
    if not act:
        print("MISSING", name); continue
    rig.animation_data.action = act
    sc.frame_set(frame)
    bpy.context.view_layer.update()
    out = os.path.join(PREV, f"clip-{name}.jpg")
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("SHOT", name, frame)
print("DONE")
