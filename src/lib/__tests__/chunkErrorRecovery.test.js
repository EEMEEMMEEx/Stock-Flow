import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isChunkLoadError,
  canTriggerChunkReload,
  markChunkReload,
  clearChunkReloadCooldown,
  CHUNK_RELOAD_STORAGE_KEY,
  CHUNK_RELOAD_COOLDOWN_MS,
} from '../chunkErrorRecovery.js';

// Mock Storage implementation for Node.js test environment
class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('chunkErrorRecovery', () => {
  describe('isChunkLoadError', () => {
    it('detects "Failed to fetch dynamically imported module"', () => {
      const err = new TypeError('Failed to fetch dynamically imported module: https://www.stockflowth.online/assets/Projects--P3P7-5U.js');
      assert.equal(isChunkLoadError(err), true);
    });

    it('detects MIME type text/html error when server responds with index.html SPA rewrite', () => {
      const err = new TypeError('Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of text/html');
      assert.equal(isChunkLoadError(err), true);
    });

    it('detects Safari "Importing a module script failed"', () => {
      const err = new Error('Importing a module script failed.');
      assert.equal(isChunkLoadError(err), true);
    });

    it('detects "error loading dynamically imported module"', () => {
      const err = new Error('error loading dynamically imported module');
      assert.equal(isChunkLoadError(err), true);
    });

    it('detects CSS chunk loading failures', () => {
      const err = new Error('unable to preload css');
      assert.equal(isChunkLoadError(err), true);
    });

    it('detects string error messages', () => {
      assert.equal(isChunkLoadError('Loading chunk 404 failed'), true);
    });

    it('returns false for unrelated runtime errors', () => {
      assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined (reading "map")')), false);
      assert.equal(isChunkLoadError(new ReferenceError('user is not defined')), false);
      assert.equal(isChunkLoadError(null), false);
      assert.equal(isChunkLoadError(undefined), false);
    });
  });

  describe('reload loop cooldown guard', () => {
    it('allows initial reload when storage is empty', () => {
      const storage = new MockStorage();
      assert.equal(canTriggerChunkReload(storage), true);
    });

    it('prevents repeated reload within cooldown window', () => {
      const storage = new MockStorage();
      const now = 100000;
      markChunkReload(storage, now);

      // 5 seconds later (within 15s cooldown)
      assert.equal(canTriggerChunkReload(storage, now + 5000), false);
      // Exactly 15s later
      assert.equal(canTriggerChunkReload(storage, now + CHUNK_RELOAD_COOLDOWN_MS), false);
      // 15.001s later (cooldown elapsed)
      assert.equal(canTriggerChunkReload(storage, now + CHUNK_RELOAD_COOLDOWN_MS + 1), true);
    });

    it('clearChunkReloadCooldown resets the guard so user click works immediately', () => {
      const storage = new MockStorage();
      const now = 100000;
      markChunkReload(storage, now);
      assert.equal(canTriggerChunkReload(storage, now + 1000), false);

      clearChunkReloadCooldown(storage);
      assert.equal(canTriggerChunkReload(storage, now + 1000), true);
      assert.equal(storage.getItem(CHUNK_RELOAD_STORAGE_KEY), null);
    });

    it('handles corrupted or invalid stored timestamps safely', () => {
      const storage = new MockStorage();
      storage.setItem(CHUNK_RELOAD_STORAGE_KEY, 'corrupted_string');
      assert.equal(canTriggerChunkReload(storage), true);
    });
  });
});
