import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BALANCE_REPORT_WAREHOUSES,
  BALANCE_REPORT_CATEGORIES,
  formatReportQuantity,
  resolveCanonicalWarehouseKey,
  resolveCanonicalCategoryKey,
  buildInventoryBalanceReportData,
} from './balanceReportPdfData.js';

describe('balanceReportPdfData', () => {
  it('defines the exact 5 canonical warehouses in required order', () => {
    assert.deepEqual(
      BALANCE_REPORT_WAREHOUSES.map((w) => w.key),
      ['ems_sap', 'ems', 'forth_3', 'factory_c', 'pawnshop']
    );
    assert.deepEqual(
      BALANCE_REPORT_WAREHOUSES.map((w) => w.label),
      ['คลัง EMS (SAP)', 'คลัง EMS', 'คลัง Forth ชั้น 3', 'คลัง Factory C', 'ตึกโรงรับจำนำ']
    );
  });

  it('defines the exact 6 canonical categories in required order', () => {
    assert.deepEqual(
      BALANCE_REPORT_CATEGORIES.map((c) => c.key),
      ['mw', 'bs', 'agw', 'fixed_radio', 'equipment_set', 'others']
    );
    assert.deepEqual(
      BALANCE_REPORT_CATEGORIES.map((c) => c.label),
      [
        'MW (Microwave)',
        'BS (Base Station)',
        'AGW (Analog Gateway)',
        'ลูกข่าย (Fixed Radio)',
        'ชุดอุปกรณ์รวม (Combined Equipment Set)',
        'อื่นๆ (Others)',
      ]
    );
  });

  it('distinguishes EMS (SAP) strictly from EMS and matches all 5 warehouses', () => {
    const projectsById = new Map([
      ['p-ems-sap', { id: 'p-ems-sap', name: 'DOPA-DTRS | USO-SHF', location: 'คลัง EMS (SAP)' }],
      ['p-ems', { id: 'p-ems', name: 'DOPA-DTRS | USO-SHF', location: 'คลัง EMS' }],
      ['p-forth', { id: 'p-forth', name: 'DOPA-DTRS | USO-SHF', location: 'คลัง Forth ชั้น 3' }],
      ['p-factory', { id: 'p-factory', name: 'DOPA-DTRS | USO-SHF', location: 'คลัง Factory C' }],
      ['p-pawn', { id: 'p-pawn', name: 'DOPA-DTRS | USO-SHF', location: 'ตึกโรงรับจำนำ' }],
      ['p-other', { id: 'p-other', name: 'Site Survey', location: 'คลังชั่วคราวเชียงใหม่' }],
    ]);

    assert.equal(resolveCanonicalWarehouseKey({ project_id: 'p-ems-sap' }, projectsById), 'ems_sap');
    assert.equal(resolveCanonicalWarehouseKey({ project_id: 'p-ems' }, projectsById), 'ems');
    assert.equal(resolveCanonicalWarehouseKey({ project_id: 'p-forth' }, projectsById), 'forth_3');
    assert.equal(resolveCanonicalWarehouseKey({ project_id: 'p-factory' }, projectsById), 'factory_c');
    assert.equal(resolveCanonicalWarehouseKey({ project_id: 'p-pawn' }, projectsById), 'pawnshop');
    assert.equal(resolveCanonicalWarehouseKey({ project_id: 'p-other' }, projectsById), null);

    // English and alternate variants
    assert.equal(resolveCanonicalWarehouseKey({ projects: { location: 'EMS SAP Warehouse' } }), 'ems_sap');
    assert.equal(resolveCanonicalWarehouseKey({ projects: { location: 'FORTH EMS2 (TAOBIN)' } }), 'ems');
    assert.equal(resolveCanonicalWarehouseKey({ projects: { location: 'Forth 3rd Floor' } }), 'forth_3');
    assert.equal(resolveCanonicalWarehouseKey({ projects: { location: 'โรงงาน C' } }), 'factory_c');
    assert.equal(resolveCanonicalWarehouseKey({ projects: { location: 'Pawnshop Building' } }), 'pawnshop');

    // Regression: avoid substring false positives ("Systems"/"Items"/"Modems" != EMS, bare "Forth" != Forth 3rd Floor)
    assert.equal(
      resolveCanonicalWarehouseKey({ projects: { name: 'Telecom Systems Project', location: 'คลังชั่วคราว' } }),
      null
    );
    assert.equal(
      resolveCanonicalWarehouseKey({ projects: { name: 'Modems & Items', location: 'คลังภาคสนาม' } }),
      null
    );
    assert.equal(
      resolveCanonicalWarehouseKey({ projects: { name: 'Forth DOPA', location: 'คลังชั่วคราว' } }),
      null
    );
    // Regression: "Forth Factory C" and "ตึก Forth (โรงรับจำนำ)" must match Factory C / Pawnshop, not Forth 3rd Floor
    assert.equal(
      resolveCanonicalWarehouseKey({ projects: { location: 'Forth Factory C' } }),
      'factory_c'
    );
    assert.equal(
      resolveCanonicalWarehouseKey({ projects: { location: 'ตึก Forth (โรงรับจำนำ)' } }),
      'pawnshop'
    );
  });

  it('resolves all 6 categories by name, lookup map, and known UUID, falling back to others', () => {
    const categoriesById = new Map([
      ['cat-mw', { id: 'cat-mw', name: 'MW (Microwave)' }],
      ['cat-bs', { id: 'cat-bs', name: 'BS (Base Station)' }],
      ['cat-agw', { id: 'cat-agw', name: 'AGW (Analog Gateway)' }],
      ['cat-fixed', { id: 'cat-fixed', name: 'Fixed Radio (ลูกข่ายประจำที่)' }],
      ['cat-set', { id: 'cat-set', name: 'ชุดอุปกรณ์รวม (Equipment Set)' }],
      ['cat-unknown', { id: 'cat-unknown', name: 'วัสดุสำนักงานทั่วไป' }],
    ]);

    assert.equal(resolveCanonicalCategoryKey({ items: { category_id: 'cat-mw' } }, categoriesById), 'mw');
    assert.equal(resolveCanonicalCategoryKey({ items: { category_id: 'cat-bs' } }, categoriesById), 'bs');
    assert.equal(resolveCanonicalCategoryKey({ items: { category_id: 'cat-agw' } }, categoriesById), 'agw');
    assert.equal(resolveCanonicalCategoryKey({ items: { category_id: 'cat-fixed' } }, categoriesById), 'fixed_radio');
    assert.equal(resolveCanonicalCategoryKey({ items: { category_id: 'cat-set' } }, categoriesById), 'equipment_set');
    assert.equal(resolveCanonicalCategoryKey({ items: { category_id: 'cat-unknown' } }, categoriesById), 'others');
    assert.equal(resolveCanonicalCategoryKey({ items: { category_id: null } }, categoriesById), 'others');

    // Embedded categories join without lookup map
    assert.equal(
      resolveCanonicalCategoryKey({ items: { categories: { name: 'ชุดอุปกรณ์รวม (Combined Equipment Set)' } } }),
      'equipment_set'
    );
    // Known BOM UUID fallback when category name is absent
    assert.equal(
      resolveCanonicalCategoryKey({ items: { category_id: '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba' } }),
      'mw'
    );
    // Parity with SiteKitCategoryCard heuristics
    assert.equal(
      resolveCanonicalCategoryKey({ items: { categories: { name: 'อุปกรณ์รวม' } } }),
      'equipment_set'
    );
    assert.equal(
      resolveCanonicalCategoryKey({ items: { categories: { name: 'Gateway' } } }),
      'agw'
    );
  });

  it('always emits all 5 warehouses × 6 categories even when dataset is empty', () => {
    const report = buildInventoryBalanceReportData([]);
    assert.equal(report.warehouses.length, 5);
    for (const wh of report.warehouses) {
      assert.equal(wh.categories.length, 6);
      assert.equal(wh.subtotal.itemCount, 0);
      assert.equal(wh.subtotal.balance, 0);
      for (const cat of wh.categories) {
        assert.equal(cat.items.length, 0);
        assert.equal(cat.subtotal.itemCount, 0);
      }
    }
    assert.equal(report.grandTotal.itemCount, 0);
    assert.equal(report.grandTotal.balance, 0);
    assert.equal(report.unmappedWarehouseCount, 0);
  });

  it('aggregates multi-warehouse multi-category data, preserves empty warehouse/category, and tracks unmapped warehouses separately', () => {
    const projects = [
      { id: 'p1', name: 'DOPA', location: 'คลัง EMS (SAP)' },
      { id: 'p2', name: 'DOPA', location: 'คลัง EMS' },
      { id: 'p3', name: 'DOPA', location: 'คลัง Forth ชั้น 3' },
      { id: 'p4', name: 'DOPA', location: 'คลัง Factory C' },
      { id: 'p5', name: 'DOPA', location: 'ตึกโรงรับจำนำ' },
      { id: 'p6', name: 'Temp Site', location: 'คลังภาคสนามพิเศษ' },
    ];

    const categories = [
      { id: 'c1', name: 'MW (Microwave)' },
      { id: 'c2', name: 'BS (Base Station)' },
      { id: 'c3', name: 'AGW (Analog Gateway)' },
      { id: 'c4', name: 'Fixed Radio (ลูกข่ายประจำที่)' },
      { id: 'c5', name: 'ชุดอุปกรณ์รวม (Equipment Set)' },
      { id: 'c6', name: 'อื่นๆ' },
    ];

    // Warehouse 4 (Factory C) intentionally has NO rows (empty warehouse)
    // Warehouse 1 (EMS SAP) has MW + unmapped category -> others, leaving BS/AGW/Fixed/EQSET empty
    const rows = [
      {
        project_id: 'p1',
        item_id: 'i1',
        item_name: 'Microwave ODU High',
        project_name: 'DOPA',
        unit: 'ชิ้น',
        total_in: 1200,
        total_out: 200,
        balance: 1000,
        items: { category_id: 'c1' },
      },
      {
        project_id: 'p1',
        item_id: 'i2',
        item_name: 'สายรัดเคเบิล',
        project_name: 'DOPA',
        unit: 'แพ็ค',
        total_in: 50,
        total_out: 50,
        balance: 0,
        items: { category_id: null }, // falls back to others
      },
      {
        project_id: 'p2',
        item_id: 'i3',
        item_name: 'TETRA Base Station',
        project_name: 'DOPA',
        unit: 'ชุด',
        total_in: 15,
        total_out: 5,
        balance: 10,
        items: { category_id: 'c2' },
      },
      {
        project_id: 'p3',
        item_id: 'i4',
        item_name: 'Analog Gateway Card',
        project_name: 'DOPA',
        unit: 'ชิ้น',
        total_in: 40,
        total_out: 10,
        balance: 30,
        items: { category_id: 'c3' },
      },
      {
        project_id: 'p3',
        item_id: 'i5',
        item_name: 'MT680 Fixed Radio',
        project_name: 'DOPA',
        unit: 'เครื่อง',
        total_in: 25,
        total_out: 5,
        balance: 20,
        items: { category_id: 'c4' },
      },
      {
        project_id: 'p5',
        item_id: 'i6',
        item_name: 'Dummy Load Set',
        project_name: 'DOPA',
        unit: 'ชุด',
        total_in: 10,
        total_out: 2,
        balance: 8,
        items: { category_id: 'c5' },
      },
      {
        project_id: 'p6', // unmapped warehouse
        item_id: 'i7',
        item_name: 'Temporary Cable',
        project_name: 'Temp Site',
        unit: 'เมตร',
        total_in: 500,
        total_out: 0,
        balance: 500,
        items: { category_id: 'c6' },
      },
    ];

    const report = buildInventoryBalanceReportData(rows, { projects, categories });

    // Exact 5 warehouses preserved (no 6th warehouse created for p6)
    assert.equal(report.warehouses.length, 5);
    assert.equal(report.unmappedWarehouseCount, 1);
    assert.equal(report.unmappedWarehouseRows[0].item_id, 'i7');

    // Warehouse 1: EMS (SAP)
    const wh1 = report.warehouses[0];
    assert.equal(wh1.key, 'ems_sap');
    assert.equal(wh1.categories[0].key, 'mw');
    assert.equal(wh1.categories[0].items.length, 1);
    assert.equal(wh1.categories[0].subtotal.balance, 1000);
    assert.equal(wh1.categories[1].items.length, 0); // empty category BS
    assert.equal(wh1.categories[5].key, 'others');
    assert.equal(wh1.categories[5].items.length, 1); // null category fell back to others
    assert.equal(wh1.subtotal.itemCount, 2);
    assert.equal(wh1.subtotal.totalIn, 1250);
    assert.equal(wh1.subtotal.totalOut, 250);
    assert.equal(wh1.subtotal.balance, 1000);
    assert.equal(wh1.subtotal.zeroStockCount, 1);

    // Warehouse 4: Factory C (empty warehouse)
    const wh4 = report.warehouses[3];
    assert.equal(wh4.key, 'factory_c');
    assert.equal(wh4.subtotal.itemCount, 0);
    assert.equal(wh4.subtotal.balance, 0);
    assert.equal(wh4.categories.length, 6);

    // Grand total sums only the 5 canonical warehouses
    assert.equal(report.grandTotal.itemCount, 6);
    assert.equal(report.grandTotal.totalIn, 1250 + 15 + 65 + 0 + 10);
    assert.equal(report.grandTotal.totalOut, 250 + 5 + 15 + 0 + 2);
    assert.equal(report.grandTotal.balance, 1000 + 10 + 50 + 0 + 8);
    assert.equal(report.grandTotal.zeroStockCount, 1);
  });

  it('formats quantities with thousand separators and no hardcoded unit', () => {
    assert.equal(formatReportQuantity(0), '0');
    assert.equal(formatReportQuantity(1250), '1,250');
    assert.equal(formatReportQuantity(1000000), '1,000,000');
    assert.equal(formatReportQuantity(null), '0');
    assert.equal(formatReportQuantity(undefined), '0');
    assert.equal(formatReportQuantity('bad'), '0');
    assert.equal(formatReportQuantity(42).includes('ชิ้น'), false);
  });
});
