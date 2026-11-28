"""给女仆骨架手工编排动作：待机 / 走 / 跑 / 冲刺 / 跳 / 钓鱼。

不依赖 starter-man 的动画（那套骨架的静止姿态与这套不同，直接重定向会歪），
改成按正弦曲线程序化打关键帧——步频、摆幅、膝盖弯曲、躯干前倾都能算准。
导出 maid.glb（含骨骼与蒙皮）+ maid-clips.glb（动作库）。
"""
import bpy
import math
import os
from mathutils import Vector

ROOT = r"D:\DSH DEMO\deepseek-world"
OUTDIR = os.path.join(ROOT, "public", "characters", "maid")
PREV = os.path.join(ROOT, "design", "previews_maid")
os.makedirs(PREV, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=os.path.join(OUTDIR, "maid-rigged.blend"))
rig = bpy.data.objects["MAID_RIG"]
ob = bpy.data.objects["MAID"]

# 统一把骨骼改成和 src/figure/animator.js 一致的名字
rename = {"hips": "pelvis", "neck": "neck_01", "head": "Head", "toe_l": "ball_l", "toe_r": "ball_r"}
for old, new in rename.items():
    b = rig.data.bones.get(old)
    if b:
        b.name = new
print("BONES", [b.name for b in rig.data.bones])

FPS = 30
sc = bpy.context.scene
sc.render.fps = FPS

for pb in rig.pose.bones:
    pb.rotation_mode = 'XYZ'


def clear():
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)


def key(frame, poses, root_loc=None):
    """poses: {bone: (rx, ry, rz)} 度；root_loc: (x, y, z) 米"""
    for name, rot in poses.items():
        pb = rig.pose.bones.get(name)
        if not pb:
            continue
        pb.rotation_euler = tuple(math.radians(a) for a in rot)
        pb.keyframe_insert("rotation_euler", frame=frame)
    r = rig.pose.bones.get("root")
    if r is not None and root_loc is not None:
        r.location = Vector(root_loc)
        r.keyframe_insert("location", frame=frame)


def new_action(name):
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    return act


def action_fcurves(act):
    """Blender 5.x 用分层动作，fcurves 挂在 layer/strip/channelbag 上。"""
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


def smooth(act):
    for f in action_fcurves(act):
        for kp in f.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.handle_left_type = 'AUTO_CLAMPED'
            kp.handle_right_type = 'AUTO_CLAMPED'


# ------------------------------------------------------------------ 待机
act = new_action("Idle")
N = 90  # 3s
for i in range(0, N + 1, 10):
    p = i / N
    s = math.sin(2 * math.pi * p)
    key(i, {
        "spine_02": (1.2 + 0.8 * s, 0, 0.6 * math.sin(2 * math.pi * p + 0.8)),
        "neck_01": (-1.0 - 0.6 * s, 0, 1.2 * math.sin(2 * math.pi * p + 0.4)),
        "upperarm_l": (2.0 + 2.5 * s, 0, -3.0),
        "upperarm_r": (2.0 + 2.5 * s, 0, 3.0),
        "lowerarm_l": (-4.0 - 1.5 * s, 0, 0),
        "lowerarm_r": (-4.0 - 1.5 * s, 0, 0),
        "thigh_l": (0, 0, 0), "thigh_r": (0, 0, 0),
    }, root_loc=(0, 0, 0.004 * s))
smooth(act)
print("CLIP Idle", N, "frames")

# ------------------------------------------------------------------ 走 / 跑 / 冲刺
def gait(name, N, thigh_a, knee_a, arm_a, lean, bob, plant=0.55):
    act = new_action(name)
    for i in range(0, N + 1, 2):
        p = i / N
        ph = 2 * math.pi * p
        s, c = math.sin(ph), math.cos(ph)
        # 左右腿相位差半周期；膝盖只在支撑后段弯曲
        knee_l = max(0.0, knee_a * math.sin(ph + 0.9))
        knee_r = max(0.0, knee_a * math.sin(ph + math.pi + 0.9))
        key(i, {
            "thigh_l": (thigh_a * s, 0, 0),
            "thigh_r": (thigh_a * -s, 0, 0),
            "calf_l": (-knee_l, 0, 0),
            "calf_r": (-knee_r, 0, 0),
            "foot_l": (12 + 10 * c, 0, 0),
            "foot_r": (12 - 10 * c, 0, 0),
            "upperarm_l": (-arm_a * s, 0, -4),
            "upperarm_r": (arm_a * s, 0, 4),
            "lowerarm_l": (-18 - 10 * max(0, s), 0, 0),
            "lowerarm_r": (-18 - 10 * max(0, -s), 0, 0),
            "spine_02": (lean, 0, 2.0 * s),
            "spine_03": (lean * 0.5, 0, 1.5 * -s),
            "pelvis": (-lean * 0.4, 2.5 * c, 0),
            "neck_01": (-lean * 0.7, 0, 0),
        }, root_loc=(0, 0, bob * abs(math.sin(ph))))
    smooth(act)
    print("CLIP", name, N, "frames")


gait("Walk", 36, 26, 42, 16, 4, 0.020)
gait("Jog", 28, 38, 62, 30, 8, 0.032)
gait("Run", 22, 48, 78, 42, 14, 0.042)
gait("Sprint", 18, 58, 92, 54, 20, 0.050)

# ------------------------------------------------------------------ 跳
act = new_action("Jump")


def jf(fr, poses, z):
    key(fr, poses, root_loc=(0, 0, z))


stand = {"thigh_l": (0, 0, 0), "thigh_r": (0, 0, 0), "calf_l": (0, 0, 0), "calf_r": (0, 0, 0),
         "upperarm_l": (0, 0, -3), "upperarm_r": (0, 0, 3), "spine_02": (0, 0, 0)}
jf(1, stand, 0)
jf(6, {"thigh_l": (-42, 0, 0), "thigh_r": (-42, 0, 0), "calf_l": (-55, 0, 0), "calf_r": (-55, 0, 0),
       "upperarm_l": (35, 0, -6), "upperarm_r": (35, 0, 6), "spine_02": (16, 0, 0)}, -0.16)
jf(11, {"thigh_l": (-8, 0, 0), "thigh_r": (-8, 0, 0), "calf_l": (-6, 0, 0), "calf_r": (-6, 0, 0),
        "upperarm_l": (-55, 0, -10), "upperarm_r": (-55, 0, 10), "spine_02": (-6, 0, 0)}, 0.05)
jf(18, {"thigh_l": (-32, 0, 0), "thigh_r": (-14, 0, 0), "calf_l": (-62, 0, 0), "calf_r": (-28, 0, 0),
        "upperarm_l": (-70, 0, -14), "upperarm_r": (-70, 0, 14), "spine_02": (6, 0, 0)}, 0.42)
jf(26, {"thigh_l": (-16, 0, 0), "thigh_r": (-28, 0, 0), "calf_l": (-34, 0, 0), "calf_r": (-50, 0, 0),
        "upperarm_l": (-30, 0, -10), "upperarm_r": (-30, 0, 10), "spine_02": (8, 0, 0)}, 0.18)
jf(32, {"thigh_l": (-40, 0, 0), "thigh_r": (-40, 0, 0), "calf_l": (-52, 0, 0), "calf_r": (-52, 0, 0),
        "upperarm_l": (20, 0, -6), "upperarm_r": (20, 0, 6), "spine_02": (18, 0, 0)}, -0.18)
jf(40, stand, 0)
smooth(act)
print("CLIP Jump 40 frames")

# ------------------------------------------------------------------ 钓鱼（举竿 + 轻微晃动 + 偶尔提竿）
act = new_action("Fishing")
N = 120
for i in range(0, N + 1, 5):
    p = i / N
    sway = math.sin(2 * math.pi * p)
    tug = max(0.0, math.sin(2 * math.pi * (p * 3 - 0.15)))
    key(i, {
        "spine_02": (6 + 1.5 * sway, 0, 1.0 * sway),
        "spine_03": (3, 0, -0.8 * sway),
        "neck_01": (-4, 0, 2.0 * sway),
        "upperarm_l": (-72 - 4 * tug, 0, -16),
        "upperarm_r": (-66 - 3 * tug, 0, 10),
        "lowerarm_l": (-34 - 6 * tug, 0, 0),
        "lowerarm_r": (-28 - 4 * tug, 0, 0),
        "hand_l": (0, 0, -10),
        "hand_r": (0, 0, 8),
        "thigh_l": (-4, 0, 0),
        "thigh_r": (2, 0, 0),
        "calf_l": (-6, 0, 0),
        "calf_r": (-2, 0, 0),
    }, root_loc=(0, 0, 0.004 * sway))
smooth(act)
print("CLIP Fishing 120 frames")

# ------------------------------------------------------------------ 导出
sc.frame_set(1)
for a in bpy.data.actions:
    a.use_fake_user = True

blend_out = os.path.join(OUTDIR, "maid-animated.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_out)

for o in bpy.context.selected_objects:
    o.select_set(False)
ob.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig

glb = os.path.join(OUTDIR, "maid.glb")
bpy.ops.export_scene.gltf(
    filepath=glb, export_format="GLB", use_selection=True, export_apply=False,
    export_yup=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_skins=True,
    export_animations=True, export_animation_mode="ACTIONS",
    export_frame_range=False, export_bake_animation=True,
    export_optimize_animation_size=True, export_anim_slide_to_zero=True,
)
size = os.path.getsize(glb) / 1048576
print("EXPORT", glb, round(size, 2), "MB")
print("ACTIONS", [a.name for a in bpy.data.actions])