import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  console.log('🚀 Applying Migration 69 RBAC permissions and linking...');

  // 1. Ensure items.manage exists in public.permissions
  let { data: existingPerm, error: findErr } = await supabase
    .from('permissions')
    .select('id, code')
    .eq('code', 'items.manage')
    .maybeSingle();

  if (findErr) {
    console.error('❌ Error checking permissions table:', findErr);
    process.exit(1);
  }

  if (!existingPerm) {
    const { data: newPerm, error: insertErr } = await supabase
      .from('permissions')
      .insert({
        code: 'items.manage',
        name: 'จัดการรายการวัสดุ Master ทั้งหมด',
        description: 'จัดการ เพิ่ม ลบ แก้ไข ข้อมูลวัสดุใน Master Catalog',
        resource: 'items',
        action: 'manage',
        category: 'Items Master'
      })
      .select('id, code')
      .single();

    if (insertErr) {
      console.error('❌ Error inserting items.manage permission:', insertErr);
      process.exit(1);
    }
    existingPerm = newPerm;
    console.log('✅ Created items.manage permission:', existingPerm.id);
  } else {
    console.log('ℹ️ items.manage permission already exists:', existingPerm.id);
  }

  // 2. Link items.manage to ADMIN and SUPER roles
  const { data: roles, error: rolesErr } = await supabase
    .from('roles')
    .select('id, code')
    .in('code', ['ADMIN', 'SUPER']);

  if (rolesErr || !roles) {
    console.error('❌ Error fetching roles:', rolesErr);
    process.exit(1);
  }

  for (const role of roles) {
    const { data: linkRes, error: linkErr } = await supabase
      .from('role_permissions')
      .upsert({
        role_id: role.id,
        permission_id: existingPerm.id
      }, { onConflict: 'role_id,permission_id' })
      .select();

    if (linkErr) {
      console.error(`❌ Error linking to role ${role.code}:`, linkErr);
    } else {
      console.log(`✅ Successfully linked items.manage to role: ${role.code}`);
    }
  }

  console.log('🎉 RBAC migration steps completed successfully!');
  console.log('\n📌 SQL for Supabase SQL Editor (to update RLS policy definition):');
  console.log(`
DROP POLICY IF EXISTS "Authorized users mutate items" ON public.items;
DROP POLICY IF EXISTS "Allow auth mutate items" ON public.items;

CREATE POLICY "Authorized users mutate items" ON public.items
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid()) OR
    public.has_permission(auth.uid(), 'items.update') OR
    public.has_permission(auth.uid(), 'items.create') OR
    public.has_permission(auth.uid(), 'items.delete') OR
    public.has_permission(auth.uid(), 'items.manage')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid()) OR
    public.has_permission(auth.uid(), 'items.update') OR
    public.has_permission(auth.uid(), 'items.create') OR
    public.has_permission(auth.uid(), 'items.delete') OR
    public.has_permission(auth.uid(), 'items.manage')
  );
  `);
}

run().catch(console.error);
