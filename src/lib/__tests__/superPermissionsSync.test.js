import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Read AuthProvider.jsx source code to verify static baseline definitions
const AUTH_PROVIDER_PATH = path.resolve('src/contexts/AuthProvider.jsx');
const authProviderSource = readFileSync(AUTH_PROVIDER_PATH, 'utf8');

// Read Migration 88 SQL to verify catalog alignment
const MIGRATION_88_PATH = path.resolve('supabase/migrations/88_super_permissions_complete_audit.sql');
const migration88Source = readFileSync(MIGRATION_88_PATH, 'utf8');

// The approved 17 new permissions
const APPROVED_17_NEW_PERMISSIONS = [
  'users.delete',
  'users.manage',
  'checkouts.reject',
  'checkouts.cancel',
  'checkouts.update',
  'checkouts.delete',
  'checkouts.resolve_repair',
  'withdrawals.cancel',
  'withdrawals.update',
  'withdrawals.delete',
  'stock_in.update',
  'stock_in.cancel',
  'stock_in.delete',
  'inventory.view',
  'system.audit_log.view',
  'system.backup',
  'system.import_export'
];

// High-risk/destructive permissions that must NEVER be granted to non-SUPER roles by default
const SUPER_ONLY_SENSITIVE_PERMISSIONS = [
  'users.delete',
  'checkouts.cancel',
  'checkouts.delete',
  'withdrawals.cancel',
  'withdrawals.delete',
  'stock_in.cancel',
  'stock_in.delete',
  'system.revert_actions',
  'system.backup'
];

test('SUPER baseline in AuthProvider.jsx contains all 59 canonical permissions', () => {
  // Extract SUPER_BASELINE_PERMISSIONS array from AuthProvider.jsx
  const match = authProviderSource.match(/const SUPER_BASELINE_PERMISSIONS = \[([\s\S]*?)\];/);
  assert.ok(match, 'SUPER_BASELINE_PERMISSIONS array must exist in AuthProvider.jsx');

  const perms = match[1]
    .split(',')
    .map(p => p.trim().replace(/['"]/g, ''))
    .filter(Boolean);

  assert.equal(perms.length, 59, `SUPER baseline must have exactly 59 permissions (got ${perms.length})`);

  // Check uniqueness
  const uniquePerms = new Set(perms);
  assert.equal(uniquePerms.size, 59, 'All 59 permissions in SUPER baseline must be unique');

  // Verify items.transfer is present (restored)
  assert.ok(uniquePerms.has('items.transfer'), 'items.transfer must be present in SUPER baseline');

  // Verify all 17 new permissions are present
  for (const perm of APPROVED_17_NEW_PERMISSIONS) {
    assert.ok(uniquePerms.has(perm), `New permission ${perm} must be in SUPER baseline`);
  }
});

test('ADMIN baseline in AuthProvider.jsx does NOT gain sensitive SUPER-only permissions by default', () => {
  // Extract normalizedRole === 'admin' return block
  const adminBlockMatch = authProviderSource.match(/if \(normalizedRole === 'admin'\) \{\s*return \[([\s\S]*?)\];/);
  assert.ok(adminBlockMatch, 'Admin baseline block must exist in AuthProvider.jsx');

  const adminPerms = adminBlockMatch[1]
    .split(',')
    .map(p => p.trim().replace(/['"]/g, ''))
    .filter(Boolean);

  const adminPermSet = new Set(adminPerms);

  for (const sensitivePerm of SUPER_ONLY_SENSITIVE_PERMISSIONS) {
    assert.ok(
      !adminPermSet.has(sensitivePerm),
      `Admin baseline must NOT contain sensitive permission: ${sensitivePerm}`
    );
  }
});

test('Migration 88 inserts all 17 new permissions and enforces SUPER safeguards', () => {
  for (const perm of APPROVED_17_NEW_PERMISSIONS) {
    assert.ok(
      migration88Source.includes(`'${perm}'`),
      `Migration 88 must include permission ${perm}`
    );
  }

  // Verify triggers and function definitions exist
  assert.ok(migration88Source.includes('trg_auto_grant_permission_to_super'), 'Auto-grant trigger must exist');
  assert.ok(migration88Source.includes('trg_prevent_super_permission_removal'), 'Removal prevention trigger must exist');
  assert.ok(migration88Source.includes('CREATE OR REPLACE FUNCTION public.admin_save_role_permissions'), 'admin_save_role_permissions must be updated');
  assert.ok(migration88Source.includes('v_perm_count < 59'), 'Assertion must verify at least 59 permissions');
});

test('roleUtils.js exports SUPER_GOVERNED_PERMISSIONS and modal enforces delegation guards', async () => {
  const { SUPER_GOVERNED_PERMISSIONS, SUPER_STRICT_ONLY_PERMISSIONS } = await import('../roleUtils.js');

  assert.equal(SUPER_GOVERNED_PERMISSIONS.length, 17, 'Must contain exactly 17 governed permissions');
  assert.equal(SUPER_STRICT_ONLY_PERMISSIONS.length, 1, 'Must contain exactly 1 strict-only permission');
  assert.ok(SUPER_STRICT_ONLY_PERMISSIONS.includes('system.revert_actions'), 'Must include system.revert_actions');

  for (const perm of APPROVED_17_NEW_PERMISSIONS) {
    assert.ok(SUPER_GOVERNED_PERMISSIONS.includes(perm), `SUPER_GOVERNED_PERMISSIONS must include ${perm}`);
  }

  const modalPath = path.resolve('src/components/roles/PermissionManagementModal.jsx');
  const modalSource = readFileSync(modalPath, 'utf8');

  assert.ok(modalSource.includes('SUPER_GOVERNED_PERMISSIONS'), 'Modal must import SUPER_GOVERNED_PERMISSIONS');
  assert.ok(modalSource.includes('effectiveIsCallerSuper'), 'Modal must compute effectiveIsCallerSuper');
  assert.ok(modalSource.includes('สงวนสิทธิ์ให้ SUPER เป็นผู้กำหนดเท่านั้น'), 'Modal must label locked governed permissions');
});

test('Migration 88 enforces SUPER-only delegation guard on admin_save_role_permissions', () => {
  assert.ok(migration88Source.includes('v_governed_ids UUID[]'), 'Must declare v_governed_ids');
  assert.ok(migration88Source.includes('v_existing_governed_ids UUID[]'), 'Must declare v_existing_governed_ids');
  assert.ok(migration88Source.includes('IF NOT public.is_super_admin(v_caller_id) THEN'), 'Must check caller is_super_admin');
  assert.ok(migration88Source.includes('Keep non-governed permissions submitted by caller + preserve existing governed permissions'), 'Must preserve existing governed permissions');
});
