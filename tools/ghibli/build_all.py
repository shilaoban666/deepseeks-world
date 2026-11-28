"""批量生成 150 个模型 → public/models/<cat>/<id>.glb + _manifest.json

用法（Windows 路径）：
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" -b --factory-startup \
      --python D:\\DSH DEMO\\deepseek-world\\tools\\ghibli\\build_all.py -- --out "D:\\DSH DEMO\\deepseek-world\\public\\models"
"""
import bpy
import bmesh
import colorsys
import json
import os
import sys
import math
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import Model, P  # noqa: E402
import items  # noqa: E402


def arg(name, default=None):
    if '--' in sys.argv:
        a = sys.argv[sys.argv.index('--') + 1:]
        if name in a:
            return a[a.index(name) + 1]
    return default


ROOT = os.path.dirname(os.path.dirname(HERE))  # deepseek-world/
SPEC = os.path.join(ROOT, 'design', 'models-150.json')
OUT = arg('--out', os.path.join(ROOT, 'public', 'models'))
ONLY = arg('--only')          # 逗号分隔 id，便于单件调试


def clear():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)


def measure(ob):
    me = ob.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    tris = sum(max(0, len(p.vertices) - 2) for p in me.polygons)
    return dict(
        size=[round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3), round(max(zs) - min(zs), 3)],
        zmin=round(min(zs), 3), zmax=round(max(zs), 3),
        verts=len(me.vertices), faces=len(me.polygons), tris=tris,
        mats=len(me.materials),
    )


def main():
    spec = json.load(open(SPEC, encoding='utf-8'))
    todo = spec['items']
    if ONLY:
        keep = set(ONLY.split(','))
        todo = [it for it in todo if it['id'] in keep]

    clear()
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0

    result = []
    t_all = time.time()
    for i, it in enumerate(todo, 1):
        name = it['id']
        t0 = time.time()
        rec = dict(id=name, cat=it['cat'], name=it.get('name', name),
                   variant=it.get('variant'), dims=it.get('dims'))
        try:
            M = Model(name)
            fn = items.BUILDERS[it['kind']]
            fn(M, it)
            ob = M.build()
            info = measure(ob)
            rec.update(info)
            # 材质清单（manifest 要求：尺寸/面数/材质）
            rec['mats_list'] = [s.material.name for s in ob.material_slots if s.material]
            rec['palette'] = sorted({m[0] for m in M.mats})
            # 风格指纹：色相族 / 平均饱和度 / 平均明度（宫崎骏式低饱和暖调的可复核数字）
            cols = [P.get(k, (0.8, 0.8, 0.8)) for k in rec['palette']]
            hsv = [colorsys.rgb_to_hsv(*c) for c in cols]
            rec['style'] = {
                'sat_mean': round(sum(h[1] for h in hsv) / len(hsv), 3),
                'val_mean': round(sum(h[2] for h in hsv) / len(hsv), 3),
                'warm_ratio': round(sum(1 for h in hsv if h[0] < 0.14 or h[0] > 0.92) / len(hsv), 3),
                'colors': len(cols),
            }
            rec['ms'] = round((time.time() - t0) * 1000)
            # 尺寸偏差（以声明 dims 为期望）
            dev = []
            if it.get('dims'):
                for k, idx in (('w', 0), ('d', 1), ('h', 2)):
                    want = it['dims'][idx]
                    got = info['size'][idx]
                    dev.append(round((got - want) / want * 100, 1) if want else 0.0)
            rec['dev_pct'] = dev
            # 导出
            d = os.path.join(OUT, it['cat'])
            os.makedirs(d, exist_ok=True)
            path = os.path.join(d, name + '.glb')
            for o in bpy.context.selected_objects:
                o.select_set(False)
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            bpy.ops.export_scene.gltf(
                filepath=path, export_format='GLB', use_selection=True,
                export_apply=True, export_yup=True, export_normals=True,
                export_texcoords=True, export_materials='EXPORT',
            )
            rec['glb'] = os.path.relpath(path, os.path.dirname(OUT)).replace('\\', '/')
            rec['glb_kb'] = round(os.path.getsize(path) / 1024, 1)
            bpy.data.objects.remove(ob, do_unlink=True)
            result.append(rec)
            print(f'[{i:3d}/{len(todo)}] OK  {name:24s} {info["tris"]:6d} tris  '
                  f'{info["size"][0]:5.2f}x{info["size"][1]:5.2f}x{info["size"][2]:5.2f}m  '
                  f'{rec["glb_kb"]:7.1f}KB  {rec["ms"]:5d}ms')
        except Exception as e:
            rec['error'] = f'{type(e).__name__}: {e}'
            rec['trace'] = traceback.format_exc()[-900:]
            result.append(rec)
            print(f'[{i:3d}/{len(todo)}] ERR {name}: {e}')

    os.makedirs(OUT, exist_ok=True)
    ok = [r for r in result if 'error' not in r]
    summary = dict(
        project='deepseeks-world', style='Ghibli / 煤炭镇 手绘水粉',
        generated_at=time.strftime('%Y-%m-%dT%H:%M:%S'),
        blender=bpy.app.version_string,
        units='m', forward='+Z', origin='底部中心',
        total=len(result), ok=len(ok), failed=len(result) - len(ok),
        total_tris=sum(r.get('tris', 0) for r in ok),
        elapsed_s=round(time.time() - t_all, 1),
        items=result,
    )
    path = os.path.join(OUT, '_manifest.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)

    print(f'\n=== 完成 {len(ok)}/{len(result)}，'
          f'共 {summary["total_tris"]} 三角面，{summary["elapsed_s"]}s ===')
    print('manifest:', path)
    bad = [r for r in result if 'error' in r]
    if bad:
        print('失败：')
        for r in bad:
            print(' ', r['id'], r['error'])


main()