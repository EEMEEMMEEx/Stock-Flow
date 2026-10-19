/**
 * stockInSearch.js
 * Pure search tokenizer, matcher, and filter helper for Stock-In records.
 * Supports:
 * - Multi-word AND logic (all tokens must match somewhere in header or line items)
 * - Unicode NFC normalization for Thai and English
 * - Special characters (commas, hyphens, dots, quotes, slashes)
 * - Case-insensitive matching
 * - Extracts matched item names / SKUs for the UI Badge (ทางเลือก ข)
 */

/**
 * Tokenize search query string into clean lowercase search tokens
 * @param {string} query
 * @returns {string[]}
 */
export function tokenizeSearchQuery(query) {
  if (!query || typeof query !== 'string') return [];
  const normalized = query.normalize('NFC').trim();
  if (!normalized) return [];

  return normalized
    .split(/\s+/)
    .map((tok) => {
      // Strip edge punctuation (e.g. trailing comma "outdoor," -> "outdoor")
      const trimmed = tok.replace(/^[^\w\u0E00-\u0E7F]+|[^\w\u0E00-\u0E7F]+$/g, '');
      return trimmed.toLowerCase();
    })
    .filter((tok) => tok.length > 0);
}

/**
 * Safely extract searchable text from an order's header fields
 * @param {object} order
 * @returns {string[]}
 */
function getHeaderSearchStrings(order) {
  if (!order) return [];
  return [
    order.po_number,
    order.supplier,
    order.notes,
    order.profiles?.full_name,
    order.received_by_name,
    order.projects?.name,
    order.projects?.project_code,
    order.projects?.location,
    order.project_name,
    order.project_code,
    order.project_location,
    order.id,
  ]
    .filter(Boolean)
    .map((val) => String(val).normalize('NFC').toLowerCase());
}

/**
 * Safely extract searchable text from line items
 * @param {object} itemRow
 * @returns {string[]}
 */
function getItemSearchStrings(itemRow) {
  if (!itemRow) return [];
  const masterItem = itemRow.items || {};
  return [
    itemRow.name,
    itemRow.sku,
    itemRow.model,
    itemRow.serial_number,
    itemRow.part_number,
    itemRow.notes,
    masterItem.name,
    masterItem.sku,
    masterItem.model,
    masterItem.description,
  ]
    .filter(Boolean)
    .map((val) => String(val).normalize('NFC').toLowerCase());
}

/**
 * Extract item display name or SKU for matched snippet
 * @param {object} itemRow
 * @returns {string}
 */
function getItemDisplayName(itemRow) {
  const master = itemRow.items || {};
  return itemRow.name || master.name || itemRow.model || master.model || itemRow.sku || master.sku || itemRow.part_number || '';
}

/**
 * Check if a single token matches in a list of strings
 * @param {string} token
 * @param {string[]} strings
 * @returns {boolean}
 */
function tokenMatchesAny(token, strings) {
  for (let i = 0; i < strings.length; i++) {
    if (strings[i].includes(token)) return true;
  }
  return false;
}

/**
 * Check if an order matches all search tokens (AND logic)
 * @param {object} order
 * @param {string[]} tokens
 * @returns {{ matches: boolean, matchedSnippet: string | null }}
 */
export function matchOrderTokens(order, tokens) {
  if (!order) return { matches: false, matchedSnippet: null };
  if (!tokens || tokens.length === 0) {
    return { matches: true, matchedSnippet: order.matched_items_snippet || null };
  }

  const headerStrings = getHeaderSearchStrings(order);
  const lineItems = Array.isArray(order.stock_in_items) ? order.stock_in_items : [];

  const itemStringsList = lineItems.map((item) => ({
    displayName: getItemDisplayName(item),
    strings: getItemSearchStrings(item),
  }));

  // Verify that EVERY token matches either header OR at least one line item
  const matchedDisplayNames = new Set();

  for (const token of tokens) {
    let tokenMatched = tokenMatchesAny(token, headerStrings);

    for (const item of itemStringsList) {
      if (tokenMatchesAny(token, item.strings)) {
        tokenMatched = true;
        if (item.displayName) {
          matchedDisplayNames.add(item.displayName);
        }
      }
    }

    if (!tokenMatched) {
      return { matches: false, matchedSnippet: null };
    }
  }

  const snippet = matchedDisplayNames.size > 0
    ? Array.from(matchedDisplayNames).join(', ')
    : order.matched_items_snippet || null;

  return { matches: true, matchedSnippet: snippet };
}

/**
 * Filter an array of stock-in orders
 * @param {object[]} orders
 * @param {object} filters
 * @param {string} [filters.search]
 * @param {string} [filters.projectId]
 * @param {string|Date} [filters.dateFrom]
 * @param {string|Date} [filters.dateTo]
 * @returns {object[]}
 */
export function filterStockInOrders(orders, { search = '', projectId = '', dateFrom = null, dateTo = null } = {}) {
  if (!Array.isArray(orders)) return [];

  const tokens = tokenizeSearchQuery(search);
  const normalizedProjId = projectId && projectId !== 'all' ? String(projectId) : '';

  let fromTime = null;
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      fromTime = d.getTime();
    }
  }

  let toTime = null;
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      toTime = d.getTime();
    }
  }

  return orders.reduce((acc, order) => {
    // 1. Warehouse / Project filter
    if (normalizedProjId) {
      const orderProjId = String(order.project_id || order.projects?.id || '');
      if (orderProjId !== normalizedProjId) return acc;
    }

    // 2. Date Range filter
    if (fromTime !== null || toTime !== null) {
      const orderDateStr = order.received_date || order.created_at;
      if (orderDateStr) {
        const orderTime = new Date(orderDateStr).getTime();
        if (fromTime !== null && orderTime < fromTime) return acc;
        if (toTime !== null && orderTime > toTime) return acc;
      }
    }

    // 3. Search Matching
    const { matches, matchedSnippet } = matchOrderTokens(order, tokens);
    if (!matches) return acc;

    // Attach matched snippet to row for badge display
    acc.push({
      ...order,
      matched_items_snippet: matchedSnippet,
    });

    return acc;
  }, []);
}
