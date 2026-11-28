import bpy, os
from mathutils import Vector
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=r"D:\download\google 下载\女仆3d模型.glb")
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
print("MESHES", len(meshes))
total_tris = 0
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
for ob in meshes:
    me = ob.data
    tris = sum(max(0, len(p.vertices) - 2) for p in me.polygons)
    total_tris += tris
    for v in me.vertices:
        w = ob.matrix_world @ v.co
        for k in range(3):
            lo[k] = min(lo[k], w[k]); hi[k] = max(hi[k], w[k])
    print("OBJ", ob.name, "verts", len(me.vertices), "tris", tris,
          "mats", len(me.materials), "uv", len(me.uv_layers))
print("TOTAL_TRIS", total_tris)
print("BBOX_SIZE", [round(x, 3) for x in (hi - lo)])
print("BBOX_Z", round(lo.z, 3), round(hi.z, 3))
print("IMAGE", [(i.name, i.size[0], i.size[1]) for i in bpy.data.images if i.size[0]])
