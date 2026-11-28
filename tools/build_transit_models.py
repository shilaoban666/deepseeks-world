"""
High-Craft Ghibli / Shiro of Coal Town (煤炭镇的小白) Transit Models Builder (Blender 5.3)
Builds and exports `public/vehicles/transit.glb` containing:
  1. `Bus37` (+ `Bus37_Door` + `Bus37_Wheel_FL/FR/RL/RR`):
     Retro Showa Japanese community bus ("37路公交") — warm cream-ivory & matcha-forest-green
     livery, warm tangerine waist stripe, glowing front/side route board, full cozy wood-floor
     interior with fabric seats, grab poles, steering wheel, clear panoramic windows & folding door.
  2. `BusStop37`:
     Charming Showa wooden bus shelter with glass rain screen, bench, and classic orange-cream 37路 post.
  3. `Metro1_Head`, `Metro1_Mid`, `Metro1_Tail` (+ `*_Door_L`, `*_Door_R`):
     Sleek Ghibli urban Metro Line 1 ("地铁1号线") — warm brushed silver-cream hull with royal
     violet-plum & gold Line-1 livery, full-width articulated bellows (±7.12m for GAP=14.0m),
     longitudinal cushioned subway benches, brass grab bars with hanging straps, glowing interior
     ceiling lights, and wide animated sliding doors.
  4. `MetroEntrance1`:
     Warm red-brick & vaulted iron-glass Showa subway entrance pavilion with stone stairwell down
     and violet Line-1 fascia sign.
"""

import bpy
import bmesh
import math
import os
import sys
import numpy as np
from mathutils import Matrix, Euler, Vector

OUT_DIR = r"d:\DSH DEMO\deepseek-world\public\vehicles"
TEX_DIR = r"d:\DSH DEMO\deepseek-world\public\textures"
PREVIEW_DIR = r"C:\Users\shilaoban\.gemini\antigravity\brain\8cc60f92-f47e-4a8b-bc27-26a746fb2f13\scratch"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------------------
# Hand-Painted Gouache / Coal-Town Texture Generators (embedded cleanly in GLB)
# ---------------------------------------------------------------------------
def _make_img(name, arr_rgba):
    h, w, _ = arr_rgba.shape
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.pixels.foreach_set(arr_rgba.astype(np.float32).ravel())
    img.pack()
    return img


def load_tex(filename, fallback_fn):
    p = os.path.join(TEX_DIR, filename)
    if os.path.exists(p):
        img = bpy.data.images.load(p, check_existing=True)
        img.pack()
        return img
    return fallback_fn()


def gen_painted_metal(name, size=256, warm=(1.0, 0.99, 0.96)):
    """Soft Miyazaki gouache painted sheet metal with delicate panel seams and brushwork."""
    rng = np.random.default_rng(abs(hash(name)) % (2**31))
    y, x = np.mgrid[0:size, 0:size] / float(size)
    brush = (
        0.032 * np.sin(y * math.pi * 16.0 + np.sin(x * math.pi * 6.0) * 1.4)
        + 0.022 * np.cos(x * math.pi * 10.0 + y * math.pi * 4.0)
        + 0.015 * np.sin((x + y) * math.pi * 24.0)
    )
    grain = rng.normal(0.0, 0.014, (size, size))
    val = np.clip(0.93 + brush + grain, 0.78, 1.0)
    # Subtle horizontal & vertical coachwork panel seams
    for pos in (0.0, 0.5):
        seam_v = np.exp(-((np.minimum(np.abs(x - pos), 1.0 - np.abs(x - pos))) / 0.0055) ** 2)
        val -= 0.07 * seam_v
    seam_h = np.exp(-((np.abs(y - 0.5)) / 0.005) ** 2)
    val -= 0.05 * seam_h
    arr = np.ones((size, size, 4), dtype=np.float32)
    arr[:, :, 0] = np.clip(val * warm[0], 0.55, 1.0)
    arr[:, :, 1] = np.clip(val * warm[1], 0.55, 1.0)
    arr[:, :, 2] = np.clip(val * warm[2], 0.55, 1.0)
    return _make_img(name, arr)


def gen_fabric_tex(name, size=256):
    """Cozy woven Japanese transit plush moquette seat texture."""
    rng = np.random.default_rng(707)
    y, x = np.mgrid[0:size, 0:size] / float(size)
    weave = 0.05 * np.sin(x * math.pi * 48.0) * np.sin(y * math.pi * 48.0)
    stripe = 0.035 * np.sin((x + y) * math.pi * 16.0)
    grain = rng.normal(0.0, 0.018, (size, size))
    v = np.clip(0.88 + weave + stripe + grain, 0.68, 1.0)
    arr = np.ones((size, size, 4), dtype=np.float32)
    arr[:, :, 0] = v
    arr[:, :, 1] = v * 0.99
    arr[:, :, 2] = v * 0.97
    return _make_img(name, arr)


def gen_rubber_tex(name, size=128):
    rng = np.random.default_rng(404)
    y, x = np.mgrid[0:size, 0:size] / float(size)
    tread = 0.06 * np.sin(x * math.pi * 32.0) + rng.normal(0.0, 0.025, (size, size))
    v = np.clip(0.84 + tread, 0.62, 0.98)
    arr = np.ones((size, size, 4), dtype=np.float32)
    arr[:, :, 0] = arr[:, :, 1] = arr[:, :, 2] = v
    return _make_img(name, arr)


def gen_brick_tex(name, size=256):
    """Warm hand-painted Showa brick texture for Metro Line 1 entrance kiosks."""
    rng = np.random.default_rng(919)
    y, x = np.mgrid[0:size, 0:size] / float(size)
    rows = 12.0
    cols = 6.0
    ry = y * rows
    row_i = np.floor(ry)
    rx = x * cols + 0.5 * (row_i % 2)
    fx = rx - np.floor(rx)
    fy = ry - row_i
    mortar = ((fx < 0.06) | (fx > 0.94) | (fy < 0.10) | (fy > 0.90)).astype(np.float32)
    # Per-brick warm tonal variation
    cid = (np.floor(rx).astype(np.int32) * 37 + row_i.astype(np.int32) * 17) % 11
    var = 0.84 + (cid / 11.0) * 0.22 + rng.normal(0.0, 0.015, (size, size))
    arr = np.ones((size, size, 4), dtype=np.float32)
    # Mortar is light cream stone; brick is warm terracotta
    arr[:, :, 0] = np.clip(var * (1.0 - mortar) + 0.92 * mortar, 0.5, 1.0)
    arr[:, :, 1] = np.clip(var * 0.72 * (1.0 - mortar) + 0.88 * mortar, 0.4, 1.0)
    arr[:, :, 2] = np.clip(var * 0.60 * (1.0 - mortar) + 0.80 * mortar, 0.35, 1.0)
    return _make_img(name, arr)


def make_mat(name, color, roughness=0.52, metallic=0.0, alpha=1.0, emission=0.0, image=None):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if image is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[7].default_value = (color[0], color[1], color[2], 1.0)
        nt.links.new(tex.outputs["Color"], mix.inputs[6])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if alpha < 0.99:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else 'HASHED'
    if emission > 0.0:
        bsdf.inputs["Emission Color"].default_value = (color[0], color[1], color[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


# ---------------------------------------------------------------------------
# Clean BMesh Builder with Triplanar UVs (identical craftsmanship to vehicles)
# ---------------------------------------------------------------------------
class PartBuilder:
    def __init__(self, name, mat_dict):
        self.name = name
        self.mat_dict = mat_dict
        self.mat_order = list(mat_dict.keys())
        self.mat_index = {k: i for i, k in enumerate(self.mat_order)}
        self.bm = bmesh.new()
        self.bm.loops.layers.uv.verify()

    def _merge(self, tbm, loc, rot, mat, smooth=False, uv_scale=0.65):
        if rot != (0, 0, 0):
            bmesh.ops.rotate(tbm, verts=tbm.verts, cent=(0, 0, 0), matrix=Euler(rot, 'XYZ').to_matrix())
        if loc != (0, 0, 0):
            bmesh.ops.translate(tbm, verts=tbm.verts, vec=Vector(loc))
        tbm.normal_update()
        idx = self.mat_index[mat]
        uv_layer = self.bm.loops.layers.uv.verify()
        vmap = {}
        for v in tbm.verts:
            vmap[v] = self.bm.verts.new(v.co)
        for f in tbm.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
                nf.material_index = idx
                nf.smooth = smooth
                no = f.normal
                ax, ay, az = abs(no.x), abs(no.y), abs(no.z)
                for loop in nf.loops:
                    co = loop.vert.co
                    if az >= ax and az >= ay:
                        u, v = co.x * uv_scale, co.y * uv_scale
                    elif ax >= ay:
                        u, v = co.y * uv_scale, co.z * uv_scale
                    else:
                        u, v = co.x * uv_scale, co.z * uv_scale
                    loop[uv_layer].uv = (u, v)
            except ValueError:
                pass
        tbm.free()

    def box(self, size, loc=(0, 0, 0), rot=(0, 0, 0), mat="cream", bevel=0.0, segs=2, smooth=False, uv_scale=0.55):
        tbm = bmesh.new()
        bmesh.ops.create_cube(tbm, size=1.0)
        bmesh.ops.scale(tbm, vec=Vector(size), verts=tbm.verts)
        if bevel > 0.0:
            bmesh.ops.bevel(tbm, geom=list(tbm.edges), offset=bevel, segments=segs, affect='EDGES', clamp_overlap=True)
        self._merge(tbm, loc, rot, mat, smooth, uv_scale)

    def cyl(self, r1, r2, h, segs=16, loc=(0, 0, 0), rot=(0, 0, 0), mat="dark", smooth=True, uv_scale=0.6):
        tbm = bmesh.new()
        bmesh.ops.create_cone(tbm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h)
        self._merge(tbm, loc, rot, mat, smooth, uv_scale)

    def sphere(self, r, loc=(0, 0, 0), scale=(1, 1, 1), mat="glow", u=14, v=10, smooth=True):
        tbm = bmesh.new()
        bmesh.ops.create_uvsphere(tbm, u_segments=u, v_segments=v, radius=r)
        if scale != (1, 1, 1):
            bmesh.ops.scale(tbm, vec=Vector(scale), verts=tbm.verts)
        self._merge(tbm, loc, (0, 0, 0), mat, smooth, 0.8)

    def torus(self, maj_r, min_r, maj_segs=18, min_segs=8, loc=(0, 0, 0), rot=(0, 0, 0), mat="gold", smooth=True):
        tbm = bmesh.new()
        rings = []
        for i in range(maj_segs):
            a = 2.0 * math.pi * i / maj_segs
            ca, sa = math.cos(a), math.sin(a)
            ring = []
            for j in range(min_segs):
                b = 2.0 * math.pi * j / min_segs
                cb, sb = math.cos(b), math.sin(b)
                rr = maj_r + min_r * cb
                ring.append(tbm.verts.new((rr * ca, rr * sa, min_r * sb)))
            rings.append(ring)
        for i in range(maj_segs):
            r0, r1 = rings[i], rings[(i + 1) % maj_segs]
            for j in range(min_segs):
                jn = (j + 1) % min_segs
                try:
                    tbm.faces.new((r0[j], r1[j], r1[jn], r0[jn]))
                except ValueError:
                    pass
        self._merge(tbm, loc, rot, mat, smooth, 0.8)

    def tube(self, p0, p1, r0, r1=None, segs=8, mat="gold", smooth=True):
        if r1 is None:
            r1 = r0
        v0, v1 = Vector(p0), Vector(p1)
        d = v1 - v0
        L = d.length
        if L < 1e-5:
            return
        mid = (v0 + v1) * 0.5
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        self.cyl(r0, r1, L, segs=segs, loc=tuple(mid), rot=tuple(q.to_euler('XYZ')), mat=mat, smooth=smooth)

    def loft(self, rings, mat="cream", cap_start=True, cap_end=True, smooth=True, uv_scale=0.55):
        tbm = bmesh.new()
        bm_rings = [[tbm.verts.new(p) for p in ring] for ring in rings]
        n = len(bm_rings[0])
        for i in range(len(bm_rings) - 1):
            r0, r1 = bm_rings[i], bm_rings[i + 1]
            for j in range(n):
                jn = (j + 1) % n
                try:
                    tbm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
                except ValueError:
                    pass
        if cap_start:
            try:
                tbm.faces.new(list(reversed(bm_rings[0])))
            except ValueError:
                pass
        if cap_end:
            try:
                tbm.faces.new(bm_rings[-1])
            except ValueError:
                pass
        bmesh.ops.recalc_face_normals(tbm, faces=tbm.faces)
        self._merge(tbm, (0, 0, 0), (0, 0, 0), mat, smooth, uv_scale)

    def build_object(self, parent=None):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for k in self.mat_order:
            mesh.materials.append(self.mat_dict[k])
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        if parent is not None:
            obj.parent = parent
        return obj


def rounded_rect_ring(y, hw, z_bot, z_top, r_bot=0.14, r_top=0.28, crown=0.06):
    return [
        (-hw + r_bot, y, z_bot),
        ( hw - r_bot, y, z_bot),
        ( hw, y, z_bot + r_bot),
        ( hw, y, z_top - r_top),
        ( hw - r_top * 0.45, y, z_top - r_top * 0.16),
        ( hw - r_top, y, z_top),
        ( 0.0, y, z_top + crown),
        (-hw + r_top, y, z_top),
        (-hw + r_top * 0.45, y, z_top - r_top * 0.16),
        (-hw, y, z_top - r_top),
        (-hw, y, z_bot + r_bot),
    ]


# ---------------------------------------------------------------------------
# Materials Palette (Miyazaki / Shiro of Coal Town Warm Gouache)
# ---------------------------------------------------------------------------
def build_materials():
    tex_paint = gen_painted_metal("tex_transit_paint")
    tex_silver = gen_painted_metal("tex_metro_silver", warm=(0.98, 0.98, 1.0))
    tex_wood = load_tex("wood0.png", lambda: gen_painted_metal("tex_wood_fb", warm=(0.9, 0.78, 0.6)))
    tex_fabric = load_tex("fabric.png", lambda: gen_fabric_tex("tex_fab_fb"))
    tex_rubber = gen_rubber_tex("tex_transit_rubber")
    tex_brick = gen_brick_tex("tex_metro_brick")
    tex_slate = load_tex("roof10.png", lambda: gen_painted_metal("tex_slate_fb", warm=(0.8, 0.85, 0.92)))

    return {
        "cream":      make_mat("tr_cream",      (0.96, 0.92, 0.82), roughness=0.40, image=tex_paint),
        "silver":     make_mat("tr_silver",     (0.90, 0.91, 0.93), roughness=0.34, metallic=0.14, image=tex_silver),
        "bus_green":  make_mat("tr_bus_green",  (0.20, 0.46, 0.34), roughness=0.42, image=tex_paint),
        "bus_orange": make_mat("tr_bus_orange", (0.90, 0.56, 0.20), roughness=0.38, image=tex_paint),
        "violet":     make_mat("tr_violet",     (0.42, 0.28, 0.68), roughness=0.38, image=tex_paint),
        "coral":      make_mat("tr_coral",      (0.84, 0.38, 0.32), roughness=0.42, image=tex_paint),
        "gold":       make_mat("tr_gold",       (0.88, 0.70, 0.28), roughness=0.32, metallic=0.36, image=tex_paint),
        "dark":       make_mat("tr_dark",       (0.20, 0.22, 0.25), roughness=0.66, image=tex_rubber),
        "rubber":     make_mat("tr_rubber",     (0.14, 0.15, 0.17), roughness=0.82, image=tex_rubber),
        "wood":       make_mat("tr_wood",       (0.84, 0.72, 0.54), roughness=0.66, image=tex_wood),
        "wood_dark":  make_mat("tr_wood_dark",  (0.52, 0.38, 0.25), roughness=0.72, image=tex_wood),
        "seat_green": make_mat("tr_seat_green", (0.28, 0.54, 0.42), roughness=0.74, image=tex_fabric),
        "seat_plum":  make_mat("tr_seat_plum",  (0.54, 0.32, 0.58), roughness=0.74, image=tex_fabric),
        "brick":      make_mat("tr_brick",      (0.86, 0.54, 0.42), roughness=0.76, image=tex_brick),
        "roof":       make_mat("tr_roof",       (0.46, 0.54, 0.62), roughness=0.62, image=tex_slate),
        "glass":      make_mat("tr_glass",      (0.58, 0.80, 0.92), roughness=0.10, alpha=0.36),
        "glow":       make_mat("tr_glow",       (1.00, 0.94, 0.72), roughness=0.18, emission=2.6),
        "glow_amber": make_mat("tr_glow_amber", (1.00, 0.76, 0.30), roughness=0.20, emission=2.2),
        "glow_red":   make_mat("tr_glow_red",   (0.95, 0.28, 0.24), roughness=0.22, emission=2.0),
    }


# ---------------------------------------------------------------------------
# 1. Retro Showa "37路公交" (Bus37 + animated Door + 4 Wheels)
#    Length 8.6m (y in [-4.3, +4.3]), Width 2.44m (x in [-1.22, +1.22]), Height 3.05m
#    Blender +Y is forward (Three.js +Z after 180 deg wrap rotation)
# ---------------------------------------------------------------------------
def build_bus37(mats):
    pb = PartBuilder("Bus37", mats)
    hw = 1.22
    y0, y1 = -4.30, 4.30

    # Chassis & warm wooden cabin floor
    pb.box((2.32, 8.35, 0.26), loc=(0, 0, 0.50), mat="dark", bevel=0.05)
    pb.box((2.28, 8.20, 0.06), loc=(0, 0, 0.65), mat="wood", bevel=0.01)
    # Non-slip aisle runner
    pb.box((0.72, 7.60, 0.02), loc=(0, -0.1, 0.69), mat="bus_green", bevel=0.005)

    # Rounded retro Showa roof dome (hollow lofted shell so interior is spacious & clean!)
    roof_stations = []
    for y in (y0 + 0.05, y0 + 0.45, 0.0, y1 - 0.55, y1 - 0.08):
        inset = 0.08 if (y <= y0 + 0.1 or y >= y1 - 0.12) else 0.0
        w = hw - inset
        roof_stations.append([
            (-w, y, 2.42), (-w + 0.08, y, 2.70), (-w + 0.28, y, 2.90), (-0.48, y, 2.98), (0.0, y, 3.01),
            (0.48, y, 2.98), (w - 0.28, y, 2.90), (w - 0.08, y, 2.70), (w, y, 2.42),
            (w - 0.11, y, 2.42), (w - 0.30, y, 2.80), (0.0, y, 2.89), (-w + 0.30, y, 2.80), (-w + 0.11, y, 2.42),
        ])
    pb.loft(roof_stations, mat="cream")
    # Retro roof AC pod + luggage rack rails + front destination visor
    pb.box((1.32, 2.10, 0.22), loc=(0, -0.35, 3.07), mat="cream", bevel=0.08, segs=2)
    pb.box((1.12, 1.75, 0.06), loc=(0, -0.35, 3.19), mat="bus_green", bevel=0.02)
    pb.box((1.65, 0.38, 0.32), loc=(0, y1 - 0.16, 2.68), mat="bus_green", bevel=0.06)
    pb.box((1.28, 0.06, 0.20), loc=(0, y1 + 0.04, 2.68), mat="glow_amber", bevel=0.015)

    # Left side wall (-X, continuous with 5 big panoramic windows)
    lx = -hw + 0.06
    pb.box((0.12, 8.36, 0.86), loc=(lx, 0.0, 1.02), mat="bus_green", bevel=0.025)
    pb.box((0.14, 8.36, 0.14), loc=(lx, 0.0, 1.44), mat="bus_orange", bevel=0.015)
    pb.box((0.135, 8.36, 0.05), loc=(lx, 0.0, 1.54), mat="gold", bevel=0.008)
    pb.box((0.12, 8.36, 0.14), loc=(lx, 0.0, 2.38), mat="cream", bevel=0.02)
    pb.box((0.04, 7.90, 0.84), loc=(lx, 0.0, 1.94), mat="glass", bevel=0.01)
    for py in (-4.12, -2.50, -0.88, 0.74, 2.36, 3.98):
        pb.box((0.14, 0.18, 0.90), loc=(lx, py, 1.94), mat="cream", bevel=0.02)
        pb.box((0.15, 0.05, 0.86), loc=(lx, py, 1.94), mat="dark", bevel=0.008)

    # Right side wall (+X, with wide boarding doorway at y in [1.95, 3.15]!)
    rx = hw - 0.06
    for seg_y0, seg_y1 in ((y0 + 0.12, 1.95), (3.15, y1 - 0.12)):
        slen = seg_y1 - seg_y0
        scy = (seg_y0 + seg_y1) * 0.5
        pb.box((0.12, slen, 0.86), loc=(rx, scy, 1.02), mat="bus_green", bevel=0.025)
        pb.box((0.14, slen, 0.14), loc=(rx, scy, 1.44), mat="bus_orange", bevel=0.015)
        pb.box((0.135, slen, 0.05), loc=(rx, scy, 1.54), mat="gold", bevel=0.008)
        pb.box((0.12, slen, 0.14), loc=(rx, scy, 2.38), mat="cream", bevel=0.02)
        pb.box((0.04, max(0.2, slen - 0.16), 0.84), loc=(rx, scy, 1.94), mat="glass", bevel=0.01)
    for py in (-4.12, -2.50, -0.88, 0.74, 1.92, 3.18, 4.10):
        pb.box((0.14, 0.18, 0.90), loc=(rx, py, 1.94), mat="cream", bevel=0.02)
        pb.box((0.15, 0.05, 0.86), loc=(rx, py, 1.94), mat="dark", bevel=0.008)
    # Doorway top header, amber boarding lamp & brass step plate
    pb.box((0.13, 1.24, 0.16), loc=(rx, 2.55, 2.38), mat="cream", bevel=0.02)
    pb.box((0.16, 0.56, 0.09), loc=(rx, 2.55, 2.38), mat="glow_amber", bevel=0.01)
    pb.box((0.22, 1.22, 0.06), loc=(rx, 2.55, 0.64), mat="gold", bevel=0.01)
    # Side route number plate ("37路")
    pb.box((0.06, 0.74, 0.30), loc=(rx + 0.06, 1.25, 1.18), mat="cream", bevel=0.015)
    pb.box((0.07, 0.66, 0.22), loc=(rx + 0.065, 1.25, 1.18), mat="bus_orange", bevel=0.01)

    # Front face (+Y): cute rounded Showa bus nose, split windshield, chrome grille, round headlights!
    pb.box((2.40, 0.22, 0.90), loc=(0, y1 - 0.02, 1.04), mat="bus_green", bevel=0.08, segs=3)
    pb.box((2.44, 0.24, 0.15), loc=(0, y1 - 0.01, 1.45), mat="bus_orange", bevel=0.04)
    pb.box((2.46, 0.24, 0.18), loc=(0, y1 + 0.08, 0.56), mat="silver", bevel=0.05)
    # Front split panoramic windshield
    pb.box((2.16, 0.06, 0.88), loc=(0, y1 - 0.02, 1.96), mat="glass", bevel=0.01)
    pb.box((0.08, 0.12, 0.92), loc=(0, y1 + 0.01, 1.96), mat="cream", bevel=0.015)
    for sx in (-1, 1):
        pb.box((0.14, 0.16, 0.94), loc=(sx * 1.14, y1 - 0.02, 1.96), mat="cream", bevel=0.03)
        # Cute round retro headlights with chrome bezels
        pb.sphere(0.15, loc=(sx * 0.84, y1 + 0.10, 0.96), scale=(1.0, 0.55, 1.0), mat="glow")
        pb.torus(0.16, 0.026, maj_segs=16, min_segs=6, loc=(sx * 0.84, y1 + 0.11, 0.96), rot=(math.pi * 0.5, 0, 0), mat="silver")
        # Amber turn signals
        pb.sphere(0.075, loc=(sx * 1.06, y1 + 0.08, 1.16), scale=(1.0, 0.6, 1.0), mat="glow_amber")
        # Retro tall side mirrors on curved stalks
        pb.tube((sx * 1.18, y1 - 0.05, 1.75), (sx * 1.42, y1 + 0.18, 1.92), 0.016, 0.016, mat="dark")
        pb.box((0.08, 0.14, 0.30), loc=(sx * 1.43, y1 + 0.20, 1.94), mat="dark", bevel=0.02)
    # Front classic horizontal grille bars
    pb.box((1.06, 0.08, 0.40), loc=(0, y1 + 0.08, 0.96), mat="dark", bevel=0.02)
    for gz in (0.84, 0.92, 1.00, 1.08):
        pb.box((0.98, 0.10, 0.028), loc=(0, y1 + 0.10, gz), mat="silver", bevel=0.006)
    # Front golden badge
    pb.sphere(0.08, loc=(0, y1 + 0.10, 1.32), scale=(1.5, 0.5, 1.0), mat="gold")

    # Rear face (-Y): cozy rear window, engine louvers, bumper & tail lamps
    pb.box((2.40, 0.20, 0.92), loc=(0, y0 + 0.02, 1.04), mat="bus_green", bevel=0.07, segs=3)
    pb.box((2.44, 0.22, 0.14), loc=(0, y0 + 0.01, 1.45), mat="bus_orange", bevel=0.04)
    pb.box((2.46, 0.22, 0.18), loc=(0, y0 - 0.06, 0.56), mat="silver", bevel=0.05)
    pb.box((1.90, 0.06, 0.80), loc=(0, y0 + 0.02, 1.94), mat="glass", bevel=0.01)
    for sx in (-1, 1):
        pb.box((0.22, 0.16, 0.88), loc=(sx * 1.08, y0 + 0.02, 1.94), mat="cream", bevel=0.03)
        pb.box((0.12, 0.08, 0.26), loc=(sx * 0.96, y0 - 0.08, 0.98), mat="glow_red", bevel=0.02)
        pb.box((0.10, 0.08, 0.12), loc=(sx * 0.96, y0 - 0.08, 1.20), mat="glow_amber", bevel=0.015)

    # Wheel arches dark recess
    for wy in (-2.55, 2.55):
        for sx in (-1, 1):
            pb.cyl(0.54, 0.54, 0.20, segs=18, loc=(sx * (hw - 0.06), wy, 0.48), rot=(0, math.pi * 0.5, 0), mat="dark")

    # Cozy interior: driver dashboard + steering wheel + passenger green-fabric seats + brass handrails + dome lights!
    pb.box((0.92, 0.52, 0.64), loc=(-0.56, 3.68, 0.98), mat="dark", bevel=0.04)
    pb.torus(0.22, 0.026, maj_segs=18, min_segs=6, loc=(-0.56, 3.36, 1.32), rot=(math.radians(52), 0, 0), mat="wood_dark")
    pb.tube((-0.56, 3.55, 0.95), (-0.56, 3.36, 1.32), 0.026, 0.026, mat="dark")
    # Passenger seat rows (left side 5 rows, right side 4 rows behind doorway + full rear bench!)
    for sy in (-2.9, -1.7, -0.5, 0.7, 1.9):
        for sx in (-1, 1):
            if sx == 1 and sy > 1.2:
                continue
            cx = sx * 0.72
            pb.box((0.68, 0.48, 0.12), loc=(cx, sy, 1.02), mat="seat_green", bevel=0.04)
            pb.box((0.68, 0.12, 0.58), loc=(cx, sy - 0.20, 1.36), rot=(-0.12, 0, 0), mat="seat_green", bevel=0.04)
            pb.box((0.46, 0.34, 0.30), loc=(cx, sy, 0.82), mat="dark", bevel=0.02)
    # Full rear bench seat
    pb.box((2.06, 0.50, 0.14), loc=(0, -3.72, 1.04), mat="seat_green", bevel=0.04)
    pb.box((2.06, 0.12, 0.62), loc=(0, -3.96, 1.38), rot=(-0.10, 0, 0), mat="seat_green", bevel=0.04)
    # Brass overhead grab rails & hanging straps + ceiling dome lights
    for sx in (-0.42, 0.42):
        pb.tube((sx, -3.4, 2.52), (sx, 2.8, 2.52), 0.016, 0.016, mat="gold")
        for hy in (-2.6, -1.4, -0.2, 1.0, 2.2):
            pb.tube((sx, hy, 2.52), (sx, hy, 2.28), 0.008, 0.008, mat="cream")
            pb.torus(0.055, 0.012, maj_segs=12, min_segs=6, loc=(sx, hy, 2.22), rot=(0, math.pi * 0.5, 0), mat="cream")
    for ly in (-2.6, -0.5, 1.6, 3.2):
        pb.sphere(0.16, loc=(0, ly, 2.82), scale=(1.3, 1.0, 0.35), mat="glow")

    bus_obj = pb.build_object()

    # Animated folding side door ("Bus37_Door")
    dpb = PartBuilder("Bus37_Door", mats)
    dx = hw - 0.03
    dpb.box((0.07, 1.16, 0.84), loc=(dx, 2.55, 1.04), mat="bus_green", bevel=0.015)
    dpb.box((0.08, 1.16, 0.14), loc=(dx, 2.55, 1.44), mat="bus_orange", bevel=0.01)
    dpb.box((0.07, 0.16, 0.84), loc=(dx, 2.05, 1.94), mat="cream", bevel=0.015)
    dpb.box((0.07, 0.16, 0.84), loc=(dx, 3.05, 1.94), mat="cream", bevel=0.015)
    dpb.box((0.07, 1.16, 0.12), loc=(dx, 2.55, 2.30), mat="cream", bevel=0.015)
    dpb.box((0.03, 0.86, 0.78), loc=(dx, 2.55, 1.92), mat="glass", bevel=0.008)
    dpb.box((0.08, 0.03, 1.68), loc=(dx, 2.55, 1.48), mat="dark", bevel=0.005)
    dpb.build_object(parent=bus_obj)

    # 4 Spinning retro whitewall-trim wheels
    for tag, sx, wy in (("FL", -1, 2.55), ("FR", 1, 2.55), ("RL", -1, -2.55), ("RR", 1, -2.55)):
        wpb = PartBuilder(f"Bus37_Wheel_{tag}", mats)
        wpb.cyl(0.45, 0.45, 0.28, segs=22, rot=(0, math.pi * 0.5, 0), mat="rubber")
        wpb.cyl(0.28, 0.28, 0.29, segs=18, rot=(0, math.pi * 0.5, 0), mat="cream")
        wpb.cyl(0.18, 0.18, 0.31, segs=16, rot=(0, math.pi * 0.5, 0), mat="bus_green")
        wpb.cyl(0.09, 0.09, 0.33, segs=12, rot=(0, math.pi * 0.5, 0), mat="silver")
        wobj = wpb.build_object(parent=bus_obj)
        wobj.location = Vector((sx * (hw - 0.14), wy, 0.45))

    return bus_obj


# ---------------------------------------------------------------------------
# 2. Showa Wooden 37路 Bus Shelter ("BusStop37")
# ---------------------------------------------------------------------------
def build_bus_stop37(mats):
    pb = PartBuilder("BusStop37", mats)
    # Stone curb base
    pb.box((4.4, 1.9, 0.16), loc=(0, 0, 0.08), mat="silver", bevel=0.03)
    # Timber posts & rear cozy wind-screen with glass pane
    for sx in (-1.65, 1.65):
        pb.box((0.16, 0.16, 2.55), loc=(sx, -0.62, 1.40), mat="wood_dark", bevel=0.02)
        pb.box((0.14, 0.14, 2.38), loc=(sx,  0.52, 1.32), mat="wood_dark", bevel=0.02)
    pb.box((3.30, 0.10, 0.90), loc=(0, -0.62, 0.62), mat="wood", bevel=0.02)
    pb.box((3.20, 0.05, 1.25), loc=(0, -0.62, 1.72), mat="glass", bevel=0.01)
    pb.box((3.40, 0.12, 0.12), loc=(0, -0.62, 2.40), mat="wood_dark", bevel=0.02)
    # Slanted slate roof with warm wooden eaves
    pb.box((3.95, 1.75, 0.14), loc=(0, -0.05, 2.66), rot=(0.14, 0, 0), mat="wood_dark", bevel=0.02)
    pb.box((4.15, 1.92, 0.12), loc=(0, -0.05, 2.78), rot=(0.14, 0, 0), mat="roof", bevel=0.03)
    # Waiting bench
    pb.box((2.50, 0.48, 0.09), loc=(0, -0.24, 0.56), mat="wood", bevel=0.02)
    for sx in (-0.95, 0.95):
        pb.box((0.10, 0.42, 0.44), loc=(sx, -0.24, 0.32), mat="wood_dark", bevel=0.015)
    # Classic Japanese lollipop bus-stop sign pole (right side, orange-cream disc!)
    pb.cyl(0.045, 0.045, 2.45, segs=10, loc=(2.05, 0.45, 1.26), mat="dark")
    pb.cyl(0.22, 0.26, 0.14, segs=12, loc=(2.05, 0.45, 0.14), mat="silver")
    pb.cyl(0.32, 0.32, 0.06, segs=22, loc=(2.05, 0.45, 2.48), rot=(math.pi * 0.5, 0, 0), mat="bus_orange")
    pb.cyl(0.25, 0.25, 0.07, segs=22, loc=(2.05, 0.45, 2.48), rot=(math.pi * 0.5, 0, 0), mat="cream")
    # Route timetable box
    pb.box((0.38, 0.08, 0.54), loc=(2.05, 0.45, 1.56), mat="bus_green", bevel=0.015)
    pb.box((0.30, 0.09, 0.44), loc=(2.05, 0.45, 1.56), mat="cream", bevel=0.01)
    # Warm shelter lantern
    pb.sphere(0.11, loc=(0, 0.0, 2.48), scale=(1.0, 1.0, 0.65), mat="glow_amber")
    return pb.build_object()


# ---------------------------------------------------------------------------
# 3. Ghibli Urban "地铁1号线" (Metro1_Head, Metro1_Mid, Metro1_Tail + Doors)
#    Length 13.6m (y in [-6.8, +6.8]), full-width accordion bellows to ±7.12m (GAP=14.0m!)
# ---------------------------------------------------------------------------
def build_metro_car(name, mats, role="mid"):
    pb = PartBuilder(name, mats)
    hw = 1.44
    y0, y1 = -6.8, 6.8

    # Underbody chassis, streamlined side skirts & cozy floor
    pb.box((2.76, 13.5, 0.34), loc=(0, 0, 0.48), mat="dark", bevel=0.05)
    for sx in (-1, 1):
        for sy0, sy1 in ((-6.7, -5.6), (-3.1, 3.1), (5.6, 6.7)):
            pb.box((0.10, sy1 - sy0, 0.40), loc=(sx * (hw - 0.05), (sy0 + sy1) * 0.5, 0.48), mat="dark", bevel=0.02)
    pb.box((2.68, 13.4, 0.06), loc=(0, 0, 0.66), mat="wood", bevel=0.01)
    pb.box((1.05, 13.2, 0.02), loc=(0, 0, 0.695), mat="cream", bevel=0.005)

    # Bogies at y = ±4.4
    for cy in (-4.4, 4.4):
        pb.box((1.88, 2.20, 0.22), loc=(0, cy, 0.36), mat="dark", bevel=0.03)
        for sx in (-1, 1):
            for wy in (-0.78, 0.78):
                pb.cyl(0.36, 0.36, 0.12, segs=18, loc=(sx * 0.78, cy + wy, 0.36), rot=(0, math.pi * 0.5, 0), mat="dark")
                pb.cyl(0.16, 0.16, 0.15, segs=12, loc=(sx * 0.78, cy + wy, 0.36), rot=(0, math.pi * 0.5, 0), mat="gold")

    # Smooth vaulted metro roof shell
    roof_stations = []
    for y in (y0, y0 + 0.4, 0.0, y1 - 0.4, y1):
        roof_stations.append([
            (-hw, y, 2.66), (-hw + 0.08, y, 2.94), (-hw + 0.30, y, 3.16), (-0.58, y, 3.28), (0.0, y, 3.31),
            (0.58, y, 3.28), (hw - 0.30, y, 3.16), (hw - 0.08, y, 2.94), (hw, y, 2.66),
            (hw - 0.13, y, 2.66), (hw - 0.34, y, 3.04), (0.0, y, 3.16), (-hw + 0.34, y, 3.04), (-hw + 0.13, y, 2.66),
        ])
    pb.loft(roof_stations, mat="silver")
    # Roof AC shrouds & urban pantograph on mid car
    pb.box((1.52, 2.80, 0.22), loc=(0, -3.1, 3.35), mat="silver", bevel=0.08, segs=2)
    pb.box((1.52, 2.80, 0.22), loc=(0,  3.1, 3.35), mat="silver", bevel=0.08, segs=2)
    if role == "mid":
        pb.box((0.88, 1.02, 0.10), loc=(0, 0.0, 3.35), mat="dark", bevel=0.02)
        for sx in (-0.28, 0.28):
            pb.tube((sx, -0.26, 3.40), (sx, 0.28, 3.72), 0.020, 0.020, mat="gold")
            pb.tube((sx,  0.28, 3.72), (sx, -0.16, 4.02), 0.018, 0.018, mat="gold")
        pb.box((1.18, 0.10, 0.05), loc=(0, -0.16, 4.04), mat="dark", bevel=0.015)

    # Side walls with Line-1 Royal Violet & Gold stripes + wide panoramic subway windows + central double door bay!
    for sx in (-1, 1):
        wx = sx * (hw - 0.07)
        for seg_y0, seg_y1 in ((y0, -0.98), (0.98, y1)):
            slen = seg_y1 - seg_y0
            scy = (seg_y0 + seg_y1) * 0.5
            pb.box((0.14, slen, 0.86), loc=(wx, scy, 1.10), mat="silver", bevel=0.02)
            # Signature Metro Line-1 Violet + Gold waist stripe
            pb.box((0.165, slen, 0.28), loc=(wx, scy, 1.04), mat="violet", bevel=0.015)
            pb.box((0.17, slen, 0.07), loc=(wx, scy, 1.24), mat="gold", bevel=0.01)
            pb.box((0.14, slen, 0.26), loc=(wx, scy, 2.58), mat="silver", bevel=0.02)
            pb.box((0.165, slen, 0.12), loc=(wx, scy, 2.58), mat="violet", bevel=0.01)
            pb.box((0.155, slen - 0.08, 0.06), loc=(wx, scy, 1.52), mat="dark", bevel=0.01)
            pb.box((0.155, slen - 0.08, 0.06), loc=(wx, scy, 2.45), mat="dark", bevel=0.01)
            pb.box((0.04, slen - 0.16, 0.92), loc=(wx, scy, 1.98), mat="glass", bevel=0.01)
            for k in range(4):
                py = seg_y0 + 0.14 + (slen - 0.28) * (k / 3.0)
                pb.box((0.16, 0.22, 0.98), loc=(wx, py, 1.98), mat="silver", bevel=0.02)
                pb.box((0.17, 0.05, 0.94), loc=(wx, py, 1.98), mat="dark", bevel=0.008)
        # Door header LED + golden threshold
        pb.box((0.15, 2.00, 0.26), loc=(wx, 0.0, 2.58), mat="silver", bevel=0.02)
        pb.box((0.17, 1.18, 0.12), loc=(wx, 0.0, 2.58), mat="glow", bevel=0.015)
        pb.box((0.19, 2.00, 0.06), loc=(wx, 0.0, 0.67), mat="gold", bevel=0.01)

    # Authentic Japanese subway interior: longitudinal plum-cushioned benches along BOTH walls + brass strap bars + hanging rings!
    for sx in (-1, 1):
        bx = sx * 1.06
        for by in (-3.95, 3.95):
            # Bench base, seat cushion & backrest
            pb.box((0.50, 5.10, 0.34), loc=(bx, by, 0.84), mat="silver", bevel=0.02)
            pb.box((0.56, 5.10, 0.12), loc=(bx - sx * 0.04, by, 1.05), mat="seat_plum", bevel=0.04)
            pb.box((0.12, 5.10, 0.56), loc=(bx + sx * 0.22, by, 1.38), mat="seat_plum", bevel=0.04)
            # Brass handpole dividers at ends of bench
            for ey in (by - 2.56, by + 2.56):
                pb.tube((bx - sx * 0.24, ey, 0.68), (bx - sx * 0.24, ey, 2.56), 0.018, 0.018, mat="gold")
        # Overhead grab rail & hanging subway straps (吊环!)
        pb.tube((sx * 0.56, -6.1, 2.48), (sx * 0.56, 6.1, 2.48), 0.018, 0.018, mat="gold")
        for hy in (-5.4, -4.4, -3.4, -2.4, -1.4, 1.4, 2.4, 3.4, 4.4, 5.4):
            pb.tube((sx * 0.56, hy, 2.48), (sx * 0.56, hy, 2.22), 0.008, 0.008, mat="cream")
            pb.torus(0.06, 0.013, maj_segs=12, min_segs=6, loc=(sx * 0.56, hy, 2.15), rot=(0, math.pi * 0.5, 0), mat="cream")
    # Warm cabin ceiling strip lights
    for ly in (-5.2, -3.0, -0.8, 0.8, 3.0, 5.2):
        pb.box((2.20, 0.10, 0.06), loc=(0, ly, 3.10), mat="wood", bevel=0.015)
        pb.sphere(0.18, loc=(0, ly, 3.04), scale=(1.4, 1.0, 0.32), mat="glow")

    def add_metro_gangway(ey):
        sgn = 1.0 if ey > 0 else -1.0
        pb.box((0.84, 0.16, 2.16), loc=(-0.98, ey, 1.78), mat="silver", bevel=0.03)
        pb.box((0.84, 0.16, 2.16), loc=( 0.98, ey, 1.78), mat="silver", bevel=0.03)
        pb.box((1.20, 0.16, 0.58), loc=( 0.00, ey, 2.76), mat="silver", bevel=0.03)
        # Full-width articulated bellows extending 0.34m past y0/y1 (couples seamlessly at GAP=14.0m!)
        pb.box((2.68, 0.36, 2.52), loc=(0, ey + sgn * 0.18, 1.84), mat="dark", bevel=0.07)
        pb.box((2.16, 0.34, 0.30), loc=(0, ey + sgn * 0.18, 3.08), mat="dark", bevel=0.07)
        for sx in (-1, 1):
            pb.box((0.08, 0.34, 0.26), loc=(sx * 1.34, ey + sgn * 0.18, 1.04), mat="violet", bevel=0.01)

    def add_metro_front(sgn):
        ey = sgn * y1
        # Sleek rounded retro-modern urban subway nose (short aerodynamic curve, 1.45m!)
        nose_len = 1.45
        rings = []
        for i in range(7):
            t = i / 6.0
            y = ey + sgn * (t * nose_len)
            w = hw * (1.0 - 0.14 * (t ** 1.8))
            z_bot = 0.42 + 0.12 * (t ** 1.5)
            z_top = 3.30 - 0.36 * (t ** 1.6)
            rings.append(rounded_rect_ring(y, w, z_bot, z_top, r_bot=0.14, r_top=0.26, crown=0.05 * (1 - t)))
        if sgn < 0:
            rings.reverse()
        pb.loft(rings, mat="silver")
        # Front violet fascia band & glowing "1号线" destination LED + cab glass + twin headlights!
        fy = ey + sgn * (nose_len - 0.02)
        pb.box((2.46, 0.16, 0.34), loc=(0, fy - sgn * 0.04, 1.08), mat="violet", bevel=0.04)
        pb.box((2.48, 0.16, 0.07), loc=(0, fy - sgn * 0.04, 1.28), mat="gold", bevel=0.01)
        # Wide dark-framed panoramic cab windshield
        pb.box((2.12, 0.12, 0.96), loc=(0, fy - sgn * 0.10, 2.02), rot=(sgn * -0.18, 0, 0), mat="dark", bevel=0.03)
        pb.box((1.96, 0.13, 0.82), loc=(0, fy - sgn * 0.09, 2.02), rot=(sgn * -0.18, 0, 0), mat="glass", bevel=0.02)
        # Top glowing Line-1 destination board
        pb.box((1.30, 0.14, 0.24), loc=(0, fy - sgn * 0.18, 2.66), mat="violet", bevel=0.03)
        pb.box((1.06, 0.16, 0.15), loc=(0, fy - sgn * 0.17, 2.66), mat="glow", bevel=0.015)
        for sx in (-1, 1):
            pb.sphere(0.15, loc=(sx * 0.82, fy + sgn * 0.04, 1.10), scale=(1.0, 0.65, 1.0), mat="glow")
            pb.torus(0.16, 0.025, maj_segs=16, min_segs=6, loc=(sx * 0.82, fy + sgn * 0.05, 1.10), rot=(math.pi * 0.5, 0, 0), mat="gold")
        # Coupler bumper below nose
        pb.box((0.52, 0.34, 0.22), loc=(0, fy + sgn * 0.12, 0.54), mat="dark", bevel=0.03)

    if role == "head":
        add_metro_gangway(y0)
        add_metro_front(+1)
    elif role == "tail":
        add_metro_front(-1)
        add_metro_gangway(y1)
    else:
        add_metro_gangway(y0)
        add_metro_gangway(y1)

    car_obj = pb.build_object()
    # Animated sliding doors on BOTH sides
    for side_tag, sx in (("L", -1), ("R", 1)):
        dpb = PartBuilder(f"{name}_Door_{side_tag}", mats)
        dx = sx * (hw - 0.03)
        dpb.box((0.08, 1.88, 0.84), loc=(dx, 0.0, 1.10), mat="silver", bevel=0.02)
        dpb.box((0.095, 1.88, 0.28), loc=(dx, 0.0, 1.04), mat="violet", bevel=0.015)
        dpb.box((0.10, 1.88, 0.065), loc=(dx, 0.0, 1.24), mat="gold", bevel=0.01)
        dpb.box((0.08, 0.24, 0.94), loc=(dx, -0.82, 1.98), mat="silver", bevel=0.02)
        dpb.box((0.08, 0.24, 0.94), loc=(dx,  0.82, 1.98), mat="silver", bevel=0.02)
        dpb.box((0.08, 1.88, 0.16), loc=(dx,  0.00, 2.42), mat="silver", bevel=0.02)
        dpb.box((0.04, 1.38, 0.84), loc=(dx,  0.00, 1.96), mat="glass", bevel=0.01)
        dpb.box((0.095, 0.03, 1.80), loc=(dx, 0.0, 1.58), mat="dark", bevel=0.005)
        dpb.build_object(parent=car_obj)
    return car_obj


# ---------------------------------------------------------------------------
# 4. Ghibli Showa Brick & Arched-Glass Metro Line 1 Entrance ("MetroEntrance1")
# ---------------------------------------------------------------------------
def build_metro_entrance(mats):
    pb = PartBuilder("MetroEntrance1", mats)
    # Stone platform plinth & descending stair well visual
    pb.box((4.8, 5.8, 0.28), loc=(0, 0, 0.14), mat="silver", bevel=0.04)
    # Descending interior stair steps (warm stone illusion leading underground!)
    for i in range(6):
        pb.box((2.9, 0.56, 0.18), loc=(0, 1.4 - i * 0.52, 0.24 - i * 0.04), mat="dark", bevel=0.015)
    # Warm red-brick waist walls on left, right, and rear (front +Y open!)
    for sx in (-1, 1):
        pb.box((0.32, 5.20, 1.25), loc=(sx * 2.05, -0.15, 0.86), mat="brick", bevel=0.04)
        pb.box((0.38, 5.28, 0.12), loc=(sx * 2.05, -0.15, 1.52), mat="cream", bevel=0.02)
        # Tall vintage iron-and-glass side windows
        pb.box((0.06, 4.70, 1.35), loc=(sx * 2.05, -0.15, 2.24), mat="glass", bevel=0.01)
        for py in (-2.55, -0.95, 0.65, 2.25):
            pb.box((0.18, 0.18, 2.85), loc=(sx * 2.05, py, 1.65), mat="dark", bevel=0.02)
    # Rear brick wall
    pb.box((4.40, 0.34, 2.95), loc=(0, -2.65, 1.68), mat="brick", bevel=0.04)
    pb.box((4.48, 0.40, 0.14), loc=(0, -2.65, 3.18), mat="cream", bevel=0.02)
    # Vaulted arched canopy roof (Ghibli steel & slate/glass barrel vault!)
    vault_stations = []
    for y in (-2.85, 0.0, 2.85):
        vault_stations.append([
            (-2.35, y, 2.96), (-2.10, y, 3.45), (-1.35, y, 3.88), (0.0, y, 4.06),
            (1.35, y, 3.88), (2.10, y, 3.45), (2.35, y, 2.96),
            (2.15, y, 2.96), (1.25, y, 3.72), (0.0, y, 3.90), (-1.25, y, 3.72), (-2.15, y, 2.96),
        ])
    pb.loft(vault_stations, mat="roof")
    # Decorative arched ribs & violet Metro Line-1 header fascia at front (+Y)
    pb.box((4.40, 0.22, 0.62), loc=(0, 2.68, 3.06), mat="violet", bevel=0.04)
    pb.box((4.46, 0.24, 0.08), loc=(0, 2.68, 2.74), mat="gold", bevel=0.015)
    pb.box((4.46, 0.24, 0.08), loc=(0, 2.68, 3.38), mat="gold", bevel=0.015)
    # Glowing Line-1 M emblem medallion on front arch + warm hanging entrance lamps
    pb.cyl(0.36, 0.36, 0.14, segs=22, loc=(0, 2.78, 3.68), rot=(math.pi * 0.5, 0, 0), mat="violet")
    pb.cyl(0.28, 0.28, 0.16, segs=22, loc=(0, 2.78, 3.68), rot=(math.pi * 0.5, 0, 0), mat="glow")
    for sx in (-1.25, 1.25):
        pb.sphere(0.14, loc=(sx, 2.35, 2.72), scale=(1.0, 1.0, 0.8), mat="glow_amber")
    # Cozy ticket machine alcove on left inner wall
    pb.box((0.42, 0.92, 1.55), loc=(-1.62, 0.60, 1.04), mat="violet", bevel=0.03)
    pb.box((0.44, 0.64, 0.42), loc=(-1.60, 0.60, 1.38), mat="glow", bevel=0.015)
    return pb.build_object()


def render_preview(filepath, cam_loc, target, res=(1400, 820)):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.filepath = filepath
    try:
        scene.view_settings.view_transform = 'AgX'
    except Exception:
        scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new("TransitPreviewWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.82, 0.88, 0.94, 1.0)
        bg.inputs["Strength"].default_value = 0.80
    sun_d = bpy.data.lights.new("Sun", type='SUN')
    sun_d.energy = 2.0
    sun_d.color = (1.0, 0.96, 0.88)
    sun = bpy.data.objects.new("Sun", sun_d)
    sun.rotation_euler = Euler((math.radians(45), math.radians(15), math.radians(36)), 'XYZ')
    scene.collection.objects.link(sun)
    cam_d = bpy.data.cameras.new("Cam")
    cam_d.lens = 45.0
    cam = bpy.data.objects.new("Cam", cam_d)
    cam.location = Vector(cam_loc)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(sun, do_unlink=True)


def main():
    clear_scene()
    mats = build_materials()
    bus37 = build_bus37(mats)
    stop37 = build_bus_stop37(mats)
    m_head = build_metro_car("Metro1_Head", mats, role="head")
    m_mid  = build_metro_car("Metro1_Mid",  mats, role="mid")
    m_tail = build_metro_car("Metro1_Tail", mats, role="tail")
    m_ent  = build_metro_entrance(mats)

    out_glb = os.path.join(OUT_DIR, "transit.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format='GLB',
        export_apply=True,
        export_normals=True,
        export_texcoords=True,
        export_materials='EXPORT',
    )
    print(f"[EXPORTED] {out_glb} (Bus37 + BusStop37 + Metro1 3-car + MetroEntrance1)")

    # Showcase studio render of Bus37 + BusStop37 + Metro1 + MetroEntrance1
    bus37.location = Vector((-4.2, 2.5, 0.0))
    stop37.location = Vector((-4.5, -5.5, 0.0))
    m_head.location = Vector((4.8, 7.0, 0.0))
    m_mid.location  = Vector((4.8, -7.0, 0.0))
    m_tail.location = Vector((4.8, -21.0, 0.0))
    m_ent.location  = Vector((-0.2, -10.5, 0.0))
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(make_mat("gnd", (0.72, 0.78, 0.66), roughness=0.9))
    render_preview(
        os.path.join(PREVIEW_DIR, "preview_transit_models.png"),
        cam_loc=(-16.0, 17.0, 9.5), target=(0.2, -0.5, 1.8),
    )
    print("[ALL DONE] Ghibli Bus 37 & Metro Line 1 models exported successfully.")


if __name__ == "__main__":
    main()
