"""Build optimized, rigged, animated 3D Whalechan (maid) GLB for Painted Valley / DeepSeek World.

Usage:
  blender --factory-startup --background --python tools/build_whalechan_rig.py
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector

ROOT = r"D:\DSH DEMO\deepseek-world"
SRC_GLB = os.path.join(ROOT, "public", "女仆3d模型.glb")
CLEAN_BLEND = os.path.join(ROOT, "tools", "whalechan_clean.blend")
OUT_GLB = os.path.join(ROOT, "public", "figures", "whalechan.glb")
OUT_BLEND = os.path.join(ROOT, "tools", "whalechan_rigged.blend")
SCRATCH_DIR = os.environ.get(
    "WHALE_PREVIEW_DIR",
    r"C:\Users\shilaoban\.gemini\antigravity\brain\8cc60f92-f47e-4a8b-bc27-26a746fb2f13\scratch",
)
TARGET_HEIGHT = 1.60
TARGET_TRIS = 28000
TEX_SIZE = 2048


def smoothstep(edge0, edge1, x):
    if edge0 == edge1:
        return 1.0 if x >= edge1 else 0.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m, do_unlink=True)
    for a in list(bpy.data.armatures):
        bpy.data.armatures.remove(a, do_unlink=True)
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act, do_unlink=True)


def load_or_build_clean_mesh():
    # Reuse cached decimated mesh if present (saves ~85s on re-rigging iterations!)
    if os.path.exists(CLEAN_BLEND) and os.environ.get("REBUILD_MESH") != "1":
        bpy.ops.wm.open_mainfile(filepath=CLEAN_BLEND)
        ob = bpy.data.objects["Whalechan"]
        # Remove any old rigs/modifiers/actions
        for o in list(bpy.data.objects):
            if o != ob:
                bpy.data.objects.remove(o, do_unlink=True)
        for act in list(bpy.data.actions):
            bpy.data.actions.remove(act, do_unlink=True)
        ob.modifiers.clear()
        ob.parent = None
        ob.vertex_groups.clear()
        print(f"[1] Loaded cached clean mesh: verts={len(ob.data.vertices)}, polys={len(ob.data.polygons)}")
        return ob

    # Check if we already have decimated mesh inside whalechan_rigged.blend from previous run
    if os.path.exists(OUT_BLEND) and os.environ.get("REBUILD_MESH") != "1":
        bpy.ops.wm.open_mainfile(filepath=OUT_BLEND)
        ob = bpy.data.objects.get("Whalechan")
        if ob and len(ob.data.polygons) <= TARGET_TRIS + 500:
            for o in list(bpy.data.objects):
                if o != ob:
                    bpy.data.objects.remove(o, do_unlink=True)
            for act in list(bpy.data.actions):
                bpy.data.actions.remove(act, do_unlink=True)
            ob.modifiers.clear()
            ob.parent = None
            ob.vertex_groups.clear()
            bpy.ops.wm.save_as_mainfile(filepath=CLEAN_BLEND)
            print(f"[1] Cached clean mesh from previous blend: verts={len(ob.data.vertices)}, polys={len(ob.data.polygons)}")
            return ob

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=SRC_GLB)
    ob = [o for o in bpy.data.objects if o.type == "MESH"][0]
    ob.name = "Whalechan"

    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.rotation_mode = "XYZ"
    ob.rotation_euler = (0.0, 0.0, -math.pi / 2.0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    verts = [v.co.copy() for v in ob.data.vertices]
    min_z = min(v.z for v in verts)
    max_z = max(v.z for v in verts)
    s = TARGET_HEIGHT / (max_z - min_z)
    feet = [v for v in verts if (v.z - min_z) * s < 0.12]
    fx = (min(v.x for v in feet) + max(v.x for v in feet)) * 0.5
    fy = (min(v.y for v in feet) + max(v.y for v in feet)) * 0.5
    for v in ob.data.vertices:
        v.co = Vector(((v.co.x - fx) * s, (v.co.y - fy) * s, (v.co.z - min_z) * s))
    ob.data.update()

    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0003)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()

    cur_tris = sum(max(0, len(p.vertices) - 2) for p in ob.data.polygons)
    if cur_tris > TARGET_TRIS:
        mod = ob.modifiers.new("Decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = TARGET_TRIS / float(cur_tris)
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)

    for p in ob.data.polygons:
        p.use_smooth = True
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()

    for img in bpy.data.images:
        if img.size[0] > TEX_SIZE or img.size[1] > TEX_SIZE:
            img.scale(TEX_SIZE, TEX_SIZE)
            img.pack()

    bpy.ops.wm.save_as_mainfile(filepath=CLEAN_BLEND)
    print(f"[1] Built & cached clean mesh: verts={len(ob.data.vertices)}, polys={len(ob.data.polygons)}")
    return ob


def paint_vertex_attributes(ob):
    """Store Ghibli cel-shading helpers in vertex color 'Color':
      R = faceMask (softens shadow terminator across cute anime eyes/cheeks)
      G = detailMask (reduces inner outline thickness on face/eyes)
      B = softAO (subtle painted crevice shading under chin, skirt, inner hair)
    """
    me = ob.data
    col_attr = me.color_attributes.get("Color")
    if col_attr is None:
        col_attr = me.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
    me.color_attributes.active_color = col_attr
    me.color_attributes.render_color_index = list(me.color_attributes).index(col_attr)

    verts = me.vertices
    for li, loop in enumerate(me.loops):
        v = verts[loop.vertex_index]
        x, y, z = v.co.x, v.co.y, v.co.z
        ny = v.normal.y

        face_z = smoothstep(0.75, 0.83, z) * (1.0 - smoothstep(1.13, 1.24, z))
        face_x = 1.0 - smoothstep(0.20, 0.30, abs(x))
        face_y = smoothstep(-0.08, -0.20, y)
        face_n = smoothstep(-0.05, -0.45, ny)
        face_mask = clamp(face_z * face_x * face_y * (0.4 + 0.6 * face_n), 0.0, 1.0)
        detail_mask = clamp(face_mask * 1.15, 0.0, 1.0)

        ao = 1.0
        neck_band = smoothstep(0.64, 0.72, z) * (1.0 - smoothstep(0.75, 0.84, z)) * (1.0 - smoothstep(0.14, 0.26, abs(x)))
        ao -= 0.13 * neck_band
        if z < 0.22 and abs(x) < 0.17 and abs(y) < 0.12:
            ao -= 0.14 * smoothstep(0.08, 0.19, z)
        if 0.22 < z < 0.72 and 0.09 < y < 0.20 and abs(x) < 0.22:
            ao -= 0.10
        ao = clamp(ao, 0.78, 1.0)

        col_attr.data[li].color = (face_mask, detail_mask, ao, 1.0)


def create_armature():
    arm_data = bpy.data.armatures.new("WhaleRig")
    rig = bpy.data.objects.new("WhaleRig", arm_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def add_bone(name, head, tail, parent=None, connect=False):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        # Align local Z cleanly toward world +Y (back) or +Z so local X is always pitch!
        if abs((b.tail - b.head).normalized().z) > 0.7:
            b.align_roll(Vector((0.0, 1.0, 0.0)))
        else:
            b.align_roll(Vector((0.0, 0.0, 1.0)))
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    # Core spine & head
    add_bone("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.14))
    add_bone("hips", (0.0, 0.01, 0.30), (0.0, 0.01, 0.43), "root")
    add_bone("spine", (0.0, 0.01, 0.43), (0.0, 0.00, 0.56), "hips", True)
    add_bone("chest", (0.0, 0.00, 0.56), (0.0, 0.00, 0.68), "spine", True)
    add_bone("neck", (0.0, 0.00, 0.68), (0.0, 0.00, 0.75), "chest", True)
    add_bone("head", (0.0, 0.00, 0.75), (0.0, 0.00, 1.38), "neck", True)

    # Head accessories & flowing hair
    add_bone("ahoge", (0.00, 0.00, 1.41), (-0.07, 0.00, 1.58), "head")
    add_bone("ear_l", (0.31, 0.06, 0.93), (0.52, 0.10, 0.88), "head")
    add_bone("ear_r", (-0.31, 0.06, 0.93), (-0.52, 0.10, 0.88), "head")

    add_bone("hair_b1", (0.0, 0.24, 0.76), (0.0, 0.28, 0.48), "head")
    add_bone("hair_b2", (0.0, 0.28, 0.48), (0.0, 0.25, 0.20), "hair_b1", True)
    add_bone("hair_l", (0.26, 0.16, 0.72), (0.34, 0.18, 0.32), "head")
    add_bone("hair_r", (-0.26, 0.16, 0.72), (-0.34, 0.18, 0.32), "head")

    # Arms (+X = left, -X = right) — aligned so local X = forward/back swing, local Z = raise/lower outward!
    for s, tag in ((1.0, "l"), (-1.0, "r")):
        b_sh = add_bone(f"shoulder_{tag}", (s * 0.04, 0.00, 0.63), (s * 0.145, 0.00, 0.625), "chest")
        b_ua = add_bone(f"upperarm_{tag}", (s * 0.145, 0.00, 0.625), (s * 0.22, -0.015, 0.515), f"shoulder_{tag}", True)
        b_la = add_bone(f"lowerarm_{tag}", (s * 0.22, -0.015, 0.515), (s * 0.265, -0.03, 0.42), f"upperarm_{tag}", True)
        b_hd = add_bone(f"hand_{tag}", (s * 0.265, -0.03, 0.42), (s * 0.285, -0.045, 0.36), f"lowerarm_{tag}", True)
        # Align arm rolls cleanly to world -Y (front) so X-rotation always swings forward/back!
        for b in (b_ua, b_la, b_hd):
            b.align_roll(Vector((0.0, -1.0, 0.0)))

    # Whale tail (on her left hip, +X side)
    add_bone("tail_1", (0.20, 0.08, 0.30), (0.36, 0.10, 0.35), "hips")
    add_bone("tail_2", (0.36, 0.10, 0.35), (0.49, 0.10, 0.42), "tail_1", True)

    # Skirt panels
    add_bone("skirt_f", (0.00, -0.11, 0.36), (0.00, -0.23, 0.15), "hips")
    add_bone("skirt_b", (0.00, 0.09, 0.36), (0.00, 0.13, 0.15), "hips")
    add_bone("skirt_l", (0.13, -0.02, 0.36), (0.27, -0.02, 0.15), "hips")
    add_bone("skirt_r", (-0.13, -0.02, 0.36), (-0.27, -0.02, 0.15), "hips")

    # Legs (vertical down, aligned to -Y so +X = kick forward, -X = kick back!)
    for s, tag in ((1.0, "l"), (-1.0, "r")):
        b_th = add_bone(f"thigh_{tag}", (s * 0.084, 0.00, 0.28), (s * 0.084, 0.00, 0.145), "hips")
        b_ca = add_bone(f"calf_{tag}", (s * 0.084, 0.00, 0.145), (s * 0.084, 0.00, 0.055), f"thigh_{tag}", True)
        b_fo = add_bone(f"foot_{tag}", (s * 0.084, 0.00, 0.055), (s * 0.084, -0.075, 0.025), f"calf_{tag}", True)
        b_th.align_roll(Vector((0.0, -1.0, 0.0)))
        b_ca.align_roll(Vector((0.0, -1.0, 0.0)))

    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"[2] Created clean axis-aligned armature ({len(arm_data.bones)} bones)")
    return rig


def assign_clean_weights(ob, rig):
    """Region-aware weighting + targeted Laplacian seam smoothing so deformations are organic with zero pinch."""
    ob.parent = rig
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    mod.use_vertex_groups = True

    ob.vertex_groups.clear()
    bone_names = [b.name for b in rig.data.bones]
    vgroups = {name: ob.vertex_groups.new(name=name) for name in bone_names}

    n_verts = len(ob.data.vertices)
    raw_weights = [{} for _ in range(n_verts)]
    region_of = [""] * n_verts

    for v in ob.data.vertices:
        vi = v.index
        x, y, z = v.co.x, v.co.y, v.co.z
        ax = abs(x)
        w = {}

        # 1. LEGS
        is_exposed_leg = z < 0.122 and y < 0.10 and ax < 0.165
        is_inner_leg = (0.122 <= z < 0.25) and (ax < 0.155) and (-0.078 < y < 0.085)
        if is_exposed_leg or is_inner_leg:
            tag = "l" if x >= 0.0 else "r"
            region_of[vi] = f"leg_{tag}"
            if z < 0.065:
                t_foot = 1.0 - smoothstep(0.035, 0.068, z)
                w[f"foot_{tag}"] = t_foot
                w[f"calf_{tag}"] = 1.0 - t_foot
            elif z < 0.165:
                t_thigh = smoothstep(0.115, 0.165, z)
                w[f"calf_{tag}"] = 1.0 - t_thigh
                w[f"thigh_{tag}"] = t_thigh
            else:
                t_hips = smoothstep(0.19, 0.25, z)
                w[f"thigh_{tag}"] = 1.0 - t_hips
                w["hips"] = t_hips
            raw_weights[vi] = w
            continue

        # 2. AHOGE
        if z > 1.425 and -0.22 < x < 0.08 and -0.065 < y < 0.065:
            region_of[vi] = "head"
            t = smoothstep(1.425, 1.475, z)
            w["ahoge"] = t
            w["head"] = 1.0 - t
            raw_weights[vi] = w
            continue

        # 3. EARS
        if 0.79 <= z <= 1.03 and ax > 0.335 and -0.08 < y < 0.25:
            region_of[vi] = "head"
            tag = "l" if x >= 0.0 else "r"
            t = smoothstep(0.335, 0.39, ax)
            w[f"ear_{tag}"] = t
            w["head"] = 1.0 - t
            raw_weights[vi] = w
            continue

        # 4. HEAD
        if z >= 0.84 or (z >= 0.71 and y <= 0.14):
            region_of[vi] = "head"
            if z < 0.77 and ax < 0.16:
                t_head = smoothstep(0.71, 0.77, z)
                w["head"] = t_head
                w["neck"] = 1.0 - t_head
            else:
                w["head"] = 1.0
            raw_weights[vi] = w
            continue

        # 5. WHALE TAIL (left hip protrusion, +X side)
        if x > 0.275 and 0.23 <= z <= 0.52 and -0.03 <= y <= 0.185:
            region_of[vi] = "tail"
            t_base = smoothstep(0.275, 0.33, x)
            t_tip = smoothstep(0.36, 0.45, x)
            w["hips"] = (1.0 - t_base) * 0.65
            w["skirt_l"] = (1.0 - t_base) * 0.35
            w["tail_1"] = t_base * (1.0 - t_tip)
            w["tail_2"] = t_base * t_tip
            raw_weights[vi] = w
            continue

        # 6. LONG BACK & SIDE HAIR
        is_back_hair = y > 0.115 and z < 0.84
        is_side_hair = (ax > 0.295) and (y > 0.045) and (0.24 <= z < 0.84)
        if is_back_hair or is_side_hair:
            region_of[vi] = "hair"
            t_head = smoothstep(0.64, 0.82, z)
            rem = 1.0 - t_head
            t_lower = 1.0 - smoothstep(0.36, 0.58, z)
            if ax > 0.22 and y < 0.24:
                tag = "l" if x >= 0.0 else "r"
                side_w = smoothstep(0.20, 0.30, ax)
                w["head"] = t_head
                w[f"hair_{tag}"] = rem * side_w
                w["hair_b1"] = rem * (1.0 - side_w) * (1.0 - t_lower)
                w["hair_b2"] = rem * (1.0 - side_w) * t_lower
            else:
                w["head"] = t_head
                w["hair_b1"] = rem * (1.0 - t_lower)
                w["hair_b2"] = rem * t_lower
            raw_weights[vi] = w
            continue

        # 7. ARMS (sleeves + hands; cleanly separate sleeves & hands from flared skirt)
        arm_min_x = 0.140 if z >= 0.50 else 0.155 + (0.50 - z) * 0.25
        if 0.355 <= z <= 0.695 and -0.105 <= y <= 0.095 and ax >= arm_min_x:
            tag = "l" if x >= 0.0 else "r"
            region_of[vi] = f"arm_{tag}"
            sh = Vector((0.145 if x >= 0 else -0.145, 0.00, 0.625))
            hd = Vector((0.285 if x >= 0 else -0.285, -0.045, 0.36))
            axis = hd - sh
            t_arm = clamp((v.co - sh).dot(axis) / axis.length_squared, 0.0, 1.0)

            t_chest = 1.0 - smoothstep(arm_min_x, arm_min_x + 0.045, ax)
            if z < 0.48:
                t_chest *= smoothstep(0.42, 0.50, z)
            arm_w = 1.0 - t_chest
            if t_chest > 0.0:
                w["chest"] = t_chest * smoothstep(0.48, 0.60, z)
                w["spine"] = t_chest * (1.0 - smoothstep(0.48, 0.60, z))

            if t_arm < 0.38:
                u = smoothstep(0.0, 0.38, t_arm)
                w[f"shoulder_{tag}"] = arm_w * (1.0 - u) * 0.45
                w[f"upperarm_{tag}"] = arm_w * (0.55 + 0.45 * u)
            elif t_arm < 0.74:
                u = smoothstep(0.38, 0.74, t_arm)
                w[f"upperarm_{tag}"] = arm_w * (1.0 - u)
                w[f"lowerarm_{tag}"] = arm_w * u
            else:
                u = smoothstep(0.74, 0.92, t_arm)
                w[f"lowerarm_{tag}"] = arm_w * (1.0 - u)
                w[f"hand_{tag}"] = arm_w * u
            raw_weights[vi] = w
            continue

        # 8. SKIRT
        if z <= 0.44:
            region_of[vi] = "skirt"
            t_skirt = 1.0 - smoothstep(0.24, 0.43, z)
            w["hips"] = 1.0 - t_skirt
            ang = math.atan2(x, -y)
            wf = max(0.0, math.cos(ang)) ** 1.5
            wb = max(0.0, -math.cos(ang)) ** 1.5
            wl = max(0.0, math.sin(ang)) ** 1.5
            wr = max(0.0, -math.sin(ang)) ** 1.5
            ws = wf + wb + wl + wr + 1e-6
            w["skirt_f"] = t_skirt * (wf / ws)
            w["skirt_b"] = t_skirt * (wb / ws)
            w["skirt_l"] = t_skirt * (wl / ws)
            w["skirt_r"] = t_skirt * (wr / ws)
            raw_weights[vi] = w
            continue

        # 9. TORSO
        region_of[vi] = "body"
        if z < 0.48:
            u = smoothstep(0.41, 0.48, z)
            w["hips"] = 1.0 - u
            w["spine"] = u
        elif z < 0.60:
            u = smoothstep(0.50, 0.60, z)
            w["spine"] = 1.0 - u
            w["chest"] = u
        elif z < 0.70:
            u = smoothstep(0.63, 0.70, z)
            w["chest"] = 1.0 - u
            w["neck"] = u
        else:
            u = smoothstep(0.70, 0.75, z)
            w["neck"] = 1.0 - u
            w["head"] = u
        raw_weights[vi] = w

    # Build adjacency graph for 3-pass smooth blending WITHIN compatible regions
    # (never bleed across leg_l/leg_r or hair/body or hair/legs, DO smooth shoulder/body, hair/head, tail/body!)
    compatible = {
        ("body", "arm_l"), ("arm_l", "body"),
        ("body", "arm_r"), ("arm_r", "body"),
        ("body", "skirt"), ("skirt", "body"),
        ("skirt", "tail"), ("tail", "skirt"),
        ("head", "hair"), ("hair", "head"),
        ("body", "head"), ("head", "body"),
    }
    adj = [[] for _ in range(n_verts)]
    for e in ob.data.edges:
        a, b = e.vertices[0], e.vertices[1]
        ra, rb = region_of[a], region_of[b]
        if ra == rb or (ra, rb) in compatible:
            adj[a].append(b)
            adj[b].append(a)

    for _ in range(3):
        nxt = [None] * n_verts
        for i in range(n_verts):
            nbrs = adj[i]
            if not nbrs:
                nxt[i] = raw_weights[i]
                continue
            acc = {}
            for k, val in raw_weights[i].items():
                acc[k] = acc.get(k, 0.0) + val * 0.5
            inv = 0.5 / len(nbrs)
            for nb in nbrs:
                for k, val in raw_weights[nb].items():
                    acc[k] = acc.get(k, 0.0) + val * inv
            nxt[i] = acc
        raw_weights = nxt

    for vi, wdict in enumerate(raw_weights):
        items = [(k, val) for k, val in wdict.items() if val > 1e-4]
        if not items:
            items = [("hips", 1.0)]
        items.sort(key=lambda kv: kv[1], reverse=True)
        items = items[:4]
        total = sum(val for _, val in items)
        for name, val in items:
            vgroups[name].add([vi], val / total, "REPLACE")

    unweighted = sum(1 for v in ob.data.vertices if not v.groups)
    print(f"[3] Assigned & 3-pass smoothed weights, unweighted={unweighted}")


def action_fcurves(act):
    if hasattr(act, "fcurves"):
        try:
            return list(act.fcurves)
        except Exception:
            pass
    out = []
    for layer in getattr(act, "layers", []):
        for strip in getattr(layer, "strips", []):
            for cb in getattr(strip, "channelbags", []):
                out.extend(cb.fcurves)
    return out


def reset_pose(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)


def build_core_animations(rig):
    """Bake core animation clips into GLB with clean aligned bone axes.
    Convention after align_roll:
      - hips/spine/chest/neck/head: +X leans forward, +Y twists left, +Z tilts right
      - thigh/calf: +X swings leg forward / bends knee forward, -X swings back / bends knee back
      - upperarm_l: +X swings forward, +Z raises arm UP/outward; upperarm_r: +X swings forward, -Z raises arm UP/outward
      - hair_b1/b2: -X lifts hair backward/up away from back!
      - skirt_f: +X lifts front hem forward; skirt_b: -X lifts back hem backward
    """
    sc = bpy.context.scene
    sc.render.fps = 30
    reset_pose(rig)

    def new_act(name):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data_create()
        rig.animation_data.action = act
        reset_pose(rig)
        return act

    def kf(frame, poses, hips_loc=(0.0, 0.0, 0.0)):
        # Always keyframe hips so switching actions never carries stale pitch!
        base = {"hips": (0.0, 0.0, 0.0)}
        base.update(poses)
        for name, deg in base.items():
            pb = rig.pose.bones.get(name)
            if pb:
                pb.rotation_euler = tuple(math.radians(a) for a in deg)
                pb.keyframe_insert("rotation_euler", frame=frame)
        pb_h = rig.pose.bones.get("hips")
        if pb_h:
            pb_h.location = Vector(hips_loc)
            pb_h.keyframe_insert("location", frame=frame)

    def smooth(act):
        for fc in action_fcurves(act):
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"
                kp.handle_left_type = "AUTO_CLAMPED"
                kp.handle_right_type = "AUTO_CLAMPED"

    # 1. Idle
    act = new_act("Idle")
    N = 90
    for i in range(0, N + 1, 10):
        ph = 2.0 * math.pi * (i / N)
        s, c = math.sin(ph), math.cos(ph)
        s2 = math.sin(ph * 2.0)
        kf(i, {
            "spine": (1.5 * s, 0, 1.0 * c),
            "head": (-1.5 * s, 2.5 * c, 1.5 * math.sin(ph + 0.5)),
            "ahoge": (5.0 * s2, 0, 4.0 * c),
            "ear_l": (0, 0, 3.0 * s),
            "ear_r": (0, 0, -3.0 * s),
            "upperarm_l": (2.5 * s, 0, 4.0 + 2.0 * s),
            "upperarm_r": (2.5 * s, 0, -4.0 - 2.0 * s),
            "tail_1": (0, 8.0 * s2, 4.0 * c),
            "tail_2": (0, 12.0 * math.sin(ph * 2.0 - 0.5), 3.0 * s),
            "hair_b1": (-2.0 - 1.5 * s, 0, 1.2 * c),
            "hair_b2": (-2.0 - 2.0 * math.sin(ph - 0.5), 0, 1.8 * c),
        }, (0, 0, 0.008 * s))
    smooth(act)

    # 2. Walk / FastWalk / Run (-X on hips/spine = forward lean!)
    def make_gait(name, N, leg_a, knee_a, arm_a, lean, bob, tail_a, hair_lift):
        act = new_act(name)
        for i in range(0, N + 1, 2):
            ph = 2.0 * math.pi * (i / N)
            s, c = math.sin(ph), math.cos(ph)
            kl = max(0.0, knee_a * math.sin(ph + 0.7))
            kr = max(0.0, knee_a * math.sin(ph + math.pi + 0.7))
            kf(i, {
                "hips": (-lean * 0.35, 3.0 * c, 1.8 * s),
                "spine": (-lean * 0.45, -2.0 * c, -1.2 * s),
                "chest": (-lean * 0.25, -1.5 * c, 0),
                "head": (lean * 0.65, 2.0 * c, 2.0 * s),
                "ahoge": (hair_lift * 0.35 + 6.0 * math.sin(ph * 2.0), 0, 4.0 * s),
                "ear_l": (0, 0, 4.0 * abs(s)),
                "ear_r": (0, 0, -4.0 * abs(s)),
                "thigh_l": (leg_a * s, 0, 0),
                "thigh_r": (-leg_a * s, 0, 0),
                "calf_l": (-kl, 0, 0),
                "calf_r": (-kr, 0, 0),
                "upperarm_l": (-arm_a * s, 0, 10.0 + lean * 0.35),
                "upperarm_r": (arm_a * s, 0, -10.0 - lean * 0.35),
                "lowerarm_l": (12.0 + 10.0 * max(0.0, -s), 0, 0),
                "lowerarm_r": (12.0 + 10.0 * max(0.0, s), 0, 0),
                "skirt_f": (6.0 + 5.0 * abs(s), 0, 0),
                "skirt_b": (-8.0 - 6.0 * abs(s), 0, 0),
                "hair_b1": (-hair_lift - 4.0 * abs(s), 0, 3.0 * s),
                "hair_b2": (-hair_lift * 0.6 - 5.0 * math.sin(ph * 2.0 - 0.5), 0, 4.0 * s),
                "tail_1": (0, tail_a * s, 5.0 * c),
                "tail_2": (0, tail_a * 1.1 * math.sin(ph - 0.6), 5.0 * s),
            }, (0, 0, bob * abs(s)))
        smooth(act)

    make_gait("Walk", 32, 22, 24, 18, 5, 0.022, 10, 5)
    make_gait("FastWalk", 24, 30, 36, 26, 10, 0.036, 15, 10)
    make_gait("Run", 18, 38, 48, 34, 16, 0.050, 20, 16)

    # 3. Jump
    act = new_act("Jump")
    kf(0, {"spine": (-10, 0, 0), "thigh_l": (16, 0, 0), "thigh_r": (16, 0, 0), "calf_l": (-22, 0, 0), "calf_r": (-22, 0, 0), "upperarm_l": (-10, 0, 14), "upperarm_r": (-10, 0, -14)}, (0, 0, -0.04))
    kf(8, {"spine": (5, 0, 0), "head": (6, 0, 0), "thigh_l": (28, 0, 5), "thigh_r": (14, 0, -5), "calf_l": (-38, 0, 0), "calf_r": (-24, 0, 0), "upperarm_l": (16, 0, 48), "upperarm_r": (16, 0, -48), "hair_b1": (-10, 0, 0), "hair_b2": (-10, 0, 0), "skirt_f": (10, 0, 0), "skirt_b": (-10, 0, 0), "tail_1": (0, 14, 10)}, (0, 0, 0.04))
    kf(24, {"spine": (-4, 0, 0), "head": (-3, 0, 0), "thigh_l": (18, 0, 4), "thigh_r": (24, 0, -4), "calf_l": (-28, 0, 0), "calf_r": (-34, 0, 0), "upperarm_l": (10, 0, 40), "upperarm_r": (10, 0, -40), "hair_b1": (-16, 0, 0), "hair_b2": (-14, 0, 0), "skirt_f": (12, 0, 0), "skirt_b": (-12, 0, 0), "tail_1": (0, -12, 12)}, (0, 0, 0.02))
    smooth(act)

    # 4. DoubleJump (joyful mid-air twirl)
    act = new_act("DoubleJump")
    for idx, fr in enumerate([0, 6, 12, 18, 24]):
        ang = idx * 90.0
        kf(fr, {
            "hips": (-6, ang, 0), "spine": (-6, 0, 0),
            "thigh_l": (32, 0, 6), "thigh_r": (32, 0, -6),
            "calf_l": (-44, 0, 0), "calf_r": (-44, 0, 0),
            "upperarm_l": (14, 0, 54), "upperarm_r": (14, 0, -54),
            "hair_b1": (-18, 0, 8), "hair_b2": (-16, 0, 12),
            "skirt_f": (14, 0, 0), "skirt_b": (-14, 0, 0),
            "tail_1": (0, 18, 12),
        }, (0, 0, 0.04 * math.sin(idx * math.pi / 4.0)))
    smooth(act)

    # 5. Sit
    act = new_act("Sit")
    for i in range(0, 61, 15):
        s = math.sin(2.0 * math.pi * (i / 60.0))
        kf(i, {
            "spine": (-3 - 1.5 * s, 0, 0),
            "head": (2 + 1.5 * s, 3 * s, 2 * math.cos(2.0 * math.pi * i / 60.0)),
            "thigh_l": (56, 0, 6), "thigh_r": (56, 0, -6),
            "calf_l": (-46 + 5 * s, 0, 0), "calf_r": (-46 - 5 * s, 0, 0),
            "upperarm_l": (20, 0, 12), "upperarm_r": (20, 0, -12),
            "lowerarm_l": (16, 0, -8), "lowerarm_r": (16, 0, 8),
            "skirt_f": (20, 0, 0), "skirt_b": (-8, 0, 0),
            "tail_1": (0, 10 * s, 6),
        }, (0, 0, -0.07))
    smooth(act)

    # 6. Swim & Dive (-X on hips pitches face-down into streamlined horizontal swim!)
    act = new_act("Swim")
    for i in range(0, 49, 6):
        ph = 2.0 * math.pi * (i / 48.0)
        s, c = math.sin(ph), math.cos(ph)
        kf(i, {
            "hips": (-24 - 4 * s, 0, 3 * c),
            "head": (18, 0, 3 * c),
            "upperarm_l": (32 + 18 * s, 0, 26 + 16 * c),
            "upperarm_r": (32 + 18 * s, 0, -26 - 16 * c),
            "lowerarm_l": (16 + 10 * c, 0, 0), "lowerarm_r": (16 + 10 * c, 0, 0),
            "thigh_l": (14 * s, 0, 0), "thigh_r": (-14 * s, 0, 0),
            "calf_l": (-18 - 12 * c, 0, 0), "calf_r": (-18 + 12 * c, 0, 0),
            "tail_1": (10 * s, 14 * c, 0), "tail_2": (12 * math.sin(ph - 0.6), 16 * c, 0),
            "hair_b1": (-16 - 5 * s, 0, 0), "hair_b2": (-12 - 6 * c, 0, 0),
        }, (0, 0, 0.03 * s))
    smooth(act)

    act = new_act("Dive")
    for i in range(0, 41, 5):
        ph = 2.0 * math.pi * (i / 40.0)
        s, c = math.sin(ph), math.cos(ph)
        kf(i, {
            "hips": (-72 - 5 * s, 0, 0),
            "spine": (-5 * math.sin(ph - 0.4), 0, 0),
            "head": (36 + 4 * c, 0, 0),
            "upperarm_l": (36 + 14 * s, 0, 24 + 12 * c),
            "upperarm_r": (36 + 14 * s, 0, -24 - 12 * c),
            "thigh_l": (18 * math.sin(ph - 0.8), 0, 0), "thigh_r": (18 * math.sin(ph - 0.8), 0, 0),
            "calf_l": (-20 - 14 * math.sin(ph - 1.3), 0, 0), "calf_r": (-20 - 14 * math.sin(ph - 1.3), 0, 0),
            "tail_1": (16 * math.sin(ph - 0.7), 10 * c, 0),
            "tail_2": (20 * math.sin(ph - 1.2), 14 * c, 0),
            "hair_b1": (-8 - 6 * s, 0, 0), "hair_b2": (-10 - 8 * math.sin(ph - 0.7), 0, 0),
        }, (0, 0, 0.04 * s))
    smooth(act)

    # 7. Fish
    act = new_act("Fish")
    for i in range(0, 91, 15):
        ph = 2.0 * math.pi * (i / 90.0)
        s = math.sin(ph)
        kf(i, {
            "spine": (-6 - 2 * s, 0, 0),
            "head": (4 + 2 * s, 3 * s, 0),
            "upperarm_r": (42 + 5 * s, 0, -16),
            "lowerarm_r": (18 + 4 * s, 0, 8),
            "upperarm_l": (34 + 4 * s, 0, 16),
            "lowerarm_l": (20 + 4 * s, 0, -8),
            "thigh_l": (44, 0, 5), "thigh_r": (44, 0, -5),
            "calf_l": (-40, 0, 0), "calf_r": (-40, 0, 0),
            "skirt_f": (16, 0, 0),
            "tail_1": (0, 12 * s, 5),
        }, (0, 0, -0.05))
    smooth(act)

    # 8. Climb / Ski / Surf / Lie / Wave
    act = new_act("Climb")
    for i in range(0, 33, 4):
        ph = 2.0 * math.pi * (i / 32.0)
        s = math.sin(ph)
        kf(i, {
            "spine": (-5, 0, 3 * s), "head": (12, 0, 0),
            "upperarm_l": (42 + 18 * s, 0, 24), "upperarm_r": (42 - 18 * s, 0, -24),
            "lowerarm_l": (20, 0, 0), "lowerarm_r": (20, 0, 0),
            "thigh_l": (22 + 18 * s, 0, 5), "thigh_r": (22 - 18 * s, 0, -5),
            "calf_l": (-26 - 14 * s, 0, 0), "calf_r": (-26 + 14 * s, 0, 0),
        }, (0, 0, 0.02 * abs(s)))
    smooth(act)

    act = new_act("Ski")
    for i in range(0, 41, 10):
        s = math.sin(2.0 * math.pi * i / 40.0)
        kf(i, {
            "spine": (-20, 0, 4 * s), "head": (14, 0, -3 * s),
            "thigh_l": (24, 0, 4), "thigh_r": (24, 0, -4),
            "calf_l": (-30, 0, 0), "calf_r": (-30, 0, 0),
            "upperarm_l": (24, 0, 22), "upperarm_r": (24, 0, -22),
            "hair_b1": (-20, 0, 5 * s), "hair_b2": (-16, 0, 6 * s),
            "tail_1": (0, 14 * s, 8),
        }, (0, 0, -0.04 + 0.015 * s))
    smooth(act)

    act = new_act("Surf")
    for i in range(0, 41, 10):
        s = math.sin(2.0 * math.pi * i / 40.0)
        kf(i, {
            "hips": (-5, -32, 5 * s), "spine": (-6, 10, -4 * s), "head": (5, 22, 0),
            "thigh_l": (20, 0, 10), "thigh_r": (20, 0, -10),
            "calf_l": (-24, 0, 0), "calf_r": (-24, 0, 0),
            "upperarm_l": (12, 0, 48 - 8 * s), "upperarm_r": (12, 0, -48 - 8 * s),
            "hair_b1": (-18, 0, 6 * s), "tail_1": (0, 16 * s, 10),
        }, (0, 0, -0.03))
    smooth(act)

    act = new_act("Lie")
    for i in range(0, 61, 15):
        s = math.sin(2.0 * math.pi * i / 60.0)
        kf(i, {
            "hips": (78, 0, 0), "spine": (-6 - 2 * s, 0, 0), "head": (-10, 4 * s, 0),
            "upperarm_l": (14, 0, 24), "upperarm_r": (14, 0, -24),
            "thigh_l": (10 + 6 * s, 0, 4), "thigh_r": (6, 0, -4),
            "calf_l": (-14 - 8 * s, 0, 0), "calf_r": (-8, 0, 0),
            "tail_1": (0, 10 * s, 0),
        }, (0, 0, -0.16))
    smooth(act)

    act = new_act("Wave")
    for i in range(0, 41, 5):
        ph = 2.0 * math.pi * (i / 40.0)
        s = math.sin(ph * 2.0)
        kf(i, {
            "spine": (0, 0, -4), "head": (-4, 0, 7 + 3 * s),
            "upperarm_r": (24, 0, -76 - 14 * s),
            "lowerarm_r": (16, 0, -14 * s),
            "upperarm_l": (-4, 0, 10),
            "tail_1": (0, 14 * s, 8),
            "ahoge": (0, 0, 8 * s),
        }, (0, 0, 0.015 * abs(s)))
    smooth(act)

    rig.animation_data.action = None
    reset_pose(rig)
    print(f"[4] Baked {len(bpy.data.actions)} core animations")


def render_pose_verification(ob, rig):
    os.makedirs(SCRATCH_DIR, exist_ok=True)
    world = bpy.data.worlds.new("W")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.65, 0.78, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

    ld = bpy.data.lights.new("Sun", type="SUN")
    ld.energy = 2.4
    lo = bpy.data.objects.new("Sun", ld)
    bpy.context.collection.objects.link(lo)
    lo.rotation_euler = (math.radians(40), 0, math.radians(-30))

    cd = bpy.data.cameras.new("Cam")
    cd.lens = 50
    cam = bpy.data.objects.new("Cam", cd)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = 420
    sc.render.resolution_y = 480
    sc.render.image_settings.file_format = "PNG"

    shots = [
        ("run_3q", "Run", 5, (2.2, -2.2, 0.90), (0.0, 0.0, 0.75)),
        ("jump_3q", "Jump", 8, (2.2, -2.2, 0.95), (0.0, 0.0, 0.82)),
        ("sit_3q", "Sit", 15, (2.2, -2.2, 0.85), (0.0, 0.0, 0.70)),
        ("dive_side", "Dive", 10, (3.2, -0.4, 0.80), (0.0, -0.2, 0.65)),
        ("wave_front", "Wave", 10, (0.5, -3.1, 0.88), (0.0, 0.0, 0.78)),
    ]
    for label, act_name, frame, cam_loc, target in shots:
        reset_pose(rig)
        rig.animation_data.action = bpy.data.actions[act_name]
        sc.frame_set(frame)
        bpy.context.view_layer.update()
        cam.location = Vector(cam_loc)
        cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(SCRATCH_DIR, f"rigcheck2_{label}.png")
        bpy.ops.render.render(write_still=True)

    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(lo, do_unlink=True)
    rig.animation_data.action = None
    reset_pose(rig)


def export_assets(ob, rig):
    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

    for o in list(bpy.context.selected_objects):
        o.select_set(False)
    ob.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig

    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_image_quality=88,
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_frame_range=False,
        export_bake_animation=True,
        export_optimize_animation_size=True,
        export_anim_slide_to_zero=True,
    )
    mb = os.path.getsize(OUT_GLB) / (1024.0 * 1024.0)
    print(f"[5] Exported {OUT_GLB} ({mb:.2f} MB)")


def main():
    ob = load_or_build_clean_mesh()
    paint_vertex_attributes(ob)
    rig = create_armature()
    assign_clean_weights(ob, rig)
    build_core_animations(rig)
    export_assets(ob, rig)
    if os.environ.get("SKIP_PREVIEW") != "1":
        render_pose_verification(ob, rig)


if __name__ == "__main__":
    main()
