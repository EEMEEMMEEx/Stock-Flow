// Post-apply verification for Multi-Warehouse migration 80 against the LIVE database.
//
//   npm run verify:multi-warehouse-applied
//
// Uses the Supabase service-role key from .env (never printed) to prove the
// deployed schema really has the per-line source warehouse: columns, NOT NULL,
// FK target, backfilled rows and a reachable approve_inventory_request RPC.
//
// Read-only: it never inserts, updates or deletes a row.
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let failures = 0;
const rows = [];
const check = (label, pass, detail = '') => {
  if (!pass) failures += 1;
  rows.push({ status: pass ? 'PASS' : 'FAIL', label, detail: pass ? '' : detail });
};
const info = (label, detail) => rows.push({ status: 'INFO', label, detail });

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[SKIP] ต้องมี VITE_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env ก่อนรัน');
  process.exit(2);
}

const headers = { apikey: serviceRoleKey, Authorization: 'Bearer ' + serviceRoleKey };

async function rest(path, extra = {}) {
  const res = await fetch(supabaseUrl + '/rest/v1/' + path, { headers: { ...headers, ...extra } });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: res.status, range: res.headers.get('content-range'), json, text };
}

// 1. Columns exist and are readable
const columns = await rest('withdrawal_items?select=id,project_id,storage_location_id&limit=1');
check('withdrawal_items.project_id + storage_location_id อ่านได้', columns.status === 200,
  'status=' + columns.status + ' body=' + columns.text.slice(0, 160));

// 2. NOT NULL + FK target (PostgREST exposes both through the OpenAPI document)
const specRes = await fetch(supabaseUrl + '/rest/v1/', {
  headers: { ...headers, Accept: 'application/openapi+json' },
});
const spec = specRes.status === 200 ? await specRes.json() : null;
const definitions = spec?.definitions || {};
const itemDef = definitions.withdrawal_items;
const projectProp = itemDef?.properties?.project_id?.description || '';
check('project_id เป็น NOT NULL (อยู่ใน required list)', Boolean(itemDef?.required?.includes('project_id')),
  'required=' + JSON.stringify(itemDef?.required));
check('project_id มี FK ไป projects', projectProp.includes('Foreign Key to `projects.id`'),
  'description=' + projectProp.slice(0, 120));
check('storage_location_id มี FK ไป storage_locations',
  (itemDef?.properties?.storage_location_id?.description || '').includes('Foreign Key to `storage_locations.id`'));

// 3. No row was left without a source warehouse
const nulls = await rest('withdrawal_items?select=id&project_id=is.null', { Prefer: 'count=exact', Range: '0-0' });
const nullCount = Number((nulls.range || '').split('/')[1]);
check('ไม่มีแถวที่ project_id IS NULL', nullCount === 0, 'count=' + (Number.isFinite(nullCount) ? nullCount : nulls.range));

// 4. Legacy rows were backfilled from their order; newer multi-warehouse rows may
//    intentionally differ, so only the "no row lost its warehouse" invariant is hard.
const orders = await rest('withdrawal_orders?select=id,project_id&limit=1000');
const items = await rest('withdrawal_items?select=id,order_id,project_id&limit=2000');
const orderById = new Map((orders.json || []).map((o) => [o.id, o]));
let mismatched = 0;
let orphan = 0;
for (const item of items.json || []) {
  const order = orderById.get(item.order_id);
  if (!order) { orphan += 1; continue; }
  if (item.project_id !== order.project_id) mismatched += 1;
}
check('ทุกบรรทัดผูกกับใบเบิกที่มีอยู่จริง (ไม่ orphan)', orphan === 0, 'orphan=' + orphan);
info('บรรทัดที่คลังต้นทางต่างจากหัวใบเบิก (multi-warehouse จริง)',
  mismatched + ' / ' + (items.json || []).length + ' แถว');

// 5. RPC must exist and enforce authentication (function body cannot be read over REST)
const rpc = await fetch(supabaseUrl + '/rest/v1/rpc/approve_inventory_request', {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_request_id: '00000000-0000-0000-0000-000000000000' }),
});
const rpcBody = await rpc.text();
check('public.approve_inventory_request ตอบและบังคับสิทธิ์',
  rpcBody.includes('Unauthorized'), 'status=' + rpc.status + ' body=' + rpcBody.slice(0, 160));
info('หมายเหตุ', 'body ของ RPC/trigger/index ยืนยันผ่าน REST ไม่ได้ — ใช้ SQL Editor หรือ E2E');

// --- report -----------------------------------------------------------------
console.log('==================================================================');
console.log('   Multi-Warehouse migration 80 — post-apply live verification      ');
console.log('==================================================================');
for (const row of rows) {
  console.log('[' + row.status + '] ' + row.label + (row.detail ? ' - ' + row.detail : ''));
}
console.log('------------------------------------------------------------------');
console.log('Total: ' + rows.length + ' checks, failed: ' + failures);

if (failures > 0) {
  console.error('[FAIL] Migration 80 ยังไม่สมบูรณ์บนฐานข้อมูลนี้');
  process.exit(1);
}
console.log('[PASS] Migration 80 พร้อมใช้งานบนฐานข้อมูลนี้');
