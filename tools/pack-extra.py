"""把素材库里能直接用进游戏的精灵打成两页图集，追加到 public/textures/plants/plants.json。

  fish  : 120 种鱼（钓鱼的收获、图鉴、水下鱼群）
  farm  : 30 种田间作物 + 30 种收获物 + 50 种结果期果树（菜地、果园、背包图标）

每个精灵先裁到不透明像素的包围盒（这样立牌的底边就是地面），再按长边缩进格子、底边对齐。
UV 和 pack-atlas.py 一样：v 轴翻转、留 1px 内边距。

用法：py -3.11 tools/pack-extra.py
"""
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets', 'sprites')
OUT = os.path.join(ROOT, 'public', 'textures', 'plants')
ATLAS = 2048


def tight(path):
    im = Image.open(path).convert('RGBA')
    box = im.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
    return im.crop(box) if box else im


def pack(items, name, cols):
    cell = ATLAS // cols
    sheet = Image.new('RGBA', (ATLAS, ATLAS), (0, 0, 0, 0))
    sprites = []
    for i, (key, path) in enumerate(items):
        im = tight(path)
        k = (cell - 4) / max(im.width, im.height)
        w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
        im = im.resize((w, h), Image.LANCZOS)
        cx, cy = (i % cols) * cell, (i // cols) * cell
        x = cx + (cell - w) // 2
        y = cy + cell - 2 - h  # 底边对齐
        sheet.alpha_composite(im, (x, y))
        sprites.append({
            'name': key,
            'u0': round((x - 0.5 + 1) / ATLAS, 5), 'u1': round((x + w - 1 + 0.5) / ATLAS, 5),
            'v0': round(1 - (y + h - 1 + 0.5) / ATLAS, 5), 'v1': round(1 - (y - 0.5 + 1) / ATLAS, 5),
            'w': w, 'h': h,
        })
    sheet.save(os.path.join(OUT, f'{name}.png'), optimize=True)
    return {'atlas': f'{name}.png', 'sprites': sprites}


fish_dir = os.path.join(ASSETS, 'fish')
fish = [(f[:-4], os.path.join(fish_dir, f)) for f in sorted(os.listdir(fish_dir)) if f.endswith('.png') and not f.startswith('contact')]

farm = []
for sub, prefix in (('farm/crops/plant', 'plant-'), ('farm/crops/produce', 'produce-'), ('orchard/trees', 'orchard-')):
    d = os.path.join(ASSETS, sub)
    farm += [(prefix + f[:-4], os.path.join(d, f)) for f in sorted(os.listdir(d)) if f.endswith('.png')]

# 生活：鸟（天上飞的、湖上游的、广场上走的）、街景小物、车和船。都是手绘风的透明精灵，挑和小镇搭的。
LIFE = {
    'birds': ['house-sparrow', 'tree-sparrow', 'great-tit', 'robin', 'magpie', 'barn-swallow', 'common-swift', 'kingfisher',
              'mallard', 'mute-swan', 'mandarin-duck', 'greylag-goose', 'grey-heron', 'little-egret', 'black-headed-gull',
              'herring-gull', 'rock-pigeon', 'collared-dove', 'carrion-crow'],
    'infra': ['flower-bed', 'planter-box', 'urn-planter', 'hanging-basket', 'mailbox', 'phone-booth', 'notice-board', 'festoon-pole',
              'stone-lantern', 'parasol', 'swing-set', 'slide', 'seesaw', 'merry-go-round', 'street-clock', 'weather-vane',
              'fire-hydrant', 'topiary', 'gazebo', 'pergola', 'picnic-table', 'sundial', 'stone-well', 'water-pump', 'market-stall',
              'kiosk', 'lantern-post', 'hanging-lantern', 'bike-rack', 'litter-bin', 'sandbox', 'rocking-horse'],
    'transport': ['city-bicycle', 'cargo-bike', 'scooter', 'vintage-motorbike', 'rowboat', 'sailboat', 'fishing-boat', 'sampan',
                  'junk-boat', 'small-ferry', 'kayak', 'canoe', 'wheelbarrow', 'handcart', 'ox-cart'],
}
life = [(f'{group}-{name}', os.path.join(ASSETS, group, name + '.png')) for group, names in LIFE.items() for name in names]

manifest_path = os.path.join(OUT, 'plants.json')
manifest = json.load(open(manifest_path, encoding='utf-8'))
manifest['fish'] = [pack(fish, 'fish', 11)]
manifest['farm'] = [pack(farm, 'farm', 11)]
manifest['life'] = [pack(life, 'life', 9)]
json.dump(manifest, open(manifest_path, 'w', encoding='utf-8', newline=chr(10)), ensure_ascii=False, indent=1)
print('fish', len(fish), 'farm', len(farm), 'life', len(life))
