let petName = 'bubu';
let assets = {};
let currentAction = 'walk';
let facing = 1; // 1 = right, -1 = left
let isDragging = false;
let hasMoved = false;
let dragStartX = 0;
let dragStartY = 0;
let currentScale = 1.0;
let posY = 800;
let floorY = 850;
let stateTimer = null;
let moveInterval = null;
let isJointActionActive = false;
let isFalling = false;
let isGliding = false;
let sleepParticleInterval = null;
let idleTimer = null;
const IDLE_SLEEP_TIMEOUT = 120000; // 2 minutes idle before taking a nap

// Tamagotchi Needs & Vitality System
let petStats = {
  hunger: 80,     // 0 - 100 (100 = full, 0 = starving)
  energy: 90,     // 0 - 100 (decreases while moving, restores during sleep)
  happiness: 95,  // 0 - 100 (increases with food, petting, couple activities)
  sleepStartTime: null
};

const petImg = document.getElementById('pet-img');
const petContainer = document.getElementById('pet-container');
const emoteLayer = document.getElementById('emote-layer');

// naturalFacing: -1 indicates the raw GIF artwork faces LEFT by default
const BUBU_ACTIONS = {
  walk: { file: '../bubu-walk.gif', speed: 2.2, duration: [4000, 8000], naturalFacing: 1 },
  walk2: { file: '../bubu-walking2.gif', speed: 2.2, duration: [4000, 7000], naturalFacing: -1 },
  walk3: { file: '../bubu-walking3.gif', speed: 2.2, duration: [4000, 7000], naturalFacing: -1 },
  skateboard: { file: '../bubu-skateboard.gif', speed: 5.5, duration: [3000, 6000], naturalFacing: -1 },
  helicopter: { file: '../bubu-helicopter.gif', speed: 2.0, duration: [5000, 8000], airborne: true, naturalFacing: 1 },
  kickingfeet: { file: '../bubu-kickingfeet.gif', speed: 0, duration: [3500, 6000], naturalFacing: 1 },
  mousepoint: { file: '../bubu-mousepointanimation.gif', speed: 0, duration: [4000, 7000], naturalFacing: 1 },
  stressing: { file: '../bubu-stressing.gif', speed: 0, duration: [3000, 5500], naturalFacing: 1 },
  walktoward: { file: '../bubu-walktoward.gif', speed: 0, duration: [3000, 5000], naturalFacing: 1 },
  celebrate: { file: '../bubu-celebrate.gif', speed: 0, duration: [3500, 6000], naturalFacing: 1 },
  read: { file: '../bubu-read.gif', speed: 0, duration: [4000, 9000], naturalFacing: 1 },
  sus: { file: '../bubu-sus.gif', speed: 0, duration: [3000, 6000], naturalFacing: 1 },
  taunt: { file: '../bubu-taunt.gif', speed: 0, duration: [3000, 5000], naturalFacing: 1 },
  crying: { file: '../bubu-crying.gif', speed: 0, duration: [3000, 5000], naturalFacing: 1 },
  sad: { file: '../bubu-sad.gif', speed: 0, duration: [3000, 5000], naturalFacing: 1 },
  scream: { file: '../bubu-scream.gif', speed: 0, duration: [2500, 4500], naturalFacing: 1 },
  stressed: { file: '../bubu-stressed.gif', speed: 0, duration: [3000, 5000], naturalFacing: 1 },
  // Sleep duration: ~5 minutes (280000 - 320000 ms)
  sleep: { file: '../bubu-sleep.gif', speed: 0, duration: [280000, 320000], isSleeping: true, naturalFacing: 1 },
  sitsleep: { file: '../bubu-sitsleeping.gif', speed: 0, duration: [280000, 320000], isSleeping: true, naturalFacing: 1 },
  grabbed: { file: '../bubu-danggling2.gif', speed: 0, duration: [60000, 60000], naturalFacing: 1 },
  grabbed_alt: { file: '../bubu-grabbed.gif', speed: 0, duration: [60000, 60000], naturalFacing: 1 },
};

const DUDU_ACTIONS = {
  walk: { file: '../dudu-walk.gif', speed: 2.2, duration: [4000, 8000], naturalFacing: 1 },
  walk2: { file: '../dudu-walking2.gif', speed: 2.2, duration: [4000, 7000], naturalFacing: -1 },
  angrywalk: { file: '../dudu-angrywalking.gif', speed: 2.5, duration: [3500, 6500], naturalFacing: 1 },
  skateboard: { file: '../dudu-skateboard.gif', speed: 5.5, duration: [3000, 6000], naturalFacing: -1 },
  skooter: { file: '../dudu-skooter.gif', speed: 4.8, duration: [3500, 7000], naturalFacing: 1 },
  dance: { file: '../dudu-dance.gif', speed: 0, duration: [3500, 7000], naturalFacing: 1 },
  laugh: { file: '../dudu-laugh.gif', speed: 0, duration: [3000, 6000], naturalFacing: 1 },
  singing: { file: '../dudu-singing.gif', speed: 0, duration: [3500, 6500], naturalFacing: 1 },
  pushup: { file: '../dudu-pushup.gif', speed: 0, duration: [4000, 7500], naturalFacing: 1 },
  ropeskipping: { file: '../dudu-ropeskiping.gif', speed: 0, duration: [3500, 6500], naturalFacing: 1 },
  peeking: { file: '../dudu-peekingfromedge.gif', speed: 0, duration: [3500, 6000], naturalFacing: 1 },
  mousepoint: { file: '../dudu-mousepointing.gif', speed: 0, duration: [3500, 6000], naturalFacing: 1 },
  read: { file: '../dudu-read.gif', speed: 0, duration: [4000, 9000], naturalFacing: 1 },
  sit_jump: { file: '../dudu-sit_jump.gif', speed: 0, duration: [3500, 6000], naturalFacing: 1 },
  mad: { file: '../dudu-mad.gif', speed: 0, duration: [3000, 5500], naturalFacing: 1 },
  throwing_bottle: { file: '../dudu-throwing-bottle.gif', speed: 0, duration: [4000, 6500], naturalFacing: 1 },
  taunt: { file: '../dudu-taunt.gif', speed: 0, duration: [3000, 5000], naturalFacing: 1 },
  denied: { file: '../dudu-denied touch.gif', speed: 0, duration: [3000, 5000], naturalFacing: 1 },
  redcard: { file: '../dudu-redcard.gif', speed: 0, duration: [3000, 5000], naturalFacing: 1 },
  crying: { file: '../dudu-crying.gif', speed: 0, duration: [3000, 5000], naturalFacing: 1 },
  scream: { file: '../dudu-scream.gif', speed: 0, duration: [2500, 4500], naturalFacing: 1 },
  falling: { file: '../dudu-falling.gif', speed: 0, duration: [30000, 30000], naturalFacing: 1 },
  stressed: { file: '../dudu-stressed.gif', speed: 0, duration: [3000, 5000], naturalFacing: 1 },
  // Sleep duration: ~5 minutes (280000 - 320000 ms)
  sleep: { file: '../dudu-sleep.gif', speed: 0, duration: [280000, 320000], isSleeping: true, naturalFacing: 1 },
  sitsleep: { file: '../dudu-sitsleeping.gif', speed: 0, duration: [280000, 320000], isSleeping: true, naturalFacing: 1 },
  grabbed: { file: '../dudu-danggling2.gif', speed: 0, duration: [60000, 60000], naturalFacing: 1 },
  grabbed_alt: { file: '../dudu-grabbed.gif', speed: 0, duration: [60000, 60000], naturalFacing: 1 },
};

let PET_ACTIONS = null;

function getActionConfig(name) {
  let dict = PET_ACTIONS;
  if (!dict) {
    dict = petName === 'bubu' ? BUBU_ACTIONS : DUDU_ACTIONS;
  }
  if (!dict[name] && typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getActions) {
    try {
      const allActions = window.electronAPI.getActions();
      if (allActions && allActions[petName]) {
        PET_ACTIONS = allActions[petName];
        dict = PET_ACTIONS;
      }
    } catch (e) {}
  }
  return dict[name] || dict.walk || {
    file: `../${petName}-walk.gif`,
    speed: 2.2,
    duration: [4000, 8000],
    naturalFacing: 1
  };
}

function setAction(actionName, customDuration = null) {
  if (isJointActionActive || isGliding || isFalling) return;

  const wasSleeping = currentAction === 'sleep' || currentAction === 'sitsleep';
  currentAction = actionName;
  const config = getActionConfig(actionName);
  petImg.src = encodeURI(config.file);

  updateFacingClass();

  // Sleep Zzz particles
  if (actionName === 'sleep' || actionName === 'sitsleep') {
    petStats.sleepStartTime = Date.now();
    if (!sleepParticleInterval) {
      spawnZzz();
      sleepParticleInterval = setInterval(spawnZzz, 1800);
    }
  } else {
    petStats.sleepStartTime = null;
    if (sleepParticleInterval) {
      clearInterval(sleepParticleInterval);
      sleepParticleInterval = null;
    }
  }

  // Musical notes when singing
  if (actionName === 'singing') {
    spawnEmote('🎵');
    setTimeout(() => spawnEmote('🎶'), 700);
    setTimeout(() => spawnEmote('✨'), 1400);
  }

  if (stateTimer) clearTimeout(stateTimer);

  const duration = customDuration || randomRange(config.duration[0], config.duration[1]);
  stateTimer = setTimeout(() => {
    if (!isDragging && !isFalling && !isGliding && !isJointActionActive) {
      // If the 5-minute nap just finished naturally:
      if (currentAction === 'sleep' || currentAction === 'sitsleep') {
        petStats.energy = 100;
        petStats.happiness = Math.min(100, petStats.happiness + 25);
        spawnThoughtBubble('✨ Wide awake! Fully refreshed (Energy 100% ⚡)');
        spawnEmote('✨');
        setTimeout(() => spawnEmote('🥰'), 500);
        setAction(petName === 'bubu' ? 'celebrate' : 'dance', 3800);
      } else {
        pickNextAutonomousAction();
      }
    }
  }, duration);

  resetIdleTimer();
  syncStatsToMain();
}

function updateFacingClass() {
  const config = getActionConfig(currentAction);
  const isNaturallyLeft = config.naturalFacing === -1;
  // If naturally facing left:
  // - facing == 1 (move right) needs to face right -> scaleX(-1) (flip it!)
  // - facing == -1 (move left) needs to face left -> scaleX(1) (keep original!)
  // If naturally facing right:
  // - facing == 1 (move right) -> scaleX(1)
  // - facing == -1 (move left) -> scaleX(-1)
  const shouldFlip = isNaturallyLeft ? (facing === 1) : (facing === -1);
  if (shouldFlip) {
    petImg.classList.add('flip-left');
    petImg.classList.remove('flip-right');
  } else {
    petImg.classList.add('flip-right');
    petImg.classList.remove('flip-left');
  }
}

function randomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!isDragging && !isFalling && !isGliding && !isJointActionActive && currentAction !== 'sleep' && currentAction !== 'sitsleep') {
      spawnThoughtBubble('💤 So sleepy... Time for a little nap 😴');
      setAction(Math.random() < 0.5 ? 'sleep' : 'sitsleep');
    }
  }, IDLE_SLEEP_TIMEOUT);
}

function pickNextAutonomousAction() {
  if (isJointActionActive || isGliding || isFalling) return;

  // If energy is depleted (<15), take a natural 5-minute nap
  if (petStats.energy <= 15) {
    spawnThoughtBubble('💤 Out of energy... Taking a 5-min nap 😴');
    setAction(Math.random() < 0.5 ? 'sleep' : 'sitsleep');
    return;
  }

  // If very hungry (<20), show hunger mood
  if (petStats.hunger <= 20 && Math.random() < 0.45) {
    spawnEmote('🥺');
    spawnThoughtBubble('So hungry... 🍙 Tummy is rumbling~');
    setAction(petName === 'bubu' ? 'sad' : 'crying', 3500);
    return;
  }

  if (petName === 'bubu') {
    const roll = Math.random();
    if (roll < 0.35) {
      const walks = ['walk', 'walk2', 'walk3'];
      if (Math.random() < 0.35) facing *= -1;
      setAction(walks[Math.floor(Math.random() * walks.length)]);
    } else if (roll < 0.46) {
      if (Math.random() < 0.35) facing *= -1;
      setAction('skateboard');
    } else if (roll < 0.54) {
      setAction('kickingfeet');
    } else if (roll < 0.62) {
      setAction('mousepoint');
    } else if (roll < 0.70) {
      setAction('celebrate');
    } else if (roll < 0.78) {
      setAction('read');
    } else if (roll < 0.85) {
      setAction('sus');
    } else if (roll < 0.90) {
      setAction('stressing');
    } else if (roll < 0.95) {
      setAction(Math.random() < 0.5 ? 'sleep' : 'sitsleep');
    } else {
      startHelicopterHopAndGlide();
    }
  } else {
    // Dudu
    const roll = Math.random();
    if (roll < 0.30) {
      const walks = ['walk', 'walk2', 'angrywalk'];
      if (Math.random() < 0.35) facing *= -1;
      setAction(walks[Math.floor(Math.random() * walks.length)]);
    } else if (roll < 0.38) {
      if (Math.random() < 0.35) facing *= -1;
      setAction('skateboard');
    } else if (roll < 0.46) {
      if (Math.random() < 0.35) facing *= -1;
      setAction('skooter');
    } else if (roll < 0.53) {
      setAction('dance');
    } else if (roll < 0.60) {
      setAction('singing');
    } else if (roll < 0.67) {
      setAction('pushup');
    } else if (roll < 0.74) {
      setAction('ropeskipping');
    } else if (roll < 0.81) {
      setAction('sit_jump');
    } else if (roll < 0.87) {
      setAction('mousepoint');
    } else if (roll < 0.92) {
      setAction('mad');
    } else if (roll < 0.96) {
      setAction(Math.random() < 0.5 ? 'sleep' : 'sitsleep');
    } else {
      setAction('throwing_bottle');
    }
  }
}

// Bubu Helicopter: Glide gently down to the floor
function startHelicopterGlide() {
  if (isGliding || isFalling) return;
  isGliding = true;
  currentAction = 'helicopter';
  petImg.src = encodeURI(getActionConfig('helicopter').file);
  updateFacingClass();

  if (stateTimer) clearTimeout(stateTimer);

  const glideTimer = setInterval(() => {
    if (isDragging) {
      clearInterval(glideTimer);
      isGliding = false;
      return;
    }

    const step = 2.0 * facing;
    const descendRate = 2.4;
    posY = Math.min(floorY, posY + descendRate);

    window.electronAPI.movePet(step, descendRate);

    // Landed!
    if (posY >= floorY) {
      clearInterval(glideTimer);
      isGliding = false;
      posY = floorY;
      spawnEmote('✨');

      petContainer.classList.add('poke-bounce');
      setTimeout(() => petContainer.classList.remove('poke-bounce'), 400);

      setAction('celebrate', 3000);
    }
  }, 40);
}

// When autonomous Bubu flies on the floor: hops up ~120px and glides smoothly back down to the floor
function startHelicopterHopAndGlide() {
  if (isGliding || isFalling || isDragging) return;
  isGliding = true;
  currentAction = 'helicopter';
  petImg.src = encodeURI(getActionConfig('helicopter').file);
  updateFacingClass();

  if (stateTimer) clearTimeout(stateTimer);

  let ascendCount = 0;
  const maxAscend = 30;

  const hopTimer = setInterval(() => {
    if (isDragging) {
      clearInterval(hopTimer);
      isGliding = false;
      return;
    }

    if (ascendCount < maxAscend) {
      ascendCount++;
      const lift = -3.8;
      posY += lift;
      window.electronAPI.movePet(1.5 * facing, lift);
    } else {
      clearInterval(hopTimer);
      isGliding = false;
      startHelicopterGlide();
    }
  }, 40);
}

// Falling with gravity
function startFalling() {
  if (isFalling || isGliding) return;
  isFalling = true;
  currentAction = petName === 'bubu' ? 'scream' : 'falling';
  const config = getActionConfig(currentAction);
  petImg.src = encodeURI(config.file);
  updateFacingClass();

  let velY = 1.0;
  const fallTimer = setInterval(() => {
    if (posY >= floorY || isDragging) {
      clearInterval(fallTimer);
      isFalling = false;
      posY = floorY;
      window.electronAPI.movePet(0, 0); // snap to floor
      spawnEmote('🐾');

      petContainer.classList.add('poke-bounce');
      setTimeout(() => petContainer.classList.remove('poke-bounce'), 400);

      setAction('walk');
      return;
    }

    velY += 1.2;
    const dropSpeed = Math.min(24, Math.min(velY, floorY - posY));
    posY = Math.min(floorY, posY + dropSpeed);
    window.electronAPI.movePet(0, dropSpeed);
  }, 30);
}

// Emotes & Particles
const EMOTES = ['❤️', '✨', '⭐', '🐾', '🎵', '💖', '🎉'];
function spawnEmote(text = null) {
  const emote = document.createElement('div');
  emote.className = 'emote-particle';
  emote.textContent = text || EMOTES[Math.floor(Math.random() * EMOTES.length)];

  const offsetX = (Math.random() - 0.5) * 50;
  emote.style.left = `calc(50% + ${offsetX}px)`;
  emote.style.top = '20%';

  emoteLayer.appendChild(emote);
  setTimeout(() => emote.remove(), 1200);
}

function spawnZzz() {
  const zzz = document.createElement('div');
  zzz.className = 'zzz-particle';
  zzz.textContent = '💤';

  const offsetX = (Math.random() - 0.5) * 30 + 15;
  zzz.style.left = `calc(50% + ${offsetX}px)`;
  zzz.style.top = '25%';

  emoteLayer.appendChild(zzz);
  setTimeout(() => zzz.remove(), 2400);
}

// Thought bubble
function spawnThoughtBubble(htmlText) {
  // Remove any existing thought bubbles first
  const existing = emoteLayer.querySelectorAll('.thought-bubble');
  existing.forEach(b => b.remove());

  const bubble = document.createElement('div');
  bubble.className = 'thought-bubble';
  bubble.innerHTML = htmlText;
  emoteLayer.appendChild(bubble);
  setTimeout(() => bubble.remove(), 3200);
}

// Dropping food item
function spawnFoodDrop(emoji, hungerBonus) {
  const food = document.createElement('div');
  food.className = 'food-drop';
  food.textContent = emoji;
  emoteLayer.appendChild(food);
  setTimeout(() => food.remove(), 1100);

  const stat = document.createElement('div');
  stat.className = 'float-stat';
  stat.textContent = `+${hungerBonus} ${emoji} Yummy!`;
  emoteLayer.appendChild(stat);
  setTimeout(() => stat.remove(), 1800);
}

// Click poke reaction
function handlePoke() {
  if (isJointActionActive || isGliding || isFalling) return;

  petContainer.classList.remove('poke-bounce');
  void petContainer.offsetWidth;
  petContainer.classList.add('poke-bounce');

  petStats.happiness = Math.min(100, petStats.happiness + 5);

  if (currentAction === 'sleep' || currentAction === 'sitsleep') {
    spawnEmote('❗');
    spawnThoughtBubble('Mmm... Did someone poke me awake? 😴');
    setAction(petName === 'bubu' ? 'sus' : 'scream', 2500);
    return;
  }

  spawnEmote();

  if (petName === 'dudu') {
    const pokeReactions = ['denied', 'redcard', 'singing', 'pushup', 'ropeskipping', 'laugh', 'dance', 'sit_jump', 'mad', 'taunt'];
    const chosen = pokeReactions[Math.floor(Math.random() * pokeReactions.length)];
    setAction(chosen, 3200);
  } else {
    const pokeReactions = ['celebrate', 'mousepoint', 'kickingfeet', 'stressing', 'sus', 'taunt', 'walktoward', 'crying'];
    const chosen = pokeReactions[Math.floor(Math.random() * pokeReactions.length)];
    setAction(chosen, 3200);
  }
}

// Feeding function
function feedPet(foodData) {
  if (isJointActionActive) return;
  const emoji = foodData.food || '🍓';
  const name = foodData.name || 'Snack';
  const hungerBonus = foodData.hunger || 35;
  const happinessBonus = foodData.happiness || 20;

  petStats.hunger = Math.min(100, petStats.hunger + hungerBonus);
  petStats.happiness = Math.min(100, petStats.happiness + happinessBonus);

  spawnFoodDrop(emoji, hungerBonus);

  if (currentAction === 'sleep' || currentAction === 'sitsleep') {
    spawnEmote('😋');
    spawnThoughtBubble(`Yum! Smelled ${name}! Woke up to eat 😋`);
    setAction(petName === 'bubu' ? 'celebrate' : 'dance', 3500);
  } else {
    spawnEmote('😋');
    setTimeout(() => spawnEmote('💖'), 400);
    setTimeout(() => spawnEmote('✨'), 800);
    spawnThoughtBubble(`Nom nom, ${name} is delicious! (Full: ${Math.round(petStats.hunger)}%)`);
    setAction(petName === 'bubu' ? 'celebrate' : (Math.random() < 0.5 ? 'dance' : 'laugh'), 3500);
  }

  syncStatsToMain();
}

// Tamagotchi Needs Engine: Updates every 12 seconds
const FOOD_CRAVINGS = ['🍙 Onigiri', '🧋 Bubble Tea', '🍓 Strawberry', '🍰 Sweet Cake', '🍗 Chicken Drumstick', '🍕 Pizza'];
function updatePetNeeds() {
  const isSleeping = currentAction === 'sleep' || currentAction === 'sitsleep';

  if (isSleeping) {
    // Sleeping restores energy and slowly drains hunger
    petStats.energy = Math.min(100, petStats.energy + 4.2);
    petStats.hunger = Math.max(0, petStats.hunger - 0.35);
  } else {
    // Awake drains energy and hunger
    petStats.energy = Math.max(0, petStats.energy - 0.9);
    petStats.hunger = Math.max(0, petStats.hunger - 1.1);

    // If hungry, show craving thought bubble
    if (petStats.hunger <= 35 && Math.random() < 0.45 && !isDragging && !isFalling && !isGliding) {
      const craving = FOOD_CRAVINGS[Math.floor(Math.random() * FOOD_CRAVINGS.length)];
      spawnThoughtBubble(`💭 Hungry... Craving ${craving}~`);
    }

    // If starving, lower happiness
    if (petStats.hunger < 20) {
      petStats.happiness = Math.max(0, petStats.happiness - 1.5);
    }
  }

  syncStatsToMain();
}
setInterval(updatePetNeeds, 12000);

function syncStatsToMain() {
  window.electronAPI.updatePetStats({
    petName,
    hunger: Math.round(petStats.hunger),
    energy: Math.round(petStats.energy),
    happiness: Math.round(petStats.happiness),
    isSleeping: currentAction === 'sleep' || currentAction === 'sitsleep'
  });
}

// Mouse events for Dragging & Poking
window.addEventListener('mousedown', (e) => {
  if (isJointActionActive) return;

  if (e.button === 0) {
    isDragging = true;
    hasMoved = false;
    dragStartX = e.screenX;
    dragStartY = e.screenY;

    if (stateTimer) clearTimeout(stateTimer);
    petContainer.classList.add('grabbed');
    currentAction = 'grabbed';
    const config = getActionConfig('grabbed');
    petImg.src = encodeURI(config.file);
  } else if (e.button === 2) {
    window.electronAPI.openContextMenu(petName);
  }
});

window.addEventListener('mousemove', (e) => {
  if (isDragging && !isJointActionActive) {
    const dx = e.screenX - dragStartX;
    const dy = e.screenY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMoved = true;
    }
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    posY += dy;
    window.electronAPI.dragWindow(dx, dy);

    const config = getActionConfig(currentAction);
    const isNaturallyLeft = config.naturalFacing === -1;
    const shouldFlip = isNaturallyLeft ? (facing === 1) : (facing === -1);
    const tilt = Math.max(-18, Math.min(18, dx * 1.6));
    const flip = shouldFlip ? 'scaleX(-1) ' : 'scaleX(1) ';
    petImg.style.transform = `${flip} rotate(${tilt}deg)`;

    if (Math.hypot(dx, dy) > 9 && Math.random() < 0.2) {
      spawnEmote(Math.random() < 0.5 ? '💦' : '💢');
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0 && isDragging && !isJointActionActive) {
    isDragging = false;
    petContainer.classList.remove('grabbed');
    petImg.style.transform = '';

    if (!hasMoved) {
      handlePoke();
    } else {
      if (posY < floorY - 25) {
        if (petName === 'bubu') {
          startHelicopterGlide();
        } else {
          startFalling();
        }
      } else {
        posY = floorY;
        setAction('walk');
      }
    }
    resetIdleTimer();
  }
});

// Main Movement Loop: Strictly horizontal on floorY
function startMovementLoop() {
  moveInterval = setInterval(() => {
    if (isDragging || isFalling || isGliding || isJointActionActive) {
      window.electronAPI.updatePosition({
        petName,
        action: currentAction,
        facing,
        isBusy: true
      });
      return;
    }

    if (posY < floorY) {
      const dropSpeed = Math.min(8, floorY - posY);
      posY += dropSpeed;
      window.electronAPI.movePet(0, dropSpeed);
    }

    const config = getActionConfig(currentAction);
    if (config.speed > 0) {
      // If hungry, walk slightly slower
      const hungerFactor = petStats.hunger < 35 ? 0.72 : 1.0;
      const step = config.speed * hungerFactor * facing;
      window.electronAPI.movePet(step, 0);
    }

    window.electronAPI.updatePosition({
      petName,
      action: currentAction,
      facing,
      isBusy: currentAction === 'sleep' || currentAction === 'sitsleep'
    });
  }, 45);
}

// Boundary turnaround: 30% chance for Dudu to peek from edge when hitting the wall!
window.electronAPI.onHitBoundary((data) => {
  if (!isJointActionActive) {
    facing = data.direction;
    updateFacingClass();

    if (petName === 'dudu' && Math.random() < 0.3) {
      setAction('peeking', 3200);
    }
  }
});

// IPC Event Listeners from Main Process
window.electronAPI.onPetInit((data) => {
  petName = data.name;
  currentScale = data.scale || 1.0;
  posY = data.floorY;
  floorY = data.floorY;

  if (data.actions) {
    PET_ACTIONS = data.actions;
  } else if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getActions) {
    try {
      const allActions = window.electronAPI.getActions();
      if (allActions && allActions[petName]) {
        PET_ACTIONS = allActions[petName];
      }
    } catch (e) {}
  }

  document.documentElement.style.setProperty('--scale', currentScale);
  document.title = `Pet - ${petName}`;

  setAction('walk');
  startMovementLoop();
  resetIdleTimer();
  syncStatsToMain();
});

window.electronAPI.onScaleChange((scale) => {
  currentScale = scale;
  document.documentElement.style.setProperty('--scale', scale);
});

window.electronAPI.onToggleGhostMode((enabled) => {
  if (enabled) {
    document.body.classList.add('ghost-mode');
  } else {
    document.body.classList.remove('ghost-mode');
  }
});

window.electronAPI.onResetPosition(() => {
  posY = floorY;
  isJointActionActive = false;
  isGliding = false;
  isFalling = false;
  setAction('walk');
  handlePoke();
});

window.electronAPI.onTriggerAction((action) => {
  if (action === 'helicopter' && petName === 'bubu') {
    startHelicopterHopAndGlide();
  } else {
    if ((!PET_ACTIONS || !PET_ACTIONS[action]) && typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getActions) {
      try {
        const allActions = window.electronAPI.getActions();
        if (allActions && allActions[petName]) {
          PET_ACTIONS = allActions[petName];
        }
      } catch (e) {}
    }
    setAction(action);
  }
});

window.electronAPI.onFeedPet((data) => {
  feedPet(data);
});

window.electronAPI.onPutToSleep((duration) => {
  spawnThoughtBubble('💤 Taking a cozy 5-minute nap... 😴');
  setAction(Math.random() < 0.5 ? 'sleep' : 'sitsleep', duration || 300000);
});

window.electronAPI.onWakeUpPet(() => {
  if (currentAction === 'sleep' || currentAction === 'sitsleep') {
    spawnEmote('⏰');
    spawnThoughtBubble("Good morning! I'm awake! ☀️");
    setAction(petName === 'bubu' ? 'celebrate' : 'dance', 3500);
  }
});

if (window.electronAPI.onThoughtBubble) {
  window.electronAPI.onThoughtBubble((text) => {
    spawnThoughtBubble(text);
    spawnEmote('✨');
  });
}

// Joint / Couple action start
window.electronAPI.onJointAction((data) => {
  isJointActionActive = true;
  isGliding = false;
  isFalling = false;
  if (stateTimer) clearTimeout(stateTimer);

  petImg.src = encodeURI(data.file);
  petImg.style.transform = '';

  petStats.happiness = Math.min(100, petStats.happiness + 20);

  if (data.emotes) {
    data.emotes.forEach((em, idx) => {
      setTimeout(() => spawnEmote(em), idx * 600);
    });
  }
});

// Joint / Couple action finish
window.electronAPI.onJointFinish((data) => {
  isJointActionActive = false;
  facing = data.facing;
  updateFacingClass();
  setAction(data.action, 3500);
});
