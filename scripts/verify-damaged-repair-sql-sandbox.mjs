// Deep verification ของ migration 82 ด้วย Postgres จริงใน sandbox (PGlite / WASM)
//   npm run verify:damaged-repair-sql
//
// ตรวจอะไร: รันไฟล์ migration 82 กับ Postgres จริง (ไม่ใช่ production) แล้วรัน smoke test ของโปรเจกต์
//   (supabase/tests/82_damaged_repair_resolution.smoke.sql) พร้อม assertions เชิงตัวเลข:
//   stock_balance +1, ตัดสต็อกอะไหล่ย่อย -1, ledger repair_restored/repair_spare_part, เอกสารรับเข้า,
//   การกันกดซ้ำ (Idempotent), กรณีแทงจำหน่าย (สต็อกไม่เปลี่ยน), กรณีแยกอะไหล่ + รับเข้าชิ้นส่วน,
//   การปฏิเสธ resolution ที่ไม่รองรับ และการปฏิเสธผู้เรียกที่ไม่มี auth.uid()
//
// ไม่แตะ production: ใช้ schema จำลอง (supabase/tests/fixtures/mock_supabase_schema.sql) ในหน่วยความจำ
//
// Dependency เป็น optional (ไม่ผูกกับ package.json ของแอป):
//   npm install --prefix test-results/pglite-env @electric-sql/pglite
// ถ้ายังไม่ติดตั้ง สคริปต์จะรายงาน [SKIP] แล้วออกด้วย exit 2
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');
const FIXTURE = path.resolve('supabase/tests/fixtures/mock_supabase_schema.sql');

async function loadPGlite() {
  if (existsSync(PGLITE_ENTRY)) {
    const mod = await import(pathToFileURL(PGLITE_ENTRY).href);
    return mod.PGlite;
  }
  try {
    const mod = await import('@electric-sql/pglite');
    return mod.PGlite;
  } catch {
    return null;
  }
}

const PGlite = await loadPGlite();
if (!PGlite) {
  console.error('[SKIP] ยังไม่ได้ติดตั้ง PGlite (optional) — ติดตั้งด้วยคำสั่ง:');
  console.error('       npm install --prefix test-results/pglite-env @electric-sql/pglite');
  process.exit(2);
}

const SCHEMA = readFileSync(FIXTURE, 'utf8');
const MIGRATION = readFileSync('supabase/migrations/82_damaged_return_repair_resolution.sql', 'utf8');
const SMOKE = readFileSync('supabase/tests/82_damaged_repair_resolution.smoke.sql', 'utf8');

const ACTOR = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';
const LOCATION = '33333333-3333-3333-3333-333333333333';
const ITEM_MAIN = '44444444-4444-4444-4444-444444444444';
const ITEM_MAIN2 = '55555555-5555-5555-5555-555555555555';
const ITEM_MAIN3 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ITEM_FAN = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ITEM_SPARE = '66666666-6666-6666-6666-666666666666';
const ORDER = '77777777-7777-7777-7777-777777777777';
const CI1 = '88888888-8888-8888-8888-888888888888';
const CI2 = '99999999-9999-9999-9999-999999999999';
const RL1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RL2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CI3 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const RL3 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const STAFF = '12121212-1212-1212-1212-121212121212';
const ROLE_STAFF = '13131313-1313-1313-1313-131313131313';
const PERM_RETURN = '15151515-1515-1515-1515-151515151515';
const PERM_STOCKIN = '16161616-1616-1616-1616-161616161616';
const CAIM_ORDER = 'd4d4d4d4-0000-0000-0000-0000000000c4';
const ITEM_T4 = 'a4a4a4a4-0000-0000-0000-000000000004';
const ITEM_T5 = 'a5a5a5a5-0000-0000-0000-000000000005';
const ITEM_T6 = 'a6a6a6a6-0000-0000-0000-000000000006';
const ITEM_T7 = 'a7a7a7a7-0000-0000-0000-000000000007';
const CI4 = 'b4b4b4b4-0000-0000-0000-000000000004';
const CI5 = 'b5b5b5b5-0000-0000-0000-000000000005';
const CI6 = 'b6b6b6b6-0000-0000-0000-000000000006';
const CI7 = 'b7b7b7b7-0000-0000-0000-000000000007';
const RL4 = 'c4c4c4c4-0000-0000-0000-000000000004';
const RL5 = 'c5c5c5c5-0000-0000-0000-000000000005';
const RL6 = 'c6c6c6c6-0000-0000-0000-000000000006';
const RL7 = 'c7c7c7c7-0000-0000-0000-000000000007';

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' — ' + detail : ''));
};

const db = new PGlite();

async function main() {
  await db.exec(SCHEMA);
  console.log('schema mirror สร้างแล้ว');

  await db.exec(
    "INSERT INTO auth.users (id, email) VALUES ('" + ACTOR + "', 'admin@stockflow.com');" +
    "INSERT INTO public.profiles (id, status, role) VALUES ('" + ACTOR + "', 'active', 'SUPER');" +
    "INSERT INTO public.projects (id, name, project_code) VALUES ('" + PROJECT + "', 'DOPA-DTRS | USO-SHF', '20317');" +
    "INSERT INTO public.storage_locations (id, name) VALUES ('" + LOCATION + "', 'Forth ชั้น 3');" +
    "INSERT INTO public.items (id, name, unit) VALUES " +
    "  ('" + ITEM_MAIN + "', 'HEAT EXCHANGER 65W/K DC HEX', 'ชิ้น')," +
    "  ('" + ITEM_MAIN2 + "', 'HEAT EXCHANGER 65W/K DC HEX (ตัวที่ 2)', 'ชิ้น')," +
    "  ('" + ITEM_MAIN3 + "', 'HEAT EXCHANGER 65W/K DC HEX (ตัวที่ 3)', 'ชิ้น')," +
    "  ('" + ITEM_FAN + "', 'พัดลม DC Fan สำหรับ HEAT EXCHANGER', 'ชิ้น')," +
    "  ('" + ITEM_SPARE + "', 'Control Board สำหรับ HEAT EXCHANGER', 'ชิ้น');" +
    "INSERT INTO public.checkout_orders (id, order_number, project_id, status, borrower_name) VALUES " +
    "  ('" + ORDER + "', 'CHK-202610-3252', '" + PROJECT + "', 'completed', 'Wisitsak Porkpermdee');" +
    "INSERT INTO public.checkout_items (id, checkout_order_id, item_id, serial_number, quantity_borrowed, quantity_returned, quantity_damaged, status) VALUES " +
    "  ('" + CI1 + "', '" + ORDER + "', '" + ITEM_MAIN + "', 'HEX-0001', 1, 0, 1, 'returned')," +
    "  ('" + CI2 + "', '" + ORDER + "', '" + ITEM_MAIN2 + "', 'HEX-0002', 1, 0, 1, 'returned')," +
    "  ('" + CI3 + "', '" + ORDER + "', '" + ITEM_MAIN3 + "', 'HEX-0003', 1, 0, 1, 'returned');" +
    "INSERT INTO public.checkout_return_logs (id, checkout_order_id, checkout_item_id, returned_quantity, item_condition, destination_project_id, damage_notes, returned_at) VALUES " +
    "  ('" + RL1 + "', '" + ORDER + "', '" + CI1 + "', 1, 'needs_repair', '" + PROJECT + "', 'บอร์ด control เสียหาย', now())," +
    "  ('" + RL2 + "', '" + ORDER + "', '" + CI2 + "', 1, 'needs_repair', '" + PROJECT + "', 'บอร์ด control เสียหาย', now() - interval '1 day')," +
    "  ('" + RL3 + "', '" + ORDER + "', '" + CI3 + "', 1, 'needs_repair', '" + PROJECT + "', 'บอร์ด control เสียหาย', now() - interval '2 day');" +
    // อะไหล่มีของในคลัง 5 ชิ้น (ผ่านเอกสารรับเข้าจริง เพื่อให้ stock_balance คำนวณได้)
    "INSERT INTO public.stock_in_orders (id, project_id, storage_location_id, supplier, received_date, created_by) VALUES " +
    "  (gen_random_uuid(), '" + PROJECT + "', '" + LOCATION + "', 'Seed', CURRENT_DATE, '" + ACTOR + "');" +
    "INSERT INTO public.stock_in_items (order_id, item_id, quantity, notes) " +
    "  SELECT id, '" + ITEM_SPARE + "', 5, 'seed อะไหล่' FROM public.stock_in_orders WHERE supplier = 'Seed';" +
    // สิทธิ์ + ผู้ใช้ที่ active แต่ไม่มีสิทธิ์ (ทดสอบสาขา authorization)
    "INSERT INTO public.permissions (id, code) VALUES " +
    "  ('" + PERM_RETURN + "', 'checkouts.return'), ('" + PERM_STOCKIN + "', 'stock_in.create');" +
    "INSERT INTO auth.users (id, email) VALUES ('" + STAFF + "', 'staff@stockflow.com');" +
    "INSERT INTO public.profiles (id, status, role, role_id) VALUES ('" + STAFF + "', 'active', 'STAFF', '" + ROLE_STAFF + "');" +
    // เอกสารรับเข้าที่ CAIM สร้างไว้ก่อน migration (ทดสอบ backfill กันนับสต็อกซ้ำ)
    "INSERT INTO public.stock_in_orders (id, project_id, storage_location_id, supplier, received_date, created_by) VALUES " +
    "  ('" + CAIM_ORDER + "', '" + PROJECT + "', '" + LOCATION + "', 'CAIM Claim Return CLM-1', CURRENT_DATE, '" + ACTOR + "');" +
    "INSERT INTO public.items (id, name, unit) VALUES " +
    "  ('" + ITEM_T4 + "', 'HEAT EXCHANGER (CAIM ปิดเคสแล้ว)', 'ชิ้น')," +
    "  ('" + ITEM_T5 + "', 'HEAT EXCHANGER (คืนสภาพปกติ)', 'ชิ้น')," +
    "  ('" + ITEM_T6 + "', 'HEAT EXCHANGER (CAIM ค้างสถานะ)', 'ชิ้น')," +
    "  ('" + ITEM_T7 + "', 'HEAT EXCHANGER (validation)', 'ชิ้น');" +
    "INSERT INTO public.checkout_items (id, checkout_order_id, item_id, serial_number, quantity_borrowed, quantity_damaged, status) VALUES " +
    "  ('" + CI4 + "', '" + ORDER + "', '" + ITEM_T4 + "', 'HEX-T4', 1, 1, 'returned')," +
    "  ('" + CI5 + "', '" + ORDER + "', '" + ITEM_T5 + "', 'HEX-T5', 1, 0, 'returned')," +
    "  ('" + CI6 + "', '" + ORDER + "', '" + ITEM_T6 + "', 'HEX-T6', 1, 1, 'returned')," +
    "  ('" + CI7 + "', '" + ORDER + "', '" + ITEM_T7 + "', 'HEX-T7', 1, 1, 'returned');" +
    "INSERT INTO public.checkout_return_logs (id, checkout_order_id, checkout_item_id, returned_quantity, item_condition, destination_project_id, damage_notes, returned_at, caim_repair_result, caim_inbound_processed_at, caim_stock_in_order_id) VALUES " +
    "  ('" + RL4 + "', '" + ORDER + "', '" + CI4 + "', 1, 'needs_repair', '" + PROJECT + "', 'CAIM ซ่อมเสร็จ', now() - interval '3 day', 'repaired', now() - interval '3 day', '" + CAIM_ORDER + "')," +
    "  ('" + RL6 + "', '" + ORDER + "', '" + CI6 + "', 1, 'needs_repair', '" + PROJECT + "', 'CAIM ค้างสถานะ', now() - interval '5 day', NULL, NULL, '" + CAIM_ORDER + "');" +
    "INSERT INTO public.checkout_return_logs (id, checkout_order_id, checkout_item_id, returned_quantity, item_condition, destination_project_id, damage_notes, returned_at) VALUES " +
    "  ('" + RL5 + "', '" + ORDER + "', '" + CI5 + "', 1, 'normal', '" + PROJECT + "', NULL, now() - interval '4 day')," +
    "  ('" + RL7 + "', '" + ORDER + "', '" + CI7 + "', 1, 'needs_repair', '" + PROJECT + "', 'validation case', now() - interval '6 day');"
  );

  // 1) apply migration (ครั้งแรก)
  try {
    await db.exec(MIGRATION);
    record('รัน migration 82 บน Postgres จริงได้โดยไม่ error', true);
  } catch (err) {
    record('รัน migration 82 บน Postgres จริงได้โดยไม่ error', false, err.message);
    throw err;
  }

  // 2) apply ซ้ำ (idempotent)
  try {
    await db.exec(MIGRATION);
    record('รัน migration 82 ซ้ำได้ (idempotent: IF NOT EXISTS / CREATE OR REPLACE)', true);
  } catch (err) {
    record('รัน migration 82 ซ้ำได้ (idempotent)', false, err.message);
  }

  // 3) คอลัมน์ + constraint + RPC ถูกสร้างจริง
  const cols = await db.query(
    "SELECT column_name, is_nullable FROM information_schema.columns " +
    "WHERE table_schema='public' AND table_name='checkout_return_logs' " +
    "AND column_name IN ('repair_resolution_status','repair_notes','repair_resolved_at','repair_resolved_by','restored_stock_in_order_id','repair_scrap_disposal_id','spare_part_item_id','spare_part_quantity')"
  );
  record('คอลัมน์ผลการซ่อมถูกสร้างครบ 8 คอลัมน์', cols.rows.length === 8, 'found=' + cols.rows.length);
  const def = await db.query(
    "SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='checkout_return_logs' AND column_name='repair_resolution_status'"
  );
  record("ค่าเริ่มต้นของ repair_resolution_status = 'unresolved'", /unresolved/.test(def.rows[0] ? def.rows[0].column_default || '' : ''), String(def.rows[0] && def.rows[0].column_default));
  const cons = await db.query(
    "SELECT conname FROM pg_constraint WHERE conrelid='public.checkout_return_logs'::regclass AND conname LIKE '%repair%'"
  );
  record('CHECK constraint ของสถานะผลการซ่อมถูกสร้าง', cons.rows.length >= 1, cons.rows.map(function (r) { return r.conname; }).join(', '));

  // 4) รัน smoke test ของโปรเจกต์ (BEGIN … ROLLBACK) ด้วยข้อมูลจำลอง
  try {
    await db.exec(SMOKE);
    record('smoke test ของโปรเจกต์ (supabase/tests/*.smoke.sql) ผ่านครบทุก assertion', true);
  } catch (err) {
    record('smoke test ของโปรเจกต์ผ่านครบทุก assertion', false, err.message);
  }

  // 5) ตัวเลขจริง: stock_balance ก่อน/หลัง + ledger + idempotency + scrap
  await db.exec('BEGIN');
  await db.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ACTOR, role: 'authenticated' })]);

  const uid = await db.query('SELECT auth.uid() AS uid');
  record('จำลอง auth.uid() ได้', uid.rows[0].uid === ACTOR, String(uid.rows[0].uid));

  const before = await db.query(
    'SELECT COALESCE(MAX(balance),0)::int AS b FROM public.stock_balance WHERE project_id=$1 AND item_id=$2',
    [PROJECT, ITEM_MAIN]
  );
  const spareBefore = await db.query(
    'SELECT COALESCE(MAX(balance),0)::int AS b FROM public.stock_balance WHERE project_id=$1 AND item_id=$2',
    [PROJECT, ITEM_SPARE]
  );

  const payload = {
    return_log_id: RL1,
    resolution: 'restored_to_stock',
    project_id: PROJECT,
    quantity: 1,
    repair_notes: 'เปลี่ยนบอร์ด Control ใหม่ (sandbox)',
    reference_number: 'PO-TEST-1',
    spare_part_item_id: ITEM_SPARE,
    spare_part_quantity: 1,
  };
  const call = await db.query('SELECT public.resolve_damaged_return_item($1::jsonb) AS r', [JSON.stringify(payload)]);
  const rpcResult = call.rows[0].r;

  const after = await db.query(
    'SELECT COALESCE(MAX(balance),0)::int AS b FROM public.stock_balance WHERE project_id=$1 AND item_id=$2',
    [PROJECT, ITEM_MAIN]
  );
  const spareAfter = await db.query(
    'SELECT COALESCE(MAX(balance),0)::int AS b FROM public.stock_balance WHERE project_id=$1 AND item_id=$2',
    [PROJECT, ITEM_SPARE]
  );

  record('RPC คืน success + resolution ถูกต้อง', rpcResult && rpcResult.success === true && rpcResult.resolution === 'restored_to_stock', JSON.stringify(rpcResult).slice(0, 160));
  record('stock_balance ของอุปกรณ์หลัก +1', Number(after.rows[0].b) === Number(before.rows[0].b) + 1,
    'before=' + before.rows[0].b + ' after=' + after.rows[0].b);
  record('ตัดสต็อกอะไหล่ย่อย -1', Number(spareAfter.rows[0].b) === Number(spareBefore.rows[0].b) - 1,
    'spare before=' + spareBefore.rows[0].b + ' after=' + spareAfter.rows[0].b);

  const ledger = await db.query(
    "SELECT transaction_type, reference_type, quantity FROM public.stock_transactions WHERE reference_id=$1 ORDER BY reference_type",
    [RL1]
  );
  record('ledger มี stock_in/repair_restored และ stock_out/repair_spare_part',
    ledger.rows.some(function (r) { return r.transaction_type === 'stock_in' && r.reference_type === 'repair_restored' && Number(r.quantity) === 1; }) &&
    ledger.rows.some(function (r) { return r.transaction_type === 'stock_out' && r.reference_type === 'repair_spare_part' && Number(r.quantity) === 1; }),
    JSON.stringify(ledger.rows));

  const logRow = await db.query(
    'SELECT repair_resolution_status, repair_resolved_by, restored_stock_in_order_id, spare_part_item_id, spare_part_quantity FROM public.checkout_return_logs WHERE id=$1',
    [RL1]
  );
  record('อัปเดตสถานะ return log พร้อมผู้บันทึก/เอกสารรับเข้า/อะไหล่',
    logRow.rows[0].repair_resolution_status === 'restored_to_stock' &&
    logRow.rows[0].repair_resolved_by === ACTOR &&
    Boolean(logRow.rows[0].restored_stock_in_order_id) &&
    logRow.rows[0].spare_part_item_id === ITEM_SPARE &&
    Number(logRow.rows[0].spare_part_quantity) === 1,
    JSON.stringify(logRow.rows[0]));

  const stockInDoc = await db.query(
    'SELECT sii.quantity, sii.serial_number, sio.po_number, sio.project_id FROM public.stock_in_items sii JOIN public.stock_in_orders sio ON sio.id = sii.order_id WHERE sii.order_id = $1',
    [logRow.rows[0].restored_stock_in_order_id]
  );
  record('เอกสารรับเข้าผูกคลัง/PO/S-N ถูกต้อง',
    stockInDoc.rows.length === 1 && Number(stockInDoc.rows[0].quantity) === 1 &&
    stockInDoc.rows[0].po_number === 'PO-TEST-1' && stockInDoc.rows[0].project_id === PROJECT &&
    stockInDoc.rows[0].serial_number === 'HEX-0001',
    JSON.stringify(stockInDoc.rows[0]));

  // idempotency: เรียกซ้ำต้อง error (ใช้ savepoint เพื่อทดสอบในทรานแซกชันเดิม)
  await db.exec('SAVEPOINT s1');
  let secondError = '';
  try {
    await db.query('SELECT public.resolve_damaged_return_item($1::jsonb) AS r', [JSON.stringify(payload)]);
  } catch (err) {
    secondError = err.message;
  }
  await db.exec('ROLLBACK TO SAVEPOINT s1');
  record('เรียกซ้ำถูกปฏิเสธ (กันปั๊มสต็อก)', /ถูกบันทึกผลการซ่อมไปแล้ว/.test(secondError), secondError.slice(0, 140));

  const balanceAfterSecond = await db.query(
    'SELECT COALESCE(MAX(balance),0)::int AS b FROM public.stock_balance WHERE project_id=$1 AND item_id=$2',
    [PROJECT, ITEM_MAIN]
  );
  record('ยอดคงเหลือไม่เพิ่มจากการกดซ้ำ', Number(balanceAfterSecond.rows[0].b) === Number(after.rows[0].b), 'balance=' + balanceAfterSecond.rows[0].b);

  // กรณีแทงจำหน่าย: สต็อกต้องไม่เปลี่ยน และต้องมีทะเบียนของเสีย
  const scrapBefore = await db.query(
    'SELECT COALESCE(MAX(balance),0)::int AS b FROM public.stock_balance WHERE project_id=$1 AND item_id=$2',
    [PROJECT, ITEM_MAIN2]
  );
  const scrapCall = await db.query('SELECT public.resolve_damaged_return_item($1::jsonb) AS r', [JSON.stringify({
    return_log_id: RL2,
    resolution: 'scrapped',
    project_id: PROJECT,
    quantity: 1,
    repair_notes: 'ซ่อมไม่คุ้ม (sandbox)',
    disposal_method: 'electronic_waste',
  })]);
  const scrapAfter = await db.query(
    'SELECT COALESCE(MAX(balance),0)::int AS b FROM public.stock_balance WHERE project_id=$1 AND item_id=$2',
    [PROJECT, ITEM_MAIN2]
  );
  const scrapRow = await db.query('SELECT quantity, disposal_method, reason FROM public.scrap_disposal_items WHERE checkout_return_log_id=$1', [RL2]);
  record('กรณีแทงจำหน่าย: บันทึกของเสียและสต็อกไม่เปลี่ยน',
    scrapCall.rows[0].r.resolution === 'scrapped' && scrapRow.rows.length === 1 &&
    Number(scrapAfter.rows[0].b) === Number(scrapBefore.rows[0].b) &&
    scrapRow.rows[0].disposal_method === 'electronic_waste',
    'balance ' + scrapBefore.rows[0].b + ' -> ' + scrapAfter.rows[0].b + ' | scrap=' + JSON.stringify(scrapRow.rows));

  // กรณีแยกอะไหล่ + รับเข้าชิ้นส่วนที่ยังดี (parts_harvested)
  const harvestMainBefore = await db.query(
    'SELECT COALESCE(MAX(balance),0)::int AS b FROM public.stock_balance WHERE project_id=$1 AND item_id=$2',
    [PROJECT, ITEM_MAIN3]
  );
  const harvestCall = await db.query('SELECT public.resolve_damaged_return_item($1::jsonb) AS r', [JSON.stringify({
    return_log_id: RL3,
    resolution: 'parts_harvested',
    project_id: PROJECT,
    quantity: 1,
    repair_notes: 'ซ่อมไม่คุ้ม ถอดพัดลมเก็บเป็นอะไหล่',
    harvested_item_id: ITEM_FAN,
    harvested_quantity: 1,
  })]);
  const harvestMainAfter = await db.query(
    'SELECT COALESCE(MAX(balance),0)::int AS b FROM public.stock_balance WHERE project_id=$1 AND item_id=$2',
    [PROJECT, ITEM_MAIN3]
  );
  const harvestFan = await db.query(
    'SELECT COALESCE(MAX(balance),0)::int AS b FROM public.stock_balance WHERE project_id=$1 AND item_id=$2',
    [PROJECT, ITEM_FAN]
  );
  const harvestScrap = await db.query('SELECT disposal_method FROM public.scrap_disposal_items WHERE checkout_return_log_id=$1', [RL3]);
  const harvestLedger = await db.query(
    "SELECT transaction_type, reference_type, quantity FROM public.stock_transactions WHERE reference_id=$1",
    [RL3]
  );
  record('กรณีแยกอะไหล่: ตัวหลักไม่คืนสต็อก แต่อะไหล่ที่ยังดีถูกนับเข้า +1',
    harvestCall.rows[0].r.resolution === 'parts_harvested' &&
    Number(harvestMainAfter.rows[0].b) === Number(harvestMainBefore.rows[0].b) &&
    Number(harvestFan.rows[0].b) === 1 &&
    harvestScrap.rows.length === 1 && harvestScrap.rows[0].disposal_method === 'parts_harvest' &&
    harvestLedger.rows.some(function (r) { return r.transaction_type === 'stock_in' && r.reference_type === 'parts_harvest' && Number(r.quantity) === 1; }),
    'main ' + harvestMainBefore.rows[0].b + '->' + harvestMainAfter.rows[0].b + ' | fan=1? ' + harvestFan.rows[0].b +
      ' | scrap=' + JSON.stringify(harvestScrap.rows) + ' | ledger=' + JSON.stringify(harvestLedger.rows));

  // สถานะที่ไม่อยู่ในรายการที่อนุญาต ต้องถูกปฏิเสธ
  await db.exec('SAVEPOINT s2');
  let badResolution = '';
  try {
    await db.query('SELECT public.resolve_damaged_return_item($1::jsonb) AS r', [JSON.stringify({ return_log_id: RL3, resolution: 'melted', repair_notes: 'x' })]);
  } catch (err) {
    badResolution = err.message;
  }
  await db.exec('ROLLBACK TO SAVEPOINT s2');
  record('resolution ที่ไม่รองรับถูกปฏิเสธ', /Unsupported resolution/.test(badResolution), badResolution.slice(0, 120));

  // backfill: รายการที่ CAIM ปิดเคส/รับเข้าคลังไปแล้ว ต้องถูกตั้งสถานะกันกดซ้ำ
  const backfilled = await db.query(
    'SELECT repair_resolution_status, restored_stock_in_order_id, repair_notes, repair_resolved_at FROM public.checkout_return_logs WHERE id=$1',
    [RL4]
  );
  record('backfill: รายการที่ CAIM รับเข้าคลังแล้วถูกตั้งสถานะเป็น restored_to_stock',
    backfilled.rows[0].repair_resolution_status === 'restored_to_stock' &&
    backfilled.rows[0].restored_stock_in_order_id === CAIM_ORDER &&
    Boolean(backfilled.rows[0].repair_resolved_at) &&
    /CAIM/.test(backfilled.rows[0].repair_notes || ''),
    JSON.stringify(backfilled.rows[0]));

  // กันการนับสต็อกซ้ำ: มี caim_stock_in_order_id แต่ยัง unresolved ต้องถูกปฏิเสธ
  await db.exec('SAVEPOINT s3');
  let caimGuard = '';
  try {
    await db.query('SELECT public.resolve_damaged_return_item($1::jsonb) AS r', [JSON.stringify({
      return_log_id: RL6, resolution: 'restored_to_stock', project_id: PROJECT, quantity: 1, repair_notes: 'x',
    })]);
  } catch (err) {
    caimGuard = err.message;
  }
  await db.exec('ROLLBACK TO SAVEPOINT s3');
  record('รายการที่ CAIM รับเข้าคลังแล้วถูกปฏิเสธไม่ให้คืนสต็อกซ้ำ', /CAIM/.test(caimGuard), caimGuard.slice(0, 120));

  // สภาพที่ไม่ใช่ชำรุด/ส่งซ่อม ต้องถูกปฏิเสธ
  await db.exec('SAVEPOINT s4');
  let wrongCondition = '';
  try {
    await db.query('SELECT public.resolve_damaged_return_item($1::jsonb) AS r', [JSON.stringify({
      return_log_id: RL5, resolution: 'restored_to_stock', project_id: PROJECT, quantity: 1, repair_notes: 'x',
    })]);
  } catch (err) {
    wrongCondition = err.message;
  }
  await db.exec('ROLLBACK TO SAVEPOINT s4');
  record("สภาพ 'normal' ถูกปฏิเสธ (จัดการได้เฉพาะ damaged/needs_repair)", /เฉพาะรายการที่รับคืนสภาพชำรุด/.test(wrongCondition), wrongCondition.slice(0, 120));

  // ตาราง validation: ทุกเคสต้องถูกปฏิเสธ และไม่แตะข้อมูล
  const invalidCases = [
    ['ไม่ส่ง return_log_id', { resolution: 'restored_to_stock', repair_notes: 'x' }, /return_log_id is required/],
    ['return_log_id ที่ไม่มีอยู่', { return_log_id: '00000000-0000-0000-0000-0000000000ff', resolution: 'restored_to_stock', repair_notes: 'x' }, /ไม่พบรายการรับคืน/],
    ['quantity = 0', { return_log_id: RL7, resolution: 'restored_to_stock', project_id: PROJECT, quantity: 0, repair_notes: 'x' }, /จำนวนต้องมากกว่า 0/],
    ['quantity เกินยอดรับคืน', { return_log_id: RL7, resolution: 'restored_to_stock', project_id: PROJECT, quantity: 2, repair_notes: 'x' }, /เกินจำนวนที่รับคืนไว้/],
    ['quantity ไม่เป็นจำนวนเต็ม', { return_log_id: RL7, resolution: 'restored_to_stock', project_id: PROJECT, quantity: 1.5, repair_notes: 'x' }, /จำนวนต้องเป็นจำนวนเต็ม/],
    ['ไม่ได้กรอกรายละเอียดการซ่อม', { return_log_id: RL7, resolution: 'restored_to_stock', project_id: PROJECT, quantity: 1 }, /กรุณาระบุรายละเอียดการซ่อม/],
    ['คลังปลายทางไม่มีอยู่', { return_log_id: RL7, resolution: 'restored_to_stock', project_id: '00000000-0000-0000-0000-0000000000aa', quantity: 1, repair_notes: 'x' }, /ไม่พบโครงการ/],
    ['อะไหล่เป็นตัวเดียวกับอุปกรณ์หลัก', { return_log_id: RL7, resolution: 'restored_to_stock', project_id: PROJECT, quantity: 1, repair_notes: 'x', spare_part_item_id: ITEM_T7, spare_part_quantity: 1 }, /ต้องไม่ใช่ตัวอุปกรณ์หลัก/],
    ['อะไหล่ในคลังไม่พอ', { return_log_id: RL7, resolution: 'restored_to_stock', project_id: PROJECT, quantity: 1, repair_notes: 'x', spare_part_item_id: ITEM_SPARE, spare_part_quantity: 99 }, /สต็อกอะไหล่ไม่เพียงพอ/],
  ];
  let validationFailures = 0;
  for (let i = 0; i < invalidCases.length; i += 1) {
    await db.exec('SAVEPOINT v' + i);
    let message = '';
    try {
      await db.query('SELECT public.resolve_damaged_return_item($1::jsonb) AS r', [JSON.stringify(invalidCases[i][1])]);
    } catch (err) {
      message = err.message;
    }
    await db.exec('ROLLBACK TO SAVEPOINT v' + i);
    if (!invalidCases[i][2].test(message)) {
      validationFailures += 1;
      console.log('   ↳ ' + invalidCases[i][0] + ' → ' + message.slice(0, 120));
    }
  }
  record('validation ปฏิเสธ payload ที่ไม่ถูกต้องครบ ' + invalidCases.length + ' เคส', validationFailures === 0, 'failures=' + validationFailures);

  // payload รูปแบบเดียวกับที่ frontend ส่งจริง (มีคีย์เป็น null) ต้องทำงานได้
  const modalPayload = {
    return_log_id: RL7,
    resolution: 'restored_to_stock',
    project_id: PROJECT,
    quantity: 1,
    repair_notes: 'payload รูปแบบเดียวกับโมดอล',
    reference_number: null,
    serial_number: null,
    disposal_method: null,
    spare_part_item_id: null,
    spare_part_quantity: null,
    harvested_item_id: null,
    harvested_quantity: null,
  };
  const modalCall = await db.query('SELECT public.resolve_damaged_return_item($1::jsonb) AS r', [JSON.stringify(modalPayload)]);
  const modalLog = await db.query('SELECT repair_resolution_status, spare_part_item_id, repair_scrap_disposal_id FROM public.checkout_return_logs WHERE id=$1', [RL7]);
  const modalStockIn = await db.query(
    'SELECT sii.serial_number FROM public.stock_in_items sii WHERE sii.order_id = $1',
    [modalLog.rows[0] ? (await db.query('SELECT restored_stock_in_order_id FROM public.checkout_return_logs WHERE id=$1', [RL7])).rows[0].restored_stock_in_order_id : null]
  );
  record('payload รูปแบบเดียวกับ frontend (คีย์ null) ทำงานถูกต้อง',
    modalCall.rows[0].r.success === true &&
    modalLog.rows[0].repair_resolution_status === 'restored_to_stock' &&
    modalLog.rows[0].spare_part_item_id === null &&
    modalLog.rows[0].repair_scrap_disposal_id === null &&
    modalStockIn.rows.length === 1 && modalStockIn.rows[0].serial_number === 'HEX-T7',
    JSON.stringify(modalLog.rows[0]));

  // ผู้ใช้ที่ active แต่ไม่มีสิทธิ์ ต้องถูกปฏิเสธ
  await db.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: STAFF, role: 'authenticated' })]);
  const staffPerm = await db.query(
    "SELECT public.has_permission($1, 'checkouts.return') AS ret, public.has_permission($1, 'stock_in.create') AS sin",
    [STAFF]
  );
  // ใช้ savepoint เพราะคำสั่งที่ถูกปฏิเสธจะ abort ทรานแซกชันปัจจุบัน
  await db.exec('SAVEPOINT s5');
  let staffError = '';
  try {
    await db.query('SELECT public.resolve_damaged_return_item($1::jsonb) AS r', [JSON.stringify({
      return_log_id: RL7, resolution: 'scrapped', project_id: PROJECT, quantity: 1, repair_notes: 'x',
    })]);
  } catch (err) {
    staffError = err.message;
  }
  await db.exec('ROLLBACK TO SAVEPOINT s5');
  record('ผู้ใช้ที่ active แต่ไม่มีสิทธิ์ถูกปฏิเสธ (ก่อนแตะข้อมูล)',
    staffPerm.rows[0].ret === false && staffPerm.rows[0].sin === false && /Unauthorized: Requires/.test(staffError),
    'has_permission=' + JSON.stringify(staffPerm.rows[0]) + ' | error=' + staffError.slice(0, 90));
  await db.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ACTOR, role: 'authenticated' })]);

  // กรณีไม่มีสิทธิ์: auth.uid() = NULL ต้องถูกปฏิเสธก่อนแตะข้อมูล
  await db.exec('ROLLBACK');
  await db.query("SELECT set_config('request.jwt.claims', '', true)");
  let unauthError = '';
  try {
    await db.query('SELECT public.resolve_damaged_return_item($1::jsonb) AS r', [JSON.stringify({ return_log_id: RL1 })]);
  } catch (err) {
    unauthError = err.message;
  }
  record('ผู้เรียกที่ไม่มี auth.uid() ถูกปฏิเสธ', /Unauthorized/.test(unauthError), unauthError.slice(0, 120));

  const failed = results.filter(function (r) { return !r.pass; });
  console.log('==================================================================');
  console.log('Total: ' + results.length + ' checks, failed: ' + failed.length);
  if (failed.length) {
    console.error('[FAIL] migration 82 ยังมีปัญหาบน Postgres sandbox');
    process.exit(1);
  }
  console.log('[PASS] migration 82 ทำงานถูกต้องครบทุกกรณีบน Postgres sandbox (PGlite)');
}

main().catch(function (err) {
  console.error('[ERROR] ' + (err && err.message ? err.message : err));
  process.exit(1);
});
