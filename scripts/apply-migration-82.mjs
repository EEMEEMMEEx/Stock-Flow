import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// =============================================================================
// Apply Migration 82 — Partial Damage & Component Repair Resolution
// (docs/partial-damage-component-repair-plan.md §6.1)
// =============================================================================
// วิธีใช้:
//   node scripts/apply-migration-82.mjs --dry-run     # รัน DDL ใน transaction แล้ว ROLLBACK (ไม่เปลี่ยน DB)
//   node scripts/apply-migration-82.mjs --yes         # apply จริงกับ production
//   node scripts/apply-migration-82.mjs --self-test   # รัน smoke test ของ RPC (supabase/tests/*.smoke.sql) แล้ว ROLLBACK
//
// ช่องทางเชื่อมต่อ (เลือกอัตโนมัติตามลำดับ):
//   1) SUPABASE_DB_URL             — connection string เต็ม (แนะนำ)
//   2) SUPABASE_DB_PASSWORD + supabase/.temp/pooler-url — ประกอบ URL ให้เอง
//   3) --linked                    — Management API (บัญชีปัจจุบันได้ HTTP 403)
//   4) ไม่มีช่องทางใดใช้ได้       — วาง SQL ใน Supabase Dashboard > SQL Editor
// =============================================================================

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isConfirmed = args.has('--yes');
const isSelfTest = args.has('--self-test');

const projectRef = process.env.VITE_SUPABASE_URL
  ? new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  : 'vrnutseacyejnzwcfamv';

const migrationFile = path.resolve('supabase/migrations/82_damaged_return_repair_resolution.sql');
const selfTestFile = path.resolve('supabase/tests/82_damaged_repair_resolution.smoke.sql');
const dryRunFile = path.resolve('supabase/.temp/82_dry_run.sql');

function resolveDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;

  const password = process.env.SUPABASE_DB_PASSWORD;
  const poolerPath = path.resolve('supabase/.temp/pooler-url');
  if (password && fs.existsSync(poolerPath)) {
    const pooler = fs.readFileSync(poolerPath, 'utf8').trim();
    if (pooler) {
      const connection = new URL(pooler);
      connection.password = password;
      return connection.toString();
    }
  }
  return null;
}

function buildDryRunScript() {
  // แทนที่ "COMMIT;" คำสั่งจริง (บรรทัดเดี่ยว) เท่านั้น — ไม่แตะ "-- COMMIT;" ในคอมเมนต์ rollback
  const lines = fs.readFileSync(migrationFile, 'utf8').split(/\r?\n/);
  let replaced = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === 'COMMIT;') {
      lines[i] = lines[i].replace('COMMIT;', 'ROLLBACK;');
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    throw new Error('ไม่พบคำสั่ง COMMIT; เดี่ยว ๆ ใน migration — ตรวจสอบไฟล์ก่อน');
  }
  fs.mkdirSync(path.dirname(dryRunFile), { recursive: true });
  fs.writeFileSync(dryRunFile, lines.join('\n'), 'utf8');
  return dryRunFile;
}

const fileToRun = isSelfTest ? selfTestFile : (isDryRun ? buildDryRunScript() : migrationFile);
console.log('🚀 Migration 82 (Damaged Return Repair Resolution) — project ' + projectRef);
console.log('📁 File: ' + fileToRun + (isSelfTest ? '  [SELF TEST: จบด้วย ROLLBACK]' : isDryRun ? '  [DRY RUN: จบด้วย ROLLBACK]' : ''));

if (!isSelfTest && !isDryRun && !isConfirmed) {
  console.error('⛔ ยกเลิก: ต้องรันด้วย --yes เพื่อยืนยัน apply กับ production (หรือใช้ --dry-run เพื่อทดสอบแบบไม่แก้ข้อมูล)');
  process.exit(2);
}

const dbUrl = resolveDbUrl();
if (!dbUrl) {
  console.warn('ℹ️ ไม่พบ SUPABASE_DB_URL หรือ SUPABASE_DB_PASSWORD — จะลอง --linked (บัญชีนี้ได้ HTTP 403)');
  console.warn('ℹ️ ทางเลือก: ตั้ง SUPABASE_DB_URL ใน .env หรือ paste SQL ใน Supabase Dashboard > SQL Editor');
}

const queryCommand = dbUrl
  ? 'npx supabase db query --db-url "' + dbUrl + '" --file "' + fileToRun + '"'
  : 'npx supabase db query --linked --project-ref ' + projectRef + ' --file "' + fileToRun + '"';

let applied = false;
try {
  const result = execSync(queryCommand, { encoding: 'utf8', stdio: 'pipe' });
  applied = true;
  console.log(isSelfTest
    ? '✅ Smoke test ผ่าน (rollback แล้ว ไม่มีข้อมูลถูกแก้)'
    : isDryRun
      ? '✅ Dry run ผ่าน (rollback แล้ว ไม่มีข้อมูลถูกแก้)'
      : '✅ Migration 82 applied สำเร็จ:');
  console.log(result);
} catch (err) {
  console.error('⚠️ Migration execution failed:');
  console.error((err.stdout || err.message || '').toString().slice(0, 1500));
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Post-apply verification ผ่าน PostgREST/service role
// (ข้ามอัตโนมัติเมื่อ dry-run เพราะ schema ถูก rollback กลับไปแล้ว)
// ---------------------------------------------------------------------------
if (isDryRun || isSelfTest || !applied) {
  process.exit(process.exitCode || 0);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('⚠️ ไม่พบ VITE_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY — ข้ามการ verify');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1) คอลัมน์ใหม่ต้องอ่านได้
const columnsProbe = await supabase
  .from('checkout_return_logs')
  .select('id, repair_resolution_status, repair_notes, repair_resolved_at, restored_stock_in_order_id, spare_part_item_id, spare_part_quantity')
  .limit(1);

if (columnsProbe.error) {
  console.error('❌ Verification failed: อ่านคอลัมน์ผลการซ่อมไม่ได้ → ' + columnsProbe.error.message);
  process.exitCode = 1;
} else {
  console.log('✅ Verification: checkout_return_logs.repair_* ใช้งานได้');
}

// 2) RPC ต้องมีอยู่ (probe ด้วย UUID สุ่ม จะได้ Unauthorized จาก auth.uid() = NULL)
const rpcProbe = await supabase.rpc('resolve_damaged_return_item', {
  p_payload: { return_log_id: '00000000-0000-0000-0000-000000000000' },
});
const message = rpcProbe.error?.message || '';
if (message.includes('Unauthorized')) {
  console.log('✅ Verification: public.resolve_damaged_return_item มีอยู่จริง (ปฏิเสธผู้เรียกที่ไม่มีสิทธิ์)');
} else if (rpcProbe.error) {
  console.error('❌ Verification failed: ' + message);
  process.exitCode = 1;
} else {
  console.log('⚠️ Verification: RPC ตอบ success โดยไม่คาดคิด — ตรวจสอบสิทธิ์ของ anon/service role อีกครั้ง');
}

process.exit(process.exitCode || 0);
