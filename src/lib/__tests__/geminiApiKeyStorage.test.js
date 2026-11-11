import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage and window in node test environment
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

let eventDispatched = null;
globalThis.CustomEvent = class CustomEvent {
  constructor(name, options) {
    this.name = name;
    this.detail = options?.detail;
  }
};
globalThis.window = {
  dispatchEvent: (ev) => {
    eventDispatched = ev;
    return true;
  }
};

// Import module after mocks
const {
  getGeminiApiKey,
  saveGeminiApiKey,
  getGeminiApiKeyDetails
} = await import('../geminiCopilot.js');

describe('Gemini API Key Storage & Retrieval', () => {
  beforeEach(() => {
    mockStorage.clear();
    eventDispatched = null;
  });

  it('should return empty string when no key is configured', () => {
    const key = getGeminiApiKey();
    assert.equal(key, '');

    const details = getGeminiApiKeyDetails();
    assert.equal(details.hasKey, false);
    assert.equal(details.source, 'none');
    assert.equal(details.localKey, '');
  });

  it('should save API key and retrieve it accurately', () => {
    const sampleKey = 'AIzaSyA_sample_valid_gemini_key_12345';
    const result = saveGeminiApiKey(sampleKey);

    assert.equal(result, true);
    assert.equal(getGeminiApiKey(), sampleKey);

    const details = getGeminiApiKeyDetails();
    assert.equal(details.hasKey, true);
    assert.equal(details.source, 'local');
    assert.equal(details.localKey, sampleKey);
    assert.equal(details.activeKey, sampleKey);

    assert.ok(eventDispatched, 'Should dispatch stockflow:gemini-key-updated');
    assert.equal(eventDispatched.name, 'stockflow:gemini-key-updated');
    assert.equal(eventDispatched.detail.hasKey, true);
  });

  it('should trim surrounding whitespace when saving and retrieving key', () => {
    const untrimmed = '   AIzaSyA_untrimmed_key_test   ';
    saveGeminiApiKey(untrimmed);

    assert.equal(getGeminiApiKey(), 'AIzaSyA_untrimmed_key_test');
    assert.equal(getGeminiApiKeyDetails().localKey, 'AIzaSyA_untrimmed_key_test');
  });

  it('should remove key when saving empty string or whitespace', () => {
    saveGeminiApiKey('AIzaSyA_temp_key');
    assert.equal(getGeminiApiKey(), 'AIzaSyA_temp_key');

    saveGeminiApiKey('   ');
    assert.equal(getGeminiApiKey(), '');
    assert.equal(getGeminiApiKeyDetails().hasKey, false);
    assert.equal(getGeminiApiKeyDetails().localKey, '');
    assert.equal(eventDispatched.detail.hasKey, false);
  });

  it('should remove key when passing null or undefined', () => {
    saveGeminiApiKey('AIzaSyA_temp_key');
    assert.equal(getGeminiApiKey(), 'AIzaSyA_temp_key');

    saveGeminiApiKey(null);
    assert.equal(getGeminiApiKey(), '');
    assert.equal(getGeminiApiKeyDetails().hasKey, false);
  });
});
