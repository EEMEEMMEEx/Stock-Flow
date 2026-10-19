import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeSearchQuery, filterStockInOrders } from './stockInSearch.js';

const mockOrders = [
  {
    id: 'ord-001',
    project_id: 'proj-bkk',
    projects: { id: 'proj-bkk', name: 'คลังหลักสายไหม', project_code: 'BKK-WH' },
    profiles: { full_name: 'WATCHARA MANADEE' },
    supplier: 'Sinclair Technologies',
    po_number: 'PO-2026-001',
    notes: 'อุปกรณ์ติดตั้งสถานีฐาน',
    created_at: '2026-10-15T08:30:00Z',
    stock_in_items: [
      {
        id: 'item-101',
        name: 'TETRA DIB-R5 outdoor, 1 carrier',
        sku: '30207-0024-04412',
        model: 'DIB-R5',
        part_number: 'HYT-4412',
        serial_number: 'SN-998877',
        items: {
          name: 'TETRA DIB-R5 outdoor, 1 carrier',
          sku: '30207-0024-04412',
          model: 'DIB-R5',
          description: 'Outdoor base station 1 carrier complete set',
        },
      },
      {
        id: 'item-102',
        name: 'สายอากาศ SC-488-HF1LDF(D00)',
        sku: '30207-0011-09876',
        model: 'SC-488',
        items: {
          name: 'สายอากาศ SC-488-HF1LDF(D00)',
          sku: '30207-0011-09876',
          model: 'SC-488',
        },
      },
    ],
  },
  {
    id: 'ord-002',
    project_id: 'proj-cnx',
    projects: { id: 'proj-cnx', name: 'คลังเชียงใหม่', project_code: 'CNX-WH' },
    profiles: { full_name: 'sureerat.r' },
    supplier: 'Motorola Solutions',
    po_number: 'PO-2026-002',
    notes: 'วิทยุมือถือประจำการ',
    created_at: '2026-10-16T10:15:00Z',
    stock_in_items: [
      {
        id: 'item-201',
        name: 'วิทยุสื่อสาร TETRA MTP3550',
        sku: '30101-0005-01234',
        model: 'MTP3550',
        items: {
          name: 'วิทยุสื่อสาร TETRA MTP3550',
          sku: '30101-0005-01234',
          model: 'MTP3550',
          description: 'Handheld radio keypad GPS',
        },
      },
    ],
  },
  {
    id: 'ord-003',
    project_id: 'proj-bkk',
    projects: { id: 'proj-bkk', name: 'คลังหลักสายไหม', project_code: 'BKK-WH' },
    profiles: { full_name: 'System Administrator' },
    supplier: 'Cisco Systems',
    po_number: 'PO-2026-003',
    notes: 'Switch Core Network',
    created_at: '2026-10-18T14:00:00Z',
    stock_in_items: [
      {
        id: 'item-301',
        name: 'Catalyst 9300 48-port PoE+',
        sku: '30501-0099-05555',
        model: 'C9300-48P',
        items: {
          name: 'Catalyst 9300 48-port PoE+',
          sku: '30501-0099-05555',
          model: 'C9300-48P',
        },
      },
    ],
  },
];

test('TC-01: Search by SKU (Exact & Partial)', () => {
  // Exact SKU
  const res1 = filterStockInOrders(mockOrders, { search: '30207-0024-04412' });
  assert.equal(res1.length, 1);
  assert.equal(res1[0].id, 'ord-001');
  assert.ok(res1[0].matched_items_snippet.includes('TETRA DIB-R5'));

  // Partial SKU
  const res2 = filterStockInOrders(mockOrders, { search: '04412' });
  assert.equal(res2.length, 1);
  assert.equal(res2[0].id, 'ord-001');

  // Common prefix in 2 items in ord-001
  const res3 = filterStockInOrders(mockOrders, { search: '30207' });
  assert.equal(res3.length, 1);
  assert.equal(res3[0].id, 'ord-001');
});

test('TC-02: Search by Material Name (Thai & English)', () => {
  // Thai keyword
  const resThai = filterStockInOrders(mockOrders, { search: 'สายอากาศ' });
  assert.equal(resThai.length, 1);
  assert.equal(resThai[0].id, 'ord-001');
  assert.ok(resThai[0].matched_items_snippet.includes('สายอากาศ'));

  // English keyword
  const resEng = filterStockInOrders(mockOrders, { search: 'Catalyst' });
  assert.equal(resEng.length, 1);
  assert.equal(resEng[0].id, 'ord-003');
  assert.ok(resEng[0].matched_items_snippet.includes('Catalyst'));
});

test('TC-03: Phrase with Comma and Special Characters', () => {
  const query = 'TETRA DIB-R5 outdoor, 1 carrier';
  const res = filterStockInOrders(mockOrders, { search: query });
  assert.equal(res.length, 1);
  assert.equal(res[0].id, 'ord-001');
  assert.ok(res[0].matched_items_snippet.includes('TETRA DIB-R5'));
});

test('TC-04: Search by Receiver Name (ผู้รับพัสดุ)', () => {
  // Full Name
  const res1 = filterStockInOrders(mockOrders, { search: 'WATCHARA MANADEE' });
  assert.equal(res1.length, 1);
  assert.equal(res1[0].id, 'ord-001');

  // Username / Short name
  const res2 = filterStockInOrders(mockOrders, { search: 'sureerat' });
  assert.equal(res2.length, 1);
  assert.equal(res2[0].id, 'ord-002');

  // System Administrator
  const res3 = filterStockInOrders(mockOrders, { search: 'Administrator' });
  assert.equal(res3.length, 1);
  assert.equal(res3[0].id, 'ord-003');
});

test('TC-05: Multi-token Search in Any Order', () => {
  // Tokens from different places (Carrier + DIB-R5)
  const res1 = filterStockInOrders(mockOrders, { search: '1 carrier DIB-R5' });
  assert.equal(res1.length, 1);
  assert.equal(res1[0].id, 'ord-001');

  // Token in Header (PO) + Token in Line Item (SC-488)
  const res2 = filterStockInOrders(mockOrders, { search: 'PO-2026-001 SC-488' });
  assert.equal(res2.length, 1);
  assert.equal(res2[0].id, 'ord-001');
});

test('TC-06: Case-Insensitive Matching', () => {
  const rLower = filterStockInOrders(mockOrders, { search: 'tetra' });
  const rUpper = filterStockInOrders(mockOrders, { search: 'TETRA' });
  const rMixed = filterStockInOrders(mockOrders, { search: 'TeTrA' });

  assert.equal(rLower.length, 2); // ord-001 and ord-002 both have TETRA
  assert.equal(rUpper.length, 2);
  assert.equal(rMixed.length, 2);
});

test('TC-07: No Results / Empty State', () => {
  const res = filterStockInOrders(mockOrders, { search: 'non-existent-device-xyz-999' });
  assert.equal(res.length, 0);
  assert.ok(Array.isArray(res));
});

test('TC-08: Tokenizer Edge Cases & Unicode NFC', () => {
  const empty1 = tokenizeSearchQuery('');
  const empty2 = tokenizeSearchQuery('   ');
  const empty3 = tokenizeSearchQuery(null);
  assert.deepEqual(empty1, []);
  assert.deepEqual(empty2, []);
  assert.deepEqual(empty3, []);

  // Normalization & edge punctuation stripping
  const tokens = tokenizeSearchQuery('  "TETRA" ,DIB-R5.  outdoor,  ');
  assert.ok(tokens.includes('tetra'));
  assert.ok(tokens.includes('dib-r5'));
  assert.ok(tokens.includes('outdoor'));
});

test('TC-09: Combined Search + Warehouse / Project Filter', () => {
  // 'tetra' exists in both proj-bkk and proj-cnx
  const allTetra = filterStockInOrders(mockOrders, { search: 'tetra' });
  assert.equal(allTetra.length, 2);

  // Filter specifically to Chiang Mai warehouse
  const cnxTetra = filterStockInOrders(mockOrders, { search: 'tetra', projectId: 'proj-cnx' });
  assert.equal(cnxTetra.length, 1);
  assert.equal(cnxTetra[0].id, 'ord-002');
});

test('TC-10: SQL Injection & Wildcard Sanitization', () => {
  const dangerousQuery = "'; DROP TABLE stock_in_orders; -- % _ ' OR '1'='1";
  const res = filterStockInOrders(mockOrders, { search: dangerousQuery });
  // Should safely execute without throwing regex syntax error or corrupting data
  assert.ok(Array.isArray(res));
});
