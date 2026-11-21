"""把一个目录里的截图拼成几张总览（每张 cols × rows 格，角上写文件名）。 python tools/montage.py shots/dress/qa1 [cols rows cellw]"""
import os, sys
from PIL import Image, ImageDraw
d = sys.argv[1]
cols, rows, cw = (int(v) for v in (sys.argv[2:5] + ['3', '3', '620'][len(sys.argv) - 2:]))
files = sorted(f for f in os.listdir(d) if f.endswith('.png') and not f.startswith('sheet'))
for n in range(0, len(files), cols * rows):
    part = files[n:n + cols * rows]
    im0 = Image.open(os.path.join(d, part[0]))
    ch = round(cw * im0.height / im0.width)
    sheet = Image.new('RGB', (cols * cw, rows * ch), (30, 30, 30))
    for k, f in enumerate(part):
        im = Image.open(os.path.join(d, f)).convert('RGB').resize((cw, ch), Image.LANCZOS)
        sheet.paste(im, ((k % cols) * cw, (k // cols) * ch))
        dr = ImageDraw.Draw(sheet)
        dr.rectangle([(k % cols) * cw, (k // cols) * ch, (k % cols) * cw + 8 * len(f), (k // cols) * ch + 14], fill=(0, 0, 0))
        dr.text(((k % cols) * cw + 3, (k // cols) * ch + 1), f[:-4], fill=(255, 255, 120))
    out = os.path.join(d, 'sheet-%d.jpg' % (n // (cols * rows)))
    sheet.save(out, quality=88)
    print(out)
