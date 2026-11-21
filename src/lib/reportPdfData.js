/**
 * Shared pure domain helpers for PDF report exports (#1 Goods Receipt,
 * #2 Goods Issue / Requisition, #3 Inventory Balance, #4 Site Kits BOM Readiness).
 *
 * Kept dependency-free (no React, no Supabase) so every grouping, canonical
 * warehouse/category mapping, and subtotal calculation is unit-tested via `node --test`.
 */

export const REPORT_WAREHOUSES = [
  {
    key: 'ems_sap',
    order: 1,
    label: 'คลัง EMS (SAP)',
    labelEn: 'EMS (SAP)',
  },
  {
    key: 'ems',
    order: 2,
    label: 'คลัง EMS',
    labelEn: 'EMS',
  },
  {
    key: 'forth_3',
    order: 3,
    label: 'คลัง Forth ชั้น 3',
    labelEn: 'Forth 3rd Floor',
  },
  {
    key: 'factory_c',
    order: 4,
    label: 'คลัง Factory C',
    labelEn: 'Factory C',
  },
  {
    key: 'pawnshop',
    order: 5,
    label: 'ตึกโรงรับจำนำ',
    labelEn: 'Pawnshop Building',
  },
];

export const REPORT_CATEGORIES = [
  {
    key: 'mw',
    order: 1,
    label: 'MW (Microwave)',
    knownIds: ['1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba'],
  },
  {
    key: 'bs',
    order: 2,
    label: 'BS (Base Station)',
    knownIds: ['793d55c3-4750-42e1-a82e-438e7be131c8'],
  },
  {
    key: 'agw',
    order: 3,
    label: 'AGW (Analog Gateway)',
    knownIds: ['3fb47021-6c65-4a4f-bca4-595280d9ba97'],
  },
  {
    key: 'fixed_radio',
    order: 4,
    label: 'ลูกข่าย (Fixed Radio)',
    knownIds: ['823af00d-99b0-4d9a-943b-0ae29bc83ff0'],
  },
  {
    key: 'equipment_set',
    order: 5,
    label: 'ชุดอุปกรณ์รวม (Combined Equipment Set)',
    knownIds: ['8986d991-42ef-4c79-8d38-7790e163117e'],
  },
  {
    key: 'others',
    order: 6,
    label: 'อื่นๆ (Others)',
    knownIds: [],
  },
];

const CATEGORY_ID_TO_KEY = new Map(
  REPORT_CATEGORIES.flatMap((cat) =>
    cat.knownIds.map((id) => [String(id).toLowerCase(), cat.key])
  )
);

const normalizeCompact = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, '');

export const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

/**
 * Format numeric quantities with thousand separators without appending a unit
 * (items across categories/warehouses have mixed units).
 */
export function formatReportQuantity(value) {
  return toFiniteNumber(value).toLocaleString('en-US');
}

/**
 * Format a date string or Date into compact Thai short date (DD/MM/YYYY B.E.).
 * Returns '-' for missing or invalid dates.
 */
export function formatReportDate(value) {
  if (!value) return '-';
  const raw = String(value).trim();
  if (!raw) return '-';
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${year + 543}`;
  }
  const date = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const buddhistYear = date.getFullYear() + 543;
  return `${day}/${month}/${buddhistYear}`;
}

function matchWarehouseString(rawValue) {
  const raw = String(rawValue || '').trim();
  const compact = normalizeCompact(raw);
  if (!compact) return null;

  const hasEmsWord = /(^|[^a-z])ems\d*([^a-z]|$)/i.test(raw) || compact.includes('อีเอ็มเอส');
  const hasSapWord = /(^|[^a-z])sap([^a-z]|$)/i.test(raw);

  // Check EMS (SAP) strictly before EMS so "คลัง EMS (SAP)" never falls into "คลัง EMS".
  if (
    compact.includes('ems(sap)') ||
    compact.includes('emssap') ||
    (hasEmsWord && hasSapWord) ||
    compact === 'sap' ||
    compact === 'คลังsap'
  ) {
    return 'ems_sap';
  }

  if (hasEmsWord) {
    return 'ems';
  }

  // Check Factory C and Pawnshop before Forth 3rd Floor so names like
  // "Forth Factory C" or "ตึก Forth (โรงรับจำนำ)" never misclassify as Forth 3rd Floor.
  if (
    compact.includes('factoryc') ||
    compact.includes('โรงงานc') ||
    compact === 'factory' ||
    compact === 'คลังfactory' ||
    compact === 'โรงงาน' ||
    compact === 'คลังโรงงาน'
  ) {
    return 'factory_c';
  }

  if (
    compact.includes('โรงรับจำนำ') ||
    compact.includes('จำนำ') ||
    compact.includes('pawnshop') ||
    /(^|[^a-z])pawn([^a-z]|$)/i.test(raw)
  ) {
    return 'pawnshop';
  }

  if (
    compact.includes('forthชั้น3') ||
    compact.includes('forth3') ||
    compact.includes('forth3rd') ||
    compact.includes('ฟอร์ทชั้น3') ||
    compact.includes('ฟอร์ท3') ||
    compact.includes('ชั้น3') ||
    compact.includes('3rdfloor') ||
    compact === 'คลังforth' ||
    compact === 'คลังฟอร์ท'
  ) {
    return 'forth_3';
  }

  return null;
}

/**
 * Resolve a report row to one of the 5 canonical warehouse keys.
 * Prefers line-level source project (`source_project_id`) and physical warehouse
 * (`projects.location`) over project name/code, matching the multi-warehouse convention.
 * Returns null when the row does not match any of the 5 canonical warehouses.
 */
export function resolveCanonicalWarehouseKey(row, projectsById = null) {
  if (!row || typeof row !== 'object') return null;

  const lookupProject = (id) =>
    id && projectsById
      ? projectsById.get(id) ?? projectsById.get(String(id).toLowerCase())
      : null;

  const sourceProjectRef = lookupProject(row.source_project_id);
  const projectRef = lookupProject(row.project_id);

  const candidates = [
    sourceProjectRef?.location,
    row.projects?.location,
    projectRef?.location,
    row.warehouse_name,
    row.location,
    sourceProjectRef?.name,
    row.projects?.name,
    projectRef?.name,
    row.project_name,
    sourceProjectRef?.project_code,
    row.projects?.project_code,
    projectRef?.project_code,
  ];

  for (const candidate of candidates) {
    const matched = matchWarehouseString(candidate);
    if (matched) return matched;
  }

  return null;
}

function matchCategoryString(rawValue) {
  const raw = String(rawValue || '').trim();
  const compact = normalizeCompact(raw);
  if (!compact) return null;

  if (compact === 'mw' || /\bmw\b/i.test(raw) || compact.includes('microwave') || compact.includes('ไมโครเวฟ')) {
    return 'mw';
  }

  if (
    compact === 'bs' ||
    /\bbs\b/i.test(raw) ||
    compact.includes('basestation') ||
    compact.includes('สถานีฐาน') ||
    compact.includes('สถานีแม่ข่าย')
  ) {
    return 'bs';
  }

  if (
    compact === 'agw' ||
    /\bagw\b/i.test(raw) ||
    compact.includes('analoggateway') ||
    compact.includes('gateway') ||
    compact.includes('เกตเวย์')
  ) {
    return 'agw';
  }

  if (
    compact.includes('ลูกข่าย') ||
    compact.includes('fixedradio') ||
    /\bfixed\b/i.test(raw)
  ) {
    return 'fixed_radio';
  }

  if (
    compact.includes('ชุดอุปกรณ์รวม') ||
    compact.includes('อุปกรณ์รวม') ||
    compact.includes('combinedequipment') ||
    compact.includes('equipmentset') ||
    compact.includes('eqset')
  ) {
    return 'equipment_set';
  }

  if (compact.includes('อื่นๆ') || compact.includes('other') || compact === 'etc') {
    return 'others';
  }

  return null;
}

/**
 * Resolve a report row to one of the 6 canonical category keys.
 * Falls back to 'others' for null/missing/unrecognized categories.
 */
export function resolveCanonicalCategoryKey(row, categoriesById = null, itemsByName = null) {
  if (!row || typeof row !== 'object') return 'others';

  const itemNameKey = String(row.items?.name || row.item_name || '').trim().toLowerCase();
  const itemMeta = itemNameKey && itemsByName ? itemsByName.get(itemNameKey) : null;

  const categoryId =
    row.items?.category_id ??
    row.category_id ??
    row.items?.categories?.id ??
    itemMeta?.category_id ??
    itemMeta?.categories?.id ??
    null;

  const categoryRef =
    categoryId && categoriesById
      ? categoriesById.get(categoryId) ?? categoriesById.get(String(categoryId).toLowerCase())
      : null;

  const nameCandidates = [
    row.items?.categories?.name,
    categoryRef?.name,
    row.category_name,
    row.category,
    itemMeta?.categories?.name,
    itemMeta?.category_name,
  ];

  for (const candidate of nameCandidates) {
    const matched = matchCategoryString(candidate);
    if (matched) return matched;
  }

  if (categoryId) {
    const byId = CATEGORY_ID_TO_KEY.get(String(categoryId).toLowerCase());
    if (byId) return byId;
  }

  return 'others';
}

/**
 * Build an id -> entity lookup map (case-insensitive keys).
 */
export function buildIdMap(list = []) {
  const map = new Map();
  for (const entry of list || []) {
    if (entry?.id) map.set(String(entry.id).toLowerCase(), entry);
  }
  return map;
}

/**
 * Build a lowercase item name -> item metadata map for category fallback
 * (used when RPC rows like `get_checkout_consumed_usage` return `item_name` without `category_id`).
 */
export function buildItemsByNameMap(items = []) {
  const map = new Map();
  if (items instanceof Map) return items;
  for (const item of items || []) {
    const key = String(item?.name || '').trim().toLowerCase();
    if (key && !map.has(key)) {
      map.set(key, item);
    }
  }
  return map;
}

/**
 * Generic builder for all 5-warehouse × 6-category PDF reports.
 * Always emits all 5 canonical warehouses and all 6 canonical categories per
 * warehouse in exact fixed order, preserving empty categories/warehouses and
 * tracking unmapped warehouses separately without adding a 6th section.
 */
export function buildWarehouseCategoryReportData(
  rows = [],
  {
    projects = [],
    categories = [],
    itemsByName = null,
    createEmptyTotals,
    mapRow,
    addToTotals,
    finalizeTotals = null,
    sortItems = null,
  }
) {
  const projectsById = buildIdMap(projects);
  const categoriesById = buildIdMap(categories);
  const resolvedItemsByName = itemsByName ? buildItemsByNameMap(itemsByName) : null;

  const warehouseMap = new Map();
  const warehouses = REPORT_WAREHOUSES.map((wh) => {
    const categoryMap = new Map();
    const categorySections = REPORT_CATEGORIES.map((cat) => {
      const section = {
        key: cat.key,
        order: cat.order,
        label: cat.label,
        items: [],
        subtotal: createEmptyTotals(),
      };
      categoryMap.set(cat.key, section);
      return section;
    });

    const whSection = {
      key: wh.key,
      order: wh.order,
      label: wh.label,
      labelEn: wh.labelEn,
      categories: categorySections,
      subtotal: createEmptyTotals(),
      _categoryMap: categoryMap,
    };
    warehouseMap.set(wh.key, whSection);
    return whSection;
  });

  const grandTotal = {
    ...createEmptyTotals(),
    warehouseCount: REPORT_WAREHOUSES.length,
    categoryCount: REPORT_CATEGORIES.length,
  };
  const unmappedWarehouseRows = [];

  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;

    const warehouseKey = resolveCanonicalWarehouseKey(row, projectsById);
    if (!warehouseKey) {
      unmappedWarehouseRows.push(row);
      continue;
    }

    const categoryKey = resolveCanonicalCategoryKey(row, categoriesById, resolvedItemsByName);
    const whSection = warehouseMap.get(warehouseKey);
    const catSection = whSection._categoryMap.get(categoryKey);

    const projectRef = row.project_id
      ? projectsById.get(String(row.project_id).toLowerCase())
      : null;

    const mappedItem = mapRow(row, {
      warehouseKey,
      categoryKey,
      projectRef,
      projectsById,
      categoriesById,
    });

    catSection.items.push(mappedItem);
    addToTotals(catSection.subtotal, mappedItem);
    addToTotals(whSection.subtotal, mappedItem);
    addToTotals(grandTotal, mappedItem);
  }

  for (const wh of warehouses) {
    for (const cat of wh.categories) {
      if (sortItems) {
        cat.items.sort(sortItems);
      }
      if (finalizeTotals) {
        finalizeTotals(cat.subtotal);
      }
    }
    if (finalizeTotals) {
      finalizeTotals(wh.subtotal);
    }
    delete wh._categoryMap;
  }

  if (finalizeTotals) {
    finalizeTotals(grandTotal);
  }

  return {
    warehouses,
    grandTotal,
    unmappedWarehouseRows,
    unmappedWarehouseCount: unmappedWarehouseRows.length,
  };
}

// ---------------------------------------------------------------------------
// Report #1: Goods Receipt Report (รายงานรับเข้าพัสดุ)
// ---------------------------------------------------------------------------
const createReceiptTotals = () => ({
  itemCount: 0,
  totalQty: 0,
  documentCount: 0,
  supplierCount: 0,
  _docs: new Set(),
  _suppliers: new Set(),
});

const addReceiptToTotals = (totals, item) => {
  totals.itemCount += 1;
  totals.totalQty += item.quantity;
  if (item.documentKey) totals._docs.add(item.documentKey);
  if (item.supplierKey) totals._suppliers.add(item.supplierKey);
};

const finalizeReceiptTotals = (totals) => {
  totals.documentCount = totals._docs.size;
  totals.supplierCount = totals._suppliers.size;
  delete totals._docs;
  delete totals._suppliers;
};

export function buildGoodsReceiptReportData(
  rows = [],
  { projects = [], categories = [] } = {}
) {
  const result = buildWarehouseCategoryReportData(rows, {
    projects,
    categories,
    createEmptyTotals: createReceiptTotals,
    mapRow: (row) => {
      const poNumber = String(row.po_number || row.document_number || '').trim();
      const orderId = row.order_id || row.stock_in_order_id || '';
      const documentNumber =
        poNumber || (orderId ? `SI-${String(orderId).slice(0, 8).toUpperCase()}` : '-');
      const supplier = String(row.supplier || '').trim() || '-';
      const receivedDateRaw = row.received_date || row.created_at || '';

      return {
        id: row.id || row.item_id || '',
        receivedDateRaw,
        receivedDate: formatReportDate(receivedDateRaw),
        documentNumber,
        documentKey: documentNumber !== '-' ? documentNumber.toLowerCase() : '',
        itemName: row.items?.name || row.item_name || '-',
        supplier,
        supplierKey: supplier !== '-' ? supplier.toLowerCase() : '',
        unit: row.items?.unit || row.unit || '-',
        quantity: toFiniteNumber(row.quantity),
      };
    },
    addToTotals: addReceiptToTotals,
    finalizeTotals: finalizeReceiptTotals,
    sortItems: (a, b) =>
      String(b.receivedDateRaw || '').localeCompare(String(a.receivedDateRaw || '')) ||
      String(a.itemName).localeCompare(String(b.itemName), 'th') ||
      String(a.documentNumber).localeCompare(String(b.documentNumber), 'en'),
  });

  result.grandTotal.activeWarehouseCount = result.warehouses.filter(
    (w) => w.subtotal.itemCount > 0
  ).length;

  return result;
}

// ---------------------------------------------------------------------------
// Report #2: Goods Issue / Requisition Report (รายงานการเบิกจ่าย)
// ---------------------------------------------------------------------------
const createIssueTotals = () => ({
  itemCount: 0,
  requestedQty: 0,
  deductedQty: 0,
  shortageQty: 0,
  documentCount: 0,
  _docs: new Set(),
});

const addIssueToTotals = (totals, item) => {
  totals.itemCount += 1;
  totals.requestedQty += item.requestedQty;
  totals.deductedQty += item.deductedQty;
  totals.shortageQty += item.shortageQty;
  if (item.documentKey) totals._docs.add(item.documentKey);
};

const finalizeIssueTotals = (totals) => {
  totals.documentCount = totals._docs.size;
  delete totals._docs;
};

export function buildGoodsIssueReportData(
  rows = [],
  { projects = [], categories = [], itemsByName = null } = {}
) {
  const result = buildWarehouseCategoryReportData(rows, {
    projects,
    categories,
    itemsByName,
    createEmptyTotals: createIssueTotals,
    mapRow: (row) => {
      const requestedQty = toFiniteNumber(row.quantity);
      const isApprovedOrCompleted = row.status === 'approved' || row.status === 'completed';
      const deductedQty =
        row.deducted_quantity !== undefined && row.deducted_quantity !== null
          ? toFiniteNumber(row.deducted_quantity)
          : isApprovedOrCompleted
            ? requestedQty
            : 0;
      const shortageQty =
        row.shortage_quantity !== undefined && row.shortage_quantity !== null
          ? toFiniteNumber(row.shortage_quantity)
          : isApprovedOrCompleted
            ? Math.max(0, requestedQty - deductedQty)
            : 0;

      const isConsumed = row.source === 'checkout_consumed';
      const rawDoc = isConsumed
        ? row.reference || row.order_number || ''
        : row.work_order_no || row.document_number || row.reference || '';
      const orderId = row.order_id || row.withdrawal_order_id || '';
      const documentNumber =
        String(rawDoc || '').trim() ||
        (orderId ? `WO-${String(orderId).slice(0, 8).toUpperCase()}` : '-');

      const issueDateRaw = row.requested_at || row.returned_at || row.created_at || '';
      const requester =
        String(row.profiles?.full_name || row.requester_name || row.borrower_name || '').trim() || '-';

      return {
        id: row.id || row.item_id || '',
        issueDateRaw,
        issueDate: formatReportDate(issueDateRaw),
        documentNumber,
        documentKey: documentNumber !== '-' ? documentNumber.toLowerCase() : '',
        itemName: row.items?.name || row.item_name || '-',
        requester,
        unit: row.items?.unit || row.unit || '-',
        requestedQty,
        deductedQty,
        shortageQty,
        source: isConsumed ? 'checkout_consumed' : 'withdrawal',
      };
    },
    addToTotals: addIssueToTotals,
    finalizeTotals: finalizeIssueTotals,
    sortItems: (a, b) =>
      String(b.issueDateRaw || '').localeCompare(String(a.issueDateRaw || '')) ||
      String(a.itemName).localeCompare(String(b.itemName), 'th') ||
      String(a.documentNumber).localeCompare(String(b.documentNumber), 'en'),
  });

  result.grandTotal.activeWarehouseCount = result.warehouses.filter(
    (w) => w.subtotal.itemCount > 0
  ).length;

  return result;
}

// ---------------------------------------------------------------------------
// Report #4: BOM Spec & Site Kits Readiness Report (สเปก BOM และความพร้อม Site Kits)
// Grouped by the 6 canonical equipment categories (company-wide stock across all 5 warehouses).
// ---------------------------------------------------------------------------
export function calculateSiteKitShortage({ qtyPerSite, totalStock, isMandatory = true }) {
  if (!isMandatory) return 0;
  const required = toFiniteNumber(qtyPerSite);
  if (required <= 0) return 0;
  const stock = Math.max(0, toFiniteNumber(totalStock));
  return Math.max(0, required - stock);
}

export function buildSiteKitsReportData(siteKits = [], { items = null } = {}) {
  const categoryMap = new Map();
  const categories = REPORT_CATEGORIES.map((cat) => {
    const section = {
      key: cat.key,
      order: cat.order,
      label: cat.label,
      items: [],
      subtotal: {
        itemCount: 0,
        totalRequiredPerSite: 0,
        totalStock: 0,
        completeSets: 0,
        totalMissing: 0,
        limitingCount: 0,
        outOfStockCount: 0,
        readyCount: 0,
      },
      _hasCompleteSetsValue: false,
    };
    categoryMap.set(cat.key, section);
    return section;
  });

  const ingestItem = (catSection, rawItem, catCompleteSets) => {
    const qtyPerSite = toFiniteNumber(rawItem.qty_per_site);
    const totalStock = toFiniteNumber(rawItem.total_stock);
    const setsPossible = toFiniteNumber(rawItem.sets_possible);
    const isMandatory = rawItem.is_mandatory !== false;
    const missingForNextSet = calculateSiteKitShortage({
      qtyPerSite,
      totalStock,
      isMandatory,
    });
    const isLimiting =
      rawItem.isLimiting !== undefined
        ? Boolean(rawItem.isLimiting)
        : isMandatory && setsPossible === catCompleteSets;

    let status = 'ready';
    let statusLabel = 'พร้อมจัดชุด';
    if (totalStock <= 0) {
      status = 'out_of_stock';
      statusLabel = 'หมดสต็อก';
    } else if (isLimiting) {
      status = 'limiting';
      statusLabel = 'สต็อกจำกัด';
    }

    const mapped = {
      id: rawItem.id || rawItem.item_id || '',
      poSeq: toFiniteNumber(rawItem.po_seq),
      partNumber: String(rawItem.part_number || '').trim() || '-',
      bomName: String(rawItem.bom_name || rawItem.item_name || '').trim() || '-',
      qtyPerSite,
      unit: String(rawItem.unit || '').trim() || 'ชิ้น',
      totalStock,
      setsPossible,
      missingForNextSet,
      isMandatory,
      isLimiting,
      status,
      statusLabel,
    };

    catSection.items.push(mapped);
    catSection.subtotal.itemCount += 1;
    catSection.subtotal.totalRequiredPerSite += qtyPerSite;
    catSection.subtotal.totalStock += totalStock;
    catSection.subtotal.totalMissing += missingForNextSet;
    if (status === 'out_of_stock') catSection.subtotal.outOfStockCount += 1;
    else if (status === 'limiting') catSection.subtotal.limitingCount += 1;
    else catSection.subtotal.readyCount += 1;
  };

  if (Array.isArray(siteKits) && siteKits.length > 0) {
    for (const cat of siteKits) {
      if (!cat || typeof cat !== 'object') continue;
      const catKey = resolveCanonicalCategoryKey({
        category_id: cat.category_id,
        category_name: cat.category_name,
      });
      const catSection = categoryMap.get(catKey);
      const completeSets = toFiniteNumber(cat.complete_sets);
      const catItems = Array.isArray(cat.items) ? cat.items : [];

      if (catItems.length > 0) {
        if (catSection._hasCompleteSetsValue) {
          catSection.subtotal.completeSets = Math.min(catSection.subtotal.completeSets, completeSets);
        } else {
          catSection.subtotal.completeSets = completeSets;
          catSection._hasCompleteSetsValue = true;
        }
      }

      for (const rawItem of catItems) {
        ingestItem(catSection, rawItem, completeSets);
      }
    }
  } else if (Array.isArray(items) && items.length > 0) {
    // Fallback compatibility when flat items array is supplied without nested siteKits
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const catKey = resolveCanonicalCategoryKey({
        category_id: rawItem.category_id,
        category_name: rawItem.category_name,
      });
      const catSection = categoryMap.get(catKey);
      const completeSets = toFiniteNumber(rawItem.category_complete_sets ?? rawItem.sets_possible);
      if (catSection._hasCompleteSetsValue) {
        catSection.subtotal.completeSets = Math.min(catSection.subtotal.completeSets, completeSets);
      } else {
        catSection.subtotal.completeSets = completeSets;
        catSection._hasCompleteSetsValue = true;
      }
      ingestItem(catSection, rawItem, completeSets);
    }
  }

  const grandTotal = {
    categoryCount: REPORT_CATEGORIES.length,
    activeCategoryCount: 0,
    itemCount: 0,
    totalStock: 0,
    totalCompleteSets: 0,
    totalMissing: 0,
    limitingCount: 0,
    outOfStockCount: 0,
    readyCount: 0,
  };

  for (const cat of categories) {
    cat.items.sort(
      (a, b) =>
        (a.poSeq || 9999) - (b.poSeq || 9999) ||
        String(a.bomName).localeCompare(String(b.bomName), 'th')
    );
    delete cat._hasCompleteSetsValue;

    if (cat.items.length > 0) {
      grandTotal.activeCategoryCount += 1;
    } else {
      cat.subtotal.completeSets = 0;
    }

    grandTotal.itemCount += cat.subtotal.itemCount;
    grandTotal.totalStock += cat.subtotal.totalStock;
    grandTotal.totalCompleteSets += cat.subtotal.completeSets;
    grandTotal.totalMissing += cat.subtotal.totalMissing;
    grandTotal.limitingCount += cat.subtotal.limitingCount;
    grandTotal.outOfStockCount += cat.subtotal.outOfStockCount;
    grandTotal.readyCount += cat.subtotal.readyCount;
  }

  return {
    categories,
    grandTotal,
  };
}
