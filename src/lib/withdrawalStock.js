/**
 * Pure stock helpers for multi-warehouse / multi-project withdrawal.
 *
 * Kept dependency-free (no React, no Supabase) so the warehouse math can be
 * unit-tested with `node --test` — important because the withdrawal screens need
 * a live database to exercise end to end.
 */

export const ALL_WAREHOUSES = 'all';

/**
 * Build itemId -> [{ project_id, project_name, balance }] from stock_balance rows.
 * Only warehouses that can actually supply stock (balance > 0) are kept, and each
 * list is sorted by balance desc then name asc so the UI order is deterministic.
 */
export function buildWarehouseMap(balances = [], warehouseLabelById = null) {
  const map = new Map();
  for (const row of balances || []) {
    if (!row?.item_id || !row?.project_id) continue;
    const balance = Number(row.balance);
    if (!Number.isFinite(balance) || balance <= 0) continue;

    const projectName = row.project_name || '';
    const list = map.get(row.item_id) || [];
    list.push({
      project_id: row.project_id,
      project_name: projectName,
      // Physical warehouse name (projects.location) — the label users recognise.
      warehouse_name: warehouseLabelById?.get?.(row.project_id) || projectName,
      balance,
    });
    map.set(row.item_id, list);
  }

  for (const list of map.values()) {
    list.sort((a, b) => b.balance - a.balance
      || String(a.warehouse_name).localeCompare(String(b.warehouse_name)));
  }
  return map;
}

/** Warehouses that can supply the given item (empty array when there are none). */
export function getWarehousesForItem(warehouseMap, itemId) {
  if (!warehouseMap || !itemId) return [];
  return warehouseMap.get(itemId) || [];
}

/** Balance of one specific warehouse inside a warehouses list (0 when absent). */
export function getWarehouseBalance(warehouses = [], projectId) {
  if (!projectId) return 0;
  const row = (warehouses || []).find((w) => w.project_id === projectId);
  const balance = Number(row?.balance);
  return Number.isFinite(balance) ? balance : 0;
}

/** Total supply across every warehouse that has stock for the item. */
export function getWarehouseTotal(warehouses = []) {
  return (warehouses || []).reduce((sum, w) => sum + (Number(w.balance) || 0), 0);
}

/**
 * Stable identity for a cart line. One item may legitimately appear several
 * times in the same requisition when it is pulled from different warehouses.
 */
export function buildCartKey(itemId, sourceProjectId) {
  return `${itemId}::${sourceProjectId || ALL_WAREHOUSES}`;
}

/** Warehouse with the most stock (ties broken by name) — used to auto-pick. */
export function pickDefaultWarehouse(warehouses = []) {
  if (!warehouses?.length) return null;
  return warehouses.reduce((best, candidate) => {
    if (candidate.balance > best.balance) return candidate;
    if (
      candidate.balance === best.balance &&
      String(candidate.project_name).localeCompare(String(best.project_name)) < 0
    ) {
      return candidate;
    }
    return best;
  });
}

/**
 * Resolve the source warehouse for a new cart line.
 * - a concrete selected project wins (balance may be 0 = nothing to withdraw)
 * - "all" auto-picks the warehouse holding the most stock
 */
export function resolveSourceWarehouse({ selectedProjectId, warehouses = [] }) {
  if (selectedProjectId && selectedProjectId !== ALL_WAREHOUSES) {
    const match = (warehouses || []).find((w) => w.project_id === selectedProjectId);
    return {
      project_id: selectedProjectId,
      project_name: match?.project_name || '',
      warehouse_name: match?.warehouse_name || match?.project_name || '',
      balance: match ? Number(match.balance) || 0 : 0,
    };
  }

  const picked = pickDefaultWarehouse(warehouses);
  if (!picked) return null;
  return {
    ...picked,
    warehouse_name: picked.warehouse_name || picked.project_name || '',
  };
}

/**
 * Display name of a line's source warehouse, used by the PDF templates.
 * Prefers an embedded join (`items.projects` / `projects`) and otherwise looks
 * the id up in the caller's project list. Returns null when it cannot be shown,
 * so the PDF can keep the column hidden instead of printing "—" for every row.
 */
export function resolveWarehouseName(item, projects = []) {
  const embeddedLabel = getWarehouseLabel(item?.items?.projects || item?.projects);
  if (embeddedLabel) return embeddedLabel;

  const projectId = item?.project_id;
  if (!projectId) return null;

  const match = (projects || []).find((p) => p.id === projectId);
  return match ? getWarehouseLabel(match) : null;
}

/**
 * Human-facing warehouse name for a project row.
 * In this system a "project" is a combined requisition scope while the physical
 * warehouse lives in `projects.location` (e.g. "คลัง Forth ชั้น 3"). Several
 * projects can share the same name, so the location is the warehouse identity.
 * Falls back to the project name when no location is recorded.
 */
export function getWarehouseLabel(project) {
  const location = typeof project?.location === 'string' ? project.location.trim() : '';
  if (location) return location;

  const name = typeof project?.name === 'string' ? project.name.trim() : '';
  return name || null;
}

/** True when at least one line has a resolvable source warehouse. */
export function hasResolvableWarehouse(items = [], projects = []) {
  return (items || []).some((item) => item?.project_id && resolveWarehouseName(item, projects));
}

/** Clamp a requested quantity into [1, available]; 0 means "cannot withdraw". */
export function clampQuantity(value, available) {
  const max = Number.isFinite(available) ? available : Number.MAX_SAFE_INTEGER;
  if (max <= 0) return 0;

  const parsed = typeof value === 'string' ? parseInt(value.replace(/\D/g, ''), 10) : Number(value);
  const quantity = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  return Math.min(quantity, max);
}
