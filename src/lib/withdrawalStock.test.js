import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_WAREHOUSES,
  buildCartKey,
  buildWarehouseMap,
  clampQuantity,
  getWarehouseBalance,
  getWarehouseLabel,
  getWarehouseTotal,
  getWarehousesForItem,
  hasResolvableWarehouse,
  pickDefaultWarehouse,
  resolveSourceWarehouse,
  resolveWarehouseName,
} from './withdrawalStock.js';

const balanceRow = (overrides = {}) => ({
  project_id: 'p1',
  item_id: 'i1',
  project_name: 'Warehouse A',
  balance: 5,
  ...overrides,
});

test('buildWarehouseMap keeps only warehouses with positive stock', () => {
  const map = buildWarehouseMap([
    balanceRow({ project_id: 'p1', balance: 5 }),
    balanceRow({ project_id: 'p2', balance: 0 }),
    balanceRow({ project_id: 'p3', balance: -3 }),
    balanceRow({ project_id: 'p4', balance: '7' }),
  ]);

  const warehouses = map.get('i1');
  assert.deepEqual(warehouses.map((w) => w.project_id), ['p4', 'p1']);
  assert.equal(warehouses[0].balance, 7);
});

test('buildWarehouseMap drops malformed rows instead of throwing', () => {
  const map = buildWarehouseMap([
    null,
    undefined,
    { item_id: 'i1' },
    { project_id: 'p1' },
    balanceRow({ balance: 'not-a-number' }),
    balanceRow({ balance: NaN }),
    balanceRow({ balance: '4', project_id: 'p9' }),
  ]);

  assert.deepEqual(map.get('i1').map((w) => w.project_id), ['p9']);
  assert.equal(map.get('missing'), undefined);
});

test('buildWarehouseMap sorts ties by warehouse name for deterministic output', () => {
  const map = buildWarehouseMap([
    balanceRow({ project_id: 'pB', project_name: 'Beta', balance: 4 }),
    balanceRow({ project_id: 'pA', project_name: 'Alpha', balance: 4 }),
    balanceRow({ project_id: 'pC', project_name: 'Gamma', balance: 9 }),
  ]);

  assert.deepEqual(map.get('i1').map((w) => w.project_name), ['Gamma', 'Alpha', 'Beta']);
});

test('buildWarehouseMap defaults a missing project name to an empty string', () => {
  const map = buildWarehouseMap([balanceRow({ project_name: undefined })]);
  assert.equal(map.get('i1')[0].project_name, '');
});

test('buildWarehouseMap labels each warehouse with its location, not the project name', () => {
  const labels = new Map([
    ['p1', 'คลัง Forth ชั้น 3'],
    ['p2', 'คลัง EMS'],
  ]);
  const map = buildWarehouseMap([
    balanceRow({ project_id: 'p1', project_name: 'DOPA-DTRS | USO-SHF', balance: 5 }),
    balanceRow({ project_id: 'p2', project_name: 'DOPA-DTRS | USO-SHF', balance: 9 }),
  ], labels);

  const warehouses = map.get('i1');
  assert.equal(warehouses[0].warehouse_name, 'คลัง EMS');
  assert.equal(warehouses[1].warehouse_name, 'คลัง Forth ชั้น 3');
  // project_name stays available for fallbacks / debugging
  assert.equal(warehouses[0].project_name, 'DOPA-DTRS | USO-SHF');
});

test('buildWarehouseMap falls back to the project name when no label is known', () => {
  const map = buildWarehouseMap([balanceRow({ project_name: 'DOPA-DTRS | USO-SHF' })], new Map());
  assert.equal(map.get('i1')[0].warehouse_name, 'DOPA-DTRS | USO-SHF');
});

test('getWarehouseLabel prefers the physical location and falls back to the name', () => {
  assert.equal(getWarehouseLabel({ name: 'DOPA-DTRS | USO-SHF', location: 'คลัง EMS' }), 'คลัง EMS');
  assert.equal(getWarehouseLabel({ name: 'DOPA-DTRS | USO-SHF', location: '   ' }), 'DOPA-DTRS | USO-SHF');
  assert.equal(getWarehouseLabel({ name: 'DOPA-DTRS | USO-SHF' }), 'DOPA-DTRS | USO-SHF');
  assert.equal(getWarehouseLabel({ location: 'คลัง EMS' }), 'คลัง EMS');
  assert.equal(getWarehouseLabel(null), null);
  assert.equal(getWarehouseLabel({}), null);
});

test('getWarehousesForItem returns [] for unknown or missing arguments', () => {
  const map = buildWarehouseMap([balanceRow()]);
  assert.equal(getWarehousesForItem(map, 'nope').length, 0);
  assert.equal(getWarehousesForItem(null, 'i1').length, 0);
  assert.equal(getWarehousesForItem(map, null).length, 0);
  assert.equal(getWarehousesForItem(map, 'i1').length, 1);
});

test('getWarehouseBalance returns the matching balance or 0', () => {
  const warehouses = [
    { project_id: 'p1', project_name: 'A', balance: 5 },
    { project_id: 'p2', project_name: 'B', balance: 2 },
  ];
  assert.equal(getWarehouseBalance(warehouses, 'p2'), 2);
  assert.equal(getWarehouseBalance(warehouses, 'pX'), 0);
  assert.equal(getWarehouseBalance(warehouses, null), 0);
  assert.equal(getWarehouseBalance([], 'p1'), 0);
});

test('getWarehouseTotal sums the supply across warehouses', () => {
  assert.equal(getWarehouseTotal([
    { balance: 5 },
    { balance: 2 },
    { balance: '3' },
  ]), 10);
  assert.equal(getWarehouseTotal([]), 0);
  assert.equal(getWarehouseTotal(undefined), 0);
});

test('ALL_WAREHOUSES is the sentinel used by the location selector', () => {
  assert.equal(ALL_WAREHOUSES, 'all');
});

test('resolveWarehouseName shows the location (warehouse), never the project name', () => {
  const projects = [
    { id: 'p1', name: 'DOPA-DTRS | USO-SHF', location: 'คลัง EMS (SAP)' },
    { id: 'p2', name: 'DOPA-DTRS | USO-SHF', location: 'คลัง EMS' },
  ];
  assert.equal(resolveWarehouseName({ project_id: 'p1' }, projects), 'คลัง EMS (SAP)');
  assert.equal(resolveWarehouseName({ project_id: 'p2' }, projects), 'คลัง EMS');
});

test('resolveWarehouseName prefers an embedded project join and uses its location', () => {
  assert.equal(resolveWarehouseName({ project_id: 'p1', projects: { name: 'DOPA', location: 'คลัง A' } }, []), 'คลัง A');
  assert.equal(resolveWarehouseName({ project_id: 'p1', items: { projects: { name: 'คลัง B' } } }, []), 'คลัง B');
});

test('resolveWarehouseName falls back to the project list', () => {
  const projects = [{ id: 'p1', name: 'คลัง A' }, { id: 'p2', name: 'คลัง B' }];
  assert.equal(resolveWarehouseName({ project_id: 'p2' }, projects), 'คลัง B');
  assert.equal(resolveWarehouseName({ project_id: 'pX' }, projects), null);
  assert.equal(resolveWarehouseName({}, projects), null);
  assert.equal(resolveWarehouseName(null, projects), null);
});

test('hasResolvableWarehouse is true only when a name can be resolved', () => {
  const projects = [{ id: 'p1', name: 'คลัง A' }];
  assert.equal(hasResolvableWarehouse([{ project_id: 'p1' }], projects), true);
  assert.equal(hasResolvableWarehouse([{ project_id: 'pX' }], projects), false);
  assert.equal(hasResolvableWarehouse([{ quantity: 1 }], projects), false);
  assert.equal(hasResolvableWarehouse([], projects), false);
});

test('buildCartKey keeps one line per item + source warehouse', () => {
  assert.equal(buildCartKey('i1', 'p1'), 'i1::p1');
  assert.notEqual(buildCartKey('i1', 'p1'), buildCartKey('i1', 'p2'));
  assert.equal(buildCartKey('i1', 'p1'), buildCartKey('i1', 'p1'));
  assert.equal(buildCartKey('i1', undefined), 'i1::' + ALL_WAREHOUSES);
});

test('pickDefaultWarehouse returns null for no warehouses and the max-balance one otherwise', () => {
  assert.equal(pickDefaultWarehouse([]), null);
  assert.equal(pickDefaultWarehouse(undefined), null);

  const picked = pickDefaultWarehouse([
    { project_id: 'p1', project_name: 'A', balance: 3 },
    { project_id: 'p2', project_name: 'B', balance: 9 },
    { project_id: 'p3', project_name: 'C', balance: 5 },
  ]);
  assert.equal(picked.project_id, 'p2');
});

test('pickDefaultWarehouse breaks balance ties by warehouse name', () => {
  const picked = pickDefaultWarehouse([
    { project_id: 'pB', project_name: 'Beta', balance: 4 },
    { project_id: 'pA', project_name: 'Alpha', balance: 4 },
  ]);
  assert.equal(picked.project_id, 'pA');
});

test('resolveSourceWarehouse honours an explicitly selected project', () => {
  const warehouses = [
    { project_id: 'p1', project_name: 'A', balance: 3 },
    { project_id: 'p2', project_name: 'B', balance: 9 },
  ];
  assert.deepEqual(resolveSourceWarehouse({ selectedProjectId: 'p1', warehouses }), {
    project_id: 'p1',
    project_name: 'A',
    warehouse_name: 'A',
    balance: 3,
  });

  // selected project without stock still resolves to that warehouse with 0
  assert.deepEqual(resolveSourceWarehouse({ selectedProjectId: 'pX', warehouses }), {
    project_id: 'pX',
    project_name: '',
    warehouse_name: '',
    balance: 0,
  });
});

test('resolveSourceWarehouse carries the warehouse label of the picked warehouse', () => {
  const warehouses = [
    { project_id: 'p1', project_name: 'DOPA', warehouse_name: 'คลัง EMS', balance: 3 },
  ];
  assert.equal(resolveSourceWarehouse({ selectedProjectId: 'p1', warehouses }).warehouse_name, 'คลัง EMS');
  assert.equal(resolveSourceWarehouse({ selectedProjectId: ALL_WAREHOUSES, warehouses }).warehouse_name, 'คลัง EMS');
});

test('resolveSourceWarehouse auto-picks the fullest warehouse for "all"', () => {
  const warehouses = [
    { project_id: 'p1', project_name: 'A', balance: 3 },
    { project_id: 'p2', project_name: 'B', balance: 9 },
  ];
  assert.equal(resolveSourceWarehouse({ selectedProjectId: ALL_WAREHOUSES, warehouses }).project_id, 'p2');
  assert.equal(resolveSourceWarehouse({ selectedProjectId: 'all', warehouses: [] }), null);
});

test('clampQuantity keeps quantities inside [1, available]', () => {
  assert.equal(clampQuantity(5, 10), 5);
  assert.equal(clampQuantity(50, 10), 10);
  assert.equal(clampQuantity(0, 10), 1);
  assert.equal(clampQuantity(-3, 10), 1);
  assert.equal(clampQuantity('7', 10), 7);
  assert.equal(clampQuantity('abc', 10), 1);
  assert.equal(clampQuantity('', 10), 1);
  assert.equal(clampQuantity('12px', 10), 10);
});

test('clampQuantity reports 0 when the warehouse has no stock', () => {
  assert.equal(clampQuantity(3, 0), 0);
  assert.equal(clampQuantity(3, -2), 0);
});

test('clampQuantity treats an unknown availability as unbounded', () => {
  assert.equal(clampQuantity(9, Infinity), 9);
  assert.equal(clampQuantity(9, undefined), 9);
});

