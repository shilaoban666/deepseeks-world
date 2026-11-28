"""v2 批量生成：读 design/models-2000.json → public/models2/<cat>/<id>.glb + manifest

  blender -b --factory-startup --python tools/ghibli/v2/build.py -- \
      [--limit 200] [--offset 0] [--cat furniture,shop] [--only id1,id2] [--out DIR]

可断点续跑：manifest 已存在则合并；--skip-existing 跳过已导出的件。
"""
import bpy
import bmesh
import colorsys
import json
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
GHIBLI = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(GHIBLI))
sys.path.insert(0, GHIBLI)
sys.path.insert(0, HERE)

from lib import P                      # noqa: E402
from lib2 import Model2                # noqa: E402
import families                        # noqa: E402


def arg(name, default=None):
    """取 --name value；若是开关（后面没有值或下一个也是 --xx），返回 '1'。"""
    if '--' in sys.argv:
        a = sys.argv[sys.argv.index('--') + 1:]
        if name in a:
            i = a.index(name) + 1
            if i >= len(a) or a[i].startswith('--'):
                return '1'
            return a[i]
    return default


SPEC = os.path.join(ROOT, 'design', 'models-2000.json')
OUT = arg('--out', os.path.join(ROOT, 'public', 'models2'))
LIMIT = int(arg('--limit', '0'))
OFFSET = int(arg('--offset', '0'))
CATS = arg('--cat')
ONLY = arg('--only')
SKIP = arg('--skip-existing') is not None
MISSING = arg('--missing') is not None


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
    return dict(size=[round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3), round(max(zs) - min(zs), 3)],
                verts=len(me.vertices), faces=len(me.polygons), tris=tris, mats=len(me.materials))


def mesh_check(ob):
    """内联体检：非流形边 / 零面积面 / 有符号体积 / 底部贴地。"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    nm = sum(1 for e in bm.edges if len(e.link_faces) > 2 or len(e.link_faces) == 0)
    degen = 0
    vol = 0.0
    for f in bm.faces:
        a, b, c = [v.co for v in f.verts]
        if (b - a).cross(c - a).length < 1e-9:
            degen += 1
        vol += a.dot(b.cross(c)) / 6.0
    bm.free()
    zmin = min((ob.matrix_world @ v.co).z for v in ob.data.vertices)
    ok = nm == 0 and degen == 0 and vol > 0 and zmin > -0.02
    return dict(nonmanifold=nm, degenerate=degen, volume=round(vol, 4), zmin=round(zmin, 4),
                verdict='pass' if ok else 'fail')


def main():
    spec = json.load(open(SPEC, encoding='utf-8'))
    todo = spec['items']
    if CATS:
        keep = set(CATS.split(','))
        todo = [i for i in todo if i['cat'] in keep]
    if ONLY:
        keep = set(ONLY.split(','))
        todo = [i for i in todo if i['id'] in keep]
    if MISSING:
        # 只补 manifest 里还没有的（磁盘上可能有孤儿文件，重跑一次补上元数据）
        mpath0 = os.path.join(OUT, '_manifest.json')
        have = set()
        if os.path.exists(mpath0):
            old = json.load(open(mpath0, encoding='utf-8'))
            have = {r['id'] for r in old.get('items', []) if 'error' not in r}
        todo = [i for i in todo if i['id'] not in have]
    if OFFSET:
        todo = todo[OFFSET:]
    if LIMIT:
        todo = todo[:LIMIT]

    clear()
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0

    mpath = os.path.join(OUT, '_manifest.json')
    prev = {}
    if os.path.exists(mpath):
        try:
            old = json.load(open(mpath, encoding='utf-8'))
            prev = {it['id']: it for it in old.get('items', []) if 'error' not in it}
        except Exception:
            prev = {}

    rows = []
    t_all = time.time()
    for i, it in enumerate(todo, 1):
        ident = it['id']
        if SKIP and os.path.exists(os.path.join(OUT, it['cat'], ident + '.glb')):
            continue
        t0 = time.time()
        rec = dict(id=ident, cat=it['cat'], family=it.get('family'), name=it.get('name'), variant=it.get('variant'))
        try:
            M = Model2(ident)
            families.build(M, it)
            ob = M.build()
            info = measure(ob)
            rec.update(info)
            rec['check'] = mesh_check(ob)
            rec['mats_list'] = [s.material.name for s in ob.material_slots if s.material]
            rec['palette'] = sorted({m[0] for m in M.mats})
            cols = [P.get(k, (0.8, 0.8, 0.8)) for k in rec['palette']]
            hsv = [colorsys.rgb_to_hsv(*c) for c in cols]
            rec['style'] = dict(sat_mean=round(sum(x[1] for x in hsv) / len(hsv), 3),
                                val_mean=round(sum(x[2] for x in hsv) / len(hsv), 3),
                                warm_ratio=round(sum(1 for x in hsv if x[0] < 0.14 or x[0] > 0.92) / len(hsv), 3),
                                colors=len(cols))
            d = os.path.join(OUT, it['cat'])
            os.makedirs(d, exist_ok=True)
            path = os.path.join(d, ident + '.glb')
            for o in bpy.context.selected_objects:
                o.select_set(False)
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                                      export_apply=True, export_yup=True, export_normals=True,
                                      export_texcoords=True, export_materials='EXPORT')
            rec['glb'] = f"models2/{it['cat']}/{ident}.glb"
            rec['glb_kb'] = round(os.path.getsize(path) / 1024, 1)
            rec['ms'] = round((time.time() - t0) * 1000)
            bpy.data.objects.remove(ob, do_unlink=True)
            rows.append(rec)
            flag = '' if rec['check']['verdict'] == 'pass' else '  ⚠' + str(rec['check'])
            print(f'[{i:4d}/{len(todo)}] {ident[:34]:34s} {info["tris"]:6d}t '
                  f'{info["size"][0]:5.1f}x{info["size"][1]:4.1f}x{info["size"][2]:4.1f}m '
                  f'{rec["glb_kb"]:6.0f}KB {rec["ms"]:4d}ms{flag}')
        except Exception as e:
            rec['error'] = f'{type(e).__name__}: {e}'
            rec['trace'] = traceback.format_exc()[-700:]
            rows.append(rec)
            print(f'[{i:4d}/{len(todo)}] ERR {ident[:40]}: {e}')

    # 合并 manifest
    merged = dict(prev)
    for r in rows:
        merged[r['id']] = r
    items = list(merged.values())
    ok = [r for r in items if 'error' not in r]
    bad = [r for r in items if 'error' in r]
    failed_check = [r for r in ok if r.get('check', {}).get('verdict') != 'pass']
    manifest = dict(
        project='deepseeks-world', style='Ghibli / 煤炭镇 手绘水粉 · v2 精模',
        units='m', forward='+Z', origin='底部中心',
        generated_at=time.strftime('%Y-%m-%dT%H:%M:%S'), blender=bpy.app.version_string,
        total=len(items), ok=len(ok), failed=len(bad), check_failed=len(failed_check),
        total_tris=sum(r.get('tris', 0) for r in ok),
        by_cat={},
        items=sorted(items, key=lambda r: (r['cat'], r['id'])),
    )
    for r in ok:
        manifest['by_cat'][r['cat']] = manifest['by_cat'].get(r['cat'], 0) + 1
    os.makedirs(OUT, exist_ok=True)
    json.dump(manifest, open(mpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'\n=== 本批 {len(rows)} 件，累计 {len(ok)}/{len(items)} ok，'
          f'{manifest["total_tris"]} 三角面，{round(time.time() - t_all, 1)}s ===')
    print('manifest:', mpath)
    if failed_check:
        print('体检未过:', [r['id'] for r in failed_check][:15])
    if bad:
        print('失败:', [(r['id'], r['error']) for r in bad][:10])


main()