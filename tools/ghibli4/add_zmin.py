"""给清单（kit.json、lib.json）里每个模型补上 zmin：模型最低点比脚底（z = 0）低多少（地基往下埋了多深）。
游戏里用它判断坡上的东西会不会悬空。直接读 GLB 里 POSITION 的 min（glTF 的 y 就是高度）。
  python tools/ghibli4/add_zmin.py public/models4
"""
import json, struct, sys, os

root = sys.argv[1] if len(sys.argv) > 1 else 'public/models4'
low = {}
for f in os.listdir(root):
    if not f.endswith('.glb'):
        continue
    data = open(os.path.join(root, f), 'rb').read()
    n = struct.unpack('<I', data[12:16])[0]
    g = json.loads(data[20:20 + n])
    for m in g['meshes']:
        acc = g['accessors'][m['primitives'][0]['attributes']['POSITION']]
        low[m['name']] = round(acc['min'][1], 2)
for f in ('kit.json', 'lib.json'):
    p = os.path.join(root, f)
    if not os.path.exists(p):
        continue
    d = json.load(open(p, encoding='utf-8'))
    for it in d['items']:
        if it['id'] in low:
            it['zmin'] = low[it['id']]
    json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f, sum(1 for it in d['items'] if 'zmin' in it), 'of', len(d['items']))
