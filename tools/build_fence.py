"""
High-Craft Ghibli Wooden Picket Fence Builder for Blender 5.3 (--factory-startup --background).
Dimensions: 1.60m wide (X: -0.80..+0.80), 1.10m tall (Z: 0..1.10), ~0.18m thick (Y).
Applies clean box/planar UVs mapped to public/textures/albedo/fence0.png and exports public/vehicles/fence.glb.
"""
import math
import os
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

ROOT = r"d:\DSH DEMO\deepseek-world"
TEX_FENCE = os.path.join(ROOT, "public", "textures", "albedo", "fence0.png")
OUT_GLB = os.path.join(ROOT, "public", "vehicles", "fence.glb")
PREVIEW_PNG = r"C:\Users\shilaoban\.gemini\antigravity\brain\8cc60f92-f47e-4a8b-bc27-26a746fb2f13\scratch\preview_fence.png"


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_textured_wood_mat(name, img_path, tint=(1.0, 0.94, 0.85)):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.72
    if os.path.exists(img_path):
        tex = nt.nodes.new("ShaderNodeTexImage")
        img = bpy.data.images.load(img_path)
        tex.image = img
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[7].default_value = (tint[0], tint[1], tint[2], 1.0)
        nt.links.new(tex.outputs["Color"], mix.inputs[6])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (0.58, 0.42, 0.26, 1.0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_solid_mat(name, rgba, roughness=0.65, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def add_bevel_box(bm, mat_idx, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.012, segs=2, uv_scale=(1.0, 1.0)):
    tbm = bmesh.new()
    bmesh.ops.create_cube(tbm, size=1.0)
    bmesh.ops.scale(tbm, vec=Vector(size), verts=tbm.verts)
    if bevel > 0:
        bmesh.ops.bevel(tbm, geom=list(tbm.edges), offset=bevel, segments=segs, profile=0.55, affect='EDGES', clamp_overlap=True)
    m = Matrix.Translation(Vector(loc)) @ Euler(rot, 'XYZ').to_matrix().to_4x4()
    bmesh.ops.transform(tbm, matrix=m, verts=tbm.verts)
    bmesh.ops.recalc_face_normals(tbm, faces=tbm.faces)

    uv_layer = bm.loops.layers.uv.verify()
    vmap = {v: bm.verts.new(v.co) for v in tbm.verts}
    for f in tbm.faces:
        try:
            nf = bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = mat_idx
            nf.smooth = False
            n = nf.normal
            # Clean triplanar box UV mapped into [0, 1]
            for lp in nf.loops:
                co = lp.vert.co
                if abs(n.z) > 0.7:
                    u, v = co.x * uv_scale[0], co.y * uv_scale[1]
                elif abs(n.x) > 0.7:
                    u, v = co.y * uv_scale[0], co.z * uv_scale[1]
                else:
                    u, v = co.x * uv_scale[0], co.z * uv_scale[1]
                lp[uv_layer].uv = (u * 0.62 + 0.5, v * 0.85)
        except ValueError:
            pass
    tbm.free()


def add_pointed_picket(bm, mat_idx, x, y, w, thick, h, lean_x=0.0, lean_y=0.0):
    """Sculpted handmade pointed wooden picket plank with chamfered top & wood grain UVs."""
    tbm = bmesh.new()
    hw = w * 0.5
    ht = thick * 0.5
    sh = h - 0.09  # shoulder height where picket tapers to a charming point
    # 5-point front & back profiles extruded
    prof = [
        (-hw, 0.0),
        ( hw, 0.0),
        ( hw, sh),
        ( 0.0, h),
        (-hw, sh),
    ]
    front_v = [tbm.verts.new((px, -ht, pz)) for px, pz in prof]
    back_v  = [tbm.verts.new((px,  ht, pz)) for px, pz in prof]
    tbm.faces.new(front_v)
    tbm.faces.new(back_v[::-1])
    for i in range(5):
        j = (i + 1) % 5
        tbm.faces.new((front_v[i], front_v[j], back_v[j], back_v[i]))
    bmesh.ops.recalc_face_normals(tbm, faces=tbm.faces)
    bmesh.ops.bevel(tbm, geom=list(tbm.edges), offset=0.006, segments=1, profile=0.5, affect='EDGES', clamp_overlap=True)
    m = Matrix.Translation((x, y, 0.02)) @ Euler((lean_y, lean_x, 0.0), 'XYZ').to_matrix().to_4x4()
    bmesh.ops.transform(tbm, matrix=m, verts=tbm.verts)

    uv_layer = bm.loops.layers.uv.verify()
    vmap = {v: bm.verts.new(v.co) for v in tbm.verts}
    for f in tbm.faces:
        try:
            nf = bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = mat_idx
            nf.smooth = False
            for lp in nf.loops:
                co = lp.vert.co
                lp[uv_layer].uv = ((co.x + 0.8) / 1.6, co.z / 1.15)
        except ValueError:
            pass
    tbm.free()


def build_fence():
    clear_scene()
    mat_wood = make_textured_wood_mat("fence_wood", TEX_FENCE, tint=(1.0, 0.94, 0.84))
    mat_post = make_textured_wood_mat("fence_post", TEX_FENCE, tint=(0.82, 0.74, 0.64))
    mat_stone = make_solid_mat("fence_stone", (0.58, 0.56, 0.52), roughness=0.82)
    mat_iron = make_solid_mat("fence_iron", (0.20, 0.21, 0.24), roughness=0.50, metallic=0.45)

    bm = bmesh.new()
    bm.loops.layers.uv.verify()

    # 1. Left & right sturdy timber posts with pyramid cap & stone base footing (span = 1.60m -> posts at -0.76, +0.76)
    for px in (-0.76, 0.76):
        # Stone footing collar
        add_bevel_box(bm, 2, (0.19, 0.19, 0.14), loc=(px, 0.0, 0.07), bevel=0.02, segs=2)
        # Main square timber post
        add_bevel_box(bm, 1, (0.125, 0.125, 1.06), loc=(px, 0.0, 0.55), bevel=0.012, segs=2)
        # Chamfered timber cap
        add_bevel_box(bm, 1, (0.155, 0.155, 0.055), loc=(px, 0.0, 1.095), bevel=0.016, segs=2)

    # 2. Dual mortise-and-tenon horizontal crossbars
    for rz in (0.34, 0.78):
        add_bevel_box(bm, 1, (1.56, 0.062, 0.082), loc=(0.0, -0.012, rz), bevel=0.008, segs=1)

    # 3. Seven handmade pointed wooden pickets with subtle Ghibli organic height/tilt variation
    picket_xs = [-0.57, -0.38, -0.19, 0.0, 0.19, 0.38, 0.57]
    height_var = [0.02, -0.015, 0.01, -0.02, 0.025, -0.01, 0.015]
    lean_var   = [0.018, -0.012, 0.008, -0.015, 0.012, -0.018, 0.010]
    for px, dh, lt in zip(picket_xs, height_var, lean_var):
        add_pointed_picket(bm, 0, px, 0.036, 0.135, 0.032, 0.98 + dh, lean_x=lt, lean_y=lt * 0.4)
        # Iron nail heads fixing picket to top & bottom crossbars
        for rz in (0.34, 0.78):
            add_bevel_box(bm, 3, (0.022, 0.014, 0.022), loc=(px, 0.054, rz), bevel=0.004, segs=1)

    mesh = bpy.data.meshes.new("GhibliFence")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for m in (mat_wood, mat_post, mat_stone, mat_iron):
        mesh.materials.append(m)

    obj = bpy.data.objects.new("GhibliFence", mesh)
    bpy.context.collection.objects.link(obj)

    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format='GLB',
        export_apply=True,
        export_normals=True,
        export_texcoords=True,
        export_materials='EXPORT',
    )
    print(f"[EXPORTED] {OUT_GLB} (verts={len(mesh.vertices)}, polys={len(mesh.polygons)})")

    # Quick EEVEE preview render
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 600
    scene.render.filepath = PREVIEW_PNG
    world = bpy.data.worlds.new("W")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.76, 0.86, 0.94, 1.0)
    sun_d = bpy.data.lights.new("Sun", type='SUN')
    sun_d.energy = 3.2
    sun = bpy.data.objects.new("Sun", sun_d)
    sun.rotation_euler = Euler((math.radians(45), 0, math.radians(32)), 'XYZ')
    scene.collection.objects.link(sun)

    # Show 2 connected fence segments on grass plane for preview
    obj2 = obj.copy()
    obj2.location = Vector((1.52, 0, 0))
    scene.collection.objects.link(obj2)
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0.75, 0, 0))
    bpy.context.active_object.data.materials.append(make_solid_mat("gnd", (0.48, 0.68, 0.36), roughness=0.9))

    cam_d = bpy.data.cameras.new("Cam")
    cam_d.lens = 45.0
    cam = bpy.data.objects.new("Cam", cam_d)
    cam.location = Vector((2.2, 2.8, 1.45))
    cam.rotation_euler = (Vector((0.75, 0.0, 0.55)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    build_fence()
