import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// =============================================================================
// Apply Migration 80 — Phase 1 Multi-Warehouse / Multi-Project Requisition
// =============================================================================
// วิธีใช้:
//   node scripts/apply-migration-80.mjs --dry-run   # รันใน transaction แล้ว ROLLBACK (ไม่เปลี่ยน DB)
//   node scripts/apply-migration-80.mjs --yes       # apply จริงกับ production
//
// ช่องทางเชื่อมต่อ (เลือกอัตโนมัติตามลำดับ):
//   1) SUPABASE_DB_URL             — connection string เต็ม (แนะนำ)
//   2) SUPABASE_DB_PASSWORD + supabase/.temp/pooler-url — ประกอบ URL ให้เอง
//   3) --linked                    — Management API (บัญชีปัจจุบันได้ HTTP 403)
// =============================================================================

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isConfirmed = args.has('--yes');

const projectRef = process.env.VITE_SUPABASE_URL
  ? new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  : 'vrnutseacyejnzwcfamv';

const migrationFile = path.resolve('supabase/migrations/80_multi_warehouse_withdrawal_support.sql');
const dryRunFile = path.resolve('supabase/.temp/80_dry_run.sql');

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
  // แทนที่ "COMMIT;" ที่เป็นคำสั่งจริง (บรรทัดเดี่ยว) เท่านั้น
  // ต้องไม่แตะ "-- COMMIT;" ที่อยู่ในคอมเมนต์ rollback block
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

const fileToRun = isDryRun ? buildDryRunScript() : migrationFile;
console.log(`🚀 Migration 80 (Multi-Warehouse Withdrawal) — project ${projectRef}`);
console.log(`📁 File: ${fileToRun}${isDryRun ? '  [DRY RUN: จบด้วย ROLLBACK]' : ''}`);

if (!isDryRun && !isConfirmed) {
  console.error('⛔ ยกเลิก: ต้องรันด้วย --yes เพื่อยืนยัน apply กับ production (หรือใช้ --dry-run เพื่อทดสอบแบบไม่แก้ข้อมูล)');
  process.exit(2);
}

const dbUrl = resolveDbUrl();
if (!dbUrl) {
  console.warn('ℹ️ ไม่พบ SUPABASE_DB_URL หรือ SUPABASE_DB_PASSWORD — จะลอง --linked (บัญชีนี้ได้ HTTP 403)');
  console.warn('ℹ️ ทางเลือก: ตั้ง SUPABASE_DB_URL ใน .env หรือ paste SQL ใน Supabase Dashboard > SQL Editor');
}

const queryCommand = dbUrl
  ? `npx supabase db query --db-url "${dbUrl}" --file "${fileToRun}"`
  : `npx supabase db query --linked --project-ref ${projectRef} --file "${fileToRun}"`;

let applied = false;
try {
  const result = execSync(queryCommand, { encoding: 'utf8', stdio: 'pipe' });
  applied = true;
  console.log(isDryRun ? '✅ Dry run ผ่าน (rollback แล้ว ไม่มีข้อมูลถูกแก้)' : '✅ Migration 80 applied สำเร็จ:');
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
if (isDryRun || !applied) {
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
  .from('withdrawal_items')
  .select('id, project_id, storage_location_id')
  .limit(1);

if (columnsProbe.error) {
  console.error('❌ Verification failed: อ่าน project_id/storage_location_id ไม่ได้ →', columnsProbe.error.message);
  process.exitCode = 1;
} else {
  console.log('✅ Verification: withdrawal_items.project_id + storage_location_id ใช้งานได้');
}

// 2) RPC ต้องมีอยู่ (probe ด้วย UUID สุ่ม จะได้ Unauthorized จาก auth.uid() = NULL)
const rpcProbe = await supabase.rpc('approve_inventory_request', {
  p_request_id: '00000000-0000-0000-0000-000000000000',
});
const message = rpcProbe.error?.message || '';
if (message.includes('Unauthorized')) {
  console.log('✅ Verification: public.approve_inventory_request มีอยู่จริง (ปฏิเสธผู้เรียกที่ไม่มีสิทธิ์)');
} else if (rpcProbe.error) {
  console.error('❌ Verification failed:', message);
  process.exitCode = 1;
}
