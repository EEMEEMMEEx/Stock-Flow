import en from '../src/i18n/locales/en.js';
import th from '../src/i18n/locales/th.js';

function flattenKeys(obj, prefix = '') {
  let keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(flattenKeys(value, fullKey));
    } else {
      keys.push({ key: fullKey, value });
    }
  }
  return keys;
}

const enFlat = flattenKeys(en);
const thFlat = flattenKeys(th);

const enKeyMap = new Map(enFlat.map(item => [item.key, item.value]));
const thKeyMap = new Map(thFlat.map(item => [item.key, item.value]));

const missingInTh = [];
const emptyInTh = [];
const orphanInTh = [];

// 1. Check missing in th.js
for (const [key, enVal] of enKeyMap.entries()) {
  if (!thKeyMap.has(key)) {
    missingInTh.push(key);
  } else {
    const thVal = thKeyMap.get(key);
    if (thVal === '' || thVal === null || thVal === undefined) {
      emptyInTh.push(key);
    }
  }
}

// 2. Check orphan in th.js
for (const key of thKeyMap.keys()) {
  if (!enKeyMap.has(key)) {
    orphanInTh.push(key);
  }
}

console.log('====================================================');
console.log('         i18n Key Parity & Health Verification       ');
console.log('====================================================');
console.log(`Total Keys in SSOT (en.js): ${enKeyMap.size}`);
console.log(`Total Keys in Target (th.js): ${thKeyMap.size}`);
console.log('----------------------------------------------------');

let hasError = false;

if (missingInTh.length > 0) {
  hasError = true;
  console.error(`[ERROR] Missing in th.js (${missingInTh.length} keys):`);
  missingInTh.slice(0, 30).forEach(k => console.error(`  - ${k}`));
  if (missingInTh.length > 30) {
    console.error(`  ... and ${missingInTh.length - 30} more.`);
  }
}

if (emptyInTh.length > 0) {
  hasError = true;
  console.error(`[ERROR] Empty translations in th.js (${emptyInTh.length} keys):`);
  emptyInTh.slice(0, 20).forEach(k => console.error(`  - ${k}`));
}

if (orphanInTh.length > 0) {
  console.warn(`[WARNING] Orphan keys in th.js not in SSOT (${orphanInTh.length} keys):`);
  orphanInTh.slice(0, 20).forEach(k => console.warn(`  - ${k}`));
}

if (!hasError && orphanInTh.length === 0) {
  console.log('[PASS] 100% Key Parity achieved between en.js and th.js! No missing or orphan keys.');
  process.exit(0);
} else if (!hasError) {
  console.log(`[PASS WITH WARNINGS] No missing translations, but ${orphanInTh.length} orphan keys exist.`);
  process.exit(0);
} else {
  console.error('\n[FAIL] Key parity check failed. Please resolve missing keys in th.js.');
  process.exit(1);
}
