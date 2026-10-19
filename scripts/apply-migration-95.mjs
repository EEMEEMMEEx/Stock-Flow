import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// =============================================================================
// Apply Migration 95 — Fix process_checkout_order Locking on View (SQLSTATE 0A000)
// =============================================================================
// วิธีใช้:
//   node scripts/apply-migration-95.mjs --dry-run     # รัน DDL ใน transaction แล้ว ROLLBACK (ไม่แก้ DB)
//   node scripts/apply-migration-95.mjs --yes         # apply จริงกับ production
// =============================================================================

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isConfirmed = args.has('--yes');

const projectRef = process.env.VITE_SUPABASE_URL
  ? new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  : 'vrnutseacyejnzwcfamv';

const migrationFile = path.resolve('supabase/migrations/95_fix_process_checkout_order_locking_on_view.sql');
const dryRunFile = path.resolve('supabase/.temp/95_dry_run.sql');

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

async function main() {
  console.log('==============================================================================');
  console.log('🚀 Apply Migration 95: Fix process_checkout_order Locking on View');
  console.log('==============================================================================');
  console.log(`📁 File: ${migrationFile}`);
  console.log(`🎯 Target Project: ${projectRef}`);
  console.log(`⚙️  Mode: ${isDryRun ? 'DRY-RUN (will ROLLBACK)' : isConfirmed ? 'LIVE APPLY' : 'DRY-RUN (default)'}`);
  console.log('------------------------------------------------------------------------------');

  if (!isDryRun && !isConfirmed) {
    console.log('⚠️  ไม่ได้ระบุ --yes หรือ --dry-run -> ทำการ DRY-RUN โดยอัตโนมัติ');
  }

  const scriptToExecute = (isDryRun || !isConfirmed) ? buildDryRunScript() : migrationFile;
  const dbUrl = resolveDbUrl();

  if (dbUrl) {
    console.log('🔌 Connecting via direct connection / pooler...');
    try {
      execSync(`psql "${dbUrl}" -f "${scriptToExecute}"`, { stdio: 'inherit' });
      console.log('------------------------------------------------------------------------------');
      if (isDryRun || !isConfirmed) {
        console.log('✅ DRY-RUN สำเร็จ: DDL ถูกทดสอบใน Transaction และ ROLLBACK เรียบร้อย');
      } else {
        console.log('🎉 LIVE APPLY สำเร็จเรียบร้อย: Migration 95 ถูกนำไปใช้กับฐานข้อมูลแล้ว');
      }
    } catch (err) {
      console.error('❌ SQL Execution Failed:', err.message);
      process.exit(1);
    }
  } else {
    console.log('📡 No direct DB connection, running via supabase cli db query...');
    try {
      const cmd = `npx supabase db query --linked --project-ref ${projectRef} --file "${scriptToExecute}"`;
      console.log(`$ ${cmd}`);
      const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
      console.log('------------------------------------------------------------------------------');
      if (isDryRun || !isConfirmed) {
        console.log('✅ DRY-RUN สำเร็จ');
      } else {
        console.log('🎉 LIVE APPLY สำเร็จ');
        console.log(result);
      }
    } catch (err) {
      console.error('⚠️ Supabase CLI Execution Failed:');
      console.error((err.stdout || err.message || '').toString().slice(0, 1500));
      console.log('\n💡 หากพบข้อจำกัดสิทธิ์ CLI (HTTP 403) กรุณาคัดลอก SQL ใน:');
      console.log(`   ${migrationFile}`);
      console.log('   ไป Run ที่ Supabase Dashboard > SQL Editor');
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
