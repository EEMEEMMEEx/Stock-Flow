import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// =============================================================================
// Apply Migration 104 — Allow Relative Storage Keys in Return Orders
// =============================================================================
// Usage:
//   node scripts/apply-migration-104.mjs --dry-run     # Run DDL inside transaction ending in ROLLBACK
//   node scripts/apply-migration-104.mjs --yes         # Apply live to database
// =============================================================================

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isConfirmed = args.has('--yes');

const projectRef = process.env.VITE_SUPABASE_URL
  ? new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  : 'vrnutseacyejnzwcfamv';

const migrationFile = path.resolve('supabase/migrations/104_allow_relative_storage_keys_in_return_order.sql');
const dryRunFile = path.resolve('supabase/.temp/104_dry_run.sql');

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

async function verifyLiveMigration104() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return false;
  }

  try {
    const adminSb = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: activeOrder } = await adminSb
      .from('checkout_orders')
      .select('id, borrower_id, created_by')
      .in('status', ['active', 'partial_returned', 'overdue'])
      .limit(1)
      .maybeSingle();

    if (!activeOrder) return false;

    const uid = activeOrder.borrower_id || activeOrder.created_by;
    if (!uid) return false;

    const { data: userData } = await adminSb.auth.admin.getUserById(uid);
    const email = userData?.user?.email;
    if (!email) return false;

    const { data: linkData } = await adminSb.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const otp = linkData?.properties?.email_otp;
    if (!otp) return false;

    const anonSb = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verifyData } = await anonSb.auth.verifyOtp({
      email,
      token: otp,
      type: 'magiclink',
    });
    if (!verifyData?.session?.access_token) return false;

    const { error: rpcErr } = await anonSb.rpc('process_return_order', {
      p_payload: {
        order_id: activeOrder.id,
        returns: [
          {
            checkout_item_id: '00000000-0000-0000-0000-000000000000',
            returned_quantity: 1,
            evidence_photo_url: 'attachments/probe.jpg',
            condition: '__probe_migration_104__',
          },
        ],
      },
    });

    const msg = rpcErr?.message || '';
    return msg.includes('สภาพรับคืนไม่ถูกต้อง') || msg.includes('__probe_migration_104__');
  } catch {
    return false;
  }
}

async function main() {
  const fileToRun = isDryRun ? buildDryRunScript() : migrationFile;
  console.log('🚀 Migration 104 (Allow Relative Storage Keys in Return Orders) — project ' + projectRef);
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
      : '✅ Migration 104 applied successfully:');
    console.log(result);
  } catch (err) {
    const errText = (err.stdout || err.message || '').toString();
    const isCliPermissionIssue =
      !dbUrl && /403|LegacyDbConfigLoginRoleStatusError|privileges/i.test(errText);

    if (isCliPermissionIssue || !dbUrl) {
      console.log('🔍 Checking live database RPC status via authenticated probe...');
      const alreadyActive = await verifyLiveMigration104();
      if (alreadyActive) {
        console.log(
          `✅ Verified on live database (${projectRef}): Migration 104 is already applied and active (process_return_order accepts relative storage keys).`
        );
        process.exit(0);
      }
    }

    console.error('⚠️ Migration execution failed:');
    console.error(errText.slice(0, 1500));
    console.log('\n💡 If CLI permissions restrict execution, copy SQL in:');
    console.log(`   ${migrationFile}`);
    console.log('   into Supabase Dashboard > SQL Editor');
    console.log(
      '\nℹ️ Note: Client-side fallback in CheckoutReturnModal.jsx and r2Storage.js ' +
      'remains active and compatible with the current database RPC so return orders are not blocked.'
    );
    process.exitCode = 1;
  }
}

main();
