"""
Video to Animated GIF Converter for Desktop Pet
Uses OpenCV and Pillow to convert MP4/WebM videos into high-quality GIFs.
"""

import sys
import os
import cv2
from PIL import Image

def convert_video_to_gif(video_path, output_gif_path=None, fps_step=2, max_size=(300, 300), loop=0):
    if not os.path.exists(video_path):
        print(f"Error: Video file not found at {video_path}")
        return False

    if output_gif_path is None:
        base, _ = os.path.splitext(video_path)
        output_gif_path = base + ".gif"

    cap = cv2.VideoCapture(video_path)
    frames = []
    frame_idx = 0

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    duration_per_frame = int((1000 / fps) * fps_step)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % fps_step == 0:
            # OpenCV is BGR, convert to RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(rgb_frame)
            pil_img.thumbnail(max_size, Image.Resampling.LANCZOS)
            frames.append(pil_img)

        frame_idx += 1

    cap.release()

    if not frames:
        print("Error: No frames extracted from video.")
        return False

    # Save as animated GIF with adaptive palette
    frames[0].save(
        output_gif_path,
        save_all=True,
        append_images=frames[1:],
        optimize=True,
        duration=duration_per_frame,
        loop=loop
    )

    print(f"Successfully converted '{video_path}' -> '{output_gif_path}' ({len(frames)} frames)")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python video_to_gif.py <video_file> [output_gif]")
    else:
        v_in = sys.argv[1]
        v_out = sys.argv[2] if len(sys.argv) > 2 else None
        convert_video_to_gif(v_in, v_out)
