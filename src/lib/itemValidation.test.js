import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholderItemValue, validateItemEditPayload } from './itemValidation.js';

describe('itemValidation', () => {
  describe('isPlaceholderItemValue', () => {
    it('rejects null, undefined, empty, and whitespace-only values', () => {
      assert.equal(isPlaceholderItemValue(null), true);
      assert.equal(isPlaceholderItemValue(undefined), true);
      assert.equal(isPlaceholderItemValue(''), true);
      assert.equal(isPlaceholderItemValue('   \t\n  '), true);
    });

    it('rejects dash and punctuation-only placeholders', () => {
      for (const bad of ['-', '--', '---', ' - ', '—', '–', '_', '.', '...', '/', '?']) {
        assert.equal(isPlaceholderItemValue(bad), true, `Expected "${bad}" to be rejected`);
      }
    });

    it('accepts valid Thai and English item names and units', () => {
      for (const good of [
        'CellFlex_cable_1/2"_(AGW)',
        'สายอากาศ SC-488-HF1LDF(D00)',
        'ชิ้น',
        'เมตร',
        'ชุด',
        'A',
        '1/2"'
      ]) {
        assert.equal(isPlaceholderItemValue(good), false, `Expected "${good}" to be accepted`);
      }
    });
  });

  describe('validateItemEditPayload', () => {
    it('blocks dash-overwritten item name and unit', () => {
      const res = validateItemEditPayload({ name: '-', unit: '-' });
      assert.equal(res.valid, false);
      assert.equal(res.errors.name, 'invalidName');
      assert.equal(res.errors.unit, 'invalidUnit');
    });

    it('blocks whitespace-only name while keeping valid unit', () => {
      const res = validateItemEditPayload({ name: '   ', unit: 'เมตร' });
      assert.equal(res.valid, false);
      assert.equal(res.errors.name, 'invalidName');
      assert.equal(res.errors.unit, undefined);
    });

    it('trims valid name and unit', () => {
      const res = validateItemEditPayload({
        name: '  Microwave ODU, RTN XMC  ',
        unit: '  ชิ้น  '
      });
      assert.equal(res.valid, true);
      assert.deepEqual(res.errors, {});
      assert.deepEqual(res.normalized, {
        name: 'Microwave ODU, RTN XMC',
        unit: 'ชิ้น'
      });
    });
  });
});
