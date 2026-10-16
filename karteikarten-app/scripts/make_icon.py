# Erzeugt App-Icon, Android-Icons, Splash und Favicon: python3 scripts/make_icon.py assets (benötigt Pillow)
import sys
from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1]
S = 4  # Supersampling
LAPIS = (31, 63, 143)
LAPIS_DEEP = (20, 40, 98)
PAPER = (248, 249, 246)
PAPER_BACK = (201, 211, 238)
GOLD = (226, 185, 76)
INK = (31, 63, 143)

def card(size, fill, lines, rot, mono=False):
    w, h = size
    pad = 40 * S
    im = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([pad, pad, pad + w, pad + h], radius=int(w * 0.09), fill=fill)
    if lines and not mono:
        lw = int(h * 0.075)
        x0 = pad + int(w * 0.14)
        d.rounded_rectangle([x0, pad + int(h * 0.24), x0 + int(w * 0.62), pad + int(h * 0.24) + lw], radius=lw // 2, fill=INK)
        d.rounded_rectangle([x0, pad + int(h * 0.42), x0 + int(w * 0.42), pad + int(h * 0.42) + lw], radius=lw // 2, fill=INK + (110,))
        # Trennlinie zwischen Frage und Antwort
        d.line([pad + int(w * 0.14), pad + int(h * 0.64), pad + int(w * 0.86), pad + int(h * 0.64)], fill=GOLD, width=int(h * 0.025))
    return im.rotate(rot, resample=Image.BICUBIC, expand=True)

def badge(r, mono=False):
    im = Image.new("RGBA", (2 * r, 2 * r), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([0, 0, 2 * r - 1, 2 * r - 1], fill=(255, 255, 255) if mono else GOLD)
    w = int(r * 0.26)
    stroke = (0, 0, 0, 0) if mono else LAPIS_DEEP
    pts = [(r * 0.52, r * 1.02), (r * 0.86, r * 1.36), (r * 1.48, r * 0.70)]
    d.line(pts, fill=stroke, width=w, joint="curve")
    for x, y in (pts[0], pts[2]):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=stroke)
    if mono:
        mask = Image.new("L", im.size, 0)
        md = ImageDraw.Draw(mask)
        md.ellipse([0, 0, 2 * r - 1, 2 * r - 1], fill=255)
        md.line(pts, fill=0, width=w, joint="curve")
        for x, y in (pts[0], pts[2]):
            md.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=0)
        im = Image.new("RGBA", im.size, (255, 255, 255, 0))
        im.putalpha(mask)
    return im

def compose(canvas, scale, bg, mono=False):
    W = canvas * S
    if bg:
        im = Image.new("RGBA", (W, W), LAPIS + (255,))
        glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse([W * 0.05, -W * 0.45, W * 0.95, W * 0.55], fill=(70, 110, 205, 90))
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(W * 0.2)))
    else:
        im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    cw, ch = int(W * 0.56 * scale), int(W * 0.40 * scale)
    shadow_col = (0, 0, 0, 0) if mono else (8, 16, 45, 120)
    back = card((cw, ch), (255, 255, 255, 140) if mono else PAPER_BACK, False, 12, mono)
    front = card((cw, ch), (255, 255, 255) if mono else PAPER, True, -5, mono)
    cx, cy = W // 2, W // 2
    for layer, dx, dy in ((back, -0.05, -0.07), (front, 0.02, 0.05)):
        px = int(cx + dx * W * scale - layer.width / 2)
        py = int(cy + dy * W * scale - layer.height / 2)
        if not mono:
            sh = Image.new("RGBA", layer.size, (0, 0, 0, 0))
            sh.paste(shadow_col, mask=layer.split()[3])
            im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(W * 0.018)), (px, py + int(W * 0.02)))
        im.alpha_composite(layer, (px, py))
    b = badge(int(W * 0.12 * scale), mono)
    bx, by = int(cx + W * 0.20 * scale - b.width / 2), int(cy + W * 0.22 * scale - b.height / 2)
    if mono:
        # Abstand um das Häkchen-Abzeichen ausstanzen, damit es sich von der Karte abhebt
        gap = int(b.width * 0.08)
        alpha = im.split()[3]
        ImageDraw.Draw(alpha).ellipse([bx - gap, by - gap, bx + b.width + gap, by + b.height + gap], fill=0)
        im.putalpha(alpha)
    im.alpha_composite(b, (bx, by))
    return im.resize((canvas, canvas), Image.LANCZOS)

compose(1024, 1.0, True).convert("RGB").save(f"{out}/icon.png")
compose(1024, 1.0, False).save(f"{out}/splash-icon.png")
compose(512, 0.62, False).save(f"{out}/android-icon-foreground.png")
Image.new("RGBA", (512, 512), LAPIS + (255,)).save(f"{out}/android-icon-background.png")
compose(432, 0.62, False, mono=True).save(f"{out}/android-icon-monochrome.png")
compose(192, 1.0, True).resize((48, 48), Image.LANCZOS).save(f"{out}/favicon.png")
