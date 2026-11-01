/**
 * test/import-stress.test.js
 * Comprehensive empirical stress-testing suite for tools/import_gif.py.
 * Covers CLI parsing, validation error branches, dry-run guarantees,
 * multi-frame BFS flood-fill transparency, disposal method 2, delay preservation,
 * Windows cp1252/Unicode safety, and hermetic sandbox guarantees.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const IMPORT_TOOL = path.join(ROOT_DIR, 'tools', 'import_gif.py');
const REAL_ACTIONS_JSON = path.join(ROOT_DIR, 'src', 'actions.json');
const STRESS_FIXTURES_DIR = path.join(__dirname, 'fixtures', 'stress');
const SANDBOX_DIR = path.join(STRESS_FIXTURES_DIR, 'sandbox');
const SANDBOX_ACTIONS = path.join(SANDBOX_DIR, 'src', 'actions.json');

// Ensure isolated fixture and sandbox directories
function resetSandbox() {
  if (fs.existsSync(SANDBOX_DIR)) {
    fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(SANDBOX_DIR, 'src'), { recursive: true });
  fs.copyFileSync(REAL_ACTIONS_JSON, SANDBOX_ACTIONS);
}

function runCli(args, envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  return spawnSync('python', [IMPORT_TOOL, ...args], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env
  });
}

function createMultiFrameFixture(filePath, delays = [120, 240, 360]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const pyCode = `
from PIL import Image

frames = []
for color in [(255, 0, 0), (0, 255, 0), (0, 0, 255)]:
    im = Image.new('RGBA', (30, 30), (255, 255, 255, 255))
    # Black outline barrier
    for x in range(5, 25):
        im.putpixel((x, 5), (0, 0, 0, 255))
        im.putpixel((x, 24), (0, 0, 0, 255))
    for y in range(5, 25):
        im.putpixel((5, y), (0, 0, 0, 255))
        im.putpixel((24, y), (0, 0, 0, 255))
    # Enclosed internal white feature (must remain opaque)
    for x in range(6, 24):
        for y in range(6, 24):
            im.putpixel((x, y), (255, 255, 255, 255))
    # Inner colored core
    for x in range(12, 18):
        for y in range(12, 18):
            im.putpixel((x, y), color + (255,))
    frames.append(im)

delays = ${JSON.stringify(delays)}
frames[0].save(
    r'${filePath.replace(/\\/g, '\\\\')}',
    format='GIF',
    save_all=True,
    append_images=frames[1:],
    duration=delays,
    loop=0,
    disposal=2
)
`;
  execFileSync('python', ['-c', pyCode]);
}

function parseGifGce(filePath) {
  const data = fs.readFileSync(filePath);
  const gceList = [];
  let idx = 13;
  const gctFlag = data[10] & 0x80;
  if (gctFlag) {
    const gctSize = 3 * (2 ** ((data[10] & 0x07) + 1));
    idx += gctSize;
  }

  while (idx < data.length) {
    const b = data[idx];
    if (b === 0x21) {
      const label = data[idx + 1];
      if (label === 0xF9) {
        const blockSize = data[idx + 2];
        const packed = data[idx + 3];
        const disposal = (packed >> 2) & 0x07;
        const delayTime = data[idx + 4] | (data[idx + 5] << 8);
        const transColor = data[idx + 6];
        gceList.push({
          offset: idx,
          disposal: disposal,
          delayMs: delayTime * 10,
          transparencyFlag: packed & 1,
          transparentIndex: transColor
        });
        idx += 3 + blockSize + 1;
      } else {
        idx += 2;
        while (idx < data.length && data[idx] !== 0) {
          idx += 1 + data[idx];
        }
        idx += 1;
      }
    } else if (b === 0x2C) {
      idx += 10;
      const lctFlag = data[idx - 1] & 0x80;
      if (lctFlag) {
        const lctSize = 3 * (2 ** ((data[idx - 1] & 0x07) + 1));
        idx += lctSize;
      }
      idx += 1;
      while (idx < data.length && data[idx] !== 0) {
        idx += 1 + data[idx];
      }
      idx += 1;
    } else if (b === 0x3B) {
      break;
    } else {
      idx += 1;
    }
  }
  return gceList;
}

function inspectGifPixels(filePath) {
  const pyCode = `
import json
from PIL import Image, ImageSequence

frames_info = []
with Image.open(r'${filePath.replace(/\\/g, '\\\\')}') as im:
    for f in ImageSequence.Iterator(im):
        rgba = f.convert('RGBA')
        frames_info.append({
            'corner_alpha': rgba.getpixel((0, 0))[3],
            'corner_rgb': rgba.getpixel((0, 0))[:3],
            'border_alpha': rgba.getpixel((5, 5))[3],
            'border_rgb': rgba.getpixel((5, 5))[:3],
            'inner_white_alpha': rgba.getpixel((8, 8))[3],
            'inner_white_rgb': rgba.getpixel((8, 8))[:3]
        })
print(json.dumps(frames_info))
`;
  const out = execFileSync('python', ['-c', pyCode], { encoding: 'utf8' });
  return JSON.parse(out);
}

// ---------------------------------------------------------
// SUITE 1: CLI ARGUMENT PARSING & REJECTIONS
// ---------------------------------------------------------
test('Stress 1: CLI Rejects Missing Required Arguments', () => {
  // Missing all
  let res = runCli([]);
  assert.notEqual(res.status, 0, 'CLI must exit non-zero when no arguments passed');
  assert.match(res.stderr, /the following arguments are required/i);

  // Missing --file
  res = runCli(['--pet', 'bubu', '--name', 'test']);
  assert.notEqual(res.status, 0, 'Missing --file must exit non-zero');
  assert.match(res.stderr, /--file/i);

  // Missing --pet
  res = runCli(['--file', 'bubu-walk.gif', '--name', 'test']);
  assert.notEqual(res.status, 0, 'Missing --pet must exit non-zero');
  assert.match(res.stderr, /--pet/i);

  // Missing --name
  res = runCli(['--file', 'bubu-walk.gif', '--pet', 'bubu']);
  assert.notEqual(res.status, 0, 'Missing --name must exit non-zero');
  assert.match(res.stderr, /--name/i);
});

test('Stress 2: CLI Rejects Invalid Enumerations and Values', () => {
  // Invalid pet
  let res = runCli(['--file', 'bubu-walk.gif', '--pet', 'hamster', '--name', 'test']);
  assert.notEqual(res.status, 0, 'Invalid pet must exit non-zero');
  assert.match(res.stderr, /invalid choice.*hamster/i);

  // Invalid category
  res = runCli(['--file', 'bubu-walk.gif', '--pet', 'bubu', '--name', 'test', '--category', 'flying']);
  assert.notEqual(res.status, 0, 'Invalid category must exit non-zero');
  assert.match(res.stderr, /invalid choice.*flying/i);

  // Invalid natural-facing
  res = runCli(['--file', 'bubu-walk.gif', '--pet', 'bubu', '--name', 'test', '--natural-facing', '0']);
  assert.notEqual(res.status, 0, 'Invalid natural-facing 0 must exit non-zero');
  assert.match(res.stderr, /invalid choice/i);

  // Invalid action name with spaces
  res = runCli(['--file', 'bubu-walk.gif', '--pet', 'bubu', '--name', 'bad name', '--dry-run']);
  assert.notEqual(res.status, 0, 'Action name with spaces must be rejected');
  assert.match(res.stderr, /Invalid action name/i);

  // Invalid action name with path traversal
  res = runCli(['--file', 'bubu-walk.gif', '--pet', 'bubu', '--name', '../traversal', '--dry-run']);
  assert.notEqual(res.status, 0, 'Action name with path traversal must be rejected');
  assert.match(res.stderr, /Invalid action name/i);

  // Inverted durations (min > max)
  res = runCli([
    '--file', 'bubu-walk.gif',
    '--pet', 'bubu',
    '--name', 'valid_name',
    '--duration-min', '6000',
    '--duration-max', '2000',
    '--dry-run'
  ]);
  assert.notEqual(res.status, 0, 'duration-min > duration-max must be rejected');
  assert.match(res.stderr, /duration-max.*must be greater than or equal to duration-min/i);

  // Invalid target-bg format
  res = runCli([
    '--file', 'bubu-walk.gif',
    '--pet', 'bubu',
    '--name', 'valid_name',
    '--remove-bg',
    '--target-bg', 'not_a_color',
    '--dry-run'
  ]);
  assert.notEqual(res.status, 0, 'Invalid target-bg format must be rejected');
  assert.match(res.stderr, /Invalid target-bg format/i);
});

// ---------------------------------------------------------
// SUITE 2: SOURCE FILE ERROR HANDLING & MALFORMED REJECTIONS
// ---------------------------------------------------------
test('Stress 3: CLI Rejects Non-Existent or Invalid Source Files', () => {
  // Non-existent file
  let res = runCli(['--file', 'non_existent_file_xyz_123.gif', '--pet', 'bubu', '--name', 'test', '--dry-run']);
  assert.notEqual(res.status, 0, 'Non-existent file must exit non-zero');
  assert.match(res.stderr, /not found/i);

  // Directory as file
  res = runCli(['--file', 'src', '--pet', 'bubu', '--name', 'test', '--dry-run']);
  assert.notEqual(res.status, 0, 'Directory as file must exit non-zero');
  assert.match(res.stderr, /not a regular file/i);

  // Empty 0-byte file
  const emptyPath = path.join(STRESS_FIXTURES_DIR, 'empty.gif');
  fs.writeFileSync(emptyPath, Buffer.alloc(0));
  try {
    res = runCli(['--file', emptyPath, '--pet', 'bubu', '--name', 'test', '--dry-run']);
    assert.notEqual(res.status, 0, '0-byte file must exit non-zero');
    assert.match(res.stderr, /Invalid GIF magic header/i);
  } finally {
    if (fs.existsSync(emptyPath)) fs.unlinkSync(emptyPath);
  }

  // Non-GIF text file
  const txtPath = path.join(STRESS_FIXTURES_DIR, 'not_a_gif.gif');
  fs.writeFileSync(txtPath, 'This is plain text pretending to be a gif');
  try {
    res = runCli(['--file', txtPath, '--pet', 'bubu', '--name', 'test', '--dry-run']);
    assert.notEqual(res.status, 0, 'Plain text file must exit non-zero');
    assert.match(res.stderr, /Invalid GIF magic header/i);
  } finally {
    if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
  }

  // Corrupted GIF body (valid magic header, garbage payload)
  const corruptPath = path.join(STRESS_FIXTURES_DIR, 'corrupt.gif');
  fs.writeFileSync(corruptPath, Buffer.concat([Buffer.from('GIF89a'), crypto.randomBytes(64)]));
  try {
    res = runCli(['--file', corruptPath, '--pet', 'bubu', '--name', 'test', '--dry-run']);
    assert.notEqual(res.status, 0, 'Corrupted GIF body must exit non-zero');
    assert.match(res.stderr, /Failed to open GIF/i);
  } finally {
    if (fs.existsSync(corruptPath)) fs.unlinkSync(corruptPath);
  }
});

// ---------------------------------------------------------
// SUITE 3: DRY-RUN IMMUTABILITY GUARANTEE
// ---------------------------------------------------------
test('Stress 4: Dry-Run Mode Guarantees Zero Files Written and Actions Unchanged', () => {
  const initialActionsSha = crypto.createHash('sha256').update(fs.readFileSync(REAL_ACTIONS_JSON)).digest('hex');
  const targetAsset = path.join(ROOT_DIR, 'bubu-stress_dry_run.gif');
  assert.equal(fs.existsSync(targetAsset), false, 'Target asset must not exist before dry-run');

  const res = runCli([
    '--file', 'bubu-walk.gif',
    '--pet', 'bubu',
    '--name', 'stress_dry_run',
    '--label', 'Stress Dry Run 🐾',
    '--dry-run',
    '--json'
  ]);

  assert.equal(res.status, 0, 'Dry-run must exit with code 0');
  const out = JSON.parse(res.stdout);
  assert.equal(out.success, true);
  assert.equal(out.dryRun, true);
  assert.equal(out.actionKey, 'stress_dry_run');

  // Verify file immutability
  assert.equal(fs.existsSync(targetAsset), false, 'Dry-run must NEVER write the asset file');
  const postActionsSha = crypto.createHash('sha256').update(fs.readFileSync(REAL_ACTIONS_JSON)).digest('hex');
  assert.equal(postActionsSha, initialActionsSha, 'Dry-run must NEVER modify src/actions.json');
});

// ---------------------------------------------------------
// SUITE 4: PERIMETER BFS FLOOD FILL TRANSPARENCY, DISPOSAL & DELAYS
// ---------------------------------------------------------
test('Stress 5: BFS Flood Fill Removes Outer Background, Preserves Enclosed Features, Disposal=2, and Delays', () => {
  resetSandbox();
  const fixturePath = path.join(STRESS_FIXTURES_DIR, 'stress_multi_delay.gif');
  const importedAsset = path.join(SANDBOX_DIR, 'bubu-stress_bfs_test.gif');

  const customDelays = [120, 240, 360];
  createMultiFrameFixture(fixturePath, customDelays);

  try {
    const res = runCli([
      '--file', fixturePath,
      '--pet', 'bubu',
      '--name', 'stress_bfs_test',
      '--remove-bg',
      '--bg-tolerance', '15.0',
      '--target-bg', '#FFFFFF',
      '--dest-dir', SANDBOX_DIR,
      '--actions-file', SANDBOX_ACTIONS,
      '--json'
    ]);

    assert.equal(res.status, 0, `Import failed: ${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(out.success, true);
    assert.equal(out.backgroundRemoved, true);
    assert.equal(out.frameCount, 3);

    assert.ok(fs.existsSync(importedAsset), 'Output asset exists in sandbox');

    // 1. Verify BFS transparency and inner feature preservation
    const pixelReport = inspectGifPixels(importedAsset);
    assert.equal(pixelReport.length, 3, 'Output GIF has 3 frames');
    pixelReport.forEach((frame, idx) => {
      // Outer corner must be transparent
      assert.equal(frame.corner_alpha, 0, `Frame ${idx}: outer corner must have alpha=0 (transparent)`);

      // Boundary outline must remain opaque black
      assert.equal(frame.border_alpha, 255, `Frame ${idx}: outline border must have alpha=255`);
      assert.deepEqual(frame.border_rgb, [0, 0, 0], `Frame ${idx}: outline border must be black`);

      // ENCLOSED white feature must STRICTLY REMAIN OPAQUE WHITE
      assert.equal(frame.inner_white_alpha, 255, `Frame ${idx}: enclosed white feature must have alpha=255 (NOT transparent)`);
      assert.deepEqual(frame.inner_white_rgb, [255, 255, 255], `Frame ${idx}: enclosed white feature must be white (255,255,255)`);
    });

    // 2. Verify raw binary Graphic Control Extension: disposal=2 and exact frame delays
    const gces = parseGifGce(importedAsset);
    assert.equal(gces.length, 3, 'Found 3 Graphic Control Extension blocks');
    gces.forEach((gce, idx) => {
      assert.equal(gce.disposal, 2, `Frame ${idx} GCE disposal method must be 2 (Restore to Background)`);
      assert.equal(gce.transparencyFlag, 1, `Frame ${idx} GCE transparency flag must be 1`);
      assert.equal(gce.delayMs, customDelays[idx], `Frame ${idx} GCE delay must match original ${customDelays[idx]}ms, got ${gce.delayMs}ms`);
    });

  } finally {
    if (fs.existsSync(fixturePath)) {
      fs.unlinkSync(fixturePath);
    }
  }
});

// ---------------------------------------------------------
// SUITE 5: WINDOWS CP1252 CONSOLE SAFETY & NON-ASCII / EMOJI LABELS
// ---------------------------------------------------------
test('Stress 6: Windows cp1252 Console Safety with Multi-Byte Emojis and CJK Labels', () => {
  resetSandbox();
  const importedAsset = path.join(SANDBOX_DIR, 'dudu-stress_emoji.gif');

  // 1. Test Plain text stdout mode under PYTHONIOENCODING=cp1252
  const complexLabel = 'Happy Dudu 🐾 🎉 🚀 🌸 ❤️ 💤 ✨';
  let res = runCli([
    '--file', 'dudu-walk.gif',
    '--pet', 'dudu',
    '--name', 'stress_emoji',
    '--label', complexLabel,
    '--dest-dir', SANDBOX_DIR,
    '--actions-file', SANDBOX_ACTIONS
  ], { PYTHONIOENCODING: 'cp1252' });

  assert.equal(res.status, 0, `CLI failed under cp1252 with emojis: ${res.stderr}`);
  assert.doesNotMatch(res.stderr, /UnicodeEncodeError/i);
  assert.match(res.stdout, /Successfully imported 'stress_emoji'/);

  // 2. Verify sandbox registry was written with pristine UTF-8 string
  const actions = JSON.parse(fs.readFileSync(SANDBOX_ACTIONS, 'utf8'));
  assert.equal(actions.dudu.stress_emoji.label, complexLabel);

  // 3. Test JSON stdout mode with CJK characters under PYTHONIOENCODING=cp1252
  const cjkLabel = '布布杜杜 冒险时刻 🌟';
  res = runCli([
    '--file', 'bubu-walk.gif',
    '--pet', 'joint',
    '--name', 'stress_cjk',
    '--label', cjkLabel,
    '--dest-dir', SANDBOX_DIR,
    '--actions-file', SANDBOX_ACTIONS,
    '--dry-run',
    '--json'
  ], { PYTHONIOENCODING: 'cp1252' });

  assert.equal(res.status, 0, `CLI failed under cp1252 with CJK: ${res.stderr}`);
  assert.doesNotMatch(res.stderr, /UnicodeEncodeError/i);
  const jsonOut = JSON.parse(res.stdout);
  assert.equal(jsonOut.entry.name, cjkLabel);
});

// ---------------------------------------------------------
// SUITE 6: JOINT PET & NAME NORMALIZATION VERIFICATION
// ---------------------------------------------------------
test('Stress 7: Joint Pet Import and Prefix Normalization', () => {
  resetSandbox();
  const jointAsset = path.join(SANDBOX_DIR, 'bubu-dudu-stress_hug.gif');

  // Joint pet with 'bubu-dudu-' prefix in name
  const res = runCli([
    '--file', 'bubu-walk.gif',
    '--pet', 'joint',
    '--name', 'bubu-dudu-stress_hug',
    '--label', 'Warm Hug 🤗',
    '--dest-dir', SANDBOX_DIR,
    '--actions-file', SANDBOX_ACTIONS
  ]);

  assert.equal(res.status, 0, `Joint import failed: ${res.stderr}`);
  assert.ok(fs.existsSync(jointAsset), 'Joint asset created at bubu-dudu-stress_hug.gif in sandbox');

  const actions = JSON.parse(fs.readFileSync(SANDBOX_ACTIONS, 'utf8'));
  const entry = actions.joint['stress_hug'];
  assert.ok(entry, 'Joint entry created under normalized key "stress_hug"');
  assert.equal(entry.id, 'stress_hug');
  assert.equal(entry.file, '../bubu-dudu-stress_hug.gif');
  assert.equal(entry.name, 'Warm Hug 🤗');
  assert.ok(Array.isArray(entry.emotes) && entry.emotes.length > 0, 'Joint entry contains emotes array');
});

// Final cleanup hook
test('Stress 8: Hermetic Sandbox Cleanup', () => {
  if (fs.existsSync(SANDBOX_DIR)) {
    fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
  }
  assert.equal(fs.existsSync(SANDBOX_DIR), false, 'Sandbox directory cleanly wiped');
});
