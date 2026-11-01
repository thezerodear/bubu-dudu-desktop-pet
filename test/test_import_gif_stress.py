"""
test/test_import_gif_stress.py
Python unittest test harness for empirical stress-testing of tools/import_gif.py.
"""

import unittest
import os
import sys
import json
import shutil
import subprocess
import hashlib
from PIL import Image

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IMPORT_TOOL = os.path.join(ROOT_DIR, 'tools', 'import_gif.py')
REAL_ACTIONS_JSON = os.path.join(ROOT_DIR, 'src', 'actions.json')
FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures', 'stress_py')
SANDBOX_DIR = os.path.join(FIXTURES_DIR, 'sandbox')
SANDBOX_ACTIONS = os.path.join(SANDBOX_DIR, 'src', 'actions.json')

def parse_gif_gce(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    gce_list = []
    idx = 13
    gct_flag = data[10] & 0x80
    if gct_flag:
        gct_size = 3 * (2 ** ((data[10] & 0x07) + 1))
        idx += gct_size

    while idx < len(data):
        b = data[idx]
        if b == 0x21:
            label = data[idx + 1]
            if label == 0xF9:
                block_size = data[idx + 2]
                packed = data[idx + 3]
                disposal = (packed >> 2) & 0x07
                delay_time = data[idx + 4] | (data[idx + 5] << 8)
                trans_color = data[idx + 6]
                gce_list.append({
                    'offset': idx,
                    'disposal': disposal,
                    'delay_ms': delay_time * 10,
                    'transparency_flag': packed & 1,
                    'transparent_index': trans_color
                })
                idx += 3 + block_size + 1
            else:
                idx += 2
                while idx < len(data) and data[idx] != 0:
                    idx += 1 + data[idx]
                idx += 1
        elif b == 0x2C:
            idx += 10
            lct_flag = data[idx - 1] & 0x80
            if lct_flag:
                lct_size = 3 * (2 ** ((data[idx - 1] & 0x07) + 1))
                idx += lct_size
            idx += 1
            while idx < len(data) and data[idx] != 0:
                idx += 1 + data[idx]
            idx += 1
        elif b == 0x3B:
            break
        else:
            idx += 1
    return gce_list

class TestImportGifStress(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reset_sandbox()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(FIXTURES_DIR):
            shutil.rmtree(FIXTURES_DIR, ignore_errors=True)

    @classmethod
    def reset_sandbox(cls):
        if os.path.exists(SANDBOX_DIR):
            shutil.rmtree(SANDBOX_DIR, ignore_errors=True)
        os.makedirs(os.path.join(SANDBOX_DIR, 'src'), exist_ok=True)
        shutil.copy2(REAL_ACTIONS_JSON, SANDBOX_ACTIONS)

    def run_cli(self, args, env_extra=None):
        env = os.environ.copy()
        if env_extra:
            env.update(env_extra)
        cmd = [sys.executable, IMPORT_TOOL] + args
        proc = subprocess.run(
            cmd,
            cwd=ROOT_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            env=env
        )
        return proc

    def test_missing_args(self):
        res = self.run_cli([])
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("required", res.stderr.lower())

    def test_invalid_pet(self):
        res = self.run_cli(['--file', 'bubu-walk.gif', '--pet', 'dragon', '--name', 'fly'])
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("invalid choice", res.stderr.lower())

    def test_invalid_name_characters(self):
        res = self.run_cli(['--file', 'bubu-walk.gif', '--pet', 'bubu', '--name', 'bad name!'])
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("invalid action name", res.stderr.lower())

    def test_nonexistent_file(self):
        res = self.run_cli(['--file', 'definitely_does_not_exist_987.gif', '--pet', 'bubu', '--name', 'test'])
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("not found", res.stderr.lower())

    def test_dry_run_immutability(self):
        with open(REAL_ACTIONS_JSON, 'rb') as f:
            before_hash = hashlib.sha256(f.read()).hexdigest()

        target_file = os.path.join(ROOT_DIR, 'bubu-py_dry_test.gif')
        res = self.run_cli(['--file', 'bubu-walk.gif', '--pet', 'bubu', '--name', 'py_dry_test', '--dry-run', '--json'])
        self.assertEqual(res.returncode, 0)
        self.assertFalse(os.path.exists(target_file))

        with open(REAL_ACTIONS_JSON, 'rb') as f:
            after_hash = hashlib.sha256(f.read()).hexdigest()
        self.assertEqual(before_hash, after_hash)

    def test_bfs_transparency_and_disposal_delays(self):
        self.reset_sandbox()
        fixture_path = os.path.join(FIXTURES_DIR, 'test_py_bfs.gif')
        frames = []
        delays = [150, 250]
        for c in [(255, 0, 0), (0, 255, 0)]:
            im = Image.new('RGBA', (20, 20), (255, 255, 255, 255))
            # border outline
            for x in range(3, 17):
                im.putpixel((x, 3), (0, 0, 0, 255))
                im.putpixel((x, 16), (0, 0, 0, 255))
            for y in range(3, 17):
                im.putpixel((3, y), (0, 0, 0, 255))
                im.putpixel((16, y), (0, 0, 0, 255))
            # internal white
            for x in range(4, 16):
                for y in range(4, 16):
                    im.putpixel((x, y), (255, 255, 255, 255))
            # internal dot
            im.putpixel((10, 10), c + (255,))
            frames.append(im)

        frames[0].save(fixture_path, format='GIF', save_all=True, append_images=[frames[1]], duration=delays, loop=0, disposal=2)

        out_asset = os.path.join(SANDBOX_DIR, 'bubu-py_bfs_imported.gif')
        res = self.run_cli([
            '--file', fixture_path,
            '--pet', 'bubu',
            '--name', 'py_bfs_imported',
            '--remove-bg',
            '--dest-dir', SANDBOX_DIR,
            '--actions-file', SANDBOX_ACTIONS,
            '--json'
        ])
        self.assertEqual(res.returncode, 0)
        self.assertTrue(os.path.exists(out_asset))

        # Inspect GCE
        gces = parse_gif_gce(out_asset)
        self.assertEqual(len(gces), 2)
        for idx, gce in enumerate(gces):
            self.assertEqual(gce['disposal'], 2)
            self.assertEqual(gce['delay_ms'], delays[idx])

        # Inspect pixels
        with Image.open(out_asset) as im_res:
            f0 = im_res.convert('RGBA')
            self.assertEqual(f0.getpixel((0, 0))[3], 0) # corner transparent
            self.assertEqual(f0.getpixel((3, 3))[3], 255) # border opaque
            self.assertEqual(f0.getpixel((5, 5))[:3], (255, 255, 255)) # inner white preserved
            self.assertEqual(f0.getpixel((5, 5))[3], 255) # inner white opaque

            im_res.seek(1)
            f1 = im_res.convert('RGBA')
            self.assertEqual(f1.getpixel((0, 0))[3], 0)
            self.assertEqual(f1.getpixel((3, 3))[3], 255)
            self.assertEqual(f1.getpixel((5, 5))[:3], (255, 255, 255))
            self.assertEqual(f1.getpixel((5, 5))[3], 255)

    def test_windows_cp1252_encoding_safety(self):
        res = self.run_cli(
            ['--file', 'bubu-walk.gif', '--pet', 'bubu', '--name', 'py_cp1252', '--label', 'Bubu Dance 🐾 💤 ✨', '--dry-run', '--json'],
            env_extra={'PYTHONIOENCODING': 'cp1252'}
        )
        self.assertEqual(res.returncode, 0)
        out = json.loads(res.stdout)
        self.assertEqual(out['entry']['label'], 'Bubu Dance 🐾 💤 ✨')

if __name__ == '__main__':
    unittest.main()
