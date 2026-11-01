const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onPetInit: (callback) => ipcRenderer.on('pet-init', (_event, data) => callback(data)),
  onStateUpdate: (callback) => ipcRenderer.on('state-update', (_event, data) => callback(data)),
  onToggleGhostMode: (callback) => ipcRenderer.on('ghost-mode', (_event, enabled) => callback(enabled)),
  onScaleChange: (callback) => ipcRenderer.on('scale-change', (_event, scale) => callback(scale)),
  onResetPosition: (callback) => ipcRenderer.on('reset-position', () => callback()),
  onTriggerAction: (callback) => ipcRenderer.on('trigger-action', (_event, action) => callback(action)),
  onJointAction: (callback) => ipcRenderer.on('joint-action', (_event, data) => callback(data)),
  onJointFinish: (callback) => ipcRenderer.on('joint-finish', (_event, data) => callback(data)),
  onHitBoundary: (callback) => ipcRenderer.on('hit-boundary', (_event, data) => callback(data)),
  onFeedPet: (callback) => ipcRenderer.on('feed-pet', (_event, data) => callback(data)),
  onPutToSleep: (callback) => ipcRenderer.on('put-to-sleep', (_event, data) => callback(data)),
  onWakeUpPet: (callback) => ipcRenderer.on('wake-up-pet', () => callback()),
  onThoughtBubble: (callback) => ipcRenderer.on('thought-bubble', (_event, text) => callback(text)),

  updatePosition: (data) => ipcRenderer.send('update-position', data),
  updatePetStats: (data) => ipcRenderer.send('pet-stats-update', data),
  movePet: (step, dy) => ipcRenderer.send('move-pet', { step, dy }),
  dragWindow: (dx, dy) => ipcRenderer.send('drag-window', { dx, dy }),
  openContextMenu: (petName) => ipcRenderer.send('open-context-menu', petName),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  triggerJointEvent: () => ipcRenderer.send('trigger-joint-event'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),

  getActions: () => {
    try {
      delete require.cache[require.resolve('./actions.json')];
      return require('./actions.json');
    } catch (e) {
      return null;
    }
  },
});
