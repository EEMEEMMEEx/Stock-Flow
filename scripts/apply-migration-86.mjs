import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// =============================================================================
// Apply Migration 86 — Remediate Supabase Security Linter Warnings
// (docs/supabase-security-linter-remediation-plan.md)
// =============================================================================
// วิธีใช้:
//   node scripts/apply-migration-86.mjs --dry-run     # รัน DDL ใน transaction แล้ว ROLLBACK (ไม่แก้ DB)
//   node scripts/apply-migration-86.mjs --yes         # apply จริงกับ production
//
// ช่องทางเชื่อมต่อ (เลือกอัตโนมัติตามลำดับ):
//   1) SUPABASE_DB_URL             — connection string เต็ม (postgresql://postgres:[PWD]@db.[REF].supabase.co:5432/postgres)
//   2) SUPABASE_DB_PASSWORD + supabase/.temp/pooler-url — ประกอบ URL ให้เอง
//   3) --linked                    — Management API
//   4) ไม่มีช่องทางใดใช้ได้       — วาง SQL ใน Supabase Dashboard > SQL Editor
// =============================================================================

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isConfirmed = args.has('--yes');

const projectRef = process.env.VITE_SUPABASE_URL
  ? new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  : 'vrnutseacyejnzwcfamv';

const migrationFile = path.resolve('supabase/migrations/86_remediate_supabase_security_linter_warnings.sql');
const dryRunFile = path.resolve('supabase/.temp/86_dry_run.sql');

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
console.log('🚀 Migration 86 (Remediate Security Linter Warnings) — project ' + projectRef);
console.log('📁 File: ' + fileToRun + (isDryRun ? '  [DRY RUN: จบด้วย ROLLBACK]' : ''));

if (!isDryRun && !isConfirmed) {
  console.error('⛔ ยกเลิก: ต้องรันด้วย --yes เพื่อยืนยัน apply กับ production (หรือใช้ --dry-run เพื่อทดสอบแบบไม่แก้ข้อมูล)');
  console.log('\n💡 หากไม่ต้องการรันผ่าน CLI สามารถคัดลอกเนื้อหาไฟล์:');
  console.log(`   ${migrationFile}`);
  console.log('   ไปวางและกด Run ที่ Supabase Dashboard > SQL Editor ได้ทันที');
  process.exit(2);
}

const dbUrl = resolveDbUrl();
if (!dbUrl) {
  console.warn('ℹ️ ไม่พบ SUPABASE_DB_URL หรือ SUPABASE_DB_PASSWORD — จะลอง --linked');
  console.warn('ℹ️ ทางเลือก: ตั้ง SUPABASE_DB_URL ใน .env หรือ paste SQL ใน Supabase Dashboard > SQL Editor');
}

const queryCommand = dbUrl
  ? 'npx supabase db query --db-url "' + dbUrl + '" --file "' + fileToRun + '"'
  : 'npx supabase db query --linked --project-ref ' + projectRef + ' --file "' + fileToRun + '"';

let applied = false;
try {
  const result = execSync(queryCommand, { encoding: 'utf8', stdio: 'pipe' });
  applied = true;
  console.log(isDryRun
    ? '✅ Dry run ผ่าน (rollback แล้ว ไม่มีข้อมูลถูกแก้)'
    : '✅ Migration 86 applied สำเร็จ:');
  console.log(result);
} catch (err) {
  console.error('⚠️ Migration execution failed:');
  console.error((err.stdout || err.message || '').toString().slice(0, 1500));
  console.log('\n💡 หากพบข้อจำกัดสิทธิ์ CLI (HTTP 403) กรุณาคัดลอก SQL ใน:');
  console.log(`   ${migrationFile}`);
  console.log('   ไป Run ที่ Supabase Dashboard > SQL Editor');
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Post-apply verification ผ่าน PostgREST / anon & service role
// (ข้ามอัตโนมัติเมื่อ dry-run เพราะ schema ถูก rollback กลับไปแล้ว)
// ---------------------------------------------------------------------------
if (isDryRun || !applied) {
  process.exit(process.exitCode || 0);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.warn('⚠️ ไม่พบ VITE_SUPABASE_URL — ข้ามการ verify');
  process.exit(0);
}

// Probe 1: Anon client calling admin_get_users RPC must fail (Revoked from anon)
if (anonKey) {
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anonClient.rpc('admin_get_users');
  if (error) {
    console.log('✅ Verification (Step 1): anon เรียก admin_get_users ถูกปฏิเสธตามคาด -> ' + error.message);
  } else {
    console.error('❌ Verification failed: anon ยังสามารถเรียก admin_get_users ได้!');
    process.exitCode = 1;
  }
}

// Probe 2: Service role probe
if (serviceRoleKey) {
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await adminClient.rpc('has_permission', {
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_perm_code: 'test.probe'
  });
  if (error && !error.message.includes('Unauthorized')) {
    console.error('❌ Verification failed: service_role เรียก has_permission เกิดข้อผิดพลาด -> ' + error.message);
    process.exitCode = 1;
  } else {
    console.log('✅ Verification (Step 2): has_permission ใช้งานได้ปกติ');
  }
}

process.exit(process.exitCode || 0);
