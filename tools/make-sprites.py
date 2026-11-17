"""把 dsh-pet 的官方立绘切成游戏用的三向贴图。

源图：C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\dsh-pet\\assets\\main-character.png
     1920x1072 的一张 RGB 图，白底 + 底部一条灰影，上面并排三只：
       fig1 x121-685（最宽、浅色最多 → 正面）
       fig2 x739-1218（侧面）
       fig3 x1252-1785（最蓝、最窄 → 背面）

做法：按列密度找出三只 → 各裁一块 → 从四边泛洪抠掉白底和灰影 → 统一缩到 512x768、
脚底贴底边 → 存成透明 PNG。顺带记一张 palette.json 给引擎/文档参考。

用法：python tools/make-sprites.py
"""
import json
import os
from collections import Counter, deque

from PIL import Image

SRC = r'C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-pet\assets\main-character.png'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'figures')
TARGET_W, TARGET_H = 512, 768
# 输出的名字：正面 / 侧面 / 背面
ORDER = ['front', 'side', 'back']


def is_bg(r, g, b):
    """白底，或者底部那条中性灰的投影/台面。"""
    if r > 236 and g > 236 and b > 236:
        return True
    return abs(r - g) < 10 and abs(g - b) < 10 and 118 < r < 205


def find_figures(im, min_width=90, gap=12):
    """按每一列有多少非背景像素，把并排的几个人物切开。"""
    W, H = im.size
    px = im.load()
    cols = []
    for x in range(W):
        c = 0
        for y in range(0, H, 3):
            if not is_bg(*px[x, y]):
                c += 1
        cols.append(c)
    groups = []
    cur = None
    blank = 0
    for x, c in enumerate(cols):
        if c > 3:
            if cur is None:
                cur = [x, x]
            else:
                cur[1] = x
            blank = 0
        elif cur is not None:
            blank += 1
            if blank > gap:
                groups.append(tuple(cur))
                cur = None
    if cur:
        groups.append(tuple(cur))
    return [g for g in groups if g[1] - g[0] >= min_width]


def cut_background(rgba):
    """从四边泛洪，把与边缘连通的背景变透明（人物身上的浅色不会被误伤）。"""
    W, H = rgba.size
    px = rgba.load()
    seen = bytearray(W * H)
    q = deque()

    def bg_at(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and is_bg(r, g, b)

    for x in range(W):
        for y in (0, H - 1):
            if not seen[y * W + x] and bg_at(x, y):
                q.append((x, y))
                seen[y * W + x] = 1
    for y in range(H):
        for x in (0, W - 1):
            if not seen[y * W + x] and bg_at(x, y):
                q.append((x, y))
                seen[y * W + x] = 1
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and bg_at(nx, ny):
                seen[ny * W + nx] = 1
                q.append((nx, ny))
    return rgba


def main():
    os.makedirs(OUT, exist_ok=True)
    im = Image.open(SRC).convert('RGB')
    figures = find_figures(im)
    print('找到人物:', figures)
    if len(figures) < 3:
        raise SystemExit(f'只找到 {len(figures)} 个人物，源图变了吗？')

    palette = {}
    for idx, name in enumerate(ORDER):
        x0, x1 = figures[idx]
        # 上下留 4px 余量再抠
        crop = im.crop((max(0, x0 - 4), 0, min(im.width, x1 + 4), im.height)).convert('RGBA')
        crop = cut_background(crop)
        bbox = crop.getbbox()
        if not bbox:
            print(f'{name}: 抠完是空的，跳过')
            continue
        crop = crop.crop(bbox)
        w, h = crop.size
        scale = TARGET_H / h
        nw = max(1, round(w * scale))
        crop = crop.resize((nw, TARGET_H), Image.LANCZOS)

        # 太宽的话按比例缩一下，别让立牌比身高还宽
        if nw > TARGET_W - 8:
            s2 = (TARGET_W - 8) / nw
            nw = TARGET_W - 8
            crop = crop.resize((nw, TARGET_H), Image.LANCZOS)

        canvas = Image.new('RGBA', (TARGET_W, TARGET_H), (0, 0, 0, 0))
        canvas.paste(crop, ((TARGET_W - nw) // 2, 0), crop)
        canvas.save(os.path.join(OUT, f'whalechan-{name}.png'))
        print(f'{name}: 源 x{x0}-{x1} 裁出 {w}x{h} → {nw}x{TARGET_H}')

        px = canvas.load()
        c = Counter()
        for y in range(0, TARGET_H, 2):
            for x in range(0, TARGET_W, 2):
                r, g, b, a = px[x, y]
                if a > 200:
                    c[(r // 24 * 24, g // 24 * 24, b // 24 * 24)] += 1
        palette[name] = [f'#{r:02x}{g:02x}{b:02x}' for (r, g, b), _ in c.most_common(8)]

    with open(os.path.join(OUT, 'palette.json'), 'w', encoding='utf-8') as f:
        json.dump({'source': 'dsh-pet/assets/main-character.png', **palette}, f, indent=1, ensure_ascii=False)
    print('palette:', json.dumps(palette, ensure_ascii=False))


if __name__ == '__main__':
    main()