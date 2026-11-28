import bpy, os, math
from mathutils import Vector

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

bpy.ops.import_scene.gltf(filepath=r"D:\DSH DEMO\deepseek-world\public\figure\starter-man.glb")
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
print("IMPORT meshes", len(meshes), "armatures", len(arms), "actions", len(bpy.data.actions))
for a in arms:
    print("BONES", len(a.data.bones))

lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
for ob in meshes:
    for v in ob.bound_box:
        p = ob.matrix_world @ Vector(v)
        for k in range(3):
            lo[k] = min(lo[k], p[k]); hi[k] = max(hi[k], p[k])
print("BBOX", [round(x, 2) for x in (hi - lo)], "zmin", round(lo.z, 2))
ctr = (lo + hi) / 2
diag = max((hi - lo).length, 0.5)

w = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = w
w.use_nodes = True
bg = w.node_tree.nodes.get("Background")
bg.inputs["Color"].default_value = (0.58, 0.68, 0.78, 1.0)
bg.inputs["Strength"].default_value = 1.3

sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
bpy.context.collection.objects.link(sun)
sun.data.energy = 4.0
sun.data.color = (1.0, 0.94, 0.84)
sun.rotation_euler = (math.radians(56), 0, math.radians(34))
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
bpy.context.collection.objects.link(fill)
fill.data.energy = 1.1
fill.data.color = (0.72, 0.82, 0.96)
fill.rotation_euler = (math.radians(64), 0, math.radians(-118))

cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 65
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = ctr + Vector((0.9, -1.5, 0.35)).normalized() * diag * 1.25
cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.camera = cam

sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = 900, 1200
sc.render.image_settings.file_format = "JPEG"
sc.render.image_settings.quality = 92
try:
    sc.view_settings.view_transform = "AgX"
except Exception:
    pass
out = r"D:\DSH DEMO\deepseek-world\design\previews2\character-starter-man.jpg"
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print("RENDERED", out, round(os.path.getsize(out) / 1024), "KB")
