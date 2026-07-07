import math
from PIL import Image, ImageDraw

def create_icon(size):
    # Dark gray background
    img = Image.new("RGBA", (size, size), color=(3, 7, 18, 255))
    draw = ImageDraw.Draw(img)
    
    center = size // 2
    r_outer = int(size * 0.4)
    
    # Draw a glowing outer circle (semi-transparent orange layers)
    for offset in range(1, 10):
        glow_alpha = int(40 // offset)
        draw.ellipse(
            [center - r_outer - offset, center - r_outer - offset, 
             center + r_outer + offset, center + r_outer + offset],
            outline=(249, 115, 22, glow_alpha), width=2
        )
        
    # Draw the main branding hexagon at the center
    points = []
    r_hex = int(size * 0.22)
    for i in range(6):
        angle = math.radians(i * 60 - 30)  # Hexagon point facing upwards
        x = center + r_hex * math.cos(angle)
        y = center + r_hex * math.sin(angle)
        points.append((x, y))
        
    # Draw outer hexagon
    draw.polygon(points, fill=(249, 115, 22, 45), outline=(249, 115, 22, 255), width=max(2, int(size * 0.02)))
    
    # Draw inner core hexagon
    r_hex_inner = int(size * 0.10)
    inner_points = []
    for i in range(6):
        angle = math.radians(i * 60 - 30)
        x = center + r_hex_inner * math.cos(angle)
        y = center + r_hex_inner * math.sin(angle)
        inner_points.append((x, y))
        
    draw.polygon(inner_points, fill=(255, 165, 0, 180), outline=(255, 255, 255, 220), width=max(1, int(size * 0.01)))
    
    return img

if __name__ == "__main__":
    create_icon(192).save("icon-192x192.png")
    create_icon(512).save("icon-512x512.png")
    print("PWA launcher icons successfully drawn and saved.")
