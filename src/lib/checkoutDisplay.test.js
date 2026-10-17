import test from 'node:test';
import assert from 'node:assert/strict';

import { formatProjectLocation, resolveCheckoutMeta } from './checkoutDisplay.js';

test('formatProjectLocation returns null when both name and code are missing', () => {
  assert.equal(formatProjectLocation(null), null);
  assert.equal(formatProjectLocation({}), null);
  assert.equal(formatProjectLocation({ name: '   ', project_code: '' }), null);
});

test('formatProjectLocation prefers the code prefix and falls back to one value', () => {
  assert.equal(formatProjectLocation({ name: 'DOPA', project_code: '20317' }), '[20317] DOPA');
  assert.equal(formatProjectLocation({ name: 'DOPA' }), 'DOPA');
  assert.equal(formatProjectLocation({ project_code: '20317' }), '20317');
});

test('resolveCheckoutMeta hides empty department/location instead of rendering placeholders', () => {
  assert.deepEqual(resolveCheckoutMeta({}), { department: null, location: null, hasAny: false });
  assert.deepEqual(
    resolveCheckoutMeta({ borrower_department: '  ', projects: null }),
    { department: null, location: null, hasAny: false }
  );
  assert.deepEqual(
    resolveCheckoutMeta({ borrower_department: 'DOI', projects: { name: 'DOPA', project_code: '20317' } }),
    { department: 'DOI', location: '[20317] DOPA', hasAny: true }
  );
});

test('resolveCheckoutMeta tolerates a department-only or location-only record', () => {
  assert.deepEqual(
    resolveCheckoutMeta({ borrower_department: 'DOI', projects: null }),
    { department: 'DOI', location: null, hasAny: true }
  );
  assert.deepEqual(
    resolveCheckoutMeta({ borrower_department: null, projects: { name: 'DOPA' } }),
    { department: null, location: 'DOPA', hasAny: true }
  );
});
