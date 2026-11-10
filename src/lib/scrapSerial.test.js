import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDefectiveSerial, formatDefectiveSerial } from './scrapSerial.js';

test('resolveDefectiveSerial - returns empty string on null/undefined log', () => {
  assert.equal(resolveDefectiveSerial(null), '');
  assert.equal(resolveDefectiveSerial(undefined), '');
  assert.equal(formatDefectiveSerial(null), '-');
});

test('resolveDefectiveSerial - for consumed condition, uses replaced_serial_number only', () => {
  const logWithBoth = {
    item_condition: 'consumed',
    replaced_serial_number: 'DEFECTIVE-OLD-SN-001',
    checkout_items: { serial_number: 'NEW-INSTALLED-SN-999' }
  };
  assert.equal(resolveDefectiveSerial(logWithBoth), 'DEFECTIVE-OLD-SN-001');

  const logWithOnlyNew = {
    item_condition: 'consumed',
    replaced_serial_number: '',
    checkout_items: { serial_number: 'NEW-INSTALLED-SN-999' }
  };
  // Must NOT fall back to new unit's serial!
  assert.equal(resolveDefectiveSerial(logWithOnlyNew), '');
  assert.equal(formatDefectiveSerial(logWithOnlyNew), '-');
});

test('resolveDefectiveSerial - for damaged/needs_repair condition, falls back to checkout_items.serial_number', () => {
  const logWithReplaced = {
    item_condition: 'damaged',
    replaced_serial_number: 'OVERRIDDEN-SN-123',
    checkout_items: { serial_number: 'ORIGINAL-SN-001' }
  };
  assert.equal(resolveDefectiveSerial(logWithReplaced), 'OVERRIDDEN-SN-123');

  const logWithOnlyOriginal = {
    item_condition: 'needs_repair',
    replaced_serial_number: null,
    checkout_items: { serial_number: 'ORIGINAL-SN-001' }
  };
  assert.equal(resolveDefectiveSerial(logWithOnlyOriginal), 'ORIGINAL-SN-001');
  assert.equal(formatDefectiveSerial(logWithOnlyOriginal), 'ORIGINAL-SN-001');
});
