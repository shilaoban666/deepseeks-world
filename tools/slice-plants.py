"""把 17 张"植物图集页"自动切成单个植物精灵。

做法：
  1) 品红幕布 → 用 numpy 算掩码（min(r,b)-g <= 阈值 就是物体）
  2) 游程 + 并查集找连通块（比逐像素 BFS 快两个数量级），过滤掉太小/太大的块
  3) 每块裁出来 → 软键抠品红 + 去溢色 → 裁到 alpha 包围盒 → 缩到最长边 256 → 底边对齐贴进 256×256
  4) 出对照表（花 / 树各一张）+ manifest.json

用法：python tools/slice-plants.py
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE = r'E:\dsh work home\3Dwork\dsh-image-gen'
OUT = os.path.join(BASE, 'plants')
FLOWER_DIR = os.path.join(OUT, 'flowers')
TREE_DIR = os.path.join(OUT, 'trees')
for d in (OUT, FLOWER_DIR, TREE_DIR):
    os.makedirs(d, exist_ok=True)

SHEETS = {
    'flowers': [
        ('image-b223bc44.png', '野花', 16),
        ('image-c6b35a50.png', '庭院花', 16),
        ('image-e054f433.png', '夏日花', 16),
        ('image-76e01589.png', '山野花', 16),
        ('image-606f673a.png', '水边花', 16),
        ('image-e210f019.png', '秋花', 16),
        ('image-b63a6fe7.png', '早春花', 16),
        ('image-355e593e.png', '香草花', 16),
    ],
    'trees': [
        ('image-4f66da50.png', '阔叶林', 12),
        ('image-ef4992b0.png', '针叶林', 12),
        ('image-0427fb69.png', '果木', 12),
        ('image-a4d85a5f.png', '热带', 12),
        ('image-9d3cde0c.png', '河岸', 12),
        ('image-045d57f7.png', '日本山林', 12),
        ('image-760b88b6.png', '灌木小树', 12),
        ('image-9668c10f.png', '旱地', 12),
        ('image-cdb478df.png', '造型树', 12),
    ],
}
CANVAS = 256
MAGENTA = 60  # min(r,b)-g 超过它就是品红背景


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def components(mask):
    """游程 + 并查集的连通块标记。返回 int32 标记图（0 = 背景）。"""
    H, W = mask.shape
    parent = []

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    prev = []
    rows = []
    for y in range(H):
        row = mask[y].astype(np.int8)
        edges = np.flatnonzero(np.diff(np.concatenate(([0], row, [0]))))
        runs = [(edges[k], edges[k + 1] - 1) for k in range(0, len(edges), 2)]
        cur = []
        j = 0
        for s, e in runs:
            lab = None
            while j < len(prev) and prev[j][1] < s:
                j += 1
            k = j
            while k < len(prev) and prev[k][0] <= e:
                pl = find(prev[k][2])
                if lab is None:
                    lab = pl
                else:
                    union(lab, pl)
                k += 1
            if lab is None:
                lab = len(parent)
                parent.append(lab)
            cur.append((s, e, lab))
        rows.append(cur)
        prev = cur

    out = np.zeros((H, W), dtype=np.int32)
    for y, cur in enumerate(rows):
        for s, e, lab in cur:
            out[y, s:e + 1] = find(lab) + 1
    return out


def key_out(rgb):
    """软键抠品红 + 去溢色，返回 RGBA（numpy）。"""
    a = rgb.astype(np.float32)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    m = np.minimum(r, b) - g
    alpha = 1.0 - smoothstep(18, 95, m)
    spill = np.maximum(0.0, m) * (1.0 - alpha) * 0.9
    out = np.empty((rgb.shape[0], rgb.shape[1], 4), dtype=np.uint8)
    out[:, :, 0] = np.clip(r - spill, 0, 255).astype(np.uint8)
    out[:, :, 1] = np.clip(g, 0, 255).astype(np.uint8)
    out[:, :, 2] = np.clip(b - spill, 0, 255).astype(np.uint8)
    out[:, :, 3] = (alpha * 255).astype(np.uint8)
    return out


font = None
for cand in [r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\simhei.ttf']:
    if os.path.exists(cand):
        font = ImageFont.truetype(cand, 13)
        break

manifest = {'source': 'dashscope/qwen-image-3.0 生成的植物图集页，本地自动切分', 'flowers': [], 'trees': []}
report = []

for kind, sheets in SHEETS.items():
    outdir = FLOWER_DIR if kind == 'flowers' else TREE_DIR
    prefix = 'flower' if kind == 'flowers' else 'tree'
    index = 0
    print(f'\n===== {kind} =====')
    for fname, cn, expect in sheets:
        p = os.path.join(BASE, fname)
        if not os.path.exists(p):
            print('!! 缺', fname)
            continue
        im = Image.open(p).convert('RGB')
        arr = np.asarray(im).astype(np.int16)
        m = np.minimum(arr[:, :, 0], arr[:, :, 2]) - arr[:, :, 1]
        mask = m <= MAGENTA
        lab = components(mask)
        n_lab = int(lab.max())
        min_area = im.size[0] * im.size[1] * 0.0012
        max_area = im.size[0] * im.size[1] * 0.22
        found = 0
        for k in range(1, n_lab + 1):
            ys, xs = np.where(lab == k)
            area = ys.size
            if area < min_area or area > max_area:
                continue
            pad = 3
            x0, x1 = max(0, xs.min() - pad), min(im.width, xs.max() + pad + 1)
            y0, y1 = max(0, ys.min() - pad), min(im.height, ys.max() + pad + 1)
            crop = np.asarray(im.crop((x0, y0, x1, y1))).astype(np.uint8)
            rgba = key_out(crop)
            # 只保留本连通块（去掉粘连进来的邻块碎屑）
            keep = (lab[y0:y1, x0:x1] == k)
            rgba[~keep & (rgba[:, :, 3] > 0)] = 0
            sprite = Image.fromarray(rgba, 'RGBA')
            bb = sprite.getbbox()
            if not bb:
                continue
            sprite = sprite.crop(bb)
            w, h = sprite.size
            if max(w, h) < 24:
                continue
            scale = (CANVAS - 8) / max(w, h)
            sw, sh = max(1, round(w * scale)), max(1, round(h * scale))
            sprite = sprite.resize((sw, sh), Image.LANCZOS)
            canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
            canvas.paste(sprite, ((CANVAS - sw) // 2, CANVAS - sh), sprite)  # 底边对齐
            index += 1
            name = f'{prefix}-{index:03d}.png'
            canvas.save(os.path.join(outdir, name))
            manifest[kind].append({'file': f'{kind}/{name}', 'sheet': fname, 'group': cn, 'w': w, 'h': h})
            found += 1
        flag = '' if found >= expect * 0.6 else f'  ← 只切出 {found}/{expect}，可能粘连'
        print(f'  {fname}  {cn:6} 期望 {expect:2d}  切出 {found:2d}{flag}')
        report.append((kind, fname, cn, expect, found, n_lab))

with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=1, ensure_ascii=False)

# ---- 对照表 ----
def sheet_image(kind, cols):
    items = manifest[kind]
    if not items:
        return
    cell = 128
    pad = 10
    label = 16
    rows_n = (len(items) + cols - 1) // cols
    W = pad * 2 + cols * cell
    H = pad * 2 + rows_n * (cell + label)
    sheet = Image.new('RGB', (W, H), (238, 236, 230))
    d = ImageDraw.Draw(sheet)
    for i, it in enumerate(items):
        cx, cy = i % cols, i // cols
        x = pad + cx * cell
        y = pad + cy * (cell + label)
        thumb = Image.open(os.path.join(OUT, it['file'])).resize((cell - 6, cell - 6), Image.LANCZOS)
        sheet.paste(thumb, (x, y), thumb)
        if font:
            d.text((x + 2, y + cell - 12), it['file'].split('/')[-1].replace('.png', ''), font=font, fill=(40, 50, 60))
    sheet.save(os.path.join(OUT, f'{kind}-sheet.png'))


sheet_image('flowers', 20)
sheet_image('trees', 16)

nf = len(manifest['flowers'])
nt = len(manifest['trees'])
print(f'\n合计：花 {nf} 个，树 {nt} 个')
print('输出:', OUT)