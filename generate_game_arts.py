#!/usr/bin/env python3
"""
Generate 1024x1024 casino game artwork in neon-casino style.
Output: assets/games/{game_name}.png
"""

from PIL import Image, ImageDraw
import math

SIZE = 1024
HALF = SIZE // 2
OUTPUT_DIR = "assets/games"

def create_image(bg_color):
    """Create base image with background."""
    img = Image.new("RGB", (SIZE, SIZE), bg_color)
    return img, ImageDraw.Draw(img)

def draw_mines(img, draw):
    """Mines: bomb with spark fuse."""
    # Background gradient effect (approx)
    for y in range(SIZE):
        r = int(100 + (y / SIZE) * 60)
        g = int(50 + (y / SIZE) * 40)
        b = int(120 + (y / SIZE) * 80)
        draw.line([(0, y), (SIZE, y)], fill=(r, g, b))
    
    # Redraw
    draw = ImageDraw.Draw(img)
    
    # Big bomb circle (center)
    bomb_r = 180
    draw.ellipse(
        [(HALF - bomb_r, HALF - bomb_r), (HALF + bomb_r, HALF + bomb_r)],
        fill=(20, 20, 20),
        outline=(255, 200, 50),
        width=8
    )
    
    # Spark fuse
    fuse_x, fuse_y = HALF + 160, HALF - 160
    draw.line([(HALF + 80, HALF - 100), (fuse_x, fuse_y)], fill=(255, 150, 50), width=6)
    draw.ellipse([(fuse_x - 12, fuse_y - 12), (fuse_x + 12, fuse_y + 12)], fill=(255, 180, 100))
    
    # Glow effect (shadow)
    shadow_r = bomb_r + 30
    draw.ellipse(
        [(HALF - shadow_r, HALF - shadow_r + 350), (HALF + shadow_r, HALF - shadow_r + 420)],
        fill=(255, 215, 80, 30)
    )

def draw_coinflip(img, draw):
    """Coin Flip: gold coin with crown."""
    # Dark gradient background
    for y in range(SIZE):
        r = int(20 + (y / SIZE) * 40)
        g = int(10 + (y / SIZE) * 20)
        b = int(50 + (y / SIZE) * 60)
        draw.line([(0, y), (SIZE, y)], fill=(r, g, b))
    
    draw = ImageDraw.Draw(img)
    
    # Coin (tilted)
    coin_r = 160
    angle_offset = 15
    
    # Draw coin with gradient-ish effect
    draw.ellipse(
        [(HALF - coin_r, HALF - coin_r + 50), (HALF + coin_r, HALF + coin_r + 50)],
        fill=(255, 215, 80),
        outline=(255, 240, 120),
        width=10
    )
    
    # Crown on coin
    crown_pts = [
        (HALF, HALF),  # center
        (HALF - 40, HALF + 60),
        (HALF - 20, HALF + 20),
        (HALF, HALF + 80),
        (HALF + 20, HALF + 20),
        (HALF + 40, HALF + 60),
    ]
    draw.polygon(crown_pts, fill=(184, 134, 11), outline=(255, 200, 0))

def draw_dice(img, draw):
    """Dice: white die with 6 dots."""
    # Green felt background
    for y in range(SIZE):
        g = int(50 + (y / SIZE) * 30)
        draw.line([(0, y), (SIZE, y)], fill=(10, g, 30))
    
    draw = ImageDraw.Draw(img)
    
    # Die (tilted cube illusion)
    die_size = 220
    die_x, die_y = HALF - 80, HALF - 60
    
    # Front face
    draw.rectangle(
        [(die_x, die_y), (die_x + die_size, die_y + die_size)],
        fill=(255, 255, 255),
        outline=(212, 175, 55),
        width=12
    )
    
    # Dots (6 on die)
    dot_r = 20
    dots = [
        (die_x + 60, die_y + 60),
        (die_x + 60, die_y + 110),
        (die_x + 110, die_y + 60),
        (die_x + 110, die_y + 110),
        (die_x + 160, die_y + 60),
        (die_x + 160, die_y + 110),
    ]
    for dx, dy in dots:
        draw.ellipse([(dx - dot_r, dy - dot_r), (dx + dot_r, dy + dot_r)], fill=(30, 30, 30))

def draw_roulette(img, draw):
    """Roulette: wheel segment (top-down view)."""
    # Dark wood background
    for y in range(SIZE):
        r = int(100 + (y / SIZE) * 40)
        g = int(60 + (y / SIZE) * 20)
        b = int(30)
        draw.line([(0, y), (SIZE, y)], fill=(r, g, b))
    
    draw = ImageDraw.Draw(img)
    
    # Wheel
    wheel_r = 300
    draw.ellipse(
        [(HALF - wheel_r, HALF - wheel_r), (HALF + wheel_r, HALF + wheel_r)],
        fill=(20, 20, 20),
        outline=(212, 175, 55),
        width=14
    )
    
    # Red and green segments
    for angle in range(0, 360, 30):
        rad = math.radians(angle)
        x1 = HALF + wheel_r * math.cos(rad)
        y1 = HALF + wheel_r * math.sin(rad)
        x2 = HALF + (wheel_r - 80) * math.cos(rad)
        y2 = HALF + (wheel_r - 80) * math.sin(rad)
        
        color = (200, 0, 0) if angle % 60 == 0 else (0, 150, 0)
        draw.line([(x1, y1), (x2, y2)], fill=color, width=40)

def draw_crash(img, draw):
    """Crash: rocket/graph burst with neon trail."""
    # Dark background with neon hints
    for y in range(SIZE):
        r = int(10 + (y / SIZE) * 20)
        g = int(20 + (y / SIZE) * 30)
        b = int(30 + (y / SIZE) * 50)
        draw.line([(0, y), (SIZE, y)], fill=(r, g, b))
    
    draw = ImageDraw.Draw(img)
    
    # Ascending curve (crash graph)
    points = []
    for i in range(0, 12):
        x = int(150 + i * 60)
        y = int(700 - i * i * 8)
        points.append((x, y))
    
    if len(points) > 1:
        draw.line(points, fill=(0, 229, 255), width=20)
    
    # Rocket/burst at end
    if points:
        end_x, end_y = points[-1]
        # Rocket triangle
        rocket_pts = [
            (end_x, end_y - 40),
            (end_x - 50, end_y + 80),
            (end_x + 50, end_y + 80),
        ]
        draw.polygon(rocket_pts, fill=(255, 77, 166))
        
        # Glow circle
        glow_r = 80
        draw.ellipse(
            [(end_x - glow_r, end_y - glow_r), (end_x + glow_r, end_y + glow_r)],
            outline=(255, 77, 166),
            width=6
        )

def generate_all():
    """Generate all game artworks."""
    games = {
        "mines": draw_mines,
        "coinflip": draw_coinflip,
        "dice": draw_dice,
        "roulette": draw_roulette,
        "crash": draw_crash,
    }
    
    for game_name, draw_func in games.items():
        print(f"Generating {game_name}...", end=" ")
        img, draw = create_image((15, 10, 30))
        draw_func(img, draw)
        
        output_path = f"{OUTPUT_DIR}/{game_name}.png"
        img.save(output_path, "PNG")
        print(f"✓ {output_path}")

if __name__ == "__main__":
    generate_all()
    print("\nAll artworks generated!")
