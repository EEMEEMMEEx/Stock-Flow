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

test('resolveDefectiveSerial - prioritizes returned_serial_number over replaced and original serials', () => {
  const logWithAll = {
    item_condition: 'damaged',
    returned_serial_number: 'RETURNED-SN-888',
    replaced_serial_number: 'REPLACED-SN-555',
    checkout_items: { serial_number: 'ORIGINAL-SN-111' }
  };
  assert.equal(resolveDefectiveSerial(logWithAll), 'RETURNED-SN-888');
  assert.equal(formatDefectiveSerial(logWithAll), 'RETURNED-SN-888');

  const logWithReturnedAndOriginal = {
    item_condition: 'needs_repair',
    returned_serial_number: 'RETURNED-SN-999',
    replaced_serial_number: null,
    checkout_items: { serial_number: 'ORIGINAL-SN-001' }
  };
  assert.equal(resolveDefectiveSerial(logWithReturnedAndOriginal), 'RETURNED-SN-999');

  const logNormalWithReturned = {
    item_condition: 'normal',
    returned_serial_number: 'RETURNED-NORMAL-SN',
    checkout_items: { serial_number: null }
  };
  assert.equal(resolveDefectiveSerial(logNormalWithReturned), 'RETURNED-NORMAL-SN');

  const logConsumedWithReturned = {
    item_condition: 'consumed',
    returned_serial_number: 'RETURNED-CONSUMED-DEFECTIVE',
    replaced_serial_number: 'REPLACED-OLD',
    checkout_items: { serial_number: 'NEW-UNIT' }
  };
  assert.equal(resolveDefectiveSerial(logConsumedWithReturned), 'RETURNED-CONSUMED-DEFECTIVE');
});

test('resolveDefectiveSerial - handles whitespace-only serials and trims properly', () => {
  const logWhitespaceReturned = {
    item_condition: 'damaged',
    returned_serial_number: '   ',
    replaced_serial_number: 'REPLACED-SN',
    checkout_items: { serial_number: 'ORIGINAL-SN' }
  };
  // Whitespace-only returned_serial_number falls back to replaced_serial_number
  assert.equal(resolveDefectiveSerial(logWhitespaceReturned), 'REPLACED-SN');

  const logWithSpaces = {
    item_condition: 'needs_repair',
    returned_serial_number: '   TRIM-ME-SN   ',
    checkout_items: { serial_number: 'ORIGINAL-SN' }
  };
  assert.equal(resolveDefectiveSerial(logWithSpaces), 'TRIM-ME-SN');
  assert.equal(formatDefectiveSerial(logWhitespaceReturned, 'CUSTOM_FALLBACK'), 'REPLACED-SN');

  const logEmptyAll = {
    item_condition: 'normal',
    returned_serial_number: '   ',
    checkout_items: { serial_number: '   ' }
  };
  assert.equal(resolveDefectiveSerial(logEmptyAll), '');
  assert.equal(formatDefectiveSerial(logEmptyAll, 'CUSTOM_FALLBACK'), 'CUSTOM_FALLBACK');
});

