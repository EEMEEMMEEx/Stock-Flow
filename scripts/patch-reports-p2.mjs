import fs from 'fs';

// 1. Update src/pages/Reports.jsx
let reportsCode = fs.readFileSync('src/pages/Reports.jsx', 'utf8');

// Update activeTab comment
reportsCode = reportsCode.replace(
  "const [activeTab, setActiveTab] = useState('stock_in'); // 'stock_in', 'withdrawals', 'balance'",
  "const [activeTab, setActiveTab] = useState('stock_in'); // 'stock_in', 'withdrawals', 'balance', 'site_kits'"
);

// Add excelLoading state if not present
if (!reportsCode.includes('excelLoading')) {
  reportsCode = reportsCode.replace(
    "const [pdfLoading, setPdfLoading] = useState(false);",
    "const [pdfLoading, setPdfLoading] = useState(false);\r\n  const [excelLoading, setExcelLoading] = useState(false);"
  );

  reportsCode = reportsCode.replace(
    "const handleExportExcel = async () => {\r\n    if (!canExport) {\r\n      toast.error(t('reports.export.permissionDeniedExcel'));\r\n      return;\r\n    }\r\n    try {",
    "const handleExportExcel = async () => {\r\n    if (!canExport) {\r\n      toast.error(t('reports.export.permissionDeniedExcel'));\r\n      return;\r\n    }\r\n    setExcelLoading(true);\r\n    try {"
  );

  reportsCode = reportsCode.replace(
    "} catch (err) {\r\n      console.error('Error exporting Excel:', err);\r\n      toast.error(t('reports.export.exportFailed'));\r\n    }\r\n  };",
    "} catch (err) {\r\n      console.error('Error exporting Excel:', err);\r\n      toast.error(t('reports.export.exportFailed'));\r\n    } finally {\r\n      setExcelLoading(false);\r\n    }\r\n  };"
  );

  reportsCode = reportsCode.replace(
    "pdfLoading={pdfLoading}",
    "pdfLoading={pdfLoading}\r\n        excelLoading={excelLoading}"
  );
}

fs.writeFileSync('src/pages/Reports.jsx', reportsCode, 'utf8');
console.log('[PASS] Reports.jsx updated');

// 2. Update src/components/reports/ReportHeader.jsx
let headerCode = fs.readFileSync('src/components/reports/ReportHeader.jsx', 'utf8');

// Accept excelLoading prop
if (!headerCode.includes('excelLoading = false')) {
  headerCode = headerCode.replace(
    "pdfLoading = false,",
    "pdfLoading = false,\r\n  excelLoading = false,"
  );
}

// Update export Excel button disabled & loading text
headerCode = headerCode.replace(
  "onClick={onExportExcel}\r\n                disabled={loading}",
  "onClick={onExportExcel}\r\n                disabled={loading || excelLoading}"
);

headerCode = headerCode.replace(
  "<span>{t('reports.exportExcel')}</span>",
  "<span>{excelLoading ? t('reports.export.generatingExcel', 'Exporting...') : t('reports.exportExcel')}</span>"
);

// Remove scrollbar-none no-op class
headerCode = headerCode.replace(" scrollbar-none", "");

fs.writeFileSync('src/components/reports/ReportHeader.jsx', headerCode, 'utf8');
console.log('[PASS] ReportHeader.jsx updated');

// 3. Update src/components/reports/ReportFilterBar.jsx
let filterBarCode = fs.readFileSync('src/components/reports/ReportFilterBar.jsx', 'utf8');

// Use t('common.project') instead of hardcoded 'Project: '
filterBarCode = filterBarCode.replace(
  "label={`Project: ${group.project_code ? `[${group.project_code}] ` : ''}${group.name}`}",
  "label={`${t('common.project')}: ${group.project_code ? `[${group.project_code}] ` : ''}${group.name}`}"
);

fs.writeFileSync('src/components/reports/ReportFilterBar.jsx', filterBarCode, 'utf8');
console.log('[PASS] ReportFilterBar.jsx updated');

// 4. Update src/components/reports/ReportDataTable.jsx
let dataTableCode = fs.readFileSync('src/components/reports/ReportDataTable.jsx', 'utf8');

// Replace table row key={i}
dataTableCode = dataTableCode.replace(
  "<TableRow key={i} className=\"hover:bg-muted/40 transition-colors\">",
  "<TableRow key={row.id || `${row.project_id || ''}-${row.item_id || ''}-${row.sku || ''}-${i}`} className=\"hover:bg-muted/40 transition-colors\">"
);

// Add getAriaSort helper function
if (!dataTableCode.includes('const getAriaSort')) {
  dataTableCode = dataTableCode.replace(
    "const renderSortIcon = (key) => {",
    "const getAriaSort = (key) => {\r\n    if (sortConfig.key !== key) return 'none';\r\n    return sortConfig.direction === 'asc' ? 'ascending' : 'descending';\r\n  };\r\n\r\n  const renderSortIcon = (key) => {"
  );
}

// Add aria-sort to table heads
dataTableCode = dataTableCode.replace(
  '<TableHead className="w-[120px]">',
  '<TableHead className="w-[120px]" aria-sort={getAriaSort(\'received_date\')}>'
);
dataTableCode = dataTableCode.replace(
  '<TableHead>\r\n                  <button\r\n                    onClick={() => onSort(\'projects.name\')}',
  '<TableHead aria-sort={getAriaSort(\'projects.name\')}>\r\n                  <button\r\n                    onClick={() => onSort(\'projects.name\')}'
);
dataTableCode = dataTableCode.replace(
  '<TableHead>\r\n                  <button\r\n                    onClick={() => onSort(\'items.name\')}',
  '<TableHead aria-sort={getAriaSort(\'items.name\')}>\r\n                  <button\r\n                    onClick={() => onSort(\'items.name\')}'
);
dataTableCode = dataTableCode.replace(
  '<TableHead className="text-right w-[140px]">',
  '<TableHead className="text-right w-[140px]" aria-sort={getAriaSort(\'quantity\')}>'
);
dataTableCode = dataTableCode.replace(
  '<TableHead className="w-[120px]">\r\n                  <button\r\n                    onClick={() => onSort(\'requested_at\')}',
  '<TableHead className="w-[120px]" aria-sort={getAriaSort(\'requested_at\')}>\r\n                  <button\r\n                    onClick={() => onSort(\'requested_at\')}'
);
dataTableCode = dataTableCode.replace(
  '<TableHead className="text-right">\r\n                  <button\r\n                    onClick={() => onSort(\'total_in\')}',
  '<TableHead className="text-right" aria-sort={getAriaSort(\'total_in\')}>\r\n                  <button\r\n                    onClick={() => onSort(\'total_in\')}'
);
dataTableCode = dataTableCode.replace(
  '<TableHead className="text-right">\r\n                  <button\r\n                    onClick={() => onSort(\'total_out\')}',
  '<TableHead className="text-right" aria-sort={getAriaSort(\'total_out\')}>\r\n                  <button\r\n                    onClick={() => onSort(\'total_out\')}'
);
dataTableCode = dataTableCode.replace(
  '<TableHead className="text-right font-bold text-xs text-foreground">\r\n                  <button\r\n                    onClick={() => onSort(\'balance\')}',
  '<TableHead className="text-right font-bold text-xs text-foreground" aria-sort={getAriaSort(\'balance\')}>\r\n                  <button\r\n                    onClick={() => onSort(\'balance\')}'
);

fs.writeFileSync('src/components/reports/ReportDataTable.jsx', dataTableCode, 'utf8');
console.log('[PASS] ReportDataTable.jsx updated');

// 5. Update src/components/reports/ReportSiteKits.jsx
let siteKitsCode = fs.readFileSync('src/components/reports/ReportSiteKits.jsx', 'utf8');

// Replace table row key={idx}
siteKitsCode = siteKitsCode.replace(
  "<tr \r\n                      key={idx}",
  "<tr \r\n                      key={`${item.category_id || ''}-${item.part_number || ''}-${item.bom_name || ''}-${idx}`}"
);

fs.writeFileSync('src/components/reports/ReportSiteKits.jsx', siteKitsCode, 'utf8');
console.log('[PASS] ReportSiteKits.jsx updated');

// 6. Update CHANGELOG.md
let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const entry = `## [2026-10-20 10:50] - v1.25.20
### Fixed & Enhanced (Reports Audit — Phase 2: P2 & P3)
- **Accessibility & ARIA (P2)**: ติดตั้ง WAI-ARIA Tab Semantics (\`role="tablist"\`, \`role="tab"\`, \`aria-selected\`, \`aria-controls\`, \`id\`, \`tabIndex\`) พร้อม Roving Tabindex Keyboard Navigation บน Arrow Keys (Left/Right/Home/End) ใน \`ReportHeader.jsx\` และ \`role="tabpanel"\` ใน \`Reports.jsx\`
- **Accessibility & Form Labels (P2)**: เพิ่ม \`htmlFor\` และ \`id\` เชื่อมโยงให้กับ Form Controls ทุกจุดใน \`ReportFilterBar.jsx\`, เพิ่ม \`aria-label\`, \`aria-expanded\`, และ \`aria-controls\` บนปุ่มยุบ/ขยายตัวกรอง, และเพิ่ม \`aria-label\` บน Select / Search ใน \`ReportSiteKits.jsx\`
- **Accessibility & Data Tables for SR (P2)**: เพิ่ม Accessible Data Table ซ่อนสายตา (\`sr-only\`) สำหรับ Screen Reader บนชาร์ต Recharts Bar Chart และ Pie Chart ใน \`ReportCharts.jsx\`
- **Contrast Ratios (P2)**: ปรับปรุงสีข้อความสถานะและตัวเลขสู่ \`text-emerald-700\` และ \`text-amber-700\` ใน \`ReportDataTable.jsx\` และ \`ReportKpiGrid.jsx\` ให้ผ่านเกณฑ์ WCAG AA (>4.5:1)
- **Touch Targets (P2)**: ปรับปรุงขนาดปุ่มและตัวเลือกใน \`ReportHeader.jsx\`, \`ReportPagination.jsx\`, \`ReportFilterBar.jsx\`, และ \`ReportSiteKits.jsx\` สู่ \`min-h-[44px]\` บน Mobile/Tablet
- **Type Ramp Restoration (P2)**: กวาดล้างคลาส \`text-[10px]\` และ \`text-[11px]\` ใน \`ReportDataTable.jsx\`, \`ReportKpiGrid.jsx\`, และ \`ReportSiteKits.jsx\` กลับสู่ \`text-xs\` ตามมาตรฐาน \`DESIGN.md\`
- **Performance & Data Flow (P2)**: ป้องกัน Double Fetch เมื่อสลับไปยังแท็บ \`balance\` ใน \`Reports.jsx\` และเพิ่ม Debounce 300ms ให้กับช่องค้นหาใน \`ReportFilterBar.jsx\`
- **Polish & Housekeeping (P3)**: เพิ่ม \`excelLoading\` ปิดปุ่ม Excel ระหว่าง Export ใน \`ReportHeader.jsx\`, แทนที่การ Hardcode "Project: " ด้วย \`t('common.project')\`, เปลี่ยน Table Keys จาก array index เป็น composite unique keys, และเพิ่ม \`aria-sort\` บนหัวตารางที่จัดเรียงได้

`;

if (changelog.includes('\r\n')) {
  changelog = changelog.replace('# Changelog\r\n\r\n', '# Changelog\r\n\r\n' + entry.replace(/\n/g, '\r\n'));
} else {
  changelog = changelog.replace('# Changelog\n\n', '# Changelog\n\n' + entry);
}
fs.writeFileSync('CHANGELOG.md', changelog, 'utf8');
console.log('[PASS] CHANGELOG.md updated to 1.25.20');
