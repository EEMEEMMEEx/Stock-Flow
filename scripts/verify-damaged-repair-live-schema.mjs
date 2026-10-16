// Live preflight + post-apply verification for migration 82
// (docs/partial-damage-component-repair-plan.md §6.1/§8.1)
//
//   npm run verify:damaged-repair-live                      → preflight (ต้องผ่าน) + สถานะการ apply
//   npm run verify:damaged-repair-live -- --require-applied  → บังคับว่าต้อง apply แล้ว (exit 1 ถ้ายัง)
//
// ทำงานผ่าน PostgREST/OpenAPI ด้วย service-role key จาก .env (ไม่พิมพ์ secret)
// READ-ONLY: ไม่มีการ insert/update/delete และไม่เรียก RPC ที่เขียนข้อมูล
import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const requireApplied = process.argv.includes('--require-applied');

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

async function rest(path) {
  const res = await fetch(supabaseUrl + '/rest/v1/' + path, { headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep raw text */ }
  return { status: res.status, text, json };
}

// ---------------------------------------------------------------------------
// 1. ตาราง/คอลัมน์ที่ migration 82 อ้างถึง ต้องมีอยู่จริงบนฐานข้อมูลนี้
// ---------------------------------------------------------------------------
const REQUIRED = {
  checkout_return_logs: [
    'id', 'checkout_order_id', 'checkout_item_id', 'returned_quantity', 'item_condition',
    'destination_project_id', 'damage_notes', 'replaced_serial_number',
    'caim_repair_result', 'caim_closed_at', 'caim_inbound_processed_at',
    'caim_stock_in_order_id', 'caim_scrap_disposal_id',
  ],
  checkout_items: ['id', 'checkout_order_id', 'item_id', 'serial_number'],
  checkout_orders: ['id', 'order_number', 'project_id'],
  items: ['id', 'name', 'unit'],
  projects: ['id', 'name'],
  storage_locations: ['id', 'name'],
  stock_in_orders: ['id', 'project_id', 'storage_location_id', 'supplier', 'po_number', 'notes', 'received_date', 'created_by'],
  stock_in_items: ['order_id', 'item_id', 'quantity', 'serial_number', 'notes'],
  stock_transactions: [
    'project_id', 'storage_location_id', 'item_id', 'quantity', 'transaction_type',
    'reference_type', 'reference_id', 'created_by', 'notes',
  ],
  stock_balance: ['project_id', 'item_id', 'item_name', 'unit', 'project_name', 'balance'],
  scrap_disposal_items: [
    'checkout_return_log_id', 'checkout_order_id', 'project_id', 'item_id',
    'quantity', 'serial_number', 'reason', 'disposal_method', 'notes',
  ],
  permissions: ['id', 'code'],
  profiles: ['id', 'status', 'role', 'role_id'],
};

const specRes = await fetch(supabaseUrl + '/rest/v1/', {
  headers: { ...headers, Accept: 'application/openapi+json' },
});
const spec = specRes.status === 200 ? await specRes.json() : null;
const definitions = spec?.definitions || {};

for (const [table, columns] of Object.entries(REQUIRED)) {
  const def = definitions[table];
  check('ตาราง ' + table + ' มีอยู่จริง', Boolean(def), 'ไม่พบใน OpenAPI definitions');
  if (!def) continue;
  const missing = columns.filter((column) => !(column in (def.properties || {})));
  check('คอลัมน์ที่ migration 82 ใช้ใน ' + table + ' ครบ (' + columns.length + ')', missing.length === 0,
    'ขาด: ' + missing.join(', '));
}

// กัน SQL drift: ตารางที่ถูกอ้างในไฟล์ migration ต้องอยู่ในรายการที่ตรวจไว้ด้านบน
// ตัดบรรทัดคอมเมนต์ออกก่อน (rollback block ในคอมเมนต์มีชื่อ index ที่ขึ้นต้นด้วย public.)
const migrationSql = readFileSync(new URL('../supabase/migrations/82_damaged_return_repair_resolution.sql', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');
const referencedTables = [...new Set([...migrationSql.matchAll(/public\.([a-z_]+)/g)].map((match) => match[1]))]
  .filter((name) => !['has_permission', 'is_super_admin', 'resolve_damaged_return_item'].includes(name));
const undeclared = referencedTables.filter((table) => !(table in REQUIRED));
check('ทุกตารางที่ migration 82 อ้างถึงถูกตรวจในสคริปต์นี้', undeclared.length === 0,
  'ยังไม่ถูกตรวจ: ' + undeclared.join(', '));

// ---------------------------------------------------------------------------
// 2. Permissions ที่ RPC ใช้ตรวจสิทธิ์ ต้องมีอยู่ในทะเบียนจริง
// ---------------------------------------------------------------------------
const perms = await rest('permissions?select=code&code=in.(checkouts.return,stock_in.create)');
const permCodes = (perms.json || []).map((row) => row.code);
check('permissions มี checkouts.return', permCodes.includes('checkouts.return'), JSON.stringify(permCodes));
check('permissions มี stock_in.create', permCodes.includes('stock_in.create'), JSON.stringify(permCodes));

// ---------------------------------------------------------------------------
// 3. transaction_type ที่ RPC ใช้ ('stock_in' / 'stock_out') ถูกใช้จริงใน ledger
// ---------------------------------------------------------------------------
const ledgerIn = await rest('stock_transactions?select=id&transaction_type=eq.stock_in&limit=1');
const ledgerOut = await rest('stock_transactions?select=id&transaction_type=eq.stock_out&limit=1');
check("ledger เดิมมี transaction_type 'stock_in'", (ledgerIn.json || []).length === 1);
check("ledger เดิมมี transaction_type 'stock_out'", (ledgerOut.json || []).length === 1);

// ---------------------------------------------------------------------------
// 4. ข้อมูลกรณีศึกษา (read-only) สำหรับการทดสอบ §8.1
// ---------------------------------------------------------------------------
const caseOrder = await rest('checkout_orders?select=id,order_number,status&order_number=eq.CHK-202610-3252');
const caseOrderRow = (caseOrder.json || [])[0] || null;
check('พบใบยืมกรณีศึกษา CHK-202610-3252', Boolean(caseOrderRow), 'status=' + caseOrder.status);

const repairLogs = await rest('checkout_return_logs?select=id,item_condition,returned_quantity&item_condition=in.(damaged,needs_repair)&order=returned_at.desc&limit=20');
info('รายการรับคืนสภาพชำรุด/ส่งซ่อมทั้งระบบ', (repairLogs.json || []).length + ' แถว');

// ---------------------------------------------------------------------------
// 5. สถานะการ apply migration 82
// ---------------------------------------------------------------------------
const repairColumns = [
  'repair_resolution_status', 'repair_notes', 'repair_resolved_at', 'repair_resolved_by',
  'restored_stock_in_order_id', 'repair_scrap_disposal_id', 'spare_part_item_id', 'spare_part_quantity',
];
const returnLogDef = definitions.checkout_return_logs;
const presentColumns = repairColumns.filter((column) => returnLogDef && column in (returnLogDef.properties || {}));
const applied = presentColumns.length === repairColumns.length;

if (applied) {
  check('คอลัมน์ผลการซ่อมทั้ง 8 ถูก apply แล้ว', true);
  for (const [column, target] of [
    ['restored_stock_in_order_id', 'stock_in_orders.id'],
    ['repair_scrap_disposal_id', 'scrap_disposal_items.id'],
    ['spare_part_item_id', 'items.id'],
  ]) {
    const description = returnLogDef?.properties?.[column]?.description || '';
    check(column + ' มี FK ไป ' + target, description.includes('Foreign Key to ' + target), 'description=' + description.slice(0, 120));
  }
  info('หมายเหตุ', 'CHECK constraint ของ repair_resolution_status ตรวจผ่าน REST ไม่ได้ — ดูผลจาก smoke test');
} else {
  info('สถานะ', 'ยังไม่ได้ apply migration 82 (คอลัมน์ที่มี: ' + (presentColumns.join(', ') || 'ไม่มี') + ')');
}

// RPC probe: มีฟังก์ชันหรือยัง + ปฏิเสธผู้เรียกที่ไม่มี auth.uid()
const rpcRes = await fetch(supabaseUrl + '/rest/v1/rpc/resolve_damaged_return_item', {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_payload: {} }),
});
const rpcBody = await rpcRes.text();
const rpcExists = rpcBody.includes('Unauthorized');
const rpcMissing = rpcBody.includes('Could not find the function') || rpcBody.includes('PGRST202');

if (applied) {
  check('public.resolve_damaged_return_item มีอยู่และปฏิเสธผู้เรียกที่ไม่มีสิทธิ์', rpcExists,
    'status=' + rpcRes.status + ' body=' + rpcBody.slice(0, 160));
} else {
  check('RPC ยังไม่มีบนฐานข้อมูลนี้ (ตรงกับสถานะที่ยังไม่ apply)', rpcMissing || !rpcExists,
    'status=' + rpcRes.status + ' body=' + rpcBody.slice(0, 160));
}

if (requireApplied && !applied) {
  failures += 1;
  rows.push({ status: 'FAIL', label: 'ต้อง apply migration 82 ก่อน (--require-applied)', detail: '' });
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------
console.log('==================================================================');
console.log('   Migration 82 — live schema preflight / post-apply verification   ');
console.log('==================================================================');
for (const row of rows) {
  console.log('[' + row.status + '] ' + row.label + (row.detail ? ' - ' + row.detail : ''));
}
console.log('------------------------------------------------------------------');
console.log('Total: ' + rows.length + ' checks, failed: ' + failures);

if (failures > 0) {
  console.error('[FAIL] migration 82 ยังไม่พร้อม/ไม่สมบูรณ์บนฐานข้อมูลนี้');
  process.exit(1);
}
console.log(applied
  ? '[PASS] migration 82 พร้อมใช้งานบนฐานข้อมูลนี้'
  : '[PASS] preflight ผ่าน — ยังไม่ได้ apply migration 82 (รัน node scripts/apply-migration-82.mjs --yes)');
