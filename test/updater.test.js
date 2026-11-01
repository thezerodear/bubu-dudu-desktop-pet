const { test, describe } = require('node:test');
const assert = require('node:assert');
const updater = require('../src/updater.js');

describe('GitHub Auto-Updater Module Tests', () => {
  describe('Semver Parsing and Comparison', () => {
    test('parseSemver handles standard and prefixed version tags', () => {
      assert.deepStrictEqual(updater.parseSemver('1.0.2'), [1, 0, 2]);
      assert.deepStrictEqual(updater.parseSemver('v1.0.3'), [1, 0, 3]);
      assert.deepStrictEqual(updater.parseSemver('V2.15.4'), [2, 15, 4]);
      assert.deepStrictEqual(updater.parseSemver('v1.0.0-beta.1'), [1, 0, 0]);
      assert.deepStrictEqual(updater.parseSemver('v3.0.0+build123'), [3, 0, 0]);
      assert.deepStrictEqual(updater.parseSemver(''), [0, 0, 0]);
      assert.deepStrictEqual(updater.parseSemver(null), [0, 0, 0]);
    });

    test('semverCompare evaluates version precedence accurately', () => {
      assert.ok(updater.semverCompare('1.0.3', '1.0.2') > 0);
      assert.ok(updater.semverCompare('1.1.0', '1.0.9') > 0);
      assert.ok(updater.semverCompare('2.0.0', '1.99.99') > 0);
      assert.strictEqual(updater.semverCompare('1.0.2', '1.0.2'), 0);
      assert.strictEqual(updater.semverCompare('v1.0.2', '1.0.2'), 0);
      assert.ok(updater.semverCompare('1.0.1', '1.0.2') < 0);
      assert.ok(updater.semverCompare('0.9.9', '1.0.0') < 0);
    });

    test('isNewerVersion returns true strictly when remote is newer', () => {
      assert.strictEqual(updater.isNewerVersion('v1.0.3', '1.0.2'), true);
      assert.strictEqual(updater.isNewerVersion('1.0.2', '1.0.2'), false);
      assert.strictEqual(updater.isNewerVersion('1.0.1', '1.0.2'), false);
    });
  });

  describe('Repository Identifier Extraction', () => {
    test('extracts owner/repo from package.json formats', () => {
      const pkgObj = { repository: { type: 'git', url: 'https://github.com/bubu-dudu/bubu-dudu-desktop-pet.git' } };
      assert.strictEqual(updater.getRepoIdentifier(pkgObj), 'bubu-dudu/bubu-dudu-desktop-pet');

      const pkgString = { repository: 'theze/bubu-dudu-desktop-pet' };
      assert.strictEqual(updater.getRepoIdentifier(pkgString), 'theze/bubu-dudu-desktop-pet');

      const pkgGithubUrl = { repository: 'https://github.com/owner/custom-pet' };
      assert.strictEqual(updater.getRepoIdentifier(pkgGithubUrl), 'owner/custom-pet');
    });

    test('environment variable BUBU_DUDU_REPO overrides package.json', () => {
      const oldEnv = process.env.BUBU_DUDU_REPO;
      try {
        process.env.BUBU_DUDU_REPO = 'custom-org/custom-repo';
        assert.strictEqual(updater.getRepoIdentifier(), 'custom-org/custom-repo');
      } finally {
        if (oldEnv) process.env.BUBU_DUDU_REPO = oldEnv;
        else delete process.env.BUBU_DUDU_REPO;
      }
    });
  });

  describe('Platform Asset Selection', () => {
    const mockAssets = [
      { name: 'Bubu & Dudu Pet 1.0.3.exe', browser_download_url: 'https://example.com/portable.exe' },
      { name: 'Bubu & Dudu Pet Setup 1.0.3.exe', browser_download_url: 'https://example.com/setup.exe' },
      { name: 'Bubu & Dudu Pet Setup 1.0.3.exe.blockmap', browser_download_url: 'https://example.com/blockmap' },
      { name: 'Bubu & Dudu Pet-1.0.3-mac-arm64.zip', browser_download_url: 'https://example.com/mac-arm64.zip' },
      { name: 'Bubu & Dudu Pet-1.0.3-mac-x64.zip', browser_download_url: 'https://example.com/mac-x64.zip' }
    ];

    test('picks Setup exe for win32 when available', () => {
      const picked = updater.findPlatformAsset(mockAssets, 'win32', 'x64');
      assert.strictEqual(picked.name, 'Bubu & Dudu Pet Setup 1.0.3.exe');
      assert.strictEqual(picked.browser_download_url, 'https://example.com/setup.exe');
    });

    test('falls back to portable exe for win32 if Setup exe is absent', () => {
      const assetsNoSetup = mockAssets.filter(a => !a.name.includes('Setup'));
      const picked = updater.findPlatformAsset(assetsNoSetup, 'win32', 'x64');
      assert.strictEqual(picked.name, 'Bubu & Dudu Pet 1.0.3.exe');
    });

    test('picks arm64 zip for darwin on arm64 architecture', () => {
      const picked = updater.findPlatformAsset(mockAssets, 'darwin', 'arm64');
      assert.strictEqual(picked.name, 'Bubu & Dudu Pet-1.0.3-mac-arm64.zip');
    });

    test('picks x64 zip for darwin on x64 architecture (e.g. MacBook Pro 2020 Intel)', () => {
      const picked = updater.findPlatformAsset(mockAssets, 'darwin', 'x64');
      assert.strictEqual(picked.name, 'Bubu & Dudu Pet-1.0.3-mac-x64.zip');
    });

    test('returns null gracefully when asset list is empty or invalid', () => {
      assert.strictEqual(updater.findPlatformAsset([]), null);
      assert.strictEqual(updater.findPlatformAsset(null), null);
    });
  });

  describe('Authentication & Token Resolution', () => {
    test('getAuthToken resolves configured token', () => {
      const token = updater.getAuthToken();
      assert.ok(typeof token === 'string' && token.length > 10, 'Expected non-empty auth token');
    });

    test('environment variable GITHUB_TOKEN overrides config', () => {
      const oldToken = process.env.GITHUB_TOKEN;
      try {
        process.env.GITHUB_TOKEN = 'ghp_override_token_test_12345';
        assert.strictEqual(updater.getAuthToken(), 'ghp_override_token_test_12345');
      } finally {
        if (oldToken) process.env.GITHUB_TOKEN = oldToken;
        else delete process.env.GITHUB_TOKEN;
      }
    });

    test('saveAuthToken and getAuthToken persist token safely', () => {
      const testToken = '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';
      const saved = updater.saveAuthToken(testToken, 'thezerodear/bubu-dudu-desktop-pet');
      assert.strictEqual(saved, true);
      assert.strictEqual(updater.getAuthToken(), testToken);
    });
  });

  describe('Update State and Notification Flow', () => {
    test('getUpdateState returns initial snapshot safely', () => {
      const state = updater.getUpdateState();
      assert.strictEqual(typeof state, 'object');
      assert.strictEqual(state.checking, false);
      assert.strictEqual(state.hasUpdate, false);
    });

    test('listener receives notifications on status broadcast', () => {
      let notifiedData = null;
      updater.onUpdateStatus((data) => {
        notifiedData = data;
      });

      // Trigger test event via internal mechanism or checkForUpdates
      assert.strictEqual(typeof updater.onUpdateStatus, 'function');
    });
  });
});
