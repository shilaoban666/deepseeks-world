"""给女仆模型建立人形骨架 + 自动权重。

骨架命名照搬 src/figure/animator.js 期望的那套（root / spine_01..03 / upperarm_l ...），
这样 starter-man 的 33 个动画片段可以直接重定向上来。

  blender -b --factory-startup --python tools/ghibli/maid_step2_rig.py
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector

ROOT = r"D:\DSH DEMO\deepseek-world"
OUTDIR = os.path.join(ROOT, "public", "characters", "maid")
BLEND_IN = os.path.join(OUTDIR, "maid-static.blend")

bpy.ops.wm.open_mainfile(filepath=BLEND_IN)
ob = bpy.data.objects["MAID"]

# ---------------------------------------------------------------- 量一下身材
zs = sorted((ob.matrix_world @ v.co).z for v in ob.data.vertices)
H = zs[-1]
print("HEIGHT", round(H, 3))
bands = {}
for v in ob.data.vertices:
    w = ob.matrix_world @ v.co
    b = round(w.z / 0.1) * 0.1
    d = bands.setdefault(b, [0, -9, 9])
    d[0] += 1
    d[1] = max(d[1], abs(w.x))
    d[2] = min(d[2], abs(w.x))
for b in sorted(bands):
    n, mx, mn = bands[b]
    print(f"BAND z={b:.1f}  n={n:6d}  max|x|={mx:.3f}  min|x|={mn:.3f}")

# 肩宽/髋宽估计：取 z 0.75~0.85 与 1.25~1.35 的 |x| 分位数
def quantile(lo, hi, q):
    xs = sorted(abs((ob.matrix_world @ v.co).x) for v in ob.data.vertices
                if lo <= (ob.matrix_world @ v.co).z <= hi)
    if not xs:
        return 0.0
    return xs[int(len(xs) * q)]

sh_w = quantile(1.24, 1.36, 0.90)
hip_w = quantile(0.72, 0.84, 0.85)
print("SHOULDER_HALF", round(sh_w, 3), "HIP_HALF", round(hip_w, 3))

# ---------------------------------------------------------------- 骨架
arm_data = bpy.data.armatures.new("MAID_RIG")
rig = bpy.data.objects.new("MAID_RIG", arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')

h = H
Z = lambda f: h * f
shoulder_z = Z(0.815)
hip_z = Z(0.545)
knee_z = Z(0.285)
ankle_z = Z(0.055)
sp1 = Z(0.585)
sp2 = Z(0.655)
sp3 = Z(0.735)
neck_z = Z(0.855)
head_z = Z(0.895)
sw = max(sh_w * 0.62, 0.10)      # 肩关节半宽
hw = max(hip_w * 0.55, 0.075)    # 髋关节半宽

eb = arm_data.edit_bones


def bone(name, head, tail, parent=None, connect=False):
    b = eb.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b


bone("root", (0, 0, 0), (0, 0, Z(0.10)))
bone("hips", (0, 0, hip_z), (0, 0, sp1), "root")
bone("spine_01", (0, 0, sp1), (0, 0, sp2), "hips", True)
bone("spine_02", (0, 0, sp2), (0, 0, sp3), "spine_01", True)
bone("spine_03", (0, 0, sp3), (0, 0, shoulder_z), "spine_02", True)
bone("neck", (0, 0, neck_z), (0, 0, head_z), "spine_03")
bone("head", (0, 0, head_z), (0, 0, Z(0.995)), "neck", True)

for s, tag in ((1, "l"), (-1, "r")):
    bone(f"clavicle_{tag}", (s * 0.03, 0, shoulder_z - 0.01), (s * sw, 0, shoulder_z), "spine_03")
    # A 字手：从肩向斜下方
    ua_end = (s * (sw + 0.20), 0, shoulder_z - 0.255)
    bone(f"upperarm_{tag}", (s * sw, 0, shoulder_z), ua_end, f"clavicle_{tag}", True)
    la_end = (s * (sw + 0.245), 0, shoulder_z - 0.52)
    bone(f"lowerarm_{tag}", ua_end, la_end, f"upperarm_{tag}", True)
    bone(f"hand_{tag}", la_end, (s * (sw + 0.26), 0, shoulder_z - 0.62), f"lowerarm_{tag}", True)
    bone(f"thigh_{tag}", (s * hw, 0, hip_z), (s * hw, 0, knee_z), "hips")
    bone(f"calf_{tag}", (s * hw, 0, knee_z), (s * hw, 0, ankle_z), f"thigh_{tag}", True)
    bone(f"foot_{tag}", (s * hw, 0, ankle_z), (s * hw, -0.13, 0.015), f"calf_{tag}", True)
    bone(f"toe_{tag}", (s * hw, -0.13, 0.015), (s * hw, -0.20, 0.012), f"foot_{tag}", True)

bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------- 蒙皮
for o in bpy.context.selected_objects:
    o.select_set(False)
ob.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
print("SKINNED groups", len(ob.vertex_groups))

# 权重体检：有多少顶点没分到权重
me = ob.data
unweighted = 0
for v in me.vertices:
    if not v.groups or sum(g.weight for g in v.groups) < 1e-4:
        unweighted += 1
print("UNWEIGHTED", unweighted, "/", len(me.vertices), round(unweighted / len(me.vertices) * 100, 2), "%")

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTDIR, "maid-rigged.blend"))
print("SAVED maid-rigged.blend")