"""
High-Craft Ghibli Vehicle, High-Speed Rail (HSR) & 3D Kite Sculpted Builder
Runs inside Blender 5.3 (--factory-startup --background).

Exports:
  - public/vehicles/hsr_train.glb  (HSR_Head, HSR_Mid, HSR_Tail + _Door_L/_R)
  - public/vehicles/vehicles.glb   (car, truck, bus, bicycle, cargobike, scooter,
                                    oxcart, veh_wheelbarrow, prop_handcart,
                                    rowboat, kayak, canoe, kite)
Also renders multi-angle EEVEE verification previews into scratch directory.
"""
import math
import os
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

ROOT = r"d:\DSH DEMO\deepseek-world"
OUT_DIR = os.path.join(ROOT, "public", "vehicles")
PREVIEW_DIR = r"C:\Users\shilaoban\.gemini\antigravity\brain\8cc60f92-f47e-4a8b-bc27-26a746fb2f13\scratch"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Scene & Material Helpers
# ---------------------------------------------------------------------------
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, rgba, roughness=0.52, metallic=0.0, alpha=1.0, emission=0.0):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if alpha < 0.99:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    if emission > 0.0:
        bsdf.inputs["Emission Color"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def get_vehicle_mats():
    return {
        "body":  make_mat("veh_body",  (0.84, 0.34, 0.27), roughness=0.38),
        "cream": make_mat("veh_cream", (0.96, 0.92, 0.82), roughness=0.45),
        "wood":  make_mat("veh_wood",  (0.56, 0.36, 0.19), roughness=0.68),
        "dark":  make_mat("veh_dark",  (0.16, 0.17, 0.20), roughness=0.72),
        "glass": make_mat("veh_glass", (0.64, 0.86, 0.95), roughness=0.12, alpha=0.42),
        "metal": make_mat("veh_metal", (0.76, 0.78, 0.80), roughness=0.28, metallic=0.55),
        "glow":  make_mat("veh_glow",  (1.00, 0.93, 0.66), roughness=0.20, emission=2.2),
        "seat":  make_mat("veh_seat",  (0.58, 0.32, 0.20), roughness=0.58),
        "coral": make_mat("veh_coral", (0.92, 0.45, 0.34), roughness=0.42),
    }


def get_hsr_mats():
    return {
        "cream": make_mat("hsr_cream", (0.96, 0.94, 0.88), roughness=0.32),
        "teal":  make_mat("hsr_teal",  (0.16, 0.56, 0.62), roughness=0.35),
        "gold":  make_mat("hsr_gold",  (0.88, 0.70, 0.26), roughness=0.30, metallic=0.35),
        "dark":  make_mat("hsr_dark",  (0.18, 0.20, 0.24), roughness=0.65),
        "glass": make_mat("hsr_glass", (0.58, 0.82, 0.94), roughness=0.10, alpha=0.38),
        "wood":  make_mat("hsr_wood",  (0.66, 0.46, 0.28), roughness=0.60),
        "seat":  make_mat("hsr_seat",  (0.24, 0.46, 0.54), roughness=0.62),
        "glow":  make_mat("hsr_glow",  (1.00, 0.95, 0.74), roughness=0.18, emission=2.6),
    }


# ---------------------------------------------------------------------------
# High-Craft BMesh Geometry Builder
# ---------------------------------------------------------------------------
class PartBuilder:
    """Accumulates sculpted parts with per-face material indices into one clean mesh."""
    def __init__(self, name, mat_dict):
        self.name = name
        self.mat_dict = mat_dict
        self.mat_order = list(mat_dict.keys())
        self.mat_index = {k: i for i, k in enumerate(self.mat_order)}
        self.bm = bmesh.new()

    def _assign_mat(self, faces, mat_key, smooth=True):
        idx = self.mat_index[mat_key]
        for f in faces:
            f.material_index = idx
            f.smooth = smooth

    def _xform(self, verts, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        m = (Matrix.Translation(Vector(loc))
             @ Euler(rot, 'XYZ').to_matrix().to_4x4()
             @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0)))
        bmesh.ops.transform(self.bm, matrix=m, verts=verts)

    def add_box(self, size, loc=(0, 0, 0), rot=(0, 0, 0), mat="body", bevel=0.0, segs=2, smooth=False):
        ret = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = ret["verts"]
        bmesh.ops.scale(self.bm, vec=Vector(size), verts=verts)
        if bevel > 0.0:
            edges = list({e for v in verts for e in v.link_edges})
            bmesh.ops.bevel(
                self.bm, geom=edges, offset=bevel, segments=segs,
                profile=0.5, affect='EDGES', clamp_overlap=True
            )
            verts = list({v for e in self.bm.edges if any(f.material_index == 0 for f in e.link_faces) for v in e.verts}) if False else verts
            # Safer: build into temp bm when beveling so transforms only affect this part!
        # Rebuild cleanly via temp bm for isolated bevel/transform
        return self._add_bevel_box_isolated(size, loc, rot, mat, bevel, segs, smooth) if False else None

    def box(self, size, loc=(0, 0, 0), rot=(0, 0, 0), mat="body", bevel=0.0, segs=2, smooth=False):
        tbm = bmesh.new()
        bmesh.ops.create_cube(tbm, size=1.0)
        bmesh.ops.scale(tbm, vec=Vector(size), verts=tbm.verts)
        if bevel > 0.0:
            bmesh.ops.bevel(
                tbm, geom=list(tbm.edges), offset=bevel, segments=segs,
                profile=0.55, affect='EDGES', clamp_overlap=True
            )
        self._merge_temp(tbm, loc, rot, mat, smooth)

    def cyl(self, r1, r2, depth, segs=18, loc=(0, 0, 0), rot=(0, 0, 0), mat="metal", smooth=True, cap=True):
        tbm = bmesh.new()
        bmesh.ops.create_cone(
            tbm, cap_ends=cap, cap_tris=False, segments=segs,
            radius1=r1, radius2=r2, depth=depth
        )
        self._merge_temp(tbm, loc, rot, mat, smooth)

    def sphere(self, r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), mat="body", u=16, v=12, smooth=True):
        tbm = bmesh.new()
        bmesh.ops.create_uvsphere(tbm, u_segments=u, v_segments=v, radius=r)
        bmesh.ops.scale(tbm, vec=Vector(scale), verts=tbm.verts)
        self._merge_temp(tbm, loc, rot, mat, smooth)

    def torus(self, major_r, minor_r, maj_segs=24, min_segs=12, loc=(0, 0, 0), rot=(0, 0, 0), mat="dark", smooth=True):
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
        self._merge_temp(tbm, loc, rot, mat, smooth)

    def tube(self, p0, p1, r0, r1=None, segs=12, mat="metal", smooth=True, cap=True):
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
        self._merge_temp(tbm, (0, 0, 0), (0, 0, 0), mat, smooth)

    def pipe_path(self, pts, radius, segs=10, mat="metal", closed=False, smooth=True):
        """Sweeps a smooth circular tube along a 3D polyline."""
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
        self._merge_temp(tbm, (0, 0, 0), (0, 0, 0), mat, smooth)

    def loft(self, rings_pts, mat="body", cap_start=True, cap_end=True, smooth=True, close_ring=True):
        """Lofts a smooth shell through ordered lists of 3D ring vertices."""
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
        self._merge_temp(tbm, (0, 0, 0), (0, 0, 0), mat, smooth)

    def arch_fender(self, loc, radius, width, thick=0.035, a0=-0.18, a1=math.pi + 0.18, segs=16, mat="body"):
        """Curved wheel arch / mudguard facing along X axis."""
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
            # 4-point cross section
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
        self._merge_temp(tbm, (0, 0, 0), (0, 0, 0), mat, smooth=True)

    def _merge_temp(self, tbm, loc, rot, mat, smooth):
        if loc != (0, 0, 0) or rot != (0, 0, 0):
            m = Matrix.Translation(Vector(loc)) @ Euler(rot, 'XYZ').to_matrix().to_4x4()
            bmesh.ops.transform(tbm, matrix=m, verts=tbm.verts)
        bmesh.ops.recalc_face_normals(tbm, faces=tbm.faces)
        idx = self.mat_index[mat]
        vmap = {}
        for v in tbm.verts:
            vmap[v] = self.bm.verts.new(v.co)
        for f in tbm.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
                nf.material_index = idx
                nf.smooth = smooth
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
# Reusable High-Detail Sub-Assemblies
# ---------------------------------------------------------------------------
def add_car_wheel(pb, loc, radius=0.33, width=0.20, rim_mat="cream", hub_mat="metal", spokes=6):
    """Sculpted tire torus + recessed rim + spokes + chrome hubcap."""
    cx, cy, cz = loc
    minor = min(width * 0.48, radius * 0.34)
    major = radius - minor
    # Torus in YZ plane -> rotate Y by 90 deg
    pb.torus(major, minor, maj_segs=24, min_segs=10, loc=loc, rot=(0, math.pi * 0.5, 0), mat="dark")
    # Inner sidewall / rim barrel
    pb.cyl(major * 0.96, major * 0.96, width * 0.72, segs=20, loc=loc, rot=(0, math.pi * 0.5, 0), mat=rim_mat)
    # Recessed dark brake backing
    pb.cyl(major * 0.76, major * 0.76, width * 0.78, segs=16, loc=loc, rot=(0, math.pi * 0.5, 0), mat="dark")
    # Spokes on outer face
    side_sign = 1.0 if cx >= 0 else -1.0
    ox = cx + side_sign * (width * 0.34)
    for i in range(spokes):
        a = 2.0 * math.pi * i / spokes
        p0 = (ox, cy, cz)
        p1 = (ox, cy + math.cos(a) * major * 0.86, cz + math.sin(a) * major * 0.86)
        pb.tube(p0, p1, 0.018, 0.014, segs=6, mat=rim_mat)
    # Chrome hubcap dome
    pb.sphere(major * 0.34, loc=(cx + side_sign * width * 0.36, cy, cz),
              scale=(0.45, 1.0, 1.0), mat=hub_mat, u=12, v=8)


def add_spoked_wheel(pb, loc, radius=0.32, tire_r=0.032, spokes=12, rim_mat="metal"):
    """True bicycle/scooter spoked wheel with torus tire, alloy rim, hub & wire spokes."""
    cx, cy, cz = loc
    major = radius - tire_r
    pb.torus(major, tire_r, maj_segs=26, min_segs=10, loc=loc, rot=(0, math.pi * 0.5, 0), mat="dark")
    pb.torus(major - tire_r * 0.85, tire_r * 0.42, maj_segs=24, min_segs=8, loc=loc, rot=(0, math.pi * 0.5, 0), mat=rim_mat)
    # Hub
    pb.cyl(0.032, 0.032, 0.095, segs=12, loc=loc, rot=(0, math.pi * 0.5, 0), mat="metal")
    for i in range(spokes):
        a = 2.0 * math.pi * i / spokes
        sx = 0.028 if (i % 2 == 0) else -0.028
        p0 = (cx + sx, cy, cz)
        p1 = (cx, cy + math.cos(a) * (major - tire_r * 0.85), cz + math.sin(a) * (major - tire_r * 0.85))
        pb.tube(p0, p1, 0.0055, 0.0055, segs=5, mat="metal")


def add_wood_wheel(pb, loc, radius=0.52, rim_w=0.08, spokes=10):
    """Wooden spoked cart wheel with iron tire band."""
    cx, cy, cz = loc
    # Iron outer band + wood felloe
    pb.torus(radius - 0.025, 0.028, maj_segs=26, min_segs=8, loc=loc, rot=(0, math.pi * 0.5, 0), mat="dark")
    pb.torus(radius - 0.055, 0.036, maj_segs=24, min_segs=8, loc=loc, rot=(0, math.pi * 0.5, 0), mat="wood")
    pb.cyl(0.085, 0.085, rim_w * 1.9, segs=14, loc=loc, rot=(0, math.pi * 0.5, 0), mat="wood")
    pb.cyl(0.045, 0.045, rim_w * 2.2, segs=12, loc=loc, rot=(0, math.pi * 0.5, 0), mat="dark")
    for i in range(spokes):
        a = 2.0 * math.pi * i / spokes
        p0 = (cx, cy, cz)
        p1 = (cx, cy + math.cos(a) * (radius - 0.06), cz + math.sin(a) * (radius - 0.06))
        pb.tube(p0, p1, 0.022, 0.017, segs=6, mat="wood")


def add_steering_wheel(pb, loc, tilt=0.45, radius=0.175):
    """Spoked vintage steering wheel with column & center horn button."""
    cx, cy, cz = loc
    pb.torus(radius, 0.020, maj_segs=22, min_segs=8, loc=loc, rot=(tilt, 0, 0), mat="dark")
    pb.cyl(0.042, 0.042, 0.032, segs=12, loc=loc, rot=(tilt, 0, 0), mat="metal")
    # 3 spokes
    rot_m = Euler((tilt, 0, 0), 'XYZ').to_matrix()
    for a in (math.radians(210), math.radians(330), math.radians(90)):
        tip = Vector(loc) + rot_m @ Vector((math.cos(a) * radius, math.sin(a) * radius, 0))
        pb.tube(loc, tip, 0.012, 0.010, segs=6, mat="metal")
    # Column going down-forward
    col_end = Vector(loc) + rot_m @ Vector((0, 0, -0.44))
    pb.tube(loc, col_end, 0.028, 0.032, segs=10, mat="dark")


def add_headlight(pb, loc, r=0.105, depth=0.11, mat_rim="metal"):
    """Rounded chrome headlight housing with glowing lens."""
    cx, cy, cz = loc
    pb.cyl(r * 1.06, r * 0.88, depth, segs=18, loc=(cx, cy - depth * 0.35, cz),
           rot=(math.pi * 0.5, 0, 0), mat=mat_rim)
    pb.sphere(r * 0.90, loc=(cx, cy + 0.015, cz), scale=(1.0, 0.45, 1.0), mat="glow", u=14, v=10)


def add_side_mirror(pb, base, tip, r=0.062):
    pb.tube(base, tip, 0.012, 0.010, segs=6, mat="metal")
    pb.sphere(r, loc=tip, scale=(1.0, 0.48, 0.82), mat="metal", u=12, v=8)
    pb.cyl(r * 0.80, r * 0.80, 0.012, segs=12, loc=(tip[0], tip[1] - 0.025, tip[2]),
           rot=(math.pi * 0.5, 0, 0), mat="glass")


def rounded_rect_ring(y, hw, z_bot, z_top, r_bot=0.10, r_top=0.14, crown=0.04):
    """Generates a 12-point smooth cross-section ring in the XZ plane at given Y."""
    rb = min(r_bot, hw * 0.45, (z_top - z_bot) * 0.4)
    rt = min(r_top, hw * 0.45, (z_top - z_bot) * 0.4)
    pts = [
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
    return pts


# ---------------------------------------------------------------------------
# 1. Vintage Ghibli Convertible Car ("car")
#    Seat cushion Y=-0.02, Z=0.56 | Open cockpit Y=[-0.8, +0.6] | Steering Y=0.50, Z=0.98
# ---------------------------------------------------------------------------
def build_car(mats):
    pb = PartBuilder("car", mats)
    # Sculpted lofted lower hull (nose -> hood -> cockpit waist -> tapered tail)
    hull_stations = [
        # (y, hw, z_bot, z_top, r_bot, r_top, crown)
        (-1.42, 0.56, 0.34, 0.72, 0.10, 0.14, 0.03),
        (-1.26, 0.72, 0.30, 0.84, 0.12, 0.16, 0.04),
        (-0.82, 0.77, 0.28, 0.86, 0.12, 0.14, 0.02),
        ( 0.58, 0.77, 0.28, 0.86, 0.12, 0.14, 0.02),
        ( 0.82, 0.76, 0.29, 0.90, 0.12, 0.16, 0.04),
        ( 1.24, 0.72, 0.30, 0.82, 0.12, 0.18, 0.05),
        ( 1.44, 0.54, 0.36, 0.66, 0.10, 0.14, 0.04),
    ]
    # Build front hood + rear trunk separately so cockpit stays genuinely open!
    rear_rings = [rounded_rect_ring(*s) for s in [
        (-1.44, 0.54, 0.34, 0.72, 0.10, 0.14, 0.03),
        (-1.28, 0.72, 0.30, 0.86, 0.12, 0.16, 0.05),
        (-0.88, 0.77, 0.28, 0.88, 0.12, 0.14, 0.04),
        (-0.74, 0.77, 0.28, 0.87, 0.12, 0.12, 0.02),
    ]]
    pb.loft(rear_rings, mat="body")

    front_rings = [rounded_rect_ring(*s) for s in [
        ( 0.56, 0.77, 0.28, 0.88, 0.12, 0.14, 0.04),
        ( 0.90, 0.76, 0.29, 0.86, 0.12, 0.18, 0.05),
        ( 1.26, 0.70, 0.31, 0.78, 0.12, 0.18, 0.05),
        ( 1.46, 0.52, 0.36, 0.64, 0.10, 0.14, 0.03),
    ]]
    pb.loft(front_rings, mat="body")

    # Sculpted cockpit floor pan & curved side doors (leaving cockpit wide open)
    pb.box((1.44, 1.44, 0.14), loc=(0, -0.10, 0.33), mat="dark", bevel=0.03)
    for sx in (-1, 1):
        # Curved door panel with cream beltline stripe
        pb.box((0.12, 1.38, 0.52), loc=(sx * 0.72, -0.09, 0.60), mat="body", bevel=0.035)
        pb.box((0.04, 2.52, 0.055), loc=(sx * 0.765, 0.00, 0.68), mat="cream", bevel=0.015)
        # Door handle
        pb.box((0.04, 0.14, 0.028), loc=(sx * 0.78, -0.32, 0.76), mat="metal", bevel=0.01)
        # Sculpted wheel arch fenders
        for wy in (-0.90, 0.90):
            pb.arch_fender((sx * 0.77, wy, 0.33), radius=0.36, width=0.22, thick=0.045, mat="body")
            add_car_wheel(pb, (sx * 0.77, wy, 0.33), radius=0.33, width=0.20, rim_mat="cream", spokes=6)

    # Cream two-tone hood center rib & radiator grille
    pb.box((0.10, 0.72, 0.04), loc=(0, 1.00, 0.90), mat="metal", bevel=0.015)
    pb.box((0.62, 0.08, 0.22), loc=(0, 1.45, 0.54), mat="dark", bevel=0.02)
    for gx in (-0.22, -0.11, 0.0, 0.11, 0.22):
        pb.box((0.026, 0.09, 0.19), loc=(gx, 1.46, 0.54), mat="metal", bevel=0.008)

    # Chrome bumpers with curved wrap-arounds & over-riders
    for by, sgn in ((1.52, 1), (-1.50, -1)):
        pb.box((1.38, 0.10, 0.09), loc=(0, by, 0.36), mat="metal", bevel=0.03)
        for ox in (-0.42, 0.42):
            pb.box((0.06, 0.12, 0.16), loc=(ox, by + sgn * 0.02, 0.38), mat="metal", bevel=0.02)

    # Headlights & tail lights
    for sx in (-1, 1):
        add_headlight(pb, (sx * 0.50, 1.42, 0.68), r=0.115)
        pb.cyl(0.065, 0.072, 0.06, segs=14, loc=(sx * 0.54, -1.42, 0.64),
               rot=(math.pi * 0.5, 0, 0), mat="coral")
        pb.cyl(0.048, 0.048, 0.07, segs=12, loc=(sx * 0.54, -1.43, 0.64),
               rot=(math.pi * 0.5, 0, 0), mat="glow")

    # Raked chrome-framed curved windshield + side mirrors
    ws_tilt = -0.34
    pb.box((1.36, 0.035, 0.42), loc=(0, 0.64, 1.09), rot=(ws_tilt, 0, 0), mat="glass", bevel=0.008)
    for sx in (-1, 1):
        pb.tube((sx * 0.69, 0.58, 0.88), (sx * 0.67, 0.72, 1.30), 0.024, 0.022, segs=8, mat="metal")
        add_side_mirror(pb, (sx * 0.73, 0.60, 0.92), (sx * 0.88, 0.56, 1.02), r=0.062)
    pb.tube((-0.67, 0.72, 1.30), (0.67, 0.72, 1.30), 0.022, 0.022, segs=8, mat="metal")

    # Dashboard + twin speedometer dials + steering wheel (Y=0.50, Z=0.98)
    pb.box((1.32, 0.24, 0.24), loc=(0, 0.58, 0.82), mat="cream", bevel=0.04)
    for dx in (-0.16, 0.16):
        pb.cyl(0.055, 0.055, 0.04, segs=14, loc=(dx, 0.46, 0.84), rot=(math.pi * 0.5, 0, 0), mat="metal")
    add_steering_wheel(pb, (0.0, 0.50, 0.98), tilt=0.45, radius=0.175)

    # Contoured tufted leather bench seat (Y=-0.02, Z=0.56)
    pb.box((1.24, 0.54, 0.16), loc=(0, -0.02, 0.50), mat="seat", bevel=0.055, segs=3)
    pb.box((1.24, 0.16, 0.46), loc=(0, -0.34, 0.74), rot=(-0.16, 0, 0), mat="seat", bevel=0.05, segs=3)
    # Folded convertible canvas soft-top behind seat
    pb.box((1.30, 0.26, 0.18), loc=(0, -0.66, 0.94), mat="cream", bevel=0.07, segs=3)
    # Rear mounted spare tire & chrome luggage rack
    add_car_wheel(pb, (0.0, -1.46, 0.66), radius=0.26, width=0.14, rim_mat="cream", spokes=5)
    pb.box((0.92, 0.42, 0.03), loc=(0, -1.08, 0.92), mat="metal", bevel=0.01)

    return pb.build_object()


# ---------------------------------------------------------------------------
# 2. Mini Pickup Truck ("truck")
#    Seat cushion Y=0.38, Z=0.60 | Open cab | Steering Y=0.82, Z=1.00
# ---------------------------------------------------------------------------
def build_truck(mats):
    pb = PartBuilder("truck", mats)
    # Chassis frame rails
    pb.box((1.42, 3.16, 0.16), loc=(0, -0.02, 0.36), mat="dark", bevel=0.03)

    # Sculpted rounded cab nose (front of open cab)
    nose_rings = [rounded_rect_ring(*s) for s in [
        (0.86, 0.80, 0.36, 0.98, 0.10, 0.14, 0.04),
        (1.24, 0.78, 0.36, 0.96, 0.12, 0.16, 0.04),
        (1.54, 0.72, 0.38, 0.88, 0.12, 0.16, 0.04),
        (1.66, 0.58, 0.42, 0.74, 0.10, 0.14, 0.03),
    ]]
    pb.loft(nose_rings, mat="body")

    # Open cab side doors & rear cab bulkhead
    for sx in (-1, 1):
        pb.box((0.12, 0.94, 0.56), loc=(sx * 0.74, 0.42, 0.66), mat="body", bevel=0.035)
        pb.box((0.04, 0.14, 0.03), loc=(sx * 0.81, 0.16, 0.82), mat="metal", bevel=0.01)
    pb.box((1.56, 0.12, 0.66), loc=(0, -0.06, 0.72), mat="body", bevel=0.03)

    # Windshield + vintage roof visor + side mirrors (open roof so Whalechan never clips)
    pb.box((1.46, 0.04, 0.44), loc=(0, 0.98, 1.18), rot=(-0.20, 0, 0), mat="glass", bevel=0.008)
    for sx in (-1, 1):
        pb.tube((sx * 0.74, 0.92, 0.96), (sx * 0.73, 1.02, 1.40), 0.028, 0.025, segs=8, mat="cream")
        add_side_mirror(pb, (sx * 0.77, 0.92, 1.06), (sx * 0.94, 0.90, 1.14), r=0.065)
    pb.box((1.52, 0.16, 0.055), loc=(0, 1.06, 1.42), rot=(0.14, 0, 0), mat="cream", bevel=0.02)

    # Wooden cargo bed with slatted side rails & hinged tailgate
    pb.box((1.56, 1.62, 0.14), loc=(0, -0.92, 0.48), mat="wood", bevel=0.02)
    for sx in (-1, 1):
        pb.box((0.08, 1.62, 0.46), loc=(sx * 0.76, -0.92, 0.74), mat="wood", bevel=0.02)
        pb.box((0.05, 1.64, 0.06), loc=(sx * 0.77, -0.92, 1.06), mat="wood", bevel=0.015)
        for py in (-1.66, -1.16, -0.66, -0.18):
            pb.box((0.06, 0.06, 0.62), loc=(sx * 0.77, py, 0.80), mat="dark", bevel=0.01)
    # Tailgate
    pb.box((1.56, 0.08, 0.46), loc=(0, -1.70, 0.74), mat="wood", bevel=0.02)
    # Cargo wooden crate & tied tarp bundle in bed for Ghibli storytelling
    pb.box((0.56, 0.52, 0.42), loc=(-0.32, -0.78, 0.76), mat="cream", bevel=0.03)
    pb.cyl(0.20, 0.20, 0.46, segs=14, loc=(0.34, -0.98, 0.76), mat="wood")

    # Wheels + curved wheel arches
    for sx in (-1, 1):
        for wy in (-1.04, 1.04):
            pb.arch_fender((sx * 0.80, wy, 0.36), radius=0.40, width=0.25, thick=0.045, mat="dark")
            add_car_wheel(pb, (sx * 0.80, wy, 0.36), radius=0.36, width=0.22, rim_mat="cream", spokes=6)

    # Grille, chrome bumper, headlights, tail lights
    pb.box((1.50, 0.11, 0.11), loc=(0, 1.70, 0.42), mat="metal", bevel=0.03)
    pb.box((1.46, 0.10, 0.10), loc=(0, -1.76, 0.42), mat="metal", bevel=0.03)
    pb.box((0.76, 0.08, 0.24), loc=(0, 1.65, 0.64), mat="dark", bevel=0.02)
    for gx in (-0.28, -0.14, 0.0, 0.14, 0.28):
        pb.box((0.03, 0.09, 0.21), loc=(gx, 1.66, 0.64), mat="metal", bevel=0.008)
    for sx in (-1, 1):
        add_headlight(pb, (sx * 0.56, 1.60, 0.74), r=0.11)
        pb.box((0.14, 0.06, 0.10), loc=(sx * 0.60, -1.75, 0.58), mat="coral", bevel=0.015)

    # Cab seat (Y=0.38, Z=0.60) & steering wheel (Y=0.82, Z=1.00)
    pb.box((1.28, 0.52, 0.16), loc=(0, 0.38, 0.54), mat="seat", bevel=0.05)
    pb.box((1.28, 0.16, 0.46), loc=(0, 0.08, 0.78), rot=(-0.14, 0, 0), mat="seat", bevel=0.045)
    pb.box((1.36, 0.24, 0.26), loc=(0, 0.90, 0.84), mat="cream", bevel=0.04)
    add_steering_wheel(pb, (0.0, 0.82, 1.00), tilt=0.45, radius=0.18)

    return pb.build_object()


# ---------------------------------------------------------------------------
# 3. Ghibli Retro Sightseeing Bus ("bus")
#    Driver seat Y=0.0, Z=1.12 | Open cockpit above Z=1.45 at Y>0.4 | Steering Y=0.52, Z=1.54
# ---------------------------------------------------------------------------
def build_bus(mats):
    pb = PartBuilder("bus", mats)
    # Sculpted rounded lower bus body (color-tinted)
    lower_rings = [rounded_rect_ring(*s) for s in [
        (-2.22, 0.94, 0.44, 1.42, 0.14, 0.14, 0.02),
        (-1.92, 1.04, 0.42, 1.44, 0.14, 0.12, 0.02),
        ( 1.92, 1.04, 0.42, 1.44, 0.14, 0.12, 0.02),
        ( 2.24, 0.94, 0.44, 1.42, 0.14, 0.14, 0.02),
    ]]
    pb.loft(lower_rings, mat="body")

    # Cream beltline stripe wrapping around the bus
    pb.box((2.12, 4.24, 0.14), loc=(0, 0, 1.38), mat="cream", bevel=0.03)

    # Rear enclosed cabin (Y=-2.16..-0.30) with panoramic cream pillars & arched roof
    # Open-top driver sightseeing deck at Y=-0.30..+2.10 so Whalechan sits proudly with zero clipping!
    pb.box((1.96, 1.78, 0.78), loc=(0, -1.24, 1.84), mat="glass", bevel=0.04)
    # Arched cream roof over rear cabin
    roof_rings = [rounded_rect_ring(*s) for s in [
        (-2.20, 0.96, 2.20, 2.48, 0.06, 0.22, 0.08),
        (-1.90, 1.02, 2.20, 2.52, 0.06, 0.22, 0.09),
        (-0.42, 1.02, 2.20, 2.52, 0.06, 0.22, 0.09),
        (-0.26, 0.98, 2.20, 2.46, 0.06, 0.20, 0.06),
    ]]
    pb.loft(roof_rings, mat="cream")

    # Window pillars on rear cabin + front panoramic windshield
    for sx in (-1, 1):
        for py in (-2.08, -1.52, -0.96, -0.36):
            pb.box((0.08, 0.10, 0.80), loc=(sx * 1.00, py, 1.84), mat="cream", bevel=0.02)
        # Side safety railing around open driver deck
        pb.tube((sx * 0.98, -0.34, 1.78), (sx * 0.98, 1.96, 1.78), 0.024, 0.024, segs=8, mat="metal")
        for ry in (0.10, 0.70, 1.30, 1.94):
            pb.tube((sx * 0.98, ry, 1.44), (sx * 0.98, ry, 1.78), 0.022, 0.022, segs=8, mat="metal")

    # Front raked sightseeing windshield & destination board
    pb.box((1.90, 0.05, 0.56), loc=(0, 2.08, 1.74), rot=(-0.18, 0, 0), mat="glass", bevel=0.01)
    for sx in (-1, 1):
        pb.tube((sx * 0.96, 2.04, 1.44), (sx * 0.95, 2.12, 2.02), 0.032, 0.028, segs=8, mat="cream")
        add_side_mirror(pb, (sx * 1.02, 1.92, 1.56), (sx * 1.22, 1.98, 1.66), r=0.075)
    pb.box((1.96, 0.14, 0.12), loc=(0, 2.12, 2.04), mat="cream", bevel=0.03)
    pb.box((1.04, 0.06, 0.16), loc=(0, 2.17, 2.04), mat="glow", bevel=0.02)

    # Rear roof luggage rack & ladder
    pb.box((1.62, 1.40, 0.04), loc=(0, -1.24, 2.60), mat="metal", bevel=0.01)
    for sx in (-0.78, 0.78):
        pb.tube((sx, -1.90, 2.66), (sx, -0.56, 2.66), 0.02, 0.02, segs=8, mat="metal")
    # Cute vintage suitcases on roof rack
    pb.box((0.54, 0.38, 0.24), loc=(-0.26, -1.36, 2.74), mat="seat", bevel=0.04)
    pb.box((0.46, 0.34, 0.20), loc=(0.30, -1.10, 2.72), mat="coral", bevel=0.035)

    # Wheels + wheel arches
    for sx in (-1, 1):
        for wy in (-1.36, 1.36):
            pb.arch_fender((sx * 1.02, wy, 0.42), radius=0.46, width=0.28, thick=0.05, mat="dark")
            add_car_wheel(pb, (sx * 1.02, wy, 0.42), radius=0.42, width=0.24, rim_mat="cream", spokes=6)

    # Chrome bumpers, headlights, tail lights, front V emblem
    pb.box((2.04, 0.14, 0.14), loc=(0, 2.28, 0.50), mat="metal", bevel=0.035)
    pb.box((2.04, 0.14, 0.14), loc=(0, -2.26, 0.50), mat="metal", bevel=0.035)
    pb.sphere(0.14, loc=(0, 2.24, 1.02), scale=(1.0, 0.35, 1.0), mat="metal", u=14, v=10)
    for sx in (-1, 1):
        add_headlight(pb, (sx * 0.68, 2.20, 0.86), r=0.14)
        pb.box((0.18, 0.08, 0.14), loc=(sx * 0.76, -2.24, 0.86), mat="coral", bevel=0.02)

    # Driver seat (Y=0.0, Z=1.12) & steering wheel (Y=0.52, Z=1.54)
    pb.box((0.68, 0.52, 0.14), loc=(0, 0.0, 1.06), mat="seat", bevel=0.045)
    pb.box((0.68, 0.14, 0.44), loc=(0, -0.26, 1.30), rot=(-0.14, 0, 0), mat="seat", bevel=0.04)
    pb.box((1.72, 0.28, 0.24), loc=(0, 0.70, 1.40), mat="cream", bevel=0.04)
    add_steering_wheel(pb, (0.0, 0.52, 1.54), tilt=0.42, radius=0.20)

    return pb.build_object()


# ---------------------------------------------------------------------------
# 4. Ghibli Step-Through Vintage Bicycle ("bicycle")
#    Low U-frame Z<=0.34 in center | Saddle Y=-0.08, Z=0.62 | Handlebars Y=0.32, Z=0.88
# ---------------------------------------------------------------------------
def build_bicycle(mats, cargo=False):
    name = "cargobike" if cargo else "bicycle"
    pb = PartBuilder(name, mats)

    fy = 0.66 if cargo else 0.54
    ry = -0.54
    wr = 0.31

    # Spoked wheels + curved mudguards
    add_spoked_wheel(pb, (0, ry, wr), radius=wr, tire_r=0.032, spokes=12)
    add_spoked_wheel(pb, (0, fy, wr), radius=wr, tire_r=0.032, spokes=12)
    pb.arch_fender((0, ry, wr), radius=wr + 0.025, width=0.085, thick=0.018, a0=0.4, a1=math.pi + 0.2, mat="body")
    pb.arch_fender((0, fy, wr), radius=wr + 0.025, width=0.085, thick=0.018, a0=-0.1, a1=math.pi - 0.5, mat="body")

    # Graceful swept step-through tubular frame (keeps center Z <= 0.34!)
    head_top = (0, fy - 0.16, 0.72)
    head_bot = (0, fy - 0.12, 0.50)
    bb = (0, -0.06, 0.26)
    seat_lug = (0, -0.10, 0.52)

    # Head tube
    pb.tube(head_bot, head_top, 0.026, 0.026, segs=10, mat="body")
    # Curved step-through down tube (dips to Z=0.26 at center)
    pb.pipe_path([
        head_bot,
        (0, 0.28, 0.34),
        (0, 0.10, 0.26),
        bb,
    ], radius=0.022, segs=10, mat="body")
    # Seat tube & chrome seat post
    pb.tube(bb, seat_lug, 0.022, 0.022, segs=10, mat="body")
    pb.tube(seat_lug, (0, -0.09, 0.61), 0.015, 0.015, segs=8, mat="metal")

    # Twin rear stays & front fork blades
    for sx in (-0.055, 0.055):
        pb.tube((sx, ry, wr), (sx * 0.45, bb[1], bb[2]), 0.014, 0.016, segs=8, mat="body")
        pb.tube((sx, ry, wr), (sx * 0.40, seat_lug[1], seat_lug[2] - 0.02), 0.013, 0.015, segs=8, mat="body")
        pb.tube((sx, fy, wr), (sx * 0.40, head_bot[1], head_bot[2]), 0.015, 0.018, segs=8, mat="body")

    # Chain guard, crankset & pedals
    pb.box((0.04, 0.52, 0.14), loc=(0.065, -0.30, 0.29), mat="cream", bevel=0.045, segs=2)
    pb.cyl(0.085, 0.085, 0.025, segs=16, loc=(0.075, bb[1], bb[2]), rot=(0, math.pi * 0.5, 0), mat="metal")
    for sx, pz in ((-0.12, -0.09), (0.12, 0.09)):
        pb.tube((sx * 0.5, bb[1], bb[2]), (sx, bb[1], bb[2] + pz), 0.010, 0.010, segs=6, mat="metal")
        pb.box((0.09, 0.06, 0.022), loc=(sx * 1.15, bb[1], bb[2] + pz), mat="dark", bevel=0.006)

    # Sprung sculpted leather saddle (Y=-0.08, Z=0.62)
    pb.sphere(0.11, loc=(0, -0.10, 0.635), scale=(0.88, 1.32, 0.38), mat="seat", u=14, v=10)
    for sx in (-0.045, 0.045):
        pb.cyl(0.018, 0.018, 0.05, segs=8, loc=(sx, -0.16, 0.59), mat="metal")

    # Swept chrome cruiser handlebars (Y=0.32, Z=0.88) + leather grips + brass bell + vintage dynamo lamp
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
    # Brass bell & front lamp
    pb.sphere(0.028, loc=(0.14, 0.40, 0.91), scale=(1.0, 1.0, 0.7), mat="glow", u=10, v=8)
    add_headlight(pb, (0, fy - 0.04, 0.66), r=0.055, depth=0.07)

    # Rear luggage rack
    pb.box((0.20, 0.42, 0.025), loc=(0, -0.56, 0.68), mat="metal", bevel=0.008)
    for sx in (-0.08, 0.08):
        pb.tube((sx, ry, wr + 0.04), (sx, -0.66, 0.68), 0.010, 0.010, segs=6, mat="metal")

    if cargo:
        # Large wooden cargo crate with iron corner straps on front carrier
        pb.box((0.52, 0.46, 0.34), loc=(0, fy + 0.06, 0.78), mat="wood", bevel=0.025)
        pb.box((0.46, 0.40, 0.18), loc=(0, fy + 0.06, 0.98), mat="cream", bevel=0.05)  # bread/parcel bundle
        for sx in (-0.18, 0.18):
            pb.tube((sx, fy, wr + 0.04), (sx, fy + 0.06, 0.62), 0.014, 0.014, segs=6, mat="dark")
    else:
        # Woven wicker front basket with wooden rim & baguette/flowers detail
        basket_rings = [rounded_rect_ring(*s) for s in [
            (fy - 0.10, 0.15, 0.64, 0.82, 0.04, 0.04, 0.0),
            (fy + 0.12, 0.19, 0.62, 0.84, 0.05, 0.05, 0.0),
        ]]
        pb.loft(basket_rings, mat="wood")
        pb.box((0.39, 0.24, 0.03), loc=(0, fy + 0.01, 0.84), mat="cream", bevel=0.012)

    return pb.build_object()


# ---------------------------------------------------------------------------
# 5. Vespa-Inspired Ghibli Scooter ("scooter")
#    Low floorboard Z=0.28 | Seat Y=-0.18, Z=0.62 | Handlebars Y=0.38, Z=0.90
# ---------------------------------------------------------------------------
def build_scooter(mats):
    pb = PartBuilder("scooter", mats)

    # Fat retro scooter wheels
    add_car_wheel(pb, (0, -0.50, 0.24), radius=0.24, width=0.14, rim_mat="cream", spokes=5)
    add_car_wheel(pb, (0,  0.54, 0.24), radius=0.24, width=0.14, rim_mat="cream", spokes=5)

    # Curved front mudguard
    pb.arch_fender((0, 0.54, 0.24), radius=0.26, width=0.18, thick=0.032, a0=-0.1, a1=math.pi * 0.72, mat="body")

    # Sculpted Vespa rear teardrop engine cowling
    rear_rings = [rounded_rect_ring(*s) for s in [
        (-0.82, 0.16, 0.34, 0.54, 0.06, 0.08, 0.02),
        (-0.56, 0.28, 0.24, 0.58, 0.10, 0.12, 0.03),
        (-0.20, 0.26, 0.22, 0.56, 0.08, 0.10, 0.02),
        (-0.04, 0.20, 0.22, 0.36, 0.06, 0.06, 0.01),
    ]]
    pb.loft(rear_rings, mat="body")

    # Low flat floorboard with rubber grip strips (Z=0.28)
    pb.box((0.40, 0.54, 0.07), loc=(0, 0.16, 0.24), mat="cream", bevel=0.025)
    for gx in (-0.12, 0.0, 0.12):
        pb.box((0.035, 0.44, 0.018), loc=(gx, 0.16, 0.28), mat="dark", bevel=0.006)

    # Curved Vespa front legshield apron
    apron_rings = [rounded_rect_ring(*s) for s in [
        (0.36, 0.24, 0.26, 0.80, 0.06, 0.10, 0.02),
        (0.46, 0.26, 0.28, 0.84, 0.08, 0.12, 0.03),
        (0.54, 0.16, 0.34, 0.78, 0.06, 0.08, 0.02),
    ]]
    pb.loft(apron_rings, mat="body")
    # Chrome nose tie & horn grille
    pb.box((0.09, 0.05, 0.34), loc=(0, 0.54, 0.58), mat="cream", bevel=0.02)

    # Handlebar nacelle, round chrome headlight, grips & twin mirrors (Y=0.38, Z=0.90)
    pb.sphere(0.11, loc=(0, 0.46, 0.90), scale=(1.2, 0.9, 0.75), mat="body", u=14, v=10)
    add_headlight(pb, (0, 0.55, 0.90), r=0.075, depth=0.08)
    pb.pipe_path([
        (-0.28, 0.37, 0.90),
        (-0.14, 0.44, 0.90),
        ( 0.14, 0.44, 0.90),
        ( 0.28, 0.37, 0.90),
    ], radius=0.017, segs=8, mat="metal")
    for sx in (-1, 1):
        pb.tube((sx * 0.20, 0.41, 0.90), (sx * 0.29, 0.36, 0.90), 0.024, 0.024, segs=8, mat="dark")
        add_side_mirror(pb, (sx * 0.16, 0.44, 0.94), (sx * 0.26, 0.44, 1.08), r=0.052)

    # Stepped contoured leather saddle (Y=-0.18, Z=0.62) + rear chrome rack & tail light
    pb.box((0.32, 0.54, 0.12), loc=(0, -0.24, 0.60), mat="seat", bevel=0.05, segs=3)
    pb.box((0.28, 0.22, 0.03), loc=(0, -0.72, 0.58), mat="metal", bevel=0.01)
    pb.sphere(0.05, loc=(0, -0.82, 0.48), scale=(0.8, 0.6, 1.0), mat="coral", u=10, v=8)
    # Chrome exhaust muffler
    pb.cyl(0.045, 0.038, 0.38, segs=12, loc=(0.24, -0.52, 0.24), rot=(math.pi * 0.5, 0, 0), mat="metal")

    return pb.build_object()


# ---------------------------------------------------------------------------
# 6. Pastoral Wooden Ox Cart ("oxcart")
#    Front driver bench Y=0.0, Z=0.66
# ---------------------------------------------------------------------------
def build_oxcart(mats):
    pb = PartBuilder("oxcart", mats)
    # Large spoked wooden wheels
    for sx in (-1, 1):
        add_wood_wheel(pb, (sx * 0.92, -0.26, 0.52), radius=0.52, rim_w=0.08, spokes=10)
    # Heavy axle beam
    pb.cyl(0.055, 0.055, 1.96, segs=12, loc=(0, -0.26, 0.52), rot=(0, math.pi * 0.5, 0), mat="dark")

    # Planked wooden flatbed
    pb.box((1.58, 2.24, 0.10), loc=(0, -0.34, 0.58), mat="wood", bevel=0.02)
    # Slatted flared side rails with iron brackets
    for sx in (-1, 1):
        for pz in (0.76, 0.96, 1.14):
            pb.box((0.06, 2.18, 0.11), loc=(sx * 0.78, -0.34, pz), mat="wood", bevel=0.015)
        for py in (-1.36, -0.78, -0.20, 0.38, 0.72):
            pb.box((0.07, 0.07, 0.64), loc=(sx * 0.78, py, 0.88), mat="dark", bevel=0.01)
    # Rear tailgate
    pb.box((1.58, 0.07, 0.54), loc=(0, -1.44, 0.86), mat="wood", bevel=0.015)

    # Driver bench (Y=0.0, Z=0.66) with woven cloth cushion
    pb.box((1.44, 0.42, 0.10), loc=(0, 0.0, 0.64), mat="wood", bevel=0.02)
    pb.box((1.34, 0.36, 0.07), loc=(0, 0.0, 0.70), mat="seat", bevel=0.03)

    # Curved draft shafts & front yoke crossbar
    for sx in (-0.42, 0.42):
        pb.pipe_path([
            (sx, 0.72, 0.58),
            (sx * 0.94, 1.36, 0.64),
            (sx * 0.86, 2.02, 0.74),
        ], radius=0.042, segs=8, mat="wood")
    pb.cyl(0.048, 0.048, 1.06, segs=10, loc=(0, 1.94, 0.74), rot=(0, math.pi * 0.5, 0), mat="wood")

    # Golden hay bale & wooden barrel in back
    pb.box((0.86, 0.68, 0.46), loc=(-0.18, -0.88, 0.86), mat="cream", bevel=0.08, segs=2)
    pb.cyl(0.24, 0.22, 0.54, segs=14, loc=(0.42, -0.92, 0.90), mat="wood")

    return pb.build_object()


# ---------------------------------------------------------------------------
# 7. Wheelbarrow ("veh_wheelbarrow") & Handcart ("prop_handcart")
#    Rear handles near Y=-0.72, Z=0.45..0.95
# ---------------------------------------------------------------------------
def build_wheelbarrow(mats):
    pb = PartBuilder("veh_wheelbarrow", mats)
    add_spoked_wheel(pb, (0, 0.58, 0.21), radius=0.21, tire_r=0.038, spokes=8)

    # Tapered sculpted curved hopper basin with rolled lip
    basin_rings = [rounded_rect_ring(*s) for s in [
        (-0.34, 0.20, 0.36, 0.64, 0.05, 0.06, 0.0),
        ( 0.04, 0.30, 0.34, 0.68, 0.06, 0.06, 0.0),
        ( 0.44, 0.26, 0.42, 0.72, 0.06, 0.06, 0.0),
        ( 0.62, 0.20, 0.56, 0.72, 0.04, 0.04, 0.0),
    ]]
    pb.loft(basin_rings, mat="body")
    # Hollow rolled rim lip around the open basin
    pb.pipe_path([
        (-0.20, -0.34, 0.65),
        (-0.30,  0.04, 0.69),
        (-0.26,  0.44, 0.73),
        (-0.20,  0.62, 0.73),
        ( 0.20,  0.62, 0.73),
        ( 0.26,  0.44, 0.73),
        ( 0.30,  0.04, 0.69),
        ( 0.20, -0.34, 0.65),
    ], radius=0.018, segs=8, mat="metal", closed=True)

    # Tubular steel frame, support legs & turned wooden handle grips at Y=-0.72
    for sx in (-1, 1):
        pb.pipe_path([
            (sx * 0.06, 0.58, 0.21),
            (sx * 0.18, 0.24, 0.32),
            (sx * 0.22, -0.34, 0.42),
            (sx * 0.26, -0.78, 0.56),
        ], radius=0.022, segs=8, mat="metal")
        # Turned wood grip
        pb.tube((sx * 0.24, -0.58, 0.50), (sx * 0.27, -0.82, 0.57), 0.028, 0.026, segs=10, mat="wood")
        # Curved support leg
        pb.pipe_path([
            (sx * 0.21, -0.18, 0.38),
            (sx * 0.22, -0.26, 0.04),
            (sx * 0.21, -0.36, 0.04),
            (sx * 0.22, -0.34, 0.40),
        ], radius=0.016, segs=8, mat="dark")

    return pb.build_object()


def build_handcart(mats):
    pb = PartBuilder("prop_handcart", mats)
    for sx in (-1, 1):
        add_wood_wheel(pb, (sx * 0.54, 0.08, 0.34), radius=0.34, rim_w=0.055, spokes=8)
    pb.cyl(0.032, 0.032, 1.16, segs=10, loc=(0, 0.08, 0.34), rot=(0, math.pi * 0.5, 0), mat="dark")

    # Slatted wooden box bed
    pb.box((0.92, 1.12, 0.08), loc=(0, 0.10, 0.42), mat="wood", bevel=0.015)
    for sx in (-1, 1):
        pb.box((0.06, 1.12, 0.32), loc=(sx * 0.44, 0.10, 0.60), mat="wood", bevel=0.015)
    for sy in (-0.44, 0.64):
        pb.box((0.92, 0.06, 0.32), loc=(0, sy, 0.60), mat="wood", bevel=0.015)
    # Cargo sack & crate
    pb.sphere(0.24, loc=(-0.14, 0.16, 0.64), scale=(1.1, 1.3, 0.72), mat="cream", u=12, v=8)
    pb.box((0.36, 0.36, 0.28), loc=(0.20, -0.06, 0.60), mat="coral", bevel=0.025)

    # Rear push handles near Y=-0.72
    for sx in (-0.34, 0.34):
        pb.pipe_path([
            (sx, -0.44, 0.56),
            (sx, -0.74, 0.78),
            (sx, -0.82, 0.80),
        ], radius=0.024, segs=8, mat="wood")
    pb.tube((-0.34, -0.78, 0.79), (0.34, -0.78, 0.79), 0.024, 0.024, segs=8, mat="wood")
    # Front support stand
    for sx in (-0.34, 0.34):
        pb.tube((sx, 0.48, 0.42), (sx, 0.52, 0.04), 0.020, 0.018, segs=8, mat="dark")

    return pb.build_object()


# ---------------------------------------------------------------------------
# 8. Sculpted Boats ("rowboat", "kayak", "canoe")
# ---------------------------------------------------------------------------
def build_boat(name, mats, length=3.2, beam=1.18, depth=0.46, hull_mat="wood", trim_mat="cream", oars=True):
    pb = PartBuilder(name, mats)
    hl = length * 0.5
    hb = beam * 0.5

    # Lofted hollow curved boat hull (outer & inner skin in one clean ring loop)
    stations = [
        (-1.00, 0.04, 0.22, depth + 0.10),
        (-0.82, 0.46, 0.06, depth + 0.04),
        (-0.45, 0.90, 0.00, depth),
        ( 0.00, 1.00, 0.00, depth - 0.02),
        ( 0.45, 0.90, 0.00, depth),
        ( 0.82, 0.46, 0.06, depth + 0.04),
        ( 1.00, 0.04, 0.22, depth + 0.10),
    ]
    outer_rings = []
    inner_rings = []
    wall = 0.045
    for frac, wf, z0, z1 in stations:
        y = frac * hl
        w = max(0.03, wf * hb)
        # U-shaped cross-section (9 points: port gunwale -> bilge -> keel -> bilge -> stbd gunwale)
        oring = [
            (-w,        y, z1),
            (-w * 0.92, y, z0 + (z1 - z0) * 0.42),
            (-w * 0.58, y, z0 + (z1 - z0) * 0.10),
            ( 0.0,      y, z0),
            ( w * 0.58, y, z0 + (z1 - z0) * 0.10),
            ( w * 0.92, y, z0 + (z1 - z0) * 0.42),
            ( w,        y, z1),
        ]
        outer_rings.append(oring)
        wi = max(0.015, w - wall)
        zi0 = z0 + wall
        iring = [
            ( wi,        y, z1),
            ( wi * 0.90, y, zi0 + (z1 - zi0) * 0.42),
            ( wi * 0.56, y, zi0 + (z1 - zi0) * 0.10),
            ( 0.0,       y, zi0),
            (-wi * 0.56, y, zi0 + (z1 - zi0) * 0.10),
            (-wi * 0.90, y, zi0 + (z1 - zi0) * 0.42),
            (-wi,        y, z1),
        ]
        inner_rings.append(iring)

    # Combine outer + inner into closed wall rings
    closed_rings = [o + i for o, i in zip(outer_rings, inner_rings)]
    pb.loft(closed_rings, mat=hull_mat, cap_start=True, cap_end=True)

    # Gunwale trim rails along port & starboard
    for sx in (-1, 1):
        pts = [(sx * max(0.03, wf * hb), frac * hl, z1 + 0.012) for frac, wf, z0, z1 in stations]
        pb.pipe_path(pts, radius=0.026, segs=8, mat=trim_mat)

    # Interior wooden thwarts (benches) & floor duckboard
    pb.box((beam * 0.52, length * 0.46, 0.03), loc=(0, 0, 0.08), mat="wood", bevel=0.01)
    pb.box((beam * 0.84, 0.28, 0.045), loc=(0, 0.0, depth * 0.64), mat="wood", bevel=0.015)
    if length > 2.8:
        pb.box((beam * 0.62, 0.24, 0.045), loc=(0, -hl * 0.48, depth * 0.68), mat="wood", bevel=0.015)
        pb.box((beam * 0.58, 0.24, 0.045), loc=(0,  hl * 0.48, depth * 0.68), mat="wood", bevel=0.015)

    # Brass oarlocks & sculpted wooden oars/paddle
    if oars:
        for sx in (-1, 1):
            pb.cyl(0.016, 0.016, 0.07, segs=8, loc=(sx * hb * 0.96, 0.14, depth + 0.03), mat="metal")
            # Oar resting neatly along gunwale
            pb.tube((sx * hb * 0.66, -0.62, depth * 0.72), (sx * hb * 0.72, 0.64, depth * 0.74), 0.018, 0.016, segs=8, mat="cream")
            pb.box((0.022, 0.34, 0.10), loc=(sx * hb * 0.73, 0.76, depth * 0.74), mat="coral", bevel=0.012)
    else:
        # Double-bladed kayak paddle resting inside
        pb.tube((0.0, -0.82, depth * 0.78), (0.0, 0.82, depth * 0.78), 0.016, 0.016, segs=8, mat="cream")
        for sy in (-0.96, 0.96):
            pb.box((0.12, 0.30, 0.02), loc=(0.0, sy, depth * 0.78), mat="coral", bevel=0.01)

    return pb.build_object()


# ---------------------------------------------------------------------------
# 9. Sculpted Ghibli 3D Swallow / Sky-Whale Kite ("kite")
# ---------------------------------------------------------------------------
def build_kite(mats):
    pb = PartBuilder("kite", mats)
    # Cambered 3D swallow-wing diamond kite (local +Y = forward/up in flight, Z = thickness/camber)
    # Build curved arched fabric canopy using lofted spanwise ribs (camber arches cleanly!)
    span_stations = [
        # (x, y_front, y_back, z_camber)
        (-0.88,  0.10, -0.18, -0.11),
        (-0.62,  0.34, -0.26, -0.05),
        (-0.32,  0.54, -0.44,  0.02),
        ( 0.00,  0.68, -0.64,  0.06),
        ( 0.32,  0.54, -0.44,  0.02),
        ( 0.62,  0.34, -0.26, -0.05),
        ( 0.88,  0.10, -0.18, -0.11),
    ]
    # 2-sided thin airfoil cross-section along each X station
    sail_rings = []
    for x, yf, yb, zc in span_stations:
        ym = (yf + yb) * 0.5
        t = 0.016
        ring = [
            (x, yf, zc),
            (x, ym, zc + 0.025 + t),
            (x, yb, zc),
            (x, ym, zc + 0.025 - t),
        ]
        sail_rings.append(ring)
    pb.loft(sail_rings, mat="cream", cap_start=True, cap_end=True)

    # Painted Ghibli Sky-Whale / Swallow chevron bands cleanly raised above top cambered surface
    band_rings = []
    for x, yf, yb, zc in span_stations[1:-1]:
        y1 = yb + (yf - yb) * 0.68
        y2 = yb + (yf - yb) * 0.36
        ring = [
            (x, y1, zc + 0.049),
            (x, y2, zc + 0.049),
            (x, y2, zc + 0.037),
            (x, y1, zc + 0.037),
        ]
        band_rings.append(ring)
    pb.loft(band_rings, mat="body")
    # Secondary accent chevron stripe in coral near trailing edge
    band2_rings = []
    for x, yf, yb, zc in span_stations[1:-1]:
        y1 = yb + (yf - yb) * 0.30
        y2 = yb + (yf - yb) * 0.16
        ring = [
            (x, y1, zc + 0.044),
            (x, y2, zc + 0.044),
            (x, y2, zc + 0.032),
            (x, y1, zc + 0.032),
        ]
        band2_rings.append(ring)
    pb.loft(band2_rings, mat="coral")

    # Coral swallow-tail fins extending from rear
    for sx in (-1, 1):
        tail_rings = [
            [(sx * 0.04, -0.48, 0.04), (sx * 0.24, -0.36, 0.01), (sx * 0.24, -0.36, -0.01), (sx * 0.04, -0.48, 0.02)],
            [(sx * 0.16, -0.78, -0.02), (sx * 0.34, -0.66, -0.04), (sx * 0.34, -0.66, -0.06), (sx * 0.16, -0.78, -0.04)],
            [(sx * 0.26, -0.96, -0.06), (sx * 0.34, -0.92, -0.07), (sx * 0.34, -0.92, -0.08), (sx * 0.26, -0.96, -0.07)],
        ]
        pb.loft(tail_rings, mat="coral")

    # Curved arched bamboo spine & cross-spar with golden lashed center joint
    pb.pipe_path([
        (0.0,  0.70, 0.04),
        (0.0,  0.10, 0.06),
        (0.0, -0.66, 0.02),
    ], radius=0.014, segs=8, mat="wood")
    pb.pipe_path([
        (-0.90,  0.06, -0.12),
        (-0.46,  0.22, -0.01),
        ( 0.00,  0.28,  0.06),
        ( 0.46,  0.22, -0.01),
        ( 0.90,  0.06, -0.12),
    ], radius=0.013, segs=8, mat="wood")
    # Center golden emblem medallion
    pb.sphere(0.075, loc=(0, 0.24, 0.07), scale=(1.0, 1.0, 0.35), mat="glow", u=14, v=8)

    # Flowing S-curve central streamer tail with colorful ribbon bows
    tail_pts = []
    for i in range(12):
        t = i / 11.0
        ty = -0.64 - t * 1.48
        tx = math.sin(t * math.pi * 2.2) * (0.08 + t * 0.10)
        tz = -t * 0.18 + math.cos(t * math.pi * 2.0) * 0.03
        tail_pts.append((tx, ty, tz))
    pb.pipe_path(tail_pts, radius=0.010, segs=6, mat="cream")
    for idx, bow_mat in ((2, "coral"), (5, "body"), (8, "glow"), (10, "coral")):
        bx, by, bz = tail_pts[idx]
        pb.box((0.16, 0.06, 0.018), loc=(bx, by, bz), rot=(0, 0, 0.25 if idx % 2 == 0 else -0.25), mat=bow_mat, bevel=0.006)

    # Wingtip tassel streamers
    for sx in (-1, 1):
        pb.pipe_path([
            (sx * 0.88, -0.12, -0.11),
            (sx * 0.92, -0.44, -0.16),
            (sx * 0.86, -0.78, -0.22),
        ], radius=0.009, segs=6, mat="coral")

    return pb.build_object()


# ---------------------------------------------------------------------------
# 10. High-Craft Ghibli High-Speed Rail ("HSR_Head", "HSR_Mid", "HSR_Tail" + Doors)
#     Walkable floor Z=0.52 | Door opening Y=[-1.05..+1.05] on +X and -X sides
#     Interior seats along Y with central aisle so Whalechan walks in & sits cleanly!
# ---------------------------------------------------------------------------
def add_hsr_bogie(pb, cy):
    """Detailed Shinkansen bogie with frame, coil springs, brake discs & 4 flanged steel wheels."""
    pb.box((1.94, 2.36, 0.22), loc=(0, cy, 0.38), mat="dark", bevel=0.04)
    for sx in (-1, 1):
        # Side beam & secondary air-spring bolsters
        pb.box((0.18, 2.18, 0.24), loc=(sx * 0.96, cy, 0.42), mat="dark", bevel=0.04)
        for sy in (-0.34, 0.34):
            pb.cyl(0.11, 0.11, 0.20, segs=12, loc=(sx * 0.96, cy + sy, 0.56), mat="teal")
        for wy in (-0.82, 0.82):
            # Flanged steel wheel
            pb.cyl(0.38, 0.38, 0.13, segs=20, loc=(sx * 0.80, cy + wy, 0.38), rot=(0, math.pi * 0.5, 0), mat="dark")
            pb.cyl(0.42, 0.42, 0.03, segs=20, loc=(sx * 0.72, cy + wy, 0.38), rot=(0, math.pi * 0.5, 0), mat="gold")
            pb.cyl(0.16, 0.16, 0.16, segs=12, loc=(sx * 0.80, cy + wy, 0.38), rot=(0, math.pi * 0.5, 0), mat="gold")
    for wy in (-0.82, 0.82):
        pb.cyl(0.06, 0.06, 1.66, segs=10, loc=(0, cy + wy, 0.38), rot=(0, math.pi * 0.5, 0), mat="dark")


def add_hsr_seat_pair(pb, sx, cy, face_dir=1.0):
    """Contoured Ghibli express passenger seat with headrest, walnut armrests & fold-down tray."""
    cx = sx * 0.86
    # Pedestal
    pb.box((0.52, 0.36, 0.28), loc=(cx, cy, 0.66), mat="dark", bevel=0.03)
    # Contoured cushion
    pb.box((0.76, 0.54, 0.14), loc=(cx, cy, 0.86), mat="seat", bevel=0.05, segs=3)
    # Reclined ergonomic backrest + cream headrest pillow
    by = cy - face_dir * 0.24
    pb.box((0.76, 0.14, 0.66), loc=(cx, by, 1.24), rot=(face_dir * -0.14, 0, 0), mat="seat", bevel=0.05, segs=3)
    pb.box((0.56, 0.08, 0.20), loc=(cx, by + face_dir * 0.06, 1.48), rot=(face_dir * -0.14, 0, 0), mat="cream", bevel=0.03)
    # Walnut wood armrests
    for ax in (-0.38, 0.38):
        pb.box((0.06, 0.48, 0.06), loc=(cx + ax, cy + face_dir * 0.02, 1.06), mat="wood", bevel=0.02)
    # Fold-down walnut tray table on back
    pb.box((0.58, 0.04, 0.30), loc=(cx, by - face_dir * 0.09, 1.18), mat="wood", bevel=0.015)


def build_hsr_car(name, mats, role="mid"):
    """
    role: 'head' (+Y bullet nose), 'mid' (pantograph + full cabin), 'tail' (-Y bullet nose)
    Body length ~ 12.0m (mid) or 13.8m (head/tail with aerodynamic bullet nose).
    Width = 2.96m (hw = 1.48m), Floor Z = 0.52m, Roof Z = 3.34m.
    """
    pb = PartBuilder(name, mats)
    hw = 1.48
    y_min, y_max = -5.8, 5.8

    # 1. Underframe chassis skirt + bogies
    pb.box((2.82, 11.4, 0.34), loc=(0, 0, 0.52), mat="dark", bevel=0.06)
    # Interior warm wooden floor planks (walkable surface at Z=0.70)
    pb.box((2.76, 11.3, 0.06), loc=(0, 0, 0.69), mat="wood", bevel=0.01)
    # Central aisle carpet runner
    pb.box((0.86, 11.1, 0.02), loc=(0, 0, 0.725), mat="teal", bevel=0.005)
    add_hsr_bogie(pb, -3.6)
    add_hsr_bogie(pb,  3.6)

    # 2. Sculpted arched roof crown (lofted smooth curve)
    roof_stations = []
    for y in (y_min, y_min + 0.4, 0.0, y_max - 0.4, y_max):
        ring = [
            (-hw,       y, 2.74),
            (-hw + 0.08, y, 3.02),
            (-hw + 0.32, y, 3.24),
            (-0.62,     y, 3.36),
            ( 0.00,     y, 3.40),
            ( 0.62,     y, 3.36),
            ( hw - 0.32, y, 3.24),
            ( hw - 0.08, y, 3.02),
            ( hw,       y, 2.74),
            ( hw - 0.14, y, 2.74),
            ( hw - 0.38, y, 3.12),
            ( 0.00,     y, 3.24),
            (-hw + 0.38, y, 3.12),
            (-hw + 0.14, y, 2.74),
        ]
        roof_stations.append(ring)
    pb.loft(roof_stations, mat="cream")

    # Roof aerodynamic AC shroud pods + teal trim stripe
    pb.box((1.56, 2.60, 0.22), loc=(0, -2.4, 3.44), mat="cream", bevel=0.08, segs=2)
    pb.box((1.56, 2.60, 0.22), loc=(0,  2.4, 3.44), mat="cream", bevel=0.08, segs=2)
    if role == "mid":
        # Sculpted diamond pantograph on roof
        pb.box((0.92, 1.04, 0.10), loc=(0, 0.0, 3.44), mat="dark", bevel=0.02)
        for sx in (-0.30, 0.30):
            pb.tube((sx, -0.30, 3.48), (sx, 0.32, 3.86), 0.022, 0.022, segs=6, mat="gold")
            pb.tube((sx,  0.32, 3.86), (sx, -0.18, 4.22), 0.020, 0.020, segs=6, mat="gold")
        pb.box((1.28, 0.12, 0.05), loc=(0, -0.18, 4.24), mat="dark", bevel=0.015)

    # 3. Side walls with real open doorway at Y=[-0.92..+0.92] so player walks straight in!
    for sx in (-1, 1):
        wx = sx * (hw - 0.07)
        # Front & rear wall segments (outside door opening)
        for seg_y0, seg_y1 in ((y_min, -0.94), (0.94, y_max)):
            seg_len = seg_y1 - seg_y0
            seg_cy = (seg_y0 + seg_y1) * 0.5
            # Lower wall apron (below windows)
            pb.box((0.14, seg_len, 0.88), loc=(wx, seg_cy, 1.14), mat="cream", bevel=0.025)
            # Signature Ghibli ocean-teal & gold livery stripes
            pb.box((0.16, seg_len, 0.24), loc=(wx, seg_cy, 1.06), mat="teal", bevel=0.015)
            pb.box((0.165, seg_len, 0.065), loc=(wx, seg_cy, 1.24), mat="gold", bevel=0.01)
            # Upper window header
            pb.box((0.14, seg_len, 0.28), loc=(wx, seg_cy, 2.66), mat="cream", bevel=0.02)
            # Panoramic recessed windows + pillars
            win_centers = [seg_y0 + 0.95, seg_y0 + 2.40, seg_y0 + 3.85]
            pb.box((0.05, seg_len - 0.16, 0.96), loc=(wx, seg_cy, 2.06), mat="glass", bevel=0.01)
            for py in (seg_y0 + 0.12, seg_y0 + 1.68, seg_y0 + 3.12, seg_y1 - 0.12):
                pb.box((0.15, 0.24, 1.02), loc=(wx, py, 2.06), mat="cream", bevel=0.025)
        # Doorway header & threshold step plate
        pb.box((0.15, 1.92, 0.26), loc=(wx, 0.0, 2.66), mat="cream", bevel=0.02)
        pb.box((0.18, 1.88, 0.05), loc=(wx, 0.0, 0.70), mat="gold", bevel=0.01)
        # Overhead luggage rack inside
        for seg_cy in (-3.35, 3.35):
            pb.box((0.36, 4.40, 0.04), loc=(sx * (hw - 0.30), seg_cy, 2.64), mat="gold", bevel=0.01)

    # Interior arched ceiling ribs & warm glowing Ghibli dome lamps
    for ly in (-4.4, -2.4, 0.0, 2.4, 4.4):
        pb.box((2.40, 0.12, 0.08), loc=(0, ly, 3.18), mat="wood", bevel=0.02)
        pb.sphere(0.18, loc=(0, ly, 3.12), scale=(1.4, 1.0, 0.35), mat="glow", u=12, v=8)

    # Interior contoured passenger seats (leaving doorway vestibule Y=[-1.3..+1.3] clear!)
    for sy in (-4.6, -3.2, -1.9, 1.9, 3.2, 4.6):
        add_hsr_seat_pair(pb, -1, sy, face_dir=1.0)
        add_hsr_seat_pair(pb,  1, sy, face_dir=1.0)

    # 4. End bulkheads OR Sculpted Aerodynamic Bullet Nose
    def add_gangway_end(ey):
        pb.box((0.86, 0.16, 2.22), loc=(-1.02, ey, 1.82), mat="cream", bevel=0.03)
        pb.box((0.86, 0.16, 2.22), loc=( 1.02, ey, 1.82), mat="cream", bevel=0.03)
        pb.box((1.24, 0.16, 0.62), loc=( 0.00, ey, 2.84), mat="cream", bevel=0.03)
        # Accordion gangway diaphragm
        pb.box((1.42, 0.24, 2.16), loc=(0, ey + (0.14 if ey > 0 else -0.14), 1.82), mat="dark", bevel=0.04)

    def add_bullet_nose(sgn):
        """10-station parabolic Shinkansen/Ghibli bullet nose loft."""
        base_y = sgn * y_max
        nose_len = 3.20
        rings = []
        for i in range(9):
            t = i / 8.0
            y = base_y + sgn * (t * nose_len)
            # Smooth aerodynamic taper
            w = hw * (1.0 - 0.72 * (t ** 1.65))
            z_bot = 0.44 + 0.42 * (t ** 1.4)
            z_top = 3.36 - 1.98 * (t ** 1.25)
            crown = 0.06 * (1.0 - t)
            rings.append(rounded_rect_ring(y, w, z_bot, z_top, r_bot=0.14 * (1 - 0.5 * t), r_top=0.28 * (1 - 0.5 * t), crown=crown))
        # Ensure ring order produces outward normals for both +Y and -Y
        if sgn < 0:
            rings.reverse()
        pb.loft(rings, mat="cream")

        # Nose teal & gold livery stripes wrapping cleanly along exterior of bullet nose
        for sx in (-1, 1):
            teal_pts = []
            gold_pts = []
            for i in range(8):
                t = i / 7.0 * 0.88
                y = base_y + sgn * (t * nose_len)
                w = hw * (1.0 - 0.72 * (t ** 1.65)) + 0.025
                zt = 1.06 + 0.06 * t
                zg = 1.24 + 0.04 * t
                teal_pts.append((sx * w, y, zt))
                gold_pts.append((sx * w, y, zg))
            pb.pipe_path(teal_pts, radius=0.095, segs=8, mat="teal")
            pb.pipe_path(gold_pts, radius=0.035, segs=8, mat="gold")

        # Golden nose coupler cap / emblem at the very tip
        pb.sphere(0.36, loc=(0, base_y + sgn * (nose_len + 0.02), 1.06), scale=(1.15, 1.30, 0.72), mat="gold", u=16, v=12)

        # Swept panoramic cockpit windshield sitting proud on upper slope (t=0.20..0.55)
        ws_rings = []
        for t in (0.18, 0.36, 0.56):
            y = base_y + sgn * (t * nose_len)
            w = hw * (1.0 - 0.72 * (t ** 1.65)) * 0.84
            z_top = 3.36 - 1.98 * (t ** 1.25) + 0.05
            ws_rings.append([
                (-w,       y, z_top - 0.34),
                (-w * 0.82, y, z_top - 0.04),
                ( 0.0,     y, z_top + 0.04),
                ( w * 0.82, y, z_top - 0.04),
                ( w,       y, z_top - 0.34),
                ( 0.0,     y, z_top - 0.28),
            ])
        if sgn < 0:
            ws_rings.reverse()
        pb.loft(ws_rings, mat="glass")

        # Twin aerodynamic headlight pods + glowing front light bar on nose slope
        for sx in (-1, 1):
            pb.sphere(0.16, loc=(sx * 0.72, base_y + sgn * 2.28, 1.44), scale=(1.15, 1.45, 0.65), mat="glow", u=12, v=8)
            pb.torus(0.16, 0.025, maj_segs=16, min_segs=6,
                     loc=(sx * 0.72, base_y + sgn * 2.26, 1.44), rot=(math.pi * 0.5, 0, 0), mat="gold")
        pb.box((0.92, 0.14, 0.07), loc=(0, base_y + sgn * 2.86, 1.16), mat="glow", bevel=0.02)

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

    # 5. Sliding Pocket Doors (child objects: <name>_Door_L at -X, <name>_Door_R at +X)
    for side_tag, sx in (("L", -1), ("R", 1)):
        dpb = PartBuilder(f"{name}_Door_{side_tag}", mats)
        dx = sx * (hw - 0.03)
        # Door panel with teal/gold livery & rounded window
        dpb.box((0.08, 1.82, 0.86), loc=(dx, 0.0, 1.14), mat="cream", bevel=0.02)
        dpb.box((0.095, 1.82, 0.24), loc=(dx, 0.0, 1.06), mat="teal", bevel=0.015)
        dpb.box((0.10, 1.82, 0.065), loc=(dx, 0.0, 1.24), mat="gold", bevel=0.01)
        # Window frame + glass
        dpb.box((0.08, 0.26, 0.98), loc=(dx, -0.78, 2.04), mat="cream", bevel=0.02)
        dpb.box((0.08, 0.26, 0.98), loc=(dx,  0.78, 2.04), mat="cream", bevel=0.02)
        dpb.box((0.08, 1.82, 0.18), loc=(dx,  0.00, 2.50), mat="cream", bevel=0.02)
        dpb.box((0.04, 1.32, 0.88), loc=(dx,  0.00, 2.02), mat="glass", bevel=0.01)
        # Vertical center seam & brass grab handle
        dpb.box((0.095, 0.03, 1.84), loc=(dx, 0.0, 1.64), mat="dark", bevel=0.005)
        dpb.build_object(parent=car_obj)

    return car_obj


# ---------------------------------------------------------------------------
# EEVEE Multi-Angle Verification Render
# ---------------------------------------------------------------------------
def render_preview(filepath, cam_loc, target, ortho_scale=None, res=(1100, 680)):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.filepath = filepath

    # Warm Ghibli daylight world
    world = bpy.data.worlds.new("PreviewWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.76, 0.86, 0.95, 1.0)
        bg.inputs["Strength"].default_value = 0.85

    # Key sun + fill light
    sun_d = bpy.data.lights.new("Sun", type='SUN')
    sun_d.energy = 3.2
    sun_d.color = (1.0, 0.95, 0.86)
    sun = bpy.data.objects.new("Sun", sun_d)
    sun.rotation_euler = Euler((math.radians(48), math.radians(15), math.radians(38)), 'XYZ')
    scene.collection.objects.link(sun)

    cam_d = bpy.data.cameras.new("Cam")
    if ortho_scale is not None:
        cam_d.type = 'ORTHO'
        cam_d.ortho_scale = ortho_scale
    else:
        cam_d.lens = 45.0
    cam = bpy.data.objects.new("Cam", cam_d)
    cam.location = Vector(cam_loc)
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam

    bpy.ops.render.render(write_still=True)

    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(sun, do_unlink=True)


# ---------------------------------------------------------------------------
# Main Export Pipeline
# ---------------------------------------------------------------------------
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

    # Export all at origin so game places them accurately
    out_glb = os.path.join(OUT_DIR, "vehicles.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format='GLB',
        export_apply=True,
        export_normals=True,
        export_materials='EXPORT',
    )
    print(f"[EXPORTED] {out_glb} ({len(objs)} sculpted vehicles + kite)")

    # Arrange in a clean showcase grid ONLY for preview render
    grid_pos = [
        (-4.5,  2.8, 0),  # car
        ( 0.0,  2.8, 0),  # truck
        ( 4.8,  2.8, 0),  # bus
        (-4.8, -1.6, 0),  # bicycle
        (-2.4, -1.6, 0),  # cargobike
        ( 0.0, -1.6, 0),  # scooter
        ( 2.8, -1.6, 0),  # oxcart
        ( 5.4, -1.6, 0),  # wheelbarrow
        (-4.8, -5.2, 0),  # handcart
        (-1.6, -5.2, 0),  # rowboat
        ( 1.6, -5.2, 0),  # kayak
        ( 4.6, -5.2, 0),  # canoe
        ( 0.0,  0.0, 4.2), # kite (elevated for separate close-up)
    ]
    for obj, pos in zip(objs, grid_pos):
        obj.location = Vector(pos)

    # Ground plane for showcase
    bpy.ops.mesh.primitive_plane_add(size=24, location=(0, -1.2, 0))
    gnd = bpy.context.active_object
    gnd.data.materials.append(make_mat("gnd", (0.68, 0.78, 0.62), roughness=0.9))

    render_preview(
        os.path.join(PREVIEW_DIR, "preview_vehicles.png"),
        cam_loc=(9.5, -11.5, 7.8),
        target=(0.0, -1.0, 0.8),
        res=(1280, 760),
    )

    # Close-up of the sculpted 3D kite
    kite_obj = objs[-1]
    kite_obj.rotation_euler = Euler((math.radians(32), 0, math.radians(-22)), 'XYZ')
    render_preview(
        os.path.join(PREVIEW_DIR, "preview_kite_v2.png"),
        cam_loc=(1.6, -2.4, 5.2),
        target=(0.0, -0.25, 4.1),
        res=(800, 680),
    )


def export_hsr():
    clear_scene()
    mats = get_hsr_mats()

    head = build_hsr_car("HSR_Head", mats, role="head")
    mid  = build_hsr_car("HSR_Mid",  mats, role="mid")
    tail = build_hsr_car("HSR_Tail", mats, role="tail")

    # Export all 3 cars at origin (each positioned by town/landmarks.js)
    out_glb = os.path.join(OUT_DIR, "hsr_train.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format='GLB',
        export_apply=True,
        export_normals=True,
        export_materials='EXPORT',
    )
    print(f"[EXPORTED] {out_glb} (HSR_Head, HSR_Mid, HSR_Tail + sliding doors)")

    # Arrange coupled train for preview render
    head.location = Vector((0,  12.1, 0))
    mid.location  = Vector((0,   0.0, 0))
    tail.location = Vector((0, -12.1, 0))

    # Ground plane
    bpy.ops.mesh.primitive_plane_add(size=50, location=(0, 0, 0))
    gnd = bpy.context.active_object
    gnd.data.materials.append(make_mat("gnd", (0.72, 0.74, 0.70), roughness=0.9))

    render_preview(
        os.path.join(PREVIEW_DIR, "preview_hsr_v2.png"),
        cam_loc=(13.5, 25.5, 5.8),
        target=(0.0, 12.5, 1.5),
        res=(1280, 720),
    )


if __name__ == "__main__":
    export_vehicles()
    export_hsr()
    print("[ALL DONE] Sculpted Ghibli vehicles, kite & HSR train built successfully.")
