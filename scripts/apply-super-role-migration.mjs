import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  console.log('🚀 Configuring SUPER System Role and Permissions...');

  // 1. Upsert SUPER role
  const { data: superRole, error: roleErr } = await supabase
    .from('roles')
    .upsert(
      {
        code: 'SUPER',
        name: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
        description: 'สิทธิ์สูงสุด จัดการทุกอย่าง รวมถึง Admin, สิทธิ์, การตั้งค่าระบบ, Security, Integration',
        badge_background: 'bg-gradient-to-r from-amber-500/15 via-purple-500/15 to-rose-500/15',
        badge_text_color: 'text-purple-900 dark:text-purple-200',
        is_system: true,
        is_active: true,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'code' }
    )
    .select()
    .single();

  if (roleErr) {
    console.error('❌ Error upserting SUPER role:', roleErr);
    process.exit(1);
  }

  console.log('✅ SUPER Role upserted successfully:', superRole.id);

  // 2. Mark system roles is_system = true
  const { error: sysRolesErr } = await supabase
    .from('roles')
    .update({ is_system: true })
    .in('code', ['STAFF', 'SUPERVISOR', 'ADMIN', 'SUPER']);

  if (sysRolesErr) {
    console.warn('⚠️ Notice updating system roles:', sysRolesErr);
  } else {
    console.log('✅ Marked STAFF, SUPERVISOR, ADMIN, SUPER as System Roles (is_system = true)');
  }

  // 3. Fetch all catalog permissions
  const { data: permissions, error: permErr } = await supabase
    .from('permissions')
    .select('id, code');

  if (permErr || !permissions || permissions.length === 0) {
    console.error('❌ Error fetching catalog permissions:', permErr);
    process.exit(1);
  }

  console.log(`📋 Found ${permissions.length} catalog permissions.`);

  // 4. Map all permissions to SUPER role
  const rolePermissionsPayload = permissions.map(p => ({
    role_id: superRole.id,
    permission_id: p.id
  }));

  const { error: rpErr } = await supabase
    .from('role_permissions')
    .upsert(rolePermissionsPayload, { onConflict: 'role_id,permission_id' });

  if (rpErr) {
    console.error('❌ Error linking permissions to SUPER role:', rpErr);
  } else {
    console.log(`✅ Assigned ALL ${permissions.length} permissions to SUPER role.`);
  }

  // 5. Link profiles where role is super / SUPER
  const { data: updatedProfiles, error: profileErr } = await supabase
    .from('profiles')
    .update({ role_id: superRole.id, role: 'super' })
    .or('role.eq.super,role.eq.SUPER')
    .select('id, role');

  if (profileErr) {
    console.warn('⚠️ Notice updating profiles:', profileErr);
  } else {
    console.log(`✅ Updated ${updatedProfiles?.length || 0} user profile(s) to SUPER role.`);
  }

  console.log('🎉 Migration script completed successfully!');
}

run();
