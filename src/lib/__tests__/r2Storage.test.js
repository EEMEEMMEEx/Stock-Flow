import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveStorageUrl,
  extractStorageKey,
  extractFileName,
  getFallbackStorageUrl,
  handleStorageImageError,
  R2_PUBLIC_URL,
  SUPABASE_STORAGE_PUBLIC_URL
} from '../r2Storage.js';

describe('r2Storage helpers', () => {
  describe('resolveStorageUrl', () => {
    it('returns empty string for null, undefined, or empty values', () => {
      assert.equal(resolveStorageUrl(null), '');
      assert.equal(resolveStorageUrl(undefined), '');
      assert.equal(resolveStorageUrl(''), '');
      assert.equal(resolveStorageUrl('   '), '');
    });

    it('returns absolute URLs as-is', () => {
      assert.equal(resolveStorageUrl('https://example.com/photo.jpg'), 'https://example.com/photo.jpg');
      assert.equal(resolveStorageUrl('http://cdn.org/a/b.png'), 'http://cdn.org/a/b.png');
      assert.equal(resolveStorageUrl('data:image/png;base64,abc'), 'data:image/png;base64,abc');
      assert.equal(resolveStorageUrl('blob:https://app.com/uuid'), 'blob:https://app.com/uuid');
    });

    it('resolves relative object key using R2_PUBLIC_URL', () => {
      const key = 'attachments/return_CHK-202611-0007.jpg';
      const expected = `${R2_PUBLIC_URL}/${key}`;
      assert.equal(resolveStorageUrl(key), expected);
      // Handles leading slashes gracefully
      assert.equal(resolveStorageUrl('/' + key), expected);
    });
  });

  describe('getFallbackStorageUrl', () => {
    it('returns empty string for null or empty values', () => {
      assert.equal(getFallbackStorageUrl(null), '');
      assert.equal(getFallbackStorageUrl(''), '');
    });

    it('resolves relative object key using SUPABASE_STORAGE_PUBLIC_URL', () => {
      const key = 'attachments/return_CHK-202611-0007.jpg';
      assert.equal(getFallbackStorageUrl(key), `${SUPABASE_STORAGE_PUBLIC_URL}/${key}`);
    });

    it('returns existing Supabase Storage URL as-is', () => {
      const url = `${SUPABASE_STORAGE_PUBLIC_URL}/attachments/proof.jpg`;
      assert.equal(getFallbackStorageUrl(url), url);
    });

    it('extracts key from R2 URL and converts to Supabase fallback URL', () => {
      const r2Url = `${R2_PUBLIC_URL}/items/drill.png`;
      assert.equal(getFallbackStorageUrl(r2Url), `${SUPABASE_STORAGE_PUBLIC_URL}/items/drill.png`);
    });
  });

  describe('handleStorageImageError', () => {
    it('switches currentTarget.src to fallback URL on error', () => {
      const mockEvent = {
        currentTarget: {
          src: `${R2_PUBLIC_URL}/attachments/missing.jpg`
        }
      };
      handleStorageImageError(mockEvent, 'attachments/missing.jpg');
      assert.equal(mockEvent.currentTarget.src, `${SUPABASE_STORAGE_PUBLIC_URL}/attachments/missing.jpg`);
    });

    it('does not re-assign if already matching fallback', () => {
      const fallback = `${SUPABASE_STORAGE_PUBLIC_URL}/attachments/missing.jpg`;
      const mockEvent = {
        currentTarget: {
          src: fallback
        }
      };
      handleStorageImageError(mockEvent, 'attachments/missing.jpg');
      assert.equal(mockEvent.currentTarget.src, fallback);
    });

    it('handles null event gracefully without throwing', () => {
      assert.doesNotThrow(() => handleStorageImageError(null, 'attachments/missing.jpg'));
    });
  });

  describe('extractStorageKey', () => {
    it('returns empty string for null or empty values', () => {
      assert.equal(extractStorageKey(null), '');
      assert.equal(extractStorageKey(''), '');
    });

    it('extracts object key from Supabase Storage public URLs', () => {
      const supaUrl = 'https://vrnutseacyejnzwcfamv.supabase.co/storage/v1/object/public/stockflow-assets/attachments/5d7384d2-return_CHK-1.jpg?t=17941049';
      assert.equal(extractStorageKey(supaUrl), 'attachments/5d7384d2-return_CHK-1.jpg');
    });

    it('extracts object key from Cloudflare R2 public URLs', () => {
      const r2Url = 'https://pub-275b37eccbba4e63941708ae5dfa46a7.r2.dev/items/item-SKU-100.png?t=12345';
      assert.equal(extractStorageKey(r2Url), 'items/item-SKU-100.png');
    });

    it('returns clean object key when already relative', () => {
      assert.equal(extractStorageKey('attachments/photo.jpg?t=999'), 'attachments/photo.jpg');
      assert.equal(extractStorageKey('/items/tool.png'), 'items/tool.png');
    });
  });

  describe('extractFileName', () => {
    it('returns empty string for empty input', () => {
      assert.equal(extractFileName(''), '');
    });

    it('extracts clean file name from return order photo path', () => {
      const path = 'attachments/2189a89f-de69-4fc4-bba5-6d7c14e1380f-return_CHK-202611-0007_aa6dbebe_1794354353052.jpg';
      const name = extractFileName(path);
      assert.ok(name.includes('return_CHK-202611-0007'), `Expected filename to contain return_CHK-202611-0007, got ${name}`);
      assert.ok(name.endsWith('.jpg'));
    });

    it('strips UUID prefix from generic uploaded file', () => {
      const path = 'documents/5d7384d2-e361-4305-8e5e-e33f1413dae2-staff_signature.png';
      assert.equal(extractFileName(path), 'staff_signature.png');
    });
  });
});
