"""
High-Craft Showa / Coal-Town (煤炭镇的小白) & Ghibli Textured Vehicle, HSR & Kite Builder
Runs inside Blender 5.3 (--factory-startup --background).

Every mesh has clean triplanar/planar UVs + embedded hand-painted watercolor textures:
  - Hand-painted gouache enamel brush grain (paint)
  - Real wood plank grain (public/textures/albedo/wood0.png)
  - Woven rattan wicker basket weave (wicker)
  - Stitched vintage leather seat grain (leather)
  - Tire rubber tread & brushed vintage metal
  - Real woven fabric (public/textures/albedo/fabric.png)
  - Hand-painted Sky-Whale & Clouds kite sail art

Exports:
  - public/vehicles/hsr_train.glb  (HSR_Head, HSR_Mid, HSR_Tail + _Door_L/_R)
  - public/vehicles/vehicles.glb   (car, truck, bus, bicycle, cargobike, scooter,
                                    oxcart, veh_wheelbarrow, prop_handcart,
                                    rowboat, kayak, canoe, kite)
"""
import math
import os
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix, Euler

ROOT = r"d:\DSH DEMO\deepseek-world"
OUT_DIR = os.path.join(ROOT, "public", "vehicles")
ALBEDO_DIR = os.path.join(ROOT, "public", "textures", "albedo")
PREVIEW_DIR = r"C:\Users\shilaoban\.gemini\antigravity\brain\8cc60f92-f47e-4a8b-bc27-26a746fb2f13\scratch"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Procedural Hand-Painted Coal-Town / Ghibli Textures (NumPy -> bpy.data.images)
# ---------------------------------------------------------------------------
def _make_img_from_rgba(name, arr):
    """arr: (H, W, 4) float32 in [0, 1]. Packs image into .blend so glTF embeds it cleanly."""
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, width=w, height=h, alpha=False)
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    img.pack()
    return img


def _smooth_noise(h, w, seed, freqs=(6, 14, 32)):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xx = xx / w * 2.0 * math.pi
    yy = yy / h * 2.0 * math.pi
    acc = np.zeros((h, w), dtype=np.float32)
    amp = 0.55
    for f in freqs:
        px = rng.uniform(0, 2 * math.pi)
        py = rng.uniform(0, 2 * math.pi)
        ang = rng.uniform(0, math.pi)
        u = xx * math.cos(ang) + yy * math.sin(ang)
        v = -xx * math.sin(ang) + yy * math.cos(ang)
        acc += amp * (0.5 + 0.5 * np.sin(u * f + px) * np.cos(v * f * 0.8 + py))
        amp *= 0.5
    acc = (acc - acc.min()) / max(1e-5, acc.max() - acc.min())
    return acc


def gen_gouache_paint_tex(name="tex_paint", size=256):
    """Warm hand-painted gouache brushstroke texture (neutral bright so tinting works cleanly)."""
    n1 = _smooth_noise(size, size, 11, (4, 9, 22))
    n2 = _smooth_noise(size, size, 23, (12, 28, 54))
    # Subtle horizontal brush streaks + watercolor paper grain
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    streak = 0.5 + 0.5 * np.sin(yy / size * 2 * math.pi * 24 + n1 * 4.0)
    val = 0.86 + 0.14 * (0.55 * n1 + 0.25 * n2 + 0.20 * streak)
    arr = np.ones((size, size, 4), dtype=np.float32)
    arr[:, :, 0] = np.clip(val * 1.01, 0.72, 1.0)
    arr[:, :, 1] = np.clip(val * 0.995, 0.70, 1.0)
    arr[:, :, 2] = np.clip(val * 0.97, 0.68, 1.0)
    return _make_img_from_rgba(name, arr)


def gen_leather_tex(name="tex_leather", size=256):
    """Warm stitched vintage saddle-leather texture for Coal-Town seats."""
    n1 = _smooth_noise(size, size, 41, (10, 24, 52))
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    # Soft tufted diamond / horizontal rib shading + fine grain
    rib = 0.88 + 0.12 * np.abs(np.sin(yy / size * math.pi * 6))
    stitch = ((np.abs((yy % (size / 6)) - 2) < 1.5) & ((xx % 12) < 6)).astype(np.float32)
    base = (0.82 + 0.18 * n1) * rib
    arr = np.ones((size, size, 4), dtype=np.float32)
    arr[:, :, 0] = np.clip(base * 1.04 + stitch * 0.14, 0, 1)
    arr[:, :, 1] = np.clip(base * 0.92 + stitch * 0.12, 0, 1)
    arr[:, :, 2] = np.clip(base * 0.80 + stitch * 0.08, 0, 1)
    return _make_img_from_rgba(name, arr)


def gen_wicker_tex(name="tex_wicker", size=256):
    """Hand-painted woven rattan wicker texture for bicycle baskets & picnic suitcases."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    cell = 16.0
    ix = np.floor(xx / cell)
    iy = np.floor(yy / cell)
    fx = (xx % cell) / cell
    fy = (yy % cell) / cell
    parity = ((ix + iy) % 2) < 0.5
    h_strand = np.sin(fx * math.pi) * (0.72 + 0.28 * np.sin(fy * math.pi))
    v_strand = np.sin(fy * math.pi) * (0.72 + 0.28 * np.sin(fx * math.pi))
    weave = np.where(parity, h_strand, v_strand)
    n = _smooth_noise(size, size, 77, (8, 18))
    shade = 0.58 + 0.42 * weave * (0.88 + 0.12 * n)
    arr = np.ones((size, size, 4), dtype=np.float32)
    arr[:, :, 0] = np.clip(shade * 1.00, 0, 1)
    arr[:, :, 1] = np.clip(shade * 0.82, 0, 1)
    arr[:, :, 2] = np.clip(shade * 0.54, 0, 1)
    return _make_img_from_rgba(name, arr)


def gen_rubber_tread_tex(name="tex_rubber", size=256):
    """Matte vintage tire rubber with subtle tread grooves & dusty road wear."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    n = _smooth_noise(size, size, 99, (12, 32))
    groove = 0.86 + 0.14 * np.sin(xx / size * 2 * math.pi * 16 + np.sin(yy / size * 2 * math.pi * 8) * 0.6)
    v = (0.76 + 0.24 * n) * groove
    arr = np.ones((size, size, 4), dtype=np.float32)
    arr[:, :, 0] = v * 0.96
    arr[:, :, 1] = v * 0.96
    arr[:, :, 2] = v * 1.00
    return _make_img_from_rgba(name, arr)


def gen_metal_tex(name="tex_metal", size=256):
    """Brushed vintage chrome / painted iron with soft Showa sheen."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    n = _smooth_noise(size, size, 55, (6, 18))
    brush = 0.90 + 0.10 * np.sin(yy / size * 2 * math.pi * 40 + n * 2.5)
    v = np.clip((0.84 + 0.16 * n) * brush, 0.72, 1.0)
    arr = np.ones((size, size, 4), dtype=np.float32)
    arr[:, :, 0] = v * 0.99
    arr[:, :, 1] = v * 0.99
    arr[:, :, 2] = v * 1.00
    return _make_img_from_rgba(name, arr)


def load_or_fallback(filename, fallback_fn):
    p = os.path.join(ALBEDO_DIR, filename)
    if os.path.exists(p):
        img = bpy.data.images.load(p)
        img.pack()
        return img
    return fallback_fn()


# ---------------------------------------------------------------------------
# Scene & Material Helpers
# ---------------------------------------------------------------------------
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, rgba, roughness=0.52, metallic=0.0, alpha=1.0, emission=0.0, image=None):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic

    if image is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[7].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
        nt.links.new(tex.outputs["Color"], mix.inputs[6])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)

    if alpha < 0.99:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    if emission > 0.0:
        bsdf.inputs["Emission Color"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def get_vehicle_mats():
    img_paint = gen_gouache_paint_tex("tex_veh_paint")
    img_leather = gen_leather_tex("tex_veh_leather")
    img_wicker = gen_wicker_tex("tex_veh_wicker")
    img_rubber = gen_rubber_tread_tex("tex_veh_rubber")
    img_metal = gen_metal_tex("tex_veh_metal")
    img_wood = load_or_fallback("wood0.png", lambda: gen_wicker_tex("tex_wood_fb"))
    img_fabric = load_or_fallback("fabric.png", lambda: gen_gouache_paint_tex("tex_fab_fb"))

    return {
        "body":   make_mat("veh_body",   (0.86, 0.34, 0.27), roughness=0.40, image=img_paint),
        "cream":  make_mat("veh_cream",  (0.96, 0.92, 0.82), roughness=0.48, image=img_paint),
        "wood":   make_mat("veh_wood",   (0.88, 0.78, 0.66), roughness=0.70, image=img_wood),
        "wicker": make_mat("veh_wicker", (0.94, 0.84, 0.68), roughness=0.78, image=img_wicker),
        "dark":   make_mat("veh_dark",   (0.20, 0.21, 0.24), roughness=0.74, image=img_rubber),
        "glass":  make_mat("veh_glass",  (0.64, 0.86, 0.95), roughness=0.12, alpha=0.42),
        "metal":  make_mat("veh_metal",  (0.80, 0.82, 0.84), roughness=0.28, metallic=0.50, image=img_metal),
        "glow":   make_mat("veh_glow",   (1.00, 0.93, 0.66), roughness=0.20, emission=2.2),
        "seat":   make_mat("veh_seat",   (0.66, 0.38, 0.24), roughness=0.60, image=img_leather),
        "coral":  make_mat("veh_coral",  (0.92, 0.45, 0.34), roughness=0.44, image=img_paint),
        "cloth":  make_mat("veh_cloth",  (0.94, 0.89, 0.78), roughness=0.75, image=img_fabric),
    }


def gen_hsr_livery_tex(name="tex_hsr_livery", size=256):
    """Showa/Ghibli express train painted aluminum panel texture with subtle seam lines & brush warmth."""
    n1 = _smooth_noise(size, size, 31, (5, 13, 29))
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    # Subtle panel seams & horizontal brushed enamel strokes
    seam_v = ((np.abs((xx % 64) - 1) < 1.2)).astype(np.float32) * 0.10
    seam_h = ((np.abs((yy % 64) - 1) < 1.2)).astype(np.float32) * 0.08
    brush = 0.5 + 0.5 * np.sin(yy / size * 2 * math.pi * 28 + n1 * 3.0)
    val = 0.86 + 0.14 * (0.6 * n1 + 0.4 * brush) - seam_v - seam_h
    arr = np.ones((size, size, 4), dtype=np.float32)
    arr[:, :, 0] = np.clip(val * 1.01, 0.65, 1.0)
    arr[:, :, 1] = np.clip(val * 0.99, 0.64, 1.0)
    arr[:, :, 2] = np.clip(val * 0.94, 0.60, 1.0)
    return _make_img_from_rgba(name, arr)


def get_hsr_mats():
    img_paint = gen_hsr_livery_tex("tex_hsr_paint")
    img_wood = load_or_fallback("wood0.png", lambda: gen_gouache_paint_tex("tex_hsr_wood_fb"))
    img_fabric = load_or_fallback("fabric.png", lambda: gen_leather_tex("tex_hsr_fab_fb"))
    img_metal = gen_metal_tex("tex_hsr_metal")

    return {
        "cream": make_mat("hsr_cream", (0.95, 0.91, 0.81), roughness=0.36, image=img_paint),
        "teal":  make_mat("hsr_teal",  (0.15, 0.52, 0.58), roughness=0.38, image=img_paint),
        "gold":  make_mat("hsr_gold",  (0.88, 0.68, 0.24), roughness=0.32, metallic=0.38, image=img_metal),
        "dark":  make_mat("hsr_dark",  (0.20, 0.22, 0.26), roughness=0.66, image=img_metal),
        "glass": make_mat("hsr_glass", (0.56, 0.80, 0.92), roughness=0.10, alpha=0.36),
        "cockpit": make_mat("hsr_cockpit", (0.14, 0.25, 0.36), roughness=0.12, metallic=0.18),
        "wood":  make_mat("hsr_wood",  (0.88, 0.78, 0.66), roughness=0.62, image=img_wood),
        "seat":  make_mat("hsr_seat",  (0.24, 0.48, 0.58), roughness=0.68, image=img_fabric),
        "glow":  make_mat("hsr_glow",  (1.00, 0.94, 0.72), roughness=0.18, emission=2.6),
    }


# ---------------------------------------------------------------------------
# High-Craft BMesh Geometry Builder with Automatic Triplanar UV Projection
# ---------------------------------------------------------------------------
class PartBuilder:
    """Accumulates sculpted parts with per-face material indices AND clean UVs into one mesh."""
    def __init__(self, name, mat_dict):
        self.name = name
        self.mat_dict = mat_dict
        self.mat_order = list(mat_dict.keys())
        self.mat_index = {k: i for i, k in enumerate(self.mat_order)}
        self.bm = bmesh.new()
        self.bm.loops.layers.uv.verify()

    def box(self, size, loc=(0, 0, 0), rot=(0, 0, 0), mat="body", bevel=0.0, segs=2, smooth=False, uv_scale=0.9):
        tbm = bmesh.new()
        bmesh.ops.create_cube(tbm, size=1.0)
        bmesh.ops.scale(tbm, vec=Vector(size), verts=tbm.verts)
        if bevel > 0.0:
            bmesh.ops.bevel(
                tbm, geom=list(tbm.edges), offset=bevel, segments=segs,
                profile=0.55, affect='EDGES', clamp_overlap=True
            )
        self._merge_temp(tbm, loc, rot, mat, smooth, uv_scale)

    def cyl(self, r1, r2, depth, segs=18, loc=(0, 0, 0), rot=(0, 0, 0), mat="metal", smooth=True, cap=True, uv_scale=1.1):
        tbm = bmesh.new()
        bmesh.ops.create_cone(
            tbm, cap_ends=cap, cap_tris=False, segments=segs,
            radius1=r1, radius2=r2, depth=depth
        )
        self._merge_temp(tbm, loc, rot, mat, smooth, uv_scale)

    def sphere(self, r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), mat="body", u=16, v=12, smooth=True, uv_scale=1.0):
        tbm = bmesh.new()
        bmesh.ops.create_uvsphere(tbm, u_segments=u, v_segments=v, radius=r)
        bmesh.ops.scale(tbm, vec=Vector(scale), verts=tbm.verts)
        self._merge_temp(tbm, loc, rot, mat, smooth, uv_scale)

    def torus(self, major_r, minor_r, maj_segs=24, min_segs=12, loc=(0, 0, 0), rot=(0, 0, 0), mat="dark", smooth=True, uv_scale=1.4):
        tbm = bmesh.new()
        rings = []
        for i in range(maj_segs):
            a = 2.0 * math.pi * i / maj_segs
            ca, sa = math.cos(a), math.sin(a)
            ring = []
            for j in range(min_segs):
                b = 2.0 * math.pi * j / min_segs
                cb, sb = math.cos(b), math.sin(b)
                rr = major_r + minor_r * cb
                ring.append(tbm.verts.new((rr * ca, rr * sa, minor_r * sb)))
            rings.append(ring)
        for i in range(maj_segs):
            r0 = rings[i]
            r1 = rings[(i + 1) % maj_segs]
            for j in range(min_segs):
                jn = (j + 1) % min_segs
                tbm.faces.new((r0[j], r1[j], r1[jn], r0[jn]))
        bmesh.ops.recalc_face_normals(tbm, faces=tbm.faces)
        self._merge_temp(tbm, loc, rot, mat, smooth, uv_scale)

    def tube(self, p0, p1, r0, r1=None, segs=12, mat="metal", smooth=True, cap=True, uv_scale=1.2):
        if r1 is None:
            r1 = r0
        v0 = Vector(p0)
        v1 = Vector(p1)
        d = v1 - v0
        L = d.length
        if L < 1e-5:
            return
        mid = (v0 + v1) * 0.5
        quat = Vector((0, 0, 1)).rotation_difference(d.normalized())
        tbm = bmesh.new()
        bmesh.ops.create_cone(
            tbm, cap_ends=cap, cap_tris=False, segments=segs,
            radius1=r0, radius2=r1, depth=L
        )
        m = Matrix.Translation(mid) @ quat.to_matrix().to_4x4()
        bmesh.ops.transform(tbm, matrix=m, verts=tbm.verts)
        self._merge_temp(tbm, (0, 0, 0), (0, 0, 0), mat, smooth, uv_scale)

    def pipe_path(self, pts, radius, segs=10, mat="metal", closed=False, smooth=True, uv_scale=1.2):
        pts = [Vector(p) for p in pts]
        n = len(pts)
        if n < 2:
            return
        tbm = bmesh.new()
        rings = []
        for i, p in enumerate(pts):
            if i == 0:
                tang = (pts[1] - pts[0]).normalized()
            elif i == n - 1:
                tang = (pts[-1] - pts[-2]).normalized()
            else:
                tang = (pts[i + 1] - pts[i - 1]).normalized()
            up = Vector((0, 0, 1)) if abs(tang.z) < 0.9 else Vector((1, 0, 0))
            side = tang.cross(up).normalized()
            up2 = side.cross(tang).normalized()
            r = radius[i] if isinstance(radius, (list, tuple)) else radius
            ring = []
            for j in range(segs):
                a = 2.0 * math.pi * j / segs
                v = p + (side * math.cos(a) + up2 * math.sin(a)) * r
                ring.append(tbm.verts.new(v))
            rings.append(ring)
        count = n if closed else n - 1
        for i in range(count):
            r0 = rings[i]
            r1 = rings[(i + 1) % n]
            for j in range(segs):
                jn = (j + 1) % segs
                tbm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
        if not closed:
            tbm.faces.new(rings[0][::-1])
            tbm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(tbm, faces=tbm.faces)
        self._merge_temp(tbm, (0, 0, 0), (0, 0, 0), mat, smooth, uv_scale)

    def loft(self, rings_pts, mat="body", cap_start=True, cap_end=True, smooth=True, close_ring=True, uv_scale=0.85):
        tbm = bmesh.new()
        rings = [[tbm.verts.new(Vector(p)) for p in ring] for ring in rings_pts]
        m = len(rings[0])
        for i in range(len(rings) - 1):
            r0, r1 = rings[i], rings[i + 1]
            j_lim = m if close_ring else m - 1
            for j in range(j_lim):
                jn = (j + 1) % m
                tbm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
        if cap_start and close_ring and m >= 3:
            tbm.faces.new(rings[0][::-1])
        if cap_end and close_ring and m >= 3:
            tbm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(tbm, faces=tbm.faces)
        self._merge_temp(tbm, (0, 0, 0), (0, 0, 0), mat, smooth, uv_scale)

    def arch_fender(self, loc, radius, width, thick=0.038, a0=-0.18, a1=math.pi + 0.18, segs=18, mat="body"):
        cx, cy, cz = loc
        tbm = bmesh.new()
        rings = []
        for i in range(segs + 1):
            t = i / segs
            a = a0 + (a1 - a0) * t
            ca, sa = math.cos(a), math.sin(a)
            r_in = radius
            r_out = radius + thick
            hw = width * 0.5
            pts = [
                (cx - hw, cy + ca * r_in,  cz + sa * r_in),
                (cx + hw, cy + ca * r_in,  cz + sa * r_in),
                (cx + hw, cy + ca * r_out, cz + sa * r_out),
                (cx - hw, cy + ca * r_out, cz + sa * r_out),
            ]
            rings.append([tbm.verts.new(p) for p in pts])
        for i in range(segs):
            r0, r1 = rings[i], rings[i + 1]
            for j in range(4):
                jn = (j + 1) % 4
                tbm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
        tbm.faces.new(rings[0][::-1])
        tbm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(tbm, faces=tbm.faces)
        self._merge_temp(tbm, (0, 0, 0), (0, 0, 0), mat, smooth=True, uv_scale=1.0)

    def _merge_temp(self, tbm, loc, rot, mat, smooth, uv_scale=0.9):
        if loc != (0, 0, 0) or rot != (0, 0, 0):
            m = Matrix.Translation(Vector(loc)) @ Euler(rot, 'XYZ').to_matrix().to_4x4()
            bmesh.ops.transform(tbm, matrix=m, verts=tbm.verts)
        bmesh.ops.recalc_face_normals(tbm, faces=tbm.faces)
        idx = self.mat_index[mat]
        uv_layer = self.bm.loops.layers.uv.verify()
        vmap = {v: self.bm.verts.new(v.co) for v in tbm.verts}
        for f in tbm.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
                nf.material_index = idx
                nf.smooth = smooth
                n = nf.normal
                ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
                for lp in nf.loops:
                    co = lp.vert.co
                    if az >= ax and az >= ay:
                        u, v = co.x * uv_scale, co.y * uv_scale
                    elif ax >= ay:
                        u, v = co.y * uv_scale, co.z * uv_scale
                    else:
                        u, v = co.x * uv_scale, co.z * uv_scale
                    lp[uv_layer].uv = (u + 0.5, v + 0.5)
            except ValueError:
                pass
        tbm.free()

    def build_object(self, loc=(0, 0, 0), parent=None):
        mesh = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for k in self.mat_order:
            mesh.materials.append(self.mat_dict[k])
        obj = bpy.data.objects.new(self.name, mesh)
        obj.location = Vector(loc)
        bpy.context.collection.objects.link(obj)
        if parent is not None:
            obj.parent = parent
        return obj


# ---------------------------------------------------------------------------
# Reusable Coal-Town / Showa Sub-Assemblies
# ---------------------------------------------------------------------------
def add_car_wheel(pb, loc, radius=0.33, width=0.20, rim_mat="cream", hub_mat="metal", spokes=6):
    cx, cy, cz = loc
    minor = min(width * 0.48, radius * 0.34)
    major = radius - minor
    pb.torus(major, minor, maj_segs=26, min_segs=10, loc=loc, rot=(0, math.pi * 0.5, 0), mat="dark")
    # Classic Showa whitewall tire ring!
    side_sign = 1.0 if cx >= 0 else -1.0
    pb.torus(major * 0.86, minor * 0.22, maj_segs=24, min_segs=8,
             loc=(cx + side_sign * width * 0.36, cy, cz), rot=(0, math.pi * 0.5, 0), mat="cream")
    pb.cyl(major * 0.92, major * 0.92, width * 0.70, segs=20, loc=loc, rot=(0, math.pi * 0.5, 0), mat=rim_mat)
    pb.cyl(major * 0.74, major * 0.74, width * 0.76, segs=16, loc=loc, rot=(0, math.pi * 0.5, 0), mat="dark")
    ox = cx + side_sign * (width * 0.34)
    for i in range(spokes):
        a = 2.0 * math.pi * i / spokes
        pb.tube((ox, cy, cz), (ox, cy + math.cos(a) * major * 0.84, cz + math.sin(a) * major * 0.84), 0.017, 0.013, segs=6, mat=rim_mat)
    pb.sphere(major * 0.36, loc=(cx + side_sign * width * 0.38, cy, cz), scale=(0.45, 1.0, 1.0), mat=hub_mat, u=14, v=8)


def add_spoked_wheel(pb, loc, radius=0.32, tire_r=0.032, spokes=14, rim_mat="metal"):
    cx, cy, cz = loc
    major = radius - tire_r
    pb.torus(major, tire_r, maj_segs=28, min_segs=10, loc=loc, rot=(0, math.pi * 0.5, 0), mat="dark")
    pb.torus(major - tire_r * 0.85, tire_r * 0.42, maj_segs=24, min_segs=8, loc=loc, rot=(0, math.pi * 0.5, 0), mat=rim_mat)
    pb.cyl(0.032, 0.032, 0.095, segs=12, loc=loc, rot=(0, math.pi * 0.5, 0), mat="metal")
    for i in range(spokes):
        a = 2.0 * math.pi * i / spokes
        sx = 0.028 if (i % 2 == 0) else -0.028
        pb.tube((cx + sx, cy, cz), (cx, cy + math.cos(a) * (major - tire_r * 0.85), cz + math.sin(a) * (major - tire_r * 0.85)), 0.0055, 0.0055, segs=5, mat="metal")


def add_wood_wheel(pb, loc, radius=0.52, rim_w=0.08, spokes=10):
    cx, cy, cz = loc
    pb.torus(radius - 0.025, 0.028, maj_segs=26, min_segs=8, loc=loc, rot=(0, math.pi * 0.5, 0), mat="dark")
    pb.torus(radius - 0.055, 0.036, maj_segs=24, min_segs=8, loc=loc, rot=(0, math.pi * 0.5, 0), mat="wood")
    pb.cyl(0.085, 0.085, rim_w * 1.9, segs=14, loc=loc, rot=(0, math.pi * 0.5, 0), mat="wood")
    pb.cyl(0.045, 0.045, rim_w * 2.2, segs=12, loc=loc, rot=(0, math.pi * 0.5, 0), mat="dark")
    for i in range(spokes):
        a = 2.0 * math.pi * i / spokes
        pb.tube((cx, cy, cz), (cx, cy + math.cos(a) * (radius - 0.06), cz + math.sin(a) * (radius - 0.06)), 0.022, 0.017, segs=6, mat="wood")


def add_steering_wheel(pb, loc, tilt=0.45, radius=0.175):
    pb.torus(radius, 0.020, maj_segs=24, min_segs=8, loc=loc, rot=(tilt, 0, 0), mat="wood")
    pb.cyl(0.042, 0.042, 0.032, segs=12, loc=loc, rot=(tilt, 0, 0), mat="metal")
    rot_m = Euler((tilt, 0, 0), 'XYZ').to_matrix()
    for a in (math.radians(210), math.radians(330), math.radians(90)):
        tip = Vector(loc) + rot_m @ Vector((math.cos(a) * radius, math.sin(a) * radius, 0))
        pb.tube(loc, tip, 0.012, 0.010, segs=6, mat="metal")
    col_end = Vector(loc) + rot_m @ Vector((0, 0, -0.44))
    pb.tube(loc, col_end, 0.028, 0.032, segs=10, mat="dark")


def add_headlight(pb, loc, r=0.105, depth=0.11, mat_rim="metal"):
    cx, cy, cz = loc
    pb.cyl(r * 1.08, r * 0.88, depth, segs=18, loc=(cx, cy - depth * 0.35, cz), rot=(math.pi * 0.5, 0, 0), mat=mat_rim)
    pb.torus(r * 1.02, 0.016, maj_segs=18, min_segs=6, loc=(cx, cy + 0.01, cz), rot=(math.pi * 0.5, 0, 0), mat=mat_rim)
    pb.sphere(r * 0.90, loc=(cx, cy + 0.018, cz), scale=(1.0, 0.45, 1.0), mat="glow", u=14, v=10)


def add_side_mirror(pb, base, tip, r=0.062):
    pb.tube(base, tip, 0.012, 0.010, segs=6, mat="metal")
    pb.sphere(r, loc=tip, scale=(1.0, 0.48, 0.82), mat="metal", u=12, v=8)
    pb.cyl(r * 0.80, r * 0.80, 0.012, segs=12, loc=(tip[0], tip[1] - 0.025, tip[2]), rot=(math.pi * 0.5, 0, 0), mat="glass")


def rounded_rect_ring(y, hw, z_bot, z_top, r_bot=0.10, r_top=0.14, crown=0.04):
    rb = min(r_bot, hw * 0.45, (z_top - z_bot) * 0.4)
    rt = min(r_top, hw * 0.45, (z_top - z_bot) * 0.4)
    return [
        (-hw + rb, y, z_bot),
        ( hw - rb, y, z_bot),
        ( hw - rb * 0.25, y, z_bot + rb * 0.35),
        ( hw, y, z_bot + rb),
        ( hw, y, z_top - rt),
        ( hw - rt * 0.32, y, z_top - rt * 0.22),
        ( hw - rt, y, z_top),
        ( 0.0, y, z_top + crown),
        (-hw + rt, y, z_top),
        (-hw + rt * 0.32, y, z_top - rt * 0.22),
        (-hw, y, z_top - rt),
        (-hw, y, z_bot + rb),
        (-hw + rb * 0.25, y, z_bot + rb * 0.35),
    ]


# ---------------------------------------------------------------------------
# 1. Showa / Coal-Town Vintage Convertible Roadster ("car")
#    Seat cushion Y=-0.02, Z=0.56 | Open cockpit Y=[-0.8, +0.6] | Steering Y=0.50, Z=0.98
# ---------------------------------------------------------------------------
def build_car(mats):
    pb = PartBuilder("car", mats)
    rear_rings = [rounded_rect_ring(*s) for s in [
        (-1.46, 0.52, 0.34, 0.72, 0.10, 0.15, 0.04),
        (-1.28, 0.72, 0.30, 0.86, 0.12, 0.17, 0.05),
        (-0.88, 0.77, 0.28, 0.88, 0.12, 0.15, 0.04),
        (-0.74, 0.77, 0.28, 0.87, 0.12, 0.12, 0.02),
    ]]
    pb.loft(rear_rings, mat="body")

    front_rings = [rounded_rect_ring(*s) for s in [
        ( 0.56, 0.77, 0.28, 0.88, 0.12, 0.14, 0.04),
        ( 0.90, 0.76, 0.29, 0.86, 0.12, 0.18, 0.06),
        ( 1.26, 0.70, 0.31, 0.78, 0.12, 0.18, 0.05),
        ( 1.48, 0.50, 0.36, 0.64, 0.10, 0.15, 0.03),
    ]]
    pb.loft(front_rings, mat="body")

    # Cockpit floor pan, wooden sill trim & doors
    pb.box((1.44, 1.44, 0.14), loc=(0, -0.10, 0.33), mat="dark", bevel=0.03)
    for sx in (-1, 1):
        pb.box((0.12, 1.38, 0.52), loc=(sx * 0.72, -0.09, 0.60), mat="body", bevel=0.035)
        pb.box((0.045, 2.58, 0.06), loc=(sx * 0.768, 0.00, 0.68), mat="cream", bevel=0.015)
        pb.box((0.03, 2.50, 0.025), loc=(sx * 0.785, 0.00, 0.68), mat="metal", bevel=0.008)
        pb.box((0.04, 0.15, 0.03), loc=(sx * 0.79, -0.32, 0.76), mat="metal", bevel=0.01)
        for wy in (-0.90, 0.90):
            pb.arch_fender((sx * 0.77, wy, 0.33), radius=0.36, width=0.22, thick=0.048, mat="body")
            add_car_wheel(pb, (sx * 0.77, wy, 0.33), radius=0.33, width=0.20, rim_mat="cream", spokes=6)

    # Chrome hood ornament rib, slatted radiator grille, vintage license plate
    pb.box((0.09, 0.74, 0.045), loc=(0, 1.00, 0.91), mat="metal", bevel=0.016)
    pb.sphere(0.045, loc=(0, 1.38, 0.80), scale=(0.8, 1.4, 0.7), mat="metal", u=10, v=8)
    pb.box((0.64, 0.08, 0.23), loc=(0, 1.46, 0.54), mat="dark", bevel=0.02)
    for gx in (-0.22, -0.11, 0.0, 0.11, 0.22):
        pb.box((0.026, 0.09, 0.20), loc=(gx, 1.47, 0.54), mat="metal", bevel=0.008)
    # Front & rear license plates
    pb.box((0.36, 0.03, 0.12), loc=(0, 1.54, 0.38), mat="cream", bevel=0.008)
    pb.box((0.36, 0.03, 0.12), loc=(0, -1.52, 0.40), mat="cream", bevel=0.008)

    # Chrome bumpers & over-riders
    for by, sgn in ((1.53, 1), (-1.51, -1)):
        pb.box((1.40, 0.10, 0.09), loc=(0, by, 0.36), mat="metal", bevel=0.03)
        for ox in (-0.42, 0.42):
            pb.box((0.06, 0.12, 0.16), loc=(ox, by + sgn * 0.02, 0.38), mat="metal", bevel=0.02)

    # Headlights, amber turn signals & tail lights
    for sx in (-1, 1):
        add_headlight(pb, (sx * 0.50, 1.43, 0.68), r=0.118)
        pb.sphere(0.042, loc=(sx * 0.64, 1.38, 0.54), scale=(1.0, 0.6, 1.0), mat="coral", u=10, v=8)
        pb.cyl(0.068, 0.074, 0.06, segs=14, loc=(sx * 0.54, -1.44, 0.64), rot=(math.pi * 0.5, 0, 0), mat="coral")
        pb.cyl(0.048, 0.048, 0.072, segs=12, loc=(sx * 0.54, -1.45, 0.64), rot=(math.pi * 0.5, 0, 0), mat="glow")

    # Raked chrome windshield + twin wipers + side mirrors
    pb.box((1.36, 0.035, 0.42), loc=(0, 0.64, 1.09), rot=(-0.34, 0, 0), mat="glass", bevel=0.008)
    for sx in (-1, 1):
        pb.tube((sx * 0.69, 0.58, 0.88), (sx * 0.67, 0.72, 1.30), 0.024, 0.022, segs=8, mat="metal")
        add_side_mirror(pb, (sx * 0.73, 0.60, 0.92), (sx * 0.88, 0.56, 1.02), r=0.064)
        # Wiper blade
        pb.tube((sx * 0.24 - 0.12, 0.64, 0.91), (sx * 0.24 + 0.06, 0.70, 1.12), 0.008, 0.008, segs=6, mat="dark")
    pb.tube((-0.67, 0.72, 1.30), (0.67, 0.72, 1.30), 0.022, 0.022, segs=8, mat="metal")

    # Wood-trimmed dashboard + twin chrome gauges + wood-rim steering wheel (Y=0.50, Z=0.98)
    pb.box((1.32, 0.24, 0.24), loc=(0, 0.58, 0.82), mat="wood", bevel=0.04)
    for dx in (-0.18, 0.0, 0.18):
        pb.cyl(0.052, 0.052, 0.04, segs=14, loc=(dx, 0.46, 0.84), rot=(math.pi * 0.5, 0, 0), mat="metal")
    add_steering_wheel(pb, (0.0, 0.50, 0.98), tilt=0.45, radius=0.175)

    # Stitched leather bench seat (Y=-0.02, Z=0.56)
    pb.box((1.24, 0.54, 0.16), loc=(0, -0.02, 0.50), mat="seat", bevel=0.055, segs=3)
    pb.box((1.24, 0.16, 0.46), loc=(0, -0.34, 0.74), rot=(-0.16, 0, 0), mat="seat", bevel=0.05, segs=3)
    # Folded canvas soft-top (fabric texture) + wicker picnic suitcase with leather straps on rear rack!
    pb.box((1.30, 0.26, 0.18), loc=(0, -0.66, 0.94), mat="cloth", bevel=0.07, segs=3)
    pb.box((0.92, 0.44, 0.03), loc=(0, -1.08, 0.90), mat="metal", bevel=0.01)
    pb.box((0.62, 0.34, 0.22), loc=(0, -1.08, 1.03), mat="wicker", bevel=0.035)
    for sx in (-0.18, 0.18):
        pb.box((0.04, 0.36, 0.24), loc=(sx, -1.08, 1.03), mat="seat", bevel=0.008)
    add_car_wheel(pb, (0.0, -1.48, 0.66), radius=0.26, width=0.14, rim_mat="cream", spokes=5)

    return pb.build_object()


# ---------------------------------------------------------------------------
# 2. Showa / Coal-Town Retro Pickup Truck ("truck")
#    Seat cushion Y=0.38, Z=0.60 | Open cab | Steering Y=0.82, Z=1.00
# ---------------------------------------------------------------------------
def build_truck(mats):
    pb = PartBuilder("truck", mats)
    pb.box((1.42, 3.16, 0.16), loc=(0, -0.02, 0.36), mat="dark", bevel=0.03)

    nose_rings = [rounded_rect_ring(*s) for s in [
        (0.86, 0.80, 0.36, 0.98, 0.10, 0.14, 0.04),
        (1.24, 0.78, 0.36, 0.96, 0.12, 0.16, 0.04),
        (1.54, 0.72, 0.38, 0.88, 0.12, 0.16, 0.04),
        (1.68, 0.56, 0.42, 0.74, 0.10, 0.14, 0.03),
    ]]
    pb.loft(nose_rings, mat="body")

    for sx in (-1, 1):
        pb.box((0.12, 0.94, 0.56), loc=(sx * 0.74, 0.42, 0.66), mat="body", bevel=0.035)
        pb.box((0.04, 0.96, 0.06), loc=(sx * 0.79, 0.42, 0.72), mat="cream", bevel=0.015)
        pb.box((0.04, 0.14, 0.03), loc=(sx * 0.81, 0.16, 0.82), mat="metal", bevel=0.01)
    pb.box((1.56, 0.12, 0.66), loc=(0, -0.06, 0.72), mat="body", bevel=0.03)

    # Windshield + sun visor + wipers + mirrors
    pb.box((1.46, 0.04, 0.44), loc=(0, 0.98, 1.18), rot=(-0.20, 0, 0), mat="glass", bevel=0.008)
    for sx in (-1, 1):
        pb.tube((sx * 0.74, 0.92, 0.96), (sx * 0.73, 1.02, 1.40), 0.028, 0.025, segs=8, mat="cream")
        add_side_mirror(pb, (sx * 0.77, 0.92, 1.06), (sx * 0.94, 0.90, 1.14), r=0.066)
    pb.box((1.54, 0.18, 0.055), loc=(0, 1.07, 1.42), rot=(0.14, 0, 0), mat="cream", bevel=0.02)

    # Textured wooden cargo bed + iron corner stakes + Coal-Town cargo (rice sacks, wooden crate, wicker basket)
    pb.box((1.56, 1.62, 0.14), loc=(0, -0.92, 0.48), mat="wood", bevel=0.02)
    for sx in (-1, 1):
        pb.box((0.08, 1.62, 0.46), loc=(sx * 0.76, -0.92, 0.74), mat="wood", bevel=0.02)
        pb.box((0.05, 1.64, 0.06), loc=(sx * 0.77, -0.92, 1.06), mat="wood", bevel=0.015)
        for py in (-1.66, -1.16, -0.66, -0.18):
            pb.box((0.06, 0.06, 0.62), loc=(sx * 0.77, py, 0.80), mat="dark", bevel=0.01)
    pb.box((1.56, 0.08, 0.46), loc=(0, -1.70, 0.74), mat="wood", bevel=0.02)
    # Cargo storytelling props
    pb.box((0.58, 0.54, 0.42), loc=(-0.32, -0.76, 0.76), mat="wicker", bevel=0.035)
    pb.sphere(0.32, loc=(-0.22, -1.32, 0.74), scale=(1.15, 0.95, 0.68), mat="cloth", u=12, v=8)
    pb.cyl(0.22, 0.20, 0.48, segs=14, loc=(0.36, -0.98, 0.78), mat="wood")

    for sx in (-1, 1):
        for wy in (-1.04, 1.04):
            pb.arch_fender((sx * 0.80, wy, 0.36), radius=0.40, width=0.25, thick=0.045, mat="dark")
            add_car_wheel(pb, (sx * 0.80, wy, 0.36), radius=0.36, width=0.22, rim_mat="cream", spokes=6)

    pb.box((1.50, 0.11, 0.11), loc=(0, 1.70, 0.42), mat="metal", bevel=0.03)
    pb.box((1.46, 0.10, 0.10), loc=(0, -1.76, 0.42), mat="metal", bevel=0.03)
    pb.box((0.36, 0.03, 0.12), loc=(0, 1.75, 0.43), mat="cream", bevel=0.008)
    pb.box((0.76, 0.08, 0.24), loc=(0, 1.65, 0.64), mat="dark", bevel=0.02)
    for gx in (-0.28, -0.14, 0.0, 0.14, 0.28):
        pb.box((0.03, 0.09, 0.21), loc=(gx, 1.66, 0.64), mat="metal", bevel=0.008)
    for sx in (-1, 1):
        add_headlight(pb, (sx * 0.56, 1.60, 0.74), r=0.112)
        pb.box((0.14, 0.06, 0.10), loc=(sx * 0.60, -1.75, 0.58), mat="coral", bevel=0.015)

    pb.box((1.28, 0.52, 0.16), loc=(0, 0.38, 0.54), mat="seat", bevel=0.05)
    pb.box((1.28, 0.16, 0.46), loc=(0, 0.08, 0.78), rot=(-0.14, 0, 0), mat="seat", bevel=0.045)
    pb.box((1.36, 0.24, 0.26), loc=(0, 0.90, 0.84), mat="wood", bevel=0.04)
    add_steering_wheel(pb, (0.0, 0.82, 1.00), tilt=0.45, radius=0.18)

    return pb.build_object()


# ---------------------------------------------------------------------------
# 3. Showa Retro Village Sightseeing Bus ("bus")
#    Driver seat Y=0.0, Z=1.12 | Steering Y=0.52, Z=1.54
# ---------------------------------------------------------------------------
def build_bus(mats):
    pb = PartBuilder("bus", mats)
    lower_rings = [rounded_rect_ring(*s) for s in [
        (-2.22, 0.94, 0.44, 1.42, 0.14, 0.14, 0.02),
        (-1.92, 1.04, 0.42, 1.44, 0.14, 0.12, 0.02),
        ( 1.92, 1.04, 0.42, 1.44, 0.14, 0.12, 0.02),
        ( 2.24, 0.94, 0.44, 1.42, 0.14, 0.14, 0.02),
    ]]
    pb.loft(lower_rings, mat="body")
    pb.box((2.12, 4.24, 0.16), loc=(0, 0, 1.38), mat="cream", bevel=0.03)
    pb.box((2.14, 4.18, 0.05), loc=(0, 0, 1.24), mat="coral", bevel=0.015)

    pb.box((1.96, 1.78, 0.78), loc=(0, -1.24, 1.84), mat="glass", bevel=0.04)
    roof_rings = [rounded_rect_ring(*s) for s in [
        (-2.20, 0.96, 2.20, 2.48, 0.06, 0.22, 0.08),
        (-1.90, 1.02, 2.20, 2.52, 0.06, 0.22, 0.09),
        (-0.42, 1.02, 2.20, 2.52, 0.06, 0.22, 0.09),
        (-0.26, 0.98, 2.20, 2.46, 0.06, 0.20, 0.06),
    ]]
    pb.loft(roof_rings, mat="cream")

    for sx in (-1, 1):
        for py in (-2.08, -1.52, -0.96, -0.36):
            pb.box((0.08, 0.10, 0.80), loc=(sx * 1.00, py, 1.84), mat="cream", bevel=0.02)
        pb.tube((sx * 0.98, -0.34, 1.78), (sx * 0.98, 1.96, 1.78), 0.024, 0.024, segs=8, mat="metal")
        for ry in (0.10, 0.70, 1.30, 1.94):
            pb.tube((sx * 0.98, ry, 1.44), (sx * 0.98, ry, 1.78), 0.022, 0.022, segs=8, mat="metal")

    pb.box((1.90, 0.05, 0.56), loc=(0, 2.08, 1.74), rot=(-0.18, 0, 0), mat="glass", bevel=0.01)
    for sx in (-1, 1):
        pb.tube((sx * 0.96, 2.04, 1.44), (sx * 0.95, 2.12, 2.02), 0.032, 0.028, segs=8, mat="cream")
        add_side_mirror(pb, (sx * 1.02, 1.92, 1.56), (sx * 1.22, 1.98, 1.66), r=0.075)
    pb.box((1.96, 0.14, 0.12), loc=(0, 2.12, 2.04), mat="cream", bevel=0.03)
    pb.box((1.04, 0.06, 0.16), loc=(0, 2.17, 2.04), mat="glow", bevel=0.02)

    pb.box((1.62, 1.40, 0.04), loc=(0, -1.24, 2.60), mat="metal", bevel=0.01)
    for sx in (-0.78, 0.78):
        pb.tube((sx, -1.90, 2.66), (sx, -0.56, 2.66), 0.02, 0.02, segs=8, mat="metal")
    pb.box((0.56, 0.40, 0.24), loc=(-0.26, -1.36, 2.74), mat="wicker", bevel=0.04)
    pb.box((0.46, 0.34, 0.20), loc=(0.30, -1.10, 2.72), mat="seat", bevel=0.035)

    for sx in (-1, 1):
        for wy in (-1.36, 1.36):
            pb.arch_fender((sx * 1.02, wy, 0.42), radius=0.46, width=0.28, thick=0.05, mat="dark")
            add_car_wheel(pb, (sx * 1.02, wy, 0.42), radius=0.42, width=0.24, rim_mat="cream", spokes=6)

    pb.box((2.04, 0.14, 0.14), loc=(0, 2.28, 0.50), mat="metal", bevel=0.035)
    pb.box((2.04, 0.14, 0.14), loc=(0, -2.26, 0.50), mat="metal", bevel=0.035)
    pb.sphere(0.14, loc=(0, 2.24, 1.02), scale=(1.0, 0.35, 1.0), mat="metal", u=14, v=10)
    for sx in (-1, 1):
        add_headlight(pb, (sx * 0.68, 2.20, 0.86), r=0.14)
        pb.box((0.18, 0.08, 0.14), loc=(sx * 0.76, -2.24, 0.86), mat="coral", bevel=0.02)

    pb.box((0.68, 0.52, 0.14), loc=(0, 0.0, 1.06), mat="seat", bevel=0.045)
    pb.box((0.68, 0.14, 0.44), loc=(0, -0.26, 1.30), rot=(-0.14, 0, 0), mat="seat", bevel=0.04)
    pb.box((1.72, 0.28, 0.24), loc=(0, 0.70, 1.40), mat="wood", bevel=0.04)
    add_steering_wheel(pb, (0.0, 0.52, 1.54), tilt=0.42, radius=0.20)

    return pb.build_object()


# ---------------------------------------------------------------------------
# 4. Showa Vintage Bicycle ("bicycle") & Cargo Bike ("cargobike")
#    Low U-frame Z<=0.34 | Saddle Y=-0.08, Z=0.62 | Handlebars Y=0.32, Z=0.88
# ---------------------------------------------------------------------------
def build_bicycle(mats, cargo=False):
    name = "cargobike" if cargo else "bicycle"
    pb = PartBuilder(name, mats)

    fy = 0.66 if cargo else 0.54
    ry = -0.54
    wr = 0.31

    add_spoked_wheel(pb, (0, ry, wr), radius=wr, tire_r=0.032, spokes=14)
    add_spoked_wheel(pb, (0, fy, wr), radius=wr, tire_r=0.032, spokes=14)
    pb.arch_fender((0, ry, wr), radius=wr + 0.025, width=0.088, thick=0.018, a0=0.4, a1=math.pi + 0.2, mat="body")
    pb.arch_fender((0, fy, wr), radius=wr + 0.025, width=0.088, thick=0.018, a0=-0.1, a1=math.pi - 0.5, mat="body")
    # Rear red fender reflector
    pb.sphere(0.024, loc=(0, ry - wr - 0.03, wr + 0.06), scale=(1.0, 0.6, 1.0), mat="coral", u=10, v=8)

    head_top = (0, fy - 0.16, 0.72)
    head_bot = (0, fy - 0.12, 0.50)
    bb = (0, -0.06, 0.26)
    seat_lug = (0, -0.10, 0.52)

    pb.tube(head_bot, head_top, 0.026, 0.026, segs=10, mat="body")
    pb.pipe_path([head_bot, (0, 0.28, 0.34), (0, 0.10, 0.26), bb], radius=0.022, segs=10, mat="body")
    pb.tube(bb, seat_lug, 0.022, 0.022, segs=10, mat="body")
    pb.tube(seat_lug, (0, -0.09, 0.61), 0.015, 0.015, segs=8, mat="metal")

    for sx in (-0.055, 0.055):
        pb.tube((sx, ry, wr), (sx * 0.45, bb[1], bb[2]), 0.014, 0.016, segs=8, mat="body")
        pb.tube((sx, ry, wr), (sx * 0.40, seat_lug[1], seat_lug[2] - 0.02), 0.013, 0.015, segs=8, mat="body")
        pb.tube((sx, fy, wr), (sx * 0.40, head_bot[1], head_bot[2]), 0.015, 0.018, segs=8, mat="body")

    pb.box((0.04, 0.52, 0.14), loc=(0.065, -0.30, 0.29), mat="cream", bevel=0.045, segs=2)
    pb.cyl(0.085, 0.085, 0.025, segs=16, loc=(0.075, bb[1], bb[2]), rot=(0, math.pi * 0.5, 0), mat="metal")
    for sx, pz in ((-0.12, -0.09), (0.12, 0.09)):
        pb.tube((sx * 0.5, bb[1], bb[2]), (sx, bb[1], bb[2] + pz), 0.010, 0.010, segs=6, mat="metal")
        pb.box((0.09, 0.06, 0.022), loc=(sx * 1.15, bb[1], bb[2] + pz), mat="dark", bevel=0.006)

    pb.sphere(0.11, loc=(0, -0.10, 0.635), scale=(0.88, 1.32, 0.38), mat="seat", u=14, v=10)
    for sx in (-0.045, 0.045):
        pb.cyl(0.018, 0.018, 0.05, segs=8, loc=(sx, -0.16, 0.59), mat="metal")

    stem_top = (0, fy - 0.18, 0.87)
    pb.tube(head_top, stem_top, 0.016, 0.016, segs=8, mat="metal")
    pb.pipe_path([
        (-0.27, 0.30, 0.88),
        (-0.22, 0.38, 0.89),
        (-0.08, fy - 0.18, 0.88),
        ( 0.00, fy - 0.18, 0.88),
        ( 0.08, fy - 0.18, 0.88),
        ( 0.22, 0.38, 0.89),
        ( 0.27, 0.30, 0.88),
    ], radius=0.014, segs=8, mat="metal")
    for sx in (-1, 1):
        pb.tube((sx * 0.23, 0.36, 0.885), (sx * 0.28, 0.28, 0.878), 0.021, 0.021, segs=8, mat="seat")
    pb.sphere(0.028, loc=(0.14, 0.40, 0.91), scale=(1.0, 1.0, 0.7), mat="glow", u=10, v=8)
    add_headlight(pb, (0, fy - 0.04, 0.66), r=0.056, depth=0.07)

    pb.box((0.20, 0.42, 0.025), loc=(0, -0.56, 0.68), mat="metal", bevel=0.008)
    for sx in (-0.08, 0.08):
        pb.tube((sx, ry, wr + 0.04), (sx, -0.66, 0.68), 0.010, 0.010, segs=6, mat="metal")

    if cargo:
        pb.box((0.52, 0.46, 0.34), loc=(0, fy + 0.06, 0.78), mat="wood", bevel=0.025)
        pb.box((0.46, 0.40, 0.18), loc=(0, fy + 0.06, 0.98), mat="cloth", bevel=0.05)
        for sx in (-0.18, 0.18):
            pb.tube((sx, fy, wr + 0.04), (sx, fy + 0.06, 0.62), 0.014, 0.014, segs=6, mat="dark")
    else:
        # Woven rattan wicker basket (tex_wicker) + wrapped baguette & wildflowers peeking out!
        basket_rings = [rounded_rect_ring(*s) for s in [
            (fy - 0.10, 0.15, 0.64, 0.82, 0.04, 0.04, 0.0),
            (fy + 0.12, 0.19, 0.62, 0.84, 0.05, 0.05, 0.0),
        ]]
        pb.loft(basket_rings, mat="wicker")
        pb.box((0.39, 0.24, 0.03), loc=(0, fy + 0.01, 0.84), mat="wood", bevel=0.012)
        # Cute bread parcel & coral flower peeking from basket
        pb.sphere(0.075, loc=(-0.06, fy + 0.02, 0.88), scale=(0.8, 0.8, 1.6), rot=(0.25, 0.2, 0), mat="cream", u=10, v=8)
        pb.sphere(0.055, loc=(0.08, fy + 0.03, 0.87), scale=(1.0, 1.0, 0.7), mat="coral", u=10, v=8)

    return pb.build_object()


# ---------------------------------------------------------------------------
# 5. Showa Vespa-Inspired Scooter ("scooter")
# ---------------------------------------------------------------------------
def build_scooter(mats):
    pb = PartBuilder("scooter", mats)
    add_car_wheel(pb, (0, -0.50, 0.24), radius=0.24, width=0.14, rim_mat="cream", spokes=5)
    add_car_wheel(pb, (0,  0.54, 0.24), radius=0.24, width=0.14, rim_mat="cream", spokes=5)
    pb.arch_fender((0, 0.54, 0.24), radius=0.26, width=0.18, thick=0.032, a0=-0.1, a1=math.pi * 0.72, mat="body")

    rear_rings = [rounded_rect_ring(*s) for s in [
        (-0.82, 0.16, 0.34, 0.54, 0.06, 0.08, 0.02),
        (-0.56, 0.28, 0.24, 0.58, 0.10, 0.12, 0.03),
        (-0.20, 0.26, 0.22, 0.56, 0.08, 0.10, 0.02),
        (-0.04, 0.20, 0.22, 0.36, 0.06, 0.06, 0.01),
    ]]
    pb.loft(rear_rings, mat="body")

    pb.box((0.40, 0.54, 0.07), loc=(0, 0.16, 0.24), mat="cream", bevel=0.025)
    for gx in (-0.12, 0.0, 0.12):
        pb.box((0.035, 0.44, 0.018), loc=(gx, 0.16, 0.28), mat="dark", bevel=0.006)

    apron_rings = [rounded_rect_ring(*s) for s in [
        (0.36, 0.24, 0.26, 0.80, 0.06, 0.10, 0.02),
        (0.46, 0.26, 0.28, 0.84, 0.08, 0.12, 0.03),
        (0.54, 0.16, 0.34, 0.78, 0.06, 0.08, 0.02),
    ]]
    pb.loft(apron_rings, mat="body")
    pb.box((0.09, 0.05, 0.34), loc=(0, 0.54, 0.58), mat="cream", bevel=0.02)

    pb.sphere(0.11, loc=(0, 0.46, 0.90), scale=(1.2, 0.9, 0.75), mat="body", u=14, v=10)
    add_headlight(pb, (0, 0.55, 0.90), r=0.078, depth=0.08)
    pb.pipe_path([(-0.28, 0.37, 0.90), (-0.14, 0.44, 0.90), (0.14, 0.44, 0.90), (0.28, 0.37, 0.90)], radius=0.017, segs=8, mat="metal")
    for sx in (-1, 1):
        pb.tube((sx * 0.20, 0.41, 0.90), (sx * 0.29, 0.36, 0.90), 0.024, 0.024, segs=8, mat="dark")
        add_side_mirror(pb, (sx * 0.16, 0.44, 0.94), (sx * 0.26, 0.44, 1.08), r=0.052)

    pb.box((0.32, 0.54, 0.12), loc=(0, -0.24, 0.60), mat="seat", bevel=0.05, segs=3)
    pb.box((0.28, 0.24, 0.03), loc=(0, -0.72, 0.58), mat="metal", bevel=0.01)
    # Vintage leather courier satchel on rear rack
    pb.box((0.26, 0.18, 0.16), loc=(0, -0.72, 0.68), mat="wicker", bevel=0.03)
    pb.sphere(0.05, loc=(0, -0.82, 0.48), scale=(0.8, 0.6, 1.0), mat="coral", u=10, v=8)
    pb.cyl(0.045, 0.038, 0.38, segs=12, loc=(0.24, -0.52, 0.24), rot=(math.pi * 0.5, 0, 0), mat="metal")

    return pb.build_object()


# ---------------------------------------------------------------------------
# 6. Pastoral Wooden Ox Cart ("oxcart"), Wheelbarrow & Handcart
# ---------------------------------------------------------------------------
def build_oxcart(mats):
    pb = PartBuilder("oxcart", mats)
    for sx in (-1, 1):
        add_wood_wheel(pb, (sx * 0.92, -0.26, 0.52), radius=0.52, rim_w=0.08, spokes=10)
    pb.cyl(0.055, 0.055, 1.96, segs=12, loc=(0, -0.26, 0.52), rot=(0, math.pi * 0.5, 0), mat="dark")

    pb.box((1.58, 2.24, 0.10), loc=(0, -0.34, 0.58), mat="wood", bevel=0.02)
    for sx in (-1, 1):
        for pz in (0.76, 0.96, 1.14):
            pb.box((0.06, 2.18, 0.11), loc=(sx * 0.78, -0.34, pz), mat="wood", bevel=0.015)
        for py in (-1.36, -0.78, -0.20, 0.38, 0.72):
            pb.box((0.07, 0.07, 0.64), loc=(sx * 0.78, py, 0.88), mat="dark", bevel=0.01)
    pb.box((1.58, 0.07, 0.54), loc=(0, -1.44, 0.86), mat="wood", bevel=0.015)

    pb.box((1.44, 0.42, 0.10), loc=(0, 0.0, 0.64), mat="wood", bevel=0.02)
    pb.box((1.34, 0.36, 0.07), loc=(0, 0.0, 0.70), mat="seat", bevel=0.03)

    for sx in (-0.42, 0.42):
        pb.pipe_path([(sx, 0.72, 0.58), (sx * 0.94, 1.36, 0.64), (sx * 0.86, 2.02, 0.74)], radius=0.042, segs=8, mat="wood")
    pb.cyl(0.048, 0.048, 1.06, segs=10, loc=(0, 1.94, 0.74), rot=(0, math.pi * 0.5, 0), mat="wood")
    pb.box((0.86, 0.68, 0.46), loc=(-0.18, -0.88, 0.86), mat="wicker", bevel=0.08, segs=2)
    pb.cyl(0.24, 0.22, 0.54, segs=14, loc=(0.42, -0.92, 0.90), mat="wood")

    return pb.build_object()


def build_wheelbarrow(mats):
    pb = PartBuilder("veh_wheelbarrow", mats)
    add_spoked_wheel(pb, (0, 0.58, 0.21), radius=0.21, tire_r=0.038, spokes=8)
    basin_rings = [rounded_rect_ring(*s) for s in [
        (-0.34, 0.20, 0.36, 0.64, 0.05, 0.06, 0.0),
        ( 0.04, 0.30, 0.34, 0.68, 0.06, 0.06, 0.0),
        ( 0.44, 0.26, 0.42, 0.72, 0.06, 0.06, 0.0),
        ( 0.62, 0.20, 0.56, 0.72, 0.04, 0.04, 0.0),
    ]]
    pb.loft(basin_rings, mat="body")
    pb.pipe_path([
        (-0.20, -0.34, 0.65), (-0.30, 0.04, 0.69), (-0.26, 0.44, 0.73), (-0.20, 0.62, 0.73),
        ( 0.20,  0.62, 0.73), ( 0.26, 0.44, 0.73), ( 0.30, 0.04, 0.69), ( 0.20, -0.34, 0.65),
    ], radius=0.018, segs=8, mat="metal", closed=True)

    for sx in (-1, 1):
        pb.pipe_path([(sx * 0.06, 0.58, 0.21), (sx * 0.18, 0.24, 0.32), (sx * 0.22, -0.34, 0.42), (sx * 0.26, -0.78, 0.56)], radius=0.022, segs=8, mat="metal")
        pb.tube((sx * 0.24, -0.58, 0.50), (sx * 0.27, -0.82, 0.57), 0.028, 0.026, segs=10, mat="wood")
        pb.pipe_path([(sx * 0.21, -0.18, 0.38), (sx * 0.22, -0.26, 0.04), (sx * 0.21, -0.36, 0.04), (sx * 0.22, -0.34, 0.40)], radius=0.016, segs=8, mat="dark")

    return pb.build_object()


def build_handcart(mats):
    pb = PartBuilder("prop_handcart", mats)
    for sx in (-1, 1):
        add_wood_wheel(pb, (sx * 0.54, 0.08, 0.34), radius=0.34, rim_w=0.055, spokes=8)
    pb.cyl(0.032, 0.032, 1.16, segs=10, loc=(0, 0.08, 0.34), rot=(0, math.pi * 0.5, 0), mat="dark")
    pb.box((0.92, 1.12, 0.08), loc=(0, 0.10, 0.42), mat="wood", bevel=0.015)
    for sx in (-1, 1):
        pb.box((0.06, 1.12, 0.32), loc=(sx * 0.44, 0.10, 0.60), mat="wood", bevel=0.015)
    for sy in (-0.44, 0.64):
        pb.box((0.92, 0.06, 0.32), loc=(0, sy, 0.60), mat="wood", bevel=0.015)
    pb.sphere(0.24, loc=(-0.14, 0.16, 0.64), scale=(1.1, 1.3, 0.72), mat="cloth", u=12, v=8)
    pb.box((0.36, 0.36, 0.28), loc=(0.20, -0.06, 0.60), mat="wicker", bevel=0.025)
    for sx in (-0.34, 0.34):
        pb.pipe_path([(sx, -0.44, 0.56), (sx, -0.74, 0.78), (sx, -0.82, 0.80)], radius=0.024, segs=8, mat="wood")
    pb.tube((-0.34, -0.78, 0.79), (0.34, -0.78, 0.79), 0.024, 0.024, segs=8, mat="wood")
    for sx in (-0.34, 0.34):
        pb.tube((sx, 0.48, 0.42), (sx, 0.52, 0.04), 0.020, 0.018, segs=8, mat="dark")
    return pb.build_object()


# ---------------------------------------------------------------------------
# 7. Sculpted Textured Boats ("rowboat", "kayak", "canoe") & Kite ("kite")
# ---------------------------------------------------------------------------
def build_boat(name, mats, length=3.2, beam=1.18, depth=0.46, hull_mat="wood", trim_mat="cream", oars=True):
    pb = PartBuilder(name, mats)
    hl = length * 0.5
    hb = beam * 0.5
    stations = [
        (-1.00, 0.04, 0.22, depth + 0.10),
        (-0.82, 0.46, 0.06, depth + 0.04),
        (-0.45, 0.90, 0.00, depth),
        ( 0.00, 1.00, 0.00, depth - 0.02),
        ( 0.45, 0.90, 0.00, depth),
        ( 0.82, 0.46, 0.06, depth + 0.04),
        ( 1.00, 0.04, 0.22, depth + 0.10),
    ]
    outer_rings, inner_rings = [], []
    wall = 0.045
    for frac, wf, z0, z1 in stations:
        y = frac * hl
        w = max(0.03, wf * hb)
        outer_rings.append([
            (-w, y, z1), (-w * 0.92, y, z0 + (z1 - z0) * 0.42), (-w * 0.58, y, z0 + (z1 - z0) * 0.10),
            (0.0, y, z0), (w * 0.58, y, z0 + (z1 - z0) * 0.10), (w * 0.92, y, z0 + (z1 - z0) * 0.42), (w, y, z1),
        ])
        wi = max(0.015, w - wall)
        zi0 = z0 + wall
        inner_rings.append([
            (wi, y, z1), (wi * 0.90, y, zi0 + (z1 - zi0) * 0.42), (wi * 0.56, y, zi0 + (z1 - zi0) * 0.10),
            (0.0, y, zi0), (-wi * 0.56, y, zi0 + (z1 - zi0) * 0.10), (-wi * 0.90, y, zi0 + (z1 - zi0) * 0.42), (-wi, y, z1),
        ])
    pb.loft([o + i for o, i in zip(outer_rings, inner_rings)], mat=hull_mat, cap_start=True, cap_end=True)
    for sx in (-1, 1):
        pb.pipe_path([(sx * max(0.03, wf * hb), frac * hl, z1 + 0.012) for frac, wf, z0, z1 in stations], radius=0.026, segs=8, mat=trim_mat)
    pb.box((beam * 0.52, length * 0.46, 0.03), loc=(0, 0, 0.08), mat="wood", bevel=0.01)
    pb.box((beam * 0.84, 0.28, 0.045), loc=(0, 0.0, depth * 0.64), mat="wood", bevel=0.015)
    if length > 2.8:
        pb.box((beam * 0.62, 0.24, 0.045), loc=(0, -hl * 0.48, depth * 0.68), mat="wood", bevel=0.015)
        pb.box((beam * 0.58, 0.24, 0.045), loc=(0,  hl * 0.48, depth * 0.68), mat="wood", bevel=0.015)
    if oars:
        for sx in (-1, 1):
            pb.cyl(0.016, 0.016, 0.07, segs=8, loc=(sx * hb * 0.96, 0.14, depth + 0.03), mat="metal")
            pb.tube((sx * hb * 0.66, -0.62, depth * 0.72), (sx * hb * 0.72, 0.64, depth * 0.74), 0.018, 0.016, segs=8, mat="wood")
            pb.box((0.022, 0.34, 0.10), loc=(sx * hb * 0.73, 0.76, depth * 0.74), mat="coral", bevel=0.012)
    else:
        pb.tube((0.0, -0.82, depth * 0.78), (0.0, 0.82, depth * 0.78), 0.016, 0.016, segs=8, mat="wood")
        for sy in (-0.96, 0.96):
            pb.box((0.12, 0.30, 0.02), loc=(0.0, sy, depth * 0.78), mat="coral", bevel=0.01)
    return pb.build_object()


def build_kite(mats):
    pb = PartBuilder("kite", mats)
    span_stations = [
        (-0.88,  0.10, -0.18, -0.11),
        (-0.62,  0.34, -0.26, -0.05),
        (-0.32,  0.54, -0.44,  0.02),
        ( 0.00,  0.68, -0.64,  0.06),
        ( 0.32,  0.54, -0.44,  0.02),
        ( 0.62,  0.34, -0.26, -0.05),
        ( 0.88,  0.10, -0.18, -0.11),
    ]
    sail_rings = []
    for x, yf, yb, zc in span_stations:
        ym = (yf + yb) * 0.5
        t = 0.016
        sail_rings.append([(x, yf, zc), (x, ym, zc + 0.025 + t), (x, yb, zc), (x, ym, zc + 0.025 - t)])
    pb.loft(sail_rings, mat="cloth", cap_start=True, cap_end=True)

    band_rings = []
    for x, yf, yb, zc in span_stations[1:-1]:
        y1 = yb + (yf - yb) * 0.68
        y2 = yb + (yf - yb) * 0.36
        band_rings.append([(x, y1, zc + 0.049), (x, y2, zc + 0.049), (x, y2, zc + 0.037), (x, y1, zc + 0.037)])
    pb.loft(band_rings, mat="body")

    band2_rings = []
    for x, yf, yb, zc in span_stations[1:-1]:
        y1 = yb + (yf - yb) * 0.30
        y2 = yb + (yf - yb) * 0.16
        band2_rings.append([(x, y1, zc + 0.044), (x, y2, zc + 0.044), (x, y2, zc + 0.032), (x, y1, zc + 0.032)])
    pb.loft(band2_rings, mat="coral")

    for sx in (-1, 1):
        pb.loft([
            [(sx * 0.04, -0.48, 0.04), (sx * 0.24, -0.36, 0.01), (sx * 0.24, -0.36, -0.01), (sx * 0.04, -0.48, 0.02)],
            [(sx * 0.16, -0.78, -0.02), (sx * 0.34, -0.66, -0.04), (sx * 0.34, -0.66, -0.06), (sx * 0.16, -0.78, -0.04)],
            [(sx * 0.26, -0.96, -0.06), (sx * 0.34, -0.92, -0.07), (sx * 0.34, -0.92, -0.08), (sx * 0.26, -0.96, -0.07)],
        ], mat="coral")

    pb.pipe_path([(0.0, 0.70, 0.04), (0.0, 0.10, 0.06), (0.0, -0.66, 0.02)], radius=0.014, segs=8, mat="wood")
    pb.pipe_path([(-0.90, 0.06, -0.12), (-0.46, 0.22, -0.01), (0.00, 0.28, 0.06), (0.46, 0.22, -0.01), (0.90, 0.06, -0.12)], radius=0.013, segs=8, mat="wood")
    pb.sphere(0.075, loc=(0, 0.24, 0.07), scale=(1.0, 1.0, 0.35), mat="glow", u=14, v=8)

    tail_pts = []
    for i in range(12):
        t = i / 11.0
        tail_pts.append((math.sin(t * math.pi * 2.2) * (0.08 + t * 0.10), -0.64 - t * 1.48, -t * 0.18 + math.cos(t * math.pi * 2.0) * 0.03))
    pb.pipe_path(tail_pts, radius=0.010, segs=6, mat="cream")
    for idx, bow_mat in ((2, "coral"), (5, "body"), (8, "glow"), (10, "coral")):
        bx, by, bz = tail_pts[idx]
        pb.box((0.16, 0.06, 0.018), loc=(bx, by, bz), rot=(0, 0, 0.25 if idx % 2 == 0 else -0.25), mat=bow_mat, bevel=0.006)
    for sx in (-1, 1):
        pb.pipe_path([(sx * 0.88, -0.12, -0.11), (sx * 0.92, -0.44, -0.16), (sx * 0.86, -0.78, -0.22)], radius=0.009, segs=6, mat="coral")
    return pb.build_object()


# ---------------------------------------------------------------------------
# 8. High-Craft Textured Ghibli HSR ("HSR_Head", "HSR_Mid", "HSR_Tail" + Doors)
# ---------------------------------------------------------------------------
def add_hsr_bogie(pb, cy):
    pb.box((1.94, 2.36, 0.22), loc=(0, cy, 0.38), mat="dark", bevel=0.04)
    for sx in (-1, 1):
        pb.box((0.18, 2.18, 0.24), loc=(sx * 0.96, cy, 0.42), mat="dark", bevel=0.04)
        for sy in (-0.34, 0.34):
            pb.cyl(0.11, 0.11, 0.20, segs=12, loc=(sx * 0.96, cy + sy, 0.56), mat="teal")
        for wy in (-0.82, 0.82):
            pb.cyl(0.38, 0.38, 0.13, segs=20, loc=(sx * 0.80, cy + wy, 0.38), rot=(0, math.pi * 0.5, 0), mat="dark")
            pb.cyl(0.42, 0.42, 0.03, segs=20, loc=(sx * 0.72, cy + wy, 0.38), rot=(0, math.pi * 0.5, 0), mat="gold")
            pb.cyl(0.16, 0.16, 0.16, segs=12, loc=(sx * 0.80, cy + wy, 0.38), rot=(0, math.pi * 0.5, 0), mat="gold")
    for wy in (-0.82, 0.82):
        pb.cyl(0.06, 0.06, 1.66, segs=10, loc=(0, cy + wy, 0.38), rot=(0, math.pi * 0.5, 0), mat="dark")


def add_hsr_seat_pair(pb, sx, cy, face_dir=1.0):
    cx = sx * 0.86
    pb.box((0.52, 0.36, 0.28), loc=(cx, cy, 0.66), mat="dark", bevel=0.03)
    pb.box((0.76, 0.54, 0.14), loc=(cx, cy, 0.86), mat="seat", bevel=0.05, segs=3)
    by = cy - face_dir * 0.24
    pb.box((0.76, 0.14, 0.66), loc=(cx, by, 1.24), rot=(face_dir * -0.14, 0, 0), mat="seat", bevel=0.05, segs=3)
    pb.box((0.56, 0.08, 0.20), loc=(cx, by + face_dir * 0.06, 1.48), rot=(face_dir * -0.14, 0, 0), mat="cream", bevel=0.03)
    for ax in (-0.38, 0.38):
        pb.box((0.06, 0.48, 0.06), loc=(cx + ax, cy + face_dir * 0.02, 1.06), mat="wood", bevel=0.02)
    pb.box((0.58, 0.04, 0.30), loc=(cx, by - face_dir * 0.09, 1.18), mat="wood", bevel=0.015)


def build_hsr_car(name, mats, role="mid"):
    pb = PartBuilder(name, mats)
    hw = 1.48
    # 加长车身至 15.6m（±7.8m），配合全包围风挡（延伸至 ±8.16m）与游戏内 GAP=16.0m 严丝合缝连成流线整体！
    y_min, y_max = -7.8, 7.8

    # 车底一体化空气动力底盘与两侧流线裙板（包覆转向架，整体感拉满）
    pb.box((2.88, 15.5, 0.36), loc=(0, 0, 0.50), mat="dark", bevel=0.06)
    for sx in (-1, 1):
        # 中段与两端流线裙板，仅在转向架轮对处优雅留空
        for sy0, sy1 in ((-7.75, -6.55), (-3.85, 3.85), (6.55, 7.75)):
            pb.box((0.12, sy1 - sy0, 0.44), loc=(sx * (hw - 0.05), (sy0 + sy1) * 0.5, 0.50), mat="dark", bevel=0.025)
    pb.box((2.76, 15.4, 0.06), loc=(0, 0, 0.69), mat="wood", bevel=0.01)
    pb.box((0.88, 15.2, 0.02), loc=(0, 0, 0.725), mat="teal", bevel=0.005)
    add_hsr_bogie(pb, -5.2)
    add_hsr_bogie(pb,  5.2)

    # 流线弧顶（无缝贯穿全长）
    roof_stations = []
    for y in (y_min, y_min + 0.5, 0.0, y_max - 0.5, y_max):
        roof_stations.append([
            (-hw, y, 2.74), (-hw + 0.08, y, 3.02), (-hw + 0.32, y, 3.24), (-0.62, y, 3.36), (0.00, y, 3.40),
            (0.62, y, 3.36), (hw - 0.32, y, 3.24), (hw - 0.08, y, 3.02), (hw, y, 2.74),
            (hw - 0.14, y, 2.74), (hw - 0.38, y, 3.12), (0.00, y, 3.24), (-hw + 0.38, y, 3.12), (-hw + 0.14, y, 2.74),
        ])
    pb.loft(roof_stations, mat="cream")
    # 车顶流线空调整流罩与高压电缆槽
    pb.box((1.58, 3.40, 0.22), loc=(0, -3.6, 3.44), mat="cream", bevel=0.09, segs=2)
    pb.box((1.58, 3.40, 0.22), loc=(0,  3.6, 3.44), mat="cream", bevel=0.09, segs=2)
    pb.box((0.26, 15.0, 0.08), loc=(0, 0.0, 3.42), mat="dark", bevel=0.02)
    if role == "mid":
        pb.box((0.94, 1.12, 0.10), loc=(0, 0.0, 3.44), mat="dark", bevel=0.02)
        for sx in (-0.30, 0.30):
            pb.tube((sx, -0.30, 3.48), (sx, 0.32, 3.86), 0.022, 0.022, segs=6, mat="gold")
            pb.tube((sx,  0.32, 3.86), (sx, -0.18, 4.22), 0.020, 0.020, segs=6, mat="gold")
        pb.box((1.28, 0.12, 0.05), loc=(0, -0.18, 4.24), mat="dark", bevel=0.015)

    # 两侧车厢围壁、连续海青/暖金涂装腰线与宽景车窗
    for sx in (-1, 1):
        wx = sx * (hw - 0.07)
        for seg_y0, seg_y1 in ((y_min, -0.96), (0.96, y_max)):
            seg_len = seg_y1 - seg_y0
            seg_cy = (seg_y0 + seg_y1) * 0.5
            pb.box((0.14, seg_len, 0.88), loc=(wx, seg_cy, 1.14), mat="cream", bevel=0.025)
            pb.box((0.165, seg_len, 0.28), loc=(wx, seg_cy, 1.04), mat="teal", bevel=0.015)
            pb.box((0.17, seg_len, 0.075), loc=(wx, seg_cy, 1.24), mat="gold", bevel=0.01)
            pb.box((0.14, seg_len, 0.28), loc=(wx, seg_cy, 2.66), mat="cream", bevel=0.02)
            # 顶部海青装饰眉带 + 深色一体窗框
            pb.box((0.165, seg_len, 0.11), loc=(wx, seg_cy, 2.66), mat="teal", bevel=0.012)
            pb.box((0.155, seg_len - 0.08, 0.06), loc=(wx, seg_cy, 1.56), mat="dark", bevel=0.01)
            pb.box((0.155, seg_len - 0.08, 0.06), loc=(wx, seg_cy, 2.53), mat="dark", bevel=0.01)
            pb.box((0.05, seg_len - 0.16, 0.96), loc=(wx, seg_cy, 2.06), mat="glass", bevel=0.01)
            # 每段 4 扇等宽大观景窗
            for k in range(5):
                py = seg_y0 + 0.14 + (seg_len - 0.28) * (k / 4.0)
                pb.box((0.16, 0.24, 1.02), loc=(wx, py, 2.06), mat="cream", bevel=0.025)
                pb.box((0.17, 0.06, 0.98), loc=(wx, py, 2.06), mat="dark", bevel=0.01)
        # 车门门框上方 LED 指示灯带与金色门槛
        pb.box((0.15, 1.96, 0.26), loc=(wx, 0.0, 2.66), mat="cream", bevel=0.02)
        pb.box((0.17, 1.12, 0.11), loc=(wx, 0.0, 2.66), mat="glow", bevel=0.015)
        pb.box((0.19, 1.96, 0.06), loc=(wx, 0.0, 0.70), mat="gold", bevel=0.012)
        for seg_cy in (-4.35, 4.35):
            pb.box((0.36, 6.20, 0.04), loc=(sx * (hw - 0.30), seg_cy, 2.64), mat="gold", bevel=0.01)

    # 车厢内温暖顶灯与木梁
    for ly in (-6.0, -3.6, -1.2, 1.2, 3.6, 6.0):
        pb.box((2.40, 0.12, 0.08), loc=(0, ly, 3.18), mat="wood", bevel=0.02)
        pb.sphere(0.18, loc=(0, ly, 3.12), scale=(1.4, 1.0, 0.35), mat="glow", u=12, v=8)

    # 8 排双侧舒适座椅
    for sy in (-6.4, -5.0, -3.6, -2.2, 2.2, 3.6, 5.0, 6.4):
        add_hsr_seat_pair(pb, -1, sy, face_dir=1.0)
        add_hsr_seat_pair(pb,  1, sy, face_dir=1.0)

    def add_gangway_end(ey):
        sgn = 1.0 if ey > 0 else -1.0
        # 端墙与贯通门框
        pb.box((0.86, 0.16, 2.22), loc=(-1.02, ey, 1.82), mat="cream", bevel=0.03)
        pb.box((0.86, 0.16, 2.22), loc=( 1.02, ey, 1.82), mat="cream", bevel=0.03)
        pb.box((1.24, 0.16, 0.62), loc=( 0.00, ey, 2.84), mat="cream", bevel=0.03)
        # 全包围流线风挡外罩（宽 2.74m 与车体轮廓齐平，向外延伸 0.36m，与相邻车厢严丝合缝咬合！）
        pb.box((2.76, 0.38, 2.58), loc=(0, ey + sgn * 0.20, 1.88), mat="dark", bevel=0.08)
        # 车顶过渡整流风挡与三道手风琴褶皱纹理，视觉完全一体化
        pb.box((2.24, 0.36, 0.32), loc=(0, ey + sgn * 0.19, 3.16), mat="dark", bevel=0.08)
        for p_off in (0.09, 0.21, 0.33):
            pb.box((2.82, 0.045, 2.48), loc=(0, ey + sgn * p_off, 1.88), mat="dark", bevel=0.012)
        # 两侧风挡延续腰线（让色带在车厢接缝处不断裂）
        for sx in (-1, 1):
            pb.box((0.08, 0.36, 0.26), loc=(sx * 1.38, ey + sgn * 0.19, 1.04), mat="teal", bevel=0.01)

    def add_bullet_nose(sgn):
        base_y = sgn * y_max
        nose_len = 4.60
        rings = []
        for i in range(11):
            t = i / 10.0
            y = base_y + sgn * (t * nose_len)
            w = hw * (1.0 - 0.74 * (t ** 1.65))
            z_bot = 0.38 + 0.44 * (t ** 1.4)
            z_top = 3.38 - 2.08 * (t ** 1.25)
            crown = 0.07 * (1.0 - t)
            rings.append(rounded_rect_ring(y, w, z_bot, z_top, r_bot=0.14 * (1 - 0.5 * t), r_top=0.28 * (1 - 0.5 * t), crown=crown))
        if sgn < 0:
            rings.reverse()
        pb.loft(rings, mat="cream")
        for sx in (-1, 1):
            teal_pts, gold_pts, top_pts = [], [], []
            for i in range(10):
                t = i / 9.0 * 0.90
                y = base_y + sgn * (t * nose_len)
                w = hw * (1.0 - 0.74 * (t ** 1.65)) + 0.025
                teal_pts.append((sx * w, y, 1.04 + 0.06 * t))
                gold_pts.append((sx * w, y, 1.24 + 0.04 * t))
                if t < 0.36:
                    top_pts.append((sx * (w * 0.96), y, 2.66 - 0.32 * t))
            pb.pipe_path(teal_pts, radius=0.095, segs=8, mat="teal")
            pb.pipe_path(gold_pts, radius=0.035, segs=8, mat="gold")
            if len(top_pts) >= 2:
                pb.pipe_path(top_pts, radius=0.055, segs=8, mat="teal")
        # 鼻尖流线车钩盖
        pb.sphere(0.38, loc=(0, base_y + sgn * (nose_len + 0.04), 1.02), scale=(1.15, 1.42, 0.68), mat="gold", u=16, v=12)
        # 驾驶室弧形全景深色前挡风玻璃（略凸出流线鼻面，轮廓鲜明立体）
        ws_rings = []
        for t in (0.10, 0.28, 0.48, 0.62):
            y = base_y + sgn * (t * nose_len)
            w = hw * (1.0 - 0.74 * (t ** 1.65)) * 0.90 + 0.04
            z_top = 3.38 - 2.08 * (t ** 1.25) + 0.10
            ws_rings.append([(-w, y, z_top - 0.42), (-w * 0.82, y, z_top - 0.04), (0.0, y, z_top + 0.06), (w * 0.82, y, z_top - 0.04), (w, y, z_top - 0.42), (0.0, y, z_top - 0.32)])
        if sgn < 0:
            ws_rings.reverse()
        pb.loft(ws_rings, mat="cockpit")
        for sx in (-1, 1):
            pb.sphere(0.18, loc=(sx * 0.72, base_y + sgn * 3.15, 1.46), scale=(1.15, 1.55, 0.68), mat="glow", u=12, v=8)
            pb.torus(0.19, 0.032, maj_segs=16, min_segs=6, loc=(sx * 0.72, base_y + sgn * 3.12, 1.46), rot=(math.pi * 0.5, 0, 0), mat="dark")
        pb.box((1.02, 0.16, 0.08), loc=(0, base_y + sgn * 3.96, 1.16), mat="dark", bevel=0.02)
        pb.box((0.92, 0.17, 0.05), loc=(0, base_y + sgn * 3.98, 1.16), mat="glow", bevel=0.01)

    if role == "head":
        add_gangway_end(y_min)
        add_bullet_nose(+1)
    elif role == "tail":
        add_bullet_nose(-1)
        add_gangway_end(y_max)
    else:
        add_gangway_end(y_min)
        add_gangway_end(y_max)

    car_obj = pb.build_object()
    for side_tag, sx in (("L", -1), ("R", 1)):
        dpb = PartBuilder(f"{name}_Door_{side_tag}", mats)
        dx = sx * (hw - 0.03)
        dpb.box((0.08, 1.82, 0.86), loc=(dx, 0.0, 1.14), mat="cream", bevel=0.02)
        dpb.box((0.095, 1.82, 0.24), loc=(dx, 0.0, 1.06), mat="teal", bevel=0.015)
        dpb.box((0.10, 1.82, 0.065), loc=(dx, 0.0, 1.24), mat="gold", bevel=0.01)
        dpb.box((0.08, 0.26, 0.98), loc=(dx, -0.78, 2.04), mat="cream", bevel=0.02)
        dpb.box((0.08, 0.26, 0.98), loc=(dx,  0.78, 2.04), mat="cream", bevel=0.02)
        dpb.box((0.08, 1.82, 0.18), loc=(dx,  0.00, 2.50), mat="cream", bevel=0.02)
        dpb.box((0.04, 1.32, 0.88), loc=(dx,  0.00, 2.02), mat="glass", bevel=0.01)
        dpb.box((0.095, 0.03, 1.84), loc=(dx, 0.0, 1.64), mat="dark", bevel=0.005)
        dpb.build_object(parent=car_obj)
    return car_obj


def render_preview(filepath, cam_loc, target, res=(1100, 680)):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.filepath = filepath
    world = bpy.data.worlds.new("PreviewWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.76, 0.86, 0.95, 1.0)
        bg.inputs["Strength"].default_value = 0.85
    sun_d = bpy.data.lights.new("Sun", type='SUN')
    sun_d.energy = 3.2
    sun_d.color = (1.0, 0.95, 0.86)
    sun = bpy.data.objects.new("Sun", sun_d)
    sun.rotation_euler = Euler((math.radians(48), math.radians(15), math.radians(38)), 'XYZ')
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


def export_vehicles():
    clear_scene()
    mats = get_vehicle_mats()
    objs = [
        build_car(mats),
        build_truck(mats),
        build_bus(mats),
        build_bicycle(mats, cargo=False),
        build_bicycle(mats, cargo=True),
        build_scooter(mats),
        build_oxcart(mats),
        build_wheelbarrow(mats),
        build_handcart(mats),
        build_boat("rowboat", mats, length=3.2, beam=1.22, depth=0.46, hull_mat="wood", trim_mat="cream", oars=True),
        build_boat("kayak",   mats, length=3.4, beam=0.76, depth=0.34, hull_mat="body", trim_mat="cream", oars=False),
        build_boat("canoe",   mats, length=3.6, beam=0.92, depth=0.42, hull_mat="wood", trim_mat="coral", oars=False),
        build_kite(mats),
    ]
    out_glb = os.path.join(OUT_DIR, "vehicles.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format='GLB',
        export_apply=True,
        export_normals=True,
        export_texcoords=True,
        export_materials='EXPORT',
    )
    print(f"[EXPORTED] {out_glb} ({len(objs)} textured Coal-Town vehicles + kite)")

    # Close-up hero render of car, truck, bicycle, scooter!
    objs[0].location = Vector((-1.9, 0.0, 0))   # car
    objs[1].location = Vector(( 1.9, 0.0, 0))   # truck
    objs[3].location = Vector((-0.6, 2.3, 0))   # bicycle
    objs[5].location = Vector(( 0.8, 2.3, 0))   # scooter
    for o in objs[2:3] + objs[4:5] + objs[6:]:
        o.location = Vector((0, -30, 0))
    bpy.ops.mesh.primitive_plane_add(size=18, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(make_mat("gnd", (0.58, 0.72, 0.48), roughness=0.9))
    render_preview(os.path.join(PREVIEW_DIR, "preview_vehicles_textured.png"), cam_loc=(3.8, 5.4, 2.5), target=(0.0, 0.6, 0.55), res=(1280, 720))


def render_tripo_studio(filepath, cam_loc, target, res=(1600, 1000), ortho_scale=None, lens=50.0):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.filepath = filepath
    scene.render.image_settings.file_format = 'PNG'
    try:
        scene.view_settings.view_transform = 'AgX'
    except Exception:
        scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new("TripoStudioWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        # 柔和浅灰棚拍背景，让暖象牙白车身与车顶轮廓层次清晰不曝光（Tripo 抠图与体积识别最佳）
        bg.inputs["Color"].default_value = (0.86, 0.88, 0.91, 1.0)
        bg.inputs["Strength"].default_value = 0.72
    lights = []
    for lname, energy, color, rot in (
        ("KeySun", 1.85, (1.0, 0.97, 0.92), (math.radians(44), math.radians(14), math.radians(38))),
        ("FillSun", 0.75, (0.88, 0.94, 1.0), (math.radians(52), math.radians(-12), math.radians(-135))),
        ("RimSun", 0.65, (1.0, 0.96, 0.90), (math.radians(26), math.radians(6), math.radians(155))),
    ):
        ld = bpy.data.lights.new(lname, type='SUN')
        ld.energy = energy
        ld.color = color
        lo = bpy.data.objects.new(lname, ld)
        lo.rotation_euler = Euler(rot, 'XYZ')
        scene.collection.objects.link(lo)
        lights.append(lo)
    cam_d = bpy.data.cameras.new("TripoCam")
    if ortho_scale is not None:
        cam_d.type = 'ORTHO'
        cam_d.ortho_scale = ortho_scale
    else:
        cam_d.type = 'PERSP'
        cam_d.lens = lens
    cam = bpy.data.objects.new("TripoCam", cam_d)
    cam.location = Vector(cam_loc)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    for lo in lights:
        bpy.data.objects.remove(lo, do_unlink=True)


def set_tree_hide(obj, hide):
    obj.hide_render = hide
    for ch in obj.children:
        ch.hide_render = hide


def export_hsr():
    clear_scene()
    mats = get_hsr_mats()
    head = build_hsr_car("HSR_Head", mats, role="head")
    mid  = build_hsr_car("HSR_Mid",  mats, role="mid")
    tail = build_hsr_car("HSR_Tail", mats, role="tail")
    out_glb = os.path.join(OUT_DIR, "hsr_train.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format='GLB',
        export_apply=True,
        export_normals=True,
        export_texcoords=True,
        export_materials='EXPORT',
    )
    print(f"[EXPORTED] {out_glb} (textured unified HSR cars + doors)")

    # 渲染 Tripo 高精度 3D 建模参考图（纯净棚拍背景 + 无缝联挂编组 & 单车多视图）
    tripo_dir = os.path.join(OUT_DIR, "tripo_ref")
    os.makedirs(tripo_dir, exist_ok=True)
    # 1) 完整三节一体化联挂列车（全长完整入画，车距 16.0m，全包围风挡严丝合缝）
    head.location = Vector((0.0,  16.0, 0.0))
    mid.location  = Vector((0.0,   0.0, 0.0))
    tail.location = Vector((0.0, -16.0, 0.0))
    render_tripo_studio(
        os.path.join(tripo_dir, "hsr_tripo_full_train_3quarter.png"),
        cam_loc=(28.0, 34.0, 11.0), target=(0.0, 0.5, 1.8), res=(1920, 1080), lens=44.0,
    )
    # 2) 单节流线车头（隐藏中车与尾车，全车身含鼻尖完整居中，最适合 Tripo 图生 3D 主图）
    head.location = Vector((0.0, 0.0, 0.0))
    set_tree_hide(mid, True)
    set_tree_hide(tail, True)
    render_tripo_studio(
        os.path.join(tripo_dir, "hsr_tripo_head_3quarter.png"),
        cam_loc=(15.5, 20.5, 5.4), target=(0.0, 2.2, 1.75), res=(1600, 1080), lens=46.0,
    )
    # 3) 正交侧视图（Tripo 多视图建模：Side）
    render_tripo_studio(
        os.path.join(tripo_dir, "hsr_tripo_head_side.png"),
        cam_loc=(26.0, 2.2, 2.0), target=(0.0, 2.2, 2.0), res=(1800, 900), ortho_scale=23.5,
    )
    # 4) 正交正前视图（Tripo 多视图建模：Front，仅车头无背景穿帮）
    render_tripo_studio(
        os.path.join(tripo_dir, "hsr_tripo_head_front.png"),
        cam_loc=(0.0, 26.0, 1.9), target=(0.0, 0.0, 1.9), res=(1080, 1080), ortho_scale=5.8,
    )
    print(f"[EXPORTED] 4 Tripo studio reference images in {tripo_dir}")


if __name__ == "__main__":
    import sys
    if "--hsr-only" not in sys.argv:
        export_vehicles()
    export_hsr()
    print("[ALL DONE] Textured Coal-Town vehicles, kite & HSR train built successfully.")
