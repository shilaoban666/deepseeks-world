import bpy, os, math
from mathutils import Vector

SRC = r"D:\download\google 下载\女仆3d模型.glb"
OUTDIR = r"D:\DSH DEMO\deepseek-world\public\characters\maid"
os.makedirs(OUTDIR, exist_ok=True)

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ob = [o for o in bpy.data.objects if o.type == "MESH"][0]
ob.name = "MAID"
print("IN verts", len(ob.data.vertices), "tris", sum(max(0, len(p.vertices) - 2) for p in ob.data.polygons))

# 1) 焊接重复点（Tripo 网格常有大量重合点）
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
import bmesh
bm = bmesh.new(); bm.from_mesh(ob.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
bm.to_mesh(ob.data); bm.free(); ob.data.update()
print("WELD verts", len(ob.data.vertices))

# 2) 缩放到真人身高 1.62 m，脚底贴地、原点在脚心
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
for v in ob.data.vertices:
    w = ob.matrix_world @ v.co
    for k in range(3):
        lo[k] = min(lo[k], w[k]); hi[k] = max(hi[k], w[k])
h = hi.z - lo.z
s = 1.62 / h
ob.scale = (s, s, s)
ob.location = (-(lo.x + hi.x) * 0.5 * s, -(lo.y + hi.y) * 0.5 * s, -lo.z * s)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("SCALE", round(s, 4), "-> height", round(1.62, 3))

# 3) 减面到游戏可用（保留 UV）
target_tris = 34000
cur = sum(max(0, len(p.vertices) - 2) for p in ob.data.polygons)
ratio = min(1.0, target_tris / cur)
mod = ob.modifiers.new("Dec", "DECIMATE")
mod.decimate_type = "COLLAPSE"
mod.ratio = ratio
mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=mod.name)
tris = sum(max(0, len(p.vertices) - 2) for p in ob.data.polygons)
print("DECIMATED ratio", round(ratio, 5), "-> tris", tris)

# 4) 平滑着色 + 法线
for p in ob.data.polygons:
    p.use_smooth = True
bm = bmesh.new(); bm.from_mesh(ob.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(ob.data); bm.free(); ob.data.update()

lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
for v in ob.data.vertices:
    w = ob.matrix_world @ v.co
    for k in range(3):
        lo[k] = min(lo[k], w[k]); hi[k] = max(hi[k], w[k])
print("FINAL size", [round(x, 3) for x in (hi - lo)], "zmin", round(lo.z, 3))

# 5) 存 blend + 导出 GLB（贴图内嵌）
blend = os.path.join(OUTDIR, "maid-static.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend)
glb = os.path.join(OUTDIR, "maid-static.glb")
for o in bpy.context.selected_objects:
    o.select_set(False)
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True,
                          export_apply=True, export_yup=True, export_texcoords=True,
                          export_normals=True, export_materials="EXPORT")
print("SAVED", glb, round(os.path.getsize(glb) / 1048576, 2), "MB")
