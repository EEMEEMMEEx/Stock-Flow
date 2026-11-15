import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// =============================================================================
// Apply Migration 106 — Self-Service Cancel Pending Checkout Requisition RPC
// =============================================================================
// Usage:
//   node scripts/apply-migration-106.mjs --dry-run     # Run DDL inside transaction ending in ROLLBACK
//   node scripts/apply-migration-106.mjs --yes         # Apply live to database
// =============================================================================

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isConfirmed = args.has('--yes');

const projectRef = process.env.VITE_SUPABASE_URL
  ? new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  : 'vrnutseacyejnzwcfamv';

const migrationFile = path.resolve('supabase/migrations/106_cancel_pending_checkout_rpc.sql');
const dryRunFile = path.resolve('supabase/.temp/106_dry_run.sql');

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

async function verifyLiveMigration106() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return false;
  }

  try {
    const adminSb = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [{ error: colErr }, { error: rpcErr }] = await Promise.all([
      adminSb
        .from('checkout_orders')
        .select('id, cancelled_by, cancelled_at, cancellation_reason, updated_at')
        .limit(1),
      adminSb.rpc('cancel_pending_checkout_order', {
        p_order_id: '00000000-0000-0000-0000-000000000000',
        p_reason: null,
      }),
    ]);

    const rpcMsg = rpcErr?.message || '';
    const rpcProbeOk =
      Boolean(rpcErr) &&
      rpcMsg.includes('Unauthorized: User is not authenticated.') &&
      !rpcErr?.code?.startsWith('PGRST');

    return !colErr && rpcProbeOk;
  } catch {
    return false;
  }
}

async function main() {
  const fileToRun = isDryRun ? buildDryRunScript() : migrationFile;
  console.log('🚀 Migration 106 (Cancel Pending Checkout Requisition RPC) — project ' + projectRef);
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
    console.log(
      isDryRun
        ? '✅ Dry run passed (rolled back, no live data modified)'
        : '✅ Migration 106 applied successfully:'
    );
    console.log(result);

    if (!isDryRun) {
      const verified = await verifyLiveMigration106();
      if (verified) {
        console.log(
          `✅ Verified on live database (${projectRef}): cancel_pending_checkout_order RPC & checkout_orders cancellation columns are active.`
        );
      }
    }
  } catch (err) {
    const errText = (err.stdout || err.message || '').toString();
    const isCliPermissionIssue =
      !dbUrl && /403|LegacyDbConfigLoginRoleStatusError|privileges/i.test(errText);

    if (!isDryRun && (isCliPermissionIssue || !dbUrl)) {
      console.log('🔍 Checking live database RPC status via service-role probe...');
      const alreadyActive = await verifyLiveMigration106();
      if (alreadyActive) {
        console.log(
          `✅ Verified on live database (${projectRef}): Migration 106 is already applied and active (cancel_pending_checkout_order & checkout_orders columns present).`
        );
        process.exit(0);
      }
    }

    console.error('⚠️ Migration execution failed:');
    console.error(errText.slice(0, 1500));
    console.log('\n💡 If CLI permissions restrict execution, copy SQL in:');
    console.log(`   ${migrationFile}`);
    console.log('   into Supabase Dashboard > SQL Editor');
    process.exitCode = 1;
  }
}

main();
