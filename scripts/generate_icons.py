from PIL import Image, ImageDraw, ImageFont
import os

ICON_SIZE = 48
COLORS = {
    'inactive': '#999999',
    'active': '#5B6CFF',
}

# 用简单几何图形表示 tab 图标
ICONS = {
    'home': [
        # 九宫格
        ('rect', (10, 10, 20, 20)),
        ('rect', (28, 10, 38, 20)),
        ('rect', (10, 28, 20, 38)),
        ('rect', (28, 28, 38, 38)),
    ],
    'batch': [
        # 扫描框 + 线
        ('line', (10, 12, 38, 12)),
        ('line', (10, 36, 38, 36)),
        ('line', (10, 12, 10, 36)),
        ('line', (38, 12, 38, 36)),
        ('line', (14, 24, 34, 24)),
    ],
    'inventory': [
        # 剪贴板
        ('round', (12, 12, 36, 40), 4),
        ('line', (17, 20, 31, 20)),
        ('line', (17, 27, 31, 27)),
        ('line', (17, 34, 31, 34)),
    ],
    'settings': [
        # 齿轮
        ('gear', (24, 24), 16),
    ],
}


def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def draw_icon(draw, commands, color):
    import math
    rgb = hex_to_rgb(color)
    for cmd, *args in commands:
        if cmd == 'polygon':
            draw.polygon(args[0], fill=rgb)
        elif cmd == 'rect':
            draw.rectangle(args[0], fill=rgb)
        elif cmd == 'round':
            bbox, radius = args
            draw.rounded_rectangle(bbox, radius, fill=rgb)
        elif cmd == 'line':
            draw.line(args[0], fill=rgb, width=3)
        elif cmd == 'circle':
            center, radius = args
            bbox = [center[0]-radius, center[1]-radius, center[0]+radius, center[1]+radius]
            if radius > 10:
                draw.ellipse(bbox, outline=rgb, width=3)
            else:
                draw.ellipse(bbox, fill=rgb)
        elif cmd == 'gear':
            center, radius = args
            cx, cy = center
            # 外齿
            for i in range(8):
                angle = math.radians(i * 45)
                x1 = cx + (radius - 2) * math.cos(angle)
                y1 = cy + (radius - 2) * math.sin(angle)
                x2 = cx + (radius + 3) * math.cos(angle)
                y2 = cy + (radius + 3) * math.sin(angle)
                draw.line((x1, y1, x2, y2), fill=rgb, width=3)
            draw.ellipse([cx-radius+4, cy-radius+4, cx+radius-4, cy+radius-4], outline=rgb, width=3)
            draw.ellipse([cx-5, cy-5, cx+5, cy+5], fill=rgb)


def main():
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons')
    os.makedirs(out_dir, exist_ok=True)

    for name, commands in ICONS.items():
        for state, color in COLORS.items():
            img = Image.new('RGBA', (ICON_SIZE, ICON_SIZE), (255, 255, 255, 0))
            draw = ImageDraw.Draw(img)
            draw_icon(draw, commands, color)
            path = os.path.join(out_dir, f'{name}{"-active" if state == "active" else ""}.png')
            img.save(path)
            print(f'Generated {path}')


if __name__ == '__main__':
    main()
