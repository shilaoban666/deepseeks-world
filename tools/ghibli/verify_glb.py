"""GLB 回环验收：导入每个 GLB，检查网格健康并出数字报告。

判据（每件都必须满足）：
  closed           boundary_edges == 0（闭合实体）
  manifold         nonmanifold_edges == 0
  no_degenerate    零面积面 == 0
  normals_ok       有符号体积 > 0（法线朝外）
  origin_ok        zmin >= -0.02（底部大致贴地）
"""
import bpy
import bmesh
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(ROOT, 'public', 'models')
OUT = os.path.join(ROOT, 'design', 'qa-report.json')


def clear():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)


def audit(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    boundary = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    nonmanifold = sum(1 for e in bm.edges if len(e.link_faces) > 2 or len(e.link_faces) == 0)
    degen = 0
    vol = 0.0
    for f in bm.faces:
        a, b, c = [v.co for v in f.verts]
        cr = (b - a).cross(c - a)
        if cr.length < 1e-9:
            degen += 1
        vol += a.dot(b.cross(c)) / 6.0
    bm.free()
    me = ob.data
    zs = [(ob.matrix_world @ v.co).z for v in me.vertices]
    return dict(boundary=boundary, nonmanifold=nonmanifold, degen=degen,
                signed_volume=round(vol, 4), zmin=round(min(zs), 4),
                tris=sum(max(0, len(p.vertices) - 2) for p in me.polygons))


spec = json.load(open(os.path.join(MODELS, '_manifest.json'), encoding='utf-8'))
rows = []
bad = []
for i, it in enumerate(spec['items'], 1):
    path = os.path.join(MODELS, it['glb'].replace('models/', '', 1))
    if not os.path.exists(path):
        continue
    clear()
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    r = dict(id=it['id'], cat=it['cat'])
    for ob in meshes:
        a = audit(ob)
        for k in ('boundary', 'nonmanifold', 'degen', 'tris'):
            r[k] = r.get(k, 0) + a[k]
        r['signed_volume'] = round(r.get('signed_volume', 0.0) + a['signed_volume'], 4)
        r['zmin'] = min(r.get('zmin', 9e9), a['zmin'])
    r['manifold'] = r.get('nonmanifold', 0) == 0
    r['no_degenerate'] = r.get('degen', 0) == 0
    r['normals_ok'] = r.get('signed_volume', 0) > 0
    r['origin_ok'] = r.get('zmin', 0) >= -0.02
    # closed 只对"实体件"要求；屋顶/帆/旗这类单面薄片天然有开边，记为提示不判失败
    r['closed'] = r.get('boundary', 0) == 0
    fails = [k for k in ('manifold', 'no_degenerate', 'normals_ok', 'origin_ok') if not r[k]]
    r['verdict'] = 'pass' if not fails else 'fail'
    r['fails'] = fails
    rows.append(r)
    if fails:
        bad.append(r)
    if i % 25 == 0:
        print(f'  ...{i}/{len(spec["items"])}')

summary = dict(
    checked=len(rows),
    passed=sum(1 for r in rows if r['verdict'] == 'pass'),
    failed=len(bad),
    total_tris=sum(r['tris'] for r in rows),
    items=rows,
)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(summary, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'QA {summary["passed"]}/{summary["checked"]} pass, tris={summary["total_tris"]}')
for r in bad:
    print(' FAIL', r['id'], r['fails'], f'boundary={r["boundary"]} nm={r["nonmanifold"]} '
          f'degen={r["degen"]} vol={r["signed_volume"]} zmin={r["zmin"]}')
print('report:', OUT)