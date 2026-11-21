"""图集去色边：立牌（树、花、鸟、街景）的轮廓上有一圈粉紫色——抠图时底色渗进了边缘的像素。
游戏里它就是每棵树外面那一圈粉边，手绘的感觉一下就破了。

  py -3 tools/defringe-atlas.py                 # 处理 public/textures/plants/*.png（原地改）
  py -3 tools/defringe-atlas.py --check         # 只量不改：每张图边缘有多少"偏粉"的像素
  py -3 tools/defringe-atlas.py a.png b.png     # 指定文件

做法：轮廓往里三个像素之内的半透明像素、和偏品红的不透明像素，颜色换成离它最近的"里面的"像素的颜色；
全透明的像素也填上最近的颜色（不然缩小、过滤的时候黑色或底色又会渗回来）。alpha 不动，形状一点不变。
重新打图集（tools/pack-extra.py、slice-plants.py）之后要再跑一遍。
"""
import glob
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
args = [a for a in sys.argv[1:] if not a.startswith('--')]
CHECK = '--check' in sys.argv
files = args or sorted(glob.glob(os.path.join(ROOT, 'public', 'textures', 'plants', '*.png')))
RIM = 3  # 轮廓往里几个像素算"边"


def fringe_of(a):
    """哪些像素的颜色不可信：边上的半透明像素，和边上偏品红（红、蓝都压过绿）的像素。"""
    alpha = a[:, :, 3]
    r, g, b = (a[:, :, i].astype(np.int32) for i in range(3))
    inside = alpha >= 128
    core = ndimage.binary_erosion(inside, iterations=RIM)
    rim = inside & ~core
    magenta = (r > g + 18) & (b > g - 6) & (r > 60)
    return (alpha > 0) & ((alpha < 250) | (rim & magenta)), rim, magenta


for path in files:
    a = np.asarray(Image.open(path).convert('RGBA')).copy()
    alpha = a[:, :, 3]
    bad, rim, magenta = fringe_of(a)
    share = (rim & magenta).sum() / max(1, rim.sum())
    name = os.path.relpath(path, ROOT)
    if CHECK:
        print(f'{name}: 边缘像素 {int(rim.sum())}，其中偏粉 {share:.1%}')
        continue
    good = (alpha >= 250) & ~bad
    if not good.any():
        print(f'{name}: 没有不透明的像素，跳过')
        continue
    # 每个像素最近的"好"像素在哪：颜色从那儿拿
    idx = ndimage.distance_transform_edt(~good, return_distances=False, return_indices=True)
    take = bad | (alpha == 0)
    for c in range(3):
        ch = a[:, :, c]
        ch[take] = ch[idx[0][take], idx[1][take]]
    Image.fromarray(a, 'RGBA').save(path, optimize=True)
    after = fringe_of(a)
    print(f'{name}: 边缘偏粉 {share:.1%} → {(after[1] & after[2]).sum() / max(1, after[1].sum()):.1%}，改了 {int(bad.sum())} 个像素')
