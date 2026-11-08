import fs from 'fs';

let lines = fs.readFileSync('src/i18n/locales/en.js', 'utf8').split('\n');
// Find where reports.siteKits starts
let siteKitsReportsIndex = -1;
let inReports = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('"reports": {')) inReports = true;
  if (inReports && lines[i].includes('"siteKits": {')) {
    siteKitsReportsIndex = i;
    break;
  }
}

if (siteKitsReportsIndex !== -1) {
  lines.splice(siteKitsReportsIndex + 1, 0, '      "warehouseFilter": "Warehouse",');
  fs.writeFileSync('src/i18n/locales/en.js', lines.join('\n'), 'utf8');
  console.log('Inserted warehouseFilter into en.js at line', siteKitsReportsIndex + 2);
} else {
  console.log('Could not find reports.siteKits in en.js');
}
