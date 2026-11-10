import fs from 'fs';

// 1. Resolve package.json
let pkg = fs.readFileSync('package.json', 'utf8');
pkg = pkg.replace(/<{7} HEAD[\s\S]*?={7}[\s\S]*?>{7} origin\/main\r?\n/, '  "version": "1.29.0",\n');
fs.writeFileSync('package.json', pkg, 'utf8');
console.log('package.json resolved');

// 2. Resolve CHANGELOG.md
let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const conflictRegex = /<{7} HEAD\r?\n([\s\S]*?)={7}\r?\n([\s\S]*?)>{7} origin\/main\r?\n/;
const match = changelog.match(conflictRegex);
if (match) {
  const headSection = match[1].trim();
  const originSection = match[2].trim();
  // Combined order: v1.29.0 on top, then v1.28.4 mobile ux, then v1.28.4 duplicate migration
  const mergedSection = `${headSection}\n\n${originSection}\n\n`;
  changelog = changelog.replace(conflictRegex, mergedSection);
  fs.writeFileSync('CHANGELOG.md', changelog, 'utf8');
  console.log('CHANGELOG.md resolved');
} else {
  console.error('CHANGELOG.md conflict pattern not found');
}
