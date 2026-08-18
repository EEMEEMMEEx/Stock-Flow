// Native DOPA+USO & Canonical Multi-Section CSV Parser Engine
export const parseDopaStockCsv = (csvText) => {
  // 1. Strip UTF-8 BOM
  let cleanText = csvText.replace(/^[\uFEFF\uFFFE]/, '');
  
  // 2. State-machine CSV parser handling quotes, escaped quotes (""), commas, CRLF/LF
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      currentField = '';

      if (currentRow.some(cell => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(cell => cell !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { items: [], detectedWarehouses: [], totalRows: 0 };
  }

  const cleanHeader = (h) => (h || '').toLowerCase().replace(/["'\s*]/g, '').trim();
  
  // 3. Scan for all distinct warehouse columns in file
  const warehouseColumnSet = new Set();
  for (const row of rows) {
    const isHeaderRow = row.some(cell => {
      const c = cleanHeader(cell);
      return c === 'ลำดับ' || c === 'รายการ' || c === 'partno.' || c === 'partno' || c === 'item_name' || c === 'itemname';
    });
    
    if (isHeaderRow) {
      row.forEach(cell => {
        const c = cell.trim();
        const lower = cleanHeader(c);
        if (
          (lower.includes('คลัง') || lower.includes('ตึก') || lower.includes('warehouse') || lower.includes('factory')) &&
          !lower.includes('คงเหลือ') && !lower.includes('เบิก')
        ) {
          warehouseColumnSet.add(c);
        }
      });
    }
  }
  
  const detectedWarehouses = Array.from(warehouseColumnSet);

  // 4. State-machine parsing across sections
  let currentHeaderIndices = null;
  let lastSeenParent = null;
  const parsedItems = [];

  const updateHeaderIndices = (headerRow) => {
    const hClean = headerRow.map(cleanHeader);
    return {
      noIdx: hClean.findIndex(h => h === 'no' || h === 'num' || h === 'number' || h.includes('ลำดับ')),
      partIdx: hClean.findIndex(h => h === 'part_number' || h === 'partnumber' || h === 'part' || h === 'pn' || h === 'part_no' || h === 'partno' || h === 'partno.'),
      typeIdx: hClean.findIndex(h => h === 'item_type' || h === 'itemtype' || h === 'type' || h.includes('ประเภท')),
      nameIdx: hClean.findIndex(h => h === 'item_name' || h === 'itemname' || h === 'name' || h === 'รายการ' || h === 'ชื่อวัสดุ' || h === 'ชื่อ'),
      modelIdx: hClean.findIndex(h => h === 'model' || h === 'brand' || h === 'รุ่น' || h === 'ยี่ห้อ' || h.includes('รุ่น/ยี่ห้อ') || h.includes('รุ่น')),
      qtyRemainingIdx: hClean.findIndex(h => h.includes('คงเหลือ') || h === 'remaining' || h === 'balance'),
      qtyGeneralIdx: hClean.findIndex(h => h === 'quantity' || h === 'qty' || h === 'amount' || h === 'count' || h === 'จำนวน'),
      issuedQtyIdx: hClean.findIndex(h => h.includes('เบิก') || h === 'issued' || h === 'withdrawn'),
      notesIdx: hClean.findIndex(h => h === 'remark' || h === 'remarks' || h === 'notes' || h === 'note' || h === 'หมายเหตุ'),
      skuIdx: hClean.findIndex(h => h === 'sku' || h.includes('รหัสวัสดุ') || h.includes('รหัส')),
      parentSkuIdx: hClean.findIndex(h => h === 'parent_sku' || h === 'parentsku' || h === 'parent_id'),
      warehouseMap: headerRow.reduce((acc, colName, idx) => {
        if (colName && (colName.includes('คลัง') || colName.includes('ตึก') || colName.includes('Factory') || colName.includes('EMS'))) {
          acc[colName.trim()] = idx;
        }
        return acc;
      }, {})
    };
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(c => !c || c.trim() === '')) continue;

    // Check if this row is a header row
    const isHeaderRow = row.some(cell => {
      const c = cleanHeader(cell);
      return (c === 'ลำดับ' || c === 'no') && row.some(c2 => cleanHeader(c2) === 'รายการ' || cleanHeader(c2) === 'item_name' || cleanHeader(c2) === 'partno.' || cleanHeader(c2) === 'partno');
    });

    if (isHeaderRow) {
      currentHeaderIndices = updateHeaderIndices(row);
      continue;
    }

    if (!currentHeaderIndices) {
      currentHeaderIndices = {
        noIdx: 0,
        partIdx: 1,
        typeIdx: 2,
        nameIdx: 3,
        modelIdx: 4,
        qtyRemainingIdx: 8,
        qtyGeneralIdx: 6,
        issuedQtyIdx: 7,
        notesIdx: 9,
        skuIdx: -1,
        parentSkuIdx: -1,
        warehouseMap: {}
      };
    }

    const {
      noIdx, partIdx, typeIdx, nameIdx, modelIdx,
      qtyRemainingIdx, qtyGeneralIdx, notesIdx, skuIdx, parentSkuIdx, warehouseMap
    } = currentHeaderIndices;

    const getCol = (idx) => {
      if (idx === -1 || idx === undefined || idx >= row.length) return '';
      return (row[idx] || '').toString().trim();
    };

    const rawNo = getCol(noIdx);
    const rawPart = getCol(partIdx);
    let rawType = getCol(typeIdx).toUpperCase();
    const rawSku = getCol(skuIdx);
    let rawParentSku = getCol(parentSkuIdx);
    let rawName = getCol(nameIdx);
    const rawModel = getCol(modelIdx);
    const rawNotes = getCol(notesIdx);

    // Fallback if name is at another position
    if (!rawName) {
      if (getCol(3)) rawName = getCol(3);
      else if (getCol(0) && isNaN(parseInt(getCol(0)))) rawName = getCol(0);
      else if (getCol(1) && isNaN(parseInt(getCol(1)))) rawName = getCol(1);
    }

    if (!rawName) continue; // skip blank name rows

    // Detect Child from Name indentation (- ), explicit type, or missing seq under parent
    const isIndentedChild = rawName.startsWith('-') || rawName.startsWith('—') || rawName.includes('    -') || rawName.includes('   -');
    const isExplicitChild = rawType === 'CHILD';
    const isChild = isExplicitChild || (isIndentedChild && lastSeenParent) || (!rawNo && lastSeenParent && rawType !== 'PARENT');

    // Clean up Item Name (strip leading indentation dashes/spaces for clean DB record)
    const cleanedName = rawName.replace(/^[\s\-—•]+/, '').trim();

    // Determine Final Type
    const finalType = isChild ? 'CHILD' : 'PARENT';

    // Parse Quantities across columns
    const cleanNumber = (val) => {
      if (!val) return 0;
      const numStr = val.toString().replace(/,/g, '').trim();
      const p = parseFloat(numStr);
      return isNaN(p) ? 0 : p;
    };

    const warehouseValues = {};
    Object.keys(warehouseMap).forEach(whName => {
      const colIdx = warehouseMap[whName];
      const val = cleanNumber(getCol(colIdx));
      warehouseValues[whName] = val;
    });

    let qtyVal = 0;
    if (qtyRemainingIdx !== -1 && getCol(qtyRemainingIdx)) {
      qtyVal = cleanNumber(getCol(qtyRemainingIdx));
    } else if (qtyGeneralIdx !== -1 && getCol(qtyGeneralIdx)) {
      qtyVal = cleanNumber(getCol(qtyGeneralIdx));
    } else {
      const whVals = Object.values(warehouseValues);
      if (whVals.length > 0) {
        qtyVal = whVals.reduce((sum, v) => sum + v, 0);
      }
    }

    const validQty = qtyVal > 0 ? Math.round(qtyVal) : 1;

    // Generate deterministic internal SKU if none provided
    const generatedSku = rawSku || rawPart || (cleanedName ? `SKU-${Math.abs(cleanedName.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)).toString(36).toUpperCase().slice(0, 8)}` : '');

    let effectiveParentSku = '';
    if (finalType === 'CHILD') {
      if (rawParentSku) {
        effectiveParentSku = rawParentSku;
      } else if (lastSeenParent) {
        effectiveParentSku = lastSeenParent.sku || lastSeenParent.part_number || lastSeenParent.name;
      }
    }

    const itemObj = {
      tempId: Date.now() + Math.random() + i,
      no: rawNo ? parseInt(rawNo, 10) || null : (finalType === 'PARENT' ? parsedItems.filter(x => x.item_type === 'PARENT').length + 1 : null),
      item_type: finalType,
      sku: generatedSku,
      parent_sku: effectiveParentSku,
      name: cleanedName || rawName,
      raw_name: rawName,
      model: rawModel === '-' ? '' : (rawModel || ''),
      quantity: validQty,
      original_qty: validQty,
      warehouse_quantities: warehouseValues,
      serial_number: '',
      part_number: rawPart || '',
      notes: rawNotes || ''
    };

    if (finalType === 'PARENT') {
      lastSeenParent = itemObj;
    }

    parsedItems.push(itemObj);
  }

  return {
    items: parsedItems,
    detectedWarehouses,
    totalRows: parsedItems.length
  };
};

/**
 * Matches a database project location name to one of the CSV detected warehouse column names.
 * Example: 'คลัง Forth ชั้น 3' -> 'คลัง Forth ชั้น 3', 'โรงงาน C' -> 'คลัง Factory C', 'EMS' -> 'คลัง EMS'
 */
export const matchLocationToWarehouseColumn = (locationName, detectedWarehouses = []) => {
  if (!locationName || !detectedWarehouses || detectedWarehouses.length === 0) return null;
  const cleanLoc = locationName.toLowerCase().replace(/[\s\-_]/g, '');

  // 1. Exact match after whitespace/dash normalization
  const exact = detectedWarehouses.find(wh => wh.toLowerCase().replace(/[\s\-_]/g, '') === cleanLoc);
  if (exact) return exact;

  // 2. Substring containment match
  const sub = detectedWarehouses.find(wh => {
    const cleanWh = wh.toLowerCase().replace(/[\s\-_]/g, '');
    return cleanLoc.includes(cleanWh) || cleanWh.includes(cleanLoc);
  });
  if (sub) return sub;

  // 3. Keyword heuristic match
  const keywordMappings = [
    { keys: ['factoryc', 'factory', 'โรงงานc', 'โรงงาน'], match: 'คลัง Factory C' },
    { keys: ['ems(sap)', 'sap'], match: 'คลัง EMS (SAP)' },
    { keys: ['ems', 'อีเอ็มเอส'], match: 'คลัง EMS' },
    { keys: ['forthชั้น3', 'forth', 'ชั้น3', 'ฟอร์ท'], match: 'คลัง Forth ชั้น 3' },
    { keys: ['โรงรับจำนำ', 'จำนำ', 'pawn'], match: 'ตึกโรงรับจำนำ' }
  ];

  for (const mapping of keywordMappings) {
    if (mapping.keys.some(k => cleanLoc.includes(k))) {
      const found = detectedWarehouses.find(wh => wh.toLowerCase().replace(/[\s\-_]/g, '').includes(mapping.match.toLowerCase().replace(/[\s\-_]/g, '')) || mapping.keys.some(k => wh.toLowerCase().replace(/[\s\-_]/g, '').includes(k)));
      if (found) return found;
    }
  }

  return null;
};

/**
 * Filters and aggregates items list by a selected warehouse source column.
 * If source is 'คงเหลือ' / 'all' / 'total', returns all items with their total remaining balance.
 * If source is a specific warehouse (e.g. 'คลัง Factory C'), returns only items with stock > 0 in that warehouse
 * and sets item.quantity to the warehouse-specific balance.
 */
export const filterAndAggregateWarehouseItems = (
  allItems = [],
  warehouseSource = 'คงเหลือ',
  options = { filterZeroQty: true }
) => {
  if (!allItems || allItems.length === 0) return [];
  const { filterZeroQty = true } = options;

  if (warehouseSource === 'คงเหลือ' || warehouseSource === 'all' || warehouseSource === 'total') {
    return allItems.map((item, idx) => ({
      ...item,
      no: item.item_type === 'PARENT' ? (idx + 1) : null,
      quantity: item.original_qty || item.quantity || 1
    }));
  }

  // Filter items specifically for the target warehouse
  const filtered = [];
  let currentParent = null;

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const whQty = item.warehouse_quantities?.[warehouseSource];
    const numQty = (whQty !== undefined && whQty !== null && !isNaN(whQty)) ? Math.round(whQty) : 0;

    if (filterZeroQty && numQty <= 0) {
      continue; // Skip items that have 0 balance in this specific warehouse
    }

    const effectiveQty = numQty > 0 ? numQty : (item.original_qty || 1);

    const aggregatedItem = {
      ...item,
      quantity: effectiveQty,
      selected_warehouse_source: warehouseSource
    };

    if (aggregatedItem.item_type === 'PARENT') {
      currentParent = aggregatedItem;
    } else if (aggregatedItem.item_type === 'CHILD' && currentParent) {
      // Re-link parent_sku if needed
      aggregatedItem.parent_sku = currentParent.sku || currentParent.part_number || currentParent.name;
    }

    filtered.push(aggregatedItem);
  }

  // Re-number sequence for clean display
  let parentSeq = 1;
  return filtered.map(item => {
    if (item.item_type === 'PARENT') {
      return { ...item, no: parentSeq++ };
    }
    return { ...item, no: null };
  });
};

