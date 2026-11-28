import bpy
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=r"D:\DSH DEMO\deepseek-world\public\figure\starter-man.glb")
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
print("ARMATURES", [a.name for a in arms])
if arms:
    names = [b.name for b in arms[0].data.bones]
    print("BONE_COUNT", len(names))
    print("BONES", ", ".join(names))
bpy.ops.import_scene.gltf(filepath=r"D:\DSH DEMO\deepseek-world\public\figure\starter-man-clips.glb")
print("ACTIONS", len(bpy.data.actions))
for a in bpy.data.actions[:3]:
    print("ACTION", a.name, "fcurves", len(a.fcurves), "paths", [f.data_path for f in a.fcurves[:3]])
