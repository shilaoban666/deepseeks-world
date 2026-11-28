"""v3 生物精模：鸟与鱼（高细节版）。

目标细节密度（原神那种"看得出结构"的量级）：
  鸟：18 段放样身体 + 32 边头 + 4 层翼羽（每翼 30+ 根）+ 体羽鳞列 + 扇尾 + 趾爪 + 冠羽
  鱼：24 段放样身体 + 反荫蔽 + 背/尾/胸/腹/臀鳍（带鳍条）+ 逐片鳞 + 鳃盖 + 带高光的眼
"""
import math
from mathutils import Vector

TAU = math.tau

BIRD_PROFILE = {
    'songbird':  [(0.00, 0.16, 0.18, 0.00), (0.06, 0.44, 0.48, 0.01), (0.14, 0.66, 0.72, 0.02),
                  (0.26, 0.90, 0.94, 0.03), (0.40, 1.00, 1.00, 0.02), (0.54, 0.98, 0.98, 0.02),
                  (0.68, 0.88, 0.90, 0.02), (0.80, 0.72, 0.78, 0.05), (0.90, 0.56, 0.62, 0.09),
                  (1.00, 0.42, 0.50, 0.13)],
    'wader':     [(0.00, 0.12, 0.14, 0.00), (0.06, 0.34, 0.38, 0.01), (0.16, 0.56, 0.60, 0.02),
                  (0.30, 0.74, 0.78, 0.02), (0.46, 0.84, 0.88, 0.02), (0.62, 0.82, 0.86, 0.02),
                  (0.76, 0.70, 0.74, 0.04), (0.86, 0.54, 0.60, 0.08), (0.94, 0.44, 0.50, 0.11),
                  (1.00, 0.38, 0.44, 0.13)],
    'waterfowl': [(0.00, 0.18, 0.16, 0.00), (0.06, 0.52, 0.44, 0.01), (0.16, 0.78, 0.66, 0.02),
                  (0.30, 0.96, 0.82, 0.03), (0.46, 1.00, 0.86, 0.02), (0.62, 0.96, 0.84, 0.02),
                  (0.76, 0.84, 0.78, 0.03), (0.88, 0.64, 0.64, 0.07), (0.95, 0.50, 0.54, 0.10),
                  (1.00, 0.40, 0.46, 0.12)],
    'raptor':    [(0.00, 0.16, 0.18, 0.00), (0.06, 0.46, 0.52, 0.01), (0.16, 0.74, 0.82, 0.02),
                  (0.30, 0.94, 1.00, 0.03), (0.46, 1.00, 1.02, 0.02), (0.62, 0.94, 0.96, 0.02),
                  (0.76, 0.82, 0.86, 0.03), (0.88, 0.64, 0.70, 0.07), (0.95, 0.52, 0.58, 0.10),
                  (1.00, 0.44, 0.52, 0.13)],
    'parrot':    [(0.00, 0.18, 0.20, 0.00), (0.06, 0.50, 0.56, 0.01), (0.16, 0.78, 0.84, 0.02),
                  (0.30, 0.96, 1.00, 0.03), (0.46, 1.00, 1.00, 0.02), (0.62, 0.94, 0.94, 0.02),
                  (0.76, 0.84, 0.88, 0.04), (0.88, 0.68, 0.74, 0.09), (0.95, 0.56, 0.62, 0.12),
                  (1.00, 0.48, 0.56, 0.15)],
    'swift':     [(0.00, 0.10, 0.12, 0.00), (0.06, 0.32, 0.36, 0.01), (0.16, 0.56, 0.60, 0.02),
                  (0.30, 0.78, 0.82, 0.02), (0.46, 0.92, 0.94, 0.02), (0.62, 0.90, 0.92, 0.02),
                  (0.76, 0.80, 0.84, 0.02), (0.88, 0.62, 0.68, 0.04), (0.95, 0.46, 0.52, 0.06),
                  (1.00, 0.36, 0.42, 0.08)],
    'owl':       [(0.00, 0.20, 0.22, 0.00), (0.06, 0.54, 0.58, 0.01), (0.16, 0.82, 0.86, 0.02),
                  (0.30, 1.00, 1.00, 0.03), (0.46, 1.00, 1.00, 0.02), (0.62, 0.96, 0.96, 0.02),
                  (0.76, 0.90, 0.92, 0.03), (0.88, 0.82, 0.86, 0.06), (0.95, 0.76, 0.80, 0.09),
                  (1.00, 0.70, 0.76, 0.11)],
}


def _interp(prof, n):
    """把控制点重采样成 n 段（放样更平滑）。支持 3/4 元组。"""
    k = len(prof[0])
    out = []
    for i in range(n):
        t = i / (n - 1)
        for j in range(len(prof) - 1):
            a, b = prof[j], prof[j + 1]
            if a[0] <= t <= b[0]:
                u = (t - a[0]) / max(1e-6, b[0] - a[0])
                out.append(tuple(a[m] + (b[m] - a[m]) * u for m in range(k)))
                break
        else:
            out.append(prof[-1])
    return out


def build_bird(M, p):
    L = p['len']
    R = p['r']
    shape = p.get('shape', 'songbird')
    prof = _interp(BIRD_PROFILE.get(shape, BIRD_PROFILE['songbird']), 18)
    mt = M.m(p.get('top', 'wood_mid'))
    mb = M.m(p.get('belly', 'wall_cream'))
    mw = M.m(p.get('wing', p.get('top', 'wood_mid')))
    mbeak = M.m(p.get('beak', 'gold'))
    mfoot = M.m('gold')

    # ---- 身体（32 边放样，反荫蔽）
    rings = []
    for (t, ry, rz, zo) in prof:
        x = -0.5 * L + t * L * 0.92
        rings.append(M.ring(x, 0.0, zo * R, R * ry, R * rz, n=32,
                            flat_bottom=(0.6 if shape == 'waterfowl' else 0.0)))
    M.loft_rings(rings, mat=mt, mat_top=mt, mat_bottom=mb, cut=-0.02 * R,
                 cap_start=True, cap_end=True)

    # ---- 头
    head_r = R * (0.66 if shape == 'owl' else 0.54)
    head_x = 0.5 * L * 0.92 + head_r * 0.12
    head_z = R * (0.26 if shape == 'wader' else 0.18)
    neck_len = p.get('neck', 0.0)
    if neck_len > 0.02:
        nr = []
        for k in range(7):
            t = k / 6
            nr.append(M.ring(0.5 * L * 0.92 * (1 - t) + head_x * t, 0,
                             R * 0.05 * (1 - t) + (head_z + neck_len) * t,
                             R * (0.36 - 0.18 * t), R * (0.34 - 0.16 * t), n=20))
        M.loft_rings(nr, mat=mt, mat_top=mt, mat_bottom=mb, cut=0.0)
    M.sphere(head_r, (head_x, 0, head_z + neck_len), mat=mt, seg=32, ring=20)
    M.sphere(head_r * 0.74, (head_x + head_r * 0.30, 0, head_z + neck_len - head_r * 0.44),
             mat=mb, seg=24, ring=16, scale=(1, 0.92, 0.66))
    # 眉骨/眼罩
    for sy in (-1, 1):
        M.sphere(head_r * 0.30, (head_x + head_r * 0.42, sy * head_r * 0.52, head_z + neck_len + head_r * 0.42),
                 mat=mb if shape in ('owl',) else mt, seg=14, ring=10, scale=(1.1, 1, 0.7))

    # ---- 喙（上下喙 + 鼻孔）
    btype = p.get('beak_type', 'short')
    bl, bh = {'short': (0.22, 0.16), 'long': (0.66, 0.085), 'hooked': (0.26, 0.28),
              'flat': (0.36, 0.2), 'tiny': (0.1, 0.1), 'crossed': (0.2, 0.14)}.get(btype, (0.22, 0.16))
    bx = head_x + head_r * 0.8
    bz = head_z + neck_len + head_r * 0.06
    M.cyl(bh * R * 1.15, bl * L, (bx + bl * L * 0.5, 0, bz + bh * R * 0.2),
          r2=bh * R * 0.1, rot=(0, 90, 0), mat=mbeak, seg=18, bevel=0.0)
    M.cyl(bh * R * 0.95, bl * L * 0.95, (bx + bl * L * 0.48, 0, bz - bh * R * 0.34),
          r2=bh * R * 0.08, rot=(0, 90, 0), mat=mbeak, seg=18, bevel=0.0)
    if btype == 'hooked':
        M.cyl(bh * R * 0.72, bl * L * 0.55, (bx + bl * L * 0.86, 0, bz - bh * R * 0.5),
              r2=0.005, rot=(0, 148, 0), mat=mbeak, seg=12, bevel=0.0)
    for sy in (-1, 1):
        M.sphere(bh * R * 0.09, (bx + bl * L * 0.18, sy * bh * R * 0.34, bz + bh * R * 0.34),
                 mat=M.m('ink'), seg=8, ring=5)

    # ---- 眼（眼球 + 虹膜环 + 高光）
    for sy in (-1, 1):
        ex = head_x + head_r * 0.46
        ey = sy * head_r * 0.6
        ez = head_z + neck_len + head_r * 0.22
        M.eye((ex, ey, ez), head_r * (0.30 if shape == 'owl' else 0.24), iris=p.get('eye', 'ink'))
        M.cyl(head_r * 0.30, 0.006, (ex - head_r * 0.06, ey, ez), rot=(0, 90, 0),
              mat=M.m('gold' if shape == 'raptor' else 'wood_light'), seg=16, bevel=0.0)

    # ---- 翼：4 层羽毛（初级/次级/覆羽/肩羽）
    wing_len = p.get('wing_len', 0.46)
    for sy in (-1, 1):
        sx = 0.06 * L
        sh = Vector((sx, sy * R * 0.72, R * 0.18))
        tip = Vector((sx - L * wing_len, sy * R * 1.12, R * 0.18 + L * 0.12))
        M.blade(sh, tip, R * 0.46, mat=mw, curve=0.05, up=Vector((0, 0, 1)), swell=0.3)
        d = (tip - sh).normalized()
        side = Vector((0, sy, 0))
        layers = [
            # (根位置范围, 长度, 宽度, 数量, 弯)
            ((0.55, 0.98), 0.34, 0.040, 10, -0.06),   # 初级飞羽
            ((0.30, 0.62), 0.26, 0.045, 9, -0.02),    # 次级飞羽
            ((0.10, 0.44), 0.20, 0.035, 8, 0.04),     # 覆羽
            ((0.00, 0.22), 0.15, 0.030, 6, 0.08),     # 肩羽
        ]
        for (rr, ln, wd, n, cv) in layers:
            for i in range(n):
                f = i / max(1, n - 1)
                root = sh + d * (L * wing_len * (rr[0] + (rr[1] - rr[0]) * f)) + side * R * 0.06
                M.feather(root, (d * 0.45 - side * 0.62 - Vector((0, 0, 0.04))).normalized(),
                          L * ln, L * wd, mat=mw if f > 0.4 else mt, curve=cv, segs=6)

    # ---- 体羽：沿背与胸的鳞列（一片片小甲片）
    rows = 9
    cols = 22
    for r in range(rows):
        t = 0.12 + 0.72 * r / (rows - 1)
        yy, zz, zo = _body_at(prof, t)
        for c in range(cols):
            a = -math.pi * 0.42 + (math.pi * 0.84) * c / (cols - 1)
            x = -0.5 * L + t * L * 0.92
            z = zo * R + math.sin(a) * R * zz
            if z < -R * 0.1:
                continue
            y = math.cos(a) * R * yy * 0.98
            M.sphere(R * 0.055, (x, y, z), mat=mt if z > zo * R else mb,
                     seg=6, ring=4, scale=(1.6, 1.0, 0.6))

    # ---- 尾羽（扇形，双层）
    nt = p.get('tail_feathers', 9)
    tlen = L * p.get('tail_len', 0.32)
    spread = p.get('tail_spread', 0.55)
    for layer, (scale, ang) in enumerate(((1.0, 0.0), (0.78, 0.5))):
        for i in range(nt):
            a = ((i / max(1, nt - 1)) - 0.5) * spread + (ang * spread / nt)
            root = Vector((-0.5 * L * 0.90, math.sin(a) * R * 0.25, R * 0.10))
            dirv = Vector((-1, math.sin(a), 0.02 + abs(a) * 0.15)).normalized()
            M.feather(root, dirv, tlen * scale * (1 - 0.16 * abs(a)), L * 0.052,
                      mat=mw if layer == 0 else mt, curve=0.04, segs=6)

    # ---- 腿爪（三趾 + 后趾 + 爪尖）
    leg = p.get('leg', 0.15) * L
    if leg > 0.01:
        for sy in (-1, 1):
            hx = 0.14 * L
            hz = -R * 0.62
            M.cyl(R * 0.058, leg, (hx, sy * R * 0.36, hz - leg * 0.5), mat=mfoot, seg=10, bevel=0.0)
            M.sphere(R * 0.062, (hx, sy * R * 0.36, hz - leg), mat=mfoot, seg=10, ring=6)
            for k in (-1, 0, 1):
                M.cyl(R * 0.032, L * 0.10, (hx + L * 0.05 + k * L * 0.012,
                                            sy * R * 0.36 + k * L * 0.030,
                                            hz - leg + 0.004),
                      rot=(0, 84, k * 18), mat=mfoot, seg=6, bevel=0.0)
            M.cyl(R * 0.028, L * 0.07, (hx - L * 0.03, sy * R * 0.36, hz - leg + 0.004),
                  rot=(0, 96, 0), mat=mfoot, seg=6, bevel=0.0)

    # ---- 冠羽
    if p.get('crest'):
        for k in range(6):
            M.feather((head_x + head_r * 0.06, (k - 2.5) * head_r * 0.22,
                       head_z + neck_len + head_r * 0.86),
                      Vector((0.28, 0, 1)).normalized(), head_r * (1.5 + 0.35 * (k % 3)),
                      head_r * 0.16, mat=M.m(p.get('accent', 'fabric_red')), curve=0.22, segs=5)
    return None


def _body_at(prof, t):
    """在 t 处取 (ry, rz, zo)。"""
    for k in range(len(prof) - 1):
        a, b = prof[k], prof[k + 1]
        if a[0] <= t <= b[0]:
            u = (t - a[0]) / max(1e-6, b[0] - a[0])
            return (a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u)
    return prof[-1][1], prof[-1][2], prof[-1][3]


FISH_PROFILES = {
    'torpedo': [(0.00, 0.10, 0.06), (0.06, 0.26, 0.12), (0.14, 0.44, 0.19), (0.26, 0.60, 0.25),
                (0.40, 0.72, 0.29), (0.54, 0.76, 0.30), (0.66, 0.72, 0.28), (0.78, 0.62, 0.24),
                (0.88, 0.50, 0.19), (0.95, 0.38, 0.14), (1.00, 0.26, 0.10)],
    'deep':    [(0.00, 0.08, 0.04), (0.06, 0.22, 0.07), (0.16, 0.52, 0.12), (0.30, 0.80, 0.16),
                (0.44, 0.96, 0.18), (0.56, 1.00, 0.18), (0.68, 0.94, 0.17), (0.80, 0.78, 0.14),
                (0.90, 0.54, 0.10), (0.96, 0.36, 0.07), (1.00, 0.26, 0.05)],
    'eel':     [(0.00, 0.05, 0.04), (0.08, 0.13, 0.10), (0.20, 0.19, 0.14), (0.34, 0.23, 0.16),
                (0.48, 0.25, 0.17), (0.62, 0.24, 0.16), (0.74, 0.22, 0.15), (0.84, 0.19, 0.13),
                (0.92, 0.16, 0.10), (0.97, 0.12, 0.07), (1.00, 0.09, 0.05)],
    'flat':    [(0.00, 0.10, 0.03), (0.06, 0.26, 0.04), (0.16, 0.48, 0.05), (0.30, 0.68, 0.07),
                (0.44, 0.82, 0.08), (0.56, 0.86, 0.08), (0.68, 0.80, 0.07), (0.80, 0.64, 0.06),
                (0.90, 0.44, 0.05), (0.96, 0.30, 0.04), (1.00, 0.22, 0.03)],
    'angler':  [(0.00, 0.08, 0.06), (0.06, 0.22, 0.14), (0.16, 0.40, 0.22), (0.30, 0.60, 0.28),
                (0.44, 0.78, 0.32), (0.56, 0.90, 0.34), (0.68, 0.94, 0.33), (0.78, 0.88, 0.30),
                (0.88, 0.72, 0.24), (0.95, 0.54, 0.17), (1.00, 0.38, 0.12)],
}


def build_fish(M, p):
    L = p['len']
    H = p['hgt']
    W = p.get('wid', H * 0.42)
    shape = p.get('shape', 'torpedo')
    prof = _interp(FISH_PROFILES.get(shape, FISH_PROFILES['torpedo']), 24)
    mt = M.m(p.get('top', 'metal'))
    mb = M.m(p.get('belly', 'wall_ash'))
    mf = M.m(p.get('fin', 'roof_red'))
    mink = M.m('ink')

    # ---- 身体（32 边 × 24 段，反荫蔽）
    rings = []
    for (t, hr, wr) in prof:
        rings.append(M.ring(-0.5 * L + t * L, 0.0, 0.0, W * wr, H * hr * 0.5, n=32))
    M.loft_rings(rings, mat=mt, mat_top=mt, mat_bottom=mb, cut=-H * 0.02,
                 cap_start=True, cap_end=True)

    # ---- 逐片鳞（24 段 × 上下两排，沿体侧排列）
    rows = 14
    for r in range(rows):
        t = 0.06 + 0.88 * r / (rows - 1)
        hr, wr = _fish_at(prof, t)
        x = -0.5 * L + t * L
        for k in range(10):
            a = -math.pi * 0.46 + (math.pi * 0.92) * k / 9
            y = math.cos(a) * W * wr * 0.99
            z = math.sin(a) * H * hr * 0.5 * 0.99
            M.sphere(min(W, H) * 0.035, (x, y, z), mat=mt if z > 0 else mb,
                     seg=6, ring=4, scale=(1.5, 1.0, 1.0))

    # ---- 尾鳍（分叉 + 鳍条）
    tx = -0.5 * L
    fork = p.get('fork', 0.45)
    for sz in (-1, 1):
        tipz = sz * H * (0.34 + fork * 0.36)
        M.blade((tx, 0, 0), (tx - L * 0.17, 0, tipz), H * 0.055, mat=mf,
                curve=0.03, up=Vector((0, 0, 1)), swell=0.12)
        for k in range(5):
            f = k / 4
            M.cyl(H * 0.006, L * 0.16 * (0.7 + 0.3 * f),
                  (tx - L * 0.08, 0, sz * H * (0.34 + fork * 0.36) * f),
                  rot=(0, 78, 0), mat=mf, seg=5, bevel=0.0)

    # ---- 背鳍 / 臀鳍（带鳍条）
    dors = p.get('dorsal', 0.26)
    M.blade((-0.02 * L, 0, H * 0.44), (0.16 * L, 0, H * (0.44 + dors)), H * 0.15, mat=mf,
            curve=0.02, up=Vector((0, 0, 1)), swell=0.32)
    for k in range(7):
        f = k / 6
        M.cyl(H * 0.006, H * dors * 0.9, (-0.02 * L + 0.18 * L * f, 0, H * (0.46 + dors * 0.5 * f)),
              rot=(0, 0, 0), mat=mf, seg=5, bevel=0.0)
    anal = p.get('anal', 0.2)
    M.blade((-0.10 * L, 0, -H * 0.36), (-0.22 * L, 0, -H * (0.36 + anal)), H * 0.11, mat=mf,
            curve=-0.01, up=Vector((0, 0, 1)), swell=0.25)

    # ---- 胸鳍 / 腹鳍
    for sy in (-1, 1):
        M.blade((0.18 * L, sy * W * 0.40, -H * 0.10), (0.05 * L, sy * W * 0.64, -H * 0.22),
                H * 0.11, mat=mf, curve=0.02, up=Vector((0, 0, 1)), swell=0.22)
        for k in range(4):
            f = k / 3
            M.cyl(H * 0.005, H * 0.12, (0.18 * L - 0.05 * L * f, sy * W * (0.42 + 0.2 * f),
                                        -H * (0.10 + 0.11 * f)),
                  rot=(0, 0, sy * 60), mat=mf, seg=5, bevel=0.0)
        M.blade((0.02 * L, sy * W * 0.32, -H * 0.30), (-0.09 * L, sy * W * 0.44, -H * 0.45),
                H * 0.07, mat=mf, curve=0.01, up=Vector((0, 0, 1)), swell=0.15)

    # ---- 眼（大眼 + 虹膜环 + 高光）
    for sy in (-1, 1):
        M.eye((0.34 * L, sy * W * 0.34, H * 0.12), H * p.get('eye_r', 0.11),
              iris=p.get('eye', 'white'))
        M.cyl(H * 0.115, 0.004, (0.34 * L - H * 0.02, sy * W * 0.36, H * 0.12),
              rot=(0, 90, 0), mat=M.m('metal_dark'), seg=16, bevel=0.0)

    # ---- 鳃盖（三片叠瓦）
    for sy in (-1, 1):
        for k in range(3):
            M.cyl(H * 0.16, 0.006,
                  (0.245 * L - k * H * 0.012, sy * W * 0.31, H * 0.02),
                  rot=(0, 90, sy * 12), mat=M.m('metal_dark'), seg=14, bevel=0.0)

    # ---- 嘴 / 唇 / 鼻孔
    M.cyl(H * 0.055, H * 0.07, (0.5 * L - H * 0.02, 0, -H * 0.05), r2=H * 0.04,
          rot=(0, 90, 0), mat=mink, seg=14, bevel=0.0)
    M.cyl(H * 0.062, H * 0.02, (0.5 * L - H * 0.005, 0, -H * 0.05), rot=(0, 90, 0),
          mat=mb, seg=14, bevel=0.0)

    # ---- 鳞饰斑纹
    if p.get('stripes'):
        for k in range(p.get('stripes', 0)):
            t = 0.26 + 0.12 * k
            hr, wr = _fish_at(prof, t)
            M.cyl(W * wr * 0.97, H * 0.014, (-0.5 * L + t * L, 0, 0), rot=(90, 0, 0),
                  mat=M.m('wall_cream'), seg=20, bevel=0.0)
    if p.get('spots'):
        for k in range(p.get('spots', 0)):
            a = TAU * k / max(1, p.get('spots', 1))
            t = 0.42 + 0.3 * math.cos(a)
            hr, wr = _fish_at(prof, t)
            M.sphere(H * 0.05, (-0.5 * L + t * L, math.sin(a) * W * wr * 0.9,
                                math.cos(a) * H * hr * 0.35),
                     mat=M.m('white'), seg=10, ring=6)
    if p.get('whiskers'):
        for sy in (-1, 1):
            M.cyl(H * 0.009, L * 0.16, (0.46 * L, sy * W * 0.16, -H * 0.11),
                  rot=(0, 150, sy * 14), mat=mink, seg=6, bevel=0.0)
    return None


def _fish_at(prof, t):
    for k in range(len(prof) - 1):
        a, b = prof[k], prof[k + 1]
        if a[0] <= t <= b[0]:
            u = (t - a[0]) / max(1e-6, b[0] - a[0])
            return (a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u)
    return prof[-1][1], prof[-1][2]