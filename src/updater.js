/**
 * Bubu & Dudu Desktop Pet - GitHub Auto-Updater
 * Checks GitHub Releases for new versions, downloads updates,
 * and notifies user via System Tray, Context Menu, and Pet Thought Bubbles.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let electron = null;
try {
  electron = require('electron');
} catch (e) {
  // Headless / Test mode
}

const isElectron = typeof electron === 'object' && electron !== null && typeof electron.app !== 'undefined';
const { app, dialog, shell } = isElectron ? electron : {};

// Default repository target
const DEFAULT_REPO = 'thezerodear/bubu-dudu-desktop-pet';

let updateState = {
  checking: false,
  hasUpdate: false,
  latestVersion: null,
  release: null,
  lastChecked: null,
  error: null,
};

let listeners = [];

/**
 * Parses semver string into [major, minor, patch] numbers.
 */
function parseSemver(v) {
  if (!v) return [0, 0, 0];
  const cleaned = v.toString().replace(/^v/i, '').trim();
  const base = cleaned.split('-')[0].split('+')[0];
  const parts = base.split('.').map(p => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

/**
 * Compares two semver strings: returns > 0 if v1 > v2, < 0 if v1 < v2, 0 if equal.
 */
function semverCompare(v1, v2) {
  const [maj1, min1, pat1] = parseSemver(v1);
  const [maj2, min2, pat2] = parseSemver(v2);
  if (maj1 !== maj2) return maj1 - maj2;
  if (min1 !== min2) return min1 - min2;
  return pat1 - pat2;
}

/**
 * Checks if remote version is strictly newer than local version.
 */
function isNewerVersion(remote, local) {
  return semverCompare(remote, local) > 0;
}

/**
 * Checks for GitHub authentication token (for private repositories).
 * Searches in environment variables, userData, working directory, and app paths.
 */
function getAuthToken() {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
    return process.env.GITHUB_TOKEN.trim();
  }
  if (process.env.GH_TOKEN && process.env.GH_TOKEN.trim()) {
    return process.env.GH_TOKEN.trim();
  }

  const candidatePaths = [
    path.join(__dirname, '..', 'updater.config.json'),
    path.join(process.cwd(), 'updater.config.json'),
  ];

  if (isElectron && app && typeof app.getPath === 'function') {
    try {
      candidatePaths.push(path.join(app.getPath('userData'), 'updater.config.json'));
    } catch (e) {}
  }

  if (process.execPath) {
    try {
      candidatePaths.push(path.join(path.dirname(process.execPath), 'updater.config.json'));
    } catch (e) {}
  }

  if (process.resourcesPath) {
    try {
      candidatePaths.push(path.join(process.resourcesPath, 'updater.config.json'));
    } catch (e) {}
  }

  for (const configPath of candidatePaths) {
    try {
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (cfg && cfg.token && typeof cfg.token === 'string' && cfg.token.trim()) {
          return cfg.token.trim();
        }
      }
    } catch (e) {
      // Ignore reading error
    }
  }

  return null;
}

/**
 * Saves GitHub authentication token to configuration files.
 */
function saveAuthToken(token, repo = null) {
  const data = {
    token: (token || '').trim(),
    repository: repo || getRepoIdentifier(),
    updatedAt: new Date().toISOString()
  };

  const targets = [];
  if (isElectron && app && typeof app.getPath === 'function') {
    try {
      targets.push(path.join(app.getPath('userData'), 'updater.config.json'));
    } catch (e) {}
  }
  targets.push(path.join(__dirname, '..', 'updater.config.json'));

  let saved = false;
  for (const target of targets) {
    try {
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
      saved = true;
    } catch (e) {}
  }
  return saved;
}

/**
 * Extracts owner/repo string from package.json or environment variables.
 */
function getRepoIdentifier(pkgData = null) {
  if (process.env.BUBU_DUDU_REPO) {
    return process.env.BUBU_DUDU_REPO.trim();
  }

  let pkg = pkgData;
  if (!pkg) {
    try {
      const pkgPath = path.join(__dirname, '..', 'package.json');
      if (fs.existsSync(pkgPath)) {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      }
    } catch (e) {
      // Ignore parse failure
    }
  }

  if (pkg) {
    if (typeof pkg.repository === 'string') {
      const cleaned = pkg.repository.replace(/^github:/i, '').replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
      if (cleaned.includes('/')) return cleaned;
    } else if (pkg.repository && typeof pkg.repository.url === 'string') {
      const m = pkg.repository.url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
      if (m && m[1]) return m[1];
    }
  }

  return DEFAULT_REPO;
}

/**
 * Finds the appropriate downloadable asset for current OS and architecture.
 */
function findPlatformAsset(assets, platform = process.platform, arch = process.arch) {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  if (platform === 'win32') {
    // 1st priority: Setup installer exe
    const setupExe = assets.find(a => a.name && a.name.endsWith('.exe') && a.name.toLowerCase().includes('setup'));
    if (setupExe) return setupExe;
    // 2nd priority: Portable exe
    const anyExe = assets.find(a => a.name && a.name.endsWith('.exe') && !a.name.endsWith('.blockmap'));
    if (anyExe) return anyExe;
  } else if (platform === 'darwin') {
    const archKey = (arch === 'arm64' || arch === 'aarch64') ? 'arm64' : 'x64';
    // Match matching arch zip or dmg
    const matched = assets.find(a => a.name && (a.name.endsWith('.zip') || a.name.endsWith('.dmg')) && a.name.toLowerCase().includes(archKey));
    if (matched) return matched;
    // Fallback: any mac zip
    const anyMac = assets.find(a => a.name && (a.name.endsWith('.zip') || a.name.endsWith('.dmg')) && a.name.toLowerCase().includes('mac'));
    if (anyMac) return anyMac;
  }

  return null;
}

/**
 * Makes an HTTPS/HTTP GET request and follows redirects (e.g. for GitHub release asset downloads).
 * Automatically handles GitHub authorization token and strips it when redirecting to external storage (S3).
 */
function httpsGetWithRedirects(url, headers = {}, onProgress = null) {
  return new Promise((resolve, reject) => {
    function request(currentUrl, redirectCount = 0) {
      if (redirectCount > 8) {
        return reject(new Error('Too many redirects while accessing ' + currentUrl));
      }

      let uObj;
      try {
        uObj = new URL(currentUrl);
      } catch (e) {
        return reject(new Error('Invalid URL: ' + currentUrl));
      }

      const token = getAuthToken();
      const isGitHub = uObj.hostname.endsWith('github.com');

      const reqHeaders = Object.assign({
        'User-Agent': 'Bubu-Dudu-Pet-AutoUpdater',
      }, headers);

      if (!reqHeaders['Accept']) {
        reqHeaders['Accept'] = 'application/vnd.github.v3+json';
      }

      // Only attach Authorization header to *.github.com domains (never forward to S3 or third-party storage)
      if (isGitHub && token && !reqHeaders['Authorization']) {
        reqHeaders['Authorization'] = `token ${token}`;
      } else if (!isGitHub) {
        delete reqHeaders['Authorization'];
      }

      const client = uObj.protocol === 'http:' ? http : https;
      const req = client.get(currentUrl, { headers: reqHeaders }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, currentUrl).toString();
          return request(nextUrl, redirectCount + 1);
        }

        if (res.statusCode !== 200) {
          let errBody = '';
          res.on('data', chunk => errBody += chunk);
          res.on('end', () => {
            const err = new Error(`HTTP ${res.statusCode}: ${errBody || res.statusMessage}`);
            err.statusCode = res.statusCode;
            reject(err);
          });
          return;
        }

        resolve(res);
      });

      req.on('error', reject);
    }

    request(url);
  });
}

/**
 * Downloads a remote URL to a local destination file.
 */
async function downloadFile(url, destPath, headers = {}, onProgress = null) {
  let finalHeaders = headers;
  let finalProgress = onProgress;
  if (typeof headers === 'function') {
    finalProgress = headers;
    finalHeaders = {};
  }

  const res = await httpsGetWithRedirects(url, finalHeaders);
  const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
  let downloadedBytes = 0;

  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const fileStream = fs.createWriteStream(destPath);
    res.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      if (finalProgress && totalBytes > 0) {
        finalProgress(downloadedBytes / totalBytes, downloadedBytes, totalBytes);
      }
    });

    res.pipe(fileStream);

    fileStream.on('finish', () => {
      fileStream.close(() => resolve({ path: destPath, totalBytes: downloadedBytes }));
    });

    fileStream.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Fetches the latest release info from GitHub Releases API.
 */
async function fetchLatestRelease(repo = null) {
  const targetRepo = repo || getRepoIdentifier();
  const url = `https://api.github.com/repos/${targetRepo}/releases/latest`;

  const res = await httpsGetWithRedirects(url);
  let raw = '';
  for await (const chunk of res) {
    raw += chunk;
  }

  const data = JSON.parse(raw);
  return data;
}

/**
 * Checks for updates against current app version.
 * @param {Object} options - { silent: boolean, repo: string, currentVersion: string }
 */
async function checkForUpdates(options = {}) {
  const currentVersion = options.currentVersion || (app ? app.getVersion() : '1.0.2');
  const repo = options.repo || getRepoIdentifier();

  updateState.checking = true;
  updateState.error = null;

  try {
    const release = await fetchLatestRelease(repo);
    updateState.lastChecked = new Date();
    updateState.release = release;
    updateState.latestVersion = release.tag_name || release.name;

    const hasUpdate = isNewerVersion(updateState.latestVersion, currentVersion);
    updateState.hasUpdate = hasUpdate;
    updateState.checking = false;

    notifyListeners({
      hasUpdate,
      latestVersion: updateState.latestVersion,
      currentVersion,
      release,
      silent: !!options.silent
    });

    if (hasUpdate) {
      if (!options.silent && isElectron && dialog) {
        promptUpdateDialog(release, currentVersion);
      }
    } else {
      if (!options.silent && isElectron && dialog) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Bubu & Dudu Pet',
          message: `คุณกำลังใช้เวอร์ชันล่าสุดแล้ว! (v${currentVersion})`,
          detail: 'น้องๆ Bubu และ Dudu สดชื่นและพร้อมเล่นอยู่เสมอ ไม่มีอัปเดตใหม่ในขณะนี้ ✨',
          buttons: ['ตกลง']
        });
      }
    }

    return { hasUpdate, latestVersion: updateState.latestVersion, currentVersion, release };
  } catch (err) {
    updateState.checking = false;
    updateState.error = err.message;
    updateState.lastChecked = new Date();

    notifyListeners({
      hasUpdate: false,
      error: err.message,
      silent: !!options.silent
    });

    if (!options.silent && isElectron && dialog) {
      const isAuthError = err.statusCode === 404 || err.statusCode === 401 || (err.message && (err.message.includes('404') || err.message.includes('401')));
      if (isAuthError && !getAuthToken()) {
        const choice = await dialog.showMessageBox({
          type: 'warning',
          title: 'Bubu & Dudu Pet - GitHub Update',
          message: 'Repository นี้เป็นแบบส่วนตัว (Private)',
          detail: 'ไม่สามารถเข้าถึง GitHub Release ได้เนื่องจากยังไม่ได้ระบุ GitHub Token หรือ Token หมดอายุ\n\nต้องการตั้งค่า GitHub Token ตอนนี้หรือไม่?',
          buttons: ['ตั้งค่า Token 🔑', 'ไว้ภายหลัง']
        });
        if (choice.response === 0) {
          await promptTokenConfigDialog();
        }
      } else {
        dialog.showMessageBox({
          type: 'warning',
          title: 'Bubu & Dudu Pet Update',
          message: 'ไม่สามารถตรวจสอบการอัปเดตได้ในขณะนี้',
          detail: `ข้อผิดพลาด: ${err.message}\n(ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต หรือลองใหม่อีกครั้งในภายหลัง)`,
          buttons: ['ตกลง']
        });
      }
    }

    return { hasUpdate: false, error: err.message };
  }
}

/**
 * Shows interactive dialog prompt to download or view update.
 */
async function promptUpdateDialog(release, currentVersion) {
  if (!dialog) return;

  const tag = release.tag_name || 'New Version';
  const notes = (release.body || 'มีการปรับปรุงและเพิ่มฟีเจอร์ใหม่').slice(0, 500);

  const result = await dialog.showMessageBox({
    type: 'question',
    title: '🎉 พบอัปเดตใหม่สำหรับ Bubu & Dudu Pet!',
    message: `เวอร์ชันใหม่ ${tag} พร้อมให้ใช้งานแล้ว! (เวอร์ชันปัจจุบัน: v${currentVersion})`,
    detail: `${notes}\n\nต้องการดาวน์โหลดและติดตั้งทันทีหรือไม่?`,
    buttons: ['ดาวน์โหลดและอัปเดต 📥', 'เปิดดูบน GitHub 🌐', 'ไว้ภายหลัง ❌'],
    defaultId: 0,
    cancelId: 2,
  });

  if (result.response === 0) {
    await performDownloadAndInstall(release);
  } else if (result.response === 1) {
    if (shell && release.html_url) {
      shell.openExternal(release.html_url);
    }
  }
}

/**
 * Dialog to view or configure GitHub Personal Access Token.
 */
async function promptTokenConfigDialog() {
  if (!dialog) return;

  const currentToken = getAuthToken();
  const masked = currentToken ? (currentToken.slice(0, 7) + '...' + currentToken.slice(-4)) : 'ยังไม่ได้ตั้งค่า';

  const res = await dialog.showMessageBox({
    type: 'info',
    title: 'ตั้งค่า GitHub Token สำหรับ Auto-Update 🔑',
    message: `สถานะ Token ปัจจุบัน: ${masked}`,
    detail: `ระบบรองรับการอ่าน Token อัตโนมัติจาก:\n1. ไฟล์ updater.config.json\n2. ตัวแปรสภาพแวดล้อม GITHUB_TOKEN\n\nต้องการเปิดโฟลเดอร์ตั้งค่าเพื่อตรวจสอบ/แก้ไขไฟล์ updater.config.json หรือไม่?`,
    buttons: ['เปิดโฟลเดอร์ตั้งค่า 📁', 'เปิดหน้าสร้าง Token บน GitHub 🌐', 'ปิด']
  });

  if (res.response === 0) {
    const configPath = (isElectron && app && typeof app.getPath === 'function')
      ? path.join(app.getPath('userData'), 'updater.config.json')
      : path.join(__dirname, '..', 'updater.config.json');

    if (!fs.existsSync(configPath)) {
      saveAuthToken(currentToken || '', getRepoIdentifier());
    }

    if (shell) {
      shell.showItemInFolder(configPath);
    }
  } else if (res.response === 1) {
    if (shell) {
      shell.openExternal('https://github.com/settings/tokens/new?scopes=repo&description=BubuDuduPetAutoUpdate');
    }
  }
}

/**
 * Downloads matching asset and executes or reveals it.
 * Uses asset.url with Accept: application/octet-stream for private repository support.
 */
async function performDownloadAndInstall(release, onProgress = null) {
  const asset = findPlatformAsset(release.assets);
  if (!asset) {
    if (shell && release.html_url) {
      shell.openExternal(release.html_url);
    }
    return { success: false, reason: 'no-platform-asset' };
  }

  const token = getAuthToken();
  const tempDir = app ? app.getPath('temp') : require('os').tmpdir();
  const destPath = path.join(tempDir, asset.name);

  // If token is present, use asset.url with Accept: application/octet-stream
  // (Mandatory for private repositories where browser_download_url returns 404)
  const isPrivate = !!token;
  const downloadUrl = (isPrivate && asset.url) ? asset.url : (asset.browser_download_url || asset.url);
  const downloadHeaders = (isPrivate && asset.url) ? { 'Accept': 'application/octet-stream' } : {};

  if (dialog) {
    dialog.showMessageBox({
      type: 'info',
      title: 'กำลังดาวน์โหลดอัปเดต 📥',
      message: `กำลังดาวน์โหลด ${asset.name}...`,
      detail: 'ระบบกำลังดาวน์โหลดไฟล์อัปเดตในเบื้องหลัง เมื่อเสร็จสิ้นจะเปิดตัวติดตั้งให้อัตโนมัติครับ ✨',
      buttons: ['รับทราบ']
    });
  }

  try {
    await downloadFile(downloadUrl, destPath, downloadHeaders, onProgress);

    if (process.platform === 'win32') {
      const confirm = await dialog.showMessageBox({
        type: 'info',
        title: 'ดาวน์โหลดเสร็จสมบูรณ์ 🎉',
        message: 'ดาวน์โหลดเวอร์ชันใหม่เสร็จแล้ว พร้อมติดตั้งทันที!',
        buttons: ['ติดตั้งและเริ่มแอปใหม่ 🚀', 'ไว้เปิดเองภายหลัง']
      });

      if (confirm.response === 0) {
        spawn(destPath, [], { detached: true, stdio: 'ignore' }).unref();
        if (app) app.quit();
      }
    } else if (process.platform === 'darwin') {
      if (shell) {
        shell.showItemInFolder(destPath);
      }
      if (dialog) {
        dialog.showMessageBox({
          type: 'info',
          title: 'ดาวน์โหลดเสร็จสมบูรณ์ 🎉',
          message: 'ดาวน์โหลดเวอร์ชันใหม่เสร็จแล้ว!',
          detail: `ไฟล์อยู่ที่: ${destPath}\nเปิดไฟล์เพื่อแทนที่แอปในโฟลเดอร์ Applications ได้ทันที ✨`,
          buttons: ['ตกลง']
        });
      }
    }
    return { success: true, path: destPath };
  } catch (err) {
    if (dialog) {
      dialog.showMessageBox({
        type: 'error',
        title: 'การดาวน์โหลดล้มเหลว',
        message: 'ไม่สามารถดาวน์โหลดไฟล์อัปเดตได้',
        detail: `${err.message}\nจะเปิดหน้าดาวน์โหลด Release บนเบราว์เซอร์แทนครับ`,
        buttons: ['ตกลง']
      });
    }
    if (shell && release.html_url) {
      shell.openExternal(release.html_url);
    }
    return { success: false, error: err.message };
  }
}

/**
 * Register state listener callback.
 */
function onUpdateStatus(callback) {
  listeners.push(callback);
}

function notifyListeners(data) {
  listeners.forEach(fn => {
    try { fn(data); } catch (e) { /* ignore */ }
  });
}

/**
 * Initialize background auto-updater with periodic checks.
 */
function initAutoUpdater(checkIntervalMs = 4 * 60 * 60 * 1000) {
  if (!isElectron) return;

  // Initial check after 10 seconds
  setTimeout(() => {
    checkForUpdates({ silent: true });
  }, 10000);

  // Periodic recurring check
  setInterval(() => {
    checkForUpdates({ silent: true });
  }, checkIntervalMs);
}

module.exports = {
  parseSemver,
  semverCompare,
  isNewerVersion,
  getRepoIdentifier,
  getAuthToken,
  saveAuthToken,
  findPlatformAsset,
  fetchLatestRelease,
  checkForUpdates,
  promptUpdateDialog,
  promptTokenConfigDialog,
  performDownloadAndInstall,
  downloadFile,
  httpsGetWithRedirects,
  onUpdateStatus,
  initAutoUpdater,
  getUpdateState: () => Object.assign({}, updateState)
};
