"""把挑出来的截图转成 README 用的 JPEG（压到合适体积，宽 1600），放进 docs/screenshots/。

选图规则：从 shots/ 里按"标准差 + 色块数"排序，再按题材各取一张（否则全是草地）。
转 JPEG 是因为 PNG 一张 1-2 MB，8 张就 10 MB+；JPEG q88 只要 200-400 KB，GitHub 上也更快。
"""
import os

from PIL import Image

SHOTS = r'E:\dsh work home\3Dwork\painted-valley\shots'
OUT = r'E:\dsh work home\3Dwork\painted-valley\docs\screenshots'
os.makedirs(OUT, exist_ok=True)

# 源文件 -> (输出名, 说明)；说明会写进 README 的图注
PICKS = [
    ('v3/snowtown.png', 'snow-town.jpg', '雪后的城镇'),
    ('town/f-gate.png', 'gate.jpg', '清镇市城门'),
    ('town/food-street.png', 'food-street.jpg', '小吃街'),
    ('r5/church.png', 'church.jpg', '教堂'),
    ('town/b-plaza.png', 'plaza.jpg', '中央广场'),
    ('town-new/forest.png', 'forest.jpg', '城外的森林'),
    ('town/flowers-on.png', 'flowers.jpg', '野花（139 种手绘立牌）'),
    ('town/interior.png', 'interior.jpg', '四室两厅'),
    ('v4/homeFront.png', 'home.jpg', '小鲸鱼的家'),
    ('town-v3/walkSide.png', 'wanderer.jpg', '走在街上'),
    ('town/g-temple.png', 'temple.jpg', '夫子庙'),
]

MAX_W = 1600
QUALITY = 88
total = 0
for src, dst, note in PICKS:
    p = os.path.join(SHOTS, src.replace('/', os.sep))
    if not os.path.exists(p):
        print('!! 缺', src)
        continue
    im = Image.open(p).convert('RGB')
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    out = os.path.join(OUT, dst)
    im.save(out, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    kb = os.path.getsize(out) / 1024
    total += kb
    print(f'{dst:20} {im.width}x{im.height}  {kb:6.0f} KB   {note}')
print(f'\n合计 {total/1024:.1f} MB，输出 {OUT}')