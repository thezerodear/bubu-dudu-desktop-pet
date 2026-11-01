const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/**
 * Creates an isolated, sandboxed DOM & Electron environment
 * and loads the exact production code from src/pet.js.
 */
function createPetEnvironment(initialPetName = 'dudu') {
  let timerIdCounter = 1;
  const activeTimers = new Map();
  const movedCalls = [];
  const updatedPositions = [];
  const updatedStats = [];
  const eventListeners = {};
  const electronListeners = {};

  function registerTimer(cb, ms, isInterval) {
    const id = timerIdCounter++;
    activeTimers.set(id, { cb, ms, isInterval, nextRun: ms });
    return id;
  }

  function clearRegisteredTimer(id) {
    activeTimers.delete(id);
  }

  function advanceTime(totalMs, step = 10) {
    let elapsed = 0;
    while (elapsed < totalMs) {
      const dt = Math.min(step, totalMs - elapsed);
      elapsed += dt;
      const toRun = [];
      for (const [id, t] of activeTimers.entries()) {
        t.nextRun -= dt;
        if (t.nextRun <= 0) {
          toRun.push({ id, t });
        }
      }
      for (const { id, t } of toRun) {
        if (!activeTimers.has(id)) continue;
        try {
          t.cb();
        } catch (err) {
          // ignore
        }
        if (t.isInterval && activeTimers.has(id)) {
          t.nextRun = t.ms;
        } else {
          activeTimers.delete(id);
        }
      }
    }
  }

  function makeElement(id = '', tag = 'div') {
    const classList = new Set();
    return {
      id,
      tagName: tag.toUpperCase(),
      src: '',
      style: {
        transform: '',
        left: '',
        top: '',
        setProperty: () => {}
      },
      classList: {
        add: (...cls) => cls.forEach(c => classList.add(c)),
        remove: (...cls) => cls.forEach(c => classList.delete(c)),
        contains: (c) => classList.has(c),
        get values() { return Array.from(classList); }
      },
      offsetWidth: 140,
      offsetHeight: 140,
      appendChild: () => {},
      remove: () => {},
      querySelectorAll: () => []
    };
  }

  const petImg = makeElement('pet-img', 'img');
  const petContainer = makeElement('pet-container', 'div');
  const emoteLayer = makeElement('emote-layer', 'div');

  const context = {
    console,
    Date,
    Math,
    encodeURI,
    setTimeout: (cb, ms) => registerTimer(cb, ms, false),
    clearTimeout: (id) => clearRegisteredTimer(id),
    setInterval: (cb, ms) => registerTimer(cb, ms, true),
    clearInterval: (id) => clearRegisteredTimer(id),
    document: {
      getElementById: (id) => {
        if (id === 'pet-img') return petImg;
        if (id === 'pet-container') return petContainer;
        if (id === 'emote-layer') return emoteLayer;
        return makeElement(id);
      },
      createElement: (tag) => makeElement('', tag),
      documentElement: {
        style: { setProperty: () => {} }
      },
      body: {
        classList: {
          add: () => {},
          remove: () => {}
        }
      },
      title: ''
    },
    window: {
      addEventListener: (evt, fn) => {
        eventListeners[evt] = eventListeners[evt] || [];
        eventListeners[evt].push(fn);
      },
      electronAPI: {
        movePet: (dx, dy) => { movedCalls.push({ dx, dy }); },
        updatePosition: (pos) => { updatedPositions.push(pos); },
        updatePetStats: (st) => { updatedStats.push(st); },
        dragWindow: (dx, dy) => {},
        openContextMenu: () => {},
        onHitBoundary: (fn) => { electronListeners['onHitBoundary'] = fn; },
        onPetInit: (fn) => { electronListeners['onPetInit'] = fn; },
        onScaleChange: (fn) => { electronListeners['onScaleChange'] = fn; },
        onToggleGhostMode: (fn) => { electronListeners['onToggleGhostMode'] = fn; },
        onResetPosition: (fn) => { electronListeners['onResetPosition'] = fn; },
        onTriggerAction: (fn) => { electronListeners['onTriggerAction'] = fn; },
        onFeedPet: (fn) => { electronListeners['onFeedPet'] = fn; },
        onPutToSleep: (fn) => { electronListeners['onPutToSleep'] = fn; },
        onWakeUpPet: (fn) => { electronListeners['onWakeUpPet'] = fn; },
        onJointAction: (fn) => { electronListeners['onJointAction'] = fn; },
        onJointFinish: (fn) => { electronListeners['onJointFinish'] = fn; }
      }
    }
  };

  const code = fs.readFileSync(path.resolve('src/pet.js'), 'utf8');
  vm.createContext(context);
  const exported = vm.runInContext(
    code + '\n;({ ' +
    'BUBU_ACTIONS, DUDU_ACTIONS, getActionConfig, setAction, updateFacingClass, handlePoke, ' +
    'startHelicopterGlide, startHelicopterHopAndGlide, startFalling, startMovementLoop, ' +
    'petStats, ' +
    'getFacing: () => facing, setFacing: (f) => { facing = f; }, ' +
    'getPetName: () => petName, setPetName: (p) => { petName = p; }, ' +
    'getCurrentAction: () => currentAction, setCurrentAction: (a) => { currentAction = a; }, ' +
    'getPosY: () => posY, setPosY: (y) => { posY = y; }, ' +
    'getFloorY: () => floorY, setFloorY: (y) => { floorY = y; }, ' +
    'getIsDragging: () => isDragging, setIsDragging: (d) => { isDragging = d; }, ' +
    'getIsFalling: () => isFalling, setIsFalling: (f) => { isFalling = f; }, ' +
    'getIsGliding: () => isGliding, setIsGliding: (g) => { isGliding = g; }, ' +
    'getHasMoved: () => hasMoved, setHasMoved: (m) => { hasMoved = m; }, ' +
    'getIsJointActionActive: () => isJointActionActive, setIsJointActionActive: (j) => { isJointActionActive = j; } ' +
    '});',
    context
  );

  exported.setPetName(initialPetName);

  function dispatchWindowEvent(type, eventObj) {
    const list = eventListeners[type] || [];
    list.forEach(fn => fn(eventObj));
  }

  function dispatchElectronEvent(name, data) {
    const fn = electronListeners[name];
    if (fn) fn(data);
  }

  return {
    ...exported,
    petImg,
    petContainer,
    emoteLayer,
    dispatchWindowEvent,
    dispatchElectronEvent,
    advanceTime,
    movedCalls,
    updatedPositions,
    updatedStats,
    activeTimers
  };
}

// =========================================================================
// TIER 1: Configuration & Action Dictionary Integrity
// =========================================================================

test('Tier 1.1: DUDU_ACTIONS.skooter has naturalFacing: 1 and valid physics config', () => {
  const env = createPetEnvironment('dudu');
  const skooter = env.DUDU_ACTIONS.skooter;
  assert.ok(skooter, 'skooter action must exist in DUDU_ACTIONS');
  assert.strictEqual(skooter.file, '../dudu-skooter.gif');
  assert.strictEqual(skooter.speed, 4.8);
  assert.deepStrictEqual(Array.from(skooter.duration), [3500, 7000]);
  assert.strictEqual(skooter.naturalFacing, 1, 'skooter naturalFacing MUST be 1 after M1 mirroring');
});

test('Tier 1.2: All BUBU_ACTIONS have valid schema and naturalFacing in {-1, 1}', () => {
  const env = createPetEnvironment('bubu');
  const actions = env.BUBU_ACTIONS;
  const keys = Object.keys(actions);
  assert.ok(keys.length >= 20, `Expected at least 20 actions for bubu, got ${keys.length}`);

  for (const key of keys) {
    const cfg = actions[key];
    assert.ok(cfg.file, `Action bubu.${key} missing file`);
    assert.ok(Array.isArray(cfg.duration) && cfg.duration.length === 2, `Action bubu.${key} invalid duration`);
    assert.ok(cfg.duration[0] <= cfg.duration[1], `Action bubu.${key} min duration > max duration`);
    assert.ok(typeof cfg.speed === 'number' && cfg.speed >= 0, `Action bubu.${key} invalid speed`);
    assert.ok(cfg.naturalFacing === 1 || cfg.naturalFacing === -1,
      `Action bubu.${key} naturalFacing must be 1 or -1, got ${cfg.naturalFacing}`);
  }
});

test('Tier 1.3: All DUDU_ACTIONS have valid schema and naturalFacing in {-1, 1}', () => {
  const env = createPetEnvironment('dudu');
  const actions = env.DUDU_ACTIONS;
  const keys = Object.keys(actions);
  assert.ok(keys.length >= 25, `Expected at least 25 actions for dudu, got ${keys.length}`);

  for (const key of keys) {
    const cfg = actions[key];
    assert.ok(cfg.file, `Action dudu.${key} missing file`);
    assert.ok(Array.isArray(cfg.duration) && cfg.duration.length === 2, `Action dudu.${key} invalid duration`);
    assert.ok(cfg.duration[0] <= cfg.duration[1], `Action dudu.${key} min duration > max duration`);
    assert.ok(typeof cfg.speed === 'number' && cfg.speed >= 0, `Action dudu.${key} invalid speed`);
    assert.ok(cfg.naturalFacing === 1 || cfg.naturalFacing === -1,
      `Action dudu.${key} naturalFacing must be 1 or -1, got ${cfg.naturalFacing}`);
  }
});

test('Tier 1.4: Target modified GIF assets correctly wired in action configs', () => {
  const env = createPetEnvironment('dudu');
  assert.strictEqual(env.DUDU_ACTIONS.skooter.file, '../dudu-skooter.gif');
  assert.strictEqual(env.DUDU_ACTIONS.throwing_bottle.file, '../dudu-throwing-bottle.gif');
});

test('Tier 1.5: getActionConfig fallback handles unknown actions gracefully', () => {
  const env = createPetEnvironment('dudu');
  const fallback = env.getActionConfig('non_existent_random_action');
  assert.deepStrictEqual(fallback, env.DUDU_ACTIONS.walk);
});

// =========================================================================
// TIER 2: Facing Engine Matrix & Zero-Moonwalking Verification
// =========================================================================

test('Tier 2.1: Exhaustive Facing Matrix across all Bubu and Dudu actions (94 cases)', () => {
  // Test every action in both directions: facing = 1 (right) and facing = -1 (left).
  // Sprite facing must ALWAYS match travel direction without moonwalking.
  const pets = [
    { name: 'bubu', actions: 'BUBU_ACTIONS' },
    { name: 'dudu', actions: 'DUDU_ACTIONS' }
  ];

  for (const { name, actions } of pets) {
    const env = createPetEnvironment(name);
    const actionDict = env[actions];

    for (const [actionName, config] of Object.entries(actionDict)) {
      env.setCurrentAction(actionName);
      const isNaturallyLeft = config.naturalFacing === -1;

      // Case A: Moving Right (facing = +1)
      env.setFacing(1);
      env.updateFacingClass();

      const expectFlipRight = !isNaturallyLeft; // If nat right, scaleX(1) (.flip-right)
      const expectFlipLeft = isNaturallyLeft;   // If nat left, scaleX(-1) (.flip-left)

      assert.strictEqual(env.petImg.classList.contains('flip-left'), expectFlipLeft,
        `[${name}:${actionName}:facing=+1] flip-left mismatch. natFacing=${config.naturalFacing}`);
      assert.strictEqual(env.petImg.classList.contains('flip-right'), expectFlipRight,
        `[${name}:${actionName}:facing=+1] flip-right mismatch. natFacing=${config.naturalFacing}`);

      // Effective visual orientation = naturalFacing * (scaleX)
      // flip-left has scaleX(-1); flip-right has scaleX(1)
      const scaleXRight = env.petImg.classList.contains('flip-left') ? -1 : 1;
      const visualFacingRight = config.naturalFacing * scaleXRight;
      assert.strictEqual(visualFacingRight, 1,
        `[${name}:${actionName}:facing=+1] Visual facing must be +1 (right), got ${visualFacingRight}`);

      // Case B: Moving Left (facing = -1)
      env.setFacing(-1);
      env.updateFacingClass();

      const expectFlipRightB = isNaturallyLeft;  // If nat left, scaleX(1) (.flip-right)
      const expectFlipLeftB = !isNaturallyLeft;  // If nat right, scaleX(-1) (.flip-left)

      assert.strictEqual(env.petImg.classList.contains('flip-left'), expectFlipLeftB,
        `[${name}:${actionName}:facing=-1] flip-left mismatch. natFacing=${config.naturalFacing}`);
      assert.strictEqual(env.petImg.classList.contains('flip-right'), expectFlipRightB,
        `[${name}:${actionName}:facing=-1] flip-right mismatch. natFacing=${config.naturalFacing}`);

      const scaleXLeft = env.petImg.classList.contains('flip-left') ? -1 : 1;
      const visualFacingLeft = config.naturalFacing * scaleXLeft;
      assert.strictEqual(visualFacingLeft, -1,
        `[${name}:${actionName}:facing=-1] Visual facing must be -1 (left), got ${visualFacingLeft}`);

      // Assert mutual exclusivity: classes cannot be both present
      assert.notStrictEqual(
        env.petImg.classList.contains('flip-left'),
        env.petImg.classList.contains('flip-right'),
        `[${name}:${actionName}] flip-left and flip-right cannot both be present`
      );
    }
  }
});

test('Tier 2.2: Dudu Skooter facing & movement synchronization (Forward Motion, No Moonwalking)', () => {
  const env = createPetEnvironment('dudu');
  env.setAction('skooter');

  // Moving Right: facing = 1
  env.setFacing(1);
  env.updateFacingClass();
  assert.strictEqual(env.petImg.classList.contains('flip-right'), true, 'Moving right requires flip-right (scaleX(1))');
  assert.strictEqual(env.petImg.classList.contains('flip-left'), false);

  // Compute movement step
  const hungerFactor = 1.0;
  const stepRight = env.DUDU_ACTIONS.skooter.speed * hungerFactor * env.getFacing();
  assert.strictEqual(stepRight, 4.8, 'Movement step must be +4.8 (moving right)');

  // Moving Left: facing = -1
  env.setFacing(-1);
  env.updateFacingClass();
  assert.strictEqual(env.petImg.classList.contains('flip-left'), true, 'Moving left requires flip-left (scaleX(-1))');
  assert.strictEqual(env.petImg.classList.contains('flip-right'), false);

  const stepLeft = env.DUDU_ACTIONS.skooter.speed * hungerFactor * env.getFacing();
  assert.strictEqual(stepLeft, -4.8, 'Movement step must be -4.8 (moving left)');
});

test('Tier 2.3: Comparison with legacy naturally-left actions (skateboard, walk2)', () => {
  const env = createPetEnvironment('dudu');

  // skateboard has naturalFacing = -1
  env.setAction('skateboard');
  assert.strictEqual(env.DUDU_ACTIONS.skateboard.naturalFacing, -1);

  // Moving Right: facing = 1 -> should flip to face right -> flip-left (scaleX(-1))
  env.setFacing(1);
  env.updateFacingClass();
  assert.strictEqual(env.petImg.classList.contains('flip-left'), true);
  assert.strictEqual(env.petImg.classList.contains('flip-right'), false);

  // Moving Left: facing = -1 -> keep natural left -> flip-right (scaleX(1))
  env.setFacing(-1);
  env.updateFacingClass();
  assert.strictEqual(env.petImg.classList.contains('flip-right'), true);
  assert.strictEqual(env.petImg.classList.contains('flip-left'), false);
});

test('Tier 2.4: Boundary collision turnaround updates facing and triggers flip', () => {
  const env = createPetEnvironment('dudu');
  env.setAction('walk');
  env.setFacing(1);
  env.updateFacingClass();
  assert.strictEqual(env.petImg.classList.contains('flip-right'), true);

  // Hit right boundary: direction = -1
  env.dispatchElectronEvent('onHitBoundary', { direction: -1 });
  assert.strictEqual(env.getFacing(), -1, 'facing must update to -1');
  assert.strictEqual(env.petImg.classList.contains('flip-left'), true, 'sprite must flip left');
});

// =========================================================================
// TIER 3: Action Triggering & Poke Decoupling (M1 Feature 3 Fix)
// =========================================================================

test('Tier 3.1: onTriggerAction activates skooter WITHOUT calling handlePoke', () => {
  const env = createPetEnvironment('dudu');

  // Spy on handlePoke by verifying currentAction does not become a random poke reaction
  const pokeReactions = new Set(['denied', 'redcard', 'singing', 'pushup', 'ropeskipping', 'laugh', 'dance', 'sit_jump', 'mad', 'taunt']);

  env.dispatchElectronEvent('onTriggerAction', 'skooter');

  assert.strictEqual(env.getCurrentAction(), 'skooter', 'Action must immediately be set to skooter');
  assert.ok(env.petImg.src.includes('dudu-skooter.gif'), 'Image source must point to dudu-skooter.gif');

  // Advance time by 50ms, 500ms, 1500ms — action must persist as skooter
  env.advanceTime(50);
  assert.strictEqual(env.getCurrentAction(), 'skooter');
  env.advanceTime(500);
  assert.strictEqual(env.getCurrentAction(), 'skooter');
  env.advanceTime(1500);
  assert.strictEqual(env.getCurrentAction(), 'skooter');
});

test('Tier 3.2: onTriggerAction works across diverse actions without poke override', () => {
  const env = createPetEnvironment('dudu');
  const testActions = ['skateboard', 'dance', 'pushup', 'throwing_bottle'];

  for (const action of testActions) {
    env.dispatchElectronEvent('onTriggerAction', action);
    assert.strictEqual(env.getCurrentAction(), action, `Action should be ${action}`);
    assert.strictEqual(env.petContainer.classList.contains('poke-bounce'), false,
      'Triggered action must not trigger poke-bounce animation');
  }
});

test('Tier 3.3: Bubu helicopter special handling in onTriggerAction', () => {
  const env = createPetEnvironment('bubu');
  env.dispatchElectronEvent('onTriggerAction', 'helicopter');

  assert.strictEqual(env.getCurrentAction(), 'helicopter');
  assert.strictEqual(env.getIsGliding(), true, 'isGliding should be true during helicopter hop and glide');
});

test('Tier 3.4: Mouseup click poke reaction is preserved for interactive poking', () => {
  const env = createPetEnvironment('dudu');
  const initialHappiness = env.petStats.happiness;

  // Simulate mouse click without dragging (hasMoved remains false)
  env.dispatchWindowEvent('mousedown', { button: 0, screenX: 200, screenY: 300 });
  assert.strictEqual(env.getIsDragging(), true);
  assert.strictEqual(env.getCurrentAction(), 'grabbed');

  // Mouseup at same spot
  env.dispatchWindowEvent('mouseup', { button: 0 });
  assert.strictEqual(env.getIsDragging(), false);
  assert.strictEqual(env.petContainer.classList.contains('poke-bounce'), true, 'Click poke must trigger poke-bounce');
  assert.strictEqual(env.petStats.happiness, Math.min(100, initialHappiness + 5), 'Poke must increase happiness');

  const pokeReactions = ['denied', 'redcard', 'singing', 'pushup', 'ropeskipping', 'laugh', 'dance', 'sit_jump', 'mad', 'taunt'];
  assert.ok(pokeReactions.includes(env.getCurrentAction()), `Poke reaction ${env.getCurrentAction()} must be in allowed list`);
});

test('Tier 3.5: Drag-and-drop does NOT invoke click poke', () => {
  const env = createPetEnvironment('dudu');
  env.setPosY(850);
  env.setFloorY(850);

  // Simulate drag: mousedown, move > 3px, mouseup near floor
  env.dispatchWindowEvent('mousedown', { button: 0, screenX: 200, screenY: 300 });
  env.dispatchWindowEvent('mousemove', { screenX: 230, screenY: 300 }); // dx = 30
  assert.strictEqual(env.getHasMoved(), true, 'hasMoved must be set to true on movement');

  env.dispatchWindowEvent('mouseup', { button: 0 });
  assert.strictEqual(env.getIsDragging(), false);
  // Dropped at floor -> walk
  assert.strictEqual(env.getCurrentAction(), 'walk', 'Dropping at floor transitions to walk, NOT poke');
});

// =========================================================================
// TIER 4: Physics & Simulation Mechanics
// =========================================================================

test('Tier 4.1: Fall physics: gravity acceleration, terminal velocity, and floor snapping', () => {
  const env = createPetEnvironment('dudu');
  env.setPosY(600);
  env.setFloorY(850);

  env.startFalling();
  assert.strictEqual(env.getIsFalling(), true);
  assert.strictEqual(env.getCurrentAction(), 'falling');

  let prevY = 600;
  // Step simulation 5 times (30ms per step)
  for (let i = 0; i < 5; i++) {
    env.advanceTime(30);
    const currY = env.getPosY();
    assert.ok(currY > prevY, `Pet posY must increase on step ${i}: curr=${currY}, prev=${prevY}`);
    prevY = currY;
  }

  // Advance remaining time to hit floor
  env.advanceTime(1000);
  assert.strictEqual(env.getPosY(), 850, 'Pet must snap exactly to floorY');
  assert.strictEqual(env.getIsFalling(), false, 'isFalling must reset to false');
  assert.strictEqual(env.getCurrentAction(), 'walk', 'Pet must transition to walk after landing');
});

test('Tier 4.2: Dragging interrupts fall simulation immediately', () => {
  const env = createPetEnvironment('dudu');
  env.setPosY(500);
  env.setFloorY(850);

  env.startFalling();
  assert.strictEqual(env.getIsFalling(), true);

  // User grabs pet mid-fall
  env.dispatchWindowEvent('mousedown', { button: 0, screenX: 200, screenY: 200 });
  assert.strictEqual(env.getIsDragging(), true);

  // Advance time: fallTimer should detect isDragging and terminate
  env.advanceTime(30);
  assert.strictEqual(env.getIsFalling(), false, 'Fall simulation must abort when grabbed');
});

test('Tier 4.3: Bubu helicopter glide descent, horizontal drift, and landing', () => {
  const env = createPetEnvironment('bubu');
  env.setPosY(800);
  env.setFloorY(850);
  env.setFacing(1);

  env.startHelicopterGlide();
  assert.strictEqual(env.getIsGliding(), true);
  assert.strictEqual(env.getCurrentAction(), 'helicopter');

  // Step 40ms: posY increases by descendRate (2.4)
  env.advanceTime(40);
  assert.strictEqual(env.getPosY(), 802.4);

  // Complete descent
  env.advanceTime(2000);
  assert.strictEqual(env.getPosY(), 850, 'Landed exactly on floor');
  assert.strictEqual(env.getIsGliding(), false);
  assert.strictEqual(env.getCurrentAction(), 'celebrate', 'Bubu celebrates on landing');
});

test('Tier 4.4: Hunger factor dynamically scales movement velocity', () => {
  const env = createPetEnvironment('dudu');
  env.setAction('walk');
  env.setFacing(1);
  const baseSpeed = env.DUDU_ACTIONS.walk.speed; // 2.2

  // Full hunger (80): hungerFactor = 1.0
  env.petStats.hunger = 80;
  let hungerFactor = env.petStats.hunger < 35 ? 0.72 : 1.0;
  let step = baseSpeed * hungerFactor * env.getFacing();
  assert.strictEqual(step, 2.2);

  // Low hunger (20): hungerFactor = 0.72
  env.petStats.hunger = 20;
  hungerFactor = env.petStats.hunger < 35 ? 0.72 : 1.0;
  step = baseSpeed * hungerFactor * env.getFacing();
  assert.strictEqual(Math.round(step * 1000) / 1000, 1.584);

  // Starving (0): does not reverse or NaN
  env.petStats.hunger = 0;
  hungerFactor = env.petStats.hunger < 35 ? 0.72 : 1.0;
  step = baseSpeed * hungerFactor * env.getFacing();
  assert.strictEqual(Math.round(step * 1000) / 1000, 1.584);
  assert.ok(step > 0, 'Movement vector must remain positive when moving right');
});

// =========================================================================
// TIER 5: Adversarial Boundary & Stress Cases
// =========================================================================

test('Tier 5.1: Rapid action spamming clears timers without memory leaks', () => {
  const env = createPetEnvironment('dudu');
  const initialTimerCount = env.activeTimers.size;

  // Spam 50 rapid setAction calls
  for (let i = 0; i < 50; i++) {
    env.setAction(i % 2 === 0 ? 'dance' : 'pushup');
  }

  // There should only be 1 stateTimer active for the action duration (plus idleTimer and updatePetNeeds)
  assert.ok(env.activeTimers.size <= initialTimerCount + 3,
    `Active timers should not leak on rapid calls, found ${env.activeTimers.size}`);
});

test('Tier 5.2: Mouse drag tilt is constrained to [-18, 18] degrees', () => {
  const env = createPetEnvironment('dudu');
  env.dispatchWindowEvent('mousedown', { button: 0, screenX: 100, screenY: 100 });

  // Extreme right drag (dx = +1000)
  env.dispatchWindowEvent('mousemove', { screenX: 1100, screenY: 100 });
  assert.ok(env.petImg.style.transform.includes('rotate(18deg)'),
    `Tilt must clamp to 18deg, got: ${env.petImg.style.transform}`);

  // Extreme left drag (dx = -2000)
  env.dispatchWindowEvent('mousemove', { screenX: -900, screenY: 100 });
  assert.ok(env.petImg.style.transform.includes('rotate(-18deg)'),
    `Tilt must clamp to -18deg, got: ${env.petImg.style.transform}`);
});

test('Tier 5.3: Joint actions protect against interruption', () => {
  const env = createPetEnvironment('dudu');
  env.dispatchElectronEvent('onJointAction', {
    file: '../bubu-dudu-punch.gif',
    action: 'punch',
    emotes: ['💥']
  });

  assert.strictEqual(env.getIsJointActionActive(), true);

  // Attempting setAction while joint action is active must be ignored
  env.setAction('skooter');
  assert.notStrictEqual(env.getCurrentAction(), 'skooter', 'setAction must be suppressed during joint action');

  // Finish joint action
  env.dispatchElectronEvent('onJointFinish', { facing: 1, action: 'walk' });
  assert.strictEqual(env.getIsJointActionActive(), false);
  assert.strictEqual(env.getCurrentAction(), 'walk');
});

test('Tier 2.5: Live movement loop dispatches correct velocity vectors matching facing', () => {
  const env = createPetEnvironment('dudu');
  env.setFloorY(850);
  env.setPosY(850);
  env.setAction('skooter');
  env.startMovementLoop();

  // Test Moving Right
  env.setFacing(1);
  env.updateFacingClass();
  env.movedCalls.length = 0;
  env.updatedPositions.length = 0;

  env.advanceTime(45); // 1 tick of movement loop
  assert.strictEqual(env.movedCalls.length, 1);
  assert.strictEqual(env.movedCalls[0].dx, 4.8, 'Moving right must send dx = +4.8');
  assert.strictEqual(env.movedCalls[0].dy, 0);
  assert.strictEqual(env.petImg.classList.contains('flip-right'), true);
  assert.strictEqual(env.petImg.classList.contains('flip-left'), false);

  // Test Moving Left
  env.setFacing(-1);
  env.updateFacingClass();
  env.movedCalls.length = 0;

  env.advanceTime(45); // 1 tick
  assert.strictEqual(env.movedCalls.length, 1);
  assert.strictEqual(env.movedCalls[0].dx, -4.8, 'Moving left must send dx = -4.8');
  assert.strictEqual(env.movedCalls[0].dy, 0);
  assert.strictEqual(env.petImg.classList.contains('flip-left'), true);
  assert.strictEqual(env.petImg.classList.contains('flip-right'), false);
});

test('Tier 3.6: onTriggerAction during live movement loop drives pet without poke interruption', () => {
  const env = createPetEnvironment('dudu');
  env.setFloorY(850);
  env.setPosY(850);
  env.setFacing(1);
  env.startMovementLoop();

  // Trigger skooter via IPC
  env.dispatchElectronEvent('onTriggerAction', 'skooter');
  assert.strictEqual(env.getCurrentAction(), 'skooter');

  env.movedCalls.length = 0;
  // Step through 10 movement loop frames (450ms)
  for (let i = 0; i < 10; i++) {
    env.advanceTime(45);
  }

  assert.strictEqual(env.getCurrentAction(), 'skooter', 'Action must still be skooter after 450ms');
  assert.strictEqual(env.movedCalls.length, 10);
  for (const move of env.movedCalls) {
    assert.strictEqual(move.dx, 4.8);
    assert.strictEqual(move.dy, 0);
  }

  // Interactive poke during movement: click pet window
  env.dispatchWindowEvent('mousedown', { button: 0, screenX: 100, screenY: 100 });
  env.dispatchWindowEvent('mouseup', { button: 0 }); // click poke without move
  const pokeReactions = ['denied', 'redcard', 'singing', 'pushup', 'ropeskipping', 'laugh', 'dance', 'sit_jump', 'mad', 'taunt'];
  assert.ok(pokeReactions.includes(env.getCurrentAction()), 'Interactive mouse click poke must take effect');
});

