/**
 * Pure domain helpers for Inventory Balance Report (#3) PDF export.
 *
 * Delegates canonical warehouse/category definitions and 5×6 grouping to
 * `reportPdfData.js` while preserving all existing exports and behavior.
 */

import {
  REPORT_WAREHOUSES,
  REPORT_CATEGORIES,
  formatReportQuantity,
  resolveCanonicalWarehouseKey,
  resolveCanonicalCategoryKey,
  buildWarehouseCategoryReportData,
  toFiniteNumber,
} from './reportPdfData.js';

export const BALANCE_REPORT_WAREHOUSES = REPORT_WAREHOUSES;
export const BALANCE_REPORT_CATEGORIES = REPORT_CATEGORIES;
export { formatReportQuantity, resolveCanonicalWarehouseKey, resolveCanonicalCategoryKey };

const createEmptyTotals = () => ({
  itemCount: 0,
  totalIn: 0,
  totalOut: 0,
  balance: 0,
  zeroStockCount: 0,
});

const addToTotals = (totals, item) => {
  totals.itemCount += 1;
  totals.totalIn += item.totalIn;
  totals.totalOut += item.totalOut;
  totals.balance += item.balance;
  if (item.balance <= 0) {
    totals.zeroStockCount += 1;
  }
};

/**
 * Build the complete 5-warehouse × 6-category Inventory Balance Report model.
 * Always emits all 5 warehouses and all 6 categories per warehouse in exact
 * canonical order, even when empty.
 */
export function buildInventoryBalanceReportData(
  rows = [],
  { projects = [], categories = [] } = {}
) {
  return buildWarehouseCategoryReportData(rows, {
    projects,
    categories,
    createEmptyTotals,
    mapRow: (row, { projectRef }) => ({
      itemId: row.item_id ?? row.id ?? '',
      itemName: row.item_name || row.items?.name || row.รายการวัสดุ || '-',
      sku: row.items?.sku || row.sku || '',
      model: row.items?.model || row.model || '',
      projectName: row.project_name || row.projects?.name || projectRef?.name || '-',
      unit: row.unit || row.items?.unit || row.หน่วย || '',
      totalIn: toFiniteNumber(row.total_in !== undefined ? row.total_in : row.รับเข้าทั้งหมด),
      totalOut: toFiniteNumber(row.total_out !== undefined ? row.total_out : row.เบิกออกทั้งหมด),
      balance: toFiniteNumber(row.balance !== undefined ? row.balance : row.คงเหลือ),
    }),
    addToTotals,
    sortItems: (a, b) =>
      String(a.itemName).localeCompare(String(b.itemName), 'th') ||
      String(a.projectName).localeCompare(String(b.projectName), 'th'),
  });
}
