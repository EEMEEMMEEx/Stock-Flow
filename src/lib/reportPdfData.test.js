import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REPORT_WAREHOUSES,
  REPORT_CATEGORIES,
  formatReportDate,
  resolveCanonicalCategoryKey,
  buildItemsByNameMap,
  buildGoodsReceiptReportData,
  buildGoodsIssueReportData,
  buildSiteKitsReportData,
  calculateSiteKitShortage,
} from './reportPdfData.js';

const SAMPLE_PROJECTS = [
  { id: 'p1', name: 'DOPA-DTRS', location: 'คลัง EMS (SAP)' },
  { id: 'p2', name: 'DOPA-DTRS', location: 'คลัง EMS' },
  { id: 'p3', name: 'DOPA-DTRS', location: 'คลัง Forth ชั้น 3' },
  { id: 'p4', name: 'DOPA-DTRS', location: 'คลัง Factory C' },
  { id: 'p5', name: 'DOPA-DTRS', location: 'ตึกโรงรับจำนำ' },
  { id: 'p6', name: 'Temp Site', location: 'คลังชั่วคราวเชียงใหม่' },
];

const SAMPLE_CATEGORIES = [
  { id: 'c1', name: 'MW (Microwave)' },
  { id: 'c2', name: 'BS (Base Station)' },
  { id: 'c3', name: 'AGW (Analog Gateway)' },
  { id: 'c4', name: 'Fixed Radio (ลูกข่ายประจำที่)' },
  { id: 'c5', name: 'ชุดอุปกรณ์รวม (Equipment Set)' },
  { id: 'c6', name: 'อื่นๆ' },
];

describe('reportPdfData (shared builders for Reports #1, #2, #4)', () => {
  it('formats Thai Buddhist Era short dates safely', () => {
    assert.equal(formatReportDate('2026-03-05'), '05/03/2569');
    assert.equal(formatReportDate('2026-11-21T09:30:00Z').endsWith('/2569'), true);
    assert.equal(formatReportDate(''), '-');
    assert.equal(formatReportDate(null), '-');
    assert.equal(formatReportDate('invalid-date'), 'invalid-date');
  });

  it('resolves category via itemsByName fallback for checkout_consumed rows', () => {
    const itemsByName = buildItemsByNameMap([
      { name: 'MT680 Plus Fixed Radio', category_id: 'c4', categories: { id: 'c4', name: 'Fixed Radio' } },
    ]);
    assert.equal(
      resolveCanonicalCategoryKey({ items: { name: 'MT680 Plus Fixed Radio' } }, null, itemsByName),
      'fixed_radio'
    );
    assert.equal(
      resolveCanonicalCategoryKey({ items: { name: 'Unknown Consumable' } }, null, itemsByName),
      'others'
    );
  });

  it('Report #1 (Goods Receipt): always emits 5 warehouses × 6 categories when empty', () => {
    const report = buildGoodsReceiptReportData([]);
    assert.equal(report.warehouses.length, REPORT_WAREHOUSES.length);
    for (const wh of report.warehouses) {
      assert.equal(wh.categories.length, REPORT_CATEGORIES.length);
      assert.equal(wh.subtotal.itemCount, 0);
      assert.equal(wh.subtotal.totalQty, 0);
    }
    assert.equal(report.grandTotal.itemCount, 0);
    assert.equal(report.grandTotal.totalQty, 0);
    assert.equal(report.grandTotal.activeWarehouseCount, 0);
  });

  it('Report #1 (Goods Receipt): aggregates multi-warehouse data, preserves empty warehouse/category, and tracks unmapped', () => {
    const rows = [
      {
        id: 'si-1',
        order_id: 'ord-001',
        project_id: 'p1',
        received_date: '2026-11-10',
        po_number: 'PO-2026-001',
        supplier: 'Huawei Tech',
        quantity: 120,
        items: { name: 'Optix RTN 320F', unit: 'ชิ้น', category_id: 'c1' },
      },
      {
        id: 'si-2',
        order_id: 'ord-002',
        project_id: 'p1',
        received_date: '2026-11-12',
        po_number: '',
        supplier: 'Local Cable Co.',
        quantity: 30,
        items: { name: 'สายรัดเคเบิล', unit: 'แพ็ค', category_id: null }, // falls back to others
      },
      {
        id: 'si-3',
        order_id: 'ord-003',
        project_id: 'p2',
        received_date: '2026-11-15',
        po_number: 'PO-2026-003',
        supplier: 'Huawei Tech',
        quantity: 10,
        items: { name: 'TETRA DIB-R5', unit: 'ชุด', category_id: 'c2' },
      },
      // p4 (Factory C) intentionally empty
      {
        id: 'si-unmapped',
        order_id: 'ord-999',
        project_id: 'p6',
        received_date: '2026-11-18',
        po_number: 'PO-TEMP',
        supplier: 'Field Supplier',
        quantity: 50,
        items: { name: 'Temp Cable', unit: 'เมตร', category_id: 'c6' },
      },
    ];

    const report = buildGoodsReceiptReportData(rows, {
      projects: SAMPLE_PROJECTS,
      categories: SAMPLE_CATEGORIES,
    });

    assert.equal(report.warehouses.length, 5);
    assert.equal(report.unmappedWarehouseCount, 1);

    const wh1 = report.warehouses[0];
    assert.equal(wh1.subtotal.itemCount, 2);
    assert.equal(wh1.subtotal.totalQty, 150);
    assert.equal(wh1.subtotal.documentCount, 2);
    assert.equal(wh1.categories[0].items.length, 1);
    assert.equal(wh1.categories[1].items.length, 0); // empty BS category
    assert.equal(wh1.categories[5].items.length, 1); // null category fell back to others
    assert.equal(wh1.categories[5].items[0].documentNumber, 'SI-ORD-002');

    // Factory C empty
    assert.equal(report.warehouses[3].subtotal.itemCount, 0);

    // Grand total excludes unmapped p6
    assert.equal(report.grandTotal.itemCount, 3);
    assert.equal(report.grandTotal.totalQty, 160);
    assert.equal(report.grandTotal.documentCount, 3);
    assert.equal(report.grandTotal.supplierCount, 2);
    assert.equal(report.grandTotal.activeWarehouseCount, 2);
  });

  it('Report #2 (Goods Issue): handles multi-warehouse lines, checkout_consumed rows, and shortages', () => {
    const itemsByName = buildItemsByNameMap([
      { name: 'MT680 Plus Fixed Radio', category_id: 'c4' },
    ]);
    const rows = [
      {
        id: 'wi-1',
        order_id: 'wo-111',
        work_order_no: 'WO-2026-0101',
        project_id: 'p1',
        source_project_id: 'p3', // pulled from Forth 3rd Floor instead of order's p1
        requested_at: '2026-11-15T10:00:00Z',
        status: 'approved',
        quantity: 20,
        deducted_quantity: 15,
        shortage_quantity: 5,
        profiles: { full_name: 'สมชาย ใจดี' },
        items: { name: 'Analog Gateway SC266', unit: 'ชิ้น', category_id: 'c3' },
        source: 'withdrawal',
      },
      {
        id: 'cl-1',
        project_id: 'p5',
        source_project_id: 'p5',
        requested_at: '2026-11-16T11:00:00Z',
        status: 'completed',
        quantity: 4,
        deducted_quantity: 4,
        shortage_quantity: 0,
        profiles: { full_name: 'สมหญิง ช่างเทคนิค' },
        items: { name: 'MT680 Plus Fixed Radio', unit: 'เครื่อง' },
        source: 'checkout_consumed',
        reference: 'CO-2026-0042',
      },
      {
        id: 'wi-unmapped',
        order_id: 'wo-999',
        project_id: 'p6',
        requested_at: '2026-11-17T12:00:00Z',
        status: 'completed',
        quantity: 10,
        deducted_quantity: 10,
        profiles: { full_name: 'Temp User' },
        items: { name: 'Temp Item', unit: 'ชิ้น', category_id: 'c6' },
      },
    ];

    const report = buildGoodsIssueReportData(rows, {
      projects: SAMPLE_PROJECTS,
      categories: SAMPLE_CATEGORIES,
      itemsByName,
    });

    assert.equal(report.warehouses.length, 5);
    assert.equal(report.unmappedWarehouseCount, 1);

    // Line 1 attributed to Forth 3rd Floor (index 2), AGW (index 2)
    const wh3 = report.warehouses[2];
    assert.equal(wh3.key, 'forth_3');
    assert.equal(wh3.categories[2].key, 'agw');
    assert.equal(wh3.categories[2].items.length, 1);
    assert.equal(wh3.categories[2].items[0].documentNumber, 'WO-2026-0101');
    assert.equal(wh3.subtotal.requestedQty, 20);
    assert.equal(wh3.subtotal.deductedQty, 15);
    assert.equal(wh3.subtotal.shortageQty, 5);

    // Line 2 attributed to Pawnshop (index 4), Fixed Radio (index 3) via itemsByName
    const wh5 = report.warehouses[4];
    assert.equal(wh5.categories[3].key, 'fixed_radio');
    assert.equal(wh5.categories[3].items.length, 1);
    assert.equal(wh5.categories[3].items[0].documentNumber, 'CO-2026-0042');

    // Empty warehouses (p1, p2, p4) preserved
    assert.equal(report.warehouses[0].subtotal.itemCount, 0);
    assert.equal(report.warehouses[3].subtotal.itemCount, 0);

    // Grand total
    assert.equal(report.grandTotal.itemCount, 2);
    assert.equal(report.grandTotal.requestedQty, 24);
    assert.equal(report.grandTotal.deductedQty, 19);
    assert.equal(report.grandTotal.shortageQty, 5);
    assert.equal(report.grandTotal.documentCount, 2);
  });

  it('Report #4 (Site Kits): always emits all 6 canonical categories and computes readiness totals', () => {
    const emptyReport = buildSiteKitsReportData([]);
    assert.equal(emptyReport.categories.length, 6);
    assert.equal(emptyReport.grandTotal.itemCount, 0);
    assert.equal(emptyReport.grandTotal.totalCompleteSets, 0);

    const sampleSiteKits = [
      {
        category_id: '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba',
        category_name: 'MW (Microwave)',
        complete_sets: 3,
        items: [
          {
            id: 'b1',
            po_seq: 1,
            part_number: '30207-0024-04484',
            bom_name: 'Optix RTN 320F',
            qty_per_site: 1,
            unit: 'ชิ้น',
            total_stock: 10,
            sets_possible: 10,
            missing_for_next_set: 0,
            is_mandatory: true,
          },
          {
            id: 'b2',
            po_seq: 2,
            part_number: '30207-0024-04488',
            bom_name: 'Microwave ODU High',
            qty_per_site: 2,
            unit: 'ชิ้น',
            total_stock: 6,
            sets_possible: 3,
            missing_for_next_set: 2,
            is_mandatory: true,
          },
        ],
      },
      {
        category_id: '793d55c3-4750-42e1-a82e-438e7be131c8',
        category_name: 'BS (Base Station)',
        complete_sets: 0,
        items: [
          {
            id: 'b3',
            po_seq: 1,
            part_number: '30207-0024-01718',
            bom_name: 'TETRA DIB-R5',
            qty_per_site: 1,
            unit: 'ชิ้น',
            total_stock: 0,
            sets_possible: 0,
            missing_for_next_set: 1,
            is_mandatory: true,
          },
        ],
      },
    ];

    const report = buildSiteKitsReportData(sampleSiteKits);
    assert.equal(report.categories.length, 6);
    assert.equal(report.categories[0].key, 'mw');
    assert.equal(report.categories[0].subtotal.completeSets, 3);
    assert.equal(report.categories[0].subtotal.readyCount, 1);
    assert.equal(report.categories[0].subtotal.limitingCount, 1);
    assert.equal(report.categories[1].key, 'bs');
    assert.equal(report.categories[1].subtotal.outOfStockCount, 1);
    assert.equal(report.categories[5].key, 'others');
    assert.equal(report.categories[5].items.length, 0); // empty category preserved

    assert.equal(report.grandTotal.itemCount, 3);
    assert.equal(report.grandTotal.totalCompleteSets, 3);
    assert.equal(report.grandTotal.totalStock, 16);
    assert.equal(report.grandTotal.readyCount, 1);
    assert.equal(report.grandTotal.limitingCount, 1);
    assert.equal(report.grandTotal.outOfStockCount, 1);
    assert.equal(report.grandTotal.activeCategoryCount, 2);
  });

  it('Report #2 (Goods Issue): does not inflate shortageQty for pending or rejected orders with null columns', () => {
    const rows = [
      {
        id: 'wi-pending',
        order_id: 'wo-p1',
        work_order_no: 'WO-PEND-01',
        project_id: 'p1',
        requested_at: '2026-11-20T09:00:00Z',
        status: 'pending',
        quantity: 50,
        deducted_quantity: null,
        shortage_quantity: null,
        profiles: { full_name: 'ผู้เบิกทดสอบ' },
        items: { name: 'Optix RTN 320F', unit: 'ชิ้น', category_id: 'c1' },
      },
      {
        id: 'wi-rejected',
        order_id: 'wo-r1',
        work_order_no: 'WO-REJ-01',
        project_id: 'p1',
        requested_at: '2026-11-20T10:00:00Z',
        status: 'rejected',
        quantity: 30,
        deducted_quantity: null,
        shortage_quantity: null,
        profiles: { full_name: 'ผู้เบิกทดสอบ' },
        items: { name: 'TETRA DIB-R5', unit: 'ชุด', category_id: 'c2' },
      },
    ];

    const report = buildGoodsIssueReportData(rows, {
      projects: SAMPLE_PROJECTS,
      categories: SAMPLE_CATEGORIES,
    });
    assert.equal(report.grandTotal.requestedQty, 80);
    assert.equal(report.grandTotal.deductedQty, 0);
    assert.equal(report.grandTotal.shortageQty, 0);
  });

  it('Report #4 (Site Kits): empty custom category mapped to others does not zero out completeSets', () => {
    const report = buildSiteKitsReportData([
      {
        category_id: 'custom-a',
        category_name: 'หมวดพิเศษ A',
        complete_sets: 3,
        items: [
          {
            id: 'ca-1',
            po_seq: 1,
            part_number: 'P-1',
            bom_name: 'อุปกรณ์พิเศษ A',
            qty_per_site: 1,
            unit: 'ชิ้น',
            total_stock: 3,
            sets_possible: 3,
            missing_for_next_set: 1,
            is_mandatory: true,
          },
        ],
      },
      {
        category_id: 'custom-b',
        category_name: 'หมวดพิเศษ B',
        complete_sets: 0,
        items: [],
      },
    ]);

    const others = report.categories.find((c) => c.key === 'others');
    assert.equal(others.subtotal.itemCount, 1);
    assert.equal(others.subtotal.completeSets, 3);
    assert.equal(report.grandTotal.totalCompleteSets, 3);
  });

  it('Report #4 (Site Kits): calculates shortage against 1 minimum set (0 when >= 1 set is ready) while preserving limiting status', () => {
    assert.equal(calculateSiteKitShortage({ qtyPerSite: 1, totalStock: 2, isMandatory: true }), 0);
    assert.equal(calculateSiteKitShortage({ qtyPerSite: 2, totalStock: 4, isMandatory: true }), 0);
    assert.equal(calculateSiteKitShortage({ qtyPerSite: 2, totalStock: 1, isMandatory: true }), 1);
    assert.equal(calculateSiteKitShortage({ qtyPerSite: 1, totalStock: 0, isMandatory: true }), 1);
    assert.equal(calculateSiteKitShortage({ qtyPerSite: 1, totalStock: 0, isMandatory: false }), 0);

    const report = buildSiteKitsReportData([
      {
        category_id: '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba',
        category_name: 'MW (Microwave)',
        complete_sets: 2,
        items: [
          {
            id: 'mw-1',
            po_seq: 1,
            part_number: '30207-0024-04484',
            bom_name: 'Optix RTN 320F',
            qty_per_site: 1,
            unit: 'ชิ้น',
            total_stock: 2,
            sets_possible: 2,
            is_mandatory: true,
          },
          {
            id: 'mw-2',
            po_seq: 2,
            part_number: '30207-0024-04488',
            bom_name: 'Microwave ODU High',
            qty_per_site: 2,
            unit: 'ชิ้น',
            total_stock: 4,
            sets_possible: 2,
            is_mandatory: true,
          },
        ],
      },
      {
        category_id: '793d55c3-4750-42e1-a82e-438e7be131c8',
        category_name: 'BS (Base Station)',
        complete_sets: 0,
        items: [
          {
            id: 'bs-1',
            po_seq: 1,
            part_number: '30207-0024-01718',
            bom_name: 'TETRA DIB-R5',
            qty_per_site: 2,
            unit: 'ชิ้น',
            total_stock: 1,
            sets_possible: 0,
            is_mandatory: true,
          },
          {
            id: 'bs-2',
            po_seq: 2,
            part_number: '30207-0024-04302',
            bom_name: 'Battery 48V',
            qty_per_site: 1,
            unit: 'ลูก',
            total_stock: 0,
            sets_possible: 0,
            is_mandatory: true,
          },
          {
            id: 'bs-spare',
            po_seq: 3,
            part_number: 'SPARE-1',
            bom_name: 'Spare Unit',
            qty_per_site: 1,
            unit: 'ชิ้น',
            total_stock: 0,
            sets_possible: 0,
            is_mandatory: false,
          },
        ],
      },
    ]);

    const mw = report.categories.find((c) => c.key === 'mw');
    assert.equal(mw.subtotal.completeSets, 2);
    assert.equal(mw.subtotal.limitingCount, 2);
    assert.equal(mw.subtotal.totalMissing, 0);
    assert.equal(mw.items[0].missingForNextSet, 0);
    assert.equal(mw.items[0].status, 'limiting');
    assert.equal(mw.items[1].missingForNextSet, 0);
    assert.equal(mw.items[1].status, 'limiting');

    const bs = report.categories.find((c) => c.key === 'bs');
    assert.equal(bs.subtotal.completeSets, 0);
    assert.equal(bs.subtotal.totalMissing, 2);
    assert.equal(bs.items[0].missingForNextSet, 1);
    assert.equal(bs.items[0].status, 'limiting');
    assert.equal(bs.items[1].missingForNextSet, 1);
    assert.equal(bs.items[1].status, 'out_of_stock');
    assert.equal(bs.items[2].missingForNextSet, 0);

    assert.equal(report.grandTotal.totalMissing, 2);
  });
});
