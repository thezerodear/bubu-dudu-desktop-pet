const path = require('path');
const actions = require('./actions.json');

/**
 * Get action configuration for a specific pet and action key.
 * Falls back to 'walk' if the action does not exist.
 * @param {'bubu'|'dudu'} petName
 * @param {string} actionName
 * @returns {object|null}
 */
function getAction(petName, actionName) {
  const dict = actions[petName];
  if (!dict) return null;
  return dict[actionName] || dict.walk || null;
}

/**
 * Get all actions for a specific pet.
 * @param {'bubu'|'dudu'} petName
 * @returns {object}
 */
function getActionsForPet(petName) {
  return actions[petName] || {};
}

/**
 * Get actions meant to be shown in the menu for a pet.
 * Filters out actions with menu: false.
 * @param {'bubu'|'dudu'} petName
 * @returns {Array<{key: string, label: string, category: string, file: string, speed: number, duration: number[], naturalFacing: number}>}
 */
function getMenuActions(petName) {
  const petActions = actions[petName] || {};
  return Object.entries(petActions)
    .filter(([_, conf]) => conf.menu !== false)
    .map(([key, conf]) => ({ key, ...conf }));
}

/**
 * Get all joint animations as an array.
 * @returns {Array<{id: string, name: string, file: string, duration: number, emotes: string[]}>}
 */
function getJointAnimations() {
  return Object.values(actions.joint || {});
}

/**
 * Get joint animation by ID.
 * @param {string} jointId
 * @returns {object|null}
 */
function getJointAnimation(jointId) {
  return (actions.joint && actions.joint[jointId]) || null;
}

/**
 * Get food menu items.
 * @returns {Array<{id: string, food: string, icon: string, name: string, hunger: number, happiness: number}>}
 */
function getFoodMenu() {
  return actions.food || [];
}

/**
 * Resolve relative asset file path to absolute path.
 * @param {string} relativeFile
 * @param {string} [baseDir]
 * @returns {string}
 */
function resolveAssetPath(relativeFile, baseDir = __dirname) {
  return path.resolve(baseDir, relativeFile);
}

/**
 * Validate registry data structure against schema.
 * @param {object} data
 * @returns {string[]} Array of error messages, empty if valid
 */
function validateSchema(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return ['Registry data must be a non-null object'];
  }
  if (!data.bubu || typeof data.bubu !== 'object') errors.push('Missing or invalid "bubu" object');
  if (!data.dudu || typeof data.dudu !== 'object') errors.push('Missing or invalid "dudu" object');
  if (!data.joint || typeof data.joint !== 'object') errors.push('Missing or invalid "joint" object');
  if (!Array.isArray(data.food)) errors.push('Missing or invalid "food" array');

  const validCategories = new Set(['idle', 'movement', 'special', 'vitality']);

  for (const pet of ['bubu', 'dudu']) {
    if (!data[pet]) continue;
    for (const [actionName, action] of Object.entries(data[pet])) {
      const prefix = `${pet}.${actionName}`;
      if (!action.file || typeof action.file !== 'string' || !action.file.endsWith('.gif')) {
        errors.push(`${prefix}: "file" must be a string ending in .gif`);
      }
      if (typeof action.speed !== 'number' || action.speed < 0) {
        errors.push(`${prefix}: "speed" must be a non-negative number`);
      }
      if (!Array.isArray(action.duration) || action.duration.length !== 2 || action.duration[0] <= 0 || action.duration[1] < action.duration[0]) {
        errors.push(`${prefix}: "duration" must be [min, max] where 0 < min <= max`);
      }
      if (action.naturalFacing !== 1 && action.naturalFacing !== -1) {
        errors.push(`${prefix}: "naturalFacing" must be 1 or -1`);
      }
      if (!action.label || typeof action.label !== 'string') {
        errors.push(`${prefix}: "label" must be a non-empty string`);
      }
      if (!validCategories.has(action.category)) {
        errors.push(`${prefix}: "category" must be one of ${Array.from(validCategories).join(', ')}`);
      }
    }
  }

  if (data.joint) {
    for (const [jointKey, joint] of Object.entries(data.joint)) {
      const prefix = `joint.${jointKey}`;
      if (!joint.id || typeof joint.id !== 'string') errors.push(`${prefix}: "id" must be a string`);
      if (!joint.name || typeof joint.name !== 'string') errors.push(`${prefix}: "name" must be a string`);
      if (!joint.file || !joint.file.endsWith('.gif')) errors.push(`${prefix}: "file" must end in .gif`);
      if (typeof joint.duration !== 'number' || joint.duration <= 0) errors.push(`${prefix}: "duration" must be > 0`);
      if (!Array.isArray(joint.emotes)) errors.push(`${prefix}: "emotes" must be an array`);
    }
  }

  if (Array.isArray(data.food)) {
    data.food.forEach((item, idx) => {
      const prefix = `food[${idx}]`;
      if (!item.name || typeof item.name !== 'string') errors.push(`${prefix}: "name" must be a string`);
      if (!item.food && !item.icon) errors.push(`${prefix}: "food" or "icon" must be present`);
      if (typeof item.hunger !== 'number' || item.hunger <= 0) errors.push(`${prefix}: "hunger" must be > 0`);
      if (typeof item.happiness !== 'number' || item.happiness <= 0) errors.push(`${prefix}: "happiness" must be > 0`);
    });
  }

  return errors;
}

module.exports = {
  actions,
  getAction,
  getActionsForPet,
  getMenuActions,
  getJointAnimations,
  getJointAnimation,
  getFoodMenu,
  resolveAssetPath,
  validateSchema
};
