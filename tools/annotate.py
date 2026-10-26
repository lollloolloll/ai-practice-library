"""스토리보드의 표시(번호 동그라미 + 상자)를 원본 캡처 위에 그려요.

사용: python -I tools/annotate.py analyses/crack analyses/habitica

<대상>/ui/storyboard.json을 읽어 ui/annotated/<원본 이름>.jpg(작은 그림은 thumbs/)로 저장하고,
각 장면에 "annotated" 경로를 적어 넣어요. 원본은 건드리지 않아요.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RED = (255, 59, 48)


def font(size):
    for name in ('arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def draw(src, dst, marks):
    im = Image.open(src).convert('RGB')
    W, H = im.size
    scale = W / 1440 if W >= 1000 else W / 390 * 0.7
    lw, r = max(3, round(4 * scale)), round(17 * scale)
    f = font(round(20 * scale))
    d = ImageDraw.Draw(im)
    for m in marks:
        x, y, w, h = m['box']
        d.rounded_rectangle([x, y, x + w, y + h], radius=round(6 * scale), outline=RED, width=lw)
        cx = min(max(x, r + 2), W - r - 2)
        cy = min(max(y, r + 2), H - r - 2)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=RED, outline=(255, 255, 255), width=max(2, lw // 2))
        d.text((cx, cy), str(m['n']), fill=(255, 255, 255), font=f, anchor='mm')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, quality=86, optimize=True)
    th = os.path.join(os.path.dirname(dst), 'thumbs', os.path.basename(dst))
    os.makedirs(os.path.dirname(th), exist_ok=True)
    im.thumbnail((240, 240))
    im.save(th, quality=80, optimize=True)


def main(targets):
    for t in targets:
        base = os.path.join(ROOT, t)
        p = os.path.join(base, 'ui', 'storyboard.json')
        with open(p, encoding='utf-8') as fh:
            sb = json.load(fh)
        for s in sb['scenes']:
            name = os.path.splitext(os.path.basename(s['image']))[0] + '.jpg'
            s['annotated'] = 'ui/annotated/' + name
            s['thumb'] = 'ui/annotated/thumbs/' + name
            draw(os.path.join(base, s['image']), os.path.join(base, s['annotated']), s['marks'])
        with open(p, 'w', encoding='utf-8') as fh:
            json.dump(sb, fh, ensure_ascii=False, indent=1)
            fh.write('\n')
        print(t, len(sb['scenes']), 'scenes')


if __name__ == '__main__':
    main(sys.argv[1:] or ['analyses/crack', 'analyses/habitica'])
