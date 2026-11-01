const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const ACTIONS_JSON_PATH = path.join(ROOT_DIR, 'src', 'actions.json');
const ACTIONS_BACKUP_PATH = path.join(ROOT_DIR, 'src', 'actions.json.test-bak');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const SAMPLE_GIF_PATH = path.join(FIXTURES_DIR, 'sample-wave.gif');
const IMPORTED_ASSET_PATH = path.join(ROOT_DIR, 'dudu-sample_wave.gif');

function createSampleGifFixture(destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const pyScript = `
from PIL import Image
im1 = Image.new('RGBA', (32, 32), (255, 255, 255, 255))
im2 = Image.new('RGBA', (32, 32), (255, 255, 255, 255))
for x in range(10, 22):
    for y in range(10, 22):
        im1.putpixel((x, y), (255, 0, 0, 255))
        im2.putpixel((x, y), (0, 0, 255, 255))
im1.save(r'${destPath.replace(/\\/g, '\\\\')}', format='GIF', save_all=True, append_images=[im2], duration=100, loop=0, disposal=2)
`;
  execFileSync('python', ['-c', pyScript]);
}

test('End-to-End Sample GIF Import Verification', async (t) => {
  // 1. Setup backup and fixture
  assert.ok(fs.existsSync(ACTIONS_JSON_PATH), 'src/actions.json must exist');
  fs.copyFileSync(ACTIONS_JSON_PATH, ACTIONS_BACKUP_PATH);

  try {
    createSampleGifFixture(SAMPLE_GIF_PATH);
    assert.ok(fs.existsSync(SAMPLE_GIF_PATH), 'Fixture GIF successfully created');

    // 2. Verify baseline
    const initialActions = JSON.parse(fs.readFileSync(ACTIONS_JSON_PATH, 'utf8'));
    assert.equal(initialActions.dudu['sample_wave'], undefined, 'sample_wave must not exist prior to import');

    // 3. Execute Import Tool
    const importScript = path.join(ROOT_DIR, 'tools', 'import_gif.py');
    const stdout = execFileSync('python', [
      importScript,
      '--file', SAMPLE_GIF_PATH,
      '--pet', 'dudu',
      '--name', 'sample_wave',
      '--label', 'Sample Wave 👋',
      '--category', 'special',
      '--speed', '0.0',
      '--duration-min', '3000',
      '--duration-max', '5000',
      '--natural-facing', '1',
      '--remove-bg',
      '--dest-dir', ROOT_DIR,
      '--actions-file', ACTIONS_JSON_PATH,
      '--json'
    ], { encoding: 'utf8' });

    const result = JSON.parse(stdout);
    assert.equal(result.success, true, 'Import tool returned success: true');

    // 4. Verify created asset
    assert.ok(fs.existsSync(IMPORTED_ASSET_PATH), 'Imported asset exists at project root');
    const stat = fs.statSync(IMPORTED_ASSET_PATH);
    assert.ok(stat.size > 0, 'Imported asset size is greater than 0');

    // Verify magic header
    const fd = fs.openSync(IMPORTED_ASSET_PATH, 'r');
    const headerBuf = Buffer.alloc(6);
    fs.readSync(fd, headerBuf, 0, 6, 0);
    fs.closeSync(fd);
    assert.ok(headerBuf.toString().startsWith('GIF'), 'Asset has valid GIF magic header');

    // 5. Verify actions.json updated with valid schema
    delete require.cache[require.resolve(ACTIONS_JSON_PATH)];
    const updatedActions = JSON.parse(fs.readFileSync(ACTIONS_JSON_PATH, 'utf8'));
    const entry = updatedActions.dudu['sample_wave'];
    assert.ok(entry, 'Registry has sample_wave entry');
    assert.equal(entry.file, '../dudu-sample_wave.gif');
    assert.equal(entry.label, 'Sample Wave 👋');
    assert.equal(entry.category, 'special');
    assert.equal(entry.speed, 0.0);
    assert.deepEqual(entry.duration, [3000, 5000]);
    assert.equal(entry.naturalFacing, 1);
    assert.equal(entry.menu, true);

    // 6. Test Dynamic Menu Builder integration
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        sentEvents: [],
        send: function(channel, ...args) {
          this.sentEvents.push({ channel, args });
        }
      }
    };

    const { buildPetActionSubmenus } = require(path.join(ROOT_DIR, 'src', 'main.js'));
    const menus = buildPetActionSubmenus('dudu', mockWindow);

    // Find the Special category submenu
    const specialCat = menus.find(m => m.label.includes('Special'));
    assert.ok(specialCat, 'Special Actions category exists in dynamic menu');

    const menuItem = specialCat.submenu.find(item => item.label === 'Sample Wave 👋');
    assert.ok(menuItem, 'Sample Wave menu item dynamically appears in menu without code edits');

    // Simulate clicking the menu item
    menuItem.click();
    assert.equal(mockWindow.webContents.sentEvents.length, 1);
    assert.equal(mockWindow.webContents.sentEvents[0].channel, 'trigger-action');
    assert.equal(mockWindow.webContents.sentEvents[0].args[0], 'sample_wave');

    // 7. Verify Renderer State Machine (pet.js)
    const petJsCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pet.js'), 'utf8');
    const domImg = {
      src: '',
      classList: {
        _set: new Set(),
        add: function(...cls) { cls.forEach(c => this._set.add(c)); },
        remove: function(...cls) { cls.forEach(c => this._set.delete(c)); },
        contains: function(c) { return this._set.has(c); }
      },
      style: {}
    };

    const mockElectronAPI = {
      onPetInit: (cb) => { mockElectronAPI._initCb = cb; },
      onTriggerAction: (cb) => { mockElectronAPI._trigger = cb; },
      onScaleChange: () => {},
      onToggleGhostMode: () => {},
      onResetPosition: () => {},
      onFeedPet: () => {},
      onPutToSleep: () => {},
      onWakeUpPet: () => {},
      onJointAction: () => {},
      onJointFinish: () => {},
      onHitBoundary: () => {},
      updatePosition: () => {},
      updatePetStats: () => {},
      movePet: () => {},
      getActions: () => updatedActions
    };

    const sandbox = {
      window: {
        electronAPI: mockElectronAPI,
        addEventListener: () => {},
        removeEventListener: () => {}
      },
      document: {
        getElementById: (id) => (id === 'pet-img' ? domImg : { classList: { add: () => {}, remove: () => {} }, appendChild: () => {}, querySelectorAll: () => [] }),
        documentElement: { style: { setProperty: () => {} } },
        title: ''
      },
      encodeURI: (x) => x,
      setTimeout: () => 1,
      clearTimeout: () => {},
      setInterval: () => 1,
      clearInterval: () => {}
    };

    vm.createContext(sandbox);
    vm.runInContext(petJsCode, sandbox);

    // Initialize pet with dynamic actions
    mockElectronAPI._initCb({
      name: 'dudu',
      scale: 1.0,
      floorY: 850,
      actions: updatedActions.dudu
    });

    // Trigger sample_wave in renderer
    mockElectronAPI._trigger('sample_wave');
    assert.ok(domImg.src.includes('dudu-sample_wave.gif'), `Renderer updated image src to imported asset, got: ${domImg.src}`);

  } finally {
    // 8. Atomic Teardown
    if (fs.existsSync(ACTIONS_BACKUP_PATH)) {
      fs.copyFileSync(ACTIONS_BACKUP_PATH, ACTIONS_JSON_PATH);
      fs.unlinkSync(ACTIONS_BACKUP_PATH);
    }
    if (fs.existsSync(IMPORTED_ASSET_PATH)) {
      fs.unlinkSync(IMPORTED_ASSET_PATH);
    }
    if (fs.existsSync(SAMPLE_GIF_PATH)) {
      fs.unlinkSync(SAMPLE_GIF_PATH);
    }
  }
});

test('Stress Test 1: Bubu Dynamic Import with Movement, NaturalFacing -1, and Unicode Label', async (t) => {
  const BUBU_ASSET_PATH = path.join(ROOT_DIR, 'bubu-stress_rocket.gif');
  const STRESS_FIXTURE_PATH = path.join(FIXTURES_DIR, 'stress-rocket.gif');

  assert.ok(fs.existsSync(ACTIONS_JSON_PATH), 'src/actions.json must exist');
  fs.copyFileSync(ACTIONS_JSON_PATH, ACTIONS_BACKUP_PATH);

  try {
    createSampleGifFixture(STRESS_FIXTURE_PATH);
    assert.ok(fs.existsSync(STRESS_FIXTURE_PATH), 'Fixture GIF created');

    const importScript = path.join(ROOT_DIR, 'tools', 'import_gif.py');
    const stdout = execFileSync('python', [
      importScript,
      '--file', STRESS_FIXTURE_PATH,
      '--pet', 'bubu',
      '--name', 'stress_rocket',
      '--label', 'Rocket Dash 🚀 บินเร็ว',
      '--category', 'movement',
      '--speed', '3.6',
      '--duration-min', '2500',
      '--duration-max', '4500',
      '--natural-facing', '-1',
      '--remove-bg',
      '--dest-dir', ROOT_DIR,
      '--actions-file', ACTIONS_JSON_PATH,
      '--json'
    ], { encoding: 'utf8' });

    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.equal(result.pet, 'bubu');
    assert.equal(result.actionKey, 'stress_rocket');
    assert.equal(result.backgroundRemoved, true);

    // Verify asset on disk
    assert.ok(fs.existsSync(BUBU_ASSET_PATH), 'Bubu asset created at root');
    const stat = fs.statSync(BUBU_ASSET_PATH);
    assert.ok(stat.size > 0, 'Asset file size > 0');

    // Magic bytes check
    const fd = fs.openSync(BUBU_ASSET_PATH, 'r');
    const headerBuf = Buffer.alloc(6);
    fs.readSync(fd, headerBuf, 0, 6, 0);
    fs.closeSync(fd);
    assert.ok(headerBuf.toString().startsWith('GIF'), 'Magic header is valid GIF');

    // Schema validation via src/actions.js
    const actionsModule = require(path.join(ROOT_DIR, 'src', 'actions.js'));
    const updatedActions = JSON.parse(fs.readFileSync(ACTIONS_JSON_PATH, 'utf8'));
    const schemaErrors = actionsModule.validateSchema(updatedActions);
    assert.deepEqual(schemaErrors, [], 'actions.json conforms to schema with 0 errors');

    const bubuEntry = updatedActions.bubu['stress_rocket'];
    assert.ok(bubuEntry, 'bubu.stress_rocket entry exists');
    assert.equal(bubuEntry.file, '../bubu-stress_rocket.gif');
    assert.equal(bubuEntry.speed, 3.6);
    assert.equal(bubuEntry.naturalFacing, -1);
    assert.equal(bubuEntry.category, 'movement');
    assert.equal(bubuEntry.menu, true);
    assert.equal(bubuEntry.label, 'Rocket Dash 🚀 บินเร็ว');

    // Dynamic Menu Generation in main.js
    const { buildPetActionSubmenus } = require(path.join(ROOT_DIR, 'src', 'main.js'));
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        sentEvents: [],
        send: function(channel, ...args) {
          this.sentEvents.push({ channel, args });
        }
      }
    };

    const bubuMenus = buildPetActionSubmenus('bubu', mockWindow);
    const movementCat = bubuMenus.find(m => m.label.includes('Movement'));
    assert.ok(movementCat, 'Movement category found in dynamic menu');

    const rocketItem = movementCat.submenu.find(item => item.label === 'Rocket Dash 🚀 บินเร็ว');
    assert.ok(rocketItem, 'Rocket Dash menu item present in Movement category');

    rocketItem.click();
    assert.equal(mockWindow.webContents.sentEvents.length, 1);
    assert.equal(mockWindow.webContents.sentEvents[0].channel, 'trigger-action');
    assert.equal(mockWindow.webContents.sentEvents[0].args[0], 'stress_rocket');

    // Pet State Machine & Animation Engine in pet.js
    const petJsCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pet.js'), 'utf8');
    const domImg = {
      src: '',
      classList: {
        _set: new Set(),
        add: function(...cls) { cls.forEach(c => this._set.add(c)); },
        remove: function(...cls) { cls.forEach(c => this._set.delete(c)); },
        contains: function(c) { return this._set.has(c); }
      },
      style: {}
    };

    const movedPositions = [];
    let moveLoopIntervalFn = null;

    const mockElectronAPI = {
      onPetInit: (cb) => { mockElectronAPI._initCb = cb; },
      onTriggerAction: (cb) => { mockElectronAPI._trigger = cb; },
      onScaleChange: () => {},
      onToggleGhostMode: () => {},
      onResetPosition: () => {},
      onFeedPet: () => {},
      onPutToSleep: () => {},
      onWakeUpPet: () => {},
      onJointAction: () => {},
      onJointFinish: () => {},
      onHitBoundary: () => {},
      updatePosition: () => {},
      updatePetStats: () => {},
      movePet: (step, dy) => {
        movedPositions.push({ step, dy });
      },
      getActions: () => updatedActions
    };

    const sandbox = {
      window: {
        electronAPI: mockElectronAPI,
        addEventListener: () => {},
        removeEventListener: () => {}
      },
      document: {
        getElementById: (id) => (id === 'pet-img' ? domImg : { classList: { add: () => {}, remove: () => {} }, appendChild: () => {}, querySelectorAll: () => [] }),
        documentElement: { style: { setProperty: () => {} } },
        title: ''
      },
      encodeURI: (x) => encodeURI(x),
      setTimeout: (fn, ms) => 1,
      clearTimeout: () => {},
      setInterval: (fn, ms) => {
        moveLoopIntervalFn = fn;
        return 1;
      },
      clearInterval: () => {}
    };

    vm.createContext(sandbox);
    vm.runInContext(petJsCode, sandbox);

    mockElectronAPI._initCb({
      name: 'bubu',
      scale: 1.0,
      floorY: 850,
      actions: updatedActions.bubu
    });

    mockElectronAPI._trigger('stress_rocket');
    assert.ok(domImg.src.includes('bubu-stress_rocket.gif'), `Image src switched to: ${domImg.src}`);
    assert.ok(domImg.classList.contains('flip-left'), 'Naturally-left action has flip-left class when facing right');

    assert.ok(typeof moveLoopIntervalFn === 'function', 'Movement loop is active');
    movedPositions.length = 0;
    moveLoopIntervalFn();
    assert.ok(movedPositions.length > 0, 'Movement loop dispatched movePet');
    assert.ok(Math.abs(movedPositions[0].step - 3.6) < 0.01, `Step matches speed 3.6, got ${movedPositions[0].step}`);

  } finally {
    if (fs.existsSync(ACTIONS_BACKUP_PATH)) {
      fs.copyFileSync(ACTIONS_BACKUP_PATH, ACTIONS_JSON_PATH);
      fs.unlinkSync(ACTIONS_BACKUP_PATH);
    }
    if (fs.existsSync(BUBU_ASSET_PATH)) {
      fs.unlinkSync(BUBU_ASSET_PATH);
    }
    if (fs.existsSync(STRESS_FIXTURE_PATH)) {
      fs.unlinkSync(STRESS_FIXTURE_PATH);
    }
  }
});

test('Stress Test 2: Hidden Action (--no-menu) Excluded from Menus but Executable in Engine', async (t) => {
  const HIDDEN_ASSET_PATH = path.join(ROOT_DIR, 'dudu-stress_hidden.gif');
  const FIXTURE_PATH = path.join(FIXTURES_DIR, 'stress-hidden.gif');

  assert.ok(fs.existsSync(ACTIONS_JSON_PATH), 'src/actions.json must exist');
  fs.copyFileSync(ACTIONS_JSON_PATH, ACTIONS_BACKUP_PATH);

  try {
    createSampleGifFixture(FIXTURE_PATH);

    const importScript = path.join(ROOT_DIR, 'tools', 'import_gif.py');
    const stdout = execFileSync('python', [
      importScript,
      '--file', FIXTURE_PATH,
      '--pet', 'dudu',
      '--name', 'stress_hidden',
      '--label', 'Secret Easter Egg 🤫',
      '--category', 'special',
      '--no-menu',
      '--dest-dir', ROOT_DIR,
      '--actions-file', ACTIONS_JSON_PATH,
      '--json'
    ], { encoding: 'utf8' });

    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.equal(result.entry.menu, false, 'Entry explicitly sets menu: false');

    const updatedActions = JSON.parse(fs.readFileSync(ACTIONS_JSON_PATH, 'utf8'));
    assert.equal(updatedActions.dudu.stress_hidden.menu, false);

    // Verify dynamic menu builder in main.js excludes it
    const { buildPetActionSubmenus } = require(path.join(ROOT_DIR, 'src', 'main.js'));
    const duduMenus = buildPetActionSubmenus('dudu');
    const allLabels = duduMenus.flatMap(cat => cat.submenu.map(item => item.label));
    assert.ok(!allLabels.includes('Secret Easter Egg 🤫'), 'Hidden action does NOT appear in dynamic menus');

    // Verify pet.js engine CAN still execute it if triggered programmatically
    const petJsCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pet.js'), 'utf8');
    const domImg = { src: '', classList: { add: () => {}, remove: () => {}, contains: () => false }, style: {} };
    const mockElectronAPI = {
      onPetInit: (cb) => { mockElectronAPI._initCb = cb; },
      onTriggerAction: (cb) => { mockElectronAPI._trigger = cb; },
      onScaleChange: () => {},
      onToggleGhostMode: () => {},
      onResetPosition: () => {},
      onFeedPet: () => {},
      onPutToSleep: () => {},
      onWakeUpPet: () => {},
      onJointAction: () => {},
      onJointFinish: () => {},
      onHitBoundary: () => {},
      updatePosition: () => {},
      updatePetStats: () => {},
      movePet: () => {},
      getActions: () => updatedActions
    };

    const sandbox = {
      window: { electronAPI: mockElectronAPI, addEventListener: () => {}, removeEventListener: () => {} },
      document: {
        getElementById: () => domImg,
        documentElement: { style: { setProperty: () => {} } },
        title: ''
      },
      encodeURI: (x) => encodeURI(x),
      setTimeout: () => 1,
      clearTimeout: () => {},
      setInterval: () => 1,
      clearInterval: () => {}
    };

    vm.createContext(sandbox);
    vm.runInContext(petJsCode, sandbox);

    mockElectronAPI._initCb({ name: 'dudu', scale: 1.0, floorY: 850, actions: updatedActions.dudu });
    mockElectronAPI._trigger('stress_hidden');
    assert.ok(domImg.src.includes('dudu-stress_hidden.gif'), 'Engine executes hidden action directly');

  } finally {
    if (fs.existsSync(ACTIONS_BACKUP_PATH)) {
      fs.copyFileSync(ACTIONS_BACKUP_PATH, ACTIONS_JSON_PATH);
      fs.unlinkSync(ACTIONS_BACKUP_PATH);
    }
    if (fs.existsSync(HIDDEN_ASSET_PATH)) {
      fs.unlinkSync(HIDDEN_ASSET_PATH);
    }
    if (fs.existsSync(FIXTURE_PATH)) {
      fs.unlinkSync(FIXTURE_PATH);
    }
  }
});

test('Stress Test 3: Joint Animation Dynamic Import and Menu Integration', async (t) => {
  const JOINT_ASSET_PATH = path.join(ROOT_DIR, 'bubu-dudu-stress_highjump.gif');
  const FIXTURE_PATH = path.join(FIXTURES_DIR, 'stress-joint.gif');

  assert.ok(fs.existsSync(ACTIONS_JSON_PATH), 'src/actions.json must exist');
  fs.copyFileSync(ACTIONS_JSON_PATH, ACTIONS_BACKUP_PATH);

  try {
    createSampleGifFixture(FIXTURE_PATH);

    const importScript = path.join(ROOT_DIR, 'tools', 'import_gif.py');
    const stdout = execFileSync('python', [
      importScript,
      '--file', FIXTURE_PATH,
      '--pet', 'joint',
      '--name', 'stress_highjump',
      '--label', 'High Jump Duo 🌟',
      '--duration-max', '4800',
      '--dest-dir', ROOT_DIR,
      '--actions-file', ACTIONS_JSON_PATH,
      '--json'
    ], { encoding: 'utf8' });

    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.equal(result.pet, 'joint');
    assert.equal(result.actionKey, 'stress_highjump');

    const updatedActions = JSON.parse(fs.readFileSync(ACTIONS_JSON_PATH, 'utf8'));
    assert.ok(updatedActions.joint.stress_highjump, 'Joint entry exists');
    assert.equal(updatedActions.joint.stress_highjump.name, 'High Jump Duo 🌟');
    assert.equal(updatedActions.joint.stress_highjump.file, '../bubu-dudu-stress_highjump.gif');
    assert.equal(updatedActions.joint.stress_highjump.duration, 4800);

    const { buildCoupleActionSubmenu } = require(path.join(ROOT_DIR, 'src', 'main.js'));
    const coupleSubmenu = buildCoupleActionSubmenu();
    const item = coupleSubmenu.find(i => i.label === 'High Jump Duo 🌟');
    assert.ok(item, 'Joint animation dynamically appears in Couple Actions submenu');

  } finally {
    if (fs.existsSync(ACTIONS_BACKUP_PATH)) {
      fs.copyFileSync(ACTIONS_BACKUP_PATH, ACTIONS_JSON_PATH);
      fs.unlinkSync(ACTIONS_BACKUP_PATH);
    }
    if (fs.existsSync(JOINT_ASSET_PATH)) {
      fs.unlinkSync(JOINT_ASSET_PATH);
    }
    if (fs.existsSync(FIXTURE_PATH)) {
      fs.unlinkSync(FIXTURE_PATH);
    }
  }
});

test('Stress Test 4: Dynamic Hot-Reloading & Corrupted actions.json Resilience', async (t) => {
  assert.ok(fs.existsSync(ACTIONS_JSON_PATH), 'src/actions.json must exist');
  fs.copyFileSync(ACTIONS_JSON_PATH, ACTIONS_BACKUP_PATH);

  try {
    const { loadActions, buildPetActionSubmenus } = require(path.join(ROOT_DIR, 'src', 'main.js'));

    // Hot-reload check: Directly add an action without restarting process
    const currentActions = JSON.parse(fs.readFileSync(ACTIONS_JSON_PATH, 'utf8'));
    currentActions.bubu['hot_reload_test'] = {
      file: '../bubu-walk.gif',
      speed: 1.0,
      duration: [2000, 4000],
      naturalFacing: 1,
      label: 'Hot Reload Test ⚡',
      category: 'special',
      menu: true
    };
    fs.writeFileSync(ACTIONS_JSON_PATH, JSON.stringify(currentActions, null, 2), 'utf8');

    const menus = buildPetActionSubmenus('bubu');
    const specialCat = menus.find(m => m.label.includes('Special'));
    assert.ok(specialCat, 'Special category exists');
    const hotReloadItem = specialCat.submenu.find(i => i.label === 'Hot Reload Test ⚡');
    assert.ok(hotReloadItem, 'Direct on-disk mutation hot-reloads into menus without process restart');

    // Corrupted JSON resilience: Write syntax error
    fs.writeFileSync(ACTIONS_JSON_PATH, 'INVALID_JSON{{{', 'utf8');
    const fallbackData = loadActions();
    assert.ok(fallbackData, 'loadActions returns fallback object');
    assert.deepEqual(fallbackData.bubu, {}, 'fallback bubu is safe empty object');
    assert.deepEqual(fallbackData.dudu, {}, 'fallback dudu is safe empty object');

    const safeSubmenus = buildPetActionSubmenus('bubu');
    assert.deepEqual(safeSubmenus, [], 'buildPetActionSubmenus gracefully returns empty array on corrupted actions.json');

  } finally {
    if (fs.existsSync(ACTIONS_BACKUP_PATH)) {
      fs.copyFileSync(ACTIONS_BACKUP_PATH, ACTIONS_JSON_PATH);
      fs.unlinkSync(ACTIONS_BACKUP_PATH);
    }
  }
});

test('Stress Test 5: Fallback & Non-Interruptible State Safety in Renderer Engine', async (t) => {
  const petJsCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pet.js'), 'utf8');
  const domImg = { src: '', classList: { add: () => {}, remove: () => {}, contains: () => false }, style: {} };

  const mockElectronAPI = {
    onPetInit: (cb) => { mockElectronAPI._initCb = cb; },
    onTriggerAction: (cb) => { mockElectronAPI._trigger = cb; },
    onScaleChange: () => {},
    onToggleGhostMode: () => {},
    onResetPosition: () => {},
    onFeedPet: () => {},
    onPutToSleep: () => {},
    onWakeUpPet: () => {},
    onJointAction: (cb) => { mockElectronAPI._joint = cb; },
    onJointFinish: () => {},
    onHitBoundary: () => {},
    updatePosition: () => {},
    updatePetStats: () => {},
    movePet: () => {},
    getActions: () => null
  };

  const sandbox = {
    window: { electronAPI: mockElectronAPI, addEventListener: () => {}, removeEventListener: () => {} },
    document: {
      getElementById: () => domImg,
      documentElement: { style: { setProperty: () => {} } },
      title: ''
    },
    encodeURI: (x) => encodeURI(x),
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {}
  };

  vm.createContext(sandbox);
  vm.runInContext(petJsCode, sandbox);

  mockElectronAPI._initCb({ name: 'dudu', scale: 1.0, floorY: 850, actions: null });

  // Unknown action fallback
  mockElectronAPI._trigger('totally_unknown_action_xyz');
  assert.ok(domImg.src.includes('dudu-walk.gif'), 'Unknown action gracefully falls back to walk');

  // State protection: While joint action is active, onTriggerAction must NOT override it
  mockElectronAPI._joint({ file: '../dudu-bubu-kiss.gif', duration: 5800, emotes: ['❤️'] });
  assert.ok(domImg.src.includes('kiss.gif'), 'Joint action active');

  mockElectronAPI._trigger('dance');
  assert.ok(domImg.src.includes('kiss.gif'), 'Action trigger while in joint action is safely ignored');
});

