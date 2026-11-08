import fs from 'fs';
import path from 'path';
import en from '../src/i18n/locales/en.js';

function flattenKeys(obj, prefix = '') {
  let keys = new Set();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? prefix + '.' + key : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const k of flattenKeys(value, fullKey)) keys.add(k);
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

const allKeys = flattenKeys(en);

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('dist')) {
        results = results.concat(getFiles(file));
      }
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      if (!file.includes('locales')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = getFiles('src');

// Regex for t('key') or t('key', ...)
// Match group 1: key, group 2: rest of args
const tRegex = /\bt\(\s*['"]([^'"`$\r\n]+)['"]\s*(,\s*([^)\r\n]+))?\)/g;

const missingNoFallback = new Map();
const missingWithFallback = new Map();

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = tRegex.exec(content)) !== null) {
    const key = match[1].trim();
    const fallbackArg = match[3] ? match[3].trim() : null;
    
    // skip dynamic or whitespace or templates
    if (!key || key.includes('${') || key.includes('CONDITION_LABEL_KEYS')) continue;
    
    if (!allKeys.has(key)) {
      // Check if fallback is a string literal
      const isStringFallback = fallbackArg && (fallbackArg.startsWith("'") || fallbackArg.startsWith('"') || fallbackArg.startsWith('`'));
      if (isStringFallback) {
        if (!missingWithFallback.has(key)) missingWithFallback.set(key, { fallback: fallbackArg, files: new Set() });
        missingWithFallback.get(key).files.add(file);
      } else {
        if (!missingNoFallback.has(key)) missingNoFallback.set(key, { files: new Set() });
        missingNoFallback.get(key).files.add(file);
      }
    }
  }
});

console.log('=== CRITICAL: MISSING KEYS WITHOUT FALLBACK (renders raw key in UI) ===');
console.log(`Total: ${missingNoFallback.size}`);
for (const [key, data] of missingNoFallback.entries()) {
  console.log(`- "${key}" in ${Array.from(data.files).join(', ')}`);
}

console.log('\n=== MISSING KEYS WITH INLINE FALLBACK ===');
console.log(`Total: ${missingWithFallback.size}`);
for (const [key, data] of missingWithFallback.entries()) {
  console.log(`- "${key}" (fallback: ${data.fallback}) in ${Array.from(data.files).join(', ')}`);
}
