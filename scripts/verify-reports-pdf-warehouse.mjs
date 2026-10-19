import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('Running verify:reports-pdf-warehouse verification...');

const root = process.cwd();
const pdfTemplatesPath = path.join(root, 'src', 'lib', 'pdf-templates.jsx');
const reportsPath = path.join(root, 'src', 'pages', 'Reports.jsx');

const pdfTemplatesSource = fs.readFileSync(pdfTemplatesPath, 'utf8');
const reportsSource = fs.readFileSync(reportsPath, 'utf8');

// 1. Verify StockReportPDF function signature contains warehouseName prop
assert(
  pdfTemplatesSource.includes('warehouseName = \'\''),
  'FAIL: StockReportPDF signature must include warehouseName parameter'
);
console.log('✓ PASS: StockReportPDF signature accepts warehouseName prop');

// 2. Verify StockReportPDF title banner renders warehouseName chip
assert(
  pdfTemplatesSource.includes('{warehouseName ? (') &&
  pdfTemplatesSource.includes('คลังพัสดุ: {warehouseName}'),
  'FAIL: StockReportPDF must render warehouseName in filterChip'
);
console.log('✓ PASS: StockReportPDF renders "คลังพัสดุ: {warehouseName}" chip in title banner');

// 3. Verify filterInfoContainer has flexWrap to prevent overflow
assert(
  pdfTemplatesSource.includes('filterInfoContainer: {') &&
  pdfTemplatesSource.includes('flexWrap: \'wrap\''),
  'FAIL: reportStyles.filterInfoContainer must have flexWrap: "wrap"'
);
console.log('✓ PASS: reportStyles.filterInfoContainer supports flexWrap for responsive chips');

// 4. Verify Reports.jsx resolves selected project location and main storage fallback
assert(
  reportsSource.includes('const warehouseName = selectedProj?.location || (selectedProj ? t(\'reports.filters.mainStorage\') : \'\');'),
  'FAIL: Reports.jsx must resolve warehouseName from selectedProj.location with mainStorage fallback'
);
console.log('✓ PASS: Reports.jsx resolves warehouseName with fallback to mainStorage');

// 5. Verify Reports.jsx passes warehouseName to StockReportPDF
assert(
  reportsSource.includes('warehouseName={warehouseName}'),
  'FAIL: Reports.jsx must pass warehouseName prop to StockReportPDF'
);
console.log('✓ PASS: Reports.jsx wires warehouseName into StockReportPDF');

// 6. Verify Reports.jsx passes projectName, categoryName, and date filters to StockReportPDF
assert(
  reportsSource.includes('projectName={projectName}') &&
  reportsSource.includes('categoryName={categoryName}') &&
  reportsSource.includes('startDate={filters.start_date}') &&
  reportsSource.includes('endDate={filters.end_date}'),
  'FAIL: Reports.jsx must wire projectName, categoryName, and date filters into StockReportPDF'
);
console.log('✓ PASS: Reports.jsx wires projectName, categoryName, and dates into StockReportPDF');

console.log('\n======================================================');
console.log(' All verify:reports-pdf-warehouse assertions PASSED! ');
console.log('======================================================');
