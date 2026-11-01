#!/usr/bin/env python3
"""
tools/import_gif.py
CLI tool for importing animated GIF assets into Bubu & Dudu Desktop Pet.
Performs automated validation, perimeter BFS background removal, asset copying,
and atomic action registry (src/actions.json) updating.
"""

import os
import sys
import json
import argparse
import io
import shutil
import re
from collections import deque
import numpy as np
from PIL import Image, ImageSequence

# Ensure standard output and error use UTF-8 on Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

SUPPORTED_PETS = ('bubu', 'dudu', 'joint')
SUPPORTED_CATEGORIES = ('idle', 'movement', 'special', 'vitality')
VALID_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9_-]+$')

def parse_target_bg(val: str):
    """Parse background color string into an (R, G, B) tuple."""
    if not val or val.lower() == 'auto':
        return 'auto'
    val = val.strip()
    if val.startswith('#'):
        val = val[1:]
        if len(val) == 6:
            return (int(val[0:2], 16), int(val[2:4], 16), int(val[4:6], 16))
    if ',' in val:
        parts = [int(p.strip()) for p in val.split(',')]
        if len(parts) >= 3:
            return (parts[0], parts[1], parts[2])
    raise ValueError(f"Invalid target-bg format: '{val}'. Expected 'auto', '#RRGGBB', or 'R,G,B'.")

def detect_perimeter_bg_color(frame_rgba: np.ndarray, tolerance: float = 15.0) -> tuple:
    """
    Auto-detect the background color from perimeter and corner pixels.
    """
    H, W, _ = frame_rgba.shape
    corners = [
        frame_rgba[0, 0, :3],
        frame_rgba[0, W - 1, :3],
        frame_rgba[H - 1, 0, :3],
        frame_rgba[H - 1, W - 1, :3],
    ]
    # Check if corners are consistent
    corner_arr = np.array(corners)
    diffs = np.linalg.norm(corner_arr - corner_arr[0], axis=-1)
    if np.all(diffs <= tolerance):
        # High confidence corner match
        c = np.median(corner_arr, axis=0).astype(int)
        return (int(c[0]), int(c[1]), int(c[2]))

    # Fallback: inspect outer perimeter
    perimeter = np.concatenate([
        frame_rgba[0, :, :3],
        frame_rgba[H - 1, :, :3],
        frame_rgba[:, 0, :3],
        frame_rgba[:, W - 1, :3]
    ], axis=0)

    # Median perimeter color
    med = np.median(perimeter, axis=0).astype(int)
    return (int(med[0]), int(med[1]), int(med[2]))

def flood_fill_transparency(frame_rgba: Image.Image, bg_color: tuple, tolerance: float = 15.0) -> Image.Image:
    """
    Perimeter-seeded 4-connected BFS flood fill to remove background
    while strictly preserving internal features enclosed by outlines.
    """
    arr = np.array(frame_rgba)
    H, W, _ = arr.shape

    # Euclidean distance from background color
    diff = arr[:, :, :3].astype(int) - np.array(bg_color, dtype=int)
    dist = np.sqrt(np.sum(diff ** 2, axis=-1))

    # A pixel qualifies as background if it matches the bg color or is already transparent
    is_bg_like = (dist <= tolerance) | (arr[:, :, 3] == 0)

    visited = np.zeros((H, W), dtype=bool)
    queue = deque()

    # Seed perimeter boundary
    for x in range(W):
        if is_bg_like[0, x] and not visited[0, x]:
            visited[0, x] = True
            queue.append((0, x))
        if is_bg_like[H - 1, x] and not visited[H - 1, x]:
            visited[H - 1, x] = True
            queue.append((H - 1, x))

    for y in range(H):
        if is_bg_like[y, 0] and not visited[y, 0]:
            visited[y, 0] = True
            queue.append((y, 0))
        if is_bg_like[y, W - 1] and not visited[y, W - 1]:
            visited[y, W - 1] = True
            queue.append((y, W - 1))

    # 4-connected BFS traversal
    while queue:
        cy, cx = queue.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < H and 0 <= nx < W:
                if not visited[ny, nx] and is_bg_like[ny, nx]:
                    visited[ny, nx] = True
                    queue.append((ny, nx))

    # Transparentize all visited background pixels
    arr[visited, 3] = 0
    return Image.fromarray(arr, mode='RGBA')

def validate_gif(file_path: str):
    """
    Validate existence, GIF header magic bytes, readability, frame count,
    dimensions, and frame durations.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: '{file_path}'")
    if not os.path.isfile(file_path):
        raise ValueError(f"Input path is not a regular file: '{file_path}'")

    # Magic byte header check
    with open(file_path, 'rb') as f:
        header = f.read(6)
    if header not in (b'GIF87a', b'GIF89a'):
        raise ValueError(f"Invalid GIF magic header: {header!r}. Expected b'GIF87a' or b'GIF89a'.")

    # Pillow inspection
    try:
        im = Image.open(file_path)
    except Exception as e:
        raise ValueError(f"Failed to open GIF with Pillow: {e}")

    if im.format != 'GIF':
        raise ValueError(f"File format is not GIF (detected: {im.format})")

    n_frames = getattr(im, 'n_frames', 1)
    if n_frames < 1:
        raise ValueError("GIF contains 0 frames.")

    width, height = im.size
    if width <= 0 or height <= 0:
        raise ValueError(f"Invalid GIF dimensions: {width}x{height}")

    durations = []
    for f in ImageSequence.Iterator(im):
        d = f.info.get('duration', 100)
        if d is None or d <= 10:
            d = 100 # Default to 100ms standard browser clamp
        durations.append(int(d))

    total_duration_ms = sum(durations)

    return {
        'header': header.decode('ascii', errors='ignore'),
        'n_frames': n_frames,
        'dimensions': (width, height),
        'durations': durations,
        'total_duration_ms': total_duration_ms
    }

def normalize_names(pet: str, name: str):
    """
    Normalize action key and target filename according to pet conventions.
    """
    name = name.strip()
    if not VALID_NAME_PATTERN.match(name):
        raise ValueError(f"Invalid action name: '{name}'. Must contain only alphanumeric characters, underscores, and hyphens.")

    if pet == 'bubu':
        action_key = name[5:] if name.startswith('bubu-') else name
        filename = f"bubu-{action_key}.gif"
    elif pet == 'dudu':
        action_key = name[5:] if name.startswith('dudu-') else name
        filename = f"dudu-{action_key}.gif"
    elif pet == 'joint':
        if name.startswith('bubu-dudu-'):
            action_key = name[10:]
            filename = f"{name}.gif"
        elif name.startswith('dudu-bubu-'):
            action_key = name[10:]
            filename = f"{name}.gif"
        else:
            action_key = name
            filename = f"bubu-dudu-{action_key}.gif"
    else:
        raise ValueError(f"Unsupported pet: '{pet}'. Choices: {SUPPORTED_PETS}")

    return action_key, filename

def format_default_label(action_key: str, category: str) -> str:
    """Format a human-readable display label from the action key."""
    words = action_key.replace('_', ' ').replace('-', ' ').title()
    if category == 'movement':
        return f"{words} 🐾"
    elif category == 'vitality':
        return f"{words} 💤"
    elif category == 'special':
        return f"{words} ✨"
    else:
        return f"{words} 🐾"

def update_actions_registry(actions_path: str, pet: str, action_key: str, entry: dict, dry_run: bool = False):
    """
    Cleanly and atomically update src/actions.json with the new action entry.
    """
    actions_data = {
        "bubu": {},
        "dudu": {},
        "joint": {},
        "food": []
    }

    if os.path.exists(actions_path):
        with open(actions_path, 'r', encoding='utf-8') as f:
            try:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    actions_data = loaded
            except json.JSONDecodeError as e:
                raise ValueError(f"Failed to parse existing {actions_path}: {e}")

    # Ensure pet container exists
    if pet not in actions_data or not isinstance(actions_data[pet], dict):
        actions_data[pet] = {}

    # Update entry
    actions_data[pet][action_key] = entry

    if dry_run:
        return actions_data

    # Atomic write via temporary file
    dir_name = os.path.dirname(actions_path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)

    tmp_path = actions_path + ".tmp"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(actions_data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    os.replace(tmp_path, actions_path)
    return actions_data

def import_gif(args):
    """Main import execution logic."""
    # 1. Validation
    meta = validate_gif(args.file)
    action_key, filename = normalize_names(args.pet, args.name)

    # 2. Determine speed & category
    speed = float(args.speed) if args.speed is not None else 0.0
    if args.category:
        category = args.category.lower()
        if category not in SUPPORTED_CATEGORIES:
            raise ValueError(f"Invalid category '{category}'. Must be one of: {SUPPORTED_CATEGORIES}")
    else:
        if speed > 0:
            category = 'movement'
        elif 'sleep' in action_key.lower():
            category = 'vitality'
        else:
            category = 'idle'

    # 3. Determine label
    label = args.label if args.label else format_default_label(action_key, category)

    # 4. Determine naturalFacing
    natural_facing = int(args.natural_facing)
    if natural_facing not in (1, -1):
        raise ValueError(f"Invalid natural-facing '{natural_facing}'. Must be 1 or -1.")

    # 5. Determine duration [min, max]
    total_cycle = meta['total_duration_ms']
    if args.duration_min is not None and args.duration_max is not None:
        dur_min = int(args.duration_min)
        dur_max = int(args.duration_max)
    elif args.duration_min is not None:
        dur_min = int(args.duration_min)
        dur_max = max(dur_min, int(dur_min * 1.5))
    elif args.duration_max is not None:
        dur_max = int(args.duration_max)
        dur_min = min(dur_max, int(dur_max * 0.6))
    else:
        # Auto-compute reasonable duration range from GIF cycle
        if total_cycle > 0:
            loops = max(1, round(4000 / total_cycle))
            dur_min = max(3000, loops * total_cycle)
            dur_max = max(dur_min + 1500, (loops + 1) * total_cycle)
        else:
            dur_min = 3500
            dur_max = 6500

    if dur_max < dur_min:
        raise ValueError(f"duration-max ({dur_max}) must be greater than or equal to duration-min ({dur_min}).")

    duration = [dur_min, dur_max]

    # 6. Resolve destination paths
    dest_dir = os.path.abspath(args.dest_dir or '.')
    dest_file_path = os.path.join(dest_dir, filename)
    actions_json_path = os.path.abspath(args.actions_file or os.path.join(dest_dir, 'src', 'actions.json'))

    # Relative path stored in actions.json: renderer loads relative to src/pet.html
    rel_file_entry = f"../{filename}"

    if args.pet == 'joint':
        action_entry = {
            "id": action_key,
            "name": label,
            "file": rel_file_entry,
            "duration": dur_max,
            "emotes": ["❤️", "✨", "🐾", "🎉"]
        }
    else:
        action_entry = {
            "file": rel_file_entry,
            "speed": speed,
            "duration": duration,
            "naturalFacing": natural_facing,
            "label": label,
            "category": category,
            "menu": not getattr(args, 'no_menu', False)
        }

    # 7. Process Background Removal or Copy
    im = Image.open(args.file)
    bg_removed = False

    if args.remove_bg:
        frames_rgba = [f.convert('RGBA') for f in ImageSequence.Iterator(im)]
        # Background color selection
        target_bg = parse_target_bg(args.target_bg)
        if target_bg == 'auto':
            target_bg = detect_perimeter_bg_color(np.array(frames_rgba[0]), tolerance=args.bg_tolerance)

        cleaned_frames = [
            flood_fill_transparency(f, bg_color=target_bg, tolerance=args.bg_tolerance)
            for f in frames_rgba
        ]

        if not args.dry_run:
            buf = io.BytesIO()
            if len(cleaned_frames) == 1:
                cleaned_frames[0].save(
                    buf,
                    format='GIF',
                    disposal=2,
                    loop=0,
                    duration=meta['durations'][0]
                )
            else:
                cleaned_frames[0].save(
                    buf,
                    format='GIF',
                    save_all=True,
                    append_images=cleaned_frames[1:],
                    duration=meta['durations'],
                    loop=0,
                    disposal=2
                )

            os.makedirs(os.path.dirname(dest_file_path), exist_ok=True)
            with open(dest_file_path, 'wb') as f:
                f.write(buf.getvalue())
        bg_removed = True
    else:
        if not args.dry_run:
            os.makedirs(os.path.dirname(dest_file_path), exist_ok=True)
            if os.path.abspath(args.file) != dest_file_path:
                shutil.copy2(args.file, dest_file_path)

    # 8. Update src/actions.json
    update_actions_registry(
        actions_path=actions_json_path,
        pet=args.pet,
        action_key=action_key,
        entry=action_entry,
        dry_run=args.dry_run
    )

    result = {
        "success": True,
        "dryRun": args.dry_run,
        "pet": args.pet,
        "actionKey": action_key,
        "filename": filename,
        "destPath": dest_file_path,
        "actionsJsonPath": actions_json_path,
        "frameCount": meta['n_frames'],
        "dimensions": meta['dimensions'],
        "totalDurationMs": meta['total_duration_ms'],
        "backgroundRemoved": bg_removed,
        "entry": action_entry
    }

    return result

def build_parser():
    parser = argparse.ArgumentParser(
        description="Import GIF animations into Bubu & Dudu Desktop Pet and update actions registry."
    )
    parser.add_argument("--file", "-f", required=True, help="Path to input GIF file.")
    parser.add_argument("--pet", "-p", required=True, choices=SUPPORTED_PETS, help="Target pet character (bubu, dudu, joint).")
    parser.add_argument("--name", "-n", required=True, help="Unique action name key (e.g. wave, pizza, dance).")
    parser.add_argument("--label", "-l", help="Human-readable label for menus (e.g. 'Wave').")
    parser.add_argument("--speed", "-s", type=float, default=0.0, help="Horizontal movement speed (default: 0.0).")
    parser.add_argument("--category", "-c", choices=SUPPORTED_CATEGORIES, help="Action category (idle, movement, special, vitality).")
    parser.add_argument("--no-menu", action="store_true", help="Exclude action from tray and context menus.")
    parser.add_argument("--natural-facing", type=int, choices=(1, -1), default=1, help="Natural facing direction: 1 (right) or -1 (left). Default: 1.")
    parser.add_argument("--duration-min", type=int, help="Minimum action duration in ms.")
    parser.add_argument("--duration-max", type=int, help="Maximum action duration in ms.")
    parser.add_argument("--remove-bg", action="store_true", help="Apply perimeter-seeded BFS flood fill background removal.")
    parser.add_argument("--bg-tolerance", type=float, default=15.0, help="Color Euclidean distance tolerance for background removal (default: 15.0).")
    parser.add_argument("--target-bg", default="auto", help="Target background color ('auto', '#RRGGBB', or 'R,G,B'). Default: 'auto'.")
    parser.add_argument("--dest-dir", default=".", help="Project root destination directory (default: current directory).")
    parser.add_argument("--actions-file", help="Path to actions.json (default: <dest-dir>/src/actions.json).")
    parser.add_argument("--dry-run", action="store_true", help="Validate and simulate import without writing files.")
    parser.add_argument("--json", action="store_true", help="Output result as JSON to stdout.")
    return parser

def main():
    parser = build_parser()
    args = parser.parse_args()

    try:
        result = import_gif(args)
        if args.json:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            mode_str = "[DRY-RUN] " if result['dryRun'] else ""
            print(f"{mode_str}Successfully imported '{result['actionKey']}' for {result['pet']}!")
            print(f"  Asset File:     {result['filename']}")
            print(f"  Destination:    {result['destPath']}")
            print(f"  Frames:         {result['frameCount']} ({result['dimensions'][0]}x{result['dimensions'][1]})")
            print(f"  Total Duration: {result['totalDurationMs']} ms")
            print(f"  BG Removal:     {'Yes (BFS Flood Fill, disposal=2)' if result['backgroundRemoved'] else 'No'}")
            print(f"  Registry Entry: {json.dumps(result['entry'], ensure_ascii=False)}")
        sys.exit(0)
    except Exception as exc:
        if args.json:
            print(json.dumps({"success": False, "error": str(exc)}, indent=2))
        else:
            print(f"Import Error: {exc}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
