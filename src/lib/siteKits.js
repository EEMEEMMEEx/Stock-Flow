import { supabase } from '@/lib/supabase';

// Official BOM Templates definition
export const SITE_BOM_TEMPLATES = [
  {
    category_id: '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba',
    category_name: 'MW (Microwave)',
    code: 'MW',
    icon: 'Radio',
    description: 'ชุดอุปกรณ์ Microwave เชื่อมโยงสัญญาณ',
    bom: [
      { po: 1, part: '30207-0024-04484', name: 'Optix RTN 320F OAU 2F DC ,SLGMSITE05', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 2, part: '30207-0024-04485', name: 'SFP+ Optical Transceiver 9.8G 1310nm LC SM 1.4km', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 3, part: '30207-0024-04486', name: 'OptiX RTN,PI-AC B22,power injector', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 4, part: '30207-0024-04488', name: 'Microwave ODU,RTN XMC,7G,-3E, High', qty: 2, unit: 'ชิ้น', mandatory: true },
      { po: 5, part: '30207-0024-04487', name: 'Microwave ODU,RTN XMC,7G,-3E, Low', qty: 2, unit: 'ชิ้น', mandatory: true },
      { po: 6, part: '30207-0024-04490', name: 'Microwave Antenna, A7WD09MAC-3NX', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 7, part: '30207-0024-04489', name: 'Microwave Antenna, A7WD06MAC-3NX', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 8, part: '30207-0024-04497', name: 'Optical cable assembly  DLC/UPC-DLC/UPC , FDLCUPC10', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 9, part: '30207-0024-04498', name: 'Coaxial Cable ,Copper-clad Aluminium Wire, RF', qty: 3, unit: 'ชิ้น', mandatory: true },
      { po: 10, part: '30207-0024-04499', name: 'Symmetry Twist Cable,100ohm,SFTP CAT5E,', qty: 60, unit: 'เมตร', mandatory: true },
      { po: 11, part: '30207-0024-04500', name: 'Power Cable,600V/1000V,ROV-K, C6025BK01', qty: 60, unit: 'เมตร', mandatory: true },
      { po: 12, part: '30207-0024-04501', name: 'Power Cable,300V/500V,60227 IEC 53, C25ELECBK', qty: 60, unit: 'เมตร', mandatory: true },
      { po: 13, part: '30207-0024-04502', name: 'IF/ODU Installation Accessories(5D). IFODU-5D01', qty: 2, unit: 'ชิ้น', mandatory: true },
      { po: 14, part: '30207-0024-04503', name: 'RF Coaxial Connector At The Cable End,50ohm', qty: 2, unit: 'ชิ้น', mandatory: true },
      { po: 15, part: '30207-0024-04504', name: 'Cable Fixing Clip Set for GPS/Microwave', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 16, part: '30207-0024-04505', name: 'Cable Fixing Clamp, 6 Runs, C-Type Bracket, Fixing', qty: 50, unit: 'ชิ้น', mandatory: true },
      { po: 17, part: '30207-0024-04506', name: 'Ground Clip ,FEEDERCLB03, Huawei', qty: 2, unit: 'ชิ้น', mandatory: true }
    ]
  },
  {
    category_id: '793d55c3-4750-42e1-a82e-438e7be131c8',
    category_name: 'BS (Base Station)',
    code: 'BS',
    icon: 'TowerControl',
    description: 'ชุดอุปกรณ์สถานีแม่ข่ายหลัก',
    bom: [
      { po: 1, part: '30207-0024-01718', name: 'TETRA DIB-R5 outdoor, 1 carrier', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 2, part: '30207-0024-01720', name: 'Outdoor SPD /DC Lightning ZGZD40-18-48YM4', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 3, part: '30207-0024-04413', name: 'TCT-GPS-SS3801  Portable Antenna B1+GPS', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 4, part: '30207-0024-01725', name: 'Lightning arrester for feed line of GPS antenna, MHT-N5-2', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 5, part: '30207-0024-04412', name: 'สายอากาศ SC-488-HF1LDF(D00)', qty: 2, unit: 'ชิ้น', mandatory: true },
      { po: 6, part: '30207-0024-01850', name: 'Jumper_7/16 _male-N_male, L=5m*', qty: 2, unit: 'ชิ้น', mandatory: true },
      { po: 7, part: '30207-0024-03155', name: 'Netsure 2100 A31-S1 (SFA)', qty: 1, unit: 'ชุด', mandatory: true },
      { po: 8, part: '30207-0024-03156', name: 'MODULE48VDC1000watt,R48-1000e3', qty: 2, unit: 'ชิ้น', mandatory: true },
      { po: 9, part: '30207-0024-04377', name: 'HEAT EXCHANGER 65W/K DC HEX', qty: 2, unit: 'ชุด', mandatory: true },
      { po: 10, part: '30207-0024-04302', name: 'VISION_Lithium_Battery_48V_100AH', qty: 1, unit: 'ลูก', mandatory: true }
    ]
  },
  {
    category_id: '3fb47021-6c65-4a4f-bca4-595280d9ba97',
    category_name: 'AGW (Analog Gateway)',
    code: 'AGW',
    icon: 'Router',
    description: 'ชุดอุปกรณ์สถานีเกตเวย์อนาล็อก',
    bom: [
      { po: 1, part: '30207-0024-04415', name: 'SC266-HF4LDF(D00) 156～174MHz', qty: 2, unit: 'ชิ้น', mandatory: true },
      { po: 2, part: '30207-0024-01848', name: 'Connector_N_male_for_LCF12', qty: 4, unit: 'ชิ้น', mandatory: true },
      { po: 3, part: '30207-0024-01849', name: 'Lightning_arrestor,NF-NF', qty: 2, unit: 'ชิ้น', mandatory: true },
      { po: 4, part: '30207-0024-01907', name: 'Jumper_7/16_male-N_female,L=3m', qty: 2, unit: 'ชิ้น', mandatory: true },
      { po: 5, part: '30207-0024-01908', name: 'Grounding_kit_for_1/2"_cable', qty: 2, unit: 'ชิ้น', mandatory: true }
    ]
  },
  {
    category_id: '823af00d-99b0-4d9a-943b-0ae29bc83ff0',
    category_name: 'Fixed Radio (ลูกข่ายประจำที่)',
    code: 'Fixed',
    icon: 'Antenna',
    description: 'ชุดอุปกรณ์สถานีลูกข่ายชนิดประจำที่',
    bom: [
      { po: 1, part: '30207-0024-01774', name: 'MT680 Plus (S) / Tetra Fixed Radio', qty: 1, unit: 'เครื่อง', mandatory: true },
      { po: 2, part: '30207-0024-01779', name: 'สายอากาศ Yagi 406-SF1SNF (ABK)', qty: 1, unit: 'ต้น', mandatory: true },
      { po: 3, part: '30207-0024-04358', name: 'TDB_Series_12V_50Ah_(LWH:230x138x213)mm.', qty: 1, unit: 'ลูก', mandatory: true },
      { po: 4, part: '30207-0024-01848', name: 'Connector_N_male_for_LCF12', qty: 2, unit: 'ชิ้น', mandatory: true },
      { po: 5, part: '30207-0024-01849', name: 'Lightning_arrestor,NF-NF', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 6, part: '30207-0024-01908', name: 'Grounding_kit_for_1/2"_cable', qty: 1, unit: 'ชิ้น', mandatory: true },
      { po: 7, part: '30207-0024-04417', name: 'สายอากาศ SC459-SF1LNF(D00) [806-869MHz]', qty: 2, unit: 'ต้น', mandatory: true }
    ]
  }
];

/**
 * Match a BOM item against the master items catalog across all categories
 * (An item can be shared and used in multiple categories)
 */
function findMatchingItem(items, b) {
  const bName = (b.name || '').toLowerCase().trim();
  const bPart = (b.part || '').toLowerCase().trim();

  // Priority 1: Specific domain exact / canonical name matching
  const byExactSpecific = items.find(i => {
    const iName = (i.name || '').toLowerCase().trim();

    if (bName.includes('sc-488-hf1ldf') && iName.includes('sc-488-hf1ldf')) return true;
    if (bName.includes('sc-488-sf1ldf') && iName.includes('sc-488-sf1ldf')) return true;
    if (bName.includes('jumper_7/16 _male-n_male, l=5m') && iName.includes('jumper_7/16 _male-n_male, l=5m')) return true;
    if (bName.includes('jumper_7/16_male-n_female,l=3m') && iName.includes('jumper_7/16_male-n_female,l=3m')) return true;
    if ((bName.includes('yagi') || bName.includes('406')) && (iName.includes('sy406') || iName.includes('406-sf1snf'))) return true;
    if (bName.includes('mt680') && iName.includes('mt680')) return true;
    if (bName.includes('sc459') && iName.includes('sc459')) return true;
    if (bName.includes('sc266') && iName.includes('sc266')) return true;
    if (bName.includes('tdb') && iName.includes('tdb')) return true;
    if (bName.includes('connector_n_male') && iName.includes('connector_n_male')) return true;
    if (bName.includes('lightning_arrestor') && iName.includes('lightning_arrestor')) return true;
    if (bName.includes('grounding_kit_for_1/2') && iName.includes('grounding_kit_for_1/2')) return true;
    if (bName.includes('pi-ac') && iName.includes('pi-ac')) return true;
    if (bName.includes('optix rtn 320f oau 2f dc') && iName.includes('optix rtn 320f oau 2f dc') && !iName.includes('independent')) return true;
    if (bName.includes('microwave odu') && bName.includes('high') && iName.includes('high')) return true;
    if (bName.includes('microwave odu') && bName.includes('low') && iName.includes('low')) return true;
    if (bName.includes('microwave antenna') && bName.includes('09mac') && iName.includes('09mac')) return true;
    if (bName.includes('microwave antenna') && bName.includes('06mac') && iName.includes('06mac')) return true;
    if (bName.includes('tetra dib-r5') && iName.includes('dib-r5')) return true;
    if (bName.includes('outdoor spd') && iName.includes('spd')) return true;
    if (bName.includes('tct-gps') && iName.includes('tct-gps')) return true;
    if (bName.includes('netsure 2100') && iName.includes('netsure 2100')) return true;
    if (bName.includes('module48vdc1000watt') && iName.includes('r48-1000e3')) return true;
    if (bName.includes('heat exchanger') && iName.includes('heat exchanger')) return true;
    if (bName.includes('vision_lithium') && iName.includes('vision_lithium')) return true;

    return false;
  });
  if (byExactSpecific) return byExactSpecific;

  // Priority 2: Match by exact SKU / Part Number
  if (bPart) {
    const bySku = items.find(i => {
      const iSku = (i.sku || '').toLowerCase().trim();
      const iDesc = (i.description || '').toLowerCase().trim();
      const iName = (i.name || '').toLowerCase().trim();
      return iSku === bPart || iSku.includes(bPart) || iDesc.includes(bPart) || iName.includes(bPart);
    });
    if (bySku) return bySku;
  }

  // Priority 3: Fallback exact / normalized substring
  return items.find(i => {
    const iName = (i.name || '').toLowerCase().trim();
    return iName === bName || iName.includes(bName) || bName.includes(iName);
  });
}

/**
 * Fetch real-time site kits availability across all categories and warehouses
 * @param {string|null} projectId - Optional project UUID to filter stock by project/location
 * @returns {Promise<Array>} List of category BOM availability objects
 */
export async function fetchSiteKitsAvailability(projectId = null) {
  try {
    // 1. Fetch all items (cross-category) and stock balance
    const [itemsRes, stockRes] = await Promise.all([
      supabase.from('items').select('*'),
      projectId 
        ? supabase.from('stock_balance').select('*').eq('project_id', projectId)
        : supabase.from('stock_balance').select('*')
    ]);

    const items = itemsRes.data || [];
    const stock = stockRes.data || [];

    const stockMap = {};
    stock.forEach(s => {
      stockMap[s.item_id] = (stockMap[s.item_id] || 0) + Number(s.balance || 0);
    });

    const summaryKPI = [];

    for (const template of SITE_BOM_TEMPLATES) {
      let minSets = Infinity;
      const itemsDetail = [];

      for (const b of template.bom) {
        const match = findMatchingItem(items, b);
        const totalStock = match ? (stockMap[match.id] || 0) : 0;
        const setsPossible = Math.floor(totalStock / b.qty);
        
        if (b.mandatory && setsPossible < minSets) {
          minSets = setsPossible;
        }

        itemsDetail.push({
          po_seq: b.po,
          part_number: b.part,
          bom_name: b.name,
          db_matched_name: match ? match.name : '(ยังไม่พบในระบบ)',
          qty_per_site: b.qty,
          unit: b.unit,
          total_stock: totalStock,
          sets_possible: setsPossible,
          is_mandatory: b.mandatory,
          missing_for_next_set: Math.max(0, ((minSets === Infinity ? 0 : minSets) + 1) * b.qty - totalStock)
        });
      }

      if (minSets === Infinity) minSets = 0;

      const bottleneckItems = itemsDetail.filter(i => i.is_mandatory && i.sets_possible === minSets);

      summaryKPI.push({
        category_id: template.category_id,
        category_name: template.category_name,
        code: template.code,
        complete_sets: minSets,
        bottlenecks: bottleneckItems.map(i => i.bom_name),
        bottleneck_details: bottleneckItems.map(i => 
          `${i.bom_name} (คงเหลือ: ${i.total_stock} ${i.unit}, ใช้: ${i.qty_per_site} ${i.unit}/ไซต์)`
        ),
        total_items_in_bom: itemsDetail.length,
        items: itemsDetail
      });
    }

    return summaryKPI;
  } catch (error) {
    console.error('Error fetching site kits availability:', error);
    return [];
  }
}
