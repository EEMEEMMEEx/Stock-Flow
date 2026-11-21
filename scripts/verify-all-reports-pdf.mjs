import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { createServer } from 'vite';

const root = process.cwd();
const fontsDir = path.join(root, 'public', 'fonts');
const logoPath = path.join(root, 'public', 'images', 'logo.png');
const logoSrc = { data: fs.readFileSync(logoPath), format: 'png' };

const FORBIDDEN_WAREHOUSE_SUFFIXES = [
  '(EMS (SAP))',
  '(EMS)',
  '(Forth 3rd Floor)',
  '(Factory C)',
  '(Pawnshop Building)',
];

const EXPECTED_WAREHOUSE_HEADERS = [
  'คลังที่ 1/5: คลัง EMS (SAP)',
  'คลังที่ 2/5: คลัง EMS',
  'คลังที่ 3/5: คลัง Forth ชั้น 3',
  'คลังที่ 4/5: คลัง Factory C',
  'คลังที่ 5/5: ตึกโรงรับจำนำ',
];

const EXPECTED_CATEGORY_LABELS = [
  'MW (Microwave)',
  'BS (Base Station)',
  'AGW (Analog Gateway)',
  'ลูกข่าย (Fixed Radio)',
  'ชุดอุปกรณ์รวม (Combined Equipment Set)',
  'อื่นๆ (Others)',
];

function countPdfPages(buffer) {
  const latin1 = buffer.toString('latin1');
  const matches = latin1.match(/\/Type\s*\/Page\b(?!s)/g);
  return matches ? matches.length : 0;
}

function extractNodeText(node) {
  let text = '';
  if (node?.type === 'TEXT_INSTANCE' && node.value) {
    text += node.value;
  }
  if (Array.isArray(node?.children)) {
    for (const child of node.children) {
      text += extractNodeText(child);
    }
  }
  return text;
}

function findNodes(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (predicate(node)) out.push(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      findNodes(child, predicate, out);
    }
  }
  return out;
}

async function inspectLayout(pdfFn, layoutFn, Font, element) {
  const instance = pdfFn(element);
  const layout = await layoutFn(instance.container.document, Font);
  const pages = layout.children || [];
  return {
    pages,
    pageTexts: pages.map((page) => extractNodeText(page)),
  };
}

function assertReportLayoutConsistency({
  label,
  pages,
  pageTexts,
  expectedHeaders,
  singleLineColIndices,
  expectedDataRowCount,
  hasWarehouses = true,
  emptyLabel = 'ไม่มีข้อมูล (No data)',
}) {
  for (let i = 0; i < pageTexts.length; i += 1) {
    const text = pageTexts[i];
    assert(!text.includes('โครงการ'), `${label} page ${i + 1} must NOT contain "โครงการ" header`);
    assert(!text.includes('DOPA-DTRS'), `${label} page ${i + 1} must NOT contain project value "DOPA-DTRS"`);
    assert(!text.includes('USO-SHF'), `${label} page ${i + 1} must NOT contain project value "USO-SHF"`);
    for (const forbidden of FORBIDDEN_WAREHOUSE_SUFFIXES) {
      assert(!text.includes(forbidden), `${label} page ${i + 1} must NOT contain "${forbidden}"`);
    }

    const isLastPage = i === pageTexts.length - 1;
    if (isLastPage) {
      assert(text.includes('Grand Total Summary'), `${label} final page must contain Grand Total Summary`);
      if (hasWarehouses) {
        assert(!text.includes('คลังที่ 5/5'), `${label} Grand Total page must NOT repeat Warehouse 5 banner`);
      }
      continue;
    }

    // Detail pages must repeat the exact column header row
    const headerRows = findNodes(
      pages[i],
      (n) =>
        n.type === 'VIEW' &&
        Array.isArray(n.children) &&
        n.children.length === expectedHeaders.length &&
        extractNodeText(n.children[0]).trim() === expectedHeaders[0] &&
        extractNodeText(n.children[1]).trim() === expectedHeaders[1]
    );
    assert(headerRows.length >= 1, `${label} page ${i + 1} must render repeating table header`);

    const headerRow = headerRows[0];
    const colTexts = headerRow.children.map((c) => extractNodeText(c).trim());
    assert.deepEqual(colTexts, expectedHeaders, `${label} page ${i + 1} header texts must match`);

    const rowWidth = headerRow.box?.width ?? 0;
    const sumColWidths = headerRow.children.reduce((sum, c) => sum + (c.box?.width ?? 0), 0);
    assert(
      rowWidth > 0 && Math.abs(sumColWidths - rowWidth) <= 3,
      `${label} page ${i + 1} header widths (${sumColWidths.toFixed(2)}) must match row width (${rowWidth.toFixed(2)})`
    );

    for (const cell of headerRow.children) {
      const textNode = cell.children?.[0];
      const lineCount = textNode?.lines?.length ?? 1;
      assert.equal(
        lineCount,
        1,
        `${label} page ${i + 1} header cell "${extractNodeText(cell).trim()}" must fit on 1 line (got ${lineCount})`
      );
    }

    const headerColBoxes = headerRow.children.map((c) => c.box);
    const dataRows = findNodes(
      pages[i],
      (n) =>
        n.type === 'VIEW' &&
        Array.isArray(n.children) &&
        n.children.length === expectedHeaders.length &&
        /^\d+$/.test(extractNodeText(n.children[0]).trim())
    );
    for (const dataRow of dataRows) {
      const rowHeight = dataRow.box?.height ?? 0;
      for (let c = 0; c < expectedHeaders.length; c += 1) {
        const cellBox = dataRow.children[c].box;
        const hdrBox = headerColBoxes[c];
        assert(
          Math.abs(cellBox.width - hdrBox.width) <= 1.5 &&
            Math.abs(cellBox.left - hdrBox.left) <= 1.5,
          `${label} page ${i + 1} data row col ${c} must align with header`
        );
        assert(
          Math.abs(cellBox.height - rowHeight) <= 1.5,
          `${label} page ${i + 1} data row col ${c} height must stretch to full row height`
        );
      }
      for (const colIdx of singleLineColIndices) {
        const textNode = dataRow.children[colIdx].children?.[0];
        const lineCount = textNode?.lines?.length ?? 1;
        assert.equal(
          lineCount,
          1,
          `${label} page ${i + 1} data row col ${colIdx} ("${extractNodeText(dataRow.children[colIdx]).trim()}") must stay single-line (got ${lineCount})`
        );
      }
    }
  }

  // Verify intact total data row count (no split rows)
  const totalDataRows = pages.slice(0, -1).reduce((count, page) => {
    const rowsOnPage = findNodes(
      page,
      (n) =>
        n.type === 'VIEW' &&
        Array.isArray(n.children) &&
        n.children.length === expectedHeaders.length &&
        /^\d+$/.test(extractNodeText(n.children[0]).trim())
    );
    return count + rowsOnPage.length;
  }, 0);
  assert.equal(
    totalDataRows,
    expectedDataRowCount,
    `${label} must render exact ${expectedDataRowCount} intact data rows (got ${totalDataRows})`
  );

  // Verify all 5 warehouses and 6 categories + empty label are present
  const fullText = pageTexts.join('\n');
  if (hasWarehouses) {
    for (const whHeader of EXPECTED_WAREHOUSE_HEADERS) {
      assert(fullText.includes(whHeader), `${label} must include "${whHeader}"`);
    }
  }
  for (const catLabel of EXPECTED_CATEGORY_LABELS) {
    assert(fullText.includes(catLabel), `${label} must include category "${catLabel}"`);
  }
  assert(fullText.includes(emptyLabel), `${label} must include empty placeholder "${emptyLabel}"`);
}

async function main() {
  console.log('Running unified @react-pdf/renderer verification for ALL FOUR PDF reports...');

  const vite = await createServer({
    root,
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const reactPdf = await vite.ssrLoadModule('@react-pdf/renderer');
    const layoutMod = await vite.ssrLoadModule('@react-pdf/layout');
    const { Font, pdf, renderToBuffer } = reactPdf;
    const layoutFn = layoutMod.default;
    const mod = await vite.ssrLoadModule('/src/lib/pdf-templates.jsx');
    const {
      GoodsReceiptReportPDF,
      GoodsIssueReportPDF,
      InventoryBalanceReportPDF,
      SiteKitsReportPDF,
    } = mod;

    const registered = Font.getRegisteredFonts();
    if (registered && registered.THSarabunNew) {
      delete registered.THSarabunNew;
    }
    Font.register({
      family: 'THSarabunNew',
      fonts: [
        { src: path.join(fontsDir, 'THSarabunNew.ttf') },
        { src: path.join(fontsDir, 'THSarabunNew Italic.ttf'), fontStyle: 'italic' },
        { src: path.join(fontsDir, 'THSarabunNew Bold.ttf'), fontWeight: 'bold' },
        { src: path.join(fontsDir, 'THSarabunNew BoldItalic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
      ],
    });

    const projects = [
      { id: 'p1', name: 'DOPA-DTRS | USO-SHF', location: 'คลัง EMS (SAP)' },
      { id: 'p2', name: 'DOPA-DTRS | USO-SHF', location: 'คลัง EMS' },
      { id: 'p3', name: 'DOPA-DTRS | USO-SHF', location: 'คลัง Forth ชั้น 3' },
      { id: 'p4', name: 'DOPA-DTRS | USO-SHF', location: 'คลัง Factory C' },
      { id: 'p5', name: 'DOPA-DTRS | USO-SHF', location: 'ตึกโรงรับจำนำ' },
      { id: 'p6', name: 'Site Survey', location: 'คลังชั่วคราวเชียงใหม่' },
    ];

    const categories = [
      { id: 'c1', name: 'MW (Microwave)' },
      { id: 'c2', name: 'BS (Base Station)' },
      { id: 'c3', name: 'AGW (Analog Gateway)' },
      { id: 'c4', name: 'Fixed Radio (ลูกข่ายประจำที่)' },
      { id: 'c5', name: 'ชุดอุปกรณ์รวม (Equipment Set)' },
      { id: 'c6', name: 'อื่นๆ' },
    ];

    // -----------------------------------------------------------------------
    // Report #1: Goods Receipt Report (multi-warehouse, multi-category, multi-page, empty WH4 & empty cat)
    // -----------------------------------------------------------------------
    const receiptRows = [];
    for (let i = 1; i <= 42; i += 1) {
      // Skip category c2 (BS) in Warehouse 1 so we have an empty category in WH1
      const cat = i % 5 === 0 ? categories[5] : categories[i % 5 === 1 ? 0 : i % 5];
      receiptRows.push({
        id: `si-w1-${i}`,
        order_id: `ord-w1-${i}`,
        project_id: 'p1',
        received_date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
        po_number: `PO-2026-${String(i).padStart(4, '0')}`,
        supplier:
          i === 1
            ? 'บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน) แผนกจัดซื้ออุปกรณ์โทรคมนาคม'
            : i % 2 === 0
              ? 'Huawei Thailand'
              : 'Forth Supply Co.',
        quantity: i === 1 ? 123456 : 10 + i * 5,
        items: {
          name: i === 1
            ? 'Optix RTN 320F OAU 2F DC อุปกรณ์ไมโครเวฟความถี่สูงรุ่นพิเศษพร้อมชุดติดตั้งครบชุด'
            : `พัสดุรับเข้าทดสอบรายการที่ ${String(i).padStart(2, '0')}`,
          unit: i % 2 === 0 ? 'ชิ้น' : 'เมตร',
          category_id: cat.id,
          categories: cat,
        },
        projects: projects[0],
      });
    }
    receiptRows.push(
      {
        id: 'si-w2-1',
        order_id: 'ord-w2-1',
        project_id: 'p2',
        received_date: '2026-11-18',
        po_number: 'PO-2026-0201',
        supplier: 'Motorola Solutions',
        quantity: 25,
        items: { name: 'TETRA DIB-R5 Base Station', unit: 'ชุด', category_id: 'c2', categories: categories[1] },
        projects: projects[1],
      },
      {
        id: 'si-w3-1',
        order_id: 'ord-w3-1',
        project_id: 'p3',
        received_date: '2026-11-19',
        po_number: 'PO-2026-0301',
        supplier: 'Forth Electronics',
        quantity: 60,
        items: { name: 'Analog Gateway SC266', unit: 'ชิ้น', category_id: 'c3', categories: categories[2] },
        projects: projects[2],
      },
      // p4 (Factory C) intentionally EMPTY
      {
        id: 'si-w5-1',
        order_id: 'ord-w5-1',
        project_id: 'p5',
        received_date: '2026-11-20',
        po_number: 'PO-2026-0501',
        supplier: 'Bird RF',
        quantity: 12,
        items: { name: 'Dummy Load Bird 100W', unit: 'ชุด', category_id: 'c5', categories: categories[4] },
        projects: projects[4],
      },
      {
        id: 'si-unmapped',
        order_id: 'ord-unm',
        project_id: 'p6',
        received_date: '2026-11-20',
        po_number: 'PO-TEMP',
        supplier: 'Temp',
        quantity: 5,
        items: { name: 'สายไฟชั่วคราว', unit: 'เมตร', category_id: 'c6', categories: categories[5] },
        projects: projects[5],
      }
    );

    const el1 = React.createElement(GoodsReceiptReportPDF, { data: receiptRows, projects, categories, logoSrc });
    const buf1 = await renderToBuffer(el1);
    assert(buf1.subarray(0, 5).toString('latin1') === '%PDF-', 'Report #1 must produce valid PDF');
    assert(buf1.toString('latin1').includes('THSarabunNew'), 'Report #1 must embed THSarabunNew');
    const pages1 = countPdfPages(buf1);
    assert(pages1 > 6, `Report #1 multi-page must exceed 6 pages (got ${pages1})`);
    const layout1 = await inspectLayout(pdf, layoutFn, Font, el1);
    assertReportLayoutConsistency({
      label: 'Report #1 (Goods Receipt)',
      pages: layout1.pages,
      pageTexts: layout1.pageTexts,
      expectedHeaders: ['ลำดับ', 'วันที่รับเข้า', 'เลขที่เอกสาร / PO', 'รายการวัสดุ', 'ผู้จำหน่าย', 'หน่วย', 'จำนวนรับเข้า'],
      singleLineColIndices: [0, 1, 6],
      expectedDataRowCount: 45,
      hasWarehouses: true,
      emptyLabel: 'ไม่มีข้อมูล (No data)',
    });
    console.log(`✓ PASS Report #1 (Goods Receipt): ${buf1.length} bytes, ${pages1} pages`);

    // -----------------------------------------------------------------------
    // Report #2: Goods Issue Report (multi-warehouse, multi-category, multi-page, empty WH4 & empty cat)
    // -----------------------------------------------------------------------
    const issueRows = [];
    for (let i = 1; i <= 42; i += 1) {
      const cat = i % 5 === 0 ? categories[5] : categories[i % 5 === 1 ? 0 : i % 5];
      issueRows.push({
        id: `wi-w1-${i}`,
        order_id: `wo-w1-${i}`,
        work_order_no: `WO-2026-${String(i).padStart(4, '0')}`,
        project_id: 'p1',
        source_project_id: 'p1',
        requested_at: `2026-11-${String((i % 28) + 1).padStart(2, '0')}T09:00:00Z`,
        status: 'approved',
        quantity: i === 1 ? 98765 : 15 + i,
        deducted_quantity: i === 1 ? 98760 : 12 + i,
        shortage_quantity: i === 1 ? 5 : 3,
        profiles: {
          full_name:
            i === 1
              ? 'นายวัชระ มานะดี (หัวหน้าทีมติดตั้งสถานีฐานภาคสนาม)'
              : i % 2 === 0
                ? 'สมชาย ใจดี'
                : 'วิชัย ช่างติดตั้ง',
        },
        items: {
          name: i === 1
            ? 'Optix RTN 320F OAU 2F DC อุปกรณ์เบิกจ่ายสำหรับสถานีฐานพื้นที่ห่างไกลครบชุด'
            : `พัสดุเบิกจ่ายทดสอบรายการที่ ${String(i).padStart(2, '0')}`,
          unit: 'ชิ้น',
          category_id: cat.id,
          categories: cat,
        },
        projects: projects[0],
        source: 'withdrawal',
      });
    }
    issueRows.push(
      {
        id: 'wi-w2-1',
        order_id: 'wo-w2-1',
        work_order_no: 'WO-2026-0201',
        project_id: 'p2',
        source_project_id: 'p2',
        requested_at: '2026-11-18T10:00:00Z',
        status: 'completed',
        quantity: 8,
        deducted_quantity: 8,
        shortage_quantity: 0,
        profiles: { full_name: 'สุรศักดิ์ ทีมสนาม' },
        items: { name: 'TETRA DIB-R5 Base Station', unit: 'ชุด', category_id: 'c2', categories: categories[1] },
        projects: projects[1],
        source: 'withdrawal',
      },
      {
        id: 'wi-w3-1',
        order_id: 'wo-w3-1',
        work_order_no: 'WO-2026-0301',
        project_id: 'p3',
        source_project_id: 'p3',
        requested_at: '2026-11-19T11:00:00Z',
        status: 'completed',
        quantity: 20,
        deducted_quantity: 20,
        shortage_quantity: 0,
        profiles: { full_name: 'นภาวรรณ ศูนย์ควบคุม' },
        items: { name: 'MT680 Plus Fixed Radio', unit: 'เครื่อง', category_id: 'c4', categories: categories[3] },
        projects: projects[2],
        source: 'withdrawal',
      },
      // p4 (Factory C) intentionally EMPTY
      {
        id: 'cl-w5-1',
        project_id: 'p5',
        source_project_id: 'p5',
        requested_at: '2026-11-20T14:00:00Z',
        status: 'completed',
        quantity: 3,
        deducted_quantity: 3,
        shortage_quantity: 0,
        profiles: { full_name: 'กิตติพงษ์ ช่างซ่อม' },
        items: { name: 'Battery (BL1806)', unit: 'ชิ้น', category_id: 'c5', categories: categories[4] },
        projects: projects[4],
        source: 'checkout_consumed',
        reference: 'CO-2026-0099',
      }
    );

    const el2 = React.createElement(GoodsIssueReportPDF, { data: issueRows, projects, categories, logoSrc });
    const buf2 = await renderToBuffer(el2);
    assert(buf2.subarray(0, 5).toString('latin1') === '%PDF-', 'Report #2 must produce valid PDF');
    assert(buf2.toString('latin1').includes('THSarabunNew'), 'Report #2 must embed THSarabunNew');
    const pages2 = countPdfPages(buf2);
    assert(pages2 > 6, `Report #2 multi-page must exceed 6 pages (got ${pages2})`);
    const layout2 = await inspectLayout(pdf, layoutFn, Font, el2);
    assertReportLayoutConsistency({
      label: 'Report #2 (Goods Issue)',
      pages: layout2.pages,
      pageTexts: layout2.pageTexts,
      expectedHeaders: ['ลำดับ', 'วันที่เบิก', 'เลขที่เอกสาร', 'รายการวัสดุ', 'ผู้ขอเบิก', 'หน่วย', 'ขอเบิก', 'จ่ายจริง'],
      singleLineColIndices: [0, 1, 6, 7],
      expectedDataRowCount: 45,
      hasWarehouses: true,
      emptyLabel: 'ไม่มีข้อมูล (No data)',
    });
    console.log(`✓ PASS Report #2 (Goods Issue): ${buf2.length} bytes, ${pages2} pages`);

    // -----------------------------------------------------------------------
    // Report #3: Inventory Balance Report (reference parity check)
    // -----------------------------------------------------------------------
    const balanceRows = [
      {
        project_id: 'p1',
        item_id: 'b-1',
        item_name: 'Optix RTN 320F OAU 2F DC',
        unit: 'ชิ้น',
        total_in: 500,
        total_out: 100,
        balance: 400,
        items: { category_id: 'c1', categories: categories[0] },
        projects: projects[0],
      },
      {
        project_id: 'p5',
        item_id: 'b-2',
        item_name: 'Dummy Load Bird 100W',
        unit: 'ชุด',
        total_in: 10,
        total_out: 2,
        balance: 8,
        items: { category_id: 'c5', categories: categories[4] },
        projects: projects[4],
      },
    ];
    const el3 = React.createElement(InventoryBalanceReportPDF, { data: balanceRows, projects, categories, logoSrc });
    const buf3 = await renderToBuffer(el3);
    assert(buf3.subarray(0, 5).toString('latin1') === '%PDF-', 'Report #3 must produce valid PDF');
    assert(buf3.toString('latin1').includes('THSarabunNew'), 'Report #3 must embed THSarabunNew');
    const pages3 = countPdfPages(buf3);
    assert.equal(pages3, 6, `Report #3 must have 6 pages (got ${pages3})`);
    const layout3 = await inspectLayout(pdf, layoutFn, Font, el3);
    assertReportLayoutConsistency({
      label: 'Report #3 (Inventory Balance)',
      pages: layout3.pages,
      pageTexts: layout3.pageTexts,
      expectedHeaders: ['ลำดับ', 'รายการวัสดุ', 'หน่วย', 'รับเข้าทั้งหมด', 'เบิกออกทั้งหมด', 'คงเหลือ'],
      singleLineColIndices: [0, 3, 4, 5],
      expectedDataRowCount: 2,
      hasWarehouses: true,
      emptyLabel: 'ไม่มีสต็อก (No stock)',
    });
    console.log(`✓ PASS Report #3 (Inventory Balance): ${buf3.length} bytes, ${pages3} pages`);

    // -----------------------------------------------------------------------
    // Report #4: Site Kits BOM Readiness Report (multi-category, multi-page, empty Others category)
    // -----------------------------------------------------------------------
    const sampleSiteKits = [
      {
        category_id: '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba',
        category_name: 'MW (Microwave)',
        complete_sets: 4,
        items: Array.from({ length: 22 }, (_, i) => ({
          id: `mw-${i + 1}`,
          po_seq: i + 1,
          part_number: `30207-0024-${String(4484 + i)}`,
          bom_name: i === 0
            ? 'Optix RTN 320F OAU 2F DC อุปกรณ์ไมโครเวฟเชื่อมโยงสัญญาณสถานีฐานความถี่สูง'
            : `อุปกรณ์ Microwave BOM รายการที่ ${String(i + 1).padStart(2, '0')}`,
          qty_per_site: i === 0 ? 1 : 2,
          unit: 'ชิ้น',
          total_stock: i === 1 ? 8 : 30 + i * 2,
          sets_possible: i === 1 ? 4 : 15 + i,
          missing_for_next_set: i === 1 ? 2 : 0,
          is_mandatory: true,
        })),
      },
      {
        category_id: '793d55c3-4750-42e1-a82e-438e7be131c8',
        category_name: 'BS (Base Station)',
        complete_sets: 0,
        items: Array.from({ length: 12 }, (_, i) => ({
          id: `bs-${i + 1}`,
          po_seq: i + 1,
          part_number: `30207-0024-${String(1718 + i)}`,
          bom_name: `อุปกรณ์ Base Station BOM รายการที่ ${String(i + 1).padStart(2, '0')}`,
          qty_per_site: 1,
          unit: 'ชุด',
          total_stock: i === 0 ? 0 : 10,
          sets_possible: i === 0 ? 0 : 10,
          missing_for_next_set: i === 0 ? 1 : 0,
          is_mandatory: true,
        })),
      },
      {
        category_id: '3fb47021-6c65-4a4f-bca4-595280d9ba97',
        category_name: 'AGW (Analog Gateway)',
        complete_sets: 5,
        items: [
          {
            id: 'agw-1',
            po_seq: 1,
            part_number: '30207-0024-04415',
            bom_name: 'SC266-HF4LDF(D00) 156-174MHz',
            qty_per_site: 2,
            unit: 'ชิ้น',
            total_stock: 10,
            sets_possible: 5,
            missing_for_next_set: 2,
            is_mandatory: true,
          },
        ],
      },
      // Fixed Radio, Combined Equipment Set, and Others intentionally empty to verify No data rows
    ];

    const el4 = React.createElement(SiteKitsReportPDF, { siteKits: sampleSiteKits, logoSrc });
    const buf4 = await renderToBuffer(el4);
    assert(buf4.subarray(0, 5).toString('latin1') === '%PDF-', 'Report #4 must produce valid PDF');
    assert(buf4.toString('latin1').includes('THSarabunNew'), 'Report #4 must embed THSarabunNew');
    const pages4 = countPdfPages(buf4);
    assert(pages4 >= 3, `Report #4 multi-page + Grand Total must be >= 3 pages (got ${pages4})`);
    const layout4 = await inspectLayout(pdf, layoutFn, Font, el4);
    assertReportLayoutConsistency({
      label: 'Report #4 (Site Kits BOM)',
      pages: layout4.pages,
      pageTexts: layout4.pageTexts,
      expectedHeaders: ['ลำดับ', 'Part Number', 'รายการอุปกรณ์ตาม BOM', 'สเปก/ไซต์', 'สต็อกจริง', 'จัดได้', 'ขาด', 'สถานะ'],
      singleLineColIndices: [0, 3, 4, 5, 6, 7],
      expectedDataRowCount: 35,
      hasWarehouses: false,
      emptyLabel: 'ไม่มีข้อมูล (No data)',
    });
    console.log(`✓ PASS Report #4 (Site Kits BOM): ${buf4.length} bytes, ${pages4} pages`);

    // -----------------------------------------------------------------------
    // Empty dataset checks for Reports #1, #2, #4 (all canonical sections & No data preserved)
    // -----------------------------------------------------------------------
    const emptyEl1 = React.createElement(GoodsReceiptReportPDF, { data: [], projects, categories, logoSrc });
    const emptyBuf1 = await renderToBuffer(emptyEl1);
    assert.equal(countPdfPages(emptyBuf1), 6, 'Empty Report #1 must render 6 pages (5 WH + Grand Total)');
    const emptyLayout1 = await inspectLayout(pdf, layoutFn, Font, emptyEl1);
    assertReportLayoutConsistency({
      label: 'Report #1 Empty',
      pages: emptyLayout1.pages,
      pageTexts: emptyLayout1.pageTexts,
      expectedHeaders: ['ลำดับ', 'วันที่รับเข้า', 'เลขที่เอกสาร / PO', 'รายการวัสดุ', 'ผู้จำหน่าย', 'หน่วย', 'จำนวนรับเข้า'],
      singleLineColIndices: [0, 1, 6],
      expectedDataRowCount: 0,
      hasWarehouses: true,
      emptyLabel: 'ไม่มีข้อมูล (No data)',
    });

    const emptyEl2 = React.createElement(GoodsIssueReportPDF, { data: [], projects, categories, logoSrc });
    const emptyBuf2 = await renderToBuffer(emptyEl2);
    assert.equal(countPdfPages(emptyBuf2), 6, 'Empty Report #2 must render 6 pages (5 WH + Grand Total)');
    const emptyLayout2 = await inspectLayout(pdf, layoutFn, Font, emptyEl2);
    assertReportLayoutConsistency({
      label: 'Report #2 Empty',
      pages: emptyLayout2.pages,
      pageTexts: emptyLayout2.pageTexts,
      expectedHeaders: ['ลำดับ', 'วันที่เบิก', 'เลขที่เอกสาร', 'รายการวัสดุ', 'ผู้ขอเบิก', 'หน่วย', 'ขอเบิก', 'จ่ายจริง'],
      singleLineColIndices: [0, 1, 6, 7],
      expectedDataRowCount: 0,
      hasWarehouses: true,
      emptyLabel: 'ไม่มีข้อมูล (No data)',
    });

    const emptyEl4 = React.createElement(SiteKitsReportPDF, { siteKits: [], logoSrc });
    const emptyBuf4 = await renderToBuffer(emptyEl4);
    assert.equal(countPdfPages(emptyBuf4), 2, 'Empty Report #4 must render 2 pages (6 Categories + Grand Total)');
    const emptyLayout4 = await inspectLayout(pdf, layoutFn, Font, emptyEl4);
    assertReportLayoutConsistency({
      label: 'Report #4 Empty',
      pages: emptyLayout4.pages,
      pageTexts: emptyLayout4.pageTexts,
      expectedHeaders: ['ลำดับ', 'Part Number', 'รายการอุปกรณ์ตาม BOM', 'สเปก/ไซต์', 'สต็อกจริง', 'จัดได้', 'ขาด', 'สถานะ'],
      singleLineColIndices: [0, 3, 4, 5, 6, 7],
      expectedDataRowCount: 0,
      hasWarehouses: false,
      emptyLabel: 'ไม่มีข้อมูล (No data)',
    });
    console.log('✓ PASS Empty dataset checks for Reports #1, #2, #4');

    console.log('\nAll 4 PDF reports real render & layout consistency checks PASSED!');
  } finally {
    await vite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
