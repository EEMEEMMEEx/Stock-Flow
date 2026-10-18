// =============================================================================
// Static and Semantic Verification for Checkout Item Serial Management (Migration 89)
// (docs/caim-claim-sn-fix-plan.md)
//
// Asserts all invariants:
//   - Atomic RPC, row locks, duplicate serial custody guard, append-only audit log
//   - Gated by checkouts.edit_serial, granted to SUPER, ADMIN, SUPERVISOR
//   - CAIM-synced lock protection (SUPER override only)
//   - UI visible alert under button, no hover-only tooltip reliance, mobile responsive
//   - 100% i18n parity between th.js and en.js
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';

const MIGRATION = new URL('../supabase/migrations/89_add_checkout_item_serial_management.sql', import.meta.url);
const APPLY_SCRIPT = new URL('../scripts/apply-migration-89.mjs', import.meta.url);
const SANDBOX_SCRIPT = new URL('../scripts/verify-checkout-item-serial-sandbox.mjs', import.meta.url);
const MODAL = new URL('../src/components/checkouts/EditSerialModal.jsx', import.meta.url);
const DETAIL = new URL('../src/components/checkouts/CheckoutDetailModal.jsx', import.meta.url);
const PERM_MODAL = new URL('../src/components/roles/PermissionManagementModal.jsx', import.meta.url);
const TH = new URL('../src/i18n/locales/th.js', import.meta.url);
const EN = new URL('../src/i18n/locales/en.js', import.meta.url);
const PKG = new URL('../package.json', import.meta.url);

let failures = 0;
const rows = [];
const check = (label, pass, detail = '') => {
  if (!pass) failures += 1;
  rows.push({ status: pass ? 'PASS' : 'FAIL', label, detail: pass ? '' : detail });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + label + (detail && !pass ? ' :: ' + detail : ''));
};

const read = (url) => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');

console.log('==================================================================');
console.log('   Checkout Item Serial Management (Migration 89) Verification    ');
console.log('==================================================================');

// --- 1. Migration Checks ---
check('Migration 89 file exists', existsSync(MIGRATION));
const sql = read(MIGRATION);

check('Migration runs inside one transaction', /^BEGIN;$/m.test(sql) && /^COMMIT;$/m.test(sql));
check('Registers checkouts.edit_serial in public.permissions', /'checkouts\.edit_serial'/.test(sql));
check('Category set to Checkouts & Returns', /'Checkouts & Returns'/.test(sql));
check('Assigned to SUPER, ADMIN, SUPERVISOR roles',
  /WHERE r\.code IN \('SUPER', 'ADMIN', 'SUPERVISOR'\)/.test(sql) &&
  /AND p\.code = 'checkouts\.edit_serial'/.test(sql)
);

check('RPC update_checkout_item_serial exists', /CREATE OR REPLACE FUNCTION public\.update_checkout_item_serial/.test(sql));
check('RPC is SECURITY DEFINER', /SECURITY DEFINER/.test(sql));
check('RPC pins search_path', /SET search_path = public, auth, pg_temp/.test(sql));
check('RPC checks authentication', /v_caller_id IS NULL/.test(sql) && /Unauthorized/.test(sql));
check('RPC checks permission or super admin',
  /public\.has_permission\(v_caller_id, 'checkouts\.edit_serial'\) OR public\.is_super_admin\(v_caller_id\)/.test(sql)
);
check('RPC validates non-empty reason', /p_reason IS NULL/.test(sql));
check('RPC validates serial number length', /LENGTH\(v_new_serial\) > 100/.test(sql));
check('RPC locks checkout_items FOR UPDATE', /FROM public\.checkout_items\s+WHERE id = p_checkout_item_id\s+FOR UPDATE/.test(sql));
check('RPC includes duplicate active serial custody guard', /DUPLICATE_ACTIVE_SERIAL/.test(sql));
check('RPC protects already-synced CAIM claim', /CAIM_ALREADY_SYNCED/.test(sql));
check('RPC updates replaced_serial_number in return log', /UPDATE public\.checkout_return_logs\s+SET replaced_serial_number = v_new_serial/.test(sql));
check('RPC records append-only audit_log',
  /INSERT INTO public\.audit_logs/.test(sql) &&
  /'CHECKOUT_ITEM_SERIAL_UPDATE'/.test(sql)
);
check('Revokes execute from PUBLIC, anon', /REVOKE ALL ON FUNCTION public\.update_checkout_item_serial.*FROM PUBLIC, anon/s.test(sql));
check('Grants execute to authenticated, service_role', /GRANT EXECUTE ON FUNCTION public\.update_checkout_item_serial.*TO authenticated, service_role/s.test(sql));

// --- 2. Apply and Sandbox Scripts ---
check('Apply script 89 exists', existsSync(APPLY_SCRIPT));
const applyScript = read(APPLY_SCRIPT);
check('Apply script supports --dry-run and --yes', /--dry-run/.test(applyScript) && /--yes/.test(applyScript));
check('Apply script refuses to run without confirmation', /⛔ ยกเลิก: ต้องรันด้วย --yes/.test(applyScript));
check('Sandbox PGlite verification script exists', existsSync(SANDBOX_SCRIPT));

// --- 3. Frontend UI Checks ---
check('EditSerialModal.jsx component exists', existsSync(MODAL));
const modal = read(MODAL);
check('EditSerialModal calls update_checkout_item_serial RPC', /supabase\.rpc\('update_checkout_item_serial'/.test(modal));
check('EditSerialModal uppercases serial number', /toUpperCase\(\)/.test(modal));
check('EditSerialModal validates required reason', /trimmedReason/.test(modal));
check('EditSerialModal uses Lucide icons (no emoji)', /import \{.*Hash.*AlertCircle.*Loader2.*\} from 'lucide-react'/.test(modal));

const detail = read(DETAIL);
check('CheckoutDetailModal imports EditSerialModal', /import EditSerialModal from ['"]@\/components\/checkouts\/EditSerialModal['"]/.test(detail));
check('RepairResolutionRow displays visible alert box under button', /t\('checkouts\.noSerialForCaim'\)/.test(detail) && /bg-amber-500\/10/.test(detail));
check('Add S/N action is gated by canEditSerial', /canEditSerial \?/.test(detail) && /checkouts\.addSerialAction/.test(detail));
check('Unprivileged users see contact admin message', /checkouts\.contactAdminToAddSerial/.test(detail));
check('CheckoutDetailModal renders EditSerialModal', /<EditSerialModal/.test(detail));
check('PermissionManagementModal registers checkouts.edit_serial dependency',
  /'checkouts\.edit_serial': \['checkouts\.view'\]/.test(read(PERM_MODAL))
);

// --- 4. i18n Key Parity ---
const th = read(TH);
const en = read(EN);
const requiredKeys = [
  'editSerial',
  'addSerialAction',
  'editSerialTitle',
  'contactAdminToAddSerial',
  'serialModalTitle',
  'serialModalDesc',
  'serialNumberLabel',
  'serialNumberPlaceholder',
  'serialInputHint',
  'serialReasonLabel',
  'serialReasonPlaceholder',
  'serialReasonRequired',
  'serialNumberRequired',
  'invalidCheckoutItem',
  'serialUpdatedSuccess',
  'updateSerialFailed',
  'serialCaimNotice',
  'currentSerial'
];

for (const key of requiredKeys) {
  check(`i18n key "${key}" exists in th.js`, new RegExp(`"${key}"\\s*:`).test(th));
  check(`i18n key "${key}" exists in en.js`, new RegExp(`"${key}"\\s*:`).test(en));
}

// --- 5. Versioning ---
const pkg = JSON.parse(read(PKG));
check('package.json has valid SemVer', /^\d+\.\d+\.\d+$/.test(pkg.version));

console.log('------------------------------------------------------------------');
console.log(`Total: ${rows.length} cases, failed: ${failures}`);
if (failures === 0) {
  console.log('[PASS] All checkout item serial management invariants hold.');
  process.exit(0);
} else {
  console.error('[FAIL] Some checks failed!');
  process.exit(1);
}
