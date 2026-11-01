import os
import sys
import numpy as np
from PIL import Image

def remove_background_and_crop(img, bg_threshold=240):
    rgba = img.convert('RGBA')
    arr = np.array(rgba)

    # Detect white/light background from border
    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
    mask = (r > bg_threshold) & (g > bg_threshold) & (b > bg_threshold)
    arr[mask, 3] = 0

    result = Image.fromarray(arr)
    # Crop to non-transparent bounding box
    bbox = result.getbbox()
    if bbox:
        result = result.crop(bbox)

    return result

def make_breathing_gif(img_path, output_gif, num_frames=8, duration=200):
    base_img = Image.open(img_path)
    clean_img = remove_background_and_crop(base_img)

    w, h = clean_img.size
    target_h = 240
    target_w = int(w * (target_h / h))
    clean_img = clean_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    frames = []
    # Create subtle breathing cycle (scale vertically 1.0 -> 1.04 -> 1.0)
    for i in range(num_frames):
        scale_y = 1.0 + 0.035 * np.sin(2 * np.pi * i / num_frames)
        new_h = int(target_h * scale_y)
        frame = clean_img.resize((target_w, new_h), Image.Resampling.BILINEAR)

        # Pad to max height so frame size is uniform
        canvas = Image.new('RGBA', (target_w, int(target_h * 1.04) + 4), (0, 0, 0, 0))
        offset_y = canvas.height - frame.height
        canvas.paste(frame, (0, offset_y), frame)
        frames.append(canvas)

    frames[0].save(
        output_gif,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        disposal=2
    )
    print(f"Saved breathing GIF -> {output_gif}")

def make_dangling_gif(img_path, output_gif, num_frames=6, duration=150):
    base_img = Image.open(img_path)
    clean_img = remove_background_and_crop(base_img)

    w, h = clean_img.size
    target_h = 240
    target_w = int(w * (target_h / h))
    clean_img = clean_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    frames = []
    # Create dangling wiggle cycle (rotate -6 deg to +6 deg)
    pad = 40
    for i in range(num_frames):
        angle = 6.0 * np.sin(2 * np.pi * i / num_frames)
        # Rotate around top-center
        rotated = clean_img.rotate(angle, resample=Image.Resampling.BILINEAR, expand=True)

        canvas = Image.new('RGBA', (target_w + pad, target_h + pad), (0, 0, 0, 0))
        ox = (canvas.width - rotated.width) // 2
        oy = 5
        canvas.paste(rotated, (ox, oy), rotated)
        frames.append(canvas)

    frames[0].save(
        output_gif,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        disposal=2
    )
    print(f"Saved dangling GIF -> {output_gif}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python generate_pet_gif.py <mode: sleep|dangle> <input_img> <output_gif>")
    else:
        mode = sys.argv[1]
        inp = sys.argv[2]
        out = sys.argv[3]
        if mode == "sleep":
            make_breathing_gif(inp, out)
        elif mode == "dangle":
            make_dangling_gif(inp, out)
