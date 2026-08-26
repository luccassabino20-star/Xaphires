# Gera os ícones do PWA a partir do mesmo desenho do favicon.svg (quadrado
# arredondado + "X" serifado) - script de uso único, não faz parte do build.
# Cores fixas (navy da marca), diferente do favicon que responde a
# prefers-color-scheme: ícone de PWA é um PNG estático, sem CSS por trás.
from PIL import Image, ImageDraw, ImageFont

BG = (16, 31, 71, 255)       # #101f47 - navy da marca (registry.js BRAND)
FG = (255, 255, 255, 255)
FONT_PATH = r"C:\Windows\Fonts\georgiab.ttf"

def rounded_square(size, radius_pct, bg):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * radius_pct)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=bg)
    return img, draw

def draw_x(draw, size, fg, scale=0.62):
    font_size = int(size * scale)
    font = ImageFont.truetype(FONT_PATH, font_size)
    text = "X"
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - w) / 2 - bbox[0]
    y = (size - h) / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=fg)

def gerar(path, size, radius_pct, safe_zone=False):
    img, draw = rounded_square(size, radius_pct, BG)
    scale = 0.62 if not safe_zone else 0.42  # maskable: ícone menor, dentro da safe zone (~80% central)
    draw_x(draw, size, FG, scale=scale)
    img.save(path)
    print("gerado:", path, img.size)

out = r"C:\Users\Lucas\Desktop\projeto one\public\icons"
gerar(f"{out}\\icon-192.png", 192, 0.22)
gerar(f"{out}\\icon-512.png", 512, 0.22)
gerar(f"{out}\\icon-maskable-512.png", 512, 0.0, safe_zone=True)  # maskable preenche o quadrado todo (o SO aplica a máscara)
# apple-touch-icon: iOS arredonda os cantos sozinho e não lida bem com alfa
# nos cantos - quadrado 0% de raio, sem transparência, achatado sobre o navy.
img_apple, draw_apple = rounded_square(180, 0.0, BG)
draw_x(draw_apple, 180, FG, scale=0.6)
img_apple.convert("RGB").save(f"{out}\\apple-touch-icon.png")
print("gerado:", f"{out}\\apple-touch-icon.png", img_apple.size)
