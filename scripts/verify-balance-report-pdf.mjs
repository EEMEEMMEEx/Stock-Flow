import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { createServer } from 'vite';

const root = process.cwd();
const fontsDir = path.join(root, 'public', 'fonts');
const logoPath = path.join(root, 'public', 'images', 'logo.png');
const logoSrc = { data: fs.readFileSync(logoPath), format: 'png' };

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

async function inspectLayout(pdfFn, layoutFn, Font, element) {
  const instance = pdfFn(element);
  const layout = await layoutFn(instance.container.document, Font);
  const pages = layout.children || [];
  return {
    pages,
    pageTexts: pages.map((page) => extractNodeText(page)),
  };
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

const EXPECTED_HEADERS = [
  'ลำดับ',
  'รายการวัสดุ',
  'หน่วย',
  'รับเข้าทั้งหมด',
  'เบิกออกทั้งหมด',
  'คงเหลือ',
];

const FORBIDDEN_WAREHOUSE_SUFFIXES = [
  '(EMS (SAP))',
  '(EMS)',
  '(Forth 3rd Floor)',
  '(Factory C)',
  '(Pawnshop Building)',
];

function assertNoProjectColumnOrDuplicatedWarehouse(pageTexts, pages, label) {
  for (let i = 0; i < pageTexts.length; i += 1) {
    const text = pageTexts[i];
    assert(!text.includes('โครงการ'), `${label} page ${i + 1} must NOT contain "โครงการ" header`);
    assert(!text.includes('DOPA-DTRS'), `${label} page ${i + 1} must NOT contain project value "DOPA-DTRS"`);
    assert(!text.includes('USO-SHF'), `${label} page ${i + 1} must NOT contain project value "USO-SHF"`);
    assert(!text.includes('Site Survey'), `${label} page ${i + 1} must NOT contain project value "Site Survey"`);
    for (const forbidden of FORBIDDEN_WAREHOUSE_SUFFIXES) {
      assert(
        !text.includes(forbidden),
        `${label} page ${i + 1} must NOT contain redundant warehouse suffix "${forbidden}"`
      );
    }

    // Verify table header rows on this page have exact 6 columns spanning the full row width without overflow or wrapping
    const headerRows = findNodes(
      pages[i],
      (n) =>
        n.type === 'VIEW' &&
        Array.isArray(n.children) &&
        n.children.length > 0 &&
        extractNodeText(n.children[0]).trim() === 'ลำดับ' &&
        extractNodeText(n).includes('รายการวัสดุ')
    );
    let headerColBoxes = null;
    for (const headerRow of headerRows) {
      const colTexts = headerRow.children.map((c) => extractNodeText(c).trim());
      assert.deepEqual(
        colTexts,
        EXPECTED_HEADERS,
        `${label} page ${i + 1} table header must have exact 6 columns (got ${JSON.stringify(colTexts)})`
      );
      const rowWidth = headerRow.box?.width ?? 0;
      const sumColWidths = headerRow.children.reduce((sum, c) => sum + (c.box?.width ?? 0), 0);
      assert(
        rowWidth > 0 && Math.abs(sumColWidths - rowWidth) <= 3,
        `${label} page ${i + 1} header column widths (${sumColWidths.toFixed(2)}) must match row width (${rowWidth.toFixed(2)})`
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
      headerColBoxes = headerRow.children.map((c) => c.box);
    }

    if (headerColBoxes) {
      // Verify every 6-column data row aligns with the 6 header columns and has no numeric wrapping
      const dataRows = findNodes(
        pages[i],
        (n) =>
          n.type === 'VIEW' &&
          Array.isArray(n.children) &&
          n.children.length === 6 &&
          /^\d+$/.test(extractNodeText(n.children[0]).trim()) &&
          extractNodeText(n.children[3]).trim().startsWith('+')
      );
      for (const dataRow of dataRows) {
        const rowHeight = dataRow.box?.height ?? 0;
        for (let c = 0; c < 6; c += 1) {
          const cellBox = dataRow.children[c].box;
          const hdrBox = headerColBoxes[c];
          assert(
            Math.abs(cellBox.width - hdrBox.width) <= 1.5,
            `${label} page ${i + 1} data row col ${c} width (${cellBox.width.toFixed(2)}) must align with header (${hdrBox.width.toFixed(2)})`
          );
          assert(
            Math.abs(cellBox.left - hdrBox.left) <= 1.5,
            `${label} page ${i + 1} data row col ${c} left (${cellBox.left.toFixed(2)}) must align with header (${hdrBox.left.toFixed(2)})`
          );
          // Every cell in a row should stretch to full row height so vertical borders never break on wrapped rows
          assert(
            Math.abs(cellBox.height - rowHeight) <= 1.5,
            `${label} page ${i + 1} data row col ${c} height (${cellBox.height.toFixed(2)}) must match row height (${rowHeight.toFixed(2)})`
          );
        }
        // Numeric columns (index 3, 4, 5) and index (0) must stay single-line
        for (const colIdx of [0, 3, 4, 5]) {
          const textNode = dataRow.children[colIdx].children?.[0];
          const lineCount = textNode?.lines?.length ?? 1;
          assert.equal(
            lineCount,
            1,
            `${label} page ${i + 1} data row col ${colIdx} ("${extractNodeText(dataRow.children[colIdx]).trim()}") must not wrap (got ${lineCount} lines)`
          );
        }
      }

      // Verify category & warehouse subtotal rows align their 3 numeric columns with header cols 3, 4, 5
      const subtotalRows = findNodes(
        pages[i],
        (n) =>
          n.type === 'VIEW' &&
          Array.isArray(n.children) &&
          n.children.length === 4 &&
          /^(รวมหมวดหมู่|รวมยอดคลัง)/.test(extractNodeText(n.children[0]).trim()) &&
          extractNodeText(n.children[1]).trim().startsWith('+') &&
          extractNodeText(n.children[2]).trim().startsWith('-')
      );
      for (const subRow of subtotalRows) {
        const expectedLeftWidth =
          headerColBoxes[0].width + headerColBoxes[1].width + headerColBoxes[2].width;
        assert(
          Math.abs(subRow.children[0].box.width - expectedLeftWidth) <= 1.5,
          `${label} page ${i + 1} subtotal label width (${subRow.children[0].box.width.toFixed(2)}) must match cols 0-2 (${expectedLeftWidth.toFixed(2)})`
        );
        for (let k = 0; k < 3; k += 1) {
          const cellBox = subRow.children[k + 1].box;
          const hdrBox = headerColBoxes[k + 3];
          assert(
            Math.abs(cellBox.width - hdrBox.width) <= 1.5 &&
              Math.abs(cellBox.left - hdrBox.left) <= 1.5,
            `${label} page ${i + 1} subtotal numeric col ${k} must align with header col ${k + 3}`
          );
        }
      }
    }
  }
}

async function main() {
  console.log('Running real @react-pdf/renderer verification for InventoryBalanceReportPDF...');

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
    const { InventoryBalanceReportPDF } = mod;
    assert.equal(typeof InventoryBalanceReportPDF, 'function', 'InventoryBalanceReportPDF must be exported');

    // Replace only THSarabunNew with local filesystem paths (preserve built-in Helvetica)
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

    // Scenario 1: Multi-warehouse + multi-category + empty category + empty warehouse (Factory C) + unmapped warehouse/category
    const scenario1Rows = [
      {
        project_id: 'p1',
        item_id: 'i1',
        item_name: 'Optix RTN 320F OAU 2F DC (อุปกรณ์ไมโครเวฟ)',
        project_name: 'DOPA-DTRS | USO-SHF',
        unit: 'ชิ้น',
        total_in: 1200,
        total_out: 150,
        balance: 1050,
        items: { category_id: 'c1', categories: { id: 'c1', name: 'MW (Microwave)' } },
        projects: projects[0],
      },
      {
        project_id: 'p1',
        item_id: 'i2',
        item_name: 'สายรัดเคเบิลไม่ระบุหมวด',
        project_name: 'DOPA-DTRS | USO-SHF',
        unit: 'แพ็ค',
        total_in: 30,
        total_out: 30,
        balance: 0,
        items: { category_id: null },
        projects: projects[0],
      },
      {
        project_id: 'p2',
        item_id: 'i3',
        item_name: 'TETRA DIB-R5 Base Station',
        project_name: 'DOPA-DTRS | USO-SHF',
        unit: 'ชุด',
        total_in: 20,
        total_out: 4,
        balance: 16,
        items: { category_id: 'c2', categories: { id: 'c2', name: 'BS (Base Station)' } },
        projects: projects[1],
      },
      {
        project_id: 'p3',
        item_id: 'i4',
        item_name: 'Analog Gateway SC266',
        project_name: 'DOPA-DTRS | USO-SHF',
        unit: 'ชิ้น',
        total_in: 50,
        total_out: 10,
        balance: 40,
        items: { category_id: 'c3', categories: { id: 'c3', name: 'AGW (Analog Gateway)' } },
        projects: projects[2],
      },
      {
        project_id: 'p3',
        item_id: 'i5',
        item_name: 'MT680 Plus Fixed Radio (เครื่องลูกข่าย)',
        project_name: 'DOPA-DTRS | USO-SHF',
        unit: 'เครื่อง',
        total_in: 100,
        total_out: 25,
        balance: 75,
        items: { category_id: 'c4', categories: { id: 'c4', name: 'Fixed Radio (ลูกข่ายประจำที่)' } },
        projects: projects[2],
      },
      // p4 (Factory C) intentionally empty
      {
        project_id: 'p5',
        item_id: 'i6',
        item_name: 'ชุดอุปกรณ์รวม Dummy Load',
        project_name: 'DOPA-DTRS | USO-SHF',
        unit: 'ชุด',
        total_in: 12,
        total_out: 2,
        balance: 10,
        items: { category_id: 'c5', categories: { id: 'c5', name: 'ชุดอุปกรณ์รวม (Equipment Set)' } },
        projects: projects[4],
      },
      {
        project_id: 'p6', // unmapped warehouse
        item_id: 'i7',
        item_name: 'สายไฟชั่วคราว',
        project_name: 'Site Survey',
        unit: 'เมตร',
        total_in: 500,
        total_out: 0,
        balance: 500,
        items: { category_id: 'c6' },
        projects: projects[5],
      },
    ];

    const el1 = React.createElement(InventoryBalanceReportPDF, {
      data: scenario1Rows,
      projects,
      categories,
      logoSrc,
    });
    const buf1 = await renderToBuffer(el1);
    assert(buf1.subarray(0, 5).toString('latin1') === '%PDF-', 'Scenario 1 must produce valid PDF header');
    const pages1 = countPdfPages(buf1);
    assert.equal(pages1, 6, `Scenario 1 must have 6 pages (5 warehouses + Grand Total, got ${pages1})`);
    assert(buf1.toString('latin1').includes('THSarabunNew'), 'Scenario 1 PDF must embed THSarabunNew Thai font');

    const { pages: pages1Layout, pageTexts: pageTexts1 } = await inspectLayout(pdf, layoutFn, Font, el1);
    assert.equal(pageTexts1.length, 6, 'Scenario 1 layout must produce 6 pages');
    assertNoProjectColumnOrDuplicatedWarehouse(pageTexts1, pages1Layout, 'Scenario 1');
    assert(
      pageTexts1[0].includes('ขอบเขต: ทุกคลัง (5 คลัง) / ทุกหมวดหมู่ (6 หมวดหมู่)'),
      'Page 1 must preserve scope badge'
    );
    const expectedWhHeaders = [
      'คลังที่ 1/5: คลัง EMS (SAP)',
      'คลังที่ 2/5: คลัง EMS',
      'คลังที่ 3/5: คลัง Forth ชั้น 3',
      'คลังที่ 4/5: คลัง Factory C',
      'คลังที่ 5/5: ตึกโรงรับจำนำ',
    ];
    const expectedWhSummaries = [
      '2 รายการ | คงเหลือ 1,050',
      '1 รายการ | คงเหลือ 16',
      '2 รายการ | คงเหลือ 115',
      'ไม่มีสต็อก (No stock)',
      '1 รายการ | คงเหลือ 10',
    ];
    const expectedCatLabels = [
      'MW (Microwave)',
      'BS (Base Station)',
      'AGW (Analog Gateway)',
      'ลูกข่าย (Fixed Radio)',
      'ชุดอุปกรณ์รวม (Combined Equipment Set)',
      'อื่นๆ (Others)',
    ];
    expectedWhHeaders.forEach((whHeader, idx) => {
      assert(pageTexts1[idx].includes(whHeader), `Page ${idx + 1} must include ${whHeader}`);
      assert(
        pageTexts1[idx].includes(expectedWhSummaries[idx]),
        `Page ${idx + 1} must preserve right-aligned summary "${expectedWhSummaries[idx]}"`
      );
      for (const colHeader of EXPECTED_HEADERS) {
        assert(pageTexts1[idx].includes(colHeader), `Page ${idx + 1} must include column header ${colHeader}`);
      }
      for (const catLabel of expectedCatLabels) {
        assert(pageTexts1[idx].includes(catLabel), `Page ${idx + 1} must include category ${catLabel}`);
      }
    });
    assert(pageTexts1[3].includes('ไม่มีสต็อก (No stock)'), 'Empty Warehouse 4 (Factory C) must show No stock');
    assert(pageTexts1[5].includes('Grand Total Summary'), 'Final page must contain Grand Total Summary');
    for (const expectedGrandRow of [
      '1. คลัง EMS (SAP)',
      '2. คลัง EMS',
      '3. คลัง Forth ชั้น 3',
      '4. คลัง Factory C',
      '5. ตึกโรงรับจำนำ',
    ]) {
      assert(pageTexts1[5].includes(expectedGrandRow), `Grand Total must list "${expectedGrandRow}" cleanly`);
    }
    assert(!pageTexts1[5].includes('คลังที่ 5/5'), 'Grand Total page must NOT repeat Warehouse 5 banner');
    assert(!pageTexts1[5].includes('รายการวัสดุ'), 'Grand Total page must NOT repeat item table column header');
    console.log(`✓ PASS Scenario 1 (multi-warehouse + empty category + empty warehouse + unmapped): ${buf1.length} bytes, ${pages1} pages`);

    // Scenario 2: Multi-page dataset (55 rows in Warehouse 1 incl. long name + large numbers + 20 rows in Warehouse 5)
    const multiPageRows = [...scenario1Rows];
    for (let i = 1; i <= 55; i += 1) {
      const cat = categories[i % categories.length];
      const isStressRow = i === 1;
      multiPageRows.push({
        project_id: 'p1',
        item_id: `mp-${i}`,
        item_name: isStressRow
          ? 'Optix RTN 320F OAU 2F DC อุปกรณ์ไมโครเวฟรุ่นพิเศษสำหรับติดตั้งสถานีฐานความถี่สูง 18GHz พร้อมชุดยึดเสาและสายนำสัญญาณครบชุด'
          : `อุปกรณ์สื่อสารรุ่นทดสอบที่ ${String(i).padStart(2, '0')} (Multi-page Item)`,
        project_name: 'DOPA-DTRS | USO-SHF',
        unit: isStressRow ? 'ชุดอุปกรณ์' : (i % 2 === 0 ? 'ชิ้น' : 'เมตร'),
        total_in: isStressRow ? 1234567 : 100 + i * 10,
        total_out: isStressRow ? 987654 : i * 3,
        balance: isStressRow ? 246913 : 100 + i * 7,
        items: { category_id: cat.id, categories: cat },
        projects: projects[0],
      });
    }
    for (let i = 1; i <= 20; i += 1) {
      multiPageRows.push({
        project_id: 'p5',
        item_id: `mp-w5-${i}`,
        item_name: `อุปกรณ์ตึกโรงรับจำนำรายการที่ ${String(i).padStart(2, '0')}`,
        project_name: 'DOPA-DTRS | USO-SHF',
        unit: 'ชิ้น',
        total_in: 20,
        total_out: 5,
        balance: 15,
        items: { category_id: 'c1', categories: categories[0] },
        projects: projects[4],
      });
    }

    const el2 = React.createElement(InventoryBalanceReportPDF, {
      data: multiPageRows,
      projects,
      categories,
      logoSrc,
    });
    const buf2 = await renderToBuffer(el2);
    assert(buf2.subarray(0, 5).toString('latin1') === '%PDF-', 'Scenario 2 must produce valid PDF header');
    const pages2 = countPdfPages(buf2);
    assert(pages2 > 6, `Scenario 2 multi-page dataset must exceed 6 pages (got ${pages2})`);
    assert(buf2.toString('latin1').includes('THSarabunNew'), 'Scenario 2 PDF must embed THSarabunNew Thai font');

    const { pages: pages2Layout, pageTexts: pageTexts2 } = await inspectLayout(pdf, layoutFn, Font, el2);
    assertNoProjectColumnOrDuplicatedWarehouse(pageTexts2, pages2Layout, 'Scenario 2');
    // Every non-Grand-Total page must repeat a warehouse banner and the 6-column table header
    for (let p = 0; p < pageTexts2.length - 1; p += 1) {
      assert(
        /คลังที่ [1-5]\/5: /.test(pageTexts2[p]),
        `Scenario 2 page ${p + 1} must render a warehouse banner`
      );
      for (const colHeader of EXPECTED_HEADERS) {
        assert(
          pageTexts2[p].includes(colHeader),
          `Scenario 2 page ${p + 1} must repeat column header ${colHeader}`
        );
      }
    }
    // Warehouse 1 continuation page (page 2) must repeat Warehouse 1 banner
    assert(pageTexts2[1].includes('คลังที่ 1/5: คลัง EMS (SAP)'), 'Warehouse 1 continuation page must repeat warehouse banner');
    // Confirm no data rows split across pages: total rendered 6-col data rows must equal mapped item count (81)
    const renderedDataRows2 = pages2Layout.slice(0, -1).flatMap((page) =>
      findNodes(
        page,
        (n) =>
          n.type === 'VIEW' &&
          Array.isArray(n.children) &&
          n.children.length === 6 &&
          /^\d+$/.test(extractNodeText(n.children[0]).trim()) &&
          extractNodeText(n.children[3]).trim().startsWith('+')
      )
    );
    assert.equal(
      renderedDataRows2.length,
      81,
      `Scenario 2 must render exact 81 intact data rows without splitting across pages (got ${renderedDataRows2.length})`
    );
    const lastPage2 = pageTexts2[pageTexts2.length - 1];
    assert(lastPage2.includes('Grand Total Summary'), 'Scenario 2 final page must be Grand Total Summary');
    assert(!lastPage2.includes('คลังที่ 5/5'), 'Scenario 2 Grand Total page must NOT repeat Warehouse 5 banner');
    console.log(`✓ PASS Scenario 2 (multi-page dataset + long Thai name + large numbers + Warehouse 5 overflow): ${buf2.length} bytes, ${pages2} pages`);

    // Scenario 3: Completely empty dataset (all 5 warehouses × 6 categories empty + Grand Total page)
    const el3 = React.createElement(InventoryBalanceReportPDF, {
      data: [],
      projects,
      categories,
      logoSrc,
    });
    const buf3 = await renderToBuffer(el3);
    assert(buf3.subarray(0, 5).toString('latin1') === '%PDF-', 'Scenario 3 must produce valid PDF header');
    const pages3 = countPdfPages(buf3);
    assert.equal(pages3, 6, `Scenario 3 empty dataset must render exact 6 pages (5 warehouses + Grand Total, got ${pages3})`);
    const { pages: pages3Layout, pageTexts: pageTexts3 } = await inspectLayout(pdf, layoutFn, Font, el3);
    assertNoProjectColumnOrDuplicatedWarehouse(pageTexts3, pages3Layout, 'Scenario 3');
    console.log(`✓ PASS Scenario 3 (empty dataset): ${buf3.length} bytes, ${pages3} pages`);

    console.log('\nAll InventoryBalanceReportPDF real render checks PASSED!');
  } finally {
    await vite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
