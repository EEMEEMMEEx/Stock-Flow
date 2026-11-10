import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// =============================================================================
// Apply Migration 103 — Returned Device Serial Number (Optional) & Auto-Backfill
// =============================================================================
// Usage:
//   node scripts/apply-migration-103.mjs --dry-run     # Run DDL inside transaction ending in ROLLBACK
//   node scripts/apply-migration-103.mjs --yes         # Apply live to database
// =============================================================================

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isConfirmed = args.has('--yes');

const projectRef = process.env.VITE_SUPABASE_URL
  ? new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  : 'vrnutseacyejnzwcfamv';

const migrationFile = path.resolve('supabase/migrations/103_add_return_serial_number_support.sql');
const dryRunFile = path.resolve('supabase/.temp/103_dry_run.sql');

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
    throw new Error('Could not find COMMIT; in migration');
  }
  fs.mkdirSync(path.dirname(dryRunFile), { recursive: true });
  fs.writeFileSync(dryRunFile, lines.join('\n'), 'utf8');
  return dryRunFile;
}

const fileToRun = isDryRun ? buildDryRunScript() : migrationFile;
console.log('🚀 Migration 103 (Returned Device S/N Support & Auto-Backfill) — project ' + projectRef);
console.log('📁 File: ' + fileToRun + (isDryRun ? '  [DRY RUN: Ends in ROLLBACK]' : ''));

if (!isDryRun && !isConfirmed) {
  console.error('⛔ Cancelled: Pass --yes to apply to live database or --dry-run for non-destructive check');
  console.log('\n💡 You can copy the contents of:');
  console.log(`   ${migrationFile}`);
  console.log('   and run it in Supabase Dashboard > SQL Editor directly.');
  process.exit(2);
}

const dbUrl = resolveDbUrl();
const queryCommand = dbUrl
  ? 'npx supabase db query --db-url "' + dbUrl + '" --file "' + fileToRun + '"'
  : 'npx supabase db query --linked --project-ref ' + projectRef + ' --file "' + fileToRun + '"';

try {
  const result = execSync(queryCommand, { encoding: 'utf8', stdio: 'pipe' });
  console.log(isDryRun
    ? '✅ Dry run passed (rolled back, no live data modified)'
    : '✅ Migration 103 applied successfully:');
  console.log(result);
} catch (err) {
  console.error('⚠️ Migration execution failed:');
  console.error((err.stdout || err.message || '').toString().slice(0, 1500));
  console.log('\n💡 If CLI permissions restrict execution, copy SQL in:');
  console.log(`   ${migrationFile}`);
  console.log('   into Supabase Dashboard > SQL Editor');
  process.exitCode = 1;
}
