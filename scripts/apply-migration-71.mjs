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
  console.log('🚀 Applying Migration 71: Updating role display names to Enterprise Standard...');

  const updates = [
    { code: 'STAFF', name: 'Staff / Requester', oldNames: ['STAFF / REQUESTER', 'STAFF'] },
    { code: 'SUPERVISOR', name: 'Supervisor / Approver', oldNames: ['SUPERVISOR / APPROVER', 'SUPERVISOR'] },
    { code: 'ADMIN', name: 'Administrator', oldNames: ['ADMINISTRATOR', 'ADMIN'] },
    { code: 'SUPER', name: 'System Administrator', oldNames: ['SUPER ADMIN', 'Super Admin', 'SUPER'] }
  ];

  for (const u of updates) {
    const { data, error } = await supabase
      .from('roles')
      .update({
        name: u.name,
        updated_at: new Date().toISOString()
      })
      .eq('code', u.code);

    if (error) {
      console.warn(`⚠️ Warning updating role ${u.code}:`, error.message);
    } else {
      console.log(`✅ Updated role ${u.code} display name to "${u.name}"`);
    }
  }

  // Fetch and display current roles
  const { data: currentRoles } = await supabase
    .from('roles')
    .select('id, code, name, is_system, is_active')
    .order('is_system', { ascending: false });

  console.log('📋 Current Roles in Database:');
  console.table(currentRoles);
  console.log('✨ Migration 71 complete!');
}

run().catch(err => {
  console.error('Fatal error during Migration 71:', err);
  process.exit(1);
});
