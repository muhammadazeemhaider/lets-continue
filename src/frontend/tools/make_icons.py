"""Generate the pixel-art app icons (night sky, rising sun, hills). Run from src/frontend: python tools/make_icons.py"""
from pathlib import Path

from PIL import Image

N = 32  # logical pixel grid
SKY_TOP, SKY_BOTTOM = (8, 12, 40), (240, 150, 110)
HILLS = [((52, 36, 96), 20, 4, 0.55), ((30, 22, 64), 24, 3, 0.9)]  # colour, base row, amplitude, phase


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def build() -> Image.Image:
    img = Image.new("RGB", (N, N))
    px = img.load()
    for y in range(N):
        for x in range(N):
            px[x, y] = lerp(SKY_TOP, SKY_BOTTOM, (y / (N - 1)) ** 1.4)
    # stars
    for x, y in [(4, 4), (10, 2), (24, 5), (27, 3), (16, 7), (7, 9)]:
        px[x, y] = (230, 234, 255)
    # sun
    cx, cy, r = 16, 17, 7
    for y in range(N):
        for x in range(N):
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            if d2 <= r * r:
                px[x, y] = (255, 190, 94) if d2 > (r - 2) ** 2 else (255, 228, 140)
    # hills
    import math
    for colour, base, amp, ph in HILLS:
        for x in range(N):
            top = base + round(math.sin(x * 0.45 + ph * 6) * amp / 2)
            for y in range(top, N):
                px[x, y] = colour
    return img


def main():
    out = Path(__file__).resolve().parents[1] / "icons"
    out.mkdir(exist_ok=True)
    base = build()
    for size in (180, 192, 512):
        base.resize((size, size), Image.NEAREST).save(out / f"icon-{size}.png")
    print("wrote", sorted(p.name for p in out.glob("*.png")))


if __name__ == "__main__":
    main()
