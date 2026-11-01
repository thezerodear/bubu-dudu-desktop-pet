let electron = require('electron');
const isElectron = typeof electron === 'object' && electron !== null && typeof electron.app !== 'undefined';
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, nativeImage } = isElectron ? electron : {};
const path = require('path');
const updater = require('./updater');

// Prevent multiple instances when running inside Electron
if (isElectron && app) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  }
}

let tray = null;
let bubuWindow = null;
let duduWindow = null;

let isGhostMode = false;
let currentScale = 1.0;
let baseSize = 180;

let positions = {
  bubu: { action: 'walk', facing: 1, isBusy: false },
  dudu: { action: 'walk', facing: 1, isBusy: false }
};

let petStats = {
  bubu: { hunger: 80, energy: 90, happiness: 95, isSleeping: false },
  dudu: { hunger: 80, energy: 90, happiness: 95, isSleeping: false }
};

const FOOD_MENU = [
  { food: '🍓', name: 'สตรอว์เบอร์รี่สด', hunger: 25, happiness: 15 },
  { food: '🧋', name: 'ชานมไข่มุกหวานละมุน', hunger: 30, happiness: 25 },
  { food: '🍰', name: 'เค้กช็อกโกแลตสตรอว์เบอร์รี่', hunger: 35, happiness: 25 },
  { food: '🍙', name: 'ข้าวปั้นโอนิกิริ', hunger: 35, happiness: 15 },
  { food: '🍗', name: 'น่องไก่ทอดกรอบ', hunger: 40, happiness: 20 },
  { food: '🍕', name: 'พิซซ่าชีสเยิ้ม', hunger: 40, happiness: 20 },
];

let jointActionInProgress = false;
let lastJointTriggerTime = 0;
const JOINT_COOLDOWN_MS = 20000;

const JOINT_ANIMATIONS = [
  { id: 'kiss', name: 'Kiss 💕', file: '../dudu-bubu-kiss.gif', duration: 5800, emotes: ['❤️', '💖', '🥰', '💋'] },
  { id: 'highfive', name: 'High Five ✋', file: '../bubu-dudu-highfive.gif', duration: 3800, emotes: ['✋', '⭐', '✨', '🎉'] },
  { id: 'swinghug', name: 'Swing Hugging 💕', file: '../bubu-dudu-swinghugging.gif', duration: 5000, emotes: ['💖', '🥰', '💕', '✨'] },
  { id: 'dragbubu', name: 'Playful Dragging 🪢', file: '../bubu-dudu-bubudragbubu.gif', duration: 4200, emotes: ['😄', '💨', '🐾', '😜'] },
  { id: 'punch', name: 'Playful Punch 🥊', file: '../bubu-dudu-punch.gif', duration: 4200, emotes: ['🥊', '💥', '💢', '😜'] },
  { id: 'throw', name: 'Throw Dudu 🤾', file: '../bubu-dudu-bubuthrowdudu.gif', duration: 4500, emotes: ['🤾', '💨', '💫', '🎉'] },
  { id: 'riding', name: 'Ride Bubu 🐼🐻', file: '../dudu-bubu-playing-riding.gif', duration: 6500, emotes: ['❤️', '✨', '🐾', '🥳'] }
];

const CATEGORY_CONFIG = {
  movement: { label: 'Movement 🐾', order: 1 },
  idle:     { label: 'Activities & Fun 🎈', order: 2 },
  special:  { label: 'Special Actions ✨', order: 3 },
  emotion:  { label: 'Emotions & Moods 💭', order: 4 },
  vitality: { label: 'Sleep & Care 💤', order: 5 },
  other:    { label: 'Other Actions 📦', order: 99 }
};

/**
 * Loads actions from src/actions.json with cache invalidation for hot-reloading.
 */
function loadActions() {
  const actionsPath = path.join(__dirname, 'actions.json');
  try {
    delete require.cache[require.resolve(actionsPath)];
    return require(actionsPath);
  } catch (err) {
    console.error('[MenuBuilder] Failed to load actions.json:', err.message);
    return { bubu: {}, dudu: {}, joint: {}, food: [] };
  }
}

function getFoodList() {
  const data = loadActions();
  return (data && Array.isArray(data.food) && data.food.length > 0) ? data.food : FOOD_MENU;
}

function getJointList() {
  const data = loadActions();
  return (data && data.joint && Object.keys(data.joint).length > 0) ? Object.values(data.joint) : JOINT_ANIMATIONS;
}

/**
 * Builds categorized submenus for a given pet dynamically from actions.json.
 * @param {string} petName - 'bubu' or 'dudu'
 * @param {BrowserWindow} [targetWindow] - Window to receive 'trigger-action' IPC
 * @returns {Array<object>} Electron Menu template items
 */
function buildPetActionSubmenus(petName, targetWindow = null) {
  const actionsData = loadActions();
  const petActions = (actionsData && actionsData[petName]) ? actionsData[petName] : {};

  // Group actions by category
  const groups = {};
  for (const [key, conf] of Object.entries(petActions)) {
    // Skip internal-only reaction states
    if (conf.menu === false) continue;

    const cat = conf.category || 'other';
    if (!groups[cat]) groups[cat] = [];

    groups[cat].push({
      label: conf.label || `${key.charAt(0).toUpperCase() + key.slice(1)} 🐾`,
      click: () => {
        const win = targetWindow || (petName === 'bubu' ? bubuWindow : duduWindow);
        if (win && !win.isDestroyed()) {
          win.webContents.send('trigger-action', key);
        }
      }
    });
  }

  // Sort categories by predefined order
  const sortedCategories = Object.keys(groups).sort((a, b) => {
    const orderA = CATEGORY_CONFIG[a]?.order ?? 50;
    const orderB = CATEGORY_CONFIG[b]?.order ?? 50;
    return orderA - orderB;
  });

  return sortedCategories.map(cat => ({
    label: CATEGORY_CONFIG[cat]?.label || `${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
    submenu: groups[cat]
  }));
}

/**
 * Builds dynamic Couple Actions submenu from actions.json.joint.
 */
function buildCoupleActionSubmenu() {
  const jointList = getJointList();

  const submenu = [
    { label: 'Random Couple Action 🎲', click: () => triggerCoupleAnimation() },
    { type: 'separator' }
  ];

  for (const item of jointList) {
    submenu.push({
      label: item.name || item.label || item.id,
      click: () => triggerCoupleAnimation(item.id)
    });
  }

  return submenu;
}

/**
 * Builds dynamic Food submenu from actions.json.food.
 */
function buildFoodSubmenu(targetWindow = null, defaultPet = 'bubu') {
  const foodList = getFoodList();

  return foodList.map(item => ({
    label: `${item.food || item.icon || '🍽️'} ${item.name} (+${item.hunger} หิว)`,
    click: () => {
      const win = targetWindow || (defaultPet === 'bubu' ? bubuWindow : duduWindow);
      if (win && !win.isDestroyed()) {
        win.webContents.send('feed-pet', item);
      }
    }
  }));
}

function createPetWindow(name, initialX, floorY) {
  const win = new BrowserWindow({
    width: Math.round(baseSize * currentScale),
    height: Math.round(baseSize * currentScale),
    x: Math.round(initialX),
    y: Math.round(floorY),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  if (process.platform === 'darwin') {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win.setAlwaysOnTop(true);
  }

  win.loadFile(path.join(__dirname, 'pet.html'));

  win.webContents.on('did-finish-load', () => {
    const actionsData = loadActions();
    win.webContents.send('pet-init', {
      name,
      scale: currentScale,
      floorY: floorY,
      actions: (actionsData && actionsData[name]) ? actionsData[name] : null,
    });
  });

  return win;
}

function getWorkAreaBounds() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const petHeight = Math.round(baseSize * currentScale);
  const floorY = workArea.y + workArea.height - petHeight;
  return { primaryDisplay, workArea, floorY, petHeight };
}

function initWindows() {
  const { workArea, floorY } = getWorkAreaBounds();

  bubuWindow = createPetWindow('bubu', workArea.x + 180, floorY);
  duduWindow = createPetWindow('dudu', workArea.x + 380, floorY);

  setInterval(checkProximityAndTriggerCouple, 400);
}

function setGhostMode(enabled) {
  isGhostMode = enabled;
  [bubuWindow, duduWindow].forEach(win => {
    if (win && !win.isDestroyed()) {
      if (isGhostMode) {
        win.setIgnoreMouseEvents(true, { forward: true });
      } else {
        win.setIgnoreMouseEvents(false);
      }
      win.webContents.send('ghost-mode', isGhostMode);
    }
  });
  updateTrayMenu();
}

function setScale(scale) {
  currentScale = scale;
  const newSize = Math.round(baseSize * currentScale);
  const { floorY } = getWorkAreaBounds();

  [bubuWindow, duduWindow].forEach(win => {
    if (win && !win.isDestroyed()) {
      const [x, y] = win.getPosition();
      win.setSize(newSize, newSize);
      win.setPosition(x, Math.min(y, floorY));
      win.webContents.send('scale-change', currentScale);
    }
  });
  updateTrayMenu();
}

function resetPositions() {
  const { workArea, floorY } = getWorkAreaBounds();
  jointActionInProgress = false;

  if (bubuWindow && !bubuWindow.isDestroyed()) {
    bubuWindow.setPosition(workArea.x + 180, floorY);
    bubuWindow.webContents.send('reset-position');
    bubuWindow.show();
  }
  if (duduWindow && !duduWindow.isDestroyed()) {
    duduWindow.setPosition(workArea.x + 380, floorY);
    duduWindow.webContents.send('reset-position');
    duduWindow.show();
  }
}

function checkProximityAndTriggerCouple() {
  if (jointActionInProgress) return;
  const now = Date.now();
  if (now - lastJointTriggerTime < JOINT_COOLDOWN_MS) return;

  if (!bubuWindow || bubuWindow.isDestroyed() || !duduWindow || duduWindow.isDestroyed()) return;
  if (!bubuWindow.isVisible() || !duduWindow.isVisible()) return;

  if (positions.bubu.isBusy || positions.dudu.isBusy) return;

  const [bx, by] = bubuWindow.getPosition();
  const [dx, dy] = duduWindow.getPosition();

  const diffX = Math.abs(bx - dx);
  const diffY = Math.abs(by - dy);

  if (diffX < 95 && diffY < 55) {
    if (Math.random() < 0.65) {
      triggerCoupleAnimation();
    } else {
      lastJointTriggerTime = now - JOINT_COOLDOWN_MS + 4000;
    }
  }
}

function triggerCoupleAnimation(forcedJointId = null) {
  if (jointActionInProgress) return;
  jointActionInProgress = true;
  lastJointTriggerTime = Date.now();

  const jointList = getJointList();
  let chosen;
  if (forcedJointId) {
    chosen = jointList.find(j => j.id === forcedJointId) || jointList[0];
  } else {
    chosen = jointList[Math.floor(Math.random() * jointList.length)];
  }

  const [bx, by] = bubuWindow.getPosition();
  const [dx, dy] = duduWindow.getPosition();

  const midX = Math.round((bx + dx) / 2);
  const midY = Math.round((by + dy) / 2);

  bubuWindow.setPosition(midX, midY);
  duduWindow.hide();

  bubuWindow.webContents.send('joint-action', {
    file: chosen.file,
    duration: chosen.duration,
    emotes: chosen.emotes,
  });

  setTimeout(() => {
    if (!bubuWindow || bubuWindow.isDestroyed() || !duduWindow || duduWindow.isDestroyed()) {
      jointActionInProgress = false;
      return;
    }

    const [currentBx, currentBy] = bubuWindow.getPosition();
    const display = screen.getDisplayMatching(bubuWindow.getBounds());
    const workArea = display.workArea;
    const petWidth = Math.round(baseSize * currentScale);

    const bubuSepX = Math.max(workArea.x + 10, currentBx - 70);
    const duduSepX = Math.min(workArea.x + workArea.width - petWidth - 10, currentBx + 70);

    bubuWindow.setPosition(bubuSepX, currentBy);
    duduWindow.setPosition(duduSepX, currentBy);
    duduWindow.show();

    bubuWindow.webContents.send('joint-finish', { facing: -1, action: 'celebrate', posX: bubuSepX });
    duduWindow.webContents.send('joint-finish', { facing: 1, action: 'dance', posX: duduSepX });

    jointActionInProgress = false;
    lastJointTriggerTime = Date.now();
  }, chosen.duration);
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'tray-icon.png');
  let trayIcon = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') {
    trayIcon = trayIcon.resize({ width: 22, height: 22 });
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('Bubu & Dudu Desktop Pet');

  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;

  const bubuVisible = bubuWindow && !bubuWindow.isDestroyed() && bubuWindow.isVisible();
  const duduVisible = duduWindow && !duduWindow.isDestroyed() && duduWindow.isVisible();
  const updateInfo = updater.getUpdateState();

  const menuItems = [
    {
      label: 'Bubu & Dudu Desktop Pet',
      enabled: false
    },
    {
      label: `🐼 Bubu: 🍗 ${petStats.bubu.hunger}% ⚡ ${petStats.bubu.energy}% | 🐻 Dudu: 🍗 ${petStats.dudu.hunger}% ⚡ ${petStats.dudu.energy}%`,
      enabled: false
    },
    { type: 'separator' },
  ];

  if (updateInfo.hasUpdate) {
    menuItems.push({
      label: `⭐ มีอัปเดตใหม่: ${updateInfo.latestVersion} (คลิกเพื่อติดตั้ง)`,
      click: () => updater.promptUpdateDialog(updateInfo.release, app ? app.getVersion() : '1.0.2')
    }, { type: 'separator' });
  }

  menuItems.push(
    {
      label: 'ให้อาหารน้อง Bubu 🍓',
      submenu: buildFoodSubmenu(bubuWindow, 'bubu')
    },
    {
      label: 'ให้อาหารน้อง Dudu 🍗',
      submenu: buildFoodSubmenu(duduWindow, 'dudu')
    },
    {
      label: 'ให้น้องนอนพัก 5 นาที 💤',
      click: () => {
        bubuWindow?.webContents.send('put-to-sleep', 300000);
        duduWindow?.webContents.send('put-to-sleep', 300000);
      }
    },
    {
      label: 'ปลุกน้องทั้งสอง ⏰',
      click: () => {
        bubuWindow?.webContents.send('wake-up-pet');
        duduWindow?.webContents.send('wake-up-pet');
      }
    },
    { type: 'separator' },
    {
      label: 'Show Bubu',
      type: 'checkbox',
      checked: bubuVisible,
      click: () => {
        if (bubuWindow && !bubuWindow.isDestroyed()) {
          if (bubuVisible) bubuWindow.hide();
          else bubuWindow.show();
          updateTrayMenu();
        }
      }
    },
    {
      label: 'Show Dudu',
      type: 'checkbox',
      checked: duduVisible,
      click: () => {
        if (duduWindow && !duduWindow.isDestroyed()) {
          if (duduVisible) duduWindow.hide();
          else duduWindow.show();
          updateTrayMenu();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Ghost Mode (Click-Through) [Ctrl+Shift+G]',
      type: 'checkbox',
      checked: isGhostMode,
      click: () => setGhostMode(!isGhostMode)
    },
    {
      label: 'Pet Size',
      submenu: [
        { label: 'Tiny (70%)', type: 'radio', checked: currentScale === 0.7, click: () => setScale(0.7) },
        { label: 'Normal (100%)', type: 'radio', checked: currentScale === 1.0, click: () => setScale(1.0) },
        { label: 'Large (130%)', type: 'radio', checked: currentScale === 1.3, click: () => setScale(1.3) },
        { label: 'Huge (160%)', type: 'radio', checked: currentScale === 1.6, click: () => setScale(1.6) },
      ]
    },
    {
      label: 'Actions & Emotions',
      submenu: [
        {
          label: 'Bubu Actions',
          submenu: buildPetActionSubmenus('bubu', bubuWindow)
        },
        {
          label: 'Dudu Actions',
          submenu: buildPetActionSubmenus('dudu', duduWindow)
        },
        {
          label: 'Couple Actions (Together! 💕)',
          submenu: buildCoupleActionSubmenu()
        },
        { type: 'separator' },
        {
          label: 'Put Both Pets to Sleep 💤',
          click: () => {
            bubuWindow?.webContents.send('trigger-action', 'sleep');
            duduWindow?.webContents.send('trigger-action', 'sleep');
          }
        },
        {
          label: 'Wake Up Both Pets ⏰',
          click: () => {
            bubuWindow?.webContents.send('trigger-action', 'walk');
            duduWindow?.webContents.send('trigger-action', 'walk');
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Reset Positions to Bottom',
      click: resetPositions
    },
    {
      label: 'ตรวจหาอัปเดต... (Check for Updates 🔄)',
      click: () => updater.checkForUpdates({ silent: false })
    },
    { type: 'separator' },
    {
      label: 'Quit Bubu & Dudu',
      click: () => app.quit()
    }
  );

  const contextMenu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(contextMenu);
}

// IPC Handlers
if (isElectron && ipcMain) {
ipcMain.on('move-pet', (event, { step, dy }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  const display = screen.getDisplayMatching(win.getBounds());
  const workArea = display.workArea;
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();

  const minX = workArea.x + 8;
  const maxX = workArea.x + workArea.width - w - 8;
  const newX = x + step;
  const newY = Math.round(y + dy);

  if (newX >= maxX) {
    win.setPosition(maxX, newY);
    win.webContents.send('hit-boundary', { direction: -1 });
  } else if (newX <= minX) {
    win.setPosition(minX, newY);
    win.webContents.send('hit-boundary', { direction: 1 });
  } else {
    win.setPosition(Math.round(newX), newY);
  }
});

ipcMain.on('drag-window', (event, { dx, dy }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  const display = screen.getDisplayMatching(win.getBounds());
  const workArea = display.workArea;
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();

  const minX = workArea.x - 20;
  const maxX = workArea.x + workArea.width - w + 20;
  const minY = workArea.y;
  const maxY = workArea.y + workArea.height - h;

  const targetX = Math.max(minX, Math.min(maxX, Math.round(x + dx)));
  const targetY = Math.max(minY, Math.min(maxY, Math.round(y + dy)));

  win.setPosition(targetX, targetY);
});

ipcMain.on('update-position', (event, data) => {
  positions[data.petName] = data;
});

ipcMain.on('pet-stats-update', (event, data) => {
  if (petStats[data.petName]) {
    petStats[data.petName] = data;
  }
});

ipcMain.on('open-context-menu', (event, petName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  const isBubu = petName === 'bubu';
  const stats = petStats[petName] || { hunger: 80, energy: 90, happiness: 95 };
  const statusIcon = stats.isSleeping ? '💤 กำลังหลับสบาย' : (stats.hunger < 35 ? '🥺 หิวงับ' : '✨ ร่าเริง');

  const menu = Menu.buildFromTemplate([
    { label: `${isBubu ? '🐼 Bubu' : '🐻 Dudu'} (🍗 ${stats.hunger}% | ⚡ ${stats.energy}% | ${statusIcon})`, enabled: false },
    { type: 'separator' },
    {
      label: `ให้อาหาร (${isBubu ? 'Feed Bubu' : 'Feed Dudu'} 🍽️)`,
      submenu: buildFoodSubmenu(win, petName)
    },
    {
      label: 'ให้น้องนอนพัก 5 นาที 💤',
      click: () => win.webContents.send('put-to-sleep', 300000)
    },
    {
      label: 'ปลุกน้อง ⏰',
      click: () => win.webContents.send('wake-up-pet')
    },
    { type: 'separator' },
    {
      label: 'Change Action',
      submenu: buildPetActionSubmenus(petName, win)
    },
    {
      label: 'Couple Actions 💕',
      submenu: buildCoupleActionSubmenu()
    },
    { type: 'separator' },
    {
      label: 'Ghost Mode (Click-Through)',
      type: 'checkbox',
      checked: isGhostMode,
      click: () => setGhostMode(!isGhostMode)
    },
    {
      label: 'Scale',
      submenu: [
        { label: 'Tiny (70%)', type: 'radio', checked: currentScale === 0.7, click: () => setScale(0.7) },
        { label: 'Normal (100%)', type: 'radio', checked: currentScale === 1.0, click: () => setScale(1.0) },
        { label: 'Large (130%)', type: 'radio', checked: currentScale === 1.3, click: () => setScale(1.3) },
        { label: 'Huge (160%)', type: 'radio', checked: currentScale === 1.6, click: () => setScale(1.6) },
      ]
    },
    {
      label: 'Hide This Pet',
      click: () => {
        win.hide();
        updateTrayMenu();
      }
    },
    {
      label: 'Reset Position',
      click: () => {
        const { workArea, floorY } = getWorkAreaBounds();
        win.setPosition(isBubu ? workArea.x + 180 : workArea.x + 380, floorY);
        win.webContents.send('reset-position');
      }
    },
    { type: 'separator' },
    {
      label: 'Check for Updates 🔄',
      click: () => updater.checkForUpdates({ silent: false })
    },
    { type: 'separator' },
    {
      label: 'Quit Program',
      click: () => app.quit()
    }
  ]);

  menu.popup({ window: win });
});

ipcMain.on('check-for-updates', () => {
  updater.checkForUpdates({ silent: false });
});
}

// App Lifecycle
if (isElectron && app) {
  app.whenReady().then(() => {
    createTray();
    initWindows();

    // Start background auto-updater checks
    updater.initAutoUpdater();
    updater.onUpdateStatus((status) => {
      updateTrayMenu();
      if (status.hasUpdate) {
        bubuWindow?.webContents.send('thought-bubble', `⭐ มีอัปเดตใหม่ ${status.latestVersion}! คลิกที่ไอคอนถาดระบบเพื่ออัปเดตได้เลย ✨`);
        duduWindow?.webContents.send('thought-bubble', `⭐ มีอัปเดตใหม่ ${status.latestVersion}! ✨`);
      }
    });

    globalShortcut.register('CommandOrControl+Shift+G', () => {
      setGhostMode(!isGhostMode);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        initWindows();
      }
    });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    loadActions,
    buildPetActionSubmenus,
    buildCoupleActionSubmenu,
    buildFoodSubmenu,
    CATEGORY_CONFIG,
    updater
  };
}

