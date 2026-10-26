import fs from 'fs';
import path from 'path';
import en from '../src/i18n/locales/en.js';
import th from '../src/i18n/locales/th.js';

const root = path.resolve('.');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail });
  const mark = pass ? '[OK]' : '[FAIL]';
  console.log(`${mark} ${name}${detail ? ' (' + detail + ')' : ''}`);
};

const auth = read('src/contexts/AuthProvider.jsx');
const modal = read('src/components/common/SuperRevertActionModal.jsx');
const auditModal = read('src/components/common/RevertAuditLogModal.jsx');
const lib = read('src/lib/superRevert.js');
const migration = read('supabase/migrations/83_super_revert_actions_and_audit.sql');
const migration85 = read('supabase/migrations/85_super_revert_checkout_actions.sql');
const checkoutHistory = read('src/components/checkouts/CheckoutHistoryList.jsx');
const withdrawalList = read('src/components/withdrawals/WithdrawalOrdersList.jsx');
const withdrawalDetail = read('src/components/withdrawals/WithdrawalDetailModal.jsx');
const withdrawalsPage = read('src/pages/Withdrawals.jsx');
const checkoutActive = read('src/components/checkouts/CheckoutActiveList.jsx');
const checkoutDetail = read('src/components/checkouts/CheckoutDetailModal.jsx');
const checkoutsPage = read('src/pages/Checkouts.jsx');
const rolesPage = read('src/pages/RoleManagement.jsx');
const permissionModal = read('src/components/roles/PermissionManagementModal.jsx');

// 1. Auth gate
check('AuthProvider exposes a fail-closed canRevertAction', /canRevertAction = isSuperAdmin && permissions\.includes\('system\.revert_actions'\)/.test(auth));
check('AuthContext value exports canRevertAction', /canRevertAction,/.test(auth));

// 2. RPC surface
check('migration defines super_revert_withdrawal_action', /FUNCTION public\.super_revert_withdrawal_action/.test(migration));
check('migration defines super_revert_checkout_approval', /FUNCTION public\.super_revert_checkout_approval/.test(migration));
check('migration defines super_revert_checkout_return', /FUNCTION public\.super_revert_checkout_return/.test(migration));
check('migration guards with assert_super_revert_authorized', /assert_super_revert_authorized\(p_reason\)/.test(migration));
check('migration enforces append-only audit trigger', /BEFORE UPDATE OR DELETE ON public\.audit_logs/.test(migration));
check('migration registers system.revert_actions', /'system\.revert_actions'/.test(migration));
check('migration locks the permission to SUPER in admin_save_role_permissions', /v_role_code = 'SUPER'[\s\S]{0,400}v_revert_perm_id/.test(migration));

// 3. Modal behaviour
check('modal requires a non-empty reason', /disabled=\{processing \|\| !reason\.trim\(\)\}/.test(modal));
check('modal shows status transition', /superRevert\.transition/.test(modal));
check('modal shows stock impact', /superRevert\.stockImpact/.test(modal));
check('modal maps RPC errors', /parseRevertErrorKey/.test(modal));
check('modal disables while processing', /disabled=\{processing\}/.test(modal));
check('shared helper resolves all five revert kinds', ['withdrawal_completion','withdrawal_approval','withdrawal_rejection','checkout_approval','checkout_return'].every(k => lib.includes("'" + k + "'")));
check('shared helper calls the authoritative RPC names', ['super_revert_withdrawal_action','super_revert_checkout_approval','super_revert_checkout_return'].every(r => lib.includes(r)));

// 3b. Migration 85 completion surface
check('migration 85 defines super_revert_checkout_order_returns', /FUNCTION public\.super_revert_checkout_order_returns/.test(migration85));
check('migration 85 defines super_revert_checkout_rejection', /FUNCTION public\.super_revert_checkout_rejection/.test(migration85));
check('migration 85 defines super_revert_damaged_repair', /FUNCTION public\.super_revert_damaged_repair/.test(migration85));
check('migration 85 keeps the S/N re-loan guard', /EQUIPMENT_ALREADY_RELOANED/.test(migration85));
check('migration 85 flags reverted scrap disposal rows', /scrap_disposal_items[\s\S]{0,200}is_reverted/.test(migration85));
check('shared helper resolves the completion RPCs', ['super_revert_checkout_order_returns','super_revert_checkout_rejection','super_revert_damaged_repair'].every(r => lib.includes(r)));
check('shared helper exposes the new revert kinds', ['CHECKOUT_RETURNS','CHECKOUT_REJECTION','CHECKOUT_REPAIR'].every(k => lib.includes(k)));

// 4. Withdrawals
check('withdrawal list gates revert buttons by canRevertAction', /canRevertAction &&/.test(withdrawalList));
check('withdrawal list offers completion/approval/rejection reverts', /WITHDRAWAL_COMPLETION/.test(withdrawalList) && /WITHDRAWAL_APPROVAL/.test(withdrawalList) && /WITHDRAWAL_REJECTION/.test(withdrawalList));
check('withdrawal list shows the reverted badge', /superRevert\.revertedBadge/.test(withdrawalList));
check('withdrawal detail offers a revert action', /onOpenRevertModal/.test(withdrawalDetail) && /superRevert\.lastReverted/.test(withdrawalDetail));
check('withdrawals page mounts SuperRevertActionModal', /<SuperRevertActionModal/.test(withdrawalsPage));

// 5. Checkouts
check('checkout active list gates the approval revert by canRevertAction', /canRevertAction && order\.totalReturned === 0/.test(checkoutActive));
check('checkout active row keeps order number/status badges on one line', /whitespace-nowrap shrink-0/.test(checkoutActive) && /xl:min-w-\[320px\]/.test(checkoutActive));
check('checkout active actions wrap instead of squeezing the content column', /flex flex-wrap items-center justify-end gap-2 min-w-0 w-full xl:w-auto/.test(checkoutActive));
check('checkout detail gates the return revert by canRevertAction', /canRevertAction && !log\.is_reverted/.test(checkoutDetail));
check('checkout detail shows reverted return logs', /superRevert\.returnLogReverted/.test(checkoutDetail));
check('checkouts page mounts SuperRevertActionModal', /<SuperRevertActionModal/.test(checkoutsPage));

check('checkout history gates the revert button by canRevertAction', /canRevertAction && onOpenRevertModal && revertKindFor\(order\)/.test(checkoutHistory));
check('checkout history offers status sub-filters', /HISTORY_FILTERS/.test(checkoutHistory) && /historyFilterApproved/.test(checkoutHistory));
check('checkout history includes on-loan rows (non-pending filter)', /o\.status !== 'pending'/.test(checkoutHistory));
check('checkout history maps status to a revert kind', /REVERT_KINDS\.CHECKOUT_RETURNS/.test(checkoutHistory) && /REVERT_KINDS\.CHECKOUT_REJECTION/.test(checkoutHistory));
check('checkouts page passes the revert gate to the history list', /<CheckoutHistoryList[\s\S]{0,300}canRevertAction=\{canRevertAction\}[\s\S]{0,200}onOpenRevertModal=\{handleOpenRevertModal\}/.test(checkoutsPage));
check('checkout detail offers the repair revert per return log', /REVERT_KINDS\.CHECKOUT_REPAIR/.test(checkoutDetail));
check('checkout detail offers the rejection revert', /REVERT_KINDS\.CHECKOUT_REJECTION/.test(checkoutDetail));
check('checkout detail offers the order-level returns revert', /REVERT_KINDS\.CHECKOUT_RETURNS/.test(checkoutDetail));

// 6. Roles
check('role page opens the revert audit viewer for SUPER', /(?:roleObj\.code === 'SUPER' && isSuperAdmin|isSuperAdmin[\s\S]*?setIsRevertAuditOpen)/.test(rolesPage) && /RevertAuditLogModal/.test(rolesPage));
check('permission modal locks system.revert_actions', /system\.revert_actions/.test(permissionModal) && /permissionLocked/.test(permissionModal));
check('permission modal strips it for non-SUPER roles', /sanitizedIds/.test(permissionModal));

// 7. Error mapping
check('legacy stock error is mapped in the UI', /errLegacyStock/.test(lib));

// 8. i18n parity for the new namespace
const flatten = (obj, prefix = '') => Object.entries(obj).reduce((acc, [key, value]) => {
  const full = prefix ? prefix + '.' + key : key;
  if (value && typeof value === 'object' && !Array.isArray(value)) return acc.concat(flatten(value, full));
  return acc.concat([[full, value]]);
}, []);
const enKeys = new Set(flatten(en.superRevert || {}).map(([key]) => key));
const thKeys = new Set(flatten(th.superRevert || {}).map(([key]) => key));
const missingTh = [...enKeys].filter(key => !thKeys.has(key));
const missingEn = [...thKeys].filter(key => !enKeys.has(key));
check('superRevert keys exist in both languages', enKeys.size > 40 && missingTh.length === 0 && missingEn.length === 0,
  'en=' + enKeys.size + ' th=' + thKeys.size + ' missingTh=' + missingTh.join(',') + ' missingEn=' + missingEn.join(','));
check('every superRevert key has a non-empty Thai value', flatten(th.superRevert || {}).every(([, value]) => String(value || '').trim().length > 0));

const failed = results.filter(r => !r.pass);
console.log('\n' + '='.repeat(60));
console.log('SUPER REVERT UI GUARDS: ' + (results.length - failed.length) + '/' + results.length + ' PASS');
if (failed.length) {
  console.log('Failed checks:');
  failed.forEach(f => console.log(' - ' + f.name + (f.detail ? ' :: ' + f.detail : '')));
}
process.exit(failed.length === 0 ? 0 : 1);
