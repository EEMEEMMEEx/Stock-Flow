import fs from 'fs';
import path from 'path';

// Let's create backups/04_all_system_rpcs_and_functions.sql with clean, validated SQL
const filesToExtract = [
  // 1. Core Dynamic RBAC
  'supabase/migrations/archive/09_dynamic_rbac_roles_permissions.sql',
  'supabase/migrations/54_complete_rbac_audit_and_fix.sql',
  'supabase/migrations/58_dynamic_rbac_sync_fix.sql',
  'supabase/migrations/59_configure_super_system_role.sql',
  'supabase/migrations/60_restrict_super_admin_management.sql',

  // 2. System Settings & Vault Secrets
  'supabase/migrations/archive/11_system_settings.sql',
  'supabase/migrations/archive/12_secure_default_password.sql',
  'supabase/migrations/archive/32_harden_smtp_password_rpc_search_path.sql',

  // 3. User Operations & Password Management
  'supabase/migrations/archive/08_rbac_and_user_management.sql',
  'supabase/migrations/archive/16_auto_default_password_and_force_change.sql',
  'supabase/migrations/archive/19_universal_user_deletion_repair.sql',

  // 4. Operational & Transaction RPCs
  'supabase/migrations/archive/35_add_parent_child_hierarchy_to_stock_in.sql',
  'supabase/migrations/archive/04_atomic_inventory_approval_rpc.sql',
  'supabase/migrations/archive/07_shortage_approval_support.sql',
  'supabase/migrations/56_current_stock_adjustment_feature.sql',
  'supabase/migrations/archive/48_force_delete_specific_items_and_rpc.sql',
  'supabase/migrations/archive/49_item_warehouse_transfer_rpc.sql',
  'supabase/migrations/archive/43_transfer_and_delete_project_rpc.sql',
  'supabase/migrations/archive/44_material_checkout_and_return_system.sql',
  'supabase/migrations/55_checkout_due_date_extension.sql',
  'supabase/migrations/53_editable_bom_selection_rbac.sql',
  'supabase/migrations/archive/51_site_installation_kits_rpc.sql'
];

let masterSql = `-- ==============================================================================
-- COMPLETE MASTER SYSTEM RPCS AND DATABASE FUNCTIONS
-- Apply to Supabase project (vrnutseacyejnzwcfamv) to enable all RPC features
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

`;

for (const file of filesToExtract) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    masterSql += `\n-- >>> FILE: ${file} <<<\n` + content + '\n';
  } else {
    console.warn(`File not found: ${file}`);
  }
}

masterSql += `\nCOMMIT;\n\nNOTIFY pgrst, 'reload schema';\n`;

fs.writeFileSync('backups/04_all_system_rpcs_and_functions.sql', masterSql, 'utf8');
console.log('Successfully created backups/04_all_system_rpcs_and_functions.sql');
