import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMAIL_REGEX,
  isValidEmail,
  parseEmailList,
  mergeNotificationSettings,
} from './emailSettings.js';

test('accepts real recipient addresses, including ones containing the letter "s"', () => {
  const addresses = [
    'sakdipath.s@forth.co.th',
    'sureerat.r@forth.co.th',
    'test-1st@stockflowth.com',
    'dopa-only-tm@forth.co.th',
    'staff@stockflowth.online',
    'user.name+tag@sub.domain.co.th',
  ];

  addresses.forEach((address) => {
    assert.equal(EMAIL_REGEX.test(address), true, `${address} must be accepted`);
    assert.equal(isValidEmail(address), true, `${address} must be accepted by isValidEmail`);
  });
});

test('rejects malformed addresses', () => {
  const invalid = ['', '   ', 'plainaddress', 'a@b', 'a b@c.com', '@x.com', 'a@.com', null, undefined];

  invalid.forEach((address) => {
    assert.equal(isValidEmail(address), false, `${String(address)} must be rejected`);
  });
});

test('regression: the old regex silently dropped addresses whose local part contains "s"', () => {
  // The dispatcher used /^[^s@]+@[^s@]+.[^s@]+$/ — the missing backslash turned
  // the class into "not the letter s", so any mailbox whose local part (and the
  // last free-text segment of the domain) contained an "s" was filtered out of
  // To/Cc before sending. Measured against the legacy pattern:
  const legacyRegex = /^[^s@]+@[^s@]+.[^s@]+$/;

  // local part contains "s" -> rejected
  assert.equal(legacyRegex.test('staff@stockflowth.online'), false);
  assert.equal(legacyRegex.test('user@stockflowth.online'), false);
  assert.equal(legacyRegex.test('sakdipath.s@forth.co.th'), false);
  assert.equal(legacyRegex.test('sureerat.r@forth.co.th'), false);
  assert.equal(legacyRegex.test('somsaard@forth.co.th'), false);

  // "s" only in the domain / public suffix -> still accepted by the old pattern,
  // which is why the organisation's alias mailbox kept working
  assert.equal(legacyRegex.test('dopa-only-tm@forth.co.th'), true);

  // the corrected pattern accepts every one of them
  [
    'staff@stockflowth.online',
    'user@stockflowth.online',
    'sakdipath.s@forth.co.th',
    'sureerat.r@forth.co.th',
    'somsaard@forth.co.th',
    'dopa-only-tm@forth.co.th',
  ].forEach((address) => {
    assert.equal(isValidEmail(address), true, `${address} must be accepted`);
  });
});

test('parseEmailList trims, deduplicates case-insensitively and drops invalid entries', () => {
  const parsed = parseEmailList(' a@x.com , B@X.com ,b@x.com, broken, , c@y.com ');

  assert.deepEqual(parsed, ['a@x.com', 'B@X.com', 'c@y.com']);
});

test('parseEmailList supports array input and exclusion of existing To recipients', () => {
  assert.deepEqual(parseEmailList(['a@x.com', 'b@x.com']), ['a@x.com', 'b@x.com']);

  const cc = parseEmailList('admin@x.com, owner@x.com', { exclude: ['OWNER@x.com'] });
  assert.deepEqual(cc, ['admin@x.com']);

  assert.deepEqual(parseEmailList(null), []);
  assert.deepEqual(parseEmailList(undefined), []);
  assert.deepEqual(parseEmailList(''), []);
});

test('mergeNotificationSettings reads JSONB rows into events and branding', () => {
  const rows = [
    { key: 'notification_events', value: { withdrawal_submitted: { enabled: true, roles: ['ADMIN'] } } },
    { key: 'branding', value: { app_name: 'StockFlow', public_base_url: 'https://stockflowth.online' } },
  ];

  assert.deepEqual(mergeNotificationSettings(rows), {
    notificationEvents: { withdrawal_submitted: { enabled: true, roles: ['ADMIN'] } },
    branding: { app_name: 'StockFlow', public_base_url: 'https://stockflowth.online' },
  });
});

test('mergeNotificationSettings also accepts a plain object payload and JSON strings', () => {
  const fromObject = mergeNotificationSettings({
    notification_events: { low_stock_alert: { enabled: true, roles: ['ADMIN'] } },
    branding: { app_name: 'QA' },
  });
  assert.deepEqual(fromObject.notificationEvents.low_stock_alert.roles, ['ADMIN']);
  assert.equal(fromObject.branding.app_name, 'QA');

  const fromStrings = mergeNotificationSettings([
    { key: 'notification_events', value: '{"checkout_overdue":{"enabled":true,"roles":["ADMIN"]}}' },
    { key: 'branding', value: '"not-an-object"' },
  ]);
  assert.equal(fromStrings.notificationEvents.checkout_overdue.enabled, true);
  assert.deepEqual(fromStrings.branding, {});
});

test('mergeNotificationSettings degrades safely on empty or malformed input', () => {
  [[], null, undefined, 'nonsense'].forEach((input) => {
    assert.deepEqual(mergeNotificationSettings(input), { notificationEvents: {}, branding: {} });
  });

  assert.deepEqual(
    mergeNotificationSettings([{ key: 'notification_events', value: '{not json' }, { key: 'branding', value: '' }]),
    { notificationEvents: {}, branding: {} }
  );
});
