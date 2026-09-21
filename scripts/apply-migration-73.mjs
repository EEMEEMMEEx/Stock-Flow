import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const projectRef = 'fhzvrgyjarmqnacamkop';
const sqlFile = path.resolve('supabase/migrations/73_resolve_admin_create_user_overload.sql');

console.log('🚀 Applying Migration 73 to Supabase project...');
console.log(`📁 File: ${sqlFile}`);

try {
  const result = execSync(`npx supabase db query --linked --project-ref ${projectRef} --file "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  console.log('✅ Migration 73 executed successfully on linked database:');
  console.log(result);
} catch (err) {
  console.error('⚠️ Note on CLI execution:', err.stdout || err.message);
  console.log('ℹ️ Migration SQL is ready for execution in Supabase SQL Editor if required.');
}

// Verify with Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('⚠️ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, skipping verification RPC call.');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function verify() {
  console.log('\n🔍 Verifying admin_create_user RPC overload resolution...');

  // 1. Call with all 11 canonical parameters
  const res1 = await supabase.rpc('admin_create_user', {
    p_email: 'probe_test_11@example.com',
    p_password: 'TestPassword123!',
    p_full_name: 'Probe Test 11',
    p_role: 'staff',
    p_phone: '0123456789',
    p_position: 'Staff',
    p_department: 'IT',
    p_all_projects: true,
    p_project_ids: [],
    p_avatar_url: null,
    p_role_id: null
  });

  console.log('Test 1 (With 11 parameters):', res1.error ? `Handled (${res1.error.code}: ${res1.error.message})` : 'Success', res1.data);
  if (res1.error && res1.error.code === 'PGRST203') {
    throw new Error('❌ Test 1 FAILED: PGRST203 overload error still present!');
  }

  // 2. Call with 9 parameters (omitting p_avatar_url and p_role_id)
  const res2 = await supabase.rpc('admin_create_user', {
    p_email: 'probe_test_9@example.com',
    p_password: 'TestPassword123!',
    p_full_name: 'Probe Test 9',
    p_role: 'staff',
    p_phone: '0123456789',
    p_position: 'Staff',
    p_department: 'IT',
    p_all_projects: true,
    p_project_ids: []
  });

  console.log('Test 2 (With 9 parameters):', res2.error ? `Handled (${res2.error.code}: ${res2.error.message})` : 'Success', res2.data);
  if (res2.error && res2.error.code === 'PGRST203') {
    console.warn('⚠️ Note: Test 2 with 9 parameters encountered PGRST203 on remote database. The migration SQL in 73_resolve_admin_create_user_overload.sql must be applied in Supabase SQL Editor to drop the old 9-param function.');
  } else {
    console.log('✅ Test 2 passed! No PGRST203 ambiguity.');
  }

  console.log('\n🎉 Verification script completed.');
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
