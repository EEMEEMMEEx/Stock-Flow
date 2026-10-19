import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();
dotenv.config({ path: '.env.local' });

// =============================================================================
// Apply Migration 92 — Fix Admin Force Delete Item RPC & Cascading Deletions
// (docs/force-delete-item-flow-fix-plan.md)
// =============================================================================
// วิธีใช้:
//   node scripts/apply-migration-92.mjs --dry-run     # รัน DDL ใน transaction แล้ว ROLLBACK (ไม่แก้ DB)
//   node scripts/apply-migration-92.mjs --yes         # apply จริงกับ production
// =============================================================================

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isConfirmed = args.has('--yes');

const projectRef = process.env.VITE_SUPABASE_URL
  ? new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  : 'vrnutseacyejnzwcfamv';

const migrationFile = path.resolve('supabase/migrations/92_fix_admin_force_delete_item_rpc.sql');
const dryRunFile = path.resolve('supabase/.temp/92_dry_run.sql');

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
    throw new Error('ไม่พบคำสั่ง COMMIT; ใน migration');
  }
  fs.mkdirSync(path.dirname(dryRunFile), { recursive: true });
  fs.writeFileSync(dryRunFile, lines.join('\n'), 'utf8');
  return dryRunFile;
}

const fileToRun = isDryRun ? buildDryRunScript() : migrationFile;
console.log('🚀 Migration 92 (Fix Admin Force Delete Item RPC) — project ' + projectRef);
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
    : '✅ Migration 92 applied สำเร็จ:');
  console.log(result);
} catch (err) {
  console.error('⚠️ Migration execution failed:');
  console.error((err.stdout || err.message || '').toString().slice(0, 1500));
  console.log('\n💡 หากพบข้อจำกัดสิทธิ์ CLI (HTTP 403) กรุณาคัดลอก SQL ใน:');
  console.log(`   ${migrationFile}`);
  console.log('   ไป Run ที่ Supabase Dashboard > SQL Editor');
  process.exitCode = 1;
}

if (isDryRun || !applied) {
  process.exit(process.exitCode || 0);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.warn('⚠️ ไม่พบ Service Role Key — ข้ามการ probe ตรวจสอบ');
  process.exit(0);
}

const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log('🔍 ตรวจสอบการเข้าถึง RPC admin_force_delete_item...');
const { data, error } = await adminClient.rpc('admin_force_delete_item', {
  p_item_id: '00000000-0000-0000-0000-000000000000',
});

if (error) {
  console.log('  Probe response error:', error.message);
  if (error.message.includes('Unauthorized') || error.message.includes('Item not found')) {
    console.log('✅ RPC admin_force_delete_item มีอยู่ในฐานข้อมูลและทำงานได้ตามสิทธิ์');
  } else {
    console.warn('⚠️ RPC ตอบกลับด้วยข้อความ:', error.message);
  }
} else {
  console.log('✅ RPC admin_force_delete_item ตอบกลับสำเร็จ:', data);
}
